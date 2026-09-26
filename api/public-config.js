export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const publicKey = process.env.VAPI_PUBLIC_KEY || '';
  const assistantId = process.env.VAPI_ASSISTANT_ID || '';

  return res.status(200).json({
    configured: Boolean(publicKey && assistantId),
    VAPI_PUBLIC_KEY: publicKey,
    VAPI_ASSISTANT_ID: assistantId
  });
}
