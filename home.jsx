/* global React */
// HOME PAGE — Animated reactive hero, lineup w/ flavor recolor, ticker, streamers, story
const { useState: useStateH, useEffect: useEffectH, useRef: useRefH, useMemo: useMemoH } = React;

// ─────────────────────────────────────────────────────────────
// HERO — Reactive: cursor controls slime morph + can rotation, click to drip
// ─────────────────────────────────────────────────────────────
const heroEase = 'cubic-bezier(0.23, 1, 0.32, 1)';
const heroInteractive = 'a,button,input,select,textarea,label,[role="button"]';

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

// Right-hand callouts are clamped so they never run past the container edge.
const heroPinRight = pct => `min(${pct}, calc(100% - 132px + max(0px, (100vw - 1280px) / 2)))`;
const heroPins = [
  { x: '-8%', y: '22%', label: 'CAFFEINE', value: '75mg', sub: 'clean · slow-release' },
  { x: heroPinRight('86%'), y: '34%', label: 'SUGAR', value: '5g', sub: 'real fruit · low gi' },
  { x: '-12%', y: '68%', label: 'CRASH', value: '0', sub: 'all session' },
  { x: heroPinRight('84%'), y: '78%', label: 'VOL', value: '12oz', sub: 'slim can' },
];

// Hydration readout ticks in its own component so the hero (and its bottle SVG) doesn't re-render.
function HeroHydration({ paused }) {
  const [value, setValue] = useStateH(75);
  useEffectH(() => {
    if (paused) return;
    const tick = () => setValue(70 + Math.round(Math.sin(Date.now() / 800) * 5 + 5));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [paused]);
  return <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{value}%</span>;
}

// Click splash: expands and fades out (transform/opacity); keeps the slime morph for character.
function HeroDrip({ x, y, color, reduced }) {
  const ref = useRefH(null);
  useEffectH(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    el.animate(
      reduced
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1, transform: 'scale(0.6)' }, { opacity: 0, transform: 'scale(1.15)' }],
      { duration: reduced ? 400 : 1200, easing: heroEase, fill: 'forwards' }
    );
  }, []);
  return (
    <div ref={ref} data-hero-drip="" aria-hidden="true" style={{
      position: 'absolute',
      left: x - 60, top: y - 60,
      width: 120, height: 120,
      borderRadius: '50%',
      background: `radial-gradient(circle, ${color}88, transparent 60%)`,
      animation: reduced ? 'none' : 'slime-morph 1.4s ease-out forwards',
      pointerEvents: 'none',
      zIndex: 2,
    }}/>
  );
}

