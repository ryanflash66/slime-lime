/* global React */
// Shared shell: Nav, Footer, CartDrawer, Icon, Wordmark, AppCtx (cart + theme)
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
        fontFamily: 'Bricolage Grotesque, Space Grotesk, sans-serif',
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
  const remove = id => setCart(c => c.filter(i => i.id !== id));
  const inc = id => setCart(c => c.map(i => i.id === id ? { ...i, qty: i.qty + 1 } : i));
  const dec = id => setCart(c => c.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty - 1) } : i).filter(i => i.qty > 0));
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  return { cart, count, total, add, inc, dec, remove, cartOpen, setCartOpen };
}

// ─────────────────────────────────────────────────────────────
// HASH ROUTER
// ─────────────────────────────────────────────────────────────
function useRoute() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onHash = () => {
      setRoute(window.location.hash.slice(1) || '/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

function navTo(path) {
  window.location.hash = path;
}

// ─────────────────────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────────────────────
function Nav({ cartCount, onCart, route }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: 'Shop',      path: '/' },
    { label: 'Flagship',  path: '/flagship' },
    { label: 'Subscribe', path: '/subscribe' },
    { label: 'Story',     path: '/story' },
    { label: 'FAQ',       path: '/faq' },
  ];

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 80,
      backdropFilter: scrolled ? 'blur(14px)' : 'none',
      background: scrolled ? 'rgba(6, 13, 8, 0.78)' : 'transparent',
      borderBottom: scrolled ? '1px solid var(--border-1)' : '1px solid transparent',
      transition: 'all 200ms ease'
    }}>
      {/* Top HUD strip */}
      <div style={{
        background: 'var(--ink-900)',
        borderBottom: '1px solid var(--border-1)',
        padding: '8px 0',
        overflow: 'hidden'
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <span className="mono-sm" style={{ color: 'var(--fg-3)' }}>
            <span style={{ color: 'var(--accent)' }}>●</span>&nbsp;&nbsp;FREE SHIPPING ON ORDERS $40+
          </span>
          <span className="mono-sm" style={{ color: 'var(--fg-3)', display: 'flex', gap: 16 }}>
            <span>SUBSCRIBE → SAVE 28%</span>
            <span style={{ opacity: 0.4 }}>|</span>
            <span>NEW: MANGO + GRAPE</span>
          </span>
        </div>
      </div>

      {/* Main nav */}
      <div className="container" style={{
        padding: '16px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <a href="#/" onClick={e => { e.preventDefault(); navTo('/'); }} style={{ display: 'flex', textDecoration: 'none' }}>
          <Wordmark size={22}/>
        </a>
        <nav style={{ display: 'flex', gap: 28 }}>
          {links.map(l => {
            const active = (l.path === '/' && (route === '/' || route === '')) || (l.path !== '/' && route.startsWith(l.path));
            return (
              <a key={l.path} href={`#${l.path}`}
                 onClick={e => { e.preventDefault(); navTo(l.path); }}
                 style={{
                   font: '500 14px/1 Space Grotesk, sans-serif',
                   color: active ? 'var(--fg-1)' : 'var(--fg-2)',
                   textDecoration: 'none',
                   position: 'relative',
                   padding: '6px 0',
                   transition: 'color 180ms'
                 }}>
                {l.label}
                {active && (
                  <span style={{
                    position: 'absolute', bottom: -2, left: 0, right: 0,
                    height: 2, background: 'var(--accent)',
                    boxShadow: '0 0 8px var(--accent-glow)'
                  }}/>
                )}
              </a>
            );
          })}
        </nav>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="iconbtn"><Icon name="search" size={18}/></button>
          <button className="iconbtn"><Icon name="user" size={18}/></button>
          <button onClick={onCart} className="btn btn-primary" style={{ padding: '11px 16px' }}>
            <Icon name="cart" size={16}/>
            <span>Fridge · {cartCount}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// CART DRAWER
// ─────────────────────────────────────────────────────────────
function CartDrawer({ open, items, onClose, onInc, onDec, total }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 220ms', zIndex: 100
      }}/>
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 460,
        maxWidth: '100vw',
        background: 'var(--ink-800)', borderLeft: '1px solid var(--border-2)',
        zIndex: 101, padding: 28, display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 320ms cubic-bezier(0.22, 1.2, 0.36, 1)',
        boxShadow: '-30px 0 80px rgba(0,0,0,0.6)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <span className="mono-sm" style={{ color: 'var(--accent)' }}>MY FRIDGE</span>
            <div className="h2" style={{ marginTop: 4, fontSize: 28 }}>Inventory</div>
          </div>
          <button onClick={onClose} className="iconbtn"><Icon name="x"/></button>
        </div>

        {/* HUD bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px',
          background: 'var(--ink-900)',
          border: '1px solid var(--border-1)',
          borderRadius: 8,
          margin: '20px 0 16px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
          letterSpacing: '0.08em',
          color: 'var(--fg-3)'
        }}>
          <span className="dot" style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)' }}/>
          <span>STATUS: STOCKED · {items.reduce((s, i) => s + i.qty, 0)} CANS QUEUED</span>
        </div>

        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.length === 0 && (
            <div style={{ color: 'var(--fg-3)', font: '400 14px Inter, sans-serif', padding: '40px 24px', textAlign: 'center', border: '1px dashed var(--border-1)', borderRadius: 12 }}>
              Nothing in your fridge yet.<br/>Let's fix that.
            </div>
          )}
          {items.map(i => (
            <div key={i.id} style={{
              display: 'flex', gap: 12, padding: 12,
              border: '1px solid var(--border-1)', borderRadius: 12,
              background: 'var(--surface-card)', alignItems: 'center'
            }}>
              {/* mini glass-bottle thumbnail */}
              <div style={{ width: 48, height: 70, flexShrink: 0, position: 'relative' }}>
                <svg viewBox="0 0 60 86" width="48" height="70" style={{ display: 'block', overflow: 'visible' }}>
                  <defs>
                    <linearGradient id={`mini-j-${i.id}`} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor={i.color} stopOpacity="0.7"/>
                      <stop offset="0.5" stopColor={i.color}/>
                      <stop offset="1" stopColor={i.accent}/>
                    </linearGradient>
                    <linearGradient id={`mini-c-${i.id}`} x1="0" x2="1">
                      <stop offset="0" stopColor="#6a6a6a"/>
                      <stop offset="0.4" stopColor="#fafafa"/>
                      <stop offset="0.7" stopColor="#bdbdbd"/>
                      <stop offset="1" stopColor="#4e4e4e"/>
                    </linearGradient>
                  </defs>
                  {/* shadow */}
                  <ellipse cx="30" cy="82" rx="22" ry="2" fill="rgba(0,0,0,0.5)"/>
                  {/* bottle body — square juice silhouette */}
                  <path d="M 8 80 L 8 24 Q 8 21 11 19 L 16 14 Q 18 12 18 10 L 18 8 Q 18 6 20 6 L 40 6 Q 42 6 42 8 L 42 10 Q 42 12 44 14 L 49 19 Q 52 21 52 24 L 52 80 Q 52 82 50 82 L 10 82 Q 8 82 8 80 Z"
                        fill={`url(#mini-j-${i.id})`} stroke="rgba(0,0,0,0.25)" strokeWidth="0.5"/>
                  {/* glass shine */}
                  <rect x="10" y="22" width="3" height="56" fill="rgba(255,255,255,0.45)" rx="1"/>
                  <rect x="46" y="22" width="2" height="56" fill="rgba(255,255,255,0.25)" rx="1"/>
                  {/* meniscus */}
                  <ellipse cx="30" cy="22" rx="20" ry="1.4" fill="rgba(255,255,255,0.5)"/>
                  {/* cap */}
                  <rect x="18" y="2" width="24" height="9" rx="0.6" fill={`url(#mini-c-${i.id})`}/>
                  <rect x="18" y="2" width="24" height="1.6" fill="rgba(255,255,255,0.6)"/>
                  {/* label blob */}
                  <ellipse cx="30" cy="56" rx="17" ry="14" fill="#ffffff"/>
                  <text x="30" y="60" textAnchor="middle"
                        fontFamily="Bricolage Grotesque, sans-serif"
                        fontWeight="800" fontSize="11"
                        letterSpacing="-0.5"
                        fill={i.accent}>SL</text>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '600 14px Space Grotesk, sans-serif' }}>{i.name}</div>
                <div style={{ font: '400 11px JetBrains Mono, monospace', color: 'var(--fg-3)', marginTop: 2 }}>${i.price.toFixed(2)}/CAN · {i.sub}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--border-2)', borderRadius: 999, padding: 3 }}>
                <button onClick={() => onDec(i.id)} style={{ background: 'transparent', border: 'none', color: 'var(--fg-2)', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 999 }}><Icon name="minus" size={12}/></button>
                <span style={{ font: '600 12px JetBrains Mono', minWidth: 18, textAlign: 'center' }}>{i.qty}</span>
                <button onClick={() => onInc(i.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 999 }}><Icon name="plus" size={12}/></button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 20, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ font: '500 14px Inter, sans-serif', color: 'var(--fg-2)' }}>Subtotal</span>
            <span style={{ font: '700 22px JetBrains Mono', color: 'var(--accent)' }}>${total.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, font: '400 12px JetBrains Mono', color: 'var(--fg-3)', letterSpacing: '0.04em' }}>
            <span>SHIPPING</span>
            <span>{total >= 40 ? 'FREE' : `$${(40 - total).toFixed(2)} TO FREE`}</span>
          </div>
          {total < 40 && (
            <div style={{ background: 'var(--ink-900)', borderRadius: 999, height: 4, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ width: `${Math.min(100, (total / 40) * 100)}%`, height: '100%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)', transition: 'width 220ms' }}/>
            </div>
          )}
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={items.length === 0}>
            Checkout · ${total.toFixed(2)}
          </button>
          <div style={{ font: '400 11px JetBrains Mono, monospace', color: 'var(--fg-4)', textAlign: 'center', marginTop: 12, letterSpacing: '0.06em' }}>
            SECURE · 30-DAY GUARANTEE · CANCEL ANYTIME
          </div>
        </div>
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────
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
        padding: '80px 0 40px',
        borderBottom: '1px solid var(--border-1)',
        textAlign: 'center',
        position: 'relative'
      }}>
        <div className="container">
          <div style={{
            font: '800 clamp(96px, 16vw, 220px)/0.9 Bricolage Grotesque, sans-serif',
            letterSpacing: '-0.05em',
            background: 'linear-gradient(180deg, var(--accent) 0%, var(--accent-deep) 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            opacity: 0.95
          }}>
            SLIME LIME
          </div>
          <div className="mono-sm" style={{ color: 'var(--fg-3)', marginTop: 16, letterSpacing: '0.16em' }}>
            // STAY HYDRATED · LOCK IN ·  STAY HYDRATED · LOCK IN · STAY HYDRATED
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: '48px 32px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr', gap: 40, marginBottom: 48 }}>
          <div>
            <Wordmark size={20}/>
            <p style={{ font: '400 14px/1.6 Inter, sans-serif', color: 'var(--fg-3)', marginTop: 16, maxWidth: 280 }}>
              Healthy gaming drinks. Built for focus, hydration, and the long session.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
              {['twitch', 'discord'].map(s => (
                <button key={s} className="iconbtn" style={{ width: 36, height: 36 }}>
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
            <div key={h}>
              <div style={{ font: '700 11px Space Grotesk, sans-serif', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 16 }}>{h}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {links.map(([label, path]) => (
                  <a key={label} href={`#${path}`}
                     onClick={e => { if (path.startsWith('/')) { e.preventDefault(); navTo(path); }}}
                     style={{ font: '400 14px Inter, sans-serif', color: 'var(--fg-2)', textDecoration: 'none' }}>
                    {label}
                  </a>
                ))}
              </div>
            </div>
          ))}
          <div>
            <div style={{ font: '700 11px Space Grotesk, sans-serif', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 16 }}>Stay in the loop</div>
            <p style={{ font: '400 13px/1.5 Inter, sans-serif', color: 'var(--fg-3)', marginBottom: 12 }}>
              Drops, restocks, and the occasional 3am thought.
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="input" placeholder="you@gg.com" style={{ flex: 1, padding: '10px 12px', fontSize: 13 }}/>
              <button className="btn btn-primary" style={{ padding: '10px 14px', fontSize: 13 }}>Join</button>
            </div>
          </div>
        </div>
        <div style={{
          borderTop: '1px solid var(--border-1)', paddingTop: 24,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          font: '400 11px JetBrains Mono, monospace', color: 'var(--fg-4)', letterSpacing: '0.08em'
        }}>
          <span>© 2026 SLIME LIME · ALL RIGHTS RESERVED</span>
          <span style={{ display: 'flex', gap: 16 }}>
            <a href="#" style={{ color: 'var(--fg-4)' }}>PRIVACY</a>
            <a href="#" style={{ color: 'var(--fg-4)' }}>TERMS</a>
            <a href="#" style={{ color: 'var(--fg-4)' }}>ACCESSIBILITY</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────
// CAN — Now renders the high-fi <Bottle> SVG from the design
// system (square juice glass bottle w/ blob label + chrome cap),
// recolored per flavor SKU. Kept named "Can" so call sites stay
// stable; bottle is the actual product form.
// ─────────────────────────────────────────────────────────────
function Can({ flavor, height = 360 }) {
  const f = flavor;
  return (
    <window.Bottle
      juice={f.color}
      capSticker={f.color}
      accent={f.accent}
      brand="SLIME LIME"
      flavor={f.name}
      subtitle={f.sub || 'CLEAN FOCUS'}
      stats="75MG  ·  5G SUGAR  ·  12FL OZ"
      height={height}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Sticky page-bottom CTA bar (Add to fridge)
// ─────────────────────────────────────────────────────────────
function PageBottomCTA({ onAdd, label = "Add to fridge", price = "$2.50/can" }) {
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
  Icon, Wordmark, Nav, CartDrawer, Footer, Can, PageBottomCTA,
  useFlavorTheme, useCart, useRoute, navTo, FLAVORS,
});
