import { createClient } from '@supabase/supabase-js';

const VALID_TRANSITIONS = {
  NEW: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'COMPLETED'],
  BLOCKED: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

function dbClient() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error('Supabase server environment variables are missing.');
  return createClient(url, secret, { auth: { persistSession: false } });
}

function sameOrigin(req) {
  return sameOrigin(req);
}

function authorized(req) {
  const configuredSecret = process.env.OPS_ACTION_SECRET;
  const auth = req.headers.authorization || '';
  if (configuredSecret && auth === `Bearer ${configuredSecret}`) return true;

  // Browser writes are disabled by default. Same-origin checks are only a
  // demo convenience, not an authentication boundary, so they are honored
  // only when the explicit demo-only switch is enabled.
  if (process.env.DEMO_ALLOW_PUBLIC_WRITES !== 'true') return false;

  const allowedOrigin = process.env.APP_ORIGIN || 'https://ava-hotel.vercel.app';
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  return origin === allowedOrigin || referer.startsWith(`${allowedOrigin}/`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const db = dbClient();
    const body = req.body || {};

    // Public demo reset is deliberately constrained to Room 512 test data.
    // It cannot delete arbitrary rooms or staff data.
    if (body.action === 'reset_demo') {
      if (!sameOrigin(req) && !authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const { data: deleted, error: resetErr } = await db
        .from('service_requests')
        .delete()
        .eq('room_number', '512')
        .select('id');
      if (resetErr) throw resetErr;
      return res.status(200).json({ deleted: deleted?.length || 0 });
    }

    if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });

    if (body.action === 'create') {
      if (!body.room_number || !body.details || !body.department) {
        return res.status(400).json({ error: 'room_number, details, and department are required.' });
      }
      const slaMinutes = body.department === 'housekeeping' ? 10 : body.department === 'engineering' ? 15 : 20;
      const { data: displayId, error: idErr } = await db.rpc('next_request_display_id');
      if (idErr) throw idErr;
      const now = new Date();
      const payload = {
        display_id: displayId,
        room_number: String(body.room_number),
        guest_name: body.guest_name || null,
        request_type: body.request_type || (body.department === 'engineering' ? 'maintenance' : 'amenity'),
        details: String(body.details),
        quantity: body.quantity ? Number(body.quantity) : null,
        department: body.department,
        priority: body.priority || 'normal',
        status: 'NEW',
        source: body.source || 'Manual',
        created_at: now.toISOString(),
        sla_target_at: new Date(now.getTime() + slaMinutes * 60000).toISOString()
      };
      const { data: created, error: createErr } = await db.from('service_requests').insert(payload).select('*').single();
      if (createErr) throw createErr;
      await db.from('request_events').insert({
        request_id: created.id,
        event_type: 'CREATED',
        actor_type: 'manual',
        actor_id: 'ops',
        note: created.details
      });
      return res.status(200).json({ request: created });
    }

    const { data: request, error } = await db.from('service_requests').select('*').eq('id', body.request_id).single();
    if (error) throw error;

    if (body.action === 'assign') {
      const { data: staff, error: staffErr } = await db.from('staff').select('*').eq('id', body.assignee_id).single();
      if (staffErr) throw staffErr;
      if (staff.department !== request.department) {
        return res.status(400).json({ error: 'Assignee department does not match request department.' });
      }
      if (['COMPLETED', 'CANCELLED'].includes(request.status)) {
        return res.status(400).json({ error: 'Closed requests cannot be assigned.' });
      }
      const nextStatus = request.status === 'NEW' ? 'ASSIGNED' : request.status;
      const { data: updated, error: updateErr } = await db
        .from('service_requests')
        .update({ assignee_id: staff.id, status: nextStatus, assigned_at: new Date().toISOString() })
        .eq('id', request.id)
        .select('*')
        .single();
      if (updateErr) throw updateErr;
      await db.from('request_events').insert({
        request_id: request.id,
        event_type: request.assignee_id ? 'REASSIGNED' : 'ASSIGNED',
        actor_type: 'supervisor',
        actor_id: 'ops',
        from_status: request.status,
        to_status: nextStatus,
        note: `Assigned to ${staff.name}.`
      });
      return res.status(200).json({ request: updated });
    }

    if (body.action === 'transition') {
      const to = body.to_status;
      if (!(VALID_TRANSITIONS[request.status] || []).includes(to)) {
        return res.status(400).json({ error: `Invalid transition ${request.status} → ${to}` });
      }
      const patch = { status: to };
      const now = new Date().toISOString();
      if (to === 'IN_PROGRESS') patch.started_at = now;
      if (to === 'BLOCKED') {
        patch.blocked_at = now;
        patch.blocked_reason = body.blocked_reason || 'Blocked';
      }
      if (to === 'COMPLETED') patch.completed_at = now;
      if (to === 'CANCELLED') patch.cancelled_at = now;

      const { data: updated, error: updateErr } = await db
        .from('service_requests')
        .update(patch)
        .eq('id', request.id)
        .select('*')
        .single();
      if (updateErr) throw updateErr;
      await db.from('request_events').insert({
        request_id: request.id,
        event_type: to === 'IN_PROGRESS' ? 'STARTED' : to,
        actor_type: 'staff',
        actor_id: 'web',
        from_status: request.status,
        to_status: to,
        note: body.blocked_reason || null
      });
      return res.status(200).json({ request: updated });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
}
