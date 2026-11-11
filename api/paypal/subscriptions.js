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
    if (!subsign.isConfigured()) {
      const err = new Error('Subscriptions are not configured on the server.');
      err.status = 503;
      throw err;
    }

    let planIds;
    try {
      planIds = await ensurePlans();
    } catch (err) {
      // The browser can't cause a provisioning failure, so any PayPal error here is a bad gateway.
      if (err.paypal) err.status = 502;
      throw err;
    }
    const planId = planIds[cadence];
    if (!planId) {
      const err = new Error(`No PayPal plan for cadence "${cadence}".`);
      err.status = 500;
      throw err;
    }

    const subscription = await createSubscription({ planId, total: priced.total, packCode: priced.packCode });
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
