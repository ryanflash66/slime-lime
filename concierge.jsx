/* global React */
// FLAVOR CONCIERGE — an AI shopping agent in a chat panel.
// The shopper says how they play; the agent (api/concierge/chat.js) builds a pack from the real
// lineup, the pack fills the Fridge cart, and the agent creates the PayPal order (sandbox unless
// the server runs PAYPAL_ENV=live). The shopper approves it with the PayPal button in the chat.
// Prices only ever come from the server.
//
// Every agent action is also broadcast as a window event, so a voice layer or a visual
// "watch the agent work" layer can hook in without touching this file:
//   window.addEventListener('sl-concierge', e => e.detail)
//   detail.type: 'open' | 'close' | 'user-message' | 'thinking' | 'tool' (detail.tool = build_pack,
//   reorder_usual, start_checkout or get_order) | 'pack' | 'checkout' | 'paid' | 'reply' | 'error'
//   | 'subscribed' (sent by the Fridge once PayPal approves the crisper pack's subscription:
//   detail.subscriptionId, cadence, total, lines; the concierge sends it too, with source: 'concierge')
//   | 'subscription' (the agent created a PayPal subscription to approve: detail.subscription,
//   without its sig) | 'pending' (the agent asks to confirm a pause / resume / cancel:
//   detail.pending = { action, subscriptionId, summary } or null once it is used, dismissed or
//   expired) | 'confirmed' (detail.confirmed = { action, subscriptionId, ok, status, error })
// and driven with window.slConcierge.open(), .close(), .send(text), .pay() (pay needs a user gesture),
// .confirm(), .pending() and .confirmPending() (true while a change waits for "confirm"; the
// Confirm button also carries [data-sl-confirm]).
//
// Confirming: a pause / resume / cancel waits 30 s for the shopper's confirm, which is the Confirm
// button, a typed or spoken "confirm" as the next message, or the voice loop's
//   window.dispatchEvent(new CustomEvent('sl-confirm'))
// Any other message, the dismiss button or the 30 s running out discards it.
//
// Order history ("get my usual") lives on this device only: localStorage['sl-orders'] keeps the
// last 5 of each kind, newest first, with no payer data:
//   { kind: 'order', orderId, at, lines: [{ id, qty, subscription? }], total }   a paid one-time order
//   { kind: 'subscription', subscriptionId, sig, cadence, at, lines: [{ id, qty }], total }
//     an approved PayPal subscription (plain flavor ids; `sig` is the server's signature of the id)
// Entries saved before subscriptions existed have no `kind` and count as 'order' (older ones can
// hold '--sub' lines that were paid once). No account, no server copy. The concierge gets both
// kinds and can only look up (get_order) entries in this list; a subscription counts only if the
// server verifies its sig, and the sig never reaches the model.
const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

const CC_ORDERS_KEY = 'sl-orders';
const CC_MAX_ORDERS = 5;
const ccImg = id => `assets/bottle/renders/card-${id}.webp`;
const ccEmit = (type, detail = {}) => {
  try { window.dispatchEvent(new CustomEvent('sl-concierge', { detail: { type, at: Date.now(), ...detail } })); } catch (e) {}
};

// Orders that could not be written to localStorage (full, blocked, private mode) are kept here
// for the rest of the visit, so "get my usual" and order lookups still work.
const ccUnsavedOrders = [];

const ccKind = o => (o && o.kind === 'subscription' ? 'subscription' : 'order');
const ccEntryKey = o => (ccKind(o) === 'subscription' ? `sub:${o.subscriptionId}` : `order:${o && o.orderId}`);
// Newest CC_MAX_ORDERS of each kind, so subscriptions never push orders out of "get my usual".
function ccCap(list) {
  const seen = { order: 0, subscription: 0 };
  return list.filter(o => o && typeof o === 'object' && ++seen[ccKind(o)] <= CC_MAX_ORDERS);
}
// Every entry (both kinds), newest first.
function ccReadOrders() {
  let list = [];
  try {
    const raw = JSON.parse(localStorage.getItem(CC_ORDERS_KEY) || '[]');
    if (Array.isArray(raw)) list = raw.filter(o => o && typeof o === 'object');
  } catch (e) {}
  if (!ccUnsavedOrders.length) return list;
  const keys = new Set(list.map(ccEntryKey));
  return ccCap([...ccUnsavedOrders.filter(o => !keys.has(ccEntryKey(o))), ...list]
    .sort((a, b) => String(b.at).localeCompare(String(a.at))));
}

