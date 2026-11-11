// PayPal Subscriptions v1 helpers: create a server-priced subscription, read one back, check that
// what PayPal will bill matches the pack recorded in its custom_id, and the shared logic behind
// POST /api/paypal/subscriptions (startSubscription) and POST /api/paypal/subscription-manage
// (manageSubscription). The Flavor Concierge calls those two directly.
//
// Why verifyBilledAmount exists: plan IDs are public and every plan carries a 10.00 USD
// placeholder price (see plans.js). Anyone can open the PayPal JS SDK on a plan ID, or pass their
// own inline plan override and custom_id, and get a real subscription at a price we never set.
// Before trusting a subscription (status, manage, fulfillment), re-price its custom_id and compare.

const crypto = require('crypto');
const { priceSubscription, decodePackCode } = require('./catalog');
const { paypalFetch, paypalGet } = require('./paypal');
const { ensurePlans } = require('./plans');
const subsign = require('./subsign');

// Creates a subscription on `planId` for `priced`, the result of priceSubscription(), so the
// billed total and the recorded pack code always come from the same pricing call.
// The inline price override is mandatory: without it PayPal bills the plan's placeholder price.
// `requestId` (optional) makes the create idempotent: PayPal replays the first result for the
// same PayPal-Request-Id instead of creating a second subscription on a retry.
async function createSubscription({ planId, priced, requestId }) {
  const total = priced && priced.total;
  const packCode = priced && priced.packCode;
  if (!planId || !/^\d+\.\d{2}$/.test(String(total)) || !packCode) {
    throw new Error('createSubscription needs a plan ID and a priceSubscription() result.');
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
  }, requestId);
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

// The cadence whose plan is `planId`, or null. `planIds` is { cadence: planId or [planId, ...] }.
function cadenceForPlan(planId, planIds) {
  if (typeof planId !== 'string' || !planId || !planIds) return null;
  return Object.keys(planIds).find((c) => [].concat(planIds[c]).includes(planId)) || null;
}

// Checks that a subscription bills exactly what its pack costs.
//
// `subscription` is a GET /v1/billing/subscriptions/{id}?fields=plan response (getSubscription).
// `planIds` is optional ({ cadence: planId or [planId, ...] }); by default it comes from
// ensurePlans(). Pass old plan IDs too after replacing a plan, while its subscriptions run out.
// The expected price is today's priceSubscription total; see docs/subscriptions.md before
// changing prices.
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

  const cadence = cadenceForPlan(subscription.plan_id, planIds || await ensurePlans());
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

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const ATTEMPT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

// Everything POST /api/paypal/subscriptions does after reading the body: prices `lines` on
// `cadence`, creates the PayPal subscription on that cadence's plan with the price set inline, and
// signs its ID. `attemptId` (optional, 8-64 of [A-Za-z0-9_-]) makes a retry for the same pack and
// cadence return the same subscription.
// Resolves { subscriptionId, sig, total, cadence }. Throws with err.status: 400 (bad pack, cadence
// or attemptId), 503 (no SUB_SIGNING_SECRET; nothing is created), 502 (PayPal failed).
async function startSubscription({ lines, cadence, attemptId }) {
  if (attemptId != null && (typeof attemptId !== 'string' || !ATTEMPT_ID_RE.test(attemptId))) {
    throw httpError(400, 'attemptId must be 8-64 letters, digits, "-" or "_".');
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
    if (!planId) throw new Error(`No PayPal plan for cadence "${cadence}".`);
    subscription = await createSubscription({ planId, priced, requestId });
  } catch (err) {
    // The pack is already validated, so the caller can't cause a failure here: any error
    // reaching PayPal (an HTTP error, a network or token failure) is a bad gateway.
    err.status = 502;
    throw err;
  }
  if (!subscription || typeof subscription.id !== 'string' || !subscription.id) {
    throw httpError(502, 'PayPal did not return a subscription ID.');
  }
  return {
    subscriptionId: subscription.id,
    sig: subsign.sign(subscription.id),
    total: priced.total,
    cadence,
  };
}

// ---- manage: status / pause / resume / cancel -------------------------------------------------