function Hero({ flavor, onShop, onWatch }) {
  const ref = useRefH(null);
  const gridRef = useRefH(null);
  const eyebrowRef = useRefH(null);
  const h1Ref = useRefH(null);
  const bodyRef = useRefH(null);
  const ctaRef = useRefH(null);
  const metricsRef = useRefH(null);
  const bottleRef = useRefH(null);
  const underlineRef = useRefH(null);
  const readXRef = useRefH(null);
  const readYRef = useRefH(null);
  const dripSeq = useRefH(0);
  const dripTimers = useRefH(new Set());

  const finePointer = heroUseMedia('(hover: hover) and (pointer: fine)');
  const reduced = heroUseMedia('(prefers-reduced-motion: reduce)');
  const narrow = heroUseMedia('(max-width: 899px)');
  const small = heroUseMedia('(max-width: 600px)');

  const [active, setActive] = useStateH(false); // pointer over the hero, not over a control
  const [drips, setDrips] = useStateH([]);
  const [offscreen, setOffscreen] = useStateH(false);

  // Cursor tracking: write --mx/--my (0–1) on the section once per frame; no React state per move.
  useEffectH(() => {
    const el = ref.current;
    if (!el || !finePointer) return;
    let raf = 0, px = 0.5, py = 0.5, shown = false;
    const pad = n => String(n).padStart(4, '0');
    const flush = () => {
      raf = 0;
      el.style.setProperty('--mx', px.toFixed(4));
      el.style.setProperty('--my', py.toFixed(4));
      if (readXRef.current) readXRef.current.textContent = 'X:' + pad(Math.round(px * 1920));
      if (readYRef.current) readYRef.current.textContent = 'Y:' + pad(Math.round(py * 1080));
    };
    const onMove = e => {
      const rect = el.getBoundingClientRect();
      px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      const show = !(e.target instanceof Element && e.target.closest(heroInteractive));
      if (show !== shown) {
        if (show) flush(); // place the reticle before it fades in
        shown = show;
        setActive(show);
      }
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onLeave = () => { shown = false; setActive(false); };
    el.addEventListener('mousemove', onMove, { passive: true });
    el.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [finePointer]);

  // Pause ambient loops while the hero is offscreen.
  useEffectH(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffectH(() => {
    const svg = underlineRef.current;
    if (!svg || typeof svg.pauseAnimations !== 'function') return;
    if (offscreen) svg.pauseAnimations(); else svg.unpauseAnimations();
  }, [offscreen, reduced]);

  // First-load entrance, once per session. Fill 'backwards' only, so nothing lingers or blocks clicks.
  React.useLayoutEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem('sl-hero-seen') === '1';
      sessionStorage.setItem('sl-hero-seen', '1');
    } catch (err) { /* storage unavailable: just play it */ }
    if (seen) return;
    const run = (el, keyframes, opts) => {
      if (el && typeof el.animate === 'function') el.animate(keyframes, { fill: 'backwards', ...opts });
    };
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      run(gridRef.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' });
      return;
    }
    [eyebrowRef, h1Ref, bodyRef, ctaRef, metricsRef].forEach((r, i) => run(r.current,
      [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 500, delay: i * 60, easing: heroEase }));
    run(bottleRef.current,
      [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: 600, delay: 120, easing: heroEase });
  }, []);

  useEffectH(() => {
    const timers = dripTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleClick = e => {
    if (e.target instanceof Element && e.target.closest(heroInteractive)) return;
    const rect = ref.current.getBoundingClientRect();
    const id = ++dripSeq.current;
    setDrips(d => [...d, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    const t = setTimeout(() => {
      dripTimers.current.delete(t);
      setDrips(d => d.filter(x => x.id !== id));
    }, reduced ? 450 : 1300);
    dripTimers.current.add(t);
  };

  const play = offscreen ? 'paused' : 'running';
  const showReticle = finePointer && active;
  const follow = finePointer && !reduced; // blob + bottle respond to the cursor
  const bottleH = small ? 400 : narrow ? 480 : 580;
  const stageH = narrow ? bottleH + 40 : 600;
  const ringSize = Math.round(bottleH * 0.93);
  const puddleSize = Math.round(bottleH * 0.8);
  const padX = small ? 20 : 32;
  const pillStyle = small ? { fontSize: 9, padding: '5px 8px', whiteSpace: 'nowrap' } : { whiteSpace: 'nowrap' };
  // Memoized so hover/drip re-renders don't rebuild the bottle SVG.
  const canEl = useMemoH(() => <Can flavor={flavor} height={bottleH}/>, [flavor, bottleH]);
  const followTransform = 'translate3d(calc((var(--mx, 0.5) - 0.5) * 100%), calc((var(--my, 0.5) - 0.5) * 100%), 0)';

  return (
    <section ref={ref} onClick={handleClick} data-offscreen={offscreen ? 'true' : 'false'} style={{
      position: 'relative',
      minHeight: '100vh',
      overflow: 'hidden',
      paddingTop: 60,
      cursor: showReticle ? 'none' : undefined,
    }} data-screen-label="01 Home Hero">
      {/* layered background */}
      <div className="hero-bg"/>

      {/* Video-game targeting reticle following cursor (fine pointers only) */}
      {finePointer && (
        <div data-hero-reticle="" aria-hidden="true" style={{
          position: 'absolute', inset: 0,
          pointerEvents: 'none',
          zIndex: 20,
          mixBlendMode: 'screen',
          transform: followTransform,
          opacity: showReticle ? 1 : 0,
          transition: `opacity 150ms ${heroEase}`,
        }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 64, height: 64, marginLeft: -32, marginTop: -32 }}>
            <svg viewBox="0 0 64 64" width="64" height="64" style={{ filter: `drop-shadow(0 0 6px ${flavor.color})` }}>
              {/* Outer rotating ring */}
              <g style={{
                transformOrigin: '32px 32px',
                animation: reduced ? 'none' : `slime-rotate 6s linear infinite ${showReticle ? 'running' : 'paused'}`,
              }}>
                <circle cx="32" cy="32" r="26" fill="none" stroke={flavor.color} strokeWidth="1" strokeDasharray="3 3" opacity="0.6"/>
              </g>
              {/* Inner ring */}
              <circle cx="32" cy="32" r="18" fill="none" stroke={flavor.color} strokeWidth="1.5"/>
              {/* Corner brackets */}
              <path d="M 8 14 L 8 8 L 14 8" stroke={flavor.color} strokeWidth="2" fill="none" strokeLinecap="square"/>
              <path d="M 50 8 L 56 8 L 56 14" stroke={flavor.color} strokeWidth="2" fill="none" strokeLinecap="square"/>
              <path d="M 56 50 L 56 56 L 50 56" stroke={flavor.color} strokeWidth="2" fill="none" strokeLinecap="square"/>
              <path d="M 14 56 L 8 56 L 8 50" stroke={flavor.color} strokeWidth="2" fill="none" strokeLinecap="square"/>
              {/* Crosshair lines (with gap in center) */}
              <line x1="32" y1="0" x2="32" y2="22" stroke={flavor.color} strokeWidth="1.5"/>
              <line x1="32" y1="42" x2="32" y2="64" stroke={flavor.color} strokeWidth="1.5"/>
              <line x1="0" y1="32" x2="22" y2="32" stroke={flavor.color} strokeWidth="1.5"/>
              <line x1="42" y1="32" x2="64" y2="32" stroke={flavor.color} strokeWidth="1.5"/>
              {/* Center dot */}
              <circle cx="32" cy="32" r="2" fill={flavor.color}/>
              {/* Pulse ring */}
              <circle cx="32" cy="32" r="14" fill="none" stroke={flavor.color} strokeWidth="1" opacity="0.5">
                {showReticle && !reduced && <animate attributeName="r" values="14;28;14" dur="1.6s" repeatCount="indefinite"/>}
                {showReticle && !reduced && <animate attributeName="opacity" values="0.6;0;0.6" dur="1.6s" repeatCount="indefinite"/>}
              </circle>
            </svg>
            {/* HUD readout next to reticle (updated via refs, not state) */}
            <div style={{
              position: 'absolute',
              top: 36, left: 40,
              font: '600 9px var(--font-mono)',
              color: flavor.color,
              letterSpacing: '0.1em',
              textShadow: `0 0 6px ${flavor.color}`,
              whiteSpace: 'nowrap',
            }}>
              <div ref={readXRef} data-hero-readout-x="">X:0960</div>
              <div ref={readYRef}>Y:0540</div>
              <div style={{ marginTop: 2 }}>● LOCK</div>
            </div>
          </div>
        </div>
      )}

      {/* moving liquid blob that follows cursor */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none',
        transform: follow ? followTransform : 'none',
        transition: 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}>
        <div className="liquid-blob" style={{
          left: 'calc(50% - 300px)',
          top: 'calc(50% - 300px)',
          background: `radial-gradient(circle, ${flavor.color} 0%, transparent 60%)`,
          animationPlayState: play,
        }}/>
      </div>

      {/* slime drip splashes on click */}
      {drips.map(d => <HeroDrip key={d.id} x={d.x} y={d.y} color={flavor.color} reduced={reduced}/>)}

      {/* HUD overlays — top-left + top-right */}
      <div className="container" style={{
        position: 'absolute', top: 32, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        padding: `0 ${padX}px`,
        zIndex: 5, pointerEvents: 'none',
      }}>
        <div className="hud-pill" style={pillStyle}><span className="dot" style={{ animationPlayState: play }}/>SESSION ACTIVE · 03:42:18</div>
        <div className="hud-pill" style={{ ...pillStyle, pointerEvents: 'auto' }}>
          HYDRATION: <HeroHydration paused={offscreen}/>
        </div>
      </div>

      {/* HUD bottom-left + corner brackets */}
      <div className="hud-frame-corners" style={{ inset: small ? '64px 10px' : narrow ? '72px 16px' : '80px 32px' }}/>

      {/* main grid */}
      <div ref={gridRef} className="container" style={{
        position: 'relative', zIndex: 3,
        minHeight: narrow ? 0 : 'calc(100vh - 60px)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
        gap: narrow ? 40 : 48,
        alignItems: 'center',
        padding: small ? `64px ${padX}px 88px` : narrow ? `80px ${padX}px 96px` : `80px ${padX}px`,
      }}>
        {/* Left — copy */}
        <div style={{ position: 'relative', minWidth: 0 }}>
          <div ref={eyebrowRef} className="eyebrow" style={{ marginBottom: 24 }}>FUNCTIONAL HYDRATION · BUILT FOR GAMERS</div>
          <h1 ref={h1Ref} className="display-xl" style={{ marginBottom: 24 }}>
            Late nights<br/>
            deserve<br/>
            <span style={{
              color: 'var(--accent)',
              position: 'relative',
              display: 'inline-block',
              filter: `drop-shadow(0 0 24px var(--accent-glow))`,
            }}>
              better fuel.
              {/* dripping underline */}
              <svg ref={underlineRef} viewBox="0 0 600 80" aria-hidden="true" style={{
                position: 'absolute', bottom: -36, left: 0, width: '100%', height: 60, pointerEvents: 'none'
              }}>
                <path d="M 0 10 Q 100 20 200 10 T 400 10 T 600 10" stroke="var(--accent)" strokeWidth="3" fill="none" opacity="0.7"/>
                {[80, 200, 320, 480].map((cx, i) => (
                  <circle key={i} cx={cx} cy="10" r="3" fill="var(--accent)">
                    {!reduced && <animate attributeName="cy" values={`10;${30 + i * 8};10`} dur={`${2 + i * 0.4}s`} repeatCount="indefinite"/>}
                    {!reduced && <animate attributeName="r" values="3;5;3" dur={`${2 + i * 0.4}s`} repeatCount="indefinite"/>}
                  </circle>
                ))}
              </svg>
            </span>
          </h1>
          <p ref={bodyRef} className="body-lg" style={{ maxWidth: 480, marginBottom: 36, marginTop: 32 }}>
            5g sugar. 75mg clean caffeine. Zero crash. Real electrolytes.<br/>
            The lemon-lime drink built for the long session.
          </p>
          <div ref={ctaRef} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 48 }}>
            <button onClick={onShop} className="btn btn-primary btn-xl" style={{ whiteSpace: 'nowrap', ...(small ? { flex: '1 1 auto', justifyContent: 'center' } : null) }}>
              Shop the lineup <Icon name="arrow" size={18}/>
            </button>
            <button onClick={onWatch} className="btn btn-secondary btn-xl" style={{ whiteSpace: 'nowrap', ...(small ? { flex: '1 1 auto', justifyContent: 'center' } : null) }}>
              <Icon name="bolt" size={16}/> Read the science
            </button>
          </div>
          {/* Inline metrics */}
          <div ref={metricsRef} style={{ display: 'flex', columnGap: small ? 20 : 32, rowGap: 8, color: 'var(--fg-3)', flexWrap: 'wrap' }}>
            <span className="mono-sm" style={{ color: 'var(--fg-2)' }}>
              <span style={{ color: 'var(--accent)' }}>★ 4.8</span> · 12,400 REVIEWS
            </span>
            <span className="mono-sm">FREE SHIPPING $40+</span>
            <span className="mono-sm">SHIPS IN 24H</span>
          </div>
        </div>

        {/* Right — Animated, reactive bottle */}
        <div style={{ position: 'relative', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <div style={{ position: 'relative', width: '100%', height: stageH, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {/* Slime puddle behind */}
            <div aria-hidden="true" style={{
              position: 'absolute', width: puddleSize, height: puddleSize,
              background: `radial-gradient(circle, ${flavor.color}55 0%, transparent 65%)`,
              filter: 'blur(40px)',
              animation: reduced ? 'none' : `slime-morph 8s ease-in-out infinite ${play}`,
            }}/>

            {/* Ring readout */}
            <svg viewBox="0 0 500 500" aria-hidden="true" style={{
              position: 'absolute', width: ringSize, height: ringSize,
              animation: reduced ? 'none' : `slime-rotate 80s linear infinite ${play}`,
              opacity: 0.4,
            }}>
              <circle cx="250" cy="250" r="240" fill="none" stroke={flavor.color} strokeWidth="0.5" strokeDasharray="2 6"/>
              <circle cx="250" cy="250" r="220" fill="none" stroke={flavor.color} strokeWidth="0.5" strokeDasharray="1 12"/>
              <text x="250" y="20" textAnchor="middle" fontSize="9" fill={flavor.color} letterSpacing="3" style={{ fontFamily: 'var(--font-mono)' }}>
                CLEAN · CAFFEINE · ELECTROLYTES · NO CRASH · CLEAN · CAFFEINE · ELECTROLYTES · NO CRASH ·
              </text>
            </svg>

            {/* Drip drops behind bottle (skipped under reduced motion) */}
            {!reduced && [0, 1, 2, 3].map(i => (
              <div key={i} aria-hidden="true" style={{
                position: 'absolute',
                top: -40, left: `${30 + i * 12}%`,
                width: 8, height: 12,
                background: flavor.color,
                borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
                animation: `drip ${3 + i * 0.6}s ${i * 0.4}s infinite ${play}`,
                filter: `drop-shadow(0 0 6px ${flavor.color})`,
                opacity: 0.7,
              }}/>
            ))}

            {/* The bottle itself, reactive. Outer wrapper owns the entrance; inner owns tilt/lift. */}
            <div ref={bottleRef} data-hero-bottle="" style={{ position: 'relative' }}>
              <div style={{
                position: 'relative',
                transform: follow
                  ? 'rotateY(calc((var(--mx, 0.5) - 0.5) * 8deg)) translateY(calc((var(--my, 0.5) - 0.5) * -10px))'
                  : 'none',
                transition: `transform 240ms ${heroEase}`,
                transformStyle: 'preserve-3d',
                filter: `drop-shadow(0 30px 60px ${flavor.color}55)`,
              }}>
                {canEl}
              </div>
            </div>

            {/* Stat callouts pinned around the bottle (wide layouts) */}
            {!narrow && (
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, margin: '0 auto', width: 'min(100%, 580px)' }}>
                {heroPins.map(p => <CalloutPin key={p.label} {...p}/>)}
              </div>
            )}
          </div>

          {/* Stat callouts as a 2×2 grid under the bottle (narrow layouts) */}
          {narrow && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, width: '100%', maxWidth: 480 }}>
              {heroPins.map(p => <CalloutPin key={p.label} {...p} stacked/>)}
            </div>
          )}
        </div>
      </div>

      {/* Bottom HUD: scroll cue */}
      <div className="container" style={{
        position: 'absolute', bottom: 24, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        padding: `0 ${padX}px`,
        zIndex: 5,
      }}>
        <span className="mono-sm" style={{ color: 'var(--fg-3)', ...(small ? { fontSize: 10 } : null) }}>
          {finePointer ? '// CLICK ANYWHERE TO DRIP' : '// TAP ANYWHERE TO DRIP'}
        </span>
        <span className="mono-sm" style={{ color: 'var(--fg-3)', ...(small ? { fontSize: 10 } : null) }}>SCROLL FOR LINEUP <Icon name="arrowDown" size={12}/></span>
      </div>
    </section>
  );
}

