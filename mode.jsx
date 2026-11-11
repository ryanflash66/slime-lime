/* global React */
// MODE PICKER: Hands-free (voice-driven Flavor Concierge) vs Legacy (the normal store).
// Shown once per browser. Closing, Escape, the backdrop and "Skip" all mean Legacy, so a shopper
// who doesn't want voice still gets the full store.
//
//   window.slMode.get()      -> 'handsfree' | 'legacy' (Legacy until a choice is made)
//   window.slMode.chosen()   -> true once a mode was picked (this visit or stored)
//   window.slMode.set(mode)  -> stores it in localStorage['sl-mode-v1'], sets <html data-mode>,
//                               fires window 'sl-mode' ({ detail: { mode, source } }) and, for
//                               'handsfree', opens the concierge (window.slConcierge.open()).
//
// <html data-mode="handsfree|legacy"> is there so the hands-free stage can hide the Legacy
// chrome with CSS.
const { useState: useStateMode, useEffect: useEffectMode, useRef: useRefMode, useLayoutEffect: useLayoutEffectMode } = React;

const MODE_KEY = 'sl-mode-v1';
const MODE_VALUES = ['handsfree', 'legacy'];
const MODE_CLOSE_MS = 220;

function modeReadStored() {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return MODE_VALUES.includes(v) ? v : null;
  } catch (e) {
    return null;
  }
}

// Kept in memory too, so a blocked or full localStorage still holds the choice for this visit.
let modeCurrent = modeReadStored();

function modeApplyDom(mode) {
  try { document.documentElement.dataset.mode = mode; } catch (e) {}
}

function modeEmit(mode, source) {
  try { window.dispatchEvent(new CustomEvent('sl-mode', { detail: { mode, source } })); } catch (e) {}
}

const slMode = {
  get: () => modeCurrent || 'legacy',
  chosen: () => modeCurrent !== null,
  set(mode, source = 'api') {
    if (!MODE_VALUES.includes(mode)) return slMode.get();
    const prev = slMode.get();
    modeCurrent = mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    modeApplyDom(mode);
    modeEmit(mode, source);
    // window.slConcierge is set while <Concierge> renders (concierge.jsx), which App mounts first.
    const cc = window.slConcierge;
    if (cc && mode === 'handsfree') cc.open();
    // Leaving Hands-free for the store: put the concierge back behind its launcher.
    else if (cc && prev === 'handsfree' && mode === 'legacy') cc.close();
    return mode;
  },
};

modeApplyDom(slMode.get());

// Another tab changed the mode: follow it here (without opening anything).
window.addEventListener('storage', e => {
  if (e.key !== MODE_KEY) return;
  const next = modeReadStored();
  if (!next || next === modeCurrent) return;
  const prev = modeCurrent;
  modeCurrent = next;
  modeApplyDom(next);
  modeEmit(next, 'storage');
  // Keep this tab consistent with slMode.set(): leaving Hands-free closes the concierge.
  if (prev === 'handsfree' && next === 'legacy' && window.slConcierge) window.slConcierge.close();
});

const MODE_HAS_SPEECH = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// Enter/exit motion runs on WAAPI, not CSS keyframes: under reduced motion site.css pauses every
// CSS animation (animation-play-state: paused), which would freeze the picker invisible.
// Reduced motion gets opacity-only fades.
function modeAnimate(el, frames, opts) {
  if (!el || typeof el.animate !== 'function') return null;
  return el.animate(frames, { easing: 'cubic-bezier(0.23, 1, 0.32, 1)', ...opts });
}

