/* global React */
// HOME PAGE — 3D product hero, lineup w/ flavor recolor, ticker, streamers, story
const { useState: useStateH, useEffect: useEffectH, useRef: useRefH, useMemo: useMemoH } = React;

// ─────────────────────────────────────────────────────────────
// HERO — full-bleed 3D product stage (bottle3d.js), flavor switcher, spec rail
// ─────────────────────────────────────────────────────────────
const heroEase = 'cubic-bezier(0.23, 1, 0.32, 1)';

// Local media-query hook (hero only).
function heroUseMedia(query) {
  const [matches, setMatches] = useStateH(() => !!(window.matchMedia && window.matchMedia(query).matches));
  useEffectH(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (mql.addEventListener) mql.addEventListener('change', onChange); else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange); else mql.removeListener(onChange);
    };
  }, [query]);
  return matches;
}

// Fallback for "Read the science" when no onWatch is passed: same target as the footer's
// "The science" link (/story#science). The router resets scroll on hashchange, so scroll after it.
function heroReadScience() {
  // The route stage scrolls to #science once the Story page is on screen.
  window.location.hash = '/story#science';
}

const heroSpecs = [
  { label: 'Caffeine', value: '75', unit: 'mg', sub: 'Clean · slow-release' },
  { label: 'Sugar', value: '5', unit: 'g', sub: 'Real fruit · low GI' },
  { label: 'Crash', value: '0', unit: '', sub: 'All session' },
  { label: 'Volume', value: '12', unit: 'oz', sub: 'Per serving' },
];

const heroWord = f => (f.short || f.name).replace(/[-·]/g, ' ').replace(/\s+/g, ' ').trim();
const hero3DOpts = f => ({
  id: f.id, juice: f.color, accent: f.accent, flavor: f.name, subtitle: f.sub || 'Clean focus',
  stats: '75MG · 5G SUGAR · 12FL OZ', word: heroWord(f),
  bg: `assets/scenes/bg-${f.id}-${window.innerWidth < 900 ? 'tall' : 'wide'}.webp`,
});

// +1 = the new slide comes in from the right (moving forward through the lineup), -1 = from the left.
function heroSlideDir(fromId, toId) {
  const list = window.FLAVORS || [];
  const a = list.findIndex(f => f.id === fromId), b = list.findIndex(f => f.id === toId), n = list.length;
  if (a < 0 || b < 0 || a === b) return 0;
  return (b - a + n) % n <= n / 2 ? 1 : -1;
}

// Swipe (touch) or a sideways trackpad scroll over the hero steps through the flavors.
function heroUseSwipe(ref, step, layoutKey) {
  const stepRef = useRefH(step);
  stepRef.current = step;
  useEffectH(() => {
    const el = ref.current;
    if (!el) return;
    let start = null, acc = 0, cool = 0;
    const down = e => { if (e.pointerType === 'touch') start = { x: e.clientX, y: e.clientY }; };
    const up = e => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) stepRef.current(dx < 0 ? 1 : -1);
    };
    const cancel = () => { start = null; };
    const wheel = e => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2) return;   // vertical scrolling is untouched
      const now = performance.now();
      if (now < cool) return;
      acc += e.deltaX;
      if (Math.abs(acc) > 60) { stepRef.current(acc > 0 ? 1 : -1); acc = 0; cool = now + 650; }
    };
    el.addEventListener('pointerdown', down, { passive: true });
    el.addEventListener('pointerup', up, { passive: true });
    el.addEventListener('pointercancel', cancel, { passive: true });
    el.addEventListener('wheel', wheel, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel); el.removeEventListener('wheel', wheel);
    };
  }, [layoutKey]);   // the hero renders a different <section> per layout
}

