// Flavor Concierge: the AI agent behind the chat panel.
//
// The model talks to the shopper and calls three tools:
//   build_pack      picks bottles from the real lineup; priced here from catalog.js
//   start_checkout  creates the PayPal order for that pack (server prices only; sandbox unless PAYPAL_ENV=live)
//   reorder_usual   "get my usual". With a live subscription in this device's history it builds
//                   nothing and the agent offers an extra one-time pack of it (extraPack: true
//                   builds that); otherwise it rebuilds the newest past order for checkout.
//   get_order       PayPal Agent Toolkit, used to confirm an order or answer "where's my order".
//                   Only orders in this browser's own history can be looked up, and only a
//                   summary (status, amount, items) reaches the model, never payer details.
//                   With no id it returns the newest order plus the subscription's live status;
//                   an I- id reads that subscription (only ones whose sig verified, see
//                   concierge-subs.js; the sig itself never reaches the model).
//
// The model never sets a price. It only names flavor ids and quantities; every amount the
// shopper sees or pays comes from priceCart() in catalog.js.
//
// Model access, first match wins:
//   ANTHROPIC_API_KEY             Claude Haiku 5.5 (CONCIERGE_MODEL overrides the Claude model id).
//                                 If that call fails at the provider (credit, auth, rate limit,
//                                 overload, 5xx, network) and the Gemini key is set, the whole turn
//                                 runs again once on Gemini.
//   GOOGLE_GENERATIVE_AI_API_KEY  Google Gemini API directly (a free Google AI Studio key works)
//   otherwise Vercel AI Gateway: AI_GATEWAY_API_KEY, or on Vercel the function's OIDC token.
//   (AI Gateway needs a card on file on the Vercel team before it serves requests.)