function ModePicker() {
  // 'open' | 'closing' | 'hidden'
  const [phase, setPhase] = useStateMode(() => (slMode.chosen() ? 'hidden' : 'open'));
  const rootRef = useRefMode(null);
  const dialogRef = useRefMode(null);
  const firstRef = useRefMode(null);
  const returnFocusRef = useRefMode(null);

  // A returning hands-free shopper lands straight in the concierge.
  useEffectMode(() => {
    if (!slMode.chosen() || slMode.get() !== 'handsfree') return;
    if (window.slConcierge) { window.slConcierge.open(); return; }
    const raf = requestAnimationFrame(() => { if (window.slConcierge && slMode.get() === 'handsfree') window.slConcierge.open(); });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Any mode change (this picker, the nav toggle, another tab) closes the picker.
  useEffectMode(() => {
    const onMode = () => setPhase(p => (p === 'open' ? 'closing' : p));
    window.addEventListener('sl-mode', onMode);
    return () => window.removeEventListener('sl-mode', onMode);
  }, []);

  // Enter: focus the first card, fade (and, with motion, rise) in.
  useLayoutEffectMode(() => {
    if (phase !== 'open' || !rootRef.current) return;
    const ae = document.activeElement;
    returnFocusRef.current = ae && ae !== document.body ? ae : null;
    if (firstRef.current) firstRef.current.focus({ preventScroll: true });
    const reduced = shellMatches(SHELL_REDUCED_MOTION);
    const rise = reduced ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(14px) scale(0.98)' }, { opacity: 1, transform: 'none' }];
    const root = rootRef.current;
    modeAnimate(root.querySelector('.mp-backdrop'), [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    modeAnimate(dialogRef.current, rise, { duration: reduced ? 220 : 360 });
    root.querySelectorAll('.mp-card').forEach((el, i) =>
      modeAnimate(el, rise, { duration: reduced ? 220 : 420, delay: reduced ? 0 : 60 + i * 50, fill: 'backwards' }));
  }, [phase]);

  // Exit: fade out, then unmount and hand focus back.
  useEffectMode(() => {
    if (phase !== 'closing') return;
    const root = rootRef.current;
    const reduced = shellMatches(SHELL_REDUCED_MOTION);
    if (root) {
      modeAnimate(root.querySelector('.mp-backdrop'), [{ opacity: 1 }, { opacity: 0 }], { duration: MODE_CLOSE_MS, fill: 'forwards' });
      modeAnimate(dialogRef.current, reduced ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(0.985)' }],
        { duration: MODE_CLOSE_MS, fill: 'forwards' });
    }
    const t = setTimeout(() => {
      setPhase('hidden');
      const el = returnFocusRef.current;
      returnFocusRef.current = null;
      // Only if nothing else (the concierge input) took focus meanwhile.
      const lost = !document.activeElement || document.activeElement === document.body
        || (root && root.contains(document.activeElement));
      if (lost && el && document.contains(el) && typeof el.focus === 'function') el.focus({ preventScroll: true });
    }, MODE_CLOSE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Escape = Legacy; Tab stays inside the dialog.
  useEffectMode(() => {
    if (phase !== 'open') return;
    const onKey = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        slMode.set('legacy', 'picker');
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll(SHELL_FOCUSABLE));
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [phase]);

  // Lock page scroll while the picker is up.
  const shown = phase !== 'hidden';
  useEffectMode(() => {
    if (!shown) return;
    const body = document.body;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    const prev = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    body.style.overflow = 'hidden';
    if (gutter > 0) body.style.paddingRight = `${gutter}px`;
    return () => { body.style.overflow = prev.overflow; body.style.paddingRight = prev.paddingRight; };
  }, [shown]);

  if (!shown) return null;
  const choose = mode => () => { if (phase === 'open') slMode.set(mode, 'picker'); };

  return (
    <div ref={rootRef} className={'mp-root' + (phase === 'closing' ? ' is-closing' : '')}>
      <div className="mp-backdrop" aria-hidden="true" onClick={choose('legacy')}/>
      <div ref={dialogRef} className="mp-dialog thin-scroll" role="dialog" aria-modal="true"
        aria-labelledby="mp-title" aria-describedby="mp-desc">
        <span className="hud-frame-corners" aria-hidden="true"/>
        <div className="mp-top">
          <span className="eyebrow">Select mode</span>
          <span className="mono-sm mp-ready" aria-hidden="true"><span className="mp-ready-dot"/>PLAYER 1 · READY</span>
        </div>
        <h2 id="mp-title" className="display-lg mp-title">How do you want to shop?</h2>
        <p id="mp-desc" className="mp-desc">Talk to the AI Flavor Concierge, or browse the store the usual way. Switch any time with the mic in the nav.</p>

        <div className="mp-cards">
          <button ref={firstRef} type="button" className="mp-card is-handsfree" onClick={choose('handsfree')}
            aria-labelledby="mp-hf-name" aria-describedby={'mp-hf-line' + (MODE_HAS_SPEECH ? '' : ' mp-hf-note')}>
            <span className="mp-card-top">
              <span className="mp-icon" aria-hidden="true"><Icon name="mic" size={26}/></span>
              <span className="mp-wave" aria-hidden="true"><i/><i/><i/><i/><i/></span>
              <span className="mp-tag" aria-hidden="true">VOICE · AI</span>
            </span>
            <span id="mp-hf-name" className="mp-card-name">Hands-free</span>
            <span id="mp-hf-line" className="mp-card-line">Say how you play. The concierge builds your pack and lines up the PayPal checkout. You just approve.</span>
            {!MODE_HAS_SPEECH && <span id="mp-hf-note" className="mp-note">Chrome works best</span>}
            <span className="mp-card-cta" aria-hidden="true">Start talking <Icon name="arrow" size={16}/></span>
          </button>

          <button type="button" className="mp-card is-legacy" onClick={choose('legacy')}
            aria-labelledby="mp-lg-name" aria-describedby="mp-lg-line">
            <span className="mp-card-top">
              <span className="mp-icon" aria-hidden="true"><Icon name="cart" size={24}/></span>
              <span className="mp-tag" aria-hidden="true">CLASSIC</span>
            </span>
            <span id="mp-lg-name" className="mp-card-name">Legacy</span>
            <span id="mp-lg-line" className="mp-card-line">The full store. Browse flavors, stock your Fridge, subscribe and check out.</span>
            <span className="mp-card-cta" aria-hidden="true">Browse the store <Icon name="arrow" size={16}/></span>
          </button>
        </div>

        <div className="mp-foot">
          <span className="mono-sm mp-hint" aria-hidden="true">ESC · SKIP = LEGACY</span>
          <button type="button" className="btn btn-ghost mp-skip" onClick={choose('legacy')}>Skip</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ModePicker, slMode });
