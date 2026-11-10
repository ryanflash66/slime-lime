/* global React */
// FLAVOR CONCIERGE — an AI shopping agent in a chat panel.
// The shopper says how they play; the agent (api/concierge/chat.js) builds a pack from the real
// lineup, the pack fills the Fridge cart, and the agent creates the PayPal sandbox order. The
// shopper approves it with the PayPal button in the chat. Prices only ever come from the server.
//
// Every agent action is also broadcast as a window event, so a voice layer or a visual
// "watch the agent work" layer can hook in without touching this file:
//   window.addEventListener('sl-concierge', e => e.detail)
//   detail.type: 'open' | 'close' | 'user-message' | 'thinking' | 'tool' (detail.tool = build_pack,
//   reorder_usual, start_checkout or get_order) | 'pack' | 'checkout' | 'paid' | 'reply' | 'error'
// and driven with window.slConcierge.open(), .close(), .send(text), .pay() (pay needs a user gesture).
//
// Order history ("get my usual") lives on this device only: localStorage['sl-orders'] keeps the
// last 5 paid orders as { orderId, at, lines: [{ id, qty }], total }. No account, no server copy.
const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

const CC_ORDERS_KEY = 'sl-orders';
const CC_MAX_ORDERS = 5;
const ccImg = id => `assets/bottle/renders/card-${id}.webp`;
const ccEmit = (type, detail = {}) => {
  try { window.dispatchEvent(new CustomEvent('sl-concierge', { detail: { type, at: Date.now(), ...detail } })); } catch (e) {}
};

function ccReadOrders() {
  try {
    const list = JSON.parse(localStorage.getItem(CC_ORDERS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

// Called after any captured sandbox payment (Fridge or concierge) with the capture receipt
// and the cart lines that were paid for.
function slRecordOrder(receipt, items) {
  if (!receipt || !receipt.orderId || !Array.isArray(items)) return;
  const lines = items.filter(i => !i.subscription).map(i => ({ id: i.id, qty: i.qty }));
  if (!lines.length) return;
  const entry = { orderId: receipt.orderId, at: new Date().toISOString(), lines, total: receipt.amount || null };
  try {
    const next = [entry, ...ccReadOrders().filter(o => o.orderId !== entry.orderId)].slice(0, CC_MAX_ORDERS);
    localStorage.setItem(CC_ORDERS_KEY, JSON.stringify(next));
  } catch (e) {}
  window.dispatchEvent(new CustomEvent('sl-orders-changed'));
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
  const paid = pay.status === 'paid' && pay.receipt && pay.receipt.orderId === checkout.orderId;
  return (
    <div className="cc-card cc-pay">
      <div className="mono-sm" style={{ color: 'var(--fg-3)' }}>PAYPAL ORDER {checkout.orderId}</div>
      {paid ? (
        <div className="cc-paid">PAID ${pay.receipt.amount} · THANKS{pay.receipt.payer ? `, ${pay.receipt.payer.toUpperCase()}` : ''}</div>
      ) : (
        <button type="button" className="btn btn-primary cc-pay-btn" aria-busy={busy}
          disabled={!['ready', 'cancelled', 'error', 'paid'].includes(pay.status)}
          onClick={() => onPay(checkout.orderId)}>
          {pay.status === 'loading' ? 'Loading PayPal…'
            : pay.status === 'paying' ? 'Waiting for PayPal…'
            : pay.status === 'capturing' ? 'Confirming payment…'
            : pay.status === 'unavailable' ? 'Checkout offline'
            : <>Pay ${checkout.total} with PayPal</>}
        </button>
      )}
      {!paid && pay.message && <div className="cc-pay-msg" role="status">{pay.message}</div>}
      <div className="cc-sandbox">PAYPAL SANDBOX · TEST MONEY ONLY</div>
    </div>
  );
}

function Concierge({ cart, fridgeOpen }) {
  const [open, setOpen] = useStateC(false);
  const [msgs, setMsgs] = useStateC([]); // { role, content, pack?, checkout?, error? }
  const [input, setInput] = useStateC('');
  const [thinking, setThinking] = useStateC(false);
  const [checkout, setCheckout] = useStateC(null);
  const [orders, setOrders] = useStateC(ccReadOrders);
  const listRef = useRefC(null);
  const panelRef = useRefC(null);
  const inputRef = useRefC(null);
  const msgsRef = useRefC(msgs);
  msgsRef.current = msgs;

  useEffectC(() => {
    const sync = () => setOrders(ccReadOrders());
    window.addEventListener('sl-orders-changed', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('sl-orders-changed', sync); window.removeEventListener('storage', sync); };
  }, []);

  const pay = window.useShellPayPal({
    active: open && !!checkout,
    items: cart.cart,
    onPaid: receipt => {
      slRecordOrder(receipt, cart.cart);
      cart.clear();
      ccEmit('paid', { orderId: receipt.orderId, amount: receipt.amount });
      send(`I approved the PayPal payment for order ${receipt.orderId}.`, { auto: true });
    },
  });

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

  async function send(text, { auto = false } = {}) {
    const content = String(text || '').trim();
    if (!content || thinking) return;
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
          messages: history.map(m => ({ role: m.role, content: m.content })),
          pack: cart.cart.filter(i => !i.subscription).map(i => ({ id: i.id, qty: i.qty })),
          history: ccReadOrders().map(o => ({ orderId: o.orderId, at: o.at, lines: o.lines })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The concierge is offline (${res.status}).`);
      (data.toolsUsed || []).forEach(tool => ccEmit('tool', { tool }));
      if (data.pack) {
        cart.fillPack(data.pack.lines);
        setCheckout(null);
        ccEmit('pack', { pack: data.pack });
      }
      if (data.checkout) { setCheckout(data.checkout); ccEmit('checkout', { checkout: data.checkout }); }
      ccEmit('reply', { text: data.reply });
      setMsgs(m => [...m, { role: 'assistant', content: data.reply, pack: data.pack || null, checkout: data.checkout || null }]);
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: e.message || 'Something glitched. Try again.', error: true }]);
      ccEmit('error', { message: e.message });
    } finally {
      setThinking(false);
      ccEmit('thinking', { on: false });
    }
  }

  // Public handle for other layers (voice, visual). Refreshed every render so it sees current state.
  const checkoutRef = useRefC(checkout);
  checkoutRef.current = checkout;
  window.slConcierge = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    send: text => { setOpen(true); return send(text); },
    pay: () => { if (checkoutRef.current) pay.start(checkoutRef.current.orderId); },
  };
  useEffectC(() => { ccEmit(open ? 'open' : 'close'); }, [open]);

  const onSubmit = e => { e.preventDefault(); send(input); };
  const openFridge = () => cart.setCartOpen(true);
  const last = orders[0];

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
            </div>
          ))}
          {thinking && <div className="cc-msg is-assistant"><div className="cc-bubble cc-typing" aria-label="Concierge is thinking"><i/><i/><i/></div></div>}
        </div>

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

Object.assign(window, { Concierge, slRecordOrder });