const crypto = require('crypto');
const { generateText, tool, APICallError, RetryError } = require('ai');
const { createOpenAI } = require('@ai-sdk/openai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { createAnthropic } = require('@ai-sdk/anthropic');
const { z } = require('zod');
const { FLAVOR_PRICES, MAX_QTY_PER_LINE, MAX_LINES, priceCart, centsToValue } = require('./catalog');
const { createOrder, getOrder, paypalEnv } = require('./paypal');
const { browserSubscriptions, subscriptionStatusLookup, cadenceLabel, SUB_ID_RE } = require('./concierge-subs');

const DEFAULT_MODEL = 'google/gemini-3-flash';      // AI Gateway model id
const DEFAULT_GOOGLE_MODEL = 'gemini-3.8-flash';     // Gemini API model id (2.5 is closed to new keys)
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';  // Claude API model id
const TURN_BUDGET_MS = 50000;  // all model attempts for one turn; the function's maxDuration is 60 s
const FIRST_TRY_SHARE = 0.5;   // with a fallback waiting, the first model gets at most half of it
const MIN_FALLBACK_MS = 20000; // and always leaves the fallback this long
const MAX_BOTTLES = 48;      // biggest pack the concierge builds or checks out
const MAX_LINE_QTY = MAX_QTY_PER_LINE; // catalog.js per-line limit; past Fridge orders can go this high
const MAX_TURNS = 16;
const MAX_CHARS = 600;

// Tasting notes the model picks from. Facts come from the site copy (shell.jsx, flagship.jsx).
const FLAVOR_NOTES = {
  'lemon-lime': 'The original. Crisp lemon, real lime, electrolyte base. Clean, bright, least sweet-tasting of the citrus. Pick for focus and long sessions.',
  'cherry':     'Tart and crisp sour cherry, clean finish. "The dark-mode flavor", built for late-night focus runs. Tart rather than sweet.',
  'blue-rasp':  'Electric blue raspberry. Cold, sharp, iced. For people who like a sharp, cold, candy-ish hit.',
  'mango':      'Bright tropical, real mango pulp with a citrus crackle. Loud flavor, low sugar. New for 2026.',
  'grape':      'Concord grape with a twist. The sweetest and darkest of the lineup. Deep, weird, addictive. New for 2026.',
  'watermelon': 'Light and clean watermelon with a salt-rim finish. Breezy, the gentlest flavor. Pre-game or warm-up pick.',
};

const FLAVOR_IDS = Object.keys(FLAVOR_PRICES);

function lineupText() {
  return FLAVOR_IDS.map(id => {
    const f = FLAVOR_PRICES[id];
    return `- ${id}: ${f.name}, $${centsToValue(f.cents)} per bottle. ${FLAVOR_NOTES[id]}`;
  }).join('\n');
}

function historyText(history, subs = []) {
  const out = [];
  if (subs.length) {
    out.push('PayPal subscriptions started on this device, newest first (subscription id, date, cadence, pack). reorder_usual and get_order read their live status:\n'
      + subs.map(s => `- ${s.subscriptionId}, ${s.at.slice(0, 10)}: ${cadenceLabel(s.cadence) || 'cadence unknown'}, ${s.lines.map(l => `${l.qty} x ${l.id}`).join(', ') || 'pack unknown'}`).join('\n'));
  }
  if (!history.length) {
    out.push('This device has no past one-time Slime Lime orders.');
  } else {
    out.push('Past one-time orders paid on this device, newest first (order id, date, items):\n' + history.map(h => {
      const parts = h.lines.map(l => `${l.qty} x ${l.id}`);
      if (h.subBottles) parts.push(`${h.subBottles} subscription bottles`);
      return `- ${h.orderId}, ${h.at.slice(0, 10)}: ${parts.join(', ')}`;
    }).join('\n'));
  }
  return out.join('\n');
}

function moneyRule() {
  return paypalEnv() === 'live'
    ? '- This store takes real PayPal payments. Approving the order charges the shopper for real.'
    : '- This store runs on PayPal sandbox: test money only. Say so if they ask about real charges.';
}

function systemPrompt(currentPack, history, fridgeNote, openCheckout, subs = []) {
  return [
    'You are the Slime Lime Flavor Concierge, a shopping agent on the Slime Lime website.',
    'Slime Lime is a clean-formula gaming soda. Every 12 fl oz bottle has 75mg slow-release caffeine with 100mg L-theanine, 5g sugar (0g added), 35 calories and six electrolytes.',
    '',
    'The lineup (use only these flavor ids):',
    lineupText(),
    '',
    'Your job, in order:',
    '1. Learn how the shopper plays and what they like to taste. Ask at most one short question if you truly need it; otherwise pick.',
    `2. Call build_pack with a pack that fits them. Default to 12 bottles unless they ask for another size (6, 12 or 24 are common; max ${MAX_BOTTLES}). Mix 2 to 4 flavors unless they want one. The pack goes straight into their Fridge cart.`,
    '3. In one or two sentences, say why the pack fits them, using the total the tool returned. Then ask if they want to check out.',
    '4. When they say yes (or ask to buy, pay or check out), call start_checkout, then tell them to press the PayPal button below the chat to approve.',
    '5. If they tell you they paid, call get_order with that order id and confirm the status in one line.',
    '6. If they ask for "my usual", "the same as last time" or a reorder, call reorder_usual (no arguments unless they name a past order).',
    '   - If it returns hasSubscription: true, it built nothing. Do not start a checkout and never set up a second subscription. Say the returned "say" line, e.g. "Your pack already comes every month. Want an extra one-time pack of it?"',
    '   - If they then say yes to the extra pack, call reorder_usual with extraPack: true, then start_checkout, then give the total and tell them to press the PayPal button below the chat.',
    '   - If it returns a rebuilt pack instead, the shopper already asked to buy it: call start_checkout right away in the same turn, then say what is in it with the returned total and tell them to press the PayPal button below the chat.',
    '7. If they ask where their order is, what they got, or how their subscription is doing, call get_order with no id: it returns the newest order on this device and the subscription status. Answer in one or two lines from what it returns (status, items, amount, next delivery date).',
    '',
    'Rules:',
    '- Never state a price, total or discount that a tool did not return. Never invent flavors.',
    '- If they want changes, call build_pack again with the full new pack.',
    '- Earlier turns show only the text of your replies, not the tool calls behind them. Those tools did run, so trust your earlier replies and the pack and orders listed below. Never say you did not build a pack or start a checkout.',
    moneyRule(),
    '- No health or medical advice beyond the label facts above. Caffeine: suggest they check with a doctor if they are sensitive, under 18 or pregnant.',
    '- Keep every reply under 60 words, friendly, a little gamer-flavored, no markdown headings, no emoji.',
    '- If they go off topic, answer in a line and steer back to the pack.',
    '',
    historyText(history, subs),
    '',
    currentPack && currentPack.length
      ? `Current pack in their Fridge: ${currentPack.map(l => `${l.qty} x ${l.id}`).join(', ')}.`
      : (fridgeNote || 'Their Fridge has no concierge pack yet.'),
    // Set only when a model attempt already opened the order this turn and a fallback finishes it.
    openCheckout
      ? `A PayPal order (${openCheckout.orderId}, $${openCheckout.total}) is already open for this pack. Do not start another checkout unless the pack changes; tell them to press the PayPal button below the chat to approve.`
      : '',
  ].join('\n').trim();
}

// Keeps only plain text turns from the browser, trimmed. Tool calls never come from the client.
function cleanMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const turns = raw
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS);
  // Start the window on a user turn: Gemini rejects a conversation that opens with the model.
  const first = turns.findIndex(m => m.role === 'user');
  return (first < 0 ? [] : turns.slice(first)).map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
}

