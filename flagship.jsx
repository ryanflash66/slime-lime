/* global React */
// PDP — Product Detail Page for the flagship Lemon-Lime
const { useState: useStateP, useEffect: useEffectP, useLayoutEffect: useLayoutEffectP, useRef: useRefP } = React;

const FLAGSHIP_EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const FLAGSHIP_EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
const FLAGSHIP_REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

const FLAGSHIP_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'science', label: 'The science' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'reviews', label: 'Reviews' },
];

function flagshipPrefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia(FLAGSHIP_REDUCED_QUERY).matches);
}

function flagshipUseMedia(query) {
  const [matches, setMatches] = useStateP(() => !!(window.matchMedia && window.matchMedia(query).matches));
  useEffectP(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange); // Safari < 14
    return () => mql.removeListener(onChange);
  }, [query]);
  return matches;
}

function flagshipUseViewportWidth() {
  const [w, setW] = useStateP(() => window.innerWidth);
  useEffectP(() => {
    let raf = 0;
    const onResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; setW(window.innerWidth); });
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); };
  }, []);
  return w;
}

// ≈400px at a 390px viewport → 620px from ~1200px up.
function flagshipBottleHeight(vw) {
  return Math.round(Math.min(620, Math.max(400, 400 + (vw - 390) * 220 / 810)));
}