const SUBSCRIPTION_ID_RE = /^I-[A-Z0-9]{6,32}$/;

const ENDED = 'This subscription has already ended.';
// PayPal refuses to cancel a subscription nobody has approved yet (sandbox answers
// 404 RESOURCE_NOT_FOUND / INVALID_RESOURCE_ID). It never bills unless approved.
const NOT_APPROVED = "This subscription hasn't been approved in PayPal yet, so there's nothing to cancel. It won't bill unless it's approved.";

// action -> PayPal endpoint, reason sent to PayPal, the states it is allowed from, and the state
// it leads to.
const MANAGE_ACTIONS = {
  pause: {
    path: 'suspend',
    reason: 'Paused by shopper via Slime Lime',
    allowed: ['ACTIVE'],
    target: 'SUSPENDED',
    refusal: 'Only an active subscription can be paused.',
  },
  resume: {
    path: 'activate',
    reason: 'Resumed by shopper via Slime Lime',
    allowed: ['SUSPENDED'],
    target: 'ACTIVE',
    refusal: 'Only a paused subscription can be resumed.',
  },
  cancel: {
    path: 'cancel',
    reason: 'Cancelled by shopper via Slime Lime',
    allowed: ['APPROVAL_PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED'],
    target: 'CANCELLED',
    refusal: ENDED,
  },
};

// Any failure reaching PayPal (HTTP error, network, token) is a bad gateway for the caller.
async function upstream(fn) {
  try {
    return await fn();
  } catch (err) {
    err.status = 502;
    throw err;
  }
}

// Friendly refusal for `action` on a subscription in `state`, or null when it is allowed.
function refusal(action, state) {
  if (state === 'CANCELLED' || state === 'EXPIRED') return ENDED;
  const spec = MANAGE_ACTIONS[action];
  return spec.allowed.includes(state) ? null : spec.refusal;
}

function conflict(message, state) {
  const err = httpError(409, message);
  err.state = state;
  return err;
}

// The message for a call PayPal itself refused while the subscription is in `state`
// (unknown when the re-read failed).
function paypalRefusal(action, state) {
  if (action === 'cancel' && state === 'APPROVAL_PENDING') return NOT_APPROVED;
  const ours = refusal(action, state);
  if (ours) return ours;
  // Our own check allows the action in this state, so PayPal refused for another reason
  // (e.g. the state changed between our read and its update). Don't blame the state.
  if (state) return `PayPal didn't accept that change just now (the subscription is ${state.toLowerCase().replace(/_/g, ' ')}). Try again in a moment.`;
  return MANAGE_ACTIONS[action].refusal;
}

// PayPal money -> "21.60". PayPal trims trailing zeros ("21.6"); show cents like the
// subscriptions endpoint's `total`. Anything that is not a plain amount is passed as is.
function amountOf(m) {
  if (!m || typeof m.value !== 'string') return null;
  return /^\d+(\.\d{1,2})?$/.test(m.value) ? Number(m.value).toFixed(2) : m.value;
}

// The per-cycle price PayPal bills: the REGULAR cycle's fixed price (else the first cycle's).
function billedAmount(subscription) {
  const cycles = subscription.plan && subscription.plan.billing_cycles;
  if (!Array.isArray(cycles) || cycles.length === 0) return null;
  const cycle = cycles.find((c) => c && c.tenure_type === 'REGULAR') || cycles[0];
  return amountOf(cycle && cycle.pricing_scheme && cycle.pricing_scheme.fixed_price);
}

// Builds the status object from an allow-list of fields. Nothing about the subscriber (name,
// email, address, payer id) is ever copied, whatever PayPal sends.
function toStatus(subscription, planIds, check) {
  const cadence = cadenceForPlan(subscription.plan_id, planIds);
  const billing = subscription.billing_info || {};
  const last = billing.last_payment;
  const lastAmount = last && amountOf(last.amount);
  const lines = decodePackCode(subscription.custom_id);
  return {
    id: typeof subscription.id === 'string' ? subscription.id : null,
    status: typeof subscription.status === 'string' ? subscription.status : null,
    cadence,
    nextBillingTime: typeof billing.next_billing_time === 'string' ? billing.next_billing_time : null,
    lastPayment: lastAmount ? { amount: lastAmount, time: typeof last.time === 'string' ? last.time : null } : null,
    amount: billedAmount(subscription),
    pack: lines ? lines.map((l) => ({ id: l.id, qty: l.qty })) : null,
    priceOk: check.ok === true,
  };
}