// What the chat request carries (the server takes at most CC_MAX_ORDERS entries): the newest
// subscription that has a sig, plus the newest orders, newest first. The sig goes to the server
// only, which checks it and keeps it away from the model (api/_lib/concierge-subs.js).
function ccChatHistory() {
  const all = ccReadOrders();
  const sub = all.find(o => ccKind(o) === 'subscription' && o.sig);
  const orders = all.filter(o => ccKind(o) === 'order').slice(0, sub ? CC_MAX_ORDERS - 1 : CC_MAX_ORDERS);
  return all.filter(o => o === sub || orders.includes(o)).map(o => (o === sub
    ? { kind: 'subscription', subscriptionId: o.subscriptionId, sig: o.sig, cadence: o.cadence, at: o.at, lines: o.lines }
    : { kind: 'order', orderId: o.orderId, at: o.at, lines: o.lines }));
}

function ccSaveEntry(entry) {
  let saved = true;
  try {
    // Read right before writing so an entry another tab just saved is kept.
    const key = ccEntryKey(entry);
    const next = ccCap([entry, ...ccReadOrders().filter(o => ccEntryKey(o) !== key)]);
    localStorage.setItem(CC_ORDERS_KEY, JSON.stringify(next));
  } catch (e) {
    saved = false;
    ccUnsavedOrders.unshift(entry);
    console.warn('[concierge] order history not saved to this browser:', e && e.message);
  }
  window.dispatchEvent(new CustomEvent('sl-orders-changed'));
  return saved;
}