function FlagshipPage({ flavor, onAdd }) {
  const flagship = window.FLAVORS[0]; // lemon-lime
  const [qty, setQty] = useStateP(12);
  const [tab, setTab] = useStateP('overview');
  const reducedMotion = flagshipUseMedia(FLAGSHIP_REDUCED_QUERY);
  const narrow = flagshipUseMedia('(max-width: 560px)');
  const vw = flagshipUseViewportWidth();
  const bottleH = flagshipBottleHeight(vw);
  const glowSize = Math.round(bottleH * 0.775);

  // Theme lock (Lemon-Lime on this page) lives in App: see useFlavorTheme in Slime Lime.html.

  // ── Tabs: sliding pill + panel enter + chart reveal
  const listRef = useRefP(null);
  const tabRefs = useRefP({});
  const panelRefs = useRefP({});
  const chartRefs = useRefP({});
  const activeTabRef = useRefP(tab);
  const firstTabRunRef = useRefP(true);
  const [pill, setPill] = useStateP({ x: 0, w: 0, ready: false, animate: false });

  const syncPill = (animate) => {
    const el = tabRefs.current[activeTabRef.current];
    if (!el) return;
    const x = el.offsetLeft, w = el.offsetWidth;
    setPill(p => (p.ready && p.x === x && p.w === w) ? p : { x, w, ready: true, animate: animate && p.ready });
  };

  // Re-measure (without transition) on resize / font load.
  useEffectP(() => {
    let alive = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) syncPill(false); });
    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => syncPill(false);
      window.addEventListener('resize', onResize);
      return () => { alive = false; window.removeEventListener('resize', onResize); };
    }
    const ro = new ResizeObserver(() => syncPill(false));
    if (listRef.current) ro.observe(listRef.current);
    Object.values(tabRefs.current).forEach(el => el && ro.observe(el));
    return () => { alive = false; ro.disconnect(); };
  }, []);

  useLayoutEffectP(() => {
    activeTabRef.current = tab;
    syncPill(true);
    if (firstTabRunRef.current) { firstTabRunRef.current = false; return; }

    const reduce = flagshipPrefersReducedMotion();
    const panel = panelRefs.current[tab];
    if (panel && panel.animate) {
      panel.getAnimations().forEach(a => a.cancel());
      if (reduce) {
        panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: FLAGSHIP_EASE_OUT });
      } else {
        panel.animate(
          [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 200, easing: FLAGSHIP_EASE_OUT }
        );
      }
    }

    if (tab === 'science') {
      const { typical, slime, typicalLabel, slimeLabel } = chartRefs.current;
      [typical, slime, typicalLabel, slimeLabel].forEach(el => el && el.getAnimations && el.getAnimations().forEach(a => a.cancel()));
      if (!reduce && typical && typical.animate) {
        const reveal = [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }];
        const fade = [{ opacity: 0 }, { opacity: 1 }];
        typical.animate(reveal, { duration: 900, easing: FLAGSHIP_EASE_IN_OUT, fill: 'backwards' });
        slime && slime.animate(reveal, { duration: 900, delay: 150, easing: FLAGSHIP_EASE_IN_OUT, fill: 'backwards' });
        typicalLabel && typicalLabel.animate(fade, { duration: 200, delay: 900, easing: FLAGSHIP_EASE_OUT, fill: 'backwards' });
        slimeLabel && slimeLabel.animate(fade, { duration: 200, delay: 1050, easing: FLAGSHIP_EASE_OUT, fill: 'backwards' });
      }
    }
  }, [tab]);

  const onTabKeyDown = (e) => {
    const i = FLAGSHIP_TABS.findIndex(t => t.id === tab);
    const n = FLAGSHIP_TABS.length;
    let next = null;
    if (e.key === 'ArrowRight') next = (i + 1) % n;
    else if (e.key === 'ArrowLeft') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    const id = FLAGSHIP_TABS[next].id;
    setTab(id);
    const el = tabRefs.current[id];
    if (el) el.focus();
  };

  const stepperBtn = {
    background: 'transparent', border: 0, width: 32, height: 32, cursor: 'pointer', borderRadius: 999,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  const autoGrid = (min, gap) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap });

  return (
    <>
      <section style={{ position: 'relative', paddingTop: 'clamp(40px, 8vw, 80px)', paddingBottom: 'clamp(48px, 8vw, 80px)', overflow: 'hidden', borderBottom: '1px solid var(--border-1)' }} data-screen-label="01 PDP">
        <div className="hero-bg" style={{ opacity: 0.35 }}/>
        <div className="container" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 'clamp(24px, 4vw, 48px)', alignItems: 'center' }}>
          <div style={{ position: 'relative', height: bottleH + 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              position: 'absolute', width: glowSize, height: glowSize,
              background: `radial-gradient(circle, ${flagship.color}55, transparent 65%)`,
              filter: 'blur(40px)', animation: reducedMotion ? 'none' : 'slime-morph 10s ease-in-out infinite',
            }}/>
            <div style={{ filter: `drop-shadow(0 30px 60px ${flagship.color}55)` }}>
              <Can flavor={flagship} height={bottleH}/>
            </div>
            <div style={{ position: 'absolute', top: narrow ? 8 : 24, left: narrow ? 0 : 24 }} className="hud-pill"><span className="dot"/>FLAGSHIP · SL-LEM</div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>// PRODUCT 01 · ORIGINAL FORMULA</div>
            <h1 className="display-lg" style={{ marginBottom: 16 }}>Lemon · Lime</h1>
            <p className="body-lg" style={{ maxWidth: 480, marginBottom: 24 }}>
              The original. Crisp lemon, real lime, six electrolytes, 75mg of clean caffeine. The flavor that started Slime Lime — and still the one we drink most.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 24 }}>
              <span role="img" aria-label="Rated 4.8 out of 5" style={{ display: 'inline-flex', gap: 6, color: 'var(--accent)' }}>
                {[1,2,3,4,5].map(n => <Icon key={n} name="star" size={16}/>)}
              </span>
              <span className="mono-sm" style={{ color: 'var(--fg-2)', marginLeft: 8 }}>4.8 · 8,201 reviews</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 32px', padding: '20px 0', borderTop: '1px solid var(--border-1)', borderBottom: '1px solid var(--border-1)', marginBottom: 24 }}>
              {[['75mg', 'caffeine'], ['5g', 'sugar'], ['35', 'cal'], ['12oz', 'bottle']].map(([v, l]) => (
                <div key={l}>
                  <div style={{ font: '700 24px var(--font-mono)', color: 'var(--accent)' }}>{v}</div>
                  <div className="mono-sm" style={{ color: 'var(--fg-3)', fontSize: 10 }}>{l.toUpperCase()}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <span className="mono-sm" id="flagship-qty-label" style={{ color: 'var(--fg-3)', minWidth: narrow ? 0 : 60 }}>QTY</span>
              <div role="group" aria-labelledby="flagship-qty-label" style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--border-2)', borderRadius: 999, padding: 4 }}>
                <button type="button" aria-label="Decrease quantity" onClick={() => setQty(q => Math.max(1, q - 1))} style={{ ...stepperBtn, color: 'var(--fg-2)' }}><Icon name="minus" size={14}/></button>
                <span aria-live="polite" aria-atomic="true" style={{ font: '600 14px var(--font-mono)', minWidth: 24, textAlign: 'center' }}>{qty}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => setQty(q => q + 1)} style={{ ...stepperBtn, color: 'var(--accent)' }}><Icon name="plus" size={14}/></button>
              </div>
              <div style={{ marginLeft: 'auto', font: '700 28px var(--font-mono)', color: 'var(--accent)' }}>${(flagship.price * qty).toFixed(2)}</div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <button type="button" onClick={() => onAdd(flagship, qty)} className="btn btn-primary btn-xl" style={{ flex: '1 1 200px' }}>
                <Icon name="cart" size={18}/> Add {qty} to fridge
              </button>
              <button type="button" onClick={() => window.navTo('/subscribe')} className="btn btn-secondary btn-xl" style={{ flex: '1 1 auto' }}>Subscribe & save up to 28%</button>
            </div>

            <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: '8px 16px', color: 'var(--fg-3)' }}>
              <span className="mono-sm">SHIPS IN 24H</span>
              <span className="mono-sm">FREE OVER $40</span>
              <span className="mono-sm">30-DAY GUARANTEE</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" data-screen-label="02 PDP Tabs">
        <div className="container">
          <div
            ref={listRef}
            role="tablist"
            aria-label="Lemon-Lime product details"
            onKeyDown={onTabKeyDown}
            style={{
              position: 'relative', display: 'flex', gap: 4, padding: 4,
              border: '1px solid var(--border-1)', borderRadius: 12, background: 'var(--bg-sunken)',
              width: narrow ? '100%' : 'fit-content', maxWidth: '100%', boxSizing: 'border-box',
              overflowX: narrow ? 'auto' : 'visible', scrollbarWidth: 'thin', marginBottom: 40,
            }}
          >
            <span aria-hidden="true" style={{
              position: 'absolute', top: 4, bottom: 4, left: 0,
              width: pill.w, transform: `translateX(${pill.x}px)`,
              opacity: pill.ready ? 1 : 0,
              background: 'var(--surface-card)', borderRadius: 8,
              transition: pill.animate && !reducedMotion
                ? `transform 220ms ${FLAGSHIP_EASE_OUT}, width 220ms ${FLAGSHIP_EASE_OUT}`
                : 'none',
            }}/>
            {FLAGSHIP_TABS.map(t => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  ref={el => { tabRefs.current[t.id] = el; }}
                  type="button"
                  role="tab"
                  id={`flagship-tab-${t.id}`}
                  aria-selected={active}
                  aria-controls={`flagship-panel-${t.id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  style={{
                    position: 'relative', zIndex: 1, flex: narrow ? '1 0 auto' : '0 0 auto', whiteSpace: 'nowrap',
                    padding: narrow ? '10px 10px' : '10px 18px', borderRadius: 8,
                    background: 'transparent',
                    color: active ? 'var(--fg-1)' : 'var(--fg-3)',
                    border: 0, font: '600 13px var(--font-ui)', cursor: 'pointer',
                  }}
                >{t.label}</button>
              );
            })}
          </div>

          <div
            ref={el => { panelRefs.current.overview = el; }}
            role="tabpanel" id="flagship-panel-overview" aria-labelledby="flagship-tab-overview" tabIndex={0}
            hidden={tab !== 'overview'}
          >
            <div style={autoGrid(260, 20)}>
              {[
                ['Crisp & clean', "Real lemon and lime, never extracts. Bright top-note, dry finish, no syrupy after-taste."],
                ['Slow-release', "75mg caffeine paired with 100mg L-theanine — alertness without the jitter or the cliff."],
                ['Hydration first', "Six electrolytes mean fluid actually gets absorbed. You drink it, you feel it."],
              ].map(([h, b]) => (
                <div key={h} className="card">
                  <div className="h3" style={{ fontSize: 22, marginBottom: 12 }}>{h}</div>
                  <p className="body" style={{ fontSize: 14 }}>{b}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            ref={el => { panelRefs.current.science = el; }}
            role="tabpanel" id="flagship-panel-science" aria-labelledby="flagship-tab-science" tabIndex={0}
            hidden={tab !== 'science'}
          >
            <div style={autoGrid(360, 'clamp(20px, 3vw, 32px)')}>
              <div className="card">
                <div className="eyebrow">CAFFEINE × L-THEANINE</div>
                <h3 className="h3" style={{ marginTop: 12, marginBottom: 12 }}>The 1:1.3 ratio</h3>
                <p className="body" style={{ fontSize: 14 }}>The pairing smooths the caffeine curve and cuts jitter. We dose 75mg + 100mg — clinically backed, not maxed-out.</p>
                <div style={{ marginTop: 24, height: 100, position: 'relative' }}>
                  <svg viewBox="0 0 300 100" style={{ width: '100%', height: '100%' }} role="img" aria-label="Energy curve: Slime Lime stays steady while typical energy drinks spike and crash">
                    <path ref={el => { chartRefs.current.slime = el; }} d="M 0 80 Q 50 20 80 30 T 150 50 Q 220 80 300 70" stroke="var(--accent)" strokeWidth="2" fill="none"/>
                    <path ref={el => { chartRefs.current.typical = el; }} d="M 0 80 Q 30 10 50 20 Q 80 70 100 80 Q 150 90 300 90" stroke="var(--fg-4)" strokeWidth="2" fill="none" strokeDasharray="4 4"/>
                    <text ref={el => { chartRefs.current.slimeLabel = el; }} x="200" y="45" fill="var(--accent)" fontSize="10" style={{ fontFamily: 'var(--font-mono)' }}>SLIME LIME</text>
                    <text ref={el => { chartRefs.current.typicalLabel = el; }} x="180" y="92" fill="var(--fg-4)" fontSize="10" style={{ fontFamily: 'var(--font-mono)' }}>TYPICAL ENERGY</text>
                  </svg>
                </div>
              </div>
              <div className="card">
                <div className="eyebrow">ELECTROLYTES</div>
                <h3 className="h3" style={{ marginTop: 12, marginBottom: 16 }}>Real hydration</h3>
                {[['Sodium', '120mg'], ['Potassium', '90mg'], ['Magnesium', '40mg'], ['Calcium', '20mg'], ['Chloride', '180mg'], ['Phosphate', '15mg']].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-1)' }}>
                    <span className="body" style={{ fontSize: 14, color: 'var(--fg-2)' }}>{k}</span>
                    <span className="mono" style={{ color: 'var(--accent)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            ref={el => { panelRefs.current.nutrition = el; }}
            role="tabpanel" id="flagship-panel-nutrition" aria-labelledby="flagship-tab-nutrition" tabIndex={0}
            hidden={tab !== 'nutrition'}
          >
            <div className="card" style={{ maxWidth: 540 }}>
              <h3 className="h3" style={{ marginBottom: 16 }}>Nutrition Facts</h3>
              <div className="mono-sm" style={{ color: 'var(--fg-3)', paddingBottom: 12, borderBottom: '2px solid var(--fg-1)' }}>SERVING SIZE 1 BOTTLE (12 FL OZ / 355ML)</div>
              {[['Calories', '35'], ['Total carbs', '8g'], ['Sugars', '5g'], ['Added sugar', '0g'], ['Caffeine', '75mg'], ['L-theanine', '100mg'], ['Sodium', '120mg']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-1)' }}>
                  <span className="body" style={{ fontSize: 14 }}>{k}</span>
                  <span className="mono" style={{ color: 'var(--accent)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            ref={el => { panelRefs.current.reviews = el; }}
            role="tabpanel" id="flagship-panel-reviews" aria-labelledby="flagship-tab-reviews" tabIndex={0}
            hidden={tab !== 'reviews'}
          >
            <div style={autoGrid(320, 16)}>
              {[
                { name: 'Kovacs', stars: 5, body: "Switched from Red Bull, never going back. No 4pm wall." },
                { name: 'Mira L.', stars: 5, body: "Real flavor, not chemical. Plays well with my pre-game routine." },
                { name: 'Jordan T.', stars: 4, body: "Wish it came in bigger bottles for long sessions, but the formula is clean." },
                { name: 'Sam V.', stars: 5, body: "I'm a streamer. Six hours, no jitter. That's the whole sales pitch." },
              ].map((r, i) => (
                <div key={i} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ font: '600 14px var(--font-ui)' }}>{r.name}</span>
                    <span role="img" aria-label={`${r.stars} out of 5 stars`} style={{ display: 'flex', gap: 2, color: 'var(--accent)' }}>{[...Array(r.stars)].map((_, n) => <Icon key={n} name="star" size={12}/>)}</span>
                  </div>
                  <p className="body" style={{ fontSize: 14, margin: 0 }}>"{r.body}"</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

window.FlagshipPage = FlagshipPage;
