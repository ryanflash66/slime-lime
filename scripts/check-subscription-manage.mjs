#!/usr/bin/env node
// Handler check for POST /api/paypal/subscription-manage, against a fake PayPal.
//
// Run before merging changes to the manage endpoint: node scripts/check-subscription-manage.mjs
//
// Replaces global fetch with an in-memory PayPal (token, products, plans, one subscription) and
// drives the handler directly. Covers: 405, the 400s, 403 for a missing or tampered sig, 503 with
// no signing secret (and no PayPal call), the status allow-list (no subscriber fields leak),
// priceOk, every action in every state (409 matrix, nothing sent to PayPal when refused),
// PayPal's 422 SUBSCRIPTION_STATUS_INVALID -> 409, and other PayPal/network failures -> 502.
//
// Exits 0 when everything holds, 1 with a list of failures otherwise. Uses only fake keys; it
// never talks to PayPal. Plain Node, no dependencies.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Fake configuration only; these are not real credentials.
process.env.PAYPAL_ENV = 'sandbox';
process.env.PAYPAL_CLIENT_ID = 'test-client-id';
process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
process.env.SUB_SIGNING_SECRET = 'test-signing-secret-for-check-script';

const handler = require('../api/paypal/subscription-manage.js');
const subsign = require('../api/_lib/subsign.js');
const { priceSubscription } = require('../api/_lib/catalog.js');

const SUB_ID = 'I-TESTSUB12345';
const PLAN_IDS = { biweekly: 'P-BIWEEKLY', monthly: 'P-MONTHLY', quarterly: 'P-QUARTERLY' };
const PACK = [{ id: 'lemon-lime', qty: 6 }, { id: 'cherry', qty: 4 }, { id: 'mango', qty: 2 }];
const PRICED = priceSubscription(PACK, 'monthly');

// Subscriber details that must never come back.
const PII = {
  name: { given_name: 'Secretia', surname: 'Payerson' },
  email_address: 'secretia.payer@example.com',
  payer_id: 'PAYERID9XYZ',
  shipping_address: {
    name: { full_name: 'Secretia Payerson' },
    address: { address_line_1: '742 Hidden Lane', admin_area_2: 'Privateville', postal_code: '90210', country_code: 'US' },
  },
};

function subscription(status, overrides = {}) {
  return {
    id: SUB_ID,
    status,
    status_update_time: '2026-11-11T12:00:00Z',
    plan_id: PLAN_IDS.monthly,
    plan_overridden: true,
    custom_id: PRICED.packCode,
    quantity: '1',
    start_time: '2026-11-11T12:00:00Z',
    create_time: '2026-11-11T12:00:00Z',
    subscriber: JSON.parse(JSON.stringify(PII)),
    billing_info: {
      outstanding_balance: { currency_code: 'USD', value: '0.00' },
      next_billing_time: '2026-12-11T10:00:00Z',
      last_payment: { amount: { currency_code: 'USD', value: PRICED.total }, time: '2026-11-11T12:01:00Z' },
      failed_payments_count: 0,
    },
    plan: {
      billing_cycles: [{
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { currency_code: 'USD', value: PRICED.total } },
      }],
    },
    links: [{ href: `https://api-m.sandbox.paypal.com/v1/billing/subscriptions/${SUB_ID}`, rel: 'self', method: 'GET' }],
    ...overrides,
  };
}

// ---- fake PayPal ------------------------------------------------------------------------------

