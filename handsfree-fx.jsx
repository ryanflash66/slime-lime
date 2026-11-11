/* global React */
// HANDS-FREE STAGE: the full-screen look of Hands-free mode (DAR-698).
// Not the Legacy page with a voice layer on top: a calm stage with the agent's words in large type,
// the shopper's last line, a mic/status orb and one visual at a time showing what the agent does.
//
// Driven only by window events:
//   'sl-mode'      (mode.jsx)      shows the stage in 'handsfree', unmounts it in 'legacy'
//   'sl-concierge' (concierge.jsx) reply / user-message / thinking / tool / pack / checkout / paid /
//                                  open / close / error
//   'sl-paid'      (App)           a payment made in the Fridge drawer
//   'sl-voice'     (voice.jsx)     { state, interim, final }; window.slVoice = { start, stop, state }
//   'subscription' { subscription: { subscriptionId, total, cadence, ... } | null } is the agent's
//                  subscription waiting for approval (total is per delivery); null retires it
//   'subscribed'   { subscriptionId, cadence, total } once PayPal approves (concierge or Fridge)
// Also ready for a generic 'subscribe' / 'subscribing' start and tool 'open_fridge'. The tool event
// 'start_subscription' is not a cue: it carries no amount, and the 'subscription' event with the
// amount comes in the same tick (DAR-711).
//
// Visuals, played in order through a small queue (the concierge emits a whole turn in one tick):
//   1. pack      the chosen bottles float in with their quantities; the dominant flavor tints the HUD
//   2. wipe      a light take on the route curtain: "→ FRIDGE", "→ CHECKOUT", "→ SUBSCRIPTION"
//   3. fill      the bottles fly into the stage's Fridge pill, whose count then ticks up
//   4. checkout  "Waiting for PayPal" until paid / subscribed, then a success burst with the id
//
// All motion is WAAPI on transform/opacity (site.css pauses CSS animations under reduced motion).
// Reduced motion gets opacity-only fades under 200 ms. Effects layers never take pointer events.
const { useState: hfUseState, useEffect: hfUseEffect, useRef: hfUseRef, useLayoutEffect: hfUseLayoutEffect } = React;

const HF_DEFAULT_LINE = 'Tell me how you play.';
const HF_SUCCESS_MS = 9000;

// Shared helpers from the other scripts (one global scope): shellMatches + SHELL_REDUCED_MOTION
// (shell.jsx), ccImg + ccEvery (concierge.jsx: "every month", as on the subscribe button) and
// modeAnimate (mode.jsx: WAAPI with the site's ease-out).
const hfReduced = () => shellMatches(SHELL_REDUCED_MOTION);
const hfImg = ccImg;
const hfAnimate = modeAnimate;
const hfFlavor = id => (window.FLAVORS || []).find(f => f.id === id) || null;
const hfShortName = item => {
  const f = hfFlavor(item.id);
  return (f && f.short) || String(item.name || item.id || '').replace('Slime Lime ', '');
};
const hfMoney = v => {
  const n = v == null || v === '' ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : '';
};

// Remembers the conversation while the stage is unmounted (Legacy), so switching to Hands-free
// mid-chat shows the current line (and a request still in flight) instead of the intro.
// `lastWait` is whichever PayPal approval the agent asked for most recently ('order' / 'subscription').
const hfMemory = { agent: '', user: '', panelOpen: false, voice: null, checkout: null, subscription: null, lastWait: null, thinking: false };
window.addEventListener('sl-concierge', e => {
  const d = (e && e.detail) || {};
  if (d.type === 'thinking') hfMemory.thinking = !!d.on;
  else if (d.type === 'reply' && d.text) hfMemory.agent = String(d.text);
  else if (d.type === 'user-message' && !d.auto && d.text) hfMemory.user = String(d.text);
  else if (d.type === 'open') hfMemory.panelOpen = true;
  else if (d.type === 'close') hfMemory.panelOpen = false;
  else if (d.type === 'checkout') {
    hfMemory.checkout = d.checkout || null;
    if (d.checkout) hfMemory.lastWait = 'order';
  } else if (d.type === 'subscription') {
    hfMemory.subscription = d.subscription || null;
    if (d.subscription) hfMemory.lastWait = 'subscription';
  } else if (d.type === 'paid' || d.type === 'pack') {
    // Any payment or new pack retires both (concierge.jsx does the same with its own cards).
    hfMemory.checkout = null;
    hfMemory.subscription = null;
  } else if (d.type === 'subscribed') {
    // Only the one that was approved: a Fridge subscription leaves the agent's pending one alone.
    const s = hfMemory.subscription;
    if (s && (!d.subscriptionId || s.subscriptionId === d.subscriptionId)) hfMemory.subscription = null;
  }
});
window.addEventListener('sl-voice', e => { hfMemory.voice = (e && e.detail) || null; });