const bottleCount = lines => lines.reduce((s, l) => s + l.qty, 0);

// One-time flavor lines, merged by flavor. Returns null if any line is invalid: quantities are
// never silently trimmed, so what the server prices is exactly what the browser holds.
function cleanLines(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_LINES) return null;
  const merged = {};
  for (const l of raw) {
    const qty = Number(l && l.qty);
    if (!l || typeof l.id !== 'string' || !Object.prototype.hasOwnProperty.call(FLAVOR_PRICES, l.id)
      || !Number.isInteger(qty) || qty < 1 || qty > MAX_LINE_QTY) return null;
    merged[l.id] = (merged[l.id] || 0) + qty;
  }
  const lines = Object.entries(merged).map(([id, qty]) => ({ id, qty }));
  if (lines.some(l => l.qty > MAX_LINE_QTY)) return null;
  return lines;
}

// The pack the browser holds (its Fridge, minus subscription lines). The concierge only works
// with packs of up to MAX_BOTTLES in total; anything else is treated as "no pack".
function cleanPack(raw) {
  const lines = cleanLines(raw);
  if (!lines || !lines.length || bottleCount(lines) > MAX_BOTTLES) return [];
  return lines;
}

// Order history lives in the shopper's browser (localStorage); the server only re-checks it.
// It mixes { kind: 'order', orderId, ... } entries (no kind = an older 'order') with
// { kind: 'subscription', subscriptionId, sig, ... } ones. This keeps the newest 5 orders; the
// subscription entries go through browserSubscriptions() (concierge-subs.js), which checks and
// drops their sig. Past quantities are kept as paid (up to the catalog line limit); '--sub' lines
// in an old order are counted but not rebuilt by reorder_usual.
const ORDER_ID_RE = /^[A-Z0-9]{8,32}$/;
const isSubLine = l => !!l && typeof l.id === 'string' && (!!l.subscription || l.id.endsWith('--sub'));
function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).filter(h => h && h.kind !== 'subscription').slice(0, 5).map(h => {
    if (!h || typeof h.orderId !== 'string' || !ORDER_ID_RE.test(h.orderId) || !Array.isArray(h.lines)) return null;
    const lines = cleanLines(h.lines.filter(l => !isSubLine(l)));
    if (!lines) return null;
    const subBottles = h.lines.filter(isSubLine).reduce((s, l) => {
      const qty = Number(l.qty);
      return s + (Number.isInteger(qty) && qty > 0 ? Math.min(MAX_LINE_QTY, qty) : 0);
    }, 0);
    if (!lines.length && !subBottles) return null;
    const at = typeof h.at === 'string' && !isNaN(Date.parse(h.at)) ? new Date(h.at).toISOString() : new Date(0).toISOString();
    return { orderId: h.orderId, lines, subBottles, at };
  }).filter(Boolean);
}

// The browser's random per-conversation id. It keys PayPal-Request-Id so a retried
// start_checkout for the same pack returns the same PayPal order instead of a second one.
// The browser starts a new session after a payment, so the next identical pack gets a new order.
const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;
function checkoutRequestId(session, lines) {
  if (typeof session !== 'string' || !SESSION_RE.test(session)) return undefined;
  const canonical = lines.map(l => `${l.id}:${l.qty}`).sort().join(',');
  return 'sl-cc-' + crypto.createHash('sha256').update(`${session}|${canonical}`).digest('hex').slice(0, 48);
}

function packView(lines) {
  const priced = priceCart(lines);
  return {
    lines,
    bottles: lines.reduce((s, l) => s + l.qty, 0),
    total: priced.total,
    items: lines.map(l => ({
      id: l.id,
      name: FLAVOR_PRICES[l.id].name,
      qty: l.qty,
      unit: centsToValue(FLAVOR_PRICES[l.id].cents),
    })),
  };
}

// PayPal Agent Toolkit, loaded lazily so a toolkit problem never takes the chat down.
let toolkitTools = null;
function paypalToolkitTools() {
  if (toolkitTools) return toolkitTools;
  const { PayPalAgentToolkit } = require('@paypal/agent-toolkit/ai-sdk');
  const toolkit = new PayPalAgentToolkit({
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    configuration: {
      actions: { orders: { get: true } },
      context: { sandbox: paypalEnv() !== 'live' },
    },
  });
  toolkitTools = toolkit.getTools();
  return toolkitTools;
}