function CalloutPin({ x, y, label, value, sub, stacked = false }) {
  return (
    <div data-hero-pin="" style={{
      position: stacked ? 'relative' : 'absolute',
      left: stacked ? undefined : x,
      top: stacked ? undefined : y,
      background: 'rgba(6, 13, 8, 0.85)',
      backdropFilter: 'blur(8px)',
      border: '1px solid var(--accent)',
      borderRadius: 12,
      padding: '10px 14px',
      minWidth: stacked ? 0 : 140,
      boxShadow: '0 0 16px var(--accent-soft)',
      zIndex: 4,
    }}>
      <div className="mono-sm" style={{ color: 'var(--fg-3)', fontSize: 9 }}>{label}</div>
      <div style={{ font: '700 22px/1 var(--font-mono)', color: 'var(--accent)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div className="mono-sm" style={{ color: 'var(--fg-4)', fontSize: 9, marginTop: 4 }}>{sub}</div>
      <span style={{
        position: 'absolute', top: -3, right: -3,
        width: 6, height: 6,
        background: 'var(--accent)',
        borderRadius: 999,
        boxShadow: '0 0 8px var(--accent-glow)',
      }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LIVE TICKER — Recent orders / streaks
// ─────────────────────────────────────────────────────────────
function LiveTicker() {
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

  return (
    <section style={{
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
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <div style={{ display: 'flex', gap: 32, animation: 'marquee 80s linear infinite', width: 'max-content' }}>
            {[...events, ...events].map((e, i) => (
              <span key={i} className="mono-sm" style={{ color: 'var(--fg-3)', display: 'flex', gap: 8, whiteSpace: 'nowrap', fontSize: 12 }}>
                <span style={{ color: 'var(--accent)' }}>●</span>
                <span style={{ color: 'var(--fg-1)' }}>@{e.user}</span>
                <span>·</span>
                <span>{e.city}</span>
                <span>·</span>
                <span>{e.msg}</span>
                <span style={{ color: 'var(--fg-4)' }}>· {e.time}</span>
              </span>
            ))}
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
    { v: '75mg', l: 'CLEAN CAFFEINE', s: 'L-theanine paired. Slow-release. No crash.' },
    { v: '5g', l: 'SUGAR · 35 CAL', s: 'Real fruit. Low glycemic. No phantom calories.' },
    { v: '6', l: 'ELECTROLYTES', s: 'Sodium, potassium, magnesium. Real hydration.' },
    { v: '0', l: 'BS INGREDIENTS', s: 'No taurine, no fake colors, no smoke and mirrors.' },
  ];
  return (
    <section className="section-sm" style={{ borderBottom: '1px solid var(--border-1)' }}>
      <div className="container" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
        {stats.map(s => (
          <div key={s.l} style={{ borderLeft: '1px solid var(--border-2)', paddingLeft: 24 }}>
            <div style={{ font: '700 64px/1 JetBrains Mono', color: 'var(--accent)', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
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
function Lineup({ flavors, current, onPick, onAdd }) {
  return (
    <section className="section" id="shop" data-screen-label="02 Lineup">
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 56, flexWrap: 'wrap', gap: 24 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 16 }}>// THE LINEUP · 6 SKUs</div>
            <h2 className="display-lg">
              Six flavors.<br/>
              <span style={{ color: 'var(--accent)' }}>One mission.</span>
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span className="mono-sm" style={{ color: 'var(--fg-3)' }}>// THEME</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {flavors.map(f => (
                <button key={f.id} onClick={() => onPick(f)}
                  title={f.name}
                  style={{
                    width: 28, height: 28, borderRadius: 999,
                    background: f.color,
                    border: current.id === f.id ? '2px solid var(--fg-1)' : '2px solid transparent',
                    boxShadow: current.id === f.id ? `0 0 20px ${f.color}` : 'none',
                    cursor: 'pointer',
                    transition: 'all 200ms',
                  }}/>
              ))}
            </div>
          </div>
        </div>

        <div className="flavor-grid">
          {flavors.map(f => <FlavorCard key={f.id} flavor={f} onAdd={() => onAdd(f)} onSelect={() => onPick(f)} highlighted={current.id === f.id}/>)}
        </div>
      </div>
    </section>
  );
}

function FlavorCard({ flavor, onAdd, onSelect, highlighted }) {
  const [hover, setHover] = useStateH(false);
  return (
    <article
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      style={{
        background: 'var(--surface-card)',
        border: `1px solid ${highlighted ? flavor.color : (hover ? 'var(--border-2)' : 'var(--border-1)')}`,
        borderRadius: 20,
        padding: 24,
        boxShadow: hover ? `0 18px 48px ${flavor.color}22, var(--shadow-lg)` : 'var(--shadow-md)',
        transform: hover ? 'translateY(-4px)' : 'none',
        transition: 'all 280ms var(--ease-slime)',
        position: 'relative', overflow: 'hidden',
        cursor: 'pointer'
      }}>
      {/* corner badges */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 3, display: 'flex', gap: 6 }}>
        {flavor.flagship && <span className="badge" style={{ background: 'var(--accent)' }}>FLAGSHIP</span>}
        {flavor.isNew && <span className="badge" style={{ background: flavor.color }}>NEW</span>}
      </div>
      {/* SKU code */}
      <div style={{ position: 'absolute', top: 18, right: 18, zIndex: 3 }}>
        <span className="mono-sm" style={{ color: 'var(--fg-4)', fontSize: 10 }}>SL-{flavor.id.slice(0,3).toUpperCase()}</span>
      </div>

      {/* glow */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        width: 280, height: 280,
        transform: 'translate(-50%, -50%)',
        background: `radial-gradient(circle, ${flavor.color}55, transparent 60%)`,
        filter: 'blur(30px)',
        opacity: hover ? 1 : 0.5,
        transition: 'opacity 280ms',
      }}/>

      <div style={{
        height: 320, display: 'flex', justifyContent: 'center', alignItems: 'center',
        position: 'relative', marginBottom: 16,
        transform: hover ? 'translateY(-8px) rotate(-3deg)' : 'none',
        transition: 'transform 380ms var(--ease-slime)',
      }}>
        <Can flavor={flavor} height={300}/>
      </div>

      <div className="h3" style={{ fontSize: 22 }}>{flavor.name}</div>
      <div className="body" style={{ fontSize: 13, marginTop: 6, marginBottom: 18, color: 'var(--fg-3)' }}>
        {flavor.tagline}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ font: '700 18px JetBrains Mono', color: flavor.color }}>${flavor.price.toFixed(2)}<span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 500 }}> /CAN</span></div>
        <button onClick={e => { e.stopPropagation(); onAdd(); }}
          style={{
            background: hover ? flavor.color : 'var(--surface-pill)',
            color: hover ? '#0E0F0A' : flavor.color,
            border: `1px solid ${flavor.color}`,
            borderRadius: 999, padding: '8px 14px',
            font: '600 13px Space Grotesk, sans-serif',
            display: 'flex', gap: 6, alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 220ms',
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
// ─────────────────────────────────────────────────────────────
function ScrollStory() {
  const ref = useRefH(null);
  const [progress, setProgress] = useStateH(0);
  useEffectH(() => {
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = Math.max(0, Math.min(1, -rect.top / total));
      setProgress(p);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const acts = [
    { eyebrow: 'ACT 01 · THE PROBLEM',  title: 'Energy drinks were built for warehouses.',     body: "Sugar bombs and stim cocktails tuned for forklift shifts, not 6-hour ranked grinds. You crash. You jitter. You tilt." },
    { eyebrow: 'ACT 02 · THE SHIFT',    title: 'We rebuilt the can from the inside out.',      body: "75mg of clean caffeine paired with L-theanine. Real fruit, not flavor science. Six electrolytes that pull water in, not push it out." },
    { eyebrow: 'ACT 03 · THE RESULT',   title: 'Locked in. All session. Every time.',          body: "Smoother focus. Cleaner aim. No 4pm wall. No 1am collapse. Just calm, sustained, hydrated performance." },
  ];

  return (
    <section ref={ref} style={{ position: 'relative', height: '300vh' }} data-screen-label="03 Scroll Story">
      <div style={{
        position: 'sticky', top: 0,
        height: '100vh',
        display: 'flex', alignItems: 'center',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, var(--ink-800) 0%, var(--ink-900) 100%)',
      }}>
        {/* moving slime mark */}
        <img src="assets/mark-slime.png" alt="" style={{
          position: 'absolute',
          right: -100, top: '50%',
          width: 700,
          transform: `translateY(-50%) translateX(${(1 - progress) * 200}px) rotate(${progress * 90}deg)`,
          opacity: 0.18 + progress * 0.18,
          transition: 'all 0.05s linear',
          filter: 'hue-rotate(0deg)',
          pointerEvents: 'none',
        }}/>

        <div className="container" style={{ position: 'relative', zIndex: 2, width: '100%' }}>
          <div style={{ maxWidth: 720 }}>
            {acts.map((a, i) => {
              const start = i / 3;
              const end = (i + 1) / 3;
              const visible = progress >= start && progress < end;
              const local = (progress - start) * 3;
              return (
                <div key={i} style={{
                  position: 'absolute',
                  opacity: visible ? Math.max(0, Math.min(1, local < 0.15 ? local / 0.15 : (local > 0.85 ? (1 - local) / 0.15 : 1))) : 0,
                  transform: `translateY(${visible ? 0 : 20}px)`,
                  transition: 'opacity 240ms, transform 240ms',
                  pointerEvents: visible ? 'auto' : 'none',
                  width: 'calc(100% - 64px)',
                  maxWidth: 720,
                }}>
                  <div className="eyebrow" style={{ marginBottom: 24, color: 'var(--accent)' }}>{a.eyebrow}</div>
                  <h2 className="display-lg" style={{ marginBottom: 24 }}>{a.title}</h2>
                  <p className="body-lg" style={{ maxWidth: 600 }}>{a.body}</p>
                </div>
              );
            })}
          </div>

          {/* progress bar */}
          <div style={{
            position: 'absolute', bottom: 60, left: 32, right: 32,
            height: 2, background: 'var(--border-1)',
          }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)' }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, font: '500 11px JetBrains Mono', color: 'var(--fg-3)', letterSpacing: '0.08em' }}>
              <span>01 PROBLEM</span>
              <span>02 SHIFT</span>
              <span>03 RESULT</span>
            </div>
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
    <section className="section" style={{ background: 'var(--ink-900)', borderTop: '1px solid var(--border-1)', borderBottom: '1px solid var(--border-1)' }} data-screen-label="04 Streamers">
      <div className="container">
        <div style={{ marginBottom: 56 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>// CREATOR DESK · WHAT THEY'RE SAYING</div>
          <h2 className="display-lg">
            From the people<br/>
            <span style={{ color: 'var(--accent)' }}>actually grinding.</span>
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {quotes.map((q, i) => (
            <div key={i} className="card" style={{ padding: 32 }}>
              {/* live indicator */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <span className="hud-pill" style={{ fontSize: 10 }}><span className="dot"/>LIVE</span>
                <Icon name="twitch" size={18}/>
              </div>
              {/* avatar placeholder */}
              <div style={{
                width: 56, height: 56,
                borderRadius: 999,
                background: `linear-gradient(135deg, ${['#CAE00F', '#FF3D5C', '#3D8BFF'][i]}, ${['#7A8A00', '#A8132B', '#0F4FB3'][i]})`,
                marginBottom: 16,
                position: 'relative',
                boxShadow: '0 0 20px rgba(0,0,0,0.4)'
              }}>
                <div style={{ position: 'absolute', inset: 4, borderRadius: 999, background: 'var(--ink-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 18px Space Grotesk', color: 'var(--fg-1)' }}>
                  {q.name.split(' ').map(s => s[0]).join('').slice(0, 2)}
                </div>
              </div>
              <div style={{ font: '600 16px Space Grotesk', marginBottom: 4 }}>{q.name}</div>
              <div className="mono-sm" style={{ color: 'var(--fg-3)', marginBottom: 24 }}>{q.handle} · {q.game}</div>
              <p className="body" style={{ fontSize: 15, color: 'var(--fg-1)' }}>"{q.quote}"</p>
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono-sm" style={{ color: 'var(--fg-4)' }}>{q.reach}</span>
                <span style={{ display: 'flex', gap: 4, color: 'var(--accent)' }}>
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
    <section className="section" style={{ position: 'relative', overflow: 'hidden' }} data-screen-label="05 Subscribe Pitch">
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'url(assets/bg-leaves.png)',
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
              font: '500 13px Inter',
              color: 'var(--fg-2)',
            }}>
              <span style={{ color: 'var(--accent)' }}><Icon name={icon} size={14}/></span>
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
      <Hero flavor={flavor} onShop={() => { document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' }); }}/>
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
