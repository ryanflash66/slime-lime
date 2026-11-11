// POST /api/paypal/subscriptions
// Body: { lines: [{ id, qty }], cadence }   (id is a plain flavor id; '--sub' is added here)
// Prices the pack on the server, creates a PayPal subscription on that cadence's plan with the
// price set inline (never the plan's placeholder), and returns 201
// { subscriptionId, sig, total, cadence }. `sig` signs subscriptionId (see _lib/subsign.js).
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
    const { lines, cadence } = readJson(req);
    const priced = priceSubscription(lines, cadence);

    // Without the secret we could not sign the new subscription, so stop before PayPal makes one.
    subsign.assertConfigured();

    let subscription;
    try {
      const planId = (await ensurePlans())[cadence];
      if (!planId) throw badGateway(`No PayPal plan for cadence "${cadence}".`);
      subscription = await createSubscription({ planId, total: priced.total, packCode: priced.packCode });
    } catch (err) {
      // The pack is already validated, so the browser can't cause a PayPal failure here:
      // any PayPal error (including a 4xx) is a bad gateway.
      if (err.paypal) err.status = 502;
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