// Only order status and amounts go back to the model, never payer details.
function summarizeOrder(raw) {
  let o = raw;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { return { note: o.slice(0, 300) }; } }
  if (!o || typeof o !== 'object') return { note: 'No order details returned.' };
  const pu = (o.purchase_units && o.purchase_units[0]) || {};
  const capture = pu.payments && pu.payments.captures && pu.payments.captures[0];
  return {
    id: o.id,
    status: o.status,
    amount: pu.amount && pu.amount.value,
    currency: pu.amount && pu.amount.currency_code,
    items: (pu.items || []).map(i => `${i.quantity} x ${i.name}`),
    captureStatus: capture && capture.status,
  };
}

const ENDED_STATES = ['CANCELLED', 'EXPIRED'];
const itemText = lines => lines.map(l => `${l.qty} x ${FLAVOR_PRICES[l.id].name}`);

// A subscription's pack: what PayPal recorded (its custom_id) when the live read worked, else
// what this device saved. One-time lines, merged by flavor; [] when neither is usable.
function subPackLines(sub, live) {
  const fromPayPal = live && Array.isArray(live.pack) ? cleanLines(live.pack) : null;
  if (fromPayPal && fromPayPal.length) return fromPayPal;
  return cleanLines(sub.lines) || [];
}

// What the model sees about a subscription: its live status when PayPal answered, else what this
// device recorded. Built from an allow-list; never the sig, never subscriber details.
function summarizeSubscription(sub, live) {
  const lines = subPackLines(sub, live);
  if (!live) {
    return {
      id: sub.subscriptionId, status: 'unknown', delivered: cadenceLabel(sub.cadence) || undefined, items: itemText(lines),
      note: 'PayPal could not be reached just now. The subscription is set up on this device.',
    };
  }
  return {
    id: live.id,
    status: live.status,
    delivered: cadenceLabel(live.cadence) || cadenceLabel(sub.cadence) || undefined,
    items: itemText(lines),
    perDelivery: live.amount ? `$${live.amount}` : undefined,
    nextDelivery: live.nextBillingTime ? live.nextBillingTime.slice(0, 10) : undefined,
    lastPayment: live.lastPayment ? `$${live.lastPayment.amount}${live.lastPayment.time ? ` on ${live.lastPayment.time.slice(0, 10)}` : ''}` : undefined,
  };
}

const isGemini3 = id => /gemini-([3-9]|\d{2})/.test(String(id || ''));

// Gemini 3 wants a thought signature on every function call it is sent back, and @ai-sdk/google
// v1 does not keep them. Google documents a placeholder signature for that case; add it to
// function-call parts that have none, and keep thinking low so replies fit in maxTokens.
async function geminiFetch(url, init) {
  if (init && typeof init.body === 'string' && isGemini3(url)) {
    try {
      const body = JSON.parse(init.body);
      for (const c of body.contents || []) {
        for (const part of c.parts || []) {
          if (part.functionCall && !part.thoughtSignature) part.thoughtSignature = 'skip_thought_signature_validator';
        }
      }
      body.generationConfig = { ...(body.generationConfig || {}), thinkingConfig: { thinkingLevel: 'low' } };
      init = { ...init, body: JSON.stringify(body) };
    } catch (e) { /* send as is */ }
  }
  return fetch(url, init);
}

// Claude through @ai-sdk/anthropic v1, which predates Claude Haiku 5.5. Two request fixes:
// - Haiku 5.5 rejects non-default temperature / top_p / top_k, so none are sent.
// - Haiku 5.5 thinks by default. AI SDK v4 rebuilds each assistant step with its thinking first
//   and all text merged, which can reorder blocks, and Claude rejects edited thinking history.
//   Replies are short, so Haiku runs with thinking off (accepted at its default effort).
async function anthropicFetch(url, init) {
  if (init && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body);
      delete body.temperature;
      delete body.top_p;
      delete body.top_k;
      if (/haiku/.test(String(body.model || ''))) body.thinking = { type: 'disabled' };
      init = { ...init, body: JSON.stringify(body) };
    } catch (e) { /* send as is */ }
  }
  return fetch(url, init);
}

// CONCIERGE_MODEL only overrides the Claude model when it names one; a stale Gemini or Gateway
// id there must not break the primary model.
function anthropicModelId() {
  const id = String(process.env.CONCIERGE_MODEL || '').trim();
  return /^claude-/.test(id) ? id : DEFAULT_ANTHROPIC_MODEL;
}

