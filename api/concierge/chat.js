// POST /api/concierge/chat
// Body: { messages: [{ role, content }], pack?: [{ id, qty }], history?: [{ orderId, lines, at }] }
// Returns { reply, pack, checkout, toolsUsed }. pack is set when the agent built a new pack;
// checkout ({ orderId, total }) is set when it created the PayPal sandbox order.
const { runConcierge } = require('../_lib/concierge');
const { readJson } = require('../_lib/paypal');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const out = await runConcierge(req, readJson(req));
    res.status(200).json(out);
  } catch (err) {
    const status = err.status || 500;
    console.error('[concierge]', status, err.message, err.paypal || '');
    res.status(status).json({
      error: status < 500 || status === 503 ? err.message : 'The concierge glitched. Try that again.',
    });
  }
};