// Reads the subscription and checks its price. `knownPlanIds` skips the ensurePlans() lookup.
async function fetchStatus(id, knownPlanIds) {
  return upstream(async () => {
    const [subscription, planIds] = await Promise.all([getSubscription(id), knownPlanIds || ensurePlans()]);
    if (!subscription || typeof subscription !== 'object' || subscription.id !== id) {
      throw new Error('PayPal returned a different subscription.');
    }
    const check = await verifyBilledAmount(subscription, planIds);
    return { subscription, planIds, check };
  });
}

// PayPal's answer when the subscription's state does not allow the call:
// 422 { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'SUBSCRIPTION_STATUS_INVALID' }] }.
function isStatusInvalid(err) {
  return Boolean(err && err.status === 422 && err.paypal && err.paypal.issue === 'SUBSCRIPTION_STATUS_INVALID');
}

// Everything POST /api/paypal/subscription-manage does after reading the body. `action` is
// 'status', 'pause', 'resume' or 'cancel'; `sig` must be subsign's signature of subscriptionId.
// Resolves the status object (see toStatus). Throws with err.status: 400 (bad id or action),
// 503 (no SUB_SIGNING_SECRET), 403 (sig does not match), 409 (the state does not allow the action;
// err.state is PayPal's state), 502 (PayPal failed). Nothing reaches PayPal before the sig check.
async function manageSubscription({ subscriptionId, sig, action }) {
  if (typeof subscriptionId !== 'string' || !SUBSCRIPTION_ID_RE.test(subscriptionId)) {
    throw httpError(400, 'subscriptionId must look like a PayPal subscription ID (I-…).');
  }
  if (action !== 'status' && !Object.prototype.hasOwnProperty.call(MANAGE_ACTIONS, action)) {
    throw httpError(400, 'action must be one of status, pause, resume, cancel.');
  }

  // Without the secret no sig can be checked; say so (503) instead of blaming the caller.
  subsign.assertConfigured();
  if (!subsign.verify(subscriptionId, sig)) {
    throw httpError(403, "This subscription isn't linked to this browser.");
  }

  let current = await fetchStatus(subscriptionId);
  if (action !== 'status') {
    const state = current.subscription.status;
    const refused = refusal(action, state);
    if (refused) throw conflict(refused, state);

    const spec = MANAGE_ACTIONS[action];
    try {
      await paypalFetch(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/${spec.path}`,
        { reason: spec.reason });
    } catch (err) {
      const notApproved = action === 'cancel' && state === 'APPROVAL_PENDING' && err.status === 404;
      if (!isStatusInvalid(err) && !notApproved) {
        err.status = 502;
        throw err;
      }
      // PayPal refused for the subscription's state: it changed since our read, or PayPal is
      // stricter than we are (it will not cancel an unapproved one). Re-read the state for the
      // right message; fall back to the state we saw.
      let fresh = null;
      try { fresh = (await getSubscription(subscriptionId)).status; } catch (e) { /* keep fallback */ }
      throw conflict(paypalRefusal(action, fresh || state), fresh || state);
    }
    try {
      current = await fetchStatus(subscriptionId, current.planIds);
    } catch (err) {
      // PayPal has already made the change; don't report it as failed because the re-read did.
      console.error('[paypal] re-read after', action, 'failed:', err.message, err.paypal || '');
      current = { ...current, subscription: { ...current.subscription, status: spec.target } };
    }
  }

  return toStatus(current.subscription, current.planIds, current.check);
}

module.exports = {
  createSubscription, getSubscription, verifyBilledAmount, cadenceForPlan,
  startSubscription, manageSubscription, fetchStatus, toStatus, SUBSCRIPTION_ID_RE, ATTEMPT_ID_RE, NOT_APPROVED,
};