function gatewayModel(req) {
  const apiKey = process.env.AI_GATEWAY_API_KEY
    || (req.headers && req.headers['x-vercel-oidc-token'])
    || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) {
    const err = new Error('The concierge has no AI Gateway access on this host.');
    err.status = 503;
    throw err;
  }
  const gateway = createOpenAI({ apiKey, baseURL: 'https://ai-gateway.vercel.sh/v1', compatibility: 'compatible' });
  // Gateway ids are "provider/model"; a bare Claude id meant for the Claude API is not one.
  const id = String(process.env.CONCIERGE_MODEL || '').trim();
  return gateway.chat(id.includes('/') ? id : DEFAULT_MODEL);
}

// The models to try, in order. Claude first with Gemini as its fallback; Gemini alone when there
// is no Anthropic key; the AI Gateway only when neither key is set.
function modelChain(req) {
  const chain = [];
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: anthropicFetch });
    chain.push({ name: 'anthropic', model: anthropic(anthropicModelId()) });
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY, fetch: geminiFetch });
    chain.push({ name: 'gemini', model: google(process.env.CONCIERGE_GOOGLE_MODEL || DEFAULT_GOOGLE_MODEL) });
  }
  if (!chain.length) chain.push({ name: 'gateway', model: gatewayModel(req) });
  return chain;
}

const unwrapRetry = e => (RetryError.isInstance(e) && e.lastError) || e;

// An error from the provider's HTTP API (any status, or no response at all), after the SDK's own
// retries. Tool and argument errors are not provider failures. The SDK wraps a failed fetch in
// APICallError only when it carries a cause, so a bare "fetch failed" counts too.
const isNetworkError = e => e instanceof TypeError && /fetch failed/i.test(String(e.message));
const isProviderFailure = e => RetryError.isInstance(e) || APICallError.isInstance(unwrapRetry(e)) || isNetworkError(e);

// Status and error type only, safe to log: never the message, body or headers.
function failureInfo(e) {
  const err = unwrapRetry(e);
  const status = (err && Number(err.statusCode)) || undefined;
  const data = err && err.data && err.data.error;
  // Anthropic: { error: { type } }. Gemini: { error: { status } }.
  let type = data && (data.type || data.status);
  if (!type) type = (APICallError.isInstance(err) && !status) || isNetworkError(err) ? 'network' : (err && err.name) || 'error';
  return { status, type: String(type).replace(/[^\w.-]/g, '').slice(0, 40) };
}

const NOT_ON_RE = /credit|api[ -]?key|unauthori[sz]ed|forbidden|permission|quota|billing/i;

// Turns "the AI provider refused" (or timed out) into a clear 503 the panel can show. `failures`
// lists what each model in the chain hit ("anthropic 429 rate_limit_error"), for the server log.
function providerError(e, failures = []) {
  const err = unwrapRetry(e);
  const msg = String((err && err.message) || '');
  const { status, type } = failureInfo(e);
  const detail = failures.join('; ');
  if (NOT_ON_RE.test(msg) || [401, 402, 403].includes(status) || /authentication|permission|billing/.test(type)) {
    const out = new Error('The concierge AI is not switched on for this site yet.');
    out.status = 503;
    out.detail = detail;
    return out;
  }
  if (isProviderFailure(e) || type === 'TimeoutError') {
    const out = new Error('The concierge is busy right now. Try again in a minute.');
    out.status = 503;
    out.detail = detail;
    return out;
  }
  return e;
}

