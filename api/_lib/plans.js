// Auto-provisions the PayPal catalog product and one billing plan per subscription cadence.
// Nobody copies plan IDs into env vars: the first call on a cold instance looks them up by name
// (creating anything missing), and the result is cached on the warm instance.
//
// Safe to call concurrently and repeatedly:
//   - lookups go first, matched by name, so a second call creates nothing;
//   - every create sends a stable PayPal-Request-Id, so two cold starts racing past the lookup
//     get the same product/plan back from PayPal instead of making duplicates.
// Lookups match by name, so if the plan shape changes, rename the plans in PLAN_SPECS and bump
// PROVISION_VERSION (new names and new request IDs) instead of editing them in place.

const { CADENCES } = require('./catalog');
const { paypalFetch, paypalGet } = require('./paypal');

const PROVISION_VERSION = 'v1';
const PRODUCT_NAME = 'Slime Lime Subscription Pack';
const PAGE_SIZE = 20; // PayPal's maximum for list endpoints.
const MAX_PAGES = 50; // 1,000 items; far beyond this account. Past it we refuse rather than guess.
const CACHE_MS = 15 * 60 * 1000; // Re-check PayPal now and then, in case a plan was changed by hand.

// Billing frequency per cadence id. Keys must match CADENCES in catalog.js.
const PLAN_SPECS = {
  biweekly:  { name: 'slime-biweekly',  interval_unit: 'WEEK',  interval_count: 2 },
  monthly:   { name: 'slime-monthly',   interval_unit: 'MONTH', interval_count: 1 },
  quarterly: { name: 'slime-quarterly', interval_unit: 'MONTH', interval_count: 3 },
};

// Placeholder per-cycle price. The real pack price must be set by the server on each subscription
// it creates (plan override); this only applies if a subscription is created without one.
const PLACEHOLDER_PRICE = '10.00';

for (const id of Object.keys(CADENCES)) {
  if (!PLAN_SPECS[id]) throw new Error(`plans.js: no billing plan spec for cadence "${id}".`);
}

// Walks a paginated PayPal list endpoint and returns every item under `key`.
async function listAll(basePath, key) {
  const items = [];
  const sep = basePath.includes('?') ? '&' : '?';
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await paypalGet(`${basePath}${sep}page_size=${PAGE_SIZE}&page=${page}&total_required=true`);
    const batch = Array.isArray(data[key]) ? data[key] : [];
    items.push(...batch);
    const totalPages = Number(data.total_pages) || 0;
    if (batch.length < PAGE_SIZE || (totalPages && page >= totalPages)) return items;
  }
  // A partial list could hide the existing product/plan and cause a duplicate create.
  const err = new Error(`Too many PayPal ${key} to scan (over ${MAX_PAGES * PAGE_SIZE}).`);
  err.status = 500;
  throw err;
}

async function ensureProduct() {
  const products = await listAll('/v1/catalogs/products', 'products');
  const found = products.find((p) => p.name === PRODUCT_NAME);
  if (found) return found.id;
  const created = await paypalFetch('/v1/catalogs/products', {
    name: PRODUCT_NAME,
    description: 'Recurring Slime Lime soda deliveries.',
    type: 'PHYSICAL',
    category: 'FOOD_RETAIL_AND_SERVICE',
  }, `slime-product-${PROVISION_VERSION}`);
  return created.id;
}

function planBody(productId, cadenceId, spec) {
  return {
    product_id: productId,
    name: spec.name,
    description: `Slime Lime soda pack, delivered ${CADENCES[cadenceId].label}.`,
    status: 'ACTIVE',
    billing_cycles: [{
      frequency: { interval_unit: spec.interval_unit, interval_count: spec.interval_count },
      tenure_type: 'REGULAR',
      sequence: 1,
      total_cycles: 0, // Infinite: bills until cancelled.
      pricing_scheme: { fixed_price: { value: PLACEHOLDER_PRICE, currency_code: 'USD' } },
    }],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
  };
}

async function planStatus(planId) {
  const plan = await paypalGet(`/v1/billing/plans/${encodeURIComponent(planId)}`);
  return plan.status;
}

// Activates a plan. If PayPal refuses (e.g. another instance activated it a moment ago),
// re-read the plan and accept it when it is ACTIVE after all.
async function activate(planId) {
  try {
    await paypalFetch(`/v1/billing/plans/${encodeURIComponent(planId)}/activate`);
  } catch (err) {
    if (err.status !== 422 || (await planStatus(planId)) !== 'ACTIVE') throw err;
  }
  return { id: planId, status: 'ACTIVE' };
}

async function ensurePlan(productId, cadenceId, existing) {
  const spec = PLAN_SPECS[cadenceId];
  const matches = existing.filter((p) => p.name === spec.name);
  const active = matches.find((p) => p.status === 'ACTIVE');
  if (active) return { id: active.id, status: active.status };
  const revivable = matches.find((p) => p.status === 'INACTIVE' || p.status === 'CREATED');
  if (revivable) return activate(revivable.id);

  const created = await paypalFetch('/v1/billing/plans', planBody(productId, cadenceId, spec),
    `slime-plan-${cadenceId}-${PROVISION_VERSION}`);
  // A replayed request ID returns PayPal's original response, whose status may be stale
  // (the plan could have been renamed or deactivated since), so read the live status.
  const status = await planStatus(created.id);
  if (status !== 'ACTIVE') return activate(created.id);
  return { id: created.id, status };
}

async function provision() {
  const productId = await ensureProduct();
  const existing = await listAll(`/v1/billing/plans?product_id=${encodeURIComponent(productId)}`, 'plans');
  const cadenceIds = Object.keys(CADENCES);
  const results = await Promise.all(cadenceIds.map((id) => ensurePlan(productId, id, existing)));
  const plans = {};
  cadenceIds.forEach((id, i) => { plans[id] = results[i]; });
  return { productId, plans };
}

// One in-flight/settled provisioning per warm instance. Failures are not cached.
let pending = null; // { promise, expiresAt }

// Returns { productId, plans: { <cadence>: { id, status } } }.
function ensurePlanRecords() {
  if (!pending || Date.now() >= pending.expiresAt) {
    const entry = { expiresAt: Infinity };
    entry.promise = provision().then(
      (result) => { entry.expiresAt = Date.now() + CACHE_MS; return result; },
      (err) => { if (pending === entry) pending = null; throw err; },
    );
    pending = entry;
  }
  return pending.promise;
}

// Returns { biweekly, monthly, quarterly } -> PayPal plan ID.
async function ensurePlans() {
  const { plans } = await ensurePlanRecords();
  const ids = {};
  for (const [cadenceId, plan] of Object.entries(plans)) ids[cadenceId] = plan.id;
  return ids;
}

module.exports = { ensurePlans, ensurePlanRecords };
