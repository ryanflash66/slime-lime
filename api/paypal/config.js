// GET /api/paypal/config
// Returns the PayPal client ID (public, safe for the browser) and which environment to load.
// The secret never leaves the server.
const { paypalEnv } = require('../_lib/paypal');

module.exports = (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const clientId = process.env.PAYPAL_CLIENT_ID;
  if (!clientId) return res.status(503).json({ error: 'PayPal is not configured on the server.' });
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ clientId, env: paypalEnv() });
};
