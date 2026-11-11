// POST /api/paypal/subscription-manage
// Body: { subscriptionId, sig, action }   action: 'status' | 'pause' | 'resume' | 'cancel'
// `sig` is the signature POST /api/paypal/subscriptions handed out with the subscription ID
// (see _lib/subsign.js); without it nobody can read or change a subscription.
// Every action answers 200 with the subscription's current status object:
//   { id, status, cadence, nextBillingTime, lastPayment, amount, pack, priceOk }
// pause/resume/cancel call PayPal's suspend/activate/cancel first. A state that does not allow
// the action is a 409 with a friendly message.
// The logic lives in manageSubscription (_lib/subscriptions.js), which the concierge also calls.
const { sendError, readJson } = require('../_lib/paypal');
const { manageSubscription, fetchStatus, toStatus } = require('../_lib/subscriptions');

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
    const { subscriptionId, sig, action } = body;
    res.status(200).json(await manageSubscription({ subscriptionId, sig, action }));
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ error: err.message, status: err.state || null });
    }
    sendError(res, err);
  }
};

// The concierge reads status the same way, server-side (api/_lib/concierge-subs.js).
module.exports.fetchStatus = fetchStatus;
module.exports.toStatus = toStatus;
