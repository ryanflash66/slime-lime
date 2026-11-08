// POST /api/paypal/capture
// Body: { orderId }
// Captures an order the buyer approved in the PayPal popup.
const { captureOrder, sendError, readJson } = require('../_lib/paypal');

const ORDER_ID_RE = /^[A-Z0-9]{8,32}$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { orderId } = readJson(req);
    if (typeof orderId !== 'string' || !ORDER_ID_RE.test(orderId)) {
      return res.status(400).json({ error: 'Invalid order id.' });
    }
    const data = await captureOrder(orderId);
    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    res.status(200).json({
      orderId: data.id,
      status: data.status, // COMPLETED when the money moved (sandbox money here)
      captureId: capture?.id,
      captureStatus: capture?.status,
      amount: capture?.amount?.value,
      payer: data.payer?.name?.given_name || null,
    });
  } catch (err) {
    sendError(res, err);
  }
};
