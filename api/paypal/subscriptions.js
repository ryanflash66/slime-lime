// POST /api/paypal/subscriptions
// Body: { lines: [{ id, qty }], cadence, attemptId? }   (id is a plain flavor id; '--sub' is added here)
// attemptId: optional client-generated ID (8-64 of [A-Za-z0-9_-]) for one checkout attempt. A retry
// with the same attemptId, pack and cadence gets the same subscription back instead of a new one.
// Prices the pack on the server, creates a PayPal subscription on that cadence's plan with the
// price set inline (never the plan's placeholder), and returns 201
// { subscriptionId, sig, total, cadence }. `sig` signs subscriptionId (see _lib/subsign.js).
const crypto = require('crypto');
const { priceSubscription } = require('../_lib/catalog');
const { sendError, readJson } = require('../_lib/paypal');
const { ensurePlans } = require('../_lib/plans');
const { createSubscription } = require('../_lib/subscriptions');
const subsign = require('../_lib/subsign');

function badGateway(message) {
  const err = new Error(message);
  err.status = 502;
  return err;
}

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
    if (attemptId != null && (typeof attemptId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(attemptId))) {
      const err = new Error('attemptId must be 8-64 letters, digits, "-" or "_".');
      err.status = 400;
      throw err;
    }
    const priced = priceSubscription(lines, cadence);
    // Tie the idempotency key to the exact pack too, so reusing an attemptId for a different pack
    // can never replay an old subscription for it.
    const requestId = attemptId
      ? 'slime-sub-' + crypto.createHash('sha256').update(`${attemptId}|${cadence}|${priced.packCode}|${priced.total}`).digest('hex').slice(0, 48)
      : undefined;

    // Without the secret we could not sign the new subscription, so stop before PayPal makes one.
    subsign.assertConfigured();

    let subscription;
    try {
      const planId = (await ensurePlans())[cadence];
      if (!planId) throw badGateway(`No PayPal plan for cadence "${cadence}".`);
      subscription = await createSubscription({ planId, priced, requestId });
    } catch (err) {
      // The pack is already validated, so the browser can't cause a failure here: any error
      // reaching PayPal (an HTTP error, a network or token failure) is a bad gateway.
      err.status = 502;
      throw err;
    }
    if (!subscription || typeof subscription.id !== 'string' || !subscription.id) {
      throw badGateway('PayPal did not return a subscription ID.');
    }

    res.status(201).json({
      subscriptionId: subscription.id,
      sig: subsign.sign(subscription.id),
      total: priced.total,
      cadence,
    });
  } catch (err) {
    sendError(res, err);
  }
};
