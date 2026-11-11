// The shopper's PayPal subscriptions, as the concierge sees them.
//
// The browser keeps each approved subscription in localStorage['sl-orders'] as
//   { kind: 'subscription', subscriptionId: 'I-…', sig, cadence, at, lines: [{ id, qty }] }
// and sends those entries with every chat request, inside body.history. `sig` is the HMAC that
// POST /api/paypal/subscriptions handed out with the id (see subsign.js); it is what links a
// subscription to this browser.
//
// browserSubscriptions(body) is the one place the concierge reads them:
//   - an entry is kept only if subsign.verify(subscriptionId, sig) passes; a missing or tampered
//     sig drops it quietly (as does a server without SUB_SIGNING_SECRET);
//   - the sig is checked and then dropped. Nothing returned from here carries it, so it can never
//     reach the model's prompt, a tool result or a log line;
//   - at most MAX_SUBS entries, newest first, one per subscription id.
// A verified id is safe to read or manage server-side with the store's own PayPal credentials.
//
// subscriptionStatusLookup() returns a per-turn, memoized live status reader built on the same
// allow-listed status object as POST /api/paypal/subscription-manage (no subscriber details).

const subsign = require('./subsign');
const { FLAVOR_PRICES, CADENCES, MAX_QTY_PER_LINE, MAX_LINES } = require('./catalog');

const SUB_ID_RE = /^I-[A-Z0-9]{6,32}$/;   // same shape the manage endpoint accepts
const MAX_SUBS = 5;
const MAX_SCAN = 20;                     // history entries looked at, of both kinds
const STATUS_TIMEOUT_MS = 8000;          // one live status read; the whole turn has 50 s

const has = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);

// Plain flavor lines ('--sub' suffix tolerated), or null if any line is invalid.
function subLines(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_LINES) return null;
  const lines = [];
  for (const l of raw) {
    const id = l && typeof l.id === 'string' ? l.id.replace(/--sub$/, '') : null;
    const qty = Number(l && l.qty);
    if (!has(FLAVOR_PRICES, id) || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) return null;
    lines.push({ id, qty });
  }
  return lines;
}

function browserSubscriptions(body) {
  const raw = body && Array.isArray(body.history) ? body.history.slice(0, MAX_SCAN) : [];
  const seen = new Set();
  const out = [];
  for (const h of raw) {
    if (out.length >= MAX_SUBS) break;
    if (!h || h.kind !== 'subscription') continue;
    const id = h.subscriptionId;
    if (typeof id !== 'string' || !SUB_ID_RE.test(id) || seen.has(id)) continue;
    if (!subsign.verify(id, h.sig)) continue;
    seen.add(id);
    out.push({
      subscriptionId: id,
      cadence: has(CADENCES, h.cadence) ? h.cadence : null,
      lines: subLines(h.lines) || [],
      at: typeof h.at === 'string' && !isNaN(Date.parse(h.at)) ? new Date(h.at).toISOString() : new Date(0).toISOString(),
    });
  }
  return out;
}

// 'monthly' -> 'every month'.
const cadenceLabel = c => (has(CADENCES, c) ? CADENCES[c].label : null);

// A live status reader for one chat turn. Each id is fetched from PayPal at most once per turn
// (so a fallback model retry reuses it). Resolves the manage endpoint's status object
//   { id, status, cadence, nextBillingTime, lastPayment, amount, pack, priceOk }
// or null when PayPal cannot be reached. Only call it with ids from browserSubscriptions().
function subscriptionStatusLookup({ timeoutMs = STATUS_TIMEOUT_MS } = {}) {
  const cache = new Map();
  return id => {
    if (!cache.has(id)) {
      let timer;
      const read = Promise.resolve().then(() => {
        // Loaded here, inside the promise, so a load problem is just "no status", never a crash.
        const { fetchStatus, toStatus } = require('../paypal/subscription-manage');
        return fetchStatus(id).then(cur => toStatus(cur.subscription, cur.planIds, cur.check));
      });
      // A slow PayPal must not hold the tool queue (and the model fallback) past the turn budget.
      const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), timeoutMs); });
      cache.set(id, Promise.race([read, late])
        .catch(e => {
          console.error('[concierge] subscription status failed:', (e && e.status) || '', e && e.message);
          return null;
        })
        .finally(() => clearTimeout(timer)));
    }
    return cache.get(id);
  };
}

module.exports = { browserSubscriptions, subscriptionStatusLookup, cadenceLabel, SUB_ID_RE };