const ccNewSession = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2)}`);

// Called after any captured payment (Fridge or concierge) with the capture receipt and the lines
// that PayPal order was priced for. Returns false if the order could only be kept in memory.
function slRecordOrder(receipt, items) {
  if (!receipt || !receipt.orderId || !Array.isArray(items)) return false;
  const lines = items
    .filter(i => i && i.id && i.qty > 0)
    .map(i => (i.subscription ? { id: i.id, qty: i.qty, subscription: i.subscription } : { id: i.id, qty: i.qty }));
  if (!lines.length) return false;
  return ccSaveEntry({ kind: 'order', orderId: receipt.orderId, at: new Date().toISOString(), lines, total: receipt.amount || null });
}

// Called by the Fridge once PayPal approves a subscription, with useShellPayPalSub's receipt:
// { subscriptionId, sig, cadence, total, lines: [{ id, qty }] } (plain flavor ids).
// Returns false if it could only be kept in memory.
function slRecordSubscription(receipt) {
  if (!receipt || typeof receipt.subscriptionId !== 'string' || !receipt.subscriptionId || !Array.isArray(receipt.lines)) return false;
  const lines = receipt.lines
    .filter(l => l && typeof l.id === 'string' && l.qty > 0)
    .map(l => ({ id: l.id.replace(/--sub$/, ''), qty: l.qty }));
  if (!lines.length) return false;
  return ccSaveEntry({
    kind: 'subscription', subscriptionId: receipt.subscriptionId, sig: receipt.sig || null,
    cadence: receipt.cadence || null, at: new Date().toISOString(), lines, total: receipt.total || null,
  });
}

// Subscriptions the chat may act on: approved ones from this device's history plus any the agent
// created this visit that PayPal hasn't approved yet. The sig goes to the server, never the model.
function ccSubsForChat(created) {
  const saved = ccReadOrders()
    .filter(o => ccKind(o) === 'subscription' && typeof o.subscriptionId === 'string' && typeof o.sig === 'string' && o.sig)
    .map(o => ({ subscriptionId: o.subscriptionId, sig: o.sig, cadence: o.cadence, lines: o.lines, at: o.at, approved: true }));
  const ids = new Set(saved.map(s => s.subscriptionId));
  // Approved ones first (the server's default target), then up to 2 unapproved ones; 6 at most.
  const fresh = (created || []).filter(s => !ids.has(s.subscriptionId)).slice(0, 2);
  return [...saved.slice(0, 6 - fresh.length), ...fresh];
}

// "confirm", "Confirm.", "yes confirm", "confirm pause", "I confirm": the shopper's go-ahead.
const CC_CONFIRM_RE = /^\s*(yes[,.!]?\s+)?(i\s+)?confirm(ed)?(\s+(it|that|the\s+\w+|pause|resume|cancel(lation)?))?\s*[.!]*\s*$/i;
const CC_EVERY = { biweekly: 'every 2 weeks', monthly: 'every month', quarterly: 'every 3 months' };
const ccEvery = c => CC_EVERY[c] || 'every cycle';

function CCSubscribe({ subscription, sub, onSubscribe }) {
  const busy = ['loading', 'subscribing'].includes(sub.status);
  const env = sub.env || subscription.env;
  const done = subscription.approved
    || (sub.status === 'subscribed' && sub.receipt && sub.receipt.subscriptionId === subscription.subscriptionId);
  const msg = sub.status === 'cancelled' ? 'Not started. Tap the button to try again.'
    : sub.status === 'error' || sub.status === 'unavailable' ? sub.message : '';
  return (
    <div className="cc-card cc-pay">
      <div className="mono-sm" style={{ color: 'var(--fg-3)' }}>PAYPAL SUBSCRIPTION {subscription.subscriptionId}</div>
      {done ? (
        <div className="cc-paid">SUBSCRIBED · ${subscription.total} {ccEvery(subscription.cadence).toUpperCase()}</div>
      ) : (
        <button type="button" className="btn btn-primary cc-pay-btn" aria-busy={busy}
          disabled={!['ready', 'cancelled', 'error', 'subscribed'].includes(sub.status)}
          onClick={() => onSubscribe(subscription)}>
          {sub.status === 'loading' ? 'Loading PayPal…'
            : sub.status === 'subscribing' ? 'Waiting for PayPal…'
            : sub.status === 'unavailable' ? 'Subscriptions offline'
            : <>Subscribe with PayPal · ${subscription.total} {ccEvery(subscription.cadence)}</>}
        </button>
      )}
      {!done && msg && <div className="cc-pay-msg" role="status">{msg}</div>}
      <div className="cc-sandbox">BILLED {ccEvery(subscription.cadence).toUpperCase()} BY PAYPAL · PAUSE OR CANCEL ANYTIME{env === 'sandbox' ? ' · SANDBOX, TEST MONEY ONLY' : ''}</div>
    </div>
  );
}

function CCConfirm({ pending, onConfirm, onDismiss, disabled }) {
  const isCancel = pending.action === 'cancel';
  return (
    <div className="cc-card cc-confirm" role="group" aria-label={`Confirm ${pending.action}`}>
      <div className="mono-sm" style={{ color: 'var(--fg-3)' }}>NEEDS YOUR OK · {pending.subscriptionId}</div>
      <div className="cc-confirm-row">
        <button type="button" className={'btn cc-confirm-btn ' + (isCancel ? 'btn-secondary is-danger' : 'btn-primary')}
          data-sl-confirm={pending.action} disabled={disabled} onClick={onConfirm}>
          {isCancel ? 'Confirm cancellation' : `Confirm ${pending.action}`}
        </button>
        <button type="button" className="btn btn-ghost cc-confirm-btn" disabled={disabled} onClick={onDismiss}>
          {isCancel ? 'Keep it' : 'Cancel'}
        </button>
      </div>
      <div className="cc-sandbox">OR SAY "CONFIRM" · EXPIRES IN 30 S</div>
    </div>
  );
}

const CC_STARTERS = [
  'Late-night ranked, nothing too sweet',
  'Long co-op sessions, I like fruity',
  'Light stuff for pre-game warm-ups',
  'Surprise me with a 24-pack',
];

function CCPack({ pack, onOpenFridge }) {
  return (
    <div className="cc-card">
      <div className="cc-pack-bottles" aria-hidden="true">
        {pack.items.map(i => (
          <span key={i.id} className="cc-pack-bottle">
            <img src={ccImg(i.id)} alt="" width="800" height="1067" decoding="async"/>
            <b>{i.qty}</b>
          </span>
        ))}
      </div>
      <ul className="cc-pack-list">
        {pack.items.map(i => <li key={i.id}><span>{i.qty} × {i.name.replace('Slime Lime ', '')}</span><span>${(i.qty * Number(i.unit)).toFixed(2)}</span></li>)}
      </ul>
      <div className="cc-pack-foot">
        <span className="mono-sm">{pack.bottles} BOTTLES · IN YOUR FRIDGE</span>
        <b>${pack.total}</b>
      </div>
      <button type="button" className="btn btn-ghost cc-mini-btn" onClick={onOpenFridge}>Open my Fridge</button>
    </div>
  );
}

function CCCheckout({ checkout, pay, onPay }) {
  const busy = ['loading', 'paying', 'capturing'].includes(pay.status);
  // Environment comes from the server (/api/paypal/config, or the checkout itself), never assumed.
  const env = pay.env || checkout.env;
  const paid = pay.status === 'paid' && pay.receipt && pay.receipt.orderId === checkout.orderId;
  return (
    <div className="cc-card cc-pay">
      <div className="mono-sm" style={{ color: 'var(--fg-3)' }}>PAYPAL ORDER {checkout.orderId}</div>
      {paid ? (
        <div className="cc-paid">PAID ${pay.receipt.amount} · THANKS{pay.receipt.payer ? `, ${pay.receipt.payer.toUpperCase()}` : ''}</div>
      ) : (
        <button type="button" className="btn btn-primary cc-pay-btn" aria-busy={busy}
          disabled={!['ready', 'cancelled', 'error', 'paid'].includes(pay.status)}
          onClick={() => onPay(checkout.orderId, checkout.lines)}>
          {pay.status === 'loading' ? 'Loading PayPal…'
            : pay.status === 'paying' ? 'Waiting for PayPal…'
            : pay.status === 'capturing' ? 'Confirming payment…'
            : pay.status === 'unavailable' ? 'Checkout offline'
            : <>Pay ${checkout.total} with PayPal</>}
        </button>
      )}
      {!paid && pay.message && <div className="cc-pay-msg" role="status">{pay.message}</div>}
      {env === 'sandbox' && <div className="cc-sandbox">PAYPAL SANDBOX · TEST MONEY ONLY</div>}
    </div>
  );
}

function Concierge({ cart, fridgeOpen }) {
  const [open, setOpen] = useStateC(false);
  const [msgs, setMsgs] = useStateC([]); // { role, content, pack?, checkout?, error? }
  const [input, setInput] = useStateC('');
  const [thinking, setThinking] = useStateC(false);
  const [checkout, setCheckout] = useStateC(null);
  // Both kinds: the "Get my usual" chip shows when there is any entry.
  const [orders, setOrders] = useStateC(() => ccReadOrders());
  const listRef = useRefC(null);
  const panelRef = useRefC(null);
  const inputRef = useRefC(null);
  const msgsRef = useRefC(msgs);
  msgsRef.current = msgs;
  const checkoutRef = useRefC(checkout);
  checkoutRef.current = checkout;
  // Subscriptions: the one the agent created for the pack (with its sig, until PayPal approves it),
  // the cadence the agent set, and a pause / resume / cancel waiting for the shopper's confirm.
  const [subscription, setSubscription] = useStateC(null);
  const subscriptionRef = useRefC(subscription);
  subscriptionRef.current = subscription;
  const [pending, setPending] = useStateC(null); // { action, subscriptionId, summary, issuedAt, token, expiresAt }
  const pendingRef = useRefC(pending);
  const cadenceRef = useRefC(null);
  const createdSubsRef = useRefC([]); // created this visit, not approved yet: [{ subscriptionId, sig, cadence, lines, at, approved: false }]
  const lastConfirmRef = useRefC(0);
  const confirmRef = useRefC(null);
  const livePending = () => {
    const p = pendingRef.current;
    return p && Date.now() < p.expiresAt ? p : null;
  };
  const dropPending = () => {
    if (!pendingRef.current) return;
    pendingRef.current = null;
    setPending(null);
    ccEmit('pending', { pending: null });
  };
  // Synchronous guard: two sends before React re-renders must not both go out. An automatic
  // message (the post-payment one) that arrives mid-request waits here and goes out next.
  const sendingRef = useRefC(false);
  const queuedAutoRef = useRefC(null);
  // Keys the server's PayPal-Request-Id, so a retried checkout of the same pack reuses its order.
  // A new one starts after every payment.
  const sessionRef = useRefC(null);
  if (!sessionRef.current) sessionRef.current = ccNewSession();

  useEffectC(() => {
    const sync = () => setOrders(ccReadOrders());
    window.addEventListener('sl-orders-changed', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('sl-orders-changed', sync); window.removeEventListener('storage', sync); };
  }, []);

  // A payment from the Fridge retires any concierge checkout still waiting: the shopper must not
  // be able to pay for the same pack twice.
  useEffectC(() => {
    const onPaidElsewhere = e => {
      const d = (e && e.detail) || {};
      if (d.source === 'concierge') return;
      sessionRef.current = ccNewSession();
      const pending = checkoutRef.current;
      if (!pending || pending.paid || pending.orderId === d.orderId) return;
      setCheckout(null);
      setMsgs(m => [...m, { role: 'assistant', content: 'Your Fridge payment went through, so I closed my PayPal checkout. No double charge.' }]);
      ccEmit('checkout', { checkout: null });
    };
    window.addEventListener('sl-paid', onPaidElsewhere);
    return () => window.removeEventListener('sl-paid', onPaidElsewhere);
  }, []);

  // Any one-time payment (here or in the Fridge) retires a subscription the shopper hasn't approved
  // yet, so the same pack can't be bought once and subscribed too. It never bills unapproved.
  useEffectC(() => {
    const onPaidAnywhere = () => {
      cadenceRef.current = null;
      const s = subscriptionRef.current;
      if (!s || s.approved) return;
      setSubscription(null);
      ccEmit('subscription', { subscription: null });
    };
    window.addEventListener('sl-paid', onPaidAnywhere);
    return () => window.removeEventListener('sl-paid', onPaidAnywhere);
  }, []);

  const pay = window.useShellPayPal({
    active: open && !!checkout,
    items: cart.cart,
    onPaid: (receipt, paidLines) => {
      const pending = checkoutRef.current;
      const lines = paidLines && paidLines.length ? paidLines : (pending && pending.lines) || [];
      slRecordOrder(receipt, lines);
      cart.removePaid(lines);
      sessionRef.current = ccNewSession();
      setCheckout(c => (c && c.orderId === receipt.orderId ? { ...c, paid: true } : c));
      window.dispatchEvent(new CustomEvent('sl-paid', { detail: { orderId: receipt.orderId, source: 'concierge' } }));
      ccEmit('paid', { orderId: receipt.orderId, amount: receipt.amount });
      // The cart update above lands on the next render, so say what is left explicitly.
      const left = cart.cart.filter(i => !i.subscription).map(i => {
        const paid = lines.filter(l => l.id === i.id).reduce((s, l) => s + l.qty, 0);
        return { id: i.id, qty: i.qty - paid };
      }).filter(l => l.qty > 0);
      send(`I approved the PayPal payment for order ${receipt.orderId}.`, { auto: true, pack: left });
    },
  });

  // The agent's subscription: created on the server by start_subscription, approved here in the
  // PayPal window (useShellPayPalSub with the existing subscription, so nothing new is created).
  const sub = window.useShellPayPalSub({
    active: open && !!subscription && !subscription.approved,
    items: [],
    onSubscribed: receipt => {
      const created = subscriptionRef.current;
      const lines = (receipt.lines && receipt.lines.length ? receipt.lines : (created && created.lines) || []).map(l => ({ id: l.id, qty: l.qty }));
      slRecordSubscription({ ...receipt, lines });
      createdSubsRef.current = createdSubsRef.current.filter(s => s.subscriptionId !== receipt.subscriptionId);
      // The pack now ships from PayPal on repeat: take it out of the Fridge so it isn't bought twice.
      cart.removePaid(lines);
      sessionRef.current = ccNewSession();
      cadenceRef.current = null;
      setSubscription(s => (s && s.subscriptionId === receipt.subscriptionId ? { ...s, approved: true } : s));
      // The pack is subscribed now: an unpaid one-time checkout for it must not stay payable.
      if (checkoutRef.current && !checkoutRef.current.paid) { setCheckout(null); ccEmit('checkout', { checkout: null }); }
      ccEmit('subscribed', { subscriptionId: receipt.subscriptionId, cadence: receipt.cadence, total: receipt.total, lines, source: 'concierge' });
      const left = cart.cart.filter(i => !i.subscription).map(i => {
        const done = lines.filter(l => l.id === i.id).reduce((s, l) => s + l.qty, 0);
        return { id: i.id, qty: i.qty - done };
      }).filter(l => l.qty > 0);
      send('I approved the subscription.', { auto: true, pack: left });
    },
  });

  // A pending confirm lasts 30 s.
  useEffectC(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      if (pendingRef.current !== pending) return;
      dropPending();
      setMsgs(m => [...m, { role: 'assistant', content: 'That confirmation timed out, so nothing changed. Ask again whenever you like.' }]);
    }, Math.max(0, pending.expiresAt - Date.now()));
    return () => clearTimeout(t);
  }, [pending]);

  // The voice loop (DAR-697) says "confirm" this way.
  useEffectC(() => {
    const onConfirm = () => { if (confirmRef.current) confirmRef.current(); };
    window.addEventListener('sl-confirm', onConfirm);
    return () => window.removeEventListener('sl-confirm', onConfirm);
  }, []);

  useEffectC(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs, thinking, open]);

  React.useLayoutEffect(() => { if (panelRef.current) panelRef.current.inert = !open; }, [open]);

  useEffectC(() => {
    if (open && inputRef.current) inputRef.current.focus({ preventScroll: true });
  }, [open]);

  useEffectC(() => {
    if (!open || fridgeOpen) return;
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, fridgeOpen]);

  async function send(text, { auto = false, pack = null, confirm = false } = {}) {
    const content = String(text || '').trim();
    if (!content) return;
    if (sendingRef.current) {
      if (auto) queuedAutoRef.current = { text: content, pack };
      return;
    }
    // A pending pause / resume / cancel goes out only with the shopper's confirm (the button,
    // 'sl-confirm', or "confirm" typed or said as the very next message). Any other message drops it.
    const live = livePending();
    const confirming = !!live && !auto && (confirm || CC_CONFIRM_RE.test(content));
    // The voice loop may send both the event and the word: a "confirm" straight after a confirm
    // (no other message between, within 5 s) counts once, not twice.
    if (!live && !auto && CC_CONFIRM_RE.test(content) && Date.now() - lastConfirmRef.current < 5000) return;
    if (!auto) lastConfirmRef.current = confirming ? Date.now() : 0;
    dropPending();
    sendingRef.current = true;
    const history = [...msgsRef.current.filter(m => !m.error), { role: 'user', content, auto }];
    setMsgs(history);
    setInput('');
    setThinking(true);
    ccEmit('user-message', { text: content, auto });
    ccEmit('thinking', { on: true });
    try {
      const res = await fetch('/api/concierge/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.slice(-20).map(m => ({ role: m.role, content: String(m.content || '').slice(0, 2000) })),
          pack: pack || cart.cart.filter(i => !i.subscription).map(i => ({ id: i.id, qty: i.qty })),
          history: ccChatHistory(),
          session: sessionRef.current,
          subscriptions: ccSubsForChat(createdSubsRef.current),
          cadence: cadenceRef.current || undefined,
          ...(confirming ? {
            confirm: { action: live.action, subscriptionId: live.subscriptionId },
            pending: { action: live.action, subscriptionId: live.subscriptionId, issuedAt: live.issuedAt, token: live.token },
          } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      // 429 is the Vercel Firewall rate limit (DAR-693). Say so plainly; nothing retries on its own.
      if (res.status === 429) throw new Error('Easy there — the concierge needs a breather. Try again in a minute.');
      if (!res.ok) throw new Error(data.error || `The concierge is offline (${res.status}).`);
      (data.toolsUsed || []).forEach(tool => ccEmit('tool', { tool }));
      if (data.pack) {
        cart.fillPack(data.pack.lines);
        setCheckout(null);
        ccEmit('pack', { pack: data.pack });
      }
      if (data.checkout) { setCheckout(data.checkout); ccEmit('checkout', { checkout: data.checkout }); }
      if ('cadence' in data) cadenceRef.current = data.cadence || null;
      if (data.pack && !data.subscription) setSubscription(null);
      if (data.subscription) {
        const s = data.subscription;
        setSubscription(s);
        createdSubsRef.current = [
          { subscriptionId: s.subscriptionId, sig: s.sig, cadence: s.cadence, lines: s.lines, at: new Date().toISOString(), approved: false },
          ...createdSubsRef.current.filter(c => c.subscriptionId !== s.subscriptionId),
        ].slice(0, 3);
        ccEmit('subscription', { subscription: { subscriptionId: s.subscriptionId, total: s.total, cadence: s.cadence, lines: s.lines, env: s.env } });
      }
      let nextPending = null;
      if (data.pending && data.pending.token) {
        const p = data.pending;
        nextPending = { action: p.action, subscriptionId: p.subscriptionId, summary: p.summary, issuedAt: p.issuedAt, token: p.token,
          expiresAt: Date.now() + (Number(p.expiresInMs) || 30000) };
        pendingRef.current = nextPending;
        setPending(nextPending);
        ccEmit('pending', { pending: { action: p.action, subscriptionId: p.subscriptionId, summary: p.summary } });
      }
      if (data.confirmed) ccEmit('confirmed', { confirmed: data.confirmed });
      ccEmit('reply', { text: data.reply });
      setMsgs(m => [...m, { role: 'assistant', content: data.reply, pack: data.pack || null, checkout: data.checkout || null,
        subscription: data.subscription ? { subscriptionId: data.subscription.subscriptionId } : null,
        pending: nextPending ? { issuedAt: nextPending.issuedAt } : null }]);
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: e.message || 'Something glitched. Try again.', error: true }]);
      ccEmit('error', { message: e.message });
    } finally {
      sendingRef.current = false;
      setThinking(false);
      ccEmit('thinking', { on: false });
      const next = queuedAutoRef.current;
      queuedAutoRef.current = null;
      if (next) setTimeout(() => window.slConcierge && window.slConcierge.sendAuto(next.text, next.pack), 0);
    }
  }

  // Public handle for other layers (voice, visual). Refreshed every render so it sees current state.
  window.slConcierge = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    send: text => { setOpen(true); return send(text); },
    sendAuto: (text, pack) => send(text, { auto: true, pack }),
    pay: () => { const c = checkoutRef.current; if (c && !c.paid) pay.start(c.orderId, c.lines); },
    confirm: () => confirmRef.current && confirmRef.current(),
    pending: () => { const p = livePending(); return p ? { action: p.action, subscriptionId: p.subscriptionId, summary: p.summary } : null; },
    // True while a change waits for "confirm" (the voice loop then dispatches 'sl-confirm').
    confirmPending: () => !!livePending() && !sendingRef.current,
  };
  // Confirm the pending action (button, 'sl-confirm', slConcierge.confirm). Returns false when
  // nothing is waiting, so a stray "confirm" changes nothing.
  confirmRef.current = () => {
    const p = livePending();
    if (!p || sendingRef.current) return false;
    setOpen(true);
    send(p.action === 'cancel' ? 'Confirm cancellation' : `Confirm ${p.action}`, { confirm: true });
    return true;
  };
  const dismissPending = () => {
    if (!livePending()) return;
    dropPending();
    setMsgs(m => [...m, { role: 'assistant', content: 'OK, nothing changed.' }]);
  };
  useEffectC(() => { ccEmit(open ? 'open' : 'close'); }, [open]);

  const onSubmit = e => { e.preventDefault(); send(input); };
  const openFridge = () => cart.setCartOpen(true);
  // A subscription saved without its sig can't be read by the server, so it doesn't count.
  const last = orders.find(o => ccKind(o) === 'order' || o.sig);

  return (
    <>
      <button type="button" className={'cc-launch' + (open ? ' is-hidden' : '')} onClick={() => setOpen(true)}
        aria-label="Open the Flavor Concierge" aria-expanded={open}>
        <span className="cc-launch-dot" aria-hidden="true"/>
        <span>Flavor Concierge</span>
        <span className="cc-ai" aria-hidden="true">AI</span>
      </button>

      <section ref={panelRef} className={'cc-panel' + (open ? ' is-open' : '')} role="dialog" aria-modal="false"
        aria-labelledby="cc-title" aria-hidden={!open}>
        <header className="cc-head">
          <div>
            <span className="mono-sm" style={{ color: 'var(--accent)' }}>FLAVOR CONCIERGE · AI</span>
            <h2 id="cc-title" className="cc-title">Tell me how you play.</h2>
          </div>
          <button type="button" className="iconbtn" onClick={() => setOpen(false)} aria-label="Close the concierge"><Icon name="x"/></button>
        </header>

        <div className="cc-msgs thin-scroll" ref={listRef} aria-live="polite">
          {msgs.length === 0 && (
            <div className="cc-intro">
              <p>I'll build you a pack from the lineup, drop it in your Fridge, and set up the PayPal checkout. You approve the payment.</p>
              <div className="cc-starters">
                {last && (
                  <button type="button" className="cc-chip is-usual" onClick={() => send('Get my usual')}>
                    Get my usual
                  </button>
                )}
                {CC_STARTERS.map(s => <button key={s} type="button" className="cc-chip" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={'cc-msg is-' + m.role + (m.error ? ' is-error' : '') + (m.auto ? ' is-auto' : '')}>
              <div className="cc-bubble">{m.content}</div>
              {m.pack && <CCPack pack={m.pack} onOpenFridge={openFridge}/>}
              {m.checkout && checkout && m.checkout.orderId === checkout.orderId && (
                <CCCheckout checkout={checkout} pay={pay} onPay={pay.start}/>
              )}
              {m.subscription && subscription && m.subscription.subscriptionId === subscription.subscriptionId && (
                <CCSubscribe subscription={subscription} sub={sub} onSubscribe={sub.start}/>
              )}
              {m.pending && pending && m.pending.issuedAt === pending.issuedAt && (
                <CCConfirm pending={pending} disabled={thinking}
                  onConfirm={() => confirmRef.current && confirmRef.current()} onDismiss={dismissPending}/>
              )}
            </div>
          ))}
          {thinking && <div className="cc-msg is-assistant"><div className="cc-bubble cc-typing" aria-label="Concierge is thinking"><i/><i/><i/></div></div>}
        </div>

        {/* Hands-free mic status + "Tap to talk" (voice.jsx); renders nothing in Legacy. */}
        {window.VoiceBar && <window.VoiceBar/>}

        <form className="cc-form" onSubmit={onSubmit}>
          <input ref={inputRef} className="cc-input" value={input} onChange={e => setInput(e.target.value)}
            placeholder={last ? 'Try "get my usual"' : 'How do you play? What do you like?'} maxLength={500}
            aria-label="Message the concierge"/>
          <button type="submit" className="btn btn-primary cc-send" disabled={!input.trim() || thinking} aria-label="Send">
            <Icon name="arrow" size={18}/>
          </button>
        </form>
      </section>
    </>
  );
}

Object.assign(window, { Concierge, slRecordOrder, slRecordSubscription });