function hfVoiceState() {
  const v = window.slVoice;
  if (!v) return null;
  if (hfMemory.voice && hfMemory.voice.state) return hfMemory.voice.state;
  try { return typeof v.state === 'function' ? v.state() : 'off'; } catch (e) { return 'off'; }
}

// Sentences, split only where end punctuation is followed by a space ("$21.60" stays whole), and
// not after a list number ("2. Mango") or a title ("Dr. Pepper").
const HF_NO_SPLIT = /(^|\s)(\d{1,2}|dr|mr|mrs|ms|st|vs|no|e\.g|i\.e)$/i;
function hfSentences(text) {
  const out = [];
  const re = /[.!?…]+["'”’)]*\s+/g;
  let from = 0, m;
  while ((m = re.exec(text))) {
    if (m[0][0] === '.' && HF_NO_SPLIT.test(text.slice(from, m.index))) continue;
    const s = text.slice(from, m.index + m[0].length).trim();
    if (s) out.push(s);
    from = m.index + m[0].length;
  }
  const tail = text.slice(from).trim();
  if (tail) out.push(tail);
  return out;
}

// Type steps for fitting the agent's line, as fractions of its CSS size.
const HF_FIT_SCALES = [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.45];

// Room for the agent's line (px), from the line's own element: the main column's height, less the
// visual, the mic, the shopper's line and the gaps between them. null when it isn't on the stage.
// Walks the DOM rather than using the stage's refs, which React attaches after this child's layout
// effect on the first mount. The visual doesn't shrink (site.css), so its box is its content.
function hfSayRoom(say) {
  const words = say && say.parentElement;
  const main = words && words.parentElement;
  if (!main || !main.classList.contains('hf-main')) return null;
  const cs = getComputedStyle(main);
  const gap = parseFloat(cs.rowGap) || 0;
  let room = main.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  Array.from(main.children).forEach(c => {
    if (c === words || getComputedStyle(c).display === 'none') return;
    room -= c.offsetHeight + gap;
  });
  const wordsGap = parseFloat(getComputedStyle(words).rowGap) || 0;
  Array.from(words.children).forEach(c => {
    if (c !== say) room -= c.offsetHeight + wordsGap;
  });
  return Math.floor(room);
}

// The agent's line: keyed by its text, so it remounts and crossfades (and rises a little, with
// motion) whenever the words change.
// It is never clipped mid-word (DAR-712). The last sentence is usually the ask ("Say 'confirm' to
// go ahead.", "Tap the PayPal button…"), so it always shows in full. When the reply doesn't fit the
// room the stage leaves it (hfSayRoom), the type steps down to a readable floor; past that the
// middle sentences give way ("first … last"), then only the last sentence shows. The whole reply
// stays in the concierge panel. The text is set here, not rendered by React, because the fit swaps it.
// fitKey changes whenever the room may have changed.
function HFSay({ text, error, fitKey }) {
  const ref = hfUseRef(null);
  hfUseLayoutEffect(() => {
    const frames = hfReduced() ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }];
    hfAnimate(ref.current, frames, { duration: hfReduced() ? 160 : 520 });
  }, []);
  hfUseLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = '';
    el.style.maxWidth = '';
    el.textContent = text;
    const measured = hfSayRoom(el);
    if (measured == null || el.offsetHeight <= measured + 1) return;
    // No room at all: nothing fits, so this ends on the last sentence at its smallest size.
    const avail = Math.max(measured, 0);

    const parts = hfSentences(text);
    const last = parts[parts.length - 1] || text;
    const variants = [text];
    if (parts.length > 2) variants.push(`${parts[0]} … ${last}`);
    if (parts.length > 1) variants.push(last);
    const cs = getComputedStyle(el);
    const base = parseFloat(cs.fontSize) || 32;
    // Keep the line length in px as the type shrinks, so smaller type also means fewer lines.
    if (cs.maxWidth && cs.maxWidth !== 'none') el.style.maxWidth = cs.maxWidth;
    const floor = window.innerWidth < 600 ? 16 : 20;
    const fits = (t, minPx) => {
      el.textContent = t;
      for (const s of HF_FIT_SCALES) {
        const px = Math.round(base * s * 10) / 10;
        if (s !== 1 && px < minPx) break;
        el.style.fontSize = `${px}px`;
        if (el.offsetHeight <= avail + 1) return true;
      }
      return false;
    };
    for (let i = 0; i < variants.length; i++) {
      // The last sentence alone may go a little smaller than the floor before it overflows.
      if (fits(variants[i], i === variants.length - 1 ? 14 : floor)) return;
    }
  }, [text, fitKey]);
  const len = text.length;
  const size = len > 220 ? ' is-xlong' : len > 110 ? ' is-long' : '';
  return <p ref={ref} className={'hf-say' + size + (error ? ' is-error' : '')}/>;
}

