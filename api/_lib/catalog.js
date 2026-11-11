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
const CUSTOM_ID_MAX = 127; // PayPal's limit for a subscription's custom_id.

// Own keys only, so ids like 'constructor' or '__proto__' never match Object.prototype.
function has(obj, key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
}

// Unit price for one bottle, rounded to the cent the same way subscribe.jsx does.
function unitCents(flavorId, cadenceId) {
  if (!has(FLAVOR_PRICES, flavorId)) return null;
  const f = FLAVOR_PRICES[flavorId];
  if (!cadenceId) return f.cents;
  if (!has(CADENCES, cadenceId)) return null;
  const c = CADENCES[cadenceId];
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
    if (isSub && !has(CADENCES, cadenceId)) throw badRequest(`Unknown subscription cadence for ${line.id}.`);

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

// Two-letter codes for packCode (stored in a subscription's custom_id). Never reuse or
// reassign a code: live subscriptions keep their custom_id for as long as they bill. When a
// flavor is retired, leave its code here so nobody hands it to a new flavor.
const FLAVOR_CODES = {
  'lemon-lime': 'lm',
  'cherry':     'ch',
  'blue-rasp':  'br',
  'mango':      'mg',
  'grape':      'gp',
  'watermelon': 'wm',
};
const CODE_FLAVORS = {};
for (const [id, code] of Object.entries(FLAVOR_CODES)) {
  if (!/^[a-z]{2}$/.test(code)) throw new Error(`catalog.js: pack code "${code}" for "${id}" must be two letters.`);
  if (has(CODE_FLAVORS, code)) throw new Error(`catalog.js: pack code "${code}" is used twice.`);
  CODE_FLAVORS[code] = id;
}
for (const id of Object.keys(FLAVOR_PRICES)) {
  if (!has(FLAVOR_CODES, id)) throw new Error(`catalog.js: flavor "${id}" needs a pack code in FLAVOR_CODES.`);
}

// Prices a subscription pack: lines like [{ id: 'mango', qty: 6 }] (plain flavor ids) plus a
// cadence id. The lines go through priceCart as the matching '--sub' lines (same limits, same
// rounding), so a subscription always costs what the same pack costs in the cart.
// Returns { totalCents, total, packCode }, or throws a 400.
//
// packCode lists the lines in order as <code><qty> joined by '.', e.g. 'lm6.ch4.mg2'. Lines are
// not merged, so it decodes back to exactly the lines that were priced. At the current limits the
// longest is 20 lines of 'xx96' = 99 characters, inside PayPal's 127-character custom_id.
function priceSubscription(lines, cadence) {
  if (!has(CADENCES, cadence)) throw badRequest('Unknown subscription cadence.');
  if (!Array.isArray(lines)) throw badRequest('Cart is empty.');
  // Plain flavor ids only; priceCart checks everything else (line count, ids, quantities).
  for (const line of lines) {
    if (line && typeof line.id === 'string' && !has(FLAVOR_PRICES, line.id)) throw badRequest(`Unknown flavor: ${line.id}.`);
  }
  const { totalCents, total } = priceCart(lines.map((l) => (
    l && typeof l.id === 'string' ? { id: `${l.id}--sub`, qty: l.qty, subscription: cadence } : l
  )));
  const packCode = lines.map((l) => `${FLAVOR_CODES[l.id]}${Number(l.qty)}`).join('.');
  if (packCode.length > CUSTOM_ID_MAX) throw badRequest('Too many items for one subscription.');
  return { totalCents, total, packCode };
}

// Inverse of the packCode built by priceSubscription: 'lm6.ch4.mg2' ->
// [{ id: 'lemon-lime', qty: 6 }, { id: 'cherry', qty: 4 }, { id: 'mango', qty: 2 }].
// Returns null for anything malformed; it never throws. It does not check quantity limits or
// whether a flavor is still sold; run the result through priceSubscription for that.
function decodePackCode(code) {
  if (typeof code !== 'string' || code.length === 0 || code.length > CUSTOM_ID_MAX) return null;
  const lines = [];
  for (const part of code.split('.')) {
    const m = /^([a-z]{2})([1-9][0-9]{0,2})$/.exec(part);
    if (!m || !has(CODE_FLAVORS, m[1])) return null;
    lines.push({ id: CODE_FLAVORS[m[1]], qty: Number(m[2]) });
  }
  return lines;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

module.exports = {
  FLAVOR_PRICES, CADENCES, FLAVOR_CODES, MAX_QTY_PER_LINE, MAX_LINES, CUSTOM_ID_MAX,
  unitCents, priceCart, centsToValue, priceSubscription, decodePackCode,
};
