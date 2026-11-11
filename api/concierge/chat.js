// POST /api/concierge/chat
// Body: { messages: [{ role, content }], pack?: [{ id, qty }], history?: [{ orderId, lines, at }], session? }
// Returns { reply, pack, checkout, toolsUsed, model }. model is 'anthropic', 'gemini' or 'gateway'.
// pack is set when the agent built a new pack;
// checkout ({ orderId, total, lines, env }) is set when it created the PayPal order.
//
// Cheap caps only: oversized bodies and runaway message lists are refused before any model call.
// The per-IP rate limit lives in Vercel Firewall (DAR-693), not here.
const { runConcierge } = require('../_lib/concierge');
const { readJson } = require('../_lib/paypal');

const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 2000;

function tooBig(req, body) {
  const declared = Number(req.headers && req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return true;
  try { return Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES; } catch (e) { return true; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const body = readJson(req);
  if (tooBig(req, body)) return res.status(413).json({ error: 'That message is too long.' });
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length > MAX_MESSAGES
    || messages.some(m => !m || typeof m.content !== 'string' || m.content.length > MAX_MESSAGE_CHARS)) {
    return res.status(400).json({ error: 'That conversation is too long. Reload the page to start a new one.' });
  }
  try {
    const out = await runConcierge(req, body);
    res.status(200).json(out);
  } catch (err) {
    const status = err.status || 500;
    console.error('[concierge]', status, err.message, err.detail || '', err.paypal || '');
    res.status(status).json({
      error: status < 500 || status === 503 ? err.message : 'The concierge glitched. Try that again.',
    });
  }
};
