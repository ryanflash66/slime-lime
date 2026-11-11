// Flavor Concierge: the AI agent behind the chat panel.
//
// The model talks to the shopper and calls three tools:
//   build_pack      picks bottles from the real lineup; priced here from catalog.js
//   start_checkout  creates the PayPal order for that pack (server prices only; sandbox unless PAYPAL_ENV=live)
//   reorder_usual   rebuilds a past order from this device's order history ("get my usual")
//   get_order       PayPal Agent Toolkit, used to confirm an order or answer "where's my order".
//                   Only orders in this browser's own history can be looked up, and only a
//                   summary (status, amount, items) reaches the model, never payer details.
//
// The model never sets a price. It only names flavor ids and quantities; every amount the
// shopper sees or pays comes from priceCart() in catalog.js.
//
// Model access, first match wins:
//   GOOGLE_GENERATIVE_AI_API_KEY  Google Gemini API directly (a free Google AI Studio key works)
//   otherwise Vercel AI Gateway: AI_GATEWAY_API_KEY, or on Vercel the function's OIDC token.
//   (AI Gateway needs a card on file on the Vercel team before it serves requests.)

const crypto = require('crypto');
const { generateText, tool } = require('ai');
const { createOpenAI } = require('@ai-sdk/openai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { z } = require('zod');
const { FLAVOR_PRICES, MAX_QTY_PER_LINE, MAX_LINES, priceCart, centsToValue } = require('./catalog');
const { createOrder, getOrder, paypalEnv } = require('./paypal');

const DEFAULT_MODEL = 'google/gemini-3-flash';      // AI Gateway model id
const DEFAULT_GOOGLE_MODEL = 'gemini-2.5-flash';     // Gemini API model id
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

function historyText(history) {
  if (!history.length) return 'This device has no past Slime Lime orders.';
  return 'Past orders paid on this device, newest first (order id, date, items):\n' + history.map(h => {
    const parts = h.lines.map(l => `${l.qty} x ${l.id}`);
    if (h.subBottles) parts.push(`${h.subBottles} subscription bottles`);
    return `- ${h.orderId}, ${h.at.slice(0, 10)}: ${parts.join(', ')}`;
  }).join('\n');
}

function moneyRule() {
  return paypalEnv() === 'live'
    ? '- This store takes real PayPal payments. Approving the order charges the shopper for real.'
    : '- This store runs on PayPal sandbox: test money only. Say so if they ask about real charges.';
}

function systemPrompt(currentPack, history, fridgeNote) {
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
    '6. If they ask for "my usual", "the same as last time" or a reorder, call reorder_usual (newest order unless they name another), say what is in it with the returned total, then ask to check out. If they ask where an order is or what they got, use the history below and get_order.',
    '',
    'Rules:',
    '- Never state a price, total or discount that a tool did not return. Never invent flavors.',
    '- If they want changes, call build_pack again with the full new pack.',
    moneyRule(),
    '- No health or medical advice beyond the label facts above. Caffeine: suggest they check with a doctor if they are sensitive, under 18 or pregnant.',
    '- Keep every reply under 60 words, friendly, a little gamer-flavored, no markdown headings, no emoji.',
    '- If they go off topic, answer in a line and steer back to the pack.',
    '',
    historyText(history),
    '',
    currentPack && currentPack.length
      ? `Current pack in their Fridge: ${currentPack.map(l => `${l.qty} x ${l.id}`).join(', ')}.`
      : (fridgeNote || 'Their Fridge has no concierge pack yet.'),
  ].join('\n');
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
// Past quantities are kept as paid (up to the catalog line limit); subscription lines are
// counted but not rebuilt by reorder_usual.
const ORDER_ID_RE = /^[A-Z0-9]{8,32}$/;
const isSubLine = l => !!l && typeof l.id === 'string' && (!!l.subscription || l.id.endsWith('--sub'));
function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map(h => {
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

function gatewayModel(req) {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
    return google(process.env.CONCIERGE_GOOGLE_MODEL || DEFAULT_GOOGLE_MODEL);
  }
  const apiKey = process.env.AI_GATEWAY_API_KEY
    || (req.headers && req.headers['x-vercel-oidc-token'])
    || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) {
    const err = new Error('The concierge has no AI Gateway access on this host.');
    err.status = 503;
    throw err;
  }
  const gateway = createOpenAI({ apiKey, baseURL: 'https://ai-gateway.vercel.sh/v1', compatibility: 'compatible' });
  return gateway.chat(process.env.CONCIERGE_MODEL || DEFAULT_MODEL);
}

// Turns "the AI provider refused" into a clear 503 the panel can show.
function providerError(e) {
  const msg = String((e && e.message) || '');
  if (/credit card|api key|unauthori[sz]ed|forbidden|permission|quota|billing/i.test(msg)) {
    const err = new Error('The concierge AI is not switched on for this site yet.');
    err.status = 503;
    err.detail = msg.slice(0, 300);
    return err;
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

  let pack = cleanPack(body.pack);
  const fridgeLines = cleanLines(body.pack);
  const fridgeNote = !pack.length && fridgeLines && bottleCount(fridgeLines) > MAX_BOTTLES
    ? `Their Fridge holds ${bottleCount(fridgeLines)} bottles, over the ${MAX_BOTTLES}-bottle concierge limit. They can pay for it from the Fridge, or you can build a new pack.`
    : '';
  const history = cleanHistory(body.history);
  const env = paypalEnv();
  // get_order may only look up orders this browser paid for, or one created in this request.
  const allowedOrders = new Set(history.map(h => h.orderId));
  let packChanged = false;
  let packVersion = 0;
  let checkout = null;

  // The model can call several tools in one step and the SDK runs them concurrently. Queue them
  // so each one sees the pack the previous one left, in the order the model asked for them.
  // A tool that throws (PayPal down, bad pack) would end the whole turn in the AI SDK, so
  // failures go back to the model as { error } and it can tell the shopper.
  let queue = Promise.resolve();
  const serial = (name, fn) => (...args) => {
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
      description: 'Put one of the shopper\'s past orders (from this device) back in their Fridge cart, priced at today\'s catalog prices. Defaults to the newest order.',
      parameters: z.object({
        orderId: z.string().optional().describe('A past order id from the history. Omit for the newest.'),
      }),
      execute: serial('reorder_usual', async ({ orderId }) => {
        if (!history.length) return { error: 'No past orders on this device. Build a new pack instead.' };
        const past = orderId ? history.find(h => h.orderId === orderId) : history[0];
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
      description: `Create the PayPal ${env === 'live' ? '' : 'sandbox '}order for the current pack. Call only after the shopper agrees to buy. Returns the order id and total.`,
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
    description: `${String((tk && tk.description) || 'Retrieves the order details from PayPal for a given order ID.').trim()}\nOnly orders from this device's order history, or a checkout you just created, can be looked up.`,
    parameters: z.object({ id: z.string().describe('The PayPal order id.') }),
    execute: async ({ id }, opts) => {
      const orderId = String(id || '').trim().toUpperCase();
      if (!allowedOrders.has(orderId)) {
        return { error: 'That order is not in this device\'s order history, so it cannot be looked up here.' };
      }
      try { return summarizeOrder(tk ? await tk.execute({ id: orderId }, opts) : await getOrder(orderId)); }
      catch (e) { return { error: 'Could not look that order up right now.' }; }
    },
  });

  let result;
  try {
    const model = opts.model || gatewayModel(req);
    result = await generateText({
    model,
    system: systemPrompt(pack, history, fridgeNote),
    messages,
    tools,
    maxSteps: 5,
    maxTokens: 1000,
    temperature: 0.6,
    // Gemini 2.5+ counts thinking tokens against maxTokens; keep thinking small so replies fit.
    providerOptions: /gemini-(2\.5|[3-9])/.test(String(model.modelId || ''))
      ? { google: { thinkingConfig: { thinkingBudget: 256 } } }
      : undefined,
    });
  } catch (e) {
    throw providerError(e);
  }

  const toolsUsed = result.steps.flatMap(s => (s.toolCalls || []).map(c => c.toolName));
  return {
    reply: (result.text || '').trim() || (checkout ? 'Order ready. Press the PayPal button below to approve.' : 'Done. Check your Fridge.'),
    pack: packChanged && pack.length ? packView(pack) : null,
    checkout,
    toolsUsed,
  };
}

module.exports = { runConcierge, FLAVOR_NOTES, cleanMessages, cleanLines, cleanPack, cleanHistory, checkoutRequestId };
