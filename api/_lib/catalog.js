// Server-side price list. The browser never decides what an order costs:
// it sends flavor ids and quantities, and the total is computed here.
//
// Keep in sync with FLAVORS in shell.jsx and the cadences in subscribe.jsx.
// Prices are in cents to avoid floating-point drift.

const FLAVOR_PRICES = {
  'lemon-lime': { name: 'Slime Lime Lemon-Lime', cents: 250 },
  'cherry':     { name: 'Slime Lime Cherry Cool', cents: 250 },
  'blue-rasp':  { name: 'Slime Lime Blue Raspberry', cents: 250 },
  'mango':      { name: 'Slime Lime Mango Rush', cents: 275 },
  'grape':      { name: 'Slime Lime Grape Glitch', cents: 275 },
  'watermelon': { name: 'Slime Lime Watermelon', cents: 250 },
};

// Subscriber discount, in percent, per cadence id.
const CADENCES = {
  biweekly:  { label: 'every 2 weeks', save: 22 },
  monthly:   { label: 'every month', save: 28 },
  quarterly: { label: 'every 3 months', save: 18 },
};

const MAX_QTY_PER_LINE = 96;
const MAX_LINES = 20;

// Unit price for one bottle, rounded to the cent the same way subscribe.jsx does.
function unitCents(flavorId, cadenceId) {
  const f = FLAVOR_PRICES[flavorId];
  if (!f) return null;
  if (!cadenceId) return f.cents;
  const c = CADENCES[cadenceId];
  if (!c) return null;
  return Math.round(f.cents * (100 - c.save) / 100);
}

function centsToValue(cents) {
  return (cents / 100).toFixed(2);
}

// Turns the client's cart lines into priced line items, or throws a 400-style error.
// Accepts lines like { id: 'mango', qty: 3 } or { id: 'mango--sub', qty: 6, subscription: 'monthly' }.
function priceCart(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw badRequest('Cart is empty.');
  if (lines.length > MAX_LINES) throw badRequest('Too many cart lines.');

  const items = [];
  let totalCents = 0;

  for (const line of lines) {
    if (!line || typeof line.id !== 'string') throw badRequest('Each cart line needs an id.');
    const isSub = line.id.endsWith('--sub');
    const flavorId = isSub ? line.id.slice(0, -'--sub'.length) : line.id;
    const cadenceId = isSub ? line.subscription : null;
    if (isSub && !CADENCES[cadenceId]) throw badRequest(`Unknown subscription cadence for ${line.id}.`);

    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw badRequest(`Quantity for ${line.id} must be a whole number from 1 to ${MAX_QTY_PER_LINE}.`);
    }

    const cents = unitCents(flavorId, cadenceId);
    if (cents == null) throw badRequest(`Unknown flavor: ${line.id}.`);

    const flavor = FLAVOR_PRICES[flavorId];
    items.push({
      name: isSub ? `${flavor.name} (subscription, ${CADENCES[cadenceId].label})` : flavor.name,
      sku: line.id,
      quantity: String(qty),
      category: 'PHYSICAL_GOODS',
      unit_amount: { currency_code: 'USD', value: centsToValue(cents) },
    });
    totalCents += cents * qty;
  }

  return { items, totalCents, total: centsToValue(totalCents) };
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

module.exports = { FLAVOR_PRICES, CADENCES, unitCents, priceCart, centsToValue };
