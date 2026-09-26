import { createClient } from '@supabase/supabase-js';

function dbClient() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error('Supabase server environment variables are missing.');
  return createClient(url, secret, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  try {
    const db = dbClient();
    const [requestResult, staffResult] = await Promise.all([
      db
        .from('service_requests')
        .select('id,display_id,room_number,request_type,details,quantity,department,priority,status,assignee_id,source,blocked_reason,created_at,sla_target_at,completed_at,request_events(id,event_type,actor_type,actor_id,from_status,to_status,note,created_at)')
        .order('created_at', { ascending: false }),
      db
        .from('staff')
        .select('id,name,department,role,zone,active')
        .eq('active', true)
        .order('name')
    ]);

    if (requestResult.error) throw requestResult.error;
    if (staffResult.error) throw staffResult.error;

    return res.status(200).json({
      requests: requestResult.data || [],
      staff: staffResult.data || [],
      // This is a portfolio/demo operations board. Writes are handled only by the
      // same-origin server action endpoint; the Supabase secret never reaches the browser.
      writes_enabled: true
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not load operations data.' });
  }
}