const fake = {
  sub: null,        // the subscription PayPal holds
  calls: [],        // every request: { method, path, body }
  onAction: null,   // (action, body) => Response | undefined (undefined: 204 + state change)
  onGetSub: null,   // () => Response | undefined (after the first GET of the subscription)
  getCount: 0,
};

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const NEXT_STATE = { suspend: 'SUSPENDED', activate: 'ACTIVE', cancel: 'CANCELLED' };

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const method = init.method || 'GET';
  const path = u.pathname;
  let body = init.body;
  try { body = body ? JSON.parse(body) : undefined; } catch (e) { /* form-encoded token request */ }
  fake.calls.push({ method, path, search: u.search, body });
  if (fake.network) throw new TypeError('fetch failed');

  if (method === 'POST' && path === '/v1/oauth2/token') return json(200, { access_token: 'fake-token', expires_in: 32400 });
  if (method === 'GET' && path === '/v1/catalogs/products') {
    return json(200, { products: [{ id: 'PROD-1', name: 'Slime Lime Subscription Pack' }], total_pages: 1 });
  }
  if (method === 'GET' && path === '/v1/billing/plans') {
    return json(200, {
      plans: Object.entries(PLAN_IDS).map(([c, id]) => ({ id, name: `slime-${c}`, status: 'ACTIVE' })),
      total_pages: 1,
    });
  }
  const m = /^\/v1\/billing\/subscriptions\/([^/]+)(?:\/(suspend|activate|cancel))?$/.exec(path);
  if (m && decodeURIComponent(m[1]) === SUB_ID) {
    if (method === 'GET' && !m[2]) {
      fake.getCount++;
      if (fake.getCount > 1 && fake.onGetSub) {
        const r = fake.onGetSub();
        if (r) return r;
      }
      if (fake.getStatus) return fake.getStatus();
      return json(200, fake.sub);
    }
    if (method === 'POST' && m[2]) {
      const r = fake.onAction && fake.onAction(m[2], body);
      if (r) return r;
      // What the sandbox does: an unapproved subscription can't be cancelled, and the error
      // claims it doesn't exist.
      if (m[2] === 'cancel' && fake.sub.status === 'APPROVAL_PENDING') {
        return json(404, { name: 'RESOURCE_NOT_FOUND', debug_id: 'dbg404', details: [{ issue: 'INVALID_RESOURCE_ID' }] });
      }
      fake.sub = { ...fake.sub, status: NEXT_STATE[m[2]] };
      return new Response(null, { status: 204 });
    }
  }
  return json(404, { name: 'RESOURCE_NOT_FOUND', details: [{ issue: 'INVALID_RESOURCE_ID' }] });
};

function reset(sub) {
  fake.sub = sub;
  fake.calls = [];
  fake.onAction = null;
  fake.onGetSub = null;
  fake.getStatus = null;
  fake.getCount = 0;
  fake.network = false;
}

// ---- handler driver ---------------------------------------------------------------------------

