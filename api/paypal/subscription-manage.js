// POST /api/paypal/subscription-manage
// Body: { subscriptionId, sig, action }   action: 'status' | 'pause' | 'resume' | 'cancel'
// `sig` is the signature POST /api/paypal/subscriptions handed out with the subscription ID
// (see _lib/subsign.js); without it nobody can read or change a subscription.
// Every action answers 200 with the subscription's current status object (see toStatus):
//   { id, status, cadence, nextBillingTime, lastPayment, amount, pack, priceOk }
// pause/resume/cancel call PayPal's suspend/activate/cancel first. A state that does not allow
// the action is a 409 with a friendly message.
const { decodePackCode } = require('../_lib/catalog');
const { paypalFetch, sendError, readJson } = require('../_lib/paypal');
const { ensurePlans } = require('../_lib/plans');
const { getSubscription, verifyBilledAmount } = require('../_lib/subscriptions');
const subsign = require('../_lib/subsign');

const ID_PATTERN = /^I-[A-Z0-9]{6,32}$/;

const ENDED = "This subscription has already ended.";

// action -> PayPal endpoint, reason sent to PayPal, and the state the subscription must be in.
const ACTIONS = {
  pause: {
    path: 'suspend',
    reason: 'Paused by shopper via Slime Lime',
    allowed: ['ACTIVE'],
    refusal: 'Only an active subscription can be paused.',
  },
  resume: {
    path: 'activate',
    reason: 'Resumed by shopper via Slime Lime',
    allowed: ['SUSPENDED'],
    refusal: 'Only a paused subscription can be resumed.',
  },
  cancel: {
    path: 'cancel',
    reason: 'Cancelled by shopper via Slime Lime',
    allowed: ['APPROVAL_PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED'],
    refusal: ENDED,
  },
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

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
  const spec = ACTIONS[action];
  return spec.allowed.includes(state) ? null : spec.refusal;
}

function conflict(message, state) {
  const err = httpError(409, message);
  err.state = state;
  return err;
}

function amountOf(money) {
  return money && typeof money.value === 'string' ? money.value : null;
}

// The per-cycle price PayPal bills: the REGULAR cycle's fixed price (else the first cycle's).
function billedAmount(subscription) {
  const cycles = subscription.plan && subscription.plan.billing_cycles;
  if (!Array.isArray(cycles) || cycles.length === 0) return null;
  const cycle = cycles.find((c) => c && c.tenure_type === 'REGULAR') || cycles[0];
  return amountOf(cycle && cycle.pricing_scheme && cycle.pricing_scheme.fixed_price);
}

// Builds the response from an allow-list of fields. Nothing about the subscriber (name, email,
// address, payer id) is ever copied, whatever PayPal sends.
function toStatus(subscription, planIds, check) {
  const planId = subscription.plan_id;
  const cadence = typeof planId === 'string' && planId
    ? Object.keys(planIds).find((c) => [].concat(planIds[c]).includes(planId)) || null
    : null;
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

async function fetchStatus(id) {
  return upstream(async () => {
    const [subscription, planIds] = await Promise.all([getSubscription(id), ensurePlans()]);
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw httpError(400, 'Request body must be a JSON object.');
    }
    const { subscriptionId, sig, action } = body;
    if (typeof subscriptionId !== 'string' || !ID_PATTERN.test(subscriptionId)) {
      throw httpError(400, 'subscriptionId must look like a PayPal subscription ID (I-…).');
    }
    if (action !== 'status' && !Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
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

      const spec = ACTIONS[action];
      try {
        await paypalFetch(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/${spec.path}`,
          { reason: spec.reason });
      } catch (err) {
        if (!isStatusInvalid(err)) {
          err.status = 502;
          throw err;
        }
        // The state changed between our read and PayPal's check (or PayPal is stricter than we
        // are). Re-read it for the right message; fall back to this action's refusal.
        let fresh = null;
        try { fresh = (await getSubscription(subscriptionId)).status; } catch (e) { /* keep fallback */ }
        throw conflict(refusal(action, fresh) || spec.refusal, fresh || state);
      }
      current = await fetchStatus(subscriptionId);
    }

    res.status(200).json(toStatus(current.subscription, current.planIds, current.check));
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ error: err.message, status: err.state || null });
    }
    sendError(res, err);
  }
};