// The WebGL stage. Falls back to the SVG bottle until bottle3d.js loads, or if WebGL is unavailable.
function HeroStage({ flavor, frame, fallbackH }) {
  const hostRef = useRefH(null);
  const instRef = useRefH(null);
  const [ready, setReady] = useStateH(false);
  const [failed, setFailed] = useStateH(false);

  useEffectH(() => {
    let cancelled = false;
    const mount = () => {
      if (cancelled || instRef.current || !hostRef.current) return;
      if (!window.SL3D || !window.SL3D.supported) { setFailed(true); return; }
      try {
        instRef.current = window.SL3D.create(hostRef.current, { ...hero3DOpts(flavor), frame });
        Promise.resolve(instRef.current.whenReady).then(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (cancelled) return;
            setReady(true);
            // Warm the other flavors' stage photos + labels once idle, so switching never waits on the network.
            const warm = () => { if (!cancelled && instRef.current && instRef.current.preload) instRef.current.preload((window.FLAVORS || []).map(hero3DOpts)); };
            if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 3000 }); else setTimeout(warm, 1200);
          })));
      } catch (err) {
        setFailed(true);
      }
    };
    if (window.SL3D) mount(); else window.addEventListener('sl3d-ready', mount, { once: true });
    const giveUp = setTimeout(() => { if (!instRef.current) setFailed(true); }, 8000);
    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      window.removeEventListener('sl3d-ready', mount);
      if (instRef.current) { instRef.current.destroy(); instRef.current = null; }
    };
  }, []);

  // Slide direction = the shorter way round the lineup (so prev/next arrows, dots and swipes all read right).
  const prevIdxRef = useRefH(null);
  useEffectH(() => {
    const dir = heroSlideDir(prevIdxRef.current, flavor.id);
    prevIdxRef.current = flavor.id;
    if (instRef.current) instRef.current.setFlavor(hero3DOpts(flavor), { dir });
  }, [flavor.id]);
  useEffectH(() => { if (instRef.current) instRef.current.setFrame(frame); }, [frame.x, frame.y, frame.fill]);

  const showFallback = !ready;
  return (
    <div aria-hidden="true" data-hero-stage style={{ position: 'absolute', inset: 0, background: 'var(--ink-800)' }}>
      <div ref={hostRef} style={{
        position: 'absolute', inset: 0,
        opacity: ready ? 1 : 0,
        transition: `opacity 600ms ${heroEase}`,
      }}/>
      {showFallback && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(40% 55% at ${50 + frame.x * 50}% 62%, ${flavor.color}38 0%, transparent 70%)`,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: `${Math.max(0, frame.x) * 100}%`,
          paddingRight: `${Math.max(0, -frame.x) * 100}%`,
          opacity: failed ? 1 : 0.9,
        }}>
          {/* Still render: bottle is 70% of the image height, base at 90%. */}
          <img src={`assets/bottle/renders/hero-${flavor.id}.webp`} alt="" width={1000} height={1200}
            decoding="async" fetchpriority="high"
            style={{ height: fallbackH, width: 'auto', transform: 'rotate(-3deg)',
              filter: `drop-shadow(0 30px 60px ${flavor.color}55)` }}/>
        </div>
      )}
    </div>
  );
}

function HeroSwitcher({ flavors, current, onPick, align = 'center' }) {
  const i = Math.max(0, flavors.findIndex(f => f.id === current.id));
  const go = d => onPick(flavors[(i + d + flavors.length) % flavors.length]);
  const pad = n => String(n).padStart(2, '0');
  const nameRef = useRefH(null);
  const lastRef = useRefH(current.id);
  // the flavor name slides in from the same side as the stage
  useEffectH(() => {
    const dir = heroSlideDir(lastRef.current, current.id);
    lastRef.current = current.id;
    const el = nameRef.current;
    if (!dir || !el || !el.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate([{ transform: `translateX(${dir * 18}px)`, opacity: 0, filter: 'blur(3px)' }, { transform: 'none', opacity: 1, filter: 'none' }],
      { duration: 520, delay: 160, easing: heroEase, fill: 'backwards' });
  }, [current.id]);
  return (
    <div role="group" aria-label="Choose a flavor" style={{
      display: 'flex', flexDirection: 'column', alignItems: align, gap: 12,
    }}>
      <div className="mono-sm" aria-live="polite" style={{ color: 'var(--fg-2)', letterSpacing: '0.14em', whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--accent)' }}>{pad(i + 1)}</span> / {pad(flavors.length)} — <span ref={nameRef} style={{ display: 'inline-block' }}>{current.name.toUpperCase()}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="hero-arrow" aria-label="Previous flavor" onClick={() => go(-1)}><Icon name="arrowL" size={16}/></button>
        <div style={{ display: 'flex', gap: 4 }}>
          {flavors.map(f => {
            const on = f.id === current.id;
            return (
              <button key={f.id} type="button" className="hero-dot" aria-label={`Show ${f.name}`} aria-pressed={on}
                onClick={() => onPick(f)} style={{ '--dot': f.color }}>
                <span style={{ width: on ? 28 : 10, background: on ? f.color : 'transparent', borderColor: f.color }}/>
              </button>
            );
          })}
        </div>
        <button type="button" className="hero-arrow" aria-label="Next flavor" onClick={() => go(1)}><Icon name="arrowR" size={16}/></button>
      </div>
    </div>
  );
}

function HeroSpecRail({ grid = false }) {
  return (
    <dl style={grid ? {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 1,
      margin: 0, background: 'var(--border-1, rgba(250,252,239,0.08))', borderRadius: 12, overflow: 'hidden',
    } : { display: 'flex', flexDirection: 'column', gap: 26, margin: 0, alignItems: 'flex-end' }}>
      {heroSpecs.map(s => (
        <div key={s.label} style={grid
          ? { background: 'var(--ink-800)', padding: '14px 16px' }
          : { display: 'grid', gridTemplateColumns: '44px auto', alignItems: 'center', columnGap: 14, textAlign: 'right' }}>
          {!grid && <span aria-hidden="true" style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--accent))', opacity: 0.7 }}/>}
          <div>
            <dt className="mono-sm" style={{ color: 'var(--fg-3)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{s.label}</dt>
            <dd style={{ margin: '4px 0 0', font: '700 30px/1 var(--font-mono)', color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>
              {s.value}<span style={{ fontSize: 14, color: 'var(--accent)', marginLeft: 2 }}>{s.unit}</span>
            </dd>
            <dd className="mono-sm" style={{ margin: '6px 0 0', color: 'var(--fg-4)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{s.sub}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

function Hero({ flavor, flavors, onPickFlavor, onShop, onWatch }) {
  const copyRef = useRefH(null);
  const reduced = heroUseMedia('(prefers-reduced-motion: reduce)');
  const narrow = heroUseMedia('(max-width: 979px)');
  const small = heroUseMedia('(max-width: 600px)');
  const list = flavors || window.FLAVORS;
  const pick = onPickFlavor || (() => {});
  const secRef = useRefH(null);
  heroUseSwipe(secRef, d => {
    const i = Math.max(0, list.findIndex(f => f.id === flavor.id));
    pick(list[(i + d + list.length) % list.length]);
  }, narrow);

  // First-load entrance, once per session; fill 'backwards' so nothing lingers or blocks clicks.
  React.useLayoutEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem('sl-hero-seen') === '1';
      sessionStorage.setItem('sl-hero-seen', '1');
    } catch (err) { /* storage unavailable: just play it */ }
    const el = copyRef.current;
    if (seen || !el) return;
    const kids = Array.from(el.children);
    kids.forEach((k, i) => {
      if (typeof k.animate !== 'function') return;
      k.animate(reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: reduced ? 200 : 600, delay: reduced ? 0 : 120 + i * 70, easing: heroEase, fill: 'backwards' });
    });
  }, []);

  const frame = narrow ? { x: 0, y: 0.02, fill: 0.9 } : { x: 0.3, y: -0.02, fill: 0.84 };
  const ctaFlex = small ? { flex: '1 1 auto', justifyContent: 'center' } : null;

  const copy = (
    <div ref={copyRef} data-hero-copy style={{ position: 'relative', maxWidth: 600, minWidth: 0 }}>
      <div className="eyebrow" style={{ marginBottom: 22 }}>Functional hydration · built for gamers</div>
      <h1 className="hero-title">
        Late nights deserve <span style={{ color: 'var(--accent)' }}>better fuel.</span>
      </h1>
      <p className="body-lg" style={{ maxWidth: 460, margin: '26px 0 34px', color: 'var(--fg-2)' }}>
        5g sugar. 75mg clean caffeine. Zero crash. Real electrolytes. Built for the long session.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 36 }}>
        <button onClick={onShop} className="btn btn-primary btn-xl" style={{ whiteSpace: 'nowrap', ...ctaFlex }}>
          Shop the lineup <Icon name="arrow" size={18}/>
        </button>
        <button onClick={onWatch || heroReadScience} className="btn btn-secondary btn-xl" style={{ whiteSpace: 'nowrap', ...ctaFlex }}>
          <Icon name="bolt" size={16}/> Read the science
        </button>
      </div>
      <div style={{ display: 'flex', columnGap: small ? 20 : 28, rowGap: 8, flexWrap: 'wrap' }}>
        <span className="mono-sm" style={{ color: 'var(--fg-2)' }}><span style={{ color: 'var(--accent)' }}>★ 4.8</span> · 12,400 reviews</span>
        <span className="mono-sm" style={{ color: 'var(--fg-3)' }}>Free shipping $40+</span>
        <span className="mono-sm" style={{ color: 'var(--fg-3)' }}>Ships in 24h</span>
      </div>
    </div>
  );

  if (narrow) {
    return (
      <section ref={secRef} data-no-reveal data-level="Spawn" data-screen-label="01 Home Hero" style={{ position: 'relative', background: 'var(--ink-800)', overflow: 'hidden' }}>
        <div style={{
          position: 'relative', height: small ? 'clamp(440px, 64svh, 560px)' : 'clamp(520px, 66svh, 680px)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 78%, transparent)', maskImage: 'linear-gradient(180deg, #000 78%, transparent)',
        }}>
          <HeroStage flavor={flavor} frame={frame} fallbackH={small ? 380 : 460}/>
          <div className="hud-frame-corners" style={{ inset: small ? '16px 12px 40px' : '20px 20px 48px' }}/>
        </div>
        <div className="container" style={{ position: 'relative', marginTop: -36, display: 'flex', justifyContent: 'center' }}>
          <HeroSwitcher flavors={list} current={flavor} onPick={pick}/>
        </div>
        <div className="container" style={{ position: 'relative', paddingTop: 40, paddingBottom: 56, display: 'grid', gap: 36 }}>
          {copy}
          <HeroSpecRail grid/>
        </div>
      </section>
    );
  }

  return (
    <section ref={secRef} data-no-reveal data-level="Spawn" data-screen-label="01 Home Hero" style={{
      position: 'relative', overflow: 'hidden', background: 'var(--ink-800)',
      height: 'max(680px, calc(100svh - 104px))',
    }}>
      <HeroStage flavor={flavor} frame={frame} fallbackH={560}/>
      {/* legibility scrim behind the copy */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(90deg, rgba(6,13,8,0.92) 0%, rgba(6,13,8,0.6) 30%, rgba(6,13,8,0) 52%)',
      }}/>
      <div className="hud-frame-corners" style={{ inset: '24px 32px' }}/>

      <div className="container" style={{
        position: 'relative', height: '100%', display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 32,
      }}>
        {copy}
        <HeroSpecRail/>
      </div>

      {/* flavor switcher, centred under the bottle */}
      <div style={{ position: 'absolute', bottom: 34, left: `${50 + frame.x * 50}%`, transform: 'translateX(-50%)' }}>
        <HeroSwitcher flavors={list} current={flavor} onPick={pick}/>
      </div>

      <div className="container" style={{ position: 'absolute', bottom: 40, left: 0, right: 0, pointerEvents: 'none' }}>
        <span className="mono-sm" style={{ color: 'var(--fg-4)' }}>Scroll for lineup <Icon name="arrowDown" size={12}/></span>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION HELPERS — media-query hook + motion curve (sections below Hero)
// ─────────────────────────────────────────────────────────────
const homeSecEase = 'cubic-bezier(0.23,1,0.32,1)';

function homeSecUseMedia(query) {
  const read = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useStateH(read);
  useEffectH(() => {
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

// ─────────────────────────────────────────────────────────────
// LIVE TICKER — Recent orders / streaks
// ─────────────────────────────────────────────────────────────
function LiveTicker() {
  const reduced = homeSecUseMedia('(prefers-reduced-motion: reduce)');
  const canHover = homeSecUseMedia('(hover: hover) and (pointer: fine)'); // touch "hover" would stick
  const [hovered, setHovered] = useStateH(false);
  const [focused, setFocused] = useStateH(false);
  const events = useMemoH(() => [
    { user: 'kovacs_77', city: 'Berlin',     msg: '12-pack Lemon-Lime',     time: '2s ago' },
    { user: 'mira.gg',   city: 'Toronto',    msg: 'started a 14-day streak', time: '8s ago' },
    { user: 'voidstep',  city: 'São Paulo',  msg: '24-pack Variety',        time: '14s ago' },
    { user: 'oxide__',   city: 'Tokyo',      msg: 'restocked Cherry Cool',  time: '22s ago' },
    { user: 'frame_',    city: 'Austin',     msg: '6-pack Mango Rush',      time: '30s ago' },
    { user: 'lazerblue', city: 'Berlin',     msg: 'completed 30-day streak',time: '38s ago' },
    { user: 'pacing.exe',city: 'Seoul',      msg: '12-pack Blue Raspberry', time: '46s ago' },
    { user: 'glitch.me', city: 'Lisbon',     msg: 'subscribed monthly',     time: '54s ago' },
    { user: 'apex_apex', city: 'Reykjavík',  msg: '24-pack Lemon-Lime',     time: '1m ago' },
    { user: 'noir.dev',  city: 'New York',   msg: 'unlocked Hydration Lvl 5', time: '1m ago' },
  ], []);

  // Each set carries its own trailing gap so translateX(-50%) loops seamlessly.
  const renderSet = (hidden) => (
    <div aria-hidden={hidden ? 'true' : undefined} style={{ display: 'flex', gap: 32, paddingRight: 32, flexShrink: 0 }}>
      {events.map((e, i) => (
        <span key={i} className="mono-sm" style={{ color: 'var(--fg-3)', display: 'flex', gap: 8, whiteSpace: 'nowrap', fontSize: 12 }}>
          <span aria-hidden="true" style={{ color: 'var(--accent)' }}>●</span>
          <span style={{ color: 'var(--fg-1)' }}>@{e.user}</span>
          <span>·</span>
          <span>{e.city}</span>
          <span>·</span>
          <span>{e.msg}</span>
          <span style={{ color: 'var(--fg-4)' }}>· {e.time}</span>
        </span>
      ))}
    </div>
  );

  const paused = (canHover && hovered) || focused;

  return (
    <section
      className="sl-ticker"
      aria-label="Live order feed"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
      style={{
        background: 'var(--ink-900)',
        borderTop: '1px solid var(--border-1)',
        borderBottom: '1px solid var(--border-1)',
        padding: '16px 0',
        overflow: 'hidden',
        position: 'relative',
      }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div className="hud-pill" style={{ flexShrink: 0 }}>
          <span className="dot"/>LIVE FEED
        </div>
        {/* Focusable so keyboard users can pause it (and scroll it when it's static). */}
        <div role="group" aria-label="Recent orders" tabIndex={0}
          className={reduced ? 'thin-scroll' : undefined}
          style={{ flex: 1, minWidth: 0, overflowX: reduced ? 'auto' : 'hidden', overflowY: 'hidden', position: 'relative', outlineOffset: 2 }}>
          <div data-ticker-track="" style={{
            display: 'flex', width: 'max-content',
            // Reduced motion: no marquee; the single set scrolls horizontally instead.
            animation: reduced ? 'none' : 'marquee 80s linear infinite',
            animationPlayState: paused ? 'paused' : 'running',
          }}>
            {renderSet(false)}
            {!reduced && renderSet(true)}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// STAT STRIP — proof points
// ─────────────────────────────────────────────────────────────
function ProofStrip() {
  const stats = [
    { v: '75mg', n: 75, u: 'mg', l: 'CLEAN CAFFEINE', s: 'L-theanine paired. Slow-release. No crash.' },
    { v: '5g', n: 5, u: 'g', l: 'SUGAR · 35 CAL', s: 'Real fruit. Low glycemic. No phantom calories.' },
    { v: '6', n: 6, u: '', l: 'ELECTROLYTES', s: 'Sodium, potassium, magnesium. Real hydration.' },
    // counts *down* to zero, scoreboard style
    { v: '0', n: 0, u: '', from: 99, l: 'BS INGREDIENTS', s: 'No taurine, no fake colors, no smoke and mirrors.' },
  ];
  return (
    <section className="section-sm" style={{ borderBottom: '1px solid var(--border-1)' }}>
      <div className="container sl-skew" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 32 }}>
        {stats.map(s => (
          <div key={s.l} style={{ borderLeft: '1px solid var(--border-2)', paddingLeft: 24 }}>
            <div style={{ font: '700 clamp(44px, 10vw, 64px)/1 var(--font-mono)', color: 'var(--accent)', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
              <span data-count={s.n} data-suffix={s.u} data-from={s.from}>{s.v}</span>
            </div>
            <div className="mono-sm" style={{ color: 'var(--fg-2)', marginTop: 14, fontSize: 11 }}>{s.l}</div>
            <div className="body" style={{ fontSize: 14, marginTop: 8, color: 'var(--fg-3)' }}>{s.s}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// LINEUP — flavor switcher + grid
// ─────────────────────────────────────────────────────────────
// Flavor "character stats" for the select screen (taste profile, 0-100).
const homeSecProfile = {
  'lemon-lime': { TART: 64, SWEET: 38, CHILL: 56, HYPE: 90 },
  cherry:       { TART: 88, SWEET: 46, CHILL: 40, HYPE: 74 },
  'blue-rasp':  { TART: 58, SWEET: 52, CHILL: 96, HYPE: 82 },
  mango:        { TART: 34, SWEET: 80, CHILL: 42, HYPE: 86 },
  grape:        { TART: 30, SWEET: 72, CHILL: 48, HYPE: 99 },
  watermelon:   { TART: 22, SWEET: 62, CHILL: 84, HYPE: 58 },
};

// Character select: the lineup pins, scrolling slides a coverflow of flavors past a P1 frame,
// and whichever flavor lands in the frame is "selected": it re-themes the whole site and its
// stats load into the panel. Snaps to each flavor. GSAP-only; the grid below is the fallback.
function LineupSelect({ flavors, current, onPick, onAdd, canHover }) {
  const secRef = useRefH(null);
  const trackRef = useRefH(null);
  const slotRefs = useRefH([]);
  const nameRef = useRefH(null);
  const barRefs = useRefH([]);
  const stRef = useRefH(null);
  const frameRef = useRefH(null);
  const [idx, setIdx] = useStateH(0);
  const seen = useRefH(new Set());
  // Scrolling only *previews* a flavor's theme. The committed theme is lime by default, or
  // whatever the player explicitly picked (card / pip click here, or the hero switcher);
  // leaving the select screen restores it.
  const committedRef = useRefH(current);
  const previewIdRef = useRefH(null);
  const [lockedId, setLockedId] = useStateH(null);
  const onPickRef = useRefH(onPick);
  onPickRef.current = onPick;
  const currentRef = useRefH(current);
  currentRef.current = current;
  useEffectH(() => {
    // a theme change that isn't our scroll preview is a real pick (e.g. the hero switcher)
    if (current.id !== previewIdRef.current) committedRef.current = current;
  }, [current.id]);
  const restore = () => {
    previewIdRef.current = null;
    if (currentRef.current.id !== committedRef.current.id) onPickRef.current(committedRef.current);
  };
  const n = flavors.length;
  const f = flavors[idx];

  // Layout effect: the pin wrapper must be reverted before React removes the section on unmount.
  React.useLayoutEffect(() => {
    const { gsap } = window.SLMotion;
    const ctx = gsap.context(() => {
      const track = trackRef.current;
      const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
      let last = -1;
      const move = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: {
          trigger: secRef.current, pin: true, start: 'top top', end: () => '+=' + dist() * 1.15,
          scrub: 0.6, invalidateOnRefresh: true,
          snap: { snapTo: 1 / (n - 1), inertia: false, duration: { min: 0.15, max: 0.45 }, delay: 0.06, ease: 'power2.inOut' },
          onUpdate: self => {
            const i = Math.round(self.progress * (n - 1));
            if (i !== last) { last = i; setIdx(i); }
          },
          onLeave: restore,
          onLeaveBack: restore,
        },
      });
      stRef.current = move.scrollTrigger;
      // The P1 frame hugs a card; card height varies with text wrap, so measure it.
      const fit = () => {
        const s = slotRefs.current[0], fr = frameRef.current;
        if (!s || !fr) return;
        fr.style.width = (s.offsetWidth + 30) + 'px';
        fr.style.height = (s.offsetHeight + 24) + 'px';
      };
      fit();
      window.SLMotion.ScrollTrigger.addEventListener('refresh', fit);
      slotRefs.current.forEach(slot => {
        gsap.timeline({ scrollTrigger: { containerAnimation: move, trigger: slot, start: 'left right', end: 'right left', scrub: true } })
          .fromTo(slot, { rotationY: 42, scale: 0.74, autoAlpha: 0.3, z: -160 },
            { rotationY: 0, scale: 1, autoAlpha: 1, z: 0, ease: 'power1.out', duration: 1 })
          .to(slot, { rotationY: -42, scale: 0.74, autoAlpha: 0.3, z: -160, ease: 'power1.in', duration: 1 });
      });
      return () => window.SLMotion.ScrollTrigger.removeEventListener('refresh', fit);
    }, secRef);
    return () => { ctx.revert(); restore(); };
  }, []);

  // New selection: re-theme, decode the name, load the stat bars.
  useEffectH(() => {
    const st = stRef.current;
    if (!st) return;
    const y = st.scroll();
    if (y < st.start - 2 || y > st.end + 2) return;   // only while the select screen is on
    const { gsap } = window.SLMotion;
    if (f.id !== current.id) { previewIdRef.current = f.id; onPick(f); }
    if (nameRef.current) gsap.to(nameRef.current, { duration: 0.6, scrambleText: { text: f.name.toUpperCase(), chars: '01<>/|_#', speed: 0.7 }, overwrite: true });
    Object.values(homeSecProfile[f.id]).forEach((v, k) => {
      const bar = barRefs.current[k];
      if (bar) gsap.fromTo(bar, { scaleX: 0 }, { scaleX: v / 100, duration: 0.7, ease: 'expo.out', delay: k * 0.06, overwrite: true });
    });
    seen.current.add(f.id);
    if (seen.current.size === n && window.SLGame) window.SLGame.achieve('scout');
  }, [idx]);

  const jump = i => {
    const st = stRef.current;
    if (!st) return;
    // explicit pick: this flavor's theme sticks after leaving the select screen
    committedRef.current = flavors[i];
    previewIdRef.current = null;
    setLockedId(flavors[i].id);
    if (current.id !== flavors[i].id) onPick(flavors[i]);
    window.SLMotion.scrollTo(st.start + (st.end - st.start) * (i / (n - 1)), { duration: 0.8 });
  };
  const prof = homeSecProfile[f.id];
  const pad2 = v => String(v).padStart(2, '0');

  return (
    <section ref={secRef} className="cs" id="shop" data-level="Character select" data-screen-label="02 Lineup" aria-label="Choose your flavor">
      <div className="container cs-top">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>// SELECT YOUR FLAVOR · 6 SKUs</div>
          <h2 className="display-lg">Six flavors.<br/><span style={{ color: 'var(--accent)' }}>One mission.</span></h2>
        </div>
        <div className="cs-panel">
          <div ref={nameRef} className="cs-name" aria-live="polite">{f.name.toUpperCase()}</div>
          <div className="cs-stats">
            {Object.keys(prof).map((k, i) => (
              <React.Fragment key={k}>
                <span>{k}</span>
                <span className="cs-stat-bar" aria-hidden="true"><i ref={el => { barRefs.current[i] = el; }} style={{ transform: 'scaleX(' + (prof[k] / 100) + ')' }}/></span>
                <span>{prof[k]}</span>
              </React.Fragment>
            ))}
          </div>
          <div className="cs-pips" role="group" aria-label="Jump to flavor">
            {flavors.map((x, i) => (
              <button key={x.id} type="button" aria-label={x.name} aria-current={i === idx ? 'true' : undefined} onClick={() => jump(i)}><span/></button>
            ))}
          </div>
        </div>
      </div>
      <div className="cs-stage">
        <div ref={frameRef} className="cs-frame" aria-hidden="true"><i/><i/><i/><i/><b>{'P1 · ' + pad2(idx + 1) + '/' + pad2(n) + (lockedId === f.id ? ' · LOCKED IN' : '')}</b></div>
        <div ref={trackRef} className="cs-track">
          {flavors.map((x, i) => (
            <div key={x.id} className="cs-slot" ref={el => { slotRefs.current[i] = el; }}>
              <FlavorCard flavor={x}
                onAdd={() => onAdd(x)} onSelect={() => jump(i)}
                highlighted={i === idx}
                canHover={canHover} reduced={false}/>
            </div>
          ))}
        </div>
      </div>
      <div className="cs-hint" aria-hidden="true">SCROLL TO CYCLE · CLICK A FLAVOR TO SELECT</div>
    </section>
  );
}

function Lineup({ flavors, current, onPick, onAdd }) {
  // Hover effects only for real pointers; transform-based hover is dropped under reduced motion.
  const canHover = homeSecUseMedia('(hover: hover) and (pointer: fine)');
  const reduced = homeSecUseMedia('(prefers-reduced-motion: reduce)');
  if (window.SLMotion && !reduced) return <LineupSelect flavors={flavors} current={current} onPick={onPick} onAdd={onAdd} canHover={canHover}/>;
  return (
    <section className="section" id="shop" data-level="Character select" data-screen-label="02 Lineup">
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 56, flexWrap: 'wrap', gap: 24 }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>// THE LINEUP · 6 SKUs</div>
            <h2 className="display-lg">
              Six flavors.<br/>
              <span style={{ color: 'var(--accent)' }}>One mission.</span>
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
            <span className="mono-sm" style={{ color: 'var(--fg-3)' }} aria-hidden="true">// THEME</span>
            <div role="group" aria-label="Theme" style={{ display: 'flex' }}>
              {flavors.map(f => {
                const on = current.id === f.id;
                return (
                  <button key={f.id} type="button" onClick={() => onPick(f)}
                    aria-label={`${f.name} theme`}
                    aria-pressed={on}
                    title={f.name}
                    style={{
                      width: 44, height: 44, padding: 0, margin: 0,
                      display: 'grid', placeItems: 'center',
                      background: 'transparent', border: 0,
                      borderRadius: 999,
                      outlineOffset: -5,
                      cursor: 'pointer',
                    }}>
                    <span aria-hidden="true" style={{
                      width: 28, height: 28, borderRadius: 999,
                      background: f.color,
                      boxSizing: 'border-box',
                      border: `2px solid ${on ? 'var(--fg-1)' : 'transparent'}`,
                      boxShadow: on ? `0 0 20px ${f.color}` : `0 0 0 ${f.color}00`,
                      transition: `border-color 200ms ${homeSecEase}, box-shadow 200ms ${homeSecEase}`,
                    }}/>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flavor-grid">
          {flavors.map(f => (
            <FlavorCard key={f.id} flavor={f}
              onAdd={() => onAdd(f)} onSelect={() => onPick(f)}
              highlighted={current.id === f.id}
              canHover={canHover} reduced={reduced}/>
          ))}
        </div>
      </div>
    </section>
  );
}

function FlavorCard({ flavor, onAdd, onSelect, highlighted, canHover, reduced }) {
  const [hoverRaw, setHover] = useStateH(false);
  const [imgLoaded, setImgLoaded] = useStateH(false);
  const hover = canHover && hoverRaw;
  const lift = hover && !reduced;
  return (
    <article
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--surface-card)',
        border: `1px solid ${highlighted ? flavor.color : (hover ? 'var(--border-2)' : 'var(--border-1)')}`,
        borderRadius: 'var(--radius-lg)',
        padding: 24,
        boxShadow: hover ? `0 18px 48px ${flavor.color}22, var(--shadow-lg)` : 'var(--shadow-md)',
        transform: lift ? 'translateY(-4px)' : 'none',
        transition: `transform 280ms ${homeSecEase}, box-shadow 280ms ${homeSecEase}, border-color 280ms ${homeSecEase}`,
        position: 'relative', overflow: 'hidden',
      }}>
      {/* corner badges */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 3, display: 'flex', gap: 6, pointerEvents: 'none' }}>
        {flavor.flagship && <span className="badge" style={{ background: 'var(--accent)' }}>FLAGSHIP</span>}
        {flavor.isNew && <span className="badge" style={{ background: flavor.color }}>NEW</span>}
      </div>
      {/* SKU code */}
      <div style={{ position: 'absolute', top: 18, right: 18, zIndex: 3, pointerEvents: 'none' }}>
        <span className="mono-sm" style={{ color: 'var(--fg-4)', fontSize: 10 }}>SL-{flavor.id.slice(0,3).toUpperCase()}</span>
      </div>

      {/* bottle area — selects this flavor's theme */}
      <button type="button" onClick={onSelect} className="sl-tilt"
        aria-label={`Preview ${flavor.name} theme`}
        style={{
          display: 'block', width: '100%', aspectRatio: '4 / 5', padding: 0, margin: '0 0 18px',
          background: 'var(--ink-900)', border: 0, borderRadius: 12, overflow: 'hidden',
          color: 'inherit', cursor: 'pointer',
          position: 'relative',
        }}>
        <img src={`assets/scenes/splash-${flavor.id}-640.webp`}
          srcSet={`assets/scenes/splash-${flavor.id}-640.webp 640w, assets/scenes/splash-${flavor.id}.webp 1200w`}
          sizes="(max-width: 700px) 92vw, 420px"
          width={640} height={800} loading="lazy" decoding="async"
          alt=""
          onLoad={() => setImgLoaded(true)}
          style={{
            display: 'block', width: '100%', height: '100%', objectFit: 'cover',
            // lazy splash fades in over the card's dark well instead of popping in mid-scroll
            opacity: imgLoaded ? 1 : 0,
            transform: lift ? 'scale(1.04)' : 'none',
            transition: `transform 600ms ${homeSecEase}, opacity ${reduced ? 200 : 300}ms ${homeSecEase}`,
          }}/>
      </button>

      <div className="h3" style={{ fontSize: 22 }}>{flavor.name}</div>
      <div className="body" style={{ fontSize: 13, marginTop: 6, marginBottom: 18, color: 'var(--fg-3)' }}>
        {flavor.tagline}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
        <div style={{ font: '700 18px var(--font-mono)', color: flavor.color }}>${flavor.price.toFixed(2)}<span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 500 }}> /BOTTLE</span></div>
        <button type="button" onClick={e => {
            e.stopPropagation();
            // loot pickup: the bottle arcs into the Fridge button, then the cart opens
            if (window.SLGame) window.SLGame.loot(e.currentTarget, `assets/bottle/renders/card-${flavor.id}.webp`).then(onAdd);
            else onAdd();
          }}
          aria-label={`Add ${flavor.name} to fridge`}
          style={{
            background: hover ? flavor.color : 'var(--surface-pill)',
            color: hover ? '#0E0F0A' : flavor.color,
            border: `1px solid ${flavor.color}`,
            borderRadius: 999, padding: '8px 14px',
            font: '600 13px var(--font-ui)',
            display: 'flex', gap: 6, alignItems: 'center',
            cursor: 'pointer',
            transition: `background-color 220ms ${homeSecEase}, color 220ms ${homeSecEase}, border-color 220ms ${homeSecEase}, box-shadow 220ms ${homeSecEase}`,
            boxShadow: hover ? `0 0 16px ${flavor.color}88` : 'none',
          }}>
          <Icon name="plus" size={14}/> Add
        </button>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────
// SCROLL STORY — three-act scroll-driven section
// (reduced motion: the three acts render stacked, in normal flow)
// ─────────────────────────────────────────────────────────────
const homeSecStoryActs = [
  { eyebrow: 'ACT 01 · THE PROBLEM',  title: 'Energy drinks were built for warehouses.',     body: "Sugar bombs and stim cocktails tuned for forklift shifts, not 6-hour ranked grinds. You crash. You jitter. You tilt.",
    alt: 'A glowing Slime Lime bottle standing among crushed energy drink cans on a warehouse floor' },
  { eyebrow: 'ACT 02 · THE SHIFT',    title: 'We rebuilt the bottle from the inside out.',      body: "75mg of clean caffeine paired with L-theanine. Real fruit, not flavor science. Six electrolytes that pull water in, not push it out.",
    alt: 'A slice of lime dropping into glowing green water, trailing bubbles' },
  { eyebrow: 'ACT 03 · THE RESULT',   title: 'Locked in. All session. Every time.',          body: "Smoother focus. Cleaner aim. No 4pm wall. No 1am collapse. Just calm, sustained, hydrated performance.",
    alt: 'A gamer in silhouette, lit by the green glow of a monitor in a dark room' },
];

function homeSecStoryAct(a) {
  return (
    <>
      <div className="eyebrow" style={{ marginBottom: 24, color: 'var(--accent)' }}>{a.eyebrow}</div>
      <h2 className="display-lg" style={{ marginBottom: 24 }}>{a.title}</h2>
      <p className="body-lg" style={{ maxWidth: 600 }}>{a.body}</p>
    </>
  );
}

function ScrollStory() {
  // Static stacked layout for reduced motion, and for viewports too short to hold
  // the sticky frame (nav + progress + act copy) without clipping.
  const reducedMotion = homeSecUseMedia('(prefers-reduced-motion: reduce)');
  const shortViewport = homeSecUseMedia('(max-height: 600px)');
  const reduced = reducedMotion || shortViewport;
  const wide = homeSecUseMedia('(min-width: 900px)');
  const ref = useRefH(null);
  const [progress, setProgress] = useStateH(0);
  // With GSAP loaded the whole section is one scrubbed ScrollTrigger timeline that writes
  // straight to the DOM (no React state per scroll frame); the state path is the fallback.
  const gs = !!window.SLMotion;
  const barRef = useRefH(null);
  const imgRefs = useRefH([]);
  const actRefs = useRefH([]);
  useEffectH(() => {
    if (reduced || !gs) return;
    const gsap = window.SLMotion.gsap;
    const n = homeSecStoryActs.length;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: ref.current, start: 'top top', end: 'bottom bottom', scrub: 0.6,
          onLeave: () => { if (window.SLGame) window.SLGame.achieve('lore'); } },
      });
      tl.fromTo(barRef.current, { scaleX: 0 }, { scaleX: 1, duration: n }, 0);
      const peak = wide ? 1 : 0.32;
      imgRefs.current.forEach((img, i) => {
        tl.fromTo(img, { scale: 1.1 }, { scale: 1, duration: 1 }, i);
        if (i > 0) tl.fromTo(img, { opacity: 0 }, { opacity: peak, duration: 0.18 }, i - 0.05);
        else gsap.set(img, { opacity: peak });
        if (i < n - 1) tl.to(img, { opacity: 0, duration: 0.18 }, i + 0.87);
      });
      actRefs.current.forEach((el, i) => {
        if (i > 0) {
          tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.04 }, i);
          tl.fromTo(el.children, { y: 44, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, stagger: 0.05, ease: 'power3.out' }, i);
        } else gsap.set(el, { autoAlpha: 1 });
        if (i < n - 1) tl.to(el.children, { y: -36, opacity: 0, duration: 0.14, stagger: 0.03, ease: 'power2.in' }, i + 0.82)
          .set(el, { autoAlpha: 0 }, i + 1);
      });
    }, ref);
    return () => ctx.revert();
  }, [reduced, wide, gs]);
  useEffectH(() => {
    if (reduced || gs) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = total > 0 ? Math.max(0, Math.min(1, -rect.top / total)) : 0;
      setProgress(p);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced]);

  const acts = homeSecStoryActs;
  const actVisible = i => (i === 0 || progress >= i / 3) && (i === acts.length - 1 || progress < (i + 1) / 3);
  const actOpacity = i => {
    if (!actVisible(i)) return 0;
    const local = (progress - i / 3) * 3;
    const fadeIn = i === 0 ? 1 : local / 0.15;
    const fadeOut = i === acts.length - 1 ? 1 : (1 - local) / 0.15;
    return Math.max(0, Math.min(1, fadeIn, fadeOut));
  };
  const bg ='linear-gradient(180deg, var(--ink-800) 0%, var(--ink-900) 100%)';

  if (reduced) {
    return (
      <section className="section" style={{ position: 'relative', overflow: 'hidden', background: bg }} data-level="Lore" data-screen-label="03 Scroll Story">
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 80 }}>
            {acts.map((a, i) => (
              <div key={i} style={{ display: 'grid', gap: 32, alignItems: 'center',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
                <div style={{ maxWidth: 720 }}>{homeSecStoryAct(a)}</div>
                <img src={`assets/scenes/story-act-0${i + 1}-640.webp`}
                  srcSet={`assets/scenes/story-act-0${i + 1}-640.webp 640w, assets/scenes/story-act-0${i + 1}.webp 1200w`}
                  sizes="(min-width: 900px) 40vw, 92vw" width={640} height={800}
                  loading="lazy" decoding="async" alt={a.alt}
                  style={{ width: '100%', maxWidth: 460, height: 'auto', borderRadius: 'var(--radius-lg)', justifySelf: 'center' }}/>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} data-no-reveal style={{ position: 'relative', height: '300vh' }} data-level="Lore" data-screen-label="03 Scroll Story">
      <div style={{
        position: 'sticky', top: 0,
        height: '100vh',
        boxSizing: 'border-box',
        paddingTop: 96, // clear the sticky nav so the centered copy never sits under it
        display: 'flex', alignItems: 'center',
        overflow: 'hidden',
        background: bg,
      }}>
        {/* act imagery — crossfades with the copy; scroll-linked, transform/opacity only, no transition */}
        <div aria-hidden="true" style={{
          position: 'absolute', pointerEvents: 'none', overflow: 'hidden',
          ...(wide
            ? { top: 0, right: 0, bottom: 0, width: '50%',
                WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 35%)', maskImage: 'linear-gradient(90deg, transparent 0%, #000 35%)' }
            : { inset: 0 }),
        }}>
          {acts.map((a, i) => {
            const local = Math.max(0, Math.min(1, (progress - i / 3) * 3));
            return (
              <img key={i} ref={el => { imgRefs.current[i] = el; }} src={`assets/scenes/story-act-0${i + 1}-640.webp`}
                srcSet={`assets/scenes/story-act-0${i + 1}-640.webp 640w, assets/scenes/story-act-0${i + 1}.webp 1200w`}
                sizes={wide ? '50vw' : '100vw'} alt="" decoding="async"
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                  ...(gs ? { opacity: 0 } : {
                    opacity: actOpacity(i) * (wide ? 1 : 0.32),
                    transform: `scale(${1.08 - local * 0.08})`,
                  }),
                  willChange: 'transform, opacity',
                }}/>
            );
          })}
          {!wide && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(6,13,8,0.2), rgba(6,13,8,0.85))' }}/>}
        </div>

        <div className="container" style={{ position: 'relative', zIndex: 2, width: '100%', boxSizing: 'border-box' }}>
          {/* progress bar */}
          <div aria-hidden="true" style={{ marginBottom: 56 }}>
            <div style={{ position: 'relative', height: 2, background: 'var(--border-1)' }}>
              <div ref={barRef} style={{
                position: 'absolute', inset: 0,
                background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)',
                ...(gs ? { transform: 'scaleX(0)' } : { transform: `scaleX(${progress})` }), transformOrigin: 'left center',
              }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 12, font: '500 11px var(--font-mono)', color: 'var(--fg-3)', letterSpacing: '0.08em' }}>
              <span>01 PROBLEM</span>
              <span>02 SHIFT</span>
              <span>03 RESULT</span>
            </div>
          </div>

          {/* acts share one grid cell, so the block is as tall as the tallest act */}
          <div style={{ display: 'grid', maxWidth: 720 }}>
            {acts.map((a, i) => {
              const visible = actVisible(i);
              const opacity = actOpacity(i);
              return (
                <div key={i} ref={el => { actRefs.current[i] = el; }} style={{
                  gridArea: '1 / 1',
                  minWidth: 0,
                  ...(gs ? { visibility: i === 0 ? 'visible' : 'hidden' } : {
                    opacity,
                    transform: `translateY(${visible ? 0 : 20}px)`,
                    // opacity tracks scroll directly; only the visibility toggle's nudge eases
                    transition: `transform 240ms ${homeSecEase}`,
                    pointerEvents: visible ? 'auto' : 'none',
                  }),
                }}>
                  {homeSecStoryAct(a)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// STREAMER QUOTES
// ─────────────────────────────────────────────────────────────
function Streamers() {
  const quotes = [
    { name: 'Mira "frame_" Lin',  handle: '@frame_',     reach: '380K followers', game: 'Apex Legends',     quote: "I used to chug Monster on stream and crash by hour 4. Slime Lime is the first drink that lets me actually finish a tournament without losing focus." },
    { name: 'Voidstep',            handle: '@voidstep',   reach: '1.2M followers', game: 'Valorant',         quote: "Tastes like a real lemon-lime, not chemical sugar. The 75mg dose is the sweet spot — alert without the shakes." },
    { name: 'Pacing.exe',          handle: '@pacing.exe', reach: '210K followers', game: 'League of Legends',quote: "I drink one before scrims and one mid-match. Six hours later I'm still locked in, no headache." },
  ];
  return (
    <section className="section" style={{ background: 'var(--ink-900)', borderTop: '1px solid var(--border-1)', borderBottom: '1px solid var(--border-1)' }} data-level="Squad" data-screen-label="04 Streamers">
      <div className="container">
        <div style={{ marginBottom: 56 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>// CREATOR DESK · WHAT THEY'RE SAYING</div>
          <h2 className="display-lg">
            From the people<br/>
            <span style={{ color: 'var(--accent)' }}>actually grinding.</span>
          </h2>
        </div>

        <div className="sl-skew" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 20 }}>
          {quotes.map((q, i) => (
            <div key={i} className="card" style={{ padding: 32 }}>
              {/* live indicator */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <span className="hud-pill" style={{ fontSize: 10 }}><span className="dot"/>LIVE</span>
                <Icon name="twitch" size={18}/>
              </div>
              {/* avatar placeholder */}
              <div aria-hidden="true" style={{
                width: 56, height: 56,
                borderRadius: 999,
                background: `linear-gradient(135deg, ${['#CAE00F', '#FF3D5C', '#3D8BFF'][i]}, ${['#7A8A00', '#A8132B', '#0F4FB3'][i]})`,
                marginBottom: 16,
                position: 'relative',
                boxShadow: '0 0 20px rgba(0,0,0,0.4)'
              }}>
                <div style={{ position: 'absolute', inset: 4, borderRadius: 999, background: 'var(--ink-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 18px var(--font-ui)', color: 'var(--fg-1)' }}>
                  {q.name.split(' ').map(s => s[0]).join('').slice(0, 2)}
                </div>
              </div>
              <div style={{ font: '600 16px var(--font-ui)', marginBottom: 4 }}>{q.name}</div>
              <div className="mono-sm" style={{ color: 'var(--fg-3)', marginBottom: 24 }}>{q.handle} · {q.game}</div>
              <p className="body" style={{ fontSize: 15, color: 'var(--fg-1)' }}>"{q.quote}"</p>
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono-sm" style={{ color: 'var(--fg-4)' }}>{q.reach}</span>
                <span role="img" aria-label="5 out of 5 stars" style={{ display: 'flex', gap: 4, color: 'var(--accent)' }}>
                  {[1,2,3,4,5].map(n => <Icon key={n} name="star" size={12}/>)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// SUBSCRIBE BAR — Big call to subscribe section
// ─────────────────────────────────────────────────────────────
function SubscribeBar({ onGo }) {
  return (
    <section className="section" style={{ position: 'relative', overflow: 'hidden' }} data-level="Loadout" data-screen-label="05 Subscribe Pitch">
      <div data-parallax="0.3" style={{
        position: 'absolute', inset: '-15% 0',
        backgroundImage: 'url(assets/scenes/lifestyle-desk.webp)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        opacity: 0.3,
      }}/>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 50%, rgba(202,224,15,0.25), transparent 60%)',
      }}/>

      <div className="container-narrow" style={{ position: 'relative', textAlign: 'center' }}>
        <div className="eyebrow" style={{ marginBottom: 24, justifyContent: 'center', display: 'inline-flex' }}>// SUBSCRIBE · SAVE 28%</div>
        <h2 className="display-lg" style={{ marginBottom: 24 }}>
          Stock the fridge.<br/>
          <span style={{ color: 'var(--accent)' }}>Skip whenever.</span>
        </h2>
        <p className="body-lg" style={{ maxWidth: 640, margin: '0 auto 40px', color: 'var(--fg-2)' }}>
          Pick your flavors, set your cadence, save up to 28%. Pause, swap, or cancel from your dashboard. No sneaky lock-ins.
        </p>

        {/* feature pills */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 40 }}>
          {[
            ['swap', 'Swap flavors anytime'],
            ['pause', 'Pause & skip with one tap'],
            ['shield', 'No commitment, no penalty'],
            ['flame', 'Build a streak. Earn perks.'],
          ].map(([icon, label]) => (
            <span key={label} style={{
              display: 'inline-flex', gap: 8, alignItems: 'center',
              padding: '10px 16px',
              border: '1px solid var(--border-2)',
              borderRadius: 999,
              background: 'rgba(6, 13, 8, 0.6)',
              backdropFilter: 'blur(8px)',
              font: '500 13px var(--font-body)',
              color: 'var(--fg-2)',
            }}>
              <span aria-hidden="true" style={{ color: 'var(--accent)' }}><Icon name={icon} size={14}/></span>
              {label}
            </span>
          ))}
        </div>

        <button onClick={onGo} className="btn btn-primary btn-xl">
          Build your subscription <Icon name="arrow" size={18}/>
        </button>

        {/* recent subscribers */}
        <div className="mono-sm" style={{ color: 'var(--fg-3)', marginTop: 32 }}>
          <span style={{ color: 'var(--accent)' }}>● 12 subscribers</span> joined in the last hour
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// HOME PAGE
// ─────────────────────────────────────────────────────────────
function HomePage({ flavor, onPickFlavor, onAdd }) {
  const flavors = window.FLAVORS;
  return (
    <>
      <Hero flavor={flavor} flavors={flavors} onPickFlavor={onPickFlavor} onShop={() => {
        if (window.SLMotion) window.SLMotion.scrollTo('#shop');
        else document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
      }}/>
      <LiveTicker/>
      <ProofStrip/>
      <Lineup flavors={flavors} current={flavor} onPick={onPickFlavor} onAdd={onAdd}/>
      <ScrollStory/>
      <Streamers/>
      <SubscribeBar onGo={() => window.navTo('/subscribe')}/>
    </>
  );
}

window.HomePage = HomePage;
