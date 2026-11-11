// PayPal Subscriptions v1 helpers: create a server-priced subscription, read one back, and check
// that what PayPal will bill matches the pack recorded in its custom_id.
//
// Why verifyBilledAmount exists: plan IDs are public and every plan carries a 10.00 USD
// placeholder price (see plans.js). Anyone can open the PayPal JS SDK on a plan ID, or pass their
// own inline plan override and custom_id, and get a real subscription at a price we never set.
// Before trusting a subscription (status, manage, fulfillment), re-price its custom_id and compare.

const { priceSubscription, decodePackCode } = require('./catalog');
const { paypalFetch, paypalGet } = require('./paypal');
const { ensurePlans } = require('./plans');

// Creates a subscription on `planId` at `total` (a "12.34" string) per billing cycle.
// The inline price override is mandatory: without it PayPal bills the plan's placeholder price.
async function createSubscription({ planId, total, packCode }) {
  if (!planId || !/^\d+\.\d{2}$/.test(String(total)) || !packCode) {
    throw new Error('createSubscription needs a plan ID, a total and a pack code.');
  }
  return paypalFetch('/v1/billing/subscriptions', {
    plan_id: planId,
    custom_id: packCode,
    plan: {
      billing_cycles: [{
        sequence: 1,
        pricing_scheme: { fixed_price: { value: String(total), currency_code: 'USD' } },
      }],
    },
    application_context: {
      brand_name: 'Slime Lime',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'SUBSCRIBE_NOW',
    },
  });
}

// GET /v1/billing/subscriptions/{id}?fields=plan. `fields=plan` makes PayPal include the
// subscription's effective plan (with any override), which verifyBilledAmount needs.
async function getSubscription(id) {
  return paypalGet(`/v1/billing/subscriptions/${encodeURIComponent(id)}?fields=plan`);
}

// "12.34" -> 1234; anything that is not a plain non-negative money string -> null.
function toCents(value) {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

function money(m) {
  return m && m.value != null ? `${m.value} ${m.currency_code || '?'}` : 'nothing';
}

// Checks that a subscription bills exactly what its pack costs.
//
// `subscription` is a GET /v1/billing/subscriptions/{id}?fields=plan response (getSubscription).
// `planIds` is optional ({ cadence: planId }); by default it comes from ensurePlans().
//
// Resolves { ok: true, cadence, lines, packCode, expected } when:
//   - custom_id decodes to a pack and plan_id is one of our cadence plans;
//   - every billing cycle in `plan.billing_cycles` has a fixed_price in USD equal to
//     priceSubscription(pack, cadence).total (a missing price, e.g. a free trial, fails);
//   - quantity is absent or "1";
//   - billing_info.last_payment, if PayPal has taken one, is that same amount.
// Otherwise resolves { ok: false, reason, expected?, actual? }. It only rejects when ensurePlans()
// fails (PayPal unreachable), so callers can tell "wrong price" from "could not check".
async function verifyBilledAmount(subscription, planIds) {
  const fail = (reason, extra) => ({ ok: false, reason, ...extra });
  if (!subscription || typeof subscription !== 'object') return fail('No subscription to check.');

  const lines = decodePackCode(subscription.custom_id);
  if (!lines) return fail('custom_id is not a pack code.');

  const ids = planIds || await ensurePlans();
  const cadence = Object.keys(ids).find((c) => ids[c] === subscription.plan_id);
  if (!cadence) return fail('Subscription is not on a Slime Lime plan.');

  let priced;
  try {
    priced = priceSubscription(lines, cadence);
  } catch (e) {
    return fail(`custom_id does not describe a valid pack: ${e.message}`);
  }
  const expected = `${priced.total} USD`;

  const cycles = subscription.plan && subscription.plan.billing_cycles;
  if (!Array.isArray(cycles) || cycles.length === 0) {
    return fail('Subscription has no plan details; fetch it with ?fields=plan.', { expected });
  }
  for (const cycle of cycles) {
    const price = cycle && cycle.pricing_scheme && cycle.pricing_scheme.fixed_price;
    if (!price || price.currency_code !== 'USD' || toCents(price.value) !== priced.totalCents) {
      return fail(`Billing cycle ${cycle && cycle.sequence} charges ${money(price)}, expected ${expected}.`,
        { expected, actual: money(price) });
    }
  }

  if (subscription.quantity != null && String(subscription.quantity) !== '1') {
    return fail(`Subscription quantity is ${subscription.quantity}, expected 1.`, { expected });
  }

  const last = subscription.billing_info && subscription.billing_info.last_payment;
  if (last && last.amount) {
    if (last.amount.currency_code !== 'USD' || toCents(last.amount.value) !== priced.totalCents) {
      return fail(`Last payment was ${money(last.amount)}, expected ${expected}.`, { expected, actual: money(last.amount) });
    }
  }

  return { ok: true, cadence, lines, packCode: priced.packCode, expected };
}

module.exports = { createSubscription, getSubscription, verifyBilledAmount };