// Visual 1: the pack's bottles float in one after another, each with its quantity.
function HFPack({ visual }) {
  const ref = hfUseRef(null);
  hfUseLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced = hfReduced();
    root.querySelectorAll('.hf-bottle').forEach((el, i) => {
      hfAnimate(el, reduced ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: 'translateY(56px) scale(0.9)' }, { opacity: 1, transform: 'none' }],
        { duration: reduced ? 180 : 700, delay: reduced ? i * 50 : 120 + i * 170, fill: 'backwards' });
      hfAnimate(el.querySelector('.hf-qty'), reduced ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }],
        { duration: reduced ? 150 : 420, delay: reduced ? i * 50 : 420 + i * 170, fill: 'backwards', easing: reduced ? 'linear' : 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    });
    hfAnimate(root.querySelector('.hf-pack-sum'), [{ opacity: 0 }, { opacity: 1 }],
      { duration: reduced ? 150 : 400, delay: reduced ? 0 : 300 + visual.items.length * 170, fill: 'backwards' });
  }, [visual.key]);
  return (
    <div ref={ref} className={'hf-pack' + (visual.stored ? ' is-stored' : '')}>
      <div className="hf-bottles">
        {visual.items.map(i => {
          const f = hfFlavor(i.id);
          return (
            <figure key={i.id} className="hf-bottle" style={{ '--b': (f && f.color) || 'var(--hf-accent)' }}>
              <img src={hfImg(i.id)} alt="" width="800" height="1067" decoding="async"/>
              <b className="hf-qty">×{i.qty}</b>
              <figcaption>{hfShortName(i)}</figcaption>
            </figure>
          );
        })}
      </div>
      <p className="hf-pack-sum">
        {visual.stored ? 'In your Fridge: ' : ''}{visual.bottles} bottles{visual.total ? `, ${hfMoney(visual.total)}` : ''}
      </p>
    </div>
  );
}

// Visual 4a: waiting for the shopper to approve in PayPal (the button lives in the concierge panel).
function HFWaiting({ visual }) {
  const ref = hfUseRef(null);
  hfUseLayoutEffect(() => {
    const reduced = hfReduced();
    hfAnimate(ref.current, reduced ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: reduced ? 160 : 520 });
    // A slow breathing halo. Ambient, so it stays off under reduced motion.
    if (!reduced) {
      hfAnimate(ref.current && ref.current.querySelector('.hf-wait-halo'),
        [{ opacity: 0.25, transform: 'scale(0.92)' }, { opacity: 0.7, transform: 'scale(1.06)' }],
        { duration: 1600, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
    }
  }, [visual.key]);
  const sub = visual.what === 'subscription';
  const amount = hfMoney(visual.total);
  // A subscription reads like its button: "$21.60 every month" (the amount is per delivery).
  const ask = sub
    ? `the subscription${amount ? `, ${amount} ${visual.cadence ? ccEvery(visual.cadence) : 'per delivery'}` : ''}`
    : amount;
  return (
    <div ref={ref} className="hf-wait" role="status">
      <span className="hf-wait-disc" aria-hidden="true"><i className="hf-wait-halo"/><span>$</span></span>
      <div className="hf-wait-copy">
        <p className="hf-wait-title">Waiting for PayPal</p>
        <p className="hf-wait-sub">
          Tap the PayPal button to approve{ask ? ` ${ask}` : ''}.
          <span className="hf-wait-arrow" aria-hidden="true"/>
        </p>
      </div>
    </div>
  );
}

// Visual 4b: paid or subscribed. A short burst, then the receipt id.
const HF_SPOKES = 14;
function HFSuccess({ visual }) {
  const ref = hfUseRef(null);
  hfUseLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced = hfReduced();
    hfAnimate(root.querySelector('.hf-ok-disc'), reduced ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.6 }, { opacity: 1, transform: 'none' }],
      { duration: reduced ? 180 : 620, easing: reduced ? 'linear' : 'cubic-bezier(0.23, 1, 0.32, 1)' });
    hfAnimate(root.querySelector('.hf-ok-copy'), reduced ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }],
      { duration: reduced ? 160 : 520, delay: reduced ? 0 : 220, fill: 'backwards' });
    if (reduced) return;
    // Spokes start at the disc's edge and travel a little past it, whatever size the disc is.
    const mark = root.querySelector('.hf-ok-mark');
    const r = mark ? mark.offsetWidth / 2 : 40;
    root.querySelectorAll('.hf-spoke').forEach((el, i) => {
      const a = (360 / HF_SPOKES) * i;
      const far = r + 26 + (i % 3) * 12;
      hfAnimate(el, [
        { opacity: 1, transform: `rotate(${a}deg) translateY(-${r * 0.8}px) scaleY(0.2)` },
        { opacity: 1, transform: `rotate(${a}deg) translateY(-${far * 0.8}px) scaleY(1)`, offset: 0.45 },
        { opacity: 0, transform: `rotate(${a}deg) translateY(-${far}px) scaleY(0.3)` },
      ], { duration: 760, delay: 80, fill: 'both', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    });
  }, [visual.key]);
  const sub = visual.what === 'subscription';
  return (
    <div ref={ref} className="hf-ok" role="status">
      <span className="hf-ok-mark" aria-hidden="true">
        {Array.from({ length: HF_SPOKES }, (_, i) => <i key={i} className="hf-spoke"/>)}
        <span className="hf-ok-disc"><Icon name="check" size={34} stroke={2.5}/></span>
      </span>
      <div className="hf-ok-copy">
        <p className="hf-ok-title">
          {sub ? `Subscribed${visual.cadence ? `, ${String(visual.cadence).toLowerCase()}` : ''}` : `Paid${visual.amount ? ` ${hfMoney(visual.amount)}` : ''}`}
        </p>
        {visual.id && <p className="hf-ok-id">{sub ? 'Subscription' : 'Order'} <span>{visual.id}</span></p>}
      </div>
    </div>
  );
}

