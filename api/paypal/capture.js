// POST /api/paypal/capture
// Body: { orderId }
// Captures an order the buyer approved in the PayPal popup.
// A retry after a lost response (or one racing the first capture) gets a 4xx from PayPal; if the
// order is in fact COMPLETED, that is reported as the successful capture instead of an error, so
// the browser can still record the order. That path leaves out the payer's name.
const { captureOrder, getOrder, sendError, readJson } = require('../_lib/paypal');

const ORDER_ID_RE = /^[A-Z0-9]{8,32}$/;

function receipt(data) {
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    orderId: data.id,
    status: data.status, // COMPLETED when the money moved (sandbox money here)
    captureId: capture?.id,
    captureStatus: capture?.status,
    amount: capture?.amount?.value,
    payer: data.payer?.name?.given_name || null,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { orderId } = readJson(req);
    if (typeof orderId !== 'string' || !ORDER_ID_RE.test(orderId)) {
      return res.status(400).json({ error: 'Invalid order id.' });
    }
    let out;
    try {
      out = receipt(await captureOrder(orderId));
    } catch (err) {
      if (!(err.status === 409 || err.status === 422)) throw err;
      const current = await getOrder(orderId).catch(() => null);
      if (!current || current.status !== 'COMPLETED') throw err;
      out = { ...receipt(current), payer: null };
    }
    res.status(200).json(out);
  } catch (err) {
    sendError(res, err);
  }
};