async function call(method, body) {
  const res = {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  const origError = console.error;
  console.error = process.env.DEBUG ? origError : () => {}; // sendError logs 5xx; keep the output readable.
  try {
    await handler({ method, body, headers: {} }, res);
  } finally {
    console.error = origError;
  }
  return res;
}

const sig = subsign.sign(SUB_ID);
const manage = (action, extra = {}) => call('POST', { subscriptionId: SUB_ID, sig, action, ...extra });
const actionCalls = () => fake.calls.filter((c) => c.method === 'POST' && /\/(suspend|activate|cancel)$/.test(c.path));

// ---- checks -----------------------------------------------------------------------------------

const failures = [];
let passed = 0;
function check(name, cond, detail) {
  if (cond) passed++;
  else failures.push(`${name}${detail !== undefined ? `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}

const STATUS_KEYS = ['id', 'status', 'cadence', 'nextBillingTime', 'lastPayment', 'amount', 'pack', 'priceOk'];
const NOT_LINKED = "This subscription isn't linked to this browser.";
const ENDED = 'This subscription has already ended.';
const NOT_APPROVED = "This subscription hasn't been approved in PayPal yet, so there's nothing to cancel. It won't bill unless it's approved.";
const MSG = {
  pause: 'Only an active subscription can be paused.',
  resume: 'Only a paused subscription can be resumed.',
};

// 405
for (const method of ['GET', 'PUT', 'DELETE']) {
  reset(subscription('ACTIVE'));
  const r = await call(method, undefined);
  check(`${method} -> 405`, r.statusCode === 405 && r.headers.allow === 'POST', r.statusCode);
  check(`${method} makes no PayPal call`, fake.calls.length === 0);
}

// 400: body
for (const [label, body] of [['null body', null], ['"null" string', 'null'], ['array body', []], ['bad JSON', '{oops'], ['number body', 42]]) {
  reset(subscription('ACTIVE'));
  const r = await call('POST', body);
  check(`${label} -> 400`, r.statusCode === 400, `${r.statusCode} ${JSON.stringify(r.body)}`);
  check(`${label} makes no PayPal call`, fake.calls.length === 0);
}

// 400: subscriptionId
for (const id of [undefined, '', 'I-ABC', 'I-abcdefgh', 'X-ABCDEFGH', 'I-ABCDEFG/../x', `I-${'A'.repeat(33)}`, 12345, ['I-ABCDEFGH']]) {
  reset(subscription('ACTIVE'));
  const r = await call('POST', { subscriptionId: id, sig, action: 'status' });
  check(`subscriptionId ${JSON.stringify(id)} -> 400`, r.statusCode === 400, r.statusCode);
  check(`subscriptionId ${JSON.stringify(id)} makes no PayPal call`, fake.calls.length === 0);
}

// 400: action
for (const action of [undefined, '', 'delete', 'STATUS', 'toString', '__proto__', 'constructor', 'hasOwnProperty', 1]) {
  reset(subscription('ACTIVE'));
  const r = await manage(action);
  check(`action ${JSON.stringify(action)} -> 400`, r.statusCode === 400, r.statusCode);
  check(`action ${JSON.stringify(action)} makes no PayPal call`, fake.calls.length === 0);
}

// 403: sig
const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
for (const [label, s] of [['missing sig', undefined], ['empty sig', ''], ['tampered sig', flipped], ['short sig', sig.slice(1)],
  ['sig of another id', subsign.sign('I-OTHERSUB999')], ['non-string sig', { sig }]]) {
  for (const action of ['status', 'cancel']) {
    reset(subscription('ACTIVE'));
    const r = await call('POST', { subscriptionId: SUB_ID, sig: s, action });
    check(`${label} (${action}) -> 403`, r.statusCode === 403 && r.body && r.body.error === NOT_LINKED, `${r.statusCode} ${JSON.stringify(r.body)}`);
    check(`${label} (${action}) makes no PayPal call`, fake.calls.length === 0);
  }
}

// 503: no signing secret, checked before PayPal
{
  const saved = process.env.SUB_SIGNING_SECRET;
  for (const value of [undefined, '']) {
    if (value === undefined) delete process.env.SUB_SIGNING_SECRET; else process.env.SUB_SIGNING_SECRET = value;
    for (const action of ['status', 'pause', 'cancel']) {
      reset(subscription('ACTIVE'));
      const r = await manage(action);
      check(`secret ${value === undefined ? 'unset' : 'empty'} (${action}) -> 503`, r.statusCode === 503, `${r.statusCode} ${JSON.stringify(r.body)}`);
      check(`secret ${value === undefined ? 'unset' : 'empty'} (${action}) makes no PayPal call`, fake.calls.length === 0, fake.calls);
    }
  }
  process.env.SUB_SIGNING_SECRET = saved;
}

// status: allow-list, values, no PII
{
  reset(subscription('ACTIVE'));
  const r = await manage('status');
  check('status -> 200', r.statusCode === 200, `${r.statusCode} ${JSON.stringify(r.body)}`);
  check('status sets Cache-Control: no-store', r.headers['cache-control'] === 'no-store');
  const b = r.body || {};
  check('status returns exactly the allow-listed keys', JSON.stringify(Object.keys(b).sort()) === JSON.stringify([...STATUS_KEYS].sort()), Object.keys(b));
  check('status id', b.id === SUB_ID, b.id);
  check('status status', b.status === 'ACTIVE', b.status);
  check('status cadence from plan_id', b.cadence === 'monthly', b.cadence);
  check('status nextBillingTime', b.nextBillingTime === '2026-12-11T10:00:00Z', b.nextBillingTime);
  check('status lastPayment', b.lastPayment && b.lastPayment.amount === PRICED.total && b.lastPayment.time === '2026-11-11T12:01:00Z'
    && Object.keys(b.lastPayment).length === 2, b.lastPayment);
  check('status amount', b.amount === PRICED.total, b.amount);
  check('status pack', JSON.stringify(b.pack) === JSON.stringify(PACK), b.pack);
  check('status priceOk', b.priceOk === true, b.priceOk);
  const text = JSON.stringify(b);
  for (const needle of ['subscriber', 'Secretia', 'Payerson', 'example.com', 'PAYERID9XYZ', 'Hidden Lane', 'Privateville', '90210', 'payer', 'email', 'address', 'links']) {
    check(`status does not leak "${needle}"`, !text.includes(needle), text);
  }
  check('status reads the subscription with ?fields=plan',
    fake.calls.some((c) => c.method === 'GET' && c.path === `/v1/billing/subscriptions/${SUB_ID}` && c.search === '?fields=plan'));
  check('status sends nothing to PayPal', actionCalls().length === 0);
}

// status: APPROVAL_PENDING (no payment yet, no billing times)
{
  const sub = subscription('APPROVAL_PENDING');
  delete sub.subscriber;
  sub.billing_info = undefined;
  reset(sub);
  const r = await manage('status');
  check('APPROVAL_PENDING status -> 200', r.statusCode === 200, r.statusCode);
  const b = r.body || {};
  check('APPROVAL_PENDING lastPayment null', b.lastPayment === null, b.lastPayment);
  check('APPROVAL_PENDING nextBillingTime null', b.nextBillingTime === null, b.nextBillingTime);
  check('APPROVAL_PENDING still priceOk', b.priceOk === true && b.amount === PRICED.total, b);
}

// PayPal trims trailing zeros ("21.6"); the response always shows cents.
{
  const twelve = priceSubscription([{ id: 'lemon-lime', qty: 6 }, { id: 'cherry', qty: 6 }], 'monthly');
  const trimmed = twelve.total.replace(/0+$/, '').replace(/\.$/, '');
  check('trailing-zero fixture really has a trailing zero', trimmed !== twelve.total, twelve.total);
  const sub = subscription('ACTIVE', { custom_id: twelve.packCode });
  sub.plan.billing_cycles[0].pricing_scheme.fixed_price.value = trimmed;
  sub.billing_info.last_payment.amount.value = trimmed;
  reset(sub);
  const r = await manage('status');
  check(`amount "${trimmed}" -> "${twelve.total}"`, r.statusCode === 200 && r.body.amount === twelve.total
    && r.body.lastPayment.amount === twelve.total && r.body.priceOk === true, r.body);
}

// status: someone's own price straight through the SDK
{
  const cheap = subscription('ACTIVE', {
    plan: { billing_cycles: [{ tenure_type: 'REGULAR', sequence: 1, pricing_scheme: { fixed_price: { currency_code: 'USD', value: '0.01' } } }] },
    billing_info: { next_billing_time: '2026-12-11T10:00:00Z', last_payment: { amount: { currency_code: 'USD', value: '0.01' }, time: '2026-11-11T12:01:00Z' } },
  });
  reset(cheap);
  let r = await manage('status');
  check('wrong price: status still 200', r.statusCode === 200, r.statusCode);
  check('wrong price: priceOk false', r.body && r.body.priceOk === false, r.body);
  check('wrong price: amount shows what PayPal bills', r.body && r.body.amount === '0.01', r.body);

  reset(subscription('ACTIVE', { custom_id: 'not a pack' }));
  r = await manage('status');
  check('bad custom_id: pack null, priceOk false', r.statusCode === 200 && r.body.pack === null && r.body.priceOk === false, r.body);

  reset(subscription('ACTIVE', { plan_id: 'P-SOMEONE-ELSES' }));
  r = await manage('status');
  check('foreign plan: cadence null, priceOk false', r.statusCode === 200 && r.body.cadence === null && r.body.priceOk === false, r.body);

  reset(cheap);
  r = await manage('cancel');
  check('wrong price: cancel still allowed', r.statusCode === 200 && r.body.status === 'CANCELLED' && r.body.priceOk === false, r.body);
  reset(cheap);
  r = await manage('pause');
  check('wrong price: pause still allowed', r.statusCode === 200 && r.body.status === 'SUSPENDED', r.body);
}

// 409 matrix and successful actions
const STATES = ['APPROVAL_PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'];
const EXPECT = {
  pause:  { ACTIVE: 'SUSPENDED' },
  resume: { SUSPENDED: 'ACTIVE' },
  cancel: { APPROVED: 'CANCELLED', ACTIVE: 'CANCELLED', SUSPENDED: 'CANCELLED' },
};
const PATH = { pause: 'suspend', resume: 'activate', cancel: 'cancel' };
const REASON = { pause: 'Paused by shopper via Slime Lime', resume: 'Resumed by shopper via Slime Lime', cancel: 'Cancelled by shopper via Slime Lime' };
for (const action of ['pause', 'resume', 'cancel']) {
  for (const state of STATES) {
    reset(subscription(state));
    const r = await manage(action);
    const next = EXPECT[action][state];
    const label = `${action} on ${state}`;
    if (next) {
      check(`${label} -> 200`, r.statusCode === 200, `${r.statusCode} ${JSON.stringify(r.body)}`);
      check(`${label} returns the fresh status`, r.body && r.body.status === next, r.body && r.body.status);
      check(`${label} returns the status shape`, r.body && JSON.stringify(Object.keys(r.body).sort()) === JSON.stringify([...STATUS_KEYS].sort()), r.body);
      const sent = actionCalls();
      check(`${label} calls PayPal once`, sent.length === 1 && sent[0].path === `/v1/billing/subscriptions/${SUB_ID}/${PATH[action]}`, sent);
      check(`${label} sends the reason`, sent[0] && sent[0].body && sent[0].body.reason === REASON[action]
        && Object.keys(sent[0].body).length === 1, sent[0] && sent[0].body);
      check(`${label} does not leak the subscriber`, !JSON.stringify(r.body).includes('Secretia'));
    } else if (action === 'cancel' && state === 'APPROVAL_PENDING') {
      // Allowed by us, refused by PayPal (404): a 409 that says why, not a 502.
      check(`${label} -> 409`, r.statusCode === 409, `${r.statusCode} ${JSON.stringify(r.body)}`);
      check(`${label} message`, r.body && r.body.error === NOT_APPROVED && r.body.status === 'APPROVAL_PENDING', r.body);
      check(`${label} tried PayPal once`, actionCalls().length === 1, actionCalls());
    } else {
      const want = state === 'CANCELLED' || state === 'EXPIRED' ? ENDED : MSG[action];
      check(`${label} -> 409`, r.statusCode === 409, `${r.statusCode} ${JSON.stringify(r.body)}`);
      check(`${label} message`, r.body && r.body.error === want, r.body);
      check(`${label} sends nothing to PayPal`, actionCalls().length === 0, actionCalls());
    }
  }
  // status works in every state
}
for (const state of STATES) {
  reset(subscription(state));
  const r = await manage('status');
  check(`status on ${state} -> 200`, r.statusCode === 200 && r.body.status === state, r.statusCode);
}

// PayPal 422 SUBSCRIPTION_STATUS_INVALID -> 409
const invalid = () => json(422, {
  name: 'UNPROCESSABLE_ENTITY',
  message: 'The requested action could not be performed.',
  debug_id: 'dbg123',
  details: [{ issue: 'SUBSCRIPTION_STATUS_INVALID', description: 'Invalid subscription status for suspend action.' }],
});
for (const [action, before, after, want] of [
  ['pause', 'ACTIVE', 'SUSPENDED', MSG.pause],
  ['pause', 'ACTIVE', 'CANCELLED', ENDED],
  ['resume', 'SUSPENDED', 'ACTIVE', MSG.resume],
  ['cancel', 'ACTIVE', 'CANCELLED', ENDED],
  ['cancel', 'ACTIVE', 'EXPIRED', ENDED],
  ['pause', 'ACTIVE', null, MSG.pause],     // re-read fails: fall back to the action's message
  ['pause', 'ACTIVE', 'ACTIVE', MSG.pause], // PayPal stricter than us: still a 409
]) {
  reset(subscription(before));
  fake.onAction = () => invalid();
  fake.onGetSub = () => (after ? json(200, subscription(after)) : json(500, { name: 'INTERNAL_SERVER_ERROR' }));
  const r = await manage(action);
  const label = `422 on ${action} (${before} -> ${after || 'unreadable'})`;
  check(`${label} -> 409`, r.statusCode === 409, `${r.statusCode} ${JSON.stringify(r.body)}`);
  check(`${label} message`, r.body && r.body.error === want, r.body);
  check(`${label} does not leak the subscriber`, !JSON.stringify(r.body).includes('Secretia'));
}

// Other PayPal / network failures -> 502
{
  const cases = [
    ['action 500', () => { fake.onAction = () => json(500, { name: 'INTERNAL_SERVER_ERROR', debug_id: 'dbg500' }); }, 'pause'],
    ['action 422 other issue', () => { fake.onAction = () => json(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'SOMETHING_ELSE' }] }); }, 'pause'],
    ['action 400', () => { fake.onAction = () => json(400, { name: 'INVALID_REQUEST', details: [{ issue: 'MISSING_REQUIRED_PARAMETER' }] }); }, 'cancel'],
    ['action 403', () => { fake.onAction = () => json(403, { name: 'NOT_AUTHORIZED' }); }, 'cancel'],
    ['GET 404', () => { fake.getStatus = () => json(404, { name: 'RESOURCE_NOT_FOUND', details: [{ issue: 'INVALID_RESOURCE_ID' }] }); }, 'status'],
    ['GET 500', () => { fake.getStatus = () => json(500, { name: 'INTERNAL_SERVER_ERROR' }); }, 'status'],
    ['GET wrong id', () => { fake.getStatus = () => json(200, { ...subscription('ACTIVE'), id: 'I-SOMEONEELSE1' }); }, 'status'],
    ['network down', () => { fake.network = true; }, 'status'],
  ];
  for (const [label, arrange, action] of cases) {
    reset(subscription('ACTIVE'));
    arrange();
    const r = await manage(action);
    check(`${label} -> 502`, r.statusCode === 502, `${r.statusCode} ${JSON.stringify(r.body)}`);
    check(`${label} does not leak the subscriber`, !JSON.stringify(r.body || {}).includes('Secretia'));
  }
}