async function runConcierge(req, body, opts = {}) {
  const messages = cleanMessages(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    const err = new Error('Send a message first.');
    err.status = 400;
    throw err;
  }

  const initialPack = cleanPack(body.pack);
  const fridgeLines = cleanLines(body.pack);
  const fridgeNote = !initialPack.length && fridgeLines && bottleCount(fridgeLines) > MAX_BOTTLES
    ? `Their Fridge holds ${bottleCount(fridgeLines)} bottles, over the ${MAX_BOTTLES}-bottle concierge limit. They can pay for it from the Fridge, or you can build a new pack.`
    : '';
  const history = cleanHistory(body.history);
  // Subscriptions whose sig verified, with the sig already dropped. Live status is read at most
  // once per turn, and only when a tool needs it.
  const subs = browserSubscriptions(body);
  const subStatus = subscriptionStatusLookup();
  const env = paypalEnv();

  // Turn state lives here, outside any one model attempt. If Claude fails partway and the turn
  // runs again on Gemini, the retry starts from what Claude's tools already did: the system
  // prompt shows the pack it built and any PayPal order it opened, so Gemini can just finish the
  // reply. The response has one pack and at most one checkout. A checkout repeated for the same
  // pack sends the same PayPal-Request-Id, so PayPal returns the order that already exists.
  let pack = initialPack.map(l => ({ ...l }));
  // get_order may only look up orders this browser paid for, or one created in this request.
  const allowedOrders = new Set(history.map(h => h.orderId));
  let packChanged = false;
  let packVersion = 0;
  let checkout = null;

  // The model can call several tools in one step and the SDK runs them concurrently. Queue them
  // so each one sees the pack the previous one left, in the order the model asked for them.
  // A tool that throws (PayPal down, bad pack) would end the whole turn in the AI SDK, so
  // failures go back to the model as { error } and it can tell the shopper.
  // Every tool call this turn, across model attempts (the panel shows them as activity).
  const toolsUsed = [];
  let queue = Promise.resolve();
  const serial = (name, fn) => (...args) => {
    toolsUsed.push(name);
    const run = queue.then(() => fn(...args)).catch(e => {
      console.error(`[concierge] ${name} failed:`, e && e.message, (e && e.paypal) || '');
      return { error: name === 'start_checkout'
        ? 'PayPal could not create the order right now. Ask them to try again in a moment.'
        : 'That did not work. Try a different pack.' };
    });
    queue = run;
    return run;
  };
  const setPack = lines => {
    pack = lines;
    packVersion += 1;
    packChanged = true;
    checkout = null;
  };

  const lineSchema = z.object({
    flavorId: z.enum(FLAVOR_IDS),
    qty: z.number().int().min(1).max(MAX_BOTTLES),
  });

  const tools = {
    build_pack: tool({
      description: 'Put a flavor pack in the shopper\'s Fridge cart. Replaces any earlier concierge pack. Returns the server-priced total.',
      parameters: z.object({
        items: z.array(lineSchema).min(1).max(6).describe('One entry per flavor.'),
      }),
      execute: serial('build_pack', async ({ items }) => {
        const lines = cleanLines(items.map(i => ({ id: i.flavorId, qty: i.qty })));
        if (!lines || !lines.length) return { error: 'That pack has an unknown flavor or quantity.' };
        if (bottleCount(lines) > MAX_BOTTLES) return { error: `Packs top out at ${MAX_BOTTLES} bottles. Pick fewer.` };
        setPack(lines);
        const view = packView(lines);
        return { bottles: view.bottles, total: `$${view.total}`, items: view.items.map(i => `${i.qty} x ${i.name} at $${i.unit}`) };
      }),
    }),
    reorder_usual: tool({
      description: 'The shopper\'s "usual". If this device has a live subscription it builds nothing and returns hasSubscription: true with the pack, cadence and a line to say; call it again with extraPack: true once they want an extra one-time pack of it. Otherwise it puts their newest past one-time order (or the one named) back in their Fridge cart, priced at today\'s catalog prices.',
      parameters: z.object({
        orderId: z.string().optional().describe('A past order id from the history. Omit for the usual.'),
        extraPack: z.boolean().optional().describe('true only after the shopper said yes to an extra one-time pack of their subscription.'),
      }),
      execute: serial('reorder_usual', async ({ orderId, extraPack }) => {
        const named = orderId ? String(orderId).trim().toUpperCase() : '';
        const sub = named ? subs.find(s => s.subscriptionId === named) : subs[0];
        if (named && SUB_ID_RE.test(named) && !sub) {
          return { error: `Subscription ${named} is not linked to this device.` };
        }
        if (sub) {
          const live = await subStatus(sub.subscriptionId);
          const lines = subPackLines(sub, live);
          const bottles = bottleCount(lines);
          const tooBig = { error: `That pack has ${bottles} bottles, more than the ${MAX_BOTTLES}-bottle concierge limit. Offer to build a smaller one-time pack.` };
          // Puts the subscription's pack in the Fridge as a one-time pack, at one-time prices.
          const rebuild = extra => {
            if (!lines.length) return { error: 'The subscription\'s pack could not be read. Offer to build a one-time pack with build_pack instead.' };
            if (bottles > MAX_BOTTLES) return tooBig;
            setPack(lines.map(l => ({ ...l })));
            const view = packView(pack);
            return { ...extra, oneTime: true, bottles: view.bottles, total: `$${view.total}`, items: view.items.map(i => `${i.qty} x ${i.name} at $${i.unit}`) };
          };
          const ended = !!live && ENDED_STATES.includes(live.status);
          if (!ended) {
            // A live (or unreadable) subscription: never a second one. Offer, or build, an extra
            // one-time pack of the same flavors.
            if (extraPack) {
              return rebuild({ extraPackOf: sub.subscriptionId, note: 'A one-time order on top of the subscription. The subscription itself is unchanged.' });
            }
            const cadence = (live && live.cadence) || sub.cadence;
            const label = cadenceLabel(cadence);
            const offer = 'Want an extra one-time pack of it?';
            let say = `Your pack already comes ${label || 'on a schedule'}. ${offer}`;
            if (!live) say = `I can see your subscription${label ? ` (it comes ${label})` : ''}, but couldn't reach PayPal to check it just now. ${offer}`;
            else if (live.status === 'SUSPENDED') say = `Your subscription is paused right now${label ? ` (it normally comes ${label})` : ''}. ${offer}`;
            return {
              hasSubscription: true,
              subscriptionId: sub.subscriptionId,
              status: live ? live.status : 'unknown (PayPal not reachable)',
              cadence,
              pack: itemText(lines),
              bottles,
              extraPackTotal: lines.length && bottles <= MAX_BOTTLES ? `$${packView(lines).total}` : undefined,
              say,
            };
          }
          // The subscription has ended. With no one-time orders (or when they named it), its pack
          // is the usual, rebuilt as a one-time pack.
          if (named || !history.length) {
            return rebuild({ fromSubscription: sub.subscriptionId, subscriptionStatus: live.status,
              note: 'That subscription has ended, so this is the same pack as a one-time order.' });
          }
        }
        if (!history.length) return { error: 'No past orders on this device. Build a new pack instead.' };
        const past = named ? history.find(h => h.orderId === named) : history[0];
        if (!past) return { error: `Order ${orderId} is not in this device's history. Ask which past order they mean.` };
        if (!past.lines.length) {
          return { error: 'That order was a subscription only. Subscriptions are set up on the Subscribe page, not here.' };
        }
        const bottles = bottleCount(past.lines);
        if (bottles > MAX_BOTTLES) {
          return { error: `That order had ${bottles} bottles, more than the ${MAX_BOTTLES}-bottle concierge limit. Offer to build a smaller pack, or they can rebuild it in the Fridge.` };
        }
        setPack(past.lines.map(l => ({ ...l })));
        const view = packView(pack);
        return { fromOrder: past.orderId, orderedOn: past.at.slice(0, 10), bottles: view.bottles, total: `$${view.total}`,
          items: view.items.map(i => `${i.qty} x ${i.name} at $${i.unit}`),
          note: past.subBottles ? `Not included: the ${past.subBottles} subscription bottles from that order.` : undefined };
      }),
    }),
    start_checkout: tool({
      description: `Create the PayPal ${env === 'live' ? '' : 'sandbox '}order for the current pack. Call only after the shopper agrees to buy (asking for their usual, or saying yes to an extra pack, counts). Returns the order id and total.`,
      parameters: z.object({}),
      execute: serial('start_checkout', async () => {
        if (!pack.length) return { error: 'There is no pack yet. Call build_pack first.' };
        const lines = pack.map(l => ({ ...l }));
        const version = packVersion;
        const priced = priceCart(lines);
        const order = await createOrder(priced, checkoutRequestId(body.session, lines));
        if (version !== packVersion) return { error: 'The pack changed while checking out. Call start_checkout again.' };
        allowedOrders.add(order.id);
        checkout = { orderId: order.id, total: priced.total, lines, env };
        return { orderId: order.id, total: `$${priced.total}`, next: 'Shopper presses the PayPal button under the chat to approve.' };
      }),
    }),
  };

  // get_order from PayPal Agent Toolkit, wrapped so payer details stay out of the model's context.
  // If the toolkit fails to load, the same lookup goes straight to the Orders API.
  let tk = null;
  try {
    tk = paypalToolkitTools().get_order || null;
  } catch (e) {
    console.error('[concierge] PayPal Agent Toolkit unavailable:', e.message);
  }
  tools.get_order = tool({
    description: `${String((tk && tk.description) || 'Retrieves the order details from PayPal for a given order ID.').trim()}\nOnly orders from this device's order history, or a checkout you just created, can be looked up. Omit the id for "where's my order": it returns the newest order on this device and the live status of the shopper's subscription, if any. A subscription id (I-...) from the history returns that subscription's status.`,
    parameters: z.object({ id: z.string().optional().describe('The PayPal order id, or a subscription id (I-...). Omit for the newest order plus the subscription status.') }),
    execute: async ({ id }, toolOpts) => {
      toolsUsed.push('get_order');
      const lookupOrder = async orderId => {
        try { return summarizeOrder(tk ? await tk.execute({ id: orderId }, toolOpts) : await getOrder(orderId)); }
        catch (e) { return { id: orderId, error: 'Could not look that order up right now.' }; }
      };
      const lookupSub = async sub => summarizeSubscription(sub, await subStatus(sub.subscriptionId));
      const wanted = String(id || '').trim().toUpperCase();
      if (!wanted) {
        if (!history.length && !subs.length) return { error: 'There are no orders or subscriptions on this device yet.' };
        const newest = history[0];
        const [order, subscription] = await Promise.all([
          newest ? lookupOrder(newest.orderId).then(o => ({ ...o, orderedOn: newest.at.slice(0, 10) })) : null,
          subs[0] ? lookupSub(subs[0]) : null,
        ]);
        return { order: order || 'No one-time orders on this device.', subscription: subscription || 'No subscription on this device.' };
      }
      if (SUB_ID_RE.test(wanted)) {
        const sub = subs.find(s => s.subscriptionId === wanted);
        if (!sub) return { error: 'That subscription is not linked to this device, so it cannot be looked up here.' };
        return { subscription: await lookupSub(sub) };
      }
      if (!allowedOrders.has(wanted)) {
        return { error: 'That order is not in this device\'s order history, so it cannot be looked up here.' };
      }
      const order = await lookupOrder(wanted);
      return order.error ? { error: order.error } : order;
    },
  });

  // Tests inject models with opts.models ([{ name, model }]) or opts.model.
  const chain = opts.models || (opts.model ? [{ name: opts.modelName || 'gateway', model: opts.model }] : modelChain(req));
  if (!chain.length) {
    const err = new Error('The concierge AI is not switched on for this site yet.');
    err.status = 503;
    throw err;
  }
  // Keep the whole chain inside the function's 60 s limit (vercel.json), so a slow or hung
  // provider ends in the friendly 503 instead of a platform timeout.
  const deadline = Date.now() + (opts.budgetMs || TURN_BUDGET_MS);
  const failures = [];
  for (let i = 0; i < chain.length; i++) {
    const { name, model } = chain[i];
    const next = chain[i + 1];
    const provider = String(model.provider || '');
    const isClaude = provider.startsWith('anthropic') || /claude/i.test(String(model.modelId || ''));
    const left = deadline - Date.now();
    const budget = Math.max(1000, next ? Math.min(left * FIRST_TRY_SHARE, left - MIN_FALLBACK_MS) : left);
    const timeout = AbortSignal.timeout(budget);
    try {
      const result = await generateText({
        model,
        system: systemPrompt(pack, history, fridgeNote, checkout, subs),
        messages,
        tools,
        maxSteps: 5,
        maxTokens: 700, // DAR-693 cost cap, with maxSteps 5
        // With a fallback waiting, retry Claude once (429 / 5xx / overloaded), not twice.
        maxRetries: next ? 1 : 2,
        abortSignal: timeout,
        // Claude Haiku 5.5 rejects non-default sampling settings.
        temperature: isClaude ? undefined : 0.6,
        // Gemini 2.5 counts thinking against maxTokens too (Gemini 3 is handled in geminiFetch).
        // Google-only, so it is never sent to another provider.
        providerOptions: provider.startsWith('google') && /gemini-2\.5/.test(String(model.modelId || ''))
          ? { google: { thinkingConfig: { thinkingBudget: 256 } } }
          : undefined,
      });
      return {
        reply: (result.text || '').trim() || (checkout ? 'Order ready. Press the PayPal button below to approve.' : 'Done. Check your Fridge.'),
        pack: packChanged && pack.length ? packView(pack) : null,
        checkout,
        toolsUsed,
        model: name,
      };
    } catch (e) {
      // Let any tool still running finish before the next model sees the state.
      await queue.catch(() => {});
      const err = timeout.aborted && !isProviderFailure(e) ? Object.assign(new Error('timed out'), { name: 'TimeoutError' }) : e;
      const info = failureInfo(err);
      failures.push(`${name} ${info.status || '-'} ${info.type}`);
      console.error(`[concierge] ${name} failed: ${info.status || 'no status'} ${info.type}${next ? `; retrying once on ${next.name}` : ''}`);
      if (!next) throw providerError(err, failures);
    }
  }
}

module.exports = {
  runConcierge, FLAVOR_NOTES, cleanMessages, cleanLines, cleanPack, cleanHistory, checkoutRequestId,
  modelChain, providerError, isProviderFailure, failureInfo,
};