// Visual 2: a band sweeps across the stage with where the agent is taking you.
function HFWipe({ wipe }) {
  const ref = hfUseRef(null);
  hfUseLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (hfReduced()) {
      hfAnimate(root, [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1, offset: 0.65 }, { opacity: 0 }],
        { duration: wipe.ms, easing: 'linear', fill: 'both' });
      return;
    }
    hfAnimate(root.querySelector('.hf-wipe-accent'), [
      { transform: 'translateX(-101%)' }, { transform: 'translateX(0)', offset: 0.22 },
      { transform: 'translateX(101%)', offset: 0.46 }, { transform: 'translateX(101%)' },
    ], { duration: wipe.ms, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', fill: 'both' });
    hfAnimate(root.querySelector('.hf-wipe-ink'), [
      { transform: 'translateX(-101%)' }, { transform: 'translateX(-101%)', offset: 0.1 },
      { transform: 'translateX(0)', offset: 0.34 }, { transform: 'translateX(0)', offset: 0.74 },
      { transform: 'translateX(101%)' },
    ], { duration: wipe.ms, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', fill: 'both' });
    hfAnimate(root.querySelector('.hf-wipe-label'), [
      { opacity: 0, transform: 'translateX(-24px)' }, { opacity: 0, transform: 'translateX(-24px)', offset: 0.26 },
      { opacity: 1, transform: 'none', offset: 0.42 }, { opacity: 1, transform: 'none', offset: 0.72 },
      { opacity: 0, transform: 'translateX(24px)', offset: 0.86 }, { opacity: 0, transform: 'translateX(24px)' },
    ], { duration: wipe.ms, easing: 'linear', fill: 'both' });
  }, [wipe.key]);
  return (
    <div ref={ref} className="hf-wipe" aria-hidden="true">
      <div className="hf-wipe-accent"/>
      <div className="hf-wipe-ink">
        <span className="hf-wipe-label">
          <img src="assets/mark-slime.png" alt="" width="28" height="28"/>
          {wipe.label}
        </span>
      </div>
    </div>
  );
}

// The big mic: pulsing rings while listening, the live words while hearing, a waveform while
// speaking. "Tap to talk" when the voice loop is off or paused; "Type in the panel" without one.
function HFMic({ voice, thinking, panelOpen }) {
  const has = !!window.slVoice;
  const state = has ? (voice || 'off') : 'none';
  let label, cls, action;
  if (state === 'speaking') { label = 'Speaking'; cls = 'is-speaking'; action = 'stop'; }
  else if (thinking) { label = 'Thinking'; cls = 'is-thinking'; action = null; }
  else if (state === 'listening') { label = 'Listening'; cls = 'is-listening'; action = 'stop'; }
  else if (state === 'hearing') { label = 'Hearing you'; cls = 'is-listening is-hearing'; action = 'stop'; }
  else if (state === 'unsupported') { label = 'Voice needs Chrome. Type in the panel'; cls = 'is-off'; action = 'type'; }
  else if (state === 'none') { label = 'Type in the panel'; cls = 'is-off'; action = 'type'; }
  else { label = 'Tap to talk'; cls = 'is-idle'; action = 'start'; }

  const onClick = () => {
    const v = window.slVoice;
    if (action === null) return;
    if (action === 'start' && v) v.start();
    else if (action === 'stop' && v) v.stop();
    else if (action === 'type' || !v) {
      if (window.slConcierge && !panelOpen) window.slConcierge.open();
      const input = document.querySelector('.cc-input');
      if (input) input.focus({ preventScroll: true });
    }
  };
  const aria = action === 'start' ? 'Start talking to the concierge'
    : action === 'stop' ? `${label}. Tap to pause the mic`
    : action === 'type' ? 'Type to the concierge in the panel' : label;

  return (
    <div className="hf-mic">
      <button type="button" className={'hf-orb ' + cls} onClick={onClick} aria-label={aria}
        aria-disabled={action === null ? 'true' : undefined}>
        <i className="hf-orb-ring" aria-hidden="true"/><i className="hf-orb-ring" aria-hidden="true"/>
        <i className="hf-orb-spin" aria-hidden="true"/>
        {state === 'speaking'
          ? <span className="hf-wave" aria-hidden="true"><i/><i/><i/><i/><i/></span>
          : <Icon name="mic" size={26} stroke={2}/>}
      </button>
      <span className="hf-mic-label" role="status">{label}</span>
    </div>
  );
}

function HFStage({ cart }) {
  const stageRef = hfUseRef(null);
  const pillRef = hfUseRef(null);
  const [agent, setAgent] = hfUseState(() => ({ text: hfMemory.agent || HF_DEFAULT_LINE, error: false }));
  const [user, setUser] = hfUseState(hfMemory.user);
  const [live, setLive] = hfUseState('');
  const [thinking, setThinking] = hfUseState(hfMemory.thinking);
  const [voice, setVoice] = hfUseState(hfVoiceState);
  const [panelOpen, setPanelOpen] = hfUseState(() => hfMemory.panelOpen || !!document.querySelector('.cc-panel.is-open'));
  // Mid-chat switch: show the PayPal approval still open, the most recent one if both are.
  const [visual, setVisual] = hfUseState(() => {
    const { checkout: c, subscription: s } = hfMemory;
    if (s && (!c || hfMemory.lastWait === 'subscription')) {
      return { kind: 'waiting', what: 'subscription', total: s.total, cadence: s.cadence, key: 'w0' };
    }
    return c ? { kind: 'waiting', what: 'order', total: c.total, key: 'w0' } : null;
  });
  const [accent, setAccent] = hfUseState(null);
  const [glows, setGlows] = hfUseState([{ color: null, id: 0 }]);
  const [wipe, setWipe] = hfUseState(null);
  const [shownCount, setShownCount] = hfUseState(cart.count);

  const aliveRef = hfUseRef(true);
  const timersRef = hfUseRef(new Set());
  const flyersRef = hfUseRef(new Set());
  const queueRef = hfUseRef(Promise.resolve());
  const fillingRef = hfUseRef(false);
  const countRef = hfUseRef(cart.count);
  countRef.current = cart.count;
  const busyRef = hfUseRef(0);
  const keyRef = hfUseRef(0);
  const nextKey = () => ++keyRef.current;
  const lastSubStartRef = hfUseRef(0);
  const subDataRef = hfUseRef({});
  const mainRef = hfUseRef(null);
  const wordsRef = hfUseRef(null);
  const [fitTick, setFitTick] = hfUseState(0);

  const wait = ms => new Promise(resolve => {
    const t = setTimeout(() => { timersRef.current.delete(t); resolve(); }, ms);
    timersRef.current.add(t);
  });
  // Beats run one after another; a turn's tool/pack/checkout events arrive in the same tick.
  const enqueue = fn => {
    busyRef.current++;
    queueRef.current = queueRef.current
      .then(() => (aliveRef.current ? fn() : null))
      .catch(err => { console.warn('[handsfree]', err && err.message); })
      .then(() => { busyRef.current--; });
  };

  const playWipe = async label => {
    const ms = hfReduced() ? 420 : 1100;
    setWipe({ label, ms, key: nextKey() });
    await wait(ms);
    if (aliveRef.current) setWipe(null);
  };

  // Visual 3: clones of the pack's bottles arc into the Fridge pill. Stage-local because the Legacy
  // nav (where SLGame.loot lands) is hidden in this mode.
  const flyToFridge = () => {
    const root = stageRef.current, pill = pillRef.current;
    if (!root || !pill || hfReduced()) return Promise.resolve();
    const b = pill.getBoundingClientRect();
    const imgs = Array.from(root.querySelectorAll('.hf-pack .hf-bottle img'));
    return Promise.all(imgs.map((img, i) => {
      const a = img.getBoundingClientRect();
      if (!a.width) return null;
      const fly = document.createElement('img');
      fly.src = img.currentSrc || img.src;
      fly.alt = '';
      fly.className = 'hf-fly';
      fly.setAttribute('aria-hidden', 'true');
      fly.style.left = `${a.left}px`;
      fly.style.top = `${a.top}px`;
      fly.style.width = `${a.width}px`;
      fly.style.height = `${a.height}px`;
      document.body.appendChild(fly);
      flyersRef.current.add(fly);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const anim = hfAnimate(fly, [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.42}px, ${Math.min(dy, 0) * 0.55 - 70}px) scale(0.55) rotate(-16deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.1) rotate(-34deg)`, opacity: 0.3 },
      ], { duration: 780, delay: i * 110, easing: 'cubic-bezier(0.5, 0, 0.4, 1)', fill: 'both' });
      const done = () => { fly.remove(); flyersRef.current.delete(fly); };
      if (!anim || !anim.finished) { done(); return null; }
      return anim.finished.then(done, done);
    }));
  };

  const bumpPill = () => {
    const reduced = hfReduced();
    hfAnimate(pillRef.current, reduced ? [{ opacity: 0.5 }, { opacity: 1 }]
      : [{ transform: 'scale(1.16)' }, { transform: 'none' }],
      { duration: reduced ? 160 : 520, easing: reduced ? 'linear' : 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
  };

  const beatPack = pack => async () => {
    const items = (pack.items || []).filter(i => i && i.id && i.qty > 0);
    const key = nextKey();
    const reduced = hfReduced();
    try {
      if (!items.length) return;
      const top = items.reduce((m, i) => (i.qty > m.qty ? i : m), items[0]);
      const f = hfFlavor(top.id);
      if (f) setAccent(f.color);
      const bottles = pack.bottles || items.reduce((s, i) => s + i.qty, 0);
      setVisual({ kind: 'pack', items, bottles, total: pack.total, stored: false, key });
      await wait(reduced ? 450 : 900 + items.length * 170);
      if (!aliveRef.current) return;
      await flyToFridge();
    } finally {
      // Whatever happened above, the pill goes back to following the cart.
      fillingRef.current = false;
      if (aliveRef.current) setShownCount(countRef.current);
    }
    if (!aliveRef.current) return;
    bumpPill();
    setVisual(v => (v && v.key === key ? { ...v, stored: true } : v));
    await wait(reduced ? 200 : 450);
  };

  const beatCheckout = checkout => async () => {
    if (!checkout) {
      setVisual(v => (v && v.kind === 'waiting' && v.what === 'order' ? null : v));
      return;
    }
    await playWipe('→ CHECKOUT');
    if (!aliveRef.current) return;
    setVisual({ kind: 'waiting', what: 'order', total: checkout.total, id: checkout.orderId, key: nextKey() });
  };

  // Reads the subscription's amount and cadence when the visual shows (after the wipe), so a later
  // event of the same start that carries them still lands.
  // A subscription retired before its turn (a payment came first) plays nothing.
  const beatSubscribe = () => async () => {
    if ((subDataRef.current || {}).retired) return;
    await playWipe('→ SUBSCRIPTION');
    if (!aliveRef.current) return;
    const d = subDataRef.current || {};
    if (d.retired) return;
    setVisual({ kind: 'waiting', what: 'subscription', total: d.total, cadence: d.cadence, key: nextKey() });
  };

  const beatSuccess = v => async () => {
    const key = nextKey();
    setVisual({ ...v, kind: 'success', key });
    const t = setTimeout(() => {
      timersRef.current.delete(t);
      if (aliveRef.current) setVisual(cur => (cur && cur.key === key ? null : cur));
    }, HF_SUCCESS_MS);
    timersRef.current.add(t);
  };

  // d: { total, cadence } (either may be missing). Starts within 2 s of each other are one start:
  // the later one only fills in the amount and cadence, on the visual if it is already up.
  const subscribeStart = d => {
    const info = { total: d && d.total, cadence: d && d.cadence };
    const now = Date.now();
    const repeat = now - lastSubStartRef.current < 2000;
    const prev = subDataRef.current || {};
    subDataRef.current = repeat
      ? { total: info.total != null ? info.total : prev.total, cadence: info.cadence || prev.cadence }
      : info;
    if (repeat) {
      const { total, cadence } = subDataRef.current;
      setVisual(v => (v && v.kind === 'waiting' && v.what === 'subscription' ? { ...v, total, cadence } : v));
      return;
    }
    lastSubStartRef.current = now;
    enqueue(beatSubscribe());
  };

  hfUseEffect(() => {
    const onConcierge = e => {
      const d = (e && e.detail) || {};
      switch (d.type) {
        case 'reply':
          if (d.text) setAgent({ text: String(d.text), error: false });
          break;
        case 'error':
          setAgent({ text: d.message || 'Something glitched. Try that again.', error: true });
          break;
        case 'user-message':
          if (!d.auto && d.text) setUser(String(d.text));
          setLive('');
          break;
        case 'thinking':
          setThinking(!!d.on);
          break;
        case 'open': setPanelOpen(true); break;
        case 'close': setPanelOpen(false); break;
        case 'tool':
          if (d.tool === 'open_fridge') enqueue(() => playWipe('→ FRIDGE'));
          break;
        case 'pack':
          if (d.pack) { fillingRef.current = true; enqueue(beatPack(d.pack)); }
          break;
        case 'checkout':
          enqueue(beatCheckout(d.checkout || null));
          break;
        case 'subscription':
          // concierge.jsx: { subscription: { subscriptionId, total, cadence, ... } }, or null when a
          // payment retired the unapproved one (then its waiting visual goes too).
          if (d.subscription) subscribeStart(d.subscription);
          else if ('subscription' in d) {
            // Queued, so a subscription beat still waiting its turn can't bring the visual back.
            subDataRef.current = { retired: true };
            lastSubStartRef.current = 0;
            enqueue(async () => {
              setVisual(v => (v && v.kind === 'waiting' && v.what === 'subscription' ? null : v));
            });
          } else subscribeStart(d);
          break;
        case 'subscribe': case 'subscribing':
          subscribeStart(d);
          break;
        case 'paid':
          enqueue(beatSuccess({ what: 'order', id: d.orderId, amount: d.amount }));
          break;
        case 'subscribed':
          enqueue(beatSuccess({ what: 'subscription', id: d.subscriptionId, cadence: d.cadence, amount: d.total }));
          break;
        default:
      }
    };
    const onVoice = e => {
      const d = (e && e.detail) || {};
      if (d.state) setVoice(d.state);
      if (d.state === 'hearing') setLive(String(d.interim || ''));
      else setLive('');
      if (d.final) setUser(String(d.final));
    };
    // A payment made in the Fridge drawer (the concierge's own payments arrive as 'paid' above).
    const onPaid = e => {
      const d = (e && e.detail) || {};
      if (d.source === 'concierge') return;
      enqueue(beatSuccess({ what: 'order', id: d.orderId }));
    };
    window.addEventListener('sl-concierge', onConcierge);
    window.addEventListener('sl-voice', onVoice);
    window.addEventListener('sl-paid', onPaid);
    // voice.jsx may load after this file: look for window.slVoice again once the page settles.
    const late = setTimeout(() => setVoice(hfVoiceState()), 1500);
    return () => {
      window.removeEventListener('sl-concierge', onConcierge);
      window.removeEventListener('sl-voice', onVoice);
      window.removeEventListener('sl-paid', onPaid);
      clearTimeout(late);
    };
  }, []);

  // Unmount: stop every pending beat and remove any bottle still in flight.
  hfUseEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
      flyersRef.current.forEach(n => n.remove());
      flyersRef.current.clear();
    };
  }, []);

  // Cart count: follows the cart, except while a pack is flying in (then it ticks on landing).
  hfUseEffect(() => {
    if (!fillingRef.current) setShownCount(cart.count);
  }, [cart.count]);

  // The Fridge opened (from the concierge's "Open my Fridge" card). The wipe plays right away, as
  // the drawer slides in, and only when no other beat is queued: a late band would announce a
  // move that already happened. The stage's own pill skips it (the shopper knows where they went).
  const fridgeWasOpen = hfUseRef(cart.cartOpen);
  const pillOpenRef = hfUseRef(false);
  hfUseEffect(() => {
    const opened = cart.cartOpen && !fridgeWasOpen.current;
    fridgeWasOpen.current = cart.cartOpen;
    const fromPill = pillOpenRef.current;
    pillOpenRef.current = false;
    if (opened && !fromPill && busyRef.current === 0) enqueue(() => playWipe('→ FRIDGE'));
  }, [cart.cartOpen]);

  // Flavor tint: the new glow fades in over the old one (opacity only), then the older ones go.
  hfUseEffect(() => {
    if (!accent) return;
    const id = nextKey();
    setGlows(g => [...g.slice(-1), { color: accent, id }]);
    const t = setTimeout(() => { timersRef.current.delete(t); setGlows(g => g.slice(-1)); }, 900);
    timersRef.current.add(t);
  }, [accent]);

  // Refit the agent's line when its room changes: window or panel resize, a visual coming or going
  // or growing, the shopper's line or the mic label wrapping, the display font arriving. Keyed on
  // the room itself (which leaves the agent's line out), so the fit's own reflow doesn't loop.
  hfUseEffect(() => {
    let raf = 0, last = '';
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const m = mainRef.current, w = wordsRef.current;
        if (!m || !w || !aliveRef.current) return;
        const sig = `${m.clientWidth}|${hfSayRoom(w.querySelector('.hf-say'))}`;
        if (sig === last) return;
        last = sig;
        setFitTick(t => t + 1);
      });
    };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null;
    if (ro && mainRef.current) {
      ro.observe(mainRef.current);
      Array.from(mainRef.current.children).forEach(c => ro.observe(c));
    } else window.addEventListener('resize', check);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { last = ''; check(); }, () => {});
    }
    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', check);
    };
  }, []);

  // Stage enter.
  hfUseLayoutEffect(() => {
    hfAnimate(stageRef.current, [{ opacity: 0 }, { opacity: 1 }], { duration: hfReduced() ? 160 : 360, easing: 'linear' });
  }, []);

  const youText = live || user;
  const style = accent ? { '--hf-accent': accent } : undefined;

  return (
    <section ref={stageRef} className={'hf-stage' + (panelOpen ? ' is-panel' : '')} style={style} aria-label="Hands-free mode">
      <div className="hf-bg" aria-hidden="true">
        {glows.map(g => <HFGlow key={g.id} color={g.color}/>)}
      </div>
      <span className="hf-frame" aria-hidden="true"><i/><i/><i/><i/></span>

      <header className="hf-top">
        <span className="hf-brand">
          <img src="assets/mark-slime.png" alt="" width="30" height="30"/>
          <span>Slime Lime <em>Hands-free</em></span>
        </span>
        <span className="hf-actions">
          <button ref={pillRef} type="button" className="hf-pill"
            onClick={() => { if (!cart.cartOpen) { pillOpenRef.current = true; cart.setCartOpen(true); } }}
            aria-label={`Open the Fridge, ${shownCount} ${shownCount === 1 ? 'bottle' : 'bottles'}`}>
            <Icon name="cart" size={16}/>
            <span className="hf-pill-name">Fridge</span>
            <b>{shownCount}</b>
          </button>
          <button type="button" className="hf-exit" onClick={() => window.slMode && window.slMode.set('legacy', 'stage')}>
            Legacy mode
          </button>
        </span>
      </header>

      <div ref={mainRef} className="hf-main">
        <div className={'hf-visual' + (visual ? ' is-' + visual.kind : '')}>
          {visual && visual.kind === 'pack' && <HFPack key={visual.key} visual={visual}/>}
          {visual && visual.kind === 'waiting' && <HFWaiting key={visual.key} visual={visual}/>}
          {visual && visual.kind === 'success' && <HFSuccess key={visual.key} visual={visual}/>}
        </div>
        <div ref={wordsRef} className="hf-words">
          {youText
            ? <p className={'hf-you' + (live ? ' is-live' : '')}>“{youText}”</p>
            : <p className="hf-you is-hint">Try “late-night ranked, nothing too sweet.”</p>}
          <HFSay key={agent.text} text={agent.text} error={agent.error}
            fitKey={`${fitTick}|${visual ? `${visual.kind}:${visual.key}` : ''}|${panelOpen}`}/>
        </div>
        <HFMic voice={voice} thinking={thinking} panelOpen={panelOpen}/>
      </div>

      <div className="hf-fx" aria-hidden="true">
        {wipe && <HFWipe key={wipe.key} wipe={wipe}/>}
      </div>
    </section>
  );
}

function HFGlow({ color }) {
  const ref = hfUseRef(null);
  hfUseLayoutEffect(() => {
    hfAnimate(ref.current, [{ opacity: 0 }, { opacity: 1 }], { duration: hfReduced() ? 180 : 800, easing: 'linear' });
  }, []);
  return <i ref={ref} className="hf-glow" style={color ? { '--g': color } : undefined}/>;
}

// Mounted by App: renders the stage only in Hands-free mode.
function HandsFreeStage({ cart }) {
  const [mode, setMode] = hfUseState(() => (window.slMode ? window.slMode.get() : 'legacy'));
  hfUseEffect(() => {
    let prev = window.slMode ? window.slMode.get() : 'legacy';
    let raf = 0;
    const onMode = () => {
      const next = window.slMode ? window.slMode.get() : 'legacy';
      // site.css parks the Legacy page off-screen in Hands-free (so the 3D hero's loop stops): on
      // the way back, re-measure the scroll triggers in case the window was resized meanwhile.
      if (prev === 'handsfree' && next === 'legacy' && window.ScrollTrigger) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => window.ScrollTrigger.refresh());
      }
      prev = next;
      setMode(next);
    };
    window.addEventListener('sl-mode', onMode);
    return () => { window.removeEventListener('sl-mode', onMode); cancelAnimationFrame(raf); };
  }, []);
  if (mode !== 'handsfree') return null;
  return <HFStage cart={cart}/>;
}

Object.assign(window, { HandsFreeStage });
