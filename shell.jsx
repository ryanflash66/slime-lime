/* global React */
// Shared shell: Nav, Footer, Icon, Wordmark, cart hook + theme (the cart UI is fridge.jsx)
const { useState, useEffect, useRef, useMemo, createContext, useContext } = React;

// ─────────────────────────────────────────────────────────────
// FLAVORS
// ─────────────────────────────────────────────────────────────
const FLAVORS = [
  { id: 'lemon-lime', name: 'Lemon · Lime',    short: 'Lemon-Lime',    tagline: "The original. Clean focus, 12-hour hydration.",      price: 2.50, color: '#CAE00F', accent: '#7A8A00', deep: '#8BBE1C', soft: 'rgba(202,224,15,0.16)', sub: 'Clean focus',     flagship: true,  desc: "Crisp lemon, real lime, electrolyte base. The flavor that started it all." },
  { id: 'cherry',     name: 'Cherry Cool',     short: 'Cherry',        tagline: "Tart and crisp. The dark-mode flavor.",              price: 2.50, color: '#FF3D5C', accent: '#A8132B', deep: '#FF3D5C', soft: 'rgba(255,61,92,0.16)',  sub: 'Tart · Crisp',    desc: "Sour cherry pulled back with cane and a clean finish. Built for late-night focus runs." },
  { id: 'blue-rasp',  name: 'Blue Raspberry',  short: 'Blue Rasp',     tagline: "Electric blue. For the cold-zone runs.",             price: 2.50, color: '#3D8BFF', accent: '#0F4FB3', deep: '#3D8BFF', soft: 'rgba(61,139,255,0.16)', sub: 'Electric · Iced', desc: "Cold, electric, and sharp. Tastes like the inside of an ice arena, but legal." },
  { id: 'mango',      name: 'Mango Rush',      short: 'Mango',         tagline: "Bright tropical hit. New for 2026.",                 price: 2.75, color: '#FF9A1F', accent: '#A85A00', deep: '#FF9A1F', soft: 'rgba(255,154,31,0.16)', sub: 'Tropical · Bright', isNew: true, desc: "Real mango pulp, finished with a crackle of citrus. Loud flavor, low sugar." },
  { id: 'grape',      name: 'Grape Glitch',    short: 'Grape',         tagline: "Deep, weird, addictive.",                            price: 2.75, color: '#B96BFF', accent: '#6A2EAF', deep: '#B96BFF', soft: 'rgba(185,107,255,0.16)', sub: 'Deep · Addictive', isNew: true, desc: "Concord grape with a glitch. Sweet, dark, and just a little wrong on purpose." },
  { id: 'watermelon', name: 'Watermelon',      short: 'Watermelon',    tagline: "Light and clean. Pre-game pick.",                    price: 2.50, color: '#FF6B8A', accent: '#B23052', deep: '#FF6B8A', soft: 'rgba(255,107,138,0.16)', sub: 'Light · Clean',   desc: "Fresh-cut watermelon with a salt-rim finish. Hydrating, breezy, low calorie." },
];

