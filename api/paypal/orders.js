// POST /api/paypal/orders
// Body: { items: [{ id, qty, subscription? }] }
// Prices the cart on the server, creates a PayPal order, returns { orderId, total }.
const { priceCart } = require('../_lib/catalog');
const { createOrder, sendError, readJson } = require('../_lib/paypal');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { items } = readJson(req);
    const priced = priceCart(items);
    const order = await createOrder(priced);
    res.status(201).json({ orderId: order.id, total: priced.total });
  } catch (err) {
    sendError(res, err);
  }
};