// The action went through but the re-read failed: still a success, with the state it led to.
for (const [action, before, after] of [['cancel', 'ACTIVE', 'CANCELLED'], ['pause', 'ACTIVE', 'SUSPENDED'], ['resume', 'SUSPENDED', 'ACTIVE']]) {
  reset(subscription(before));
  fake.onGetSub = () => json(503, { name: 'SERVICE_UNAVAILABLE' });
  const r = await manage(action);
  const label = `${action} done, re-read fails`;
  check(`${label} -> 200 ${after}`, r.statusCode === 200 && r.body.status === after, `${r.statusCode} ${JSON.stringify(r.body)}`);
  check(`${label} keeps the status shape`, JSON.stringify(Object.keys(r.body || {}).sort()) === JSON.stringify([...STATUS_KEYS].sort()), r.body);
  check(`${label} does not leak the subscriber`, !JSON.stringify(r.body || {}).includes('Secretia'));
}

// 422 on cancelling an unapproved subscription also says it was never approved.
{
  reset(subscription('APPROVAL_PENDING'));
  fake.onAction = () => invalid();
  const r = await manage('cancel');
  check('422 on cancel of APPROVAL_PENDING -> 409 not approved', r.statusCode === 409 && r.body.error === NOT_APPROVED, r.body);
}

// ---- report -----------------------------------------------------------------------------------

if (failures.length) {
  console.error(`subscription-manage check: ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`subscription-manage check: all ${passed} checks passed.`);