// ─────────────────────────────────────────────────────────────
// ICON
// ─────────────────────────────────────────────────────────────
function Icon({ name, size = 20, stroke = 1.75 }) {
  const paths = {
    cart:   <><path d="M3 6h18l-2 13H5L3 6z"/><path d="M8 10v6M16 10v6"/><path d="M3 6L5 3h14l2 3"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></>,
    arrow:  <path d="M5 12h14M12 5l7 7-7 7"/>,
    arrowR: <path d="M5 12h14M12 5l7 7-7 7"/>,
    arrowL: <path d="M19 12H5M12 19l-7-7 7-7"/>,
    arrowDown: <path d="M12 5v14M5 12l7 7 7-7"/>,
    check:  <path d="M20 6L9 17l-5-5"/>,
    bolt:   <path d="M13 2L3 14h7l-1 8 11-12h-7l1-8z"/>,
    plus:   <path d="M12 5v14M5 12h14"/>,
    minus:  <path d="M5 12h14"/>,
    x:      <path d="M18 6L6 18M6 6l12 12"/>,
    user:   <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></>,
    menu:   <><path d="M3 6h18M3 12h18M3 18h18"/></>,
    chevR:  <path d="M9 6l6 6-6 6"/>,
    chevD:  <path d="M6 9l6 6 6-6"/>,
    flame:  <path d="M12 2c1 4 4 5 4 9a4 4 0 11-8 0c0-2 1-3 1-5 2 1 3 0 3-4z"/>,
    drop:   <path d="M12 2s6 7 6 12a6 6 0 11-12 0c0-5 6-12 6-12z"/>,
    leaf:   <><path d="M11 20A7 7 0 014 13c0-7 7-11 16-11 0 9-4 16-11 16z"/><path d="M2 22l8-8"/></>,
    twitch: <path d="M4 3v15l4 3v-3h4l5-5V3H4zm10 8l-3 3v-3H8V5h10v6h-4z"/>,
    discord:<path d="M19 5a14 14 0 00-3.5-1l-.2.4A11 11 0 0112 4a11 11 0 00-3.3.4L8.5 4A14 14 0 005 5C2 9 1.5 14 2 19c1.5 1 3 1.7 4.6 2l1-1.4a8 8 0 01-1.6-.8l.4-.3a10 10 0 0011.2 0l.4.3a8 8 0 01-1.6.8L17.4 21c1.5-.3 3-1 4.5-2 .6-5-.5-10-3-15zM9 16c-1 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2zm6 0c-1 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2z"/>,
    shield: <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></>,
    pause:  <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
    skip:   <><path d="M5 4l10 8-10 8V4z"/><path d="M19 5v14"/></>,
    swap:   <><path d="M7 7h13l-3-3M17 17H4l3 3"/></>,
    chip:   <><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></>,
    star:   <path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>,
    map:    <><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// WORDMARK with drip animation on entry
// ─────────────────────────────────────────────────────────────
function Wordmark({ size = 22, withMark = true, color = 'var(--fg-1)' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.45, position: 'relative' }}>
      {withMark && (
        <img src="assets/logo-glow-1024.png" alt=""
             style={{ height: size * 1.7, width: 'auto', display: 'block', filter: 'drop-shadow(0 0 12px var(--accent-glow))' }}/>
      )}
      <span style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800, fontSize: size, letterSpacing: '-0.04em',
        color, lineHeight: 1, position: 'relative'
      }}>
        SLIME&nbsp;LIME
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// THEME — applies the active flavor's accent to :root
// ─────────────────────────────────────────────────────────────
function useFlavorTheme(flavor) {
  useEffect(() => {
    if (!flavor) return;
    const root = document.documentElement;
    root.style.setProperty('--accent', flavor.color);
    root.style.setProperty('--accent-deep', flavor.deep);
    root.style.setProperty('--accent-soft', flavor.soft);
    // Glow color from accent
    const m = flavor.color.match(/#(..)(..)(..)/);
    if (m) {
      const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
      root.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.55)`);
    }
  }, [flavor]);
}

// ─────────────────────────────────────────────────────────────
// CART HOOK with persistence
// ─────────────────────────────────────────────────────────────
function useCart() {
  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem('sl-cart');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [{ ...FLAVORS[0], qty: 12 }];
  });
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('sl-cart', JSON.stringify(cart)); } catch (e) {}
  }, [cart]);

  const add = (f, qty = 1) => {
    setCart(c => {
      const ex = c.find(i => i.id === f.id);
      if (ex) return c.map(i => i.id === f.id ? { ...i, qty: i.qty + qty } : i);
      return [...c, { ...f, qty }];
    });
    setCartOpen(true);
  };
  // A subscription is one pack: checking out again replaces it instead of stacking.
  const replaceSubscription = lines => {
    setCart(c => [...c.filter(i => !i.subscription), ...lines]);
    setCartOpen(true);
  };
  const remove = id => setCart(c => c.filter(i => i.id !== id));
  // Fridge close-up: set a flavor's exact count (0 clears the slot) without reopening anything.
  const setQty = (f, qty) => setCart(c => {
    if (qty <= 0) return c.filter(i => i.id !== f.id);
    if (c.some(i => i.id === f.id)) return c.map(i => i.id === f.id ? { ...i, qty } : i);
    return [...c, { ...f, qty }];
  });
  const inc = id => setCart(c => c.map(i => i.id === id ? { ...i, qty: i.qty + 1 } : i));
  const dec = id => setCart(c => c.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty - 1) } : i).filter(i => i.qty > 0));
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  return { cart, count, total, add, replaceSubscription, inc, dec, remove, setQty, cartOpen, setCartOpen };
}

// ─────────────────────────────────────────────────────────────
// SHELL HELPERS (prefixed: all scripts share one global scope)
// ─────────────────────────────────────────────────────────────
function shellMatches(query) {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;
}

function shellUseMedia(query) {
  const [matches, setMatches] = useState(() => shellMatches(query));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);
  return matches;
}

const SHELL_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const SHELL_EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const SHELL_EASE_DRAWER = 'var(--ease-drawer, cubic-bezier(0.32, 0.72, 0, 1))';

// One-shot WAAPI enter; opacity-only under reduced motion.
function shellAnimateIn(el, { y = 4, duration = 200 } = {}) {
  if (!el || typeof el.animate !== 'function') return;
  const frames = shellMatches(SHELL_REDUCED_MOTION)
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'none' }];
  el.animate(frames, { duration, easing: SHELL_EASE_OUT });
}

const shellSrOnly = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

const SHELL_TITLES = [
  ['/flagship',  'Lemon · Lime — Slime Lime'],
  ['/subscribe', 'Subscribe — Slime Lime'],
  ['/story',     'Our story — Slime Lime'],
  ['/faq',       'FAQ — Slime Lime'],
];
const SHELL_HOME_TITLE = 'Slime Lime — Late nights deserve better fuel.';

function shellTitleFor(route) {
  const hit = SHELL_TITLES.find(([path]) => route.startsWith(path));
  return hit ? hit[1] : SHELL_HOME_TITLE;
}

const SHELL_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ─────────────────────────────────────────────────────────────
// HASH ROUTER
// ─────────────────────────────────────────────────────────────
function useRoute() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    // Scrolling (top of page / in-page anchors) is owned by useRouteStage, which runs it
    // once the new page is actually on screen.
    const onHash = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { document.title = shellTitleFor(route); }, [route]);
  return route;
}

const shellRouteBase = r => (r || '/').split('#')[0] || '/';

// Scroll for a freshly shown route: its #anchor (offset by the sticky header), else the top.
function shellScrollForRoute(route, smooth) {
  const anchor = route.split('#')[1];
  const el = anchor && document.getElementById(anchor);
  const M = window.SLMotion;
  if (!el) { if (M) M.scrollTo(0, { instant: true }); else window.scrollTo({ top: 0, behavior: 'instant' }); return; }
  if (M) { M.scrollTo(el, { instant: !smooth }); return; }
  const header = document.querySelector('header');
  const offset = header ? header.offsetHeight : 0;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: smooth ? 'smooth' : 'instant' });
}

// Page transitions. Returns the route to *render*: on a page change it lags the URL until the
// GSAP curtain covers the old page, then swaps, scrolls, uncovers and starts the new page's
// scroll reveals (scoped to pageRef). Anchor-only changes on the same page just scroll.
function useRouteStage(route, pageRef) {
  const [shown, setShown] = useState(route);
  const first = useRef(true);
  useEffect(() => {
    if (route === shown) return;
    if (shellRouteBase(route) === shellRouteBase(shown)) { setShown(route); return; }
    const M = window.SLMotion;
    if (!M) { setShown(route); return; }
    let live = true;
    M.cover().then(() => { if (live) setShown(route); });
    return () => { live = false; };
  }, [route]);
  React.useLayoutEffect(() => {
    const samePage = !first.current && pageRef.current && pageRef.current.dataset.base === shellRouteBase(shown);
    if (first.current) {
      // initial load: only jump for a deep link ("#/story#science")
      if (shown.includes('#')) shellScrollForRoute(shown, false);
    } else {
      shellScrollForRoute(shown, samePage);
    }
    first.current = false;
    if (pageRef.current) pageRef.current.dataset.base = shellRouteBase(shown);
    if (window.SLMotion) window.SLMotion.uncover();
  }, [shown]);
  // Reveals are per page, not per anchor.
  const base = shellRouteBase(shown);
  useEffect(() => {
    const M = window.SLMotion;
    if (!M || !pageRef.current) return;
    return M.pageIn(pageRef.current);
  }, [base]);
  return shown;
}

function navTo(path) {
  window.location.hash = path;
}

// ─────────────────────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────────────────────
const SHELL_NAV_LINKS = [
  { label: 'Shop',      path: '/' },
  { label: 'Flagship',  path: '/flagship' },
  { label: 'Subscribe', path: '/subscribe' },
  { label: 'Story',     path: '/story' },
  { label: 'FAQ',       path: '/faq' },
];

function shellIsActive(path, route) {
  return (path === '/' && (route === '/' || route === '')) || (path !== '/' && route.startsWith(path));
}

// Move the nav indicator under `link` (or the aria-current link when null).
function shellNavIndTo(navRef, indRef, link, instant) {
  const M = window.SLMotion, nav = navRef.current, ind = indRef.current;
  if (!M || !nav || !ind) return;
  const el = link || nav.querySelector('a[aria-current="page"]');
  if (!el) { M.gsap.to(ind, { autoAlpha: 0, duration: 0.2, overwrite: true }); return; }
  const vars = { x: el.offsetLeft, scaleX: el.offsetWidth / 100, autoAlpha: 1, overwrite: true };
  if (instant || M.reduced()) M.gsap.set(ind, vars);
  else M.gsap.to(ind, { ...vars, duration: 0.45, ease: 'expo.out' });
}

// ─────────────────────────────────────────────────────────────
// PLAYERS ONLINE pill (presence.js) — count in the HUD strip, popover with the ghost-cursor toggle
// ─────────────────────────────────────────────────────────────
const shellFmt = n => n.toLocaleString('en-US');

function ShellPresence({ short }) {
  const P = window.SLPresence;
  const [st, setSt] = useState(() => (P ? { ...P.get() } : null));
  const [ghosts, setGhosts] = useState(() => (P ? P.ghosts() : false));
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const numRef = useRef(null);

  useEffect(() => {
    if (!P) return;
    const offA = P.subscribe(s => setSt({ ...s }));
    const offB = P.onGhosts(setGhosts);
    return () => { offA(); offB(); };
  }, []);
  // a quick green blip whenever the number moves
  useEffect(() => {
    const el = numRef.current;
    if (el && el.animate && !shellMatches(SHELL_REDUCED_MOTION)) el.animate([{ color: '#3BEA7C' }, { color: 'var(--fg-1)' }], { duration: 700, easing: 'ease-out' });
  }, [st && st.online]);

  const place = () => {
    const r = btnRef.current && btnRef.current.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, left: Math.max(12, Math.min(window.innerWidth - 280, r.left)) });
  };
  useEffect(() => {
    if (!open) return;
    place();
    const onKey = e => { if (e.key === 'Escape') { setOpen(false); if (btnRef.current) btnRef.current.focus(); } };
    const onDown = e => {
      if (popRef.current && popRef.current.contains(e.target)) return;
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove);
    };
  }, [open]);
  useEffect(() => { if (open && popRef.current) shellAnimateIn(popRef.current, { y: -4, duration: 180 }); }, [open]);

  if (!P || !st) return null;
  const h = st.history, lo = Math.min(...h), hi = Math.max(...h), span = Math.max(1, hi - lo);
  const pts = h.map((v, i) => `${(i / (h.length - 1)) * 240},${30 - ((v - lo) / span) * 26}`).join(' ');
  const reducedMotion = P.reducedMotion && P.reducedMotion();

  return (
    <>
      <button ref={btnRef} type="button" className="sl-online" aria-expanded={open} aria-controls="sl-online-pop"
        aria-label={`${shellFmt(st.online)} players online. Show details`} onClick={() => setOpen(o => !o)}>
        <span className="sl-live-dot" aria-hidden="true"/>
        <span aria-hidden="true"><b ref={numRef}>{shellFmt(st.online)}</b> {short ? 'ONLINE' : 'PLAYERS ONLINE'}</span>
      </button>
      {open && pos && ReactDOM.createPortal(
        <div ref={popRef} id="sl-online-pop" className="sl-online-pop" role="dialog" aria-label="Players online"
          style={{ top: pos.top, left: pos.left }}>
          <div>PLAYERS ONLINE</div>
          <div className="sl-online-big" aria-live="polite">{shellFmt(st.online)} <small>● LIVE</small></div>
          <svg className="sl-online-spark" viewBox="0 0 240 34" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={`0,34 ${pts} 240,34`} fill="rgba(59,234,124,0.10)" stroke="none"/>
            <polyline points={pts} fill="none" stroke="#3BEA7C" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
          </svg>
          <div className="sl-online-row"><span>ON THIS PAGE</span><b>{shellFmt(st.here)}</b></div>
          <button type="button" className="sl-online-toggle" role="switch" aria-checked={ghosts && !reducedMotion}
            disabled={reducedMotion} onClick={() => P.ghosts(!ghosts)}>
            <span>
              Ghost cursors
              <small>{reducedMotion ? 'Off while your device asks for reduced motion.' : 'See where other players are poking around.'}</small>
            </span>
            <span className={'sl-switch' + (ghosts && !reducedMotion ? ' is-on' : '')} aria-hidden="true"/>
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

function Nav({ cartCount, onCart, route }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const narrow = shellUseMedia('(max-width: 899px)');
  const compact = shellUseMedia('(max-width: 599px)');
  const headerRef = useRef(null);
  const burgerRef = useRef(null);
  const panelRef = useRef(null);
  const navRef = useRef(null);
  const indRef = useRef(null);
  const indPlaced = useRef(false);
  const fridgeBtnRef = useRef(null);
  const lastCount = useRef(cartCount);
  // the Fridge button bumps when bottles go in
  useEffect(() => {
    const el = fridgeBtnRef.current, up = cartCount > lastCount.current;
    lastCount.current = cartCount;
    if (up && el && el.animate && !shellMatches(SHELL_REDUCED_MOTION)) {
      el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
  }, [cartCount]);

  // Sliding active indicator: parks under the current page, follows the hovered link.
  useEffect(() => {
    if (narrow) { indPlaced.current = false; return; }
    shellNavIndTo(navRef, indRef, null, !indPlaced.current);
    indPlaced.current = true;
    const onResize = () => shellNavIndTo(navRef, indRef, null, true);
    window.addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [route, narrow]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the disclosure on route change and when leaving the narrow layout.
  useEffect(() => { setMenuOpen(false); }, [route]);
  useEffect(() => { if (!narrow) setMenuOpen(false); }, [narrow]);

  // Escape closes (focus back to the toggle); clicking outside the header closes.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = e => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        if (burgerRef.current) burgerRef.current.focus();
      }
    };
    const onPointer = e => {
      if (headerRef.current && !headerRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) shellAnimateIn(panelRef.current, { y: -4, duration: 180 });
  }, [menuOpen]);

  const go = path => e => {
    e.preventDefault();
    setMenuOpen(false);
    navTo(path);
  };

  const utilityButtons = (
    <>
      <button className="iconbtn" aria-label="Search"><Icon name="search" size={18}/></button>
      <button className="iconbtn" aria-label="Account"><Icon name="user" size={18}/></button>
    </>
  );

  return (
    <header ref={headerRef} style={{
      position: 'sticky', top: 0, zIndex: 80,
      backdropFilter: scrolled || menuOpen ? 'blur(14px)' : 'none',
      WebkitBackdropFilter: scrolled || menuOpen ? 'blur(14px)' : 'none',
      background: scrolled || menuOpen ? 'rgba(6, 13, 8, 0.78)' : 'transparent',
      borderBottom: scrolled ? '1px solid var(--border-1)' : '1px solid transparent',
      transition: `background-color 200ms ${SHELL_EASE_OUT}, border-color 200ms ${SHELL_EASE_OUT}`
    }}>
      {/* Top HUD strip */}
      <div style={{
        background: 'var(--ink-900)',
        borderBottom: '1px solid var(--border-1)',
        padding: '8px 0',
        overflow: 'hidden'
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: narrow ? 'center' : 'space-between', alignItems: 'center', gap: narrow ? 16 : 24 }}>
          {narrow && <ShellPresence short/>}
          <span className="mono-sm" style={{ color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
            <span aria-hidden="true" style={{ color: 'var(--accent)' }}>●</span>&nbsp;&nbsp;{compact ? 'FREE SHIP $40+' : 'FREE SHIPPING ON ORDERS $40+'}
          </span>
          {!narrow && (
            <span className="mono-sm" style={{ color: 'var(--fg-3)', display: 'flex', gap: 16, alignItems: 'center' }}>
              <ShellPresence/>
              <span aria-hidden="true" style={{ opacity: 0.4 }}>|</span>
              <span>SUBSCRIBE → SAVE 28%</span>
              <span aria-hidden="true" style={{ opacity: 0.4 }}>|</span>
              <span>NEW: MANGO + GRAPE</span>
            </span>
          )}
        </div>
      </div>

      {/* Main nav */}
      <div className="container" style={{
        paddingTop: narrow ? 12 : 16, paddingBottom: narrow ? 12 : 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
      }}>
        <a href="#/" onClick={go('/')} aria-label="Slime Lime home" style={{ display: 'flex', textDecoration: 'none', flexShrink: 0 }}>
          <Wordmark size={narrow ? 18 : 22}/>
        </a>
        {!narrow && (
          <nav ref={navRef} aria-label="Primary" onMouseLeave={() => shellNavIndTo(navRef, indRef, null)}
               style={{ display: 'flex', gap: 28, position: 'relative' }}>
            {SHELL_NAV_LINKS.map(l => {
              const active = shellIsActive(l.path, route);
              return (
                <a key={l.path} href={`#${l.path}`}
                   onClick={go(l.path)}
                   onMouseEnter={e => shellNavIndTo(navRef, indRef, e.currentTarget)}
                   aria-current={active ? 'page' : undefined}
                   style={{
                     font: '500 14px/1 var(--font-ui)',
                     color: active ? 'var(--fg-1)' : 'var(--fg-2)',
                     textDecoration: 'none',
                     position: 'relative',
                     padding: '6px 0',
                     transition: `color 180ms ${SHELL_EASE_OUT}`
                   }}>
                  {l.label}
                  {active && !window.SLMotion && (
                    <span aria-hidden="true" style={{
                      position: 'absolute', bottom: -2, left: 0, right: 0,
                      height: 2, background: 'var(--accent)',
                      boxShadow: '0 0 8px var(--accent-glow)'
                    }}/>
                  )}
                </a>
              );
            })}
            {window.SLMotion && <span ref={indRef} className="nav-ind" aria-hidden="true"/>}
          </nav>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!compact && utilityButtons}
          <button ref={fridgeBtnRef} onClick={() => { setMenuOpen(false); onCart(); }} className="btn btn-primary" style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
            <Icon name="cart" size={16}/>
            <span>Fridge · {cartCount}</span>
          </button>
          {narrow && (
            <button ref={burgerRef} className="iconbtn"
                    aria-label="Menu" aria-expanded={menuOpen} aria-controls="shell-nav-panel"
                    onClick={() => setMenuOpen(o => !o)}>
              <Icon name={menuOpen ? 'x' : 'menu'} size={18}/>
            </button>
          )}
        </div>
      </div>

      {/* Narrow-screen disclosure panel */}
      {narrow && (
        <nav id="shell-nav-panel" ref={panelRef} aria-label="Primary" hidden={!menuOpen} style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--ink-900)',
          maxHeight: 'calc(100dvh - 100px)', overflowY: 'auto', overscrollBehavior: 'contain',
          borderTop: '1px solid var(--border-1)',
          borderBottom: '1px solid var(--border-2)',
          boxShadow: '0 30px 60px rgba(0,0,0,0.5)'
        }}>
          <div className="container" style={{ paddingTop: 8, paddingBottom: 20 }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {SHELL_NAV_LINKS.map(l => {
                const active = shellIsActive(l.path, route);
                return (
                  <li key={l.path} style={{ borderBottom: '1px solid var(--border-1)' }}>
                    <a href={`#${l.path}`} onClick={go(l.path)}
                       aria-current={active ? 'page' : undefined}
                       style={{
                         display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                         padding: '16px 0',
                         font: '600 18px/1 var(--font-ui)',
                         color: active ? 'var(--accent)' : 'var(--fg-1)',
                         textDecoration: 'none'
                       }}>
                      {l.label}
                      <span aria-hidden="true" style={{ color: active ? 'var(--accent)' : 'var(--fg-4)', display: 'flex' }}>
                        <Icon name="chevR" size={16}/>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
            {compact && (
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                {utilityButtons}
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────
const SHELL_FOOTER_HEADING = { font: '700 11px var(--font-ui)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 16 };
const SHELL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ShellNewsletter() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | error | done

  const onSubmit = e => {
    e.preventDefault();
    if (!SHELL_EMAIL_RE.test(email.trim())) { setStatus('error'); return; }
    setStatus('done');
    setEmail('');
  };

  return (
    <div>
      <div style={SHELL_FOOTER_HEADING}>Stay in the loop</div>
      <p style={{ font: '400 13px/1.5 var(--font-body)', color: 'var(--fg-3)', marginBottom: 12 }}>
        Drops, restocks, and the occasional 3am thought.
      </p>
      <form onSubmit={onSubmit} noValidate style={{ display: 'flex', gap: 6 }}>
        <label htmlFor="shell-footer-email" style={shellSrOnly}>Email address</label>
        <input id="shell-footer-email" className="input" type="email" name="email" autoComplete="email"
               placeholder="you@gg.com" value={email}
               aria-invalid={status === 'error' ? true : undefined}
               aria-describedby="shell-footer-email-status"
               onChange={e => { setEmail(e.target.value); if (status !== 'idle') setStatus('idle'); }}
               style={{ flex: 1, minWidth: 0, padding: '10px 12px', fontSize: 13 }}/>
        <button type="submit" className="btn btn-primary" style={{ padding: '10px 14px', fontSize: 13, flexShrink: 0 }}>Join</button>
      </form>
      <div id="shell-footer-email-status" role="status" aria-live="polite" style={{
        display: 'flex', alignItems: 'center', gap: 6, minHeight: 18, marginTop: 8,
        font: '500 12px var(--font-body)',
        color: status === 'error' ? 'var(--danger)' : 'var(--accent)'
      }}>
        {status === 'done' && <><Icon name="check" size={14}/><span>You're in.</span></>}
        {status === 'error' && <span>Enter a valid email address.</span>}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border-1)', background: 'var(--ink-900)', position: 'relative', overflow: 'hidden' }}>
      {/* Mark watermark */}
      <img src="assets/mark-slime.png" alt="" style={{
        position: 'absolute', right: -80, bottom: -80, width: 480,
        opacity: 0.06, pointerEvents: 'none'
      }}/>

      {/* Big wordmark band */}
      <div style={{
        padding: 'clamp(48px, 8vw, 80px) 0 40px',
        borderBottom: '1px solid var(--border-1)',
        textAlign: 'center',
        position: 'relative'
      }}>
        <div className="container">
          <div aria-hidden="true" style={{
            font: '800 clamp(56px, 15vw, 220px)/0.9 var(--font-display)',
            letterSpacing: '-0.05em',
            background: 'linear-gradient(180deg, var(--accent) 0%, var(--accent-deep) 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            opacity: 0.95
          }}>
            SLIME LIME
          </div>
          <div aria-hidden="true" className="mono-sm" style={{ color: 'var(--fg-3)', marginTop: 16, letterSpacing: '0.16em' }}>
            // STAY HYDRATED · LOCK IN ·  STAY HYDRATED · LOCK IN · STAY HYDRATED
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 48, paddingBottom: 24, position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 40, marginBottom: 48 }}>
          <div>
            <Wordmark size={20}/>
            <p style={{ font: '400 14px/1.6 var(--font-body)', color: 'var(--fg-3)', marginTop: 16, maxWidth: 280 }}>
              Healthy gaming drinks. Built for focus, hydration, and the long session.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
              {[['twitch', 'Twitch'], ['discord', 'Discord']].map(([s, label]) => (
                <button key={s} className="iconbtn" aria-label={label} style={{ width: 36, height: 36 }}>
                  <Icon name={s} size={16}/>
                </button>
              ))}
            </div>
          </div>
          {[
            ['Shop',    [['All flavors', '/'], ['Flagship', '/flagship'], ['Subscribe', '/subscribe'], ['Variety packs', '/subscribe']]],
            ['Learn',   [['Our story', '/story'], ['The science', '/story#science'], ['FAQ', '/faq'], ['Reviews', '/']]],
            ['Company', [['About', '/story'], ['Careers', '#'], ['Press', '#'], ['Contact', '#']]],
          ].map(([h, links]) => (
            <nav key={h} aria-label={`Footer ${h}`}>
              <div style={SHELL_FOOTER_HEADING}>{h}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {links.map(([label, path]) => (
                  <a key={label} href={path.startsWith('/') ? `#${path}` : '#'}
                     onClick={e => { e.preventDefault(); if (path.startsWith('/')) navTo(path); }}
                     style={{ font: '400 14px var(--font-body)', color: 'var(--fg-2)', textDecoration: 'none' }}>
                    {label}
                  </a>
                ))}
              </div>
            </nav>
          ))}
          <ShellNewsletter/>
        </div>
        <div style={{
          borderTop: '1px solid var(--border-1)', paddingTop: 24,
          display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px 24px',
          font: '400 11px var(--font-mono)', color: 'var(--fg-4)', letterSpacing: '0.08em'
        }}>
          <span>© 2026 SLIME LIME · ALL RIGHTS RESERVED</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--fg-4)' }}>PRIVACY</a>
            <a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--fg-4)' }}>TERMS</a>
            <a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--fg-4)' }}>ACCESSIBILITY</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────
// CAN — renders the Claude Design still of the double-bubble bottle for this flavor.
// Kept named "Can" so call sites stay stable. The box is `height` tall and as wide as the
// bottle; the image overflows it (the bottle is 70% of the render's height, base at 90%).
// ─────────────────────────────────────────────────────────────
function Can({ flavor, height = 360 }) {
  const imgH = height / 0.7;
  return (
    <span style={{ position: 'relative', display: 'inline-block', height, width: Math.round(height * 0.56) }}>
      <img src={`assets/bottle/renders/card-${flavor.id}.webp`} alt="" width={800} height={1067}
        decoding="async"
        style={{ position: 'absolute', left: '50%', top: -0.2 * imgH, height: imgH, width: 'auto',
          maxWidth: 'none', transform: 'translateX(-50%)', pointerEvents: 'none' }}/>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Sticky page-bottom CTA bar (Add to fridge)
// ─────────────────────────────────────────────────────────────
function PageBottomCTA({ onAdd, label = "Add to fridge", price = "$2.50/bottle" }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 60,
      background: 'rgba(6, 13, 8, 0.85)',
      backdropFilter: 'blur(14px)',
      border: '1px solid var(--border-2)',
      borderRadius: 999,
      padding: '8px 8px 8px 20px',
      display: 'flex', alignItems: 'center', gap: 16,
      boxShadow: 'var(--shadow-xl)'
    }}>
      <span className="mono-sm" style={{ color: 'var(--fg-2)' }}>{price}</span>
      <button onClick={onAdd} className="btn btn-primary" style={{ borderRadius: 999, padding: '10px 18px' }}>
        <Icon name="plus" size={16}/>{label}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EXPORT to window
// ─────────────────────────────────────────────────────────────
Object.assign(window, {
  Icon, Wordmark, Nav, Footer, Can, PageBottomCTA,
  useFlavorTheme, useCart, useRoute, useRouteStage, navTo, FLAVORS,
});
