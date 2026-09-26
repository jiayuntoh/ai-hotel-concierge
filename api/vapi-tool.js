import { createClient } from '@supabase/supabase-js';

const ROUTING = {
  amenity: { department: 'housekeeping', priority: 'normal', slaMinutes: 10 },
  housekeeping: { department: 'housekeeping', priority: 'normal', slaMinutes: 15 },
  maintenance: { department: 'engineering', priority: 'high', slaMinutes: 15 },
  late_checkout_request: { department: 'front_desk', priority: 'normal', slaMinutes: 20 },
  other: { department: 'front_desk', priority: 'normal', slaMinutes: 20 },
};

function client() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase server environment variables are missing.');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function getArgs(call) {
  return call?.function?.arguments || call?.parameters || {};
}

async function createRequest(db, toolCall, callContext) {
  const args = getArgs(toolCall);
  const required = ['room_number', 'details', 'request_type'];
  for (const key of required) if (!args[key]) throw new Error(`Missing required field: ${key}`);
  if (!ROUTING[args.request_type]) throw new Error('Unsupported request_type.');

  const routing = ROUTING[args.request_type];
  const idempotencyKey = `${callContext?.id || 'no-call'}:${toolCall.id}`;
  const { data: existing } = await db.from('service_requests').select('id, display_id, status').eq('idempotency_key', idempotencyKey).maybeSingle();
  if (existing) return { success: true, duplicate: true, request_id: existing.display_id, status: existing.status };

  const { data: counterRow, error: counterError } = await db.rpc('next_request_display_id');
  if (counterError) throw counterError;
  const createdAt = new Date();
  const slaTarget = new Date(createdAt.getTime() + routing.slaMinutes * 60000);

  const payload = {
    display_id: counterRow,
    room_number: String(args.room_number),
    guest_name: args.guest_name || null,
    request_type: args.request_type,
    details: String(args.details),
    quantity: args.quantity ?? null,
    department: routing.department,
    priority: routing.priority,
    status: 'NEW',
    source: 'Voice',
    source_call_id: callContext?.id || null,
    idempotency_key: idempotencyKey,
    created_at: createdAt.toISOString(),
    sla_target_at: slaTarget.toISOString(),
  };
  const { data: inserted, error } = await db.from('service_requests').insert(payload).select('*').single();
  if (error) throw error;
  await db.from('request_events').insert({ request_id: inserted.id, event_type: 'CREATED', actor_type: 'voice_agent', actor_id: 'Ava', note: inserted.details, metadata: { source_call_id: callContext?.id || null } });
  return { success: true, request_id: inserted.display_id, status: 'submitted', department: routing.department };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const message = req.body?.message;
  const calls = message?.toolCallList || [];
  if (message?.type !== 'tool-calls' || !calls.length) return res.status(200).json({ results: [] });

  const db = client();
  const results = [];
  for (const call of calls) {
    try {
      const name = call?.function?.name || call?.name;
      if (!['create_service_request', 'create_maintenance_request'].includes(name)) throw new Error(`Unsupported tool: ${name}`);
      const args = getArgs(call);
      if (name === 'create_maintenance_request') {
        args.request_type = 'maintenance';
        args.details = args.details || args.issue_description || args.issue_type;
      }
      const result = await createRequest(db, { ...call, function: { ...(call.function || {}), arguments: args } }, message.call);
      results.push({ toolCallId: call.id, result: JSON.stringify(result) });
    } catch (error) {
      results.push({ toolCallId: call.id, result: JSON.stringify({ success: false, error: error.message || 'Request could not be created.' }) });
    }
  }
  // Vapi expects HTTP 200 with a results array for tool calls, including application-level errors.
  return res.status(200).json({ results });
}
