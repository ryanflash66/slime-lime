// POST /api/paypal/subscriptions
// Body: { lines: [{ id, qty }], cadence, attemptId? }   (id is a plain flavor id; '--sub' is added here)
// attemptId: optional client-generated ID (8-64 of [A-Za-z0-9_-]) for one checkout attempt. A retry
// with the same attemptId, pack and cadence gets the same subscription back instead of a new one.
// Prices the pack on the server, creates a PayPal subscription on that cadence's plan with the
// price set inline (never the plan's placeholder), and returns 201
// { subscriptionId, sig, total, cadence }. `sig` signs subscriptionId (see _lib/subsign.js).
// The logic lives in startSubscription (_lib/subscriptions.js), which the concierge also calls.
const { sendError, readJson } = require('../_lib/paypal');
const { startSubscription } = require('../_lib/subscriptions');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      const err = new Error('Request body must be a JSON object.');
      err.status = 400;
      throw err;
    }
    const { lines, cadence, attemptId } = body;
    const started = await startSubscription({ lines, cadence, attemptId });
    res.status(201).json({
      subscriptionId: started.subscriptionId,
      sig: started.sig,
      total: started.total,
      cadence: started.cadence,
    });
  } catch (err) {
    sendError(res, err);
  }
};
