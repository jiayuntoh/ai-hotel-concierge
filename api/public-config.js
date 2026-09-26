export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL || '';
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !publishableKey) {
    return res.status(503).json({ configured: false });
  }
  return res.status(200).json({
    configured: true,
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey
  });
}
