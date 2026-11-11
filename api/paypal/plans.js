// GET /api/paypal/plans
// Makes sure the PayPal subscription product and one plan per cadence exist (creating them on
// first use), then returns { env, plans: { biweekly|monthly|quarterly: { id, status } } }.
// Plan IDs are not secret; they are what the browser hands to PayPal to start a subscription.
const { ensurePlanRecords } = require('../_lib/plans');
const { paypalEnv, sendError } = require('../_lib/paypal');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { plans } = await ensurePlanRecords();
    res.status(200).json({ env: paypalEnv(), plans });
  } catch (err) {
    // The browser can't cause a provisioning failure, so any PayPal error here is a bad gateway.
    if (err.paypal) err.status = 502;
    sendError(res, err);
  }
};
