/* global React */
// SUBSCRIBE BUILDER PAGE
const { useState: useStateS, useMemo: useMemoS, useEffect: useEffectS, useRef: useRefS, useLayoutEffect: useLayoutEffectS } = React;

const SUBSCRIBE_EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const SUBSCRIBE_EASE_POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const subscribeTransition = (...props) => props.map(p => `${p} 160ms ${SUBSCRIBE_EASE_OUT}`).join(', ');
const SUBSCRIBE_SELECT_TRANSITION = subscribeTransition('border-color', 'background-color', 'box-shadow');
const SUBSCRIBE_INITIAL_PICKS = [
  ...Array(6).fill('lemon-lime'),
  ...Array(3).fill('cherry'),
  ...Array(3).fill('blue-rasp'),
];

function subscribeUseMedia(query) {
  const [matches, setMatches] = useStateS(() => window.matchMedia(query).matches);
  useEffectS(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

// Accessible single-select group: role=radiogroup, roving tabIndex, arrows move selection.
function SubscribeRadioGroup({ label, options, value, onChange, style, optionStyle, renderOption }) {
  const refs = useRefS([]);
  const selectedIndex = options.findIndex(o => o.value === value);
  const onKeyDown = (e, i) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const last = options.length - 1;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = i === last ? 0 : i + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = i === 0 ? last : i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} style={style}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={el => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (selectedIndex === -1 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={e => onKeyDown(e, i)}
            style={{
              borderRadius: 12,
              background: checked ? 'var(--accent-soft)' : 'var(--bg-sunken)',
              border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-1)'}`,
              color: 'var(--fg-1)', cursor: 'pointer',
              transition: SUBSCRIBE_SELECT_TRANSITION,
              ...optionStyle(checked),
            }}
          >
            {renderOption(o, checked)}
          </button>
        );
      })}
    </div>
  );
}

// Summary line item; fades/slides in when added after the first render.
function SubscribeSummaryRow({ flavor, qty, animateIn, reduceMotion }) {
  const ref = useRefS(null);
  useLayoutEffectS(() => {
    const el = ref.current;
    if (!animateIn || !el || !el.animate) return;
    const keyframes = reduceMotion
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }];
    el.animate(keyframes, { duration: 200, easing: SUBSCRIBE_EASE_OUT });
  }, []);
  return (
    <div ref={ref} data-summary-row style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-1)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: flavor.color, flexShrink: 0 }}/>
        <span style={{ font: '500 13px var(--font-body)' }}>{flavor.short} × {qty}</span>
      </div>
      <span className="mono" style={{ color: 'var(--fg-2)', fontSize: 12 }}>${(flavor.price * qty).toFixed(2)}</span>
    </div>
  );
}

function SubscribePage({ onAdd, onSubscribe }) {
  const flavors = window.FLAVORS;
  // One entry per picked can, in the order they were added (newest last).
  // May hold more cans than the pack after a size change; see activeOrder.
  const [order, setOrder] = useStateS(SUBSCRIBE_INITIAL_PICKS);
  const [packSize, setPackSize] = useStateS(12);
  const [cadence, setCadence] = useStateS('monthly');

  const isWide = subscribeUseMedia('(min-width: 900px)');
  const isNarrow = subscribeUseMedia('(max-width: 600px)');
  const reduceMotion = subscribeUseMedia('(prefers-reduced-motion: reduce)');

  const cadences = [
    { id: 'biweekly', label: 'Every 2 weeks', mult: 1, save: 22 },
    { id: 'monthly',  label: 'Every month',   mult: 1, save: 28, recommended: true },
    { id: 'quarterly',label: 'Every 3 months', mult: 1, save: 18 },
  ];
  const sizes = [6, 12, 24, 48];

  // Shrinking the pack drops the most recently added cans. The trim is applied
  // lazily, so browsing sizes (e.g. arrowing 12 -> 6 -> 12) restores the picks;
  // the overflow is discarded for good once the picks are edited.
  const activeOrder = useMemoS(() => order.slice(0, packSize), [order, packSize]);
  const picks = useMemoS(() => activeOrder.reduce((m, id) => { m[id] = (m[id] || 0) + 1; return m; }, {}), [activeOrder]);
  const totalPicked = activeOrder.length;
  const remaining = packSize - totalPicked;
  const isFull = remaining === 0;

  const update = (id, delta) => {
    setOrder(prev => {
      const o = prev.slice(0, packSize);
      if (delta > 0) return o.length >= packSize ? prev : [...o, id];
      const i = o.lastIndexOf(id);
      return i === -1 ? prev : [...o.slice(0, i), ...o.slice(i + 1)];
    });
  };

  const basePrice = useMemoS(() => Object.entries(picks).reduce((s, [id, qty]) => {
    const f = flavors.find(x => x.id === id);
    return s + (f?.price || 2.5) * qty;
  }, 0), [picks]);
  const cad = cadences.find(c => c.id === cadence);
  const discounted = basePrice * (1 - cad.save / 100);
  const savings = basePrice - discounted;

  // Cart lines carry the subscriber price and cadence; a repeat checkout replaces the pack.
  const checkout = () => {
    const lines = Object.entries(picks).map(([id, qty]) => {
      const f = flavors.find(x => x.id === id);
      if (!f || qty <= 0) return null;
      return {
        ...f, qty,
        id: `${f.id}--sub`,
        price: f.price * (1 - cad.save / 100),
        sub: `SUB · ${cad.label.toUpperCase()} · −${cad.save}%`,
        subscription: cad.id,
      };
    }).filter(Boolean);
    if (onSubscribe) onSubscribe(lines);
    else lines.forEach(l => onAdd(l, l.qty));
  };

  // Rows that mount after the first render animate in.
  const hasMountedRef = useRefS(false);
  useEffectS(() => { hasMountedRef.current = true; }, []);

  // One-shot "pack full" moment when picking the last can (remaining > 0 -> 0
  // at the same pack size; resizing the pack to fit doesn't celebrate).
  const pillRef = useRefS(null);
  const glowRef = useRefS(null);
  const prevRef = useRefS({ remaining, packSize });
  useEffectS(() => {
    const prev = prevRef.current;
    prevRef.current = { remaining, packSize };
    if (!(prev.remaining > 0 && remaining === 0 && prev.packSize === packSize) || reduceMotion) return;
    pillRef.current?.animate?.(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
      { duration: 320, easing: SUBSCRIBE_EASE_POP }
    );
    glowRef.current?.animate?.(
      [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }],
      { duration: 600, easing: SUBSCRIBE_EASE_OUT }
    );
  }, [remaining, packSize, reduceMotion]);

  return (
    <>
      <section style={{ position: 'relative', paddingTop: 80, paddingBottom: 40, overflow: 'hidden' }} data-screen-label="01 Subscribe Builder">
        <div className="hero-bg" style={{ opacity: 0.3 }}/>
        <div className="container-narrow" style={{ position: 'relative', textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 20, display: 'inline-flex' }}>// SUBSCRIBE · BUILD YOUR PACK</div>
          <h1 className="display-lg" style={{ marginBottom: 20 }}>
            Build the<br/>
            <span style={{ color: 'var(--accent)' }}>perfect fridge.</span>
          </h1>
          <p className="body-lg" style={{ maxWidth: 600, margin: '0 auto' }}>
            Pick your flavors. Set your cadence. Pause, swap, or skip from your dashboard. No commitment.
          </p>
        </div>
      </section>

      <section style={{ paddingBottom: 80 }}>
        <div className="container" style={{
          display: 'grid',
          gridTemplateColumns: isWide ? 'minmax(0, 1.6fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
          gap: isWide ? 32 : 20, alignItems: 'start',
        }}>
          {/* Builder */}
          <div className="card" style={{ padding: isNarrow ? 20 : 32, minWidth: 0 }}>
            {/* Step 1: Pack size */}
            <div style={{ marginBottom: 32 }}>
              <div className="mono-sm" style={{ color: 'var(--accent)', marginBottom: 8 }}>STEP 01 · PACK SIZE</div>
              <div className="h3" style={{ marginBottom: 16 }}>How many cans?</div>
              <SubscribeRadioGroup
                label="Pack size"
                options={sizes.map(s => ({ value: s }))}
                value={packSize}
                onChange={setPackSize}
                style={{ display: 'grid', gridTemplateColumns: isNarrow ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}
                optionStyle={checked => ({
                  padding: '16px 12px',
                  boxShadow: checked ? '0 0 16px var(--accent-soft)' : 'none',
                })}
                renderOption={(o, checked) => (
                  <>
                    <div style={{ font: '700 26px var(--font-mono)', color: checked ? 'var(--accent)' : 'var(--fg-1)' }}>{o.value}</div>
                    <div className="mono-sm" style={{ color: 'var(--fg-3)', fontSize: 10 }}>CANS</div>
                  </>
                )}
              />
            </div>

            {/* Step 2: Flavors */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                  <div className="mono-sm" style={{ color: 'var(--accent)', marginBottom: 4 }}>STEP 02 · FLAVORS</div>
                  <div className="h3">Pick {packSize} cans</div>
                </div>
                <div ref={pillRef} className="hud-pill" aria-live="polite" style={{
                  background: isFull ? 'var(--accent-soft)' : 'var(--ink-900)',
                  borderColor: isFull ? 'var(--accent)' : 'var(--border-2)',
                  color: isFull ? 'var(--accent)' : 'var(--fg-2)',
                  transition: subscribeTransition('background-color', 'border-color', 'color'),
                }}>
                  {isFull ? 'FULL' : `${remaining} TO PICK`} · {totalPicked}/{packSize}
                </div>
              </div>

              {/* Progress */}
              <div aria-hidden="true" style={{ position: 'relative', marginBottom: 24 }}>
                <div style={{ background: 'var(--ink-900)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                  <div style={{
                    width: '100%', height: '100%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)',
                    transform: `scaleX(${Math.min(1, totalPicked / packSize)})`, transformOrigin: 'left',
                    transition: reduceMotion ? 'none' : `transform 220ms ${SUBSCRIBE_EASE_OUT}`,
                  }}/>
                </div>
                <div ref={glowRef} style={{
                  position: 'absolute', inset: 0, borderRadius: 999, pointerEvents: 'none', opacity: 0,
                  boxShadow: '0 0 0 1px var(--accent), 0 0 18px 2px var(--accent-glow)',
                }}/>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 10 }}>
                {flavors.map(f => {
                  const qty = picks[f.id] || 0;
                  return (
                    <div key={f.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: 12,
                      background: qty > 0 ? `${f.color}10` : 'var(--bg-sunken)',
                      border: `1px solid ${qty > 0 ? f.color : 'var(--border-1)'}`,
                      borderRadius: 12,
                      transition: SUBSCRIBE_SELECT_TRANSITION,
                    }}>
                      <div aria-hidden="true" style={{
                        width: 36, height: 48,
                        borderRadius: 4,
                        background: `linear-gradient(180deg, ${f.color}, ${f.accent})`,
                        boxShadow: `0 0 12px ${f.color}55, inset 0 1px 0 rgba(255,255,255,0.4)`,
                        flexShrink: 0,
                      }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: '600 13px var(--font-ui)' }}>{f.short}</div>
                        <div className="mono-sm" style={{ color: 'var(--fg-3)', fontSize: 10 }}>${f.price.toFixed(2)}/CAN</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--border-2)', borderRadius: 999, padding: 3, flexShrink: 0 }}>
                        <button type="button" aria-label={`Remove one ${f.short}`} onClick={() => update(f.id, -1)} aria-disabled={qty === 0} style={{ background: 'transparent', border: 0, color: qty > 0 ? 'var(--fg-2)' : 'var(--fg-4)', width: 24, height: 24, cursor: qty > 0 ? 'pointer' : 'default', borderRadius: 999 }}><Icon name="minus" size={12}/></button>
                        <span style={{ font: '600 12px var(--font-mono)', minWidth: 18, textAlign: 'center' }}>{qty}</span>
                        <button type="button" aria-label={`Add one ${f.short}`} onClick={() => update(f.id, +1)} aria-disabled={isFull} style={{ background: 'transparent', border: 0, color: remaining > 0 ? f.color : 'var(--fg-4)', width: 24, height: 24, cursor: remaining > 0 ? 'pointer' : 'default', borderRadius: 999 }}><Icon name="plus" size={12}/></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Cadence */}
            <div>
              <div className="mono-sm" style={{ color: 'var(--accent)', marginBottom: 8 }}>STEP 03 · CADENCE</div>
              <div className="h3" style={{ marginBottom: 16 }}>How often?</div>
              <SubscribeRadioGroup
                label="Delivery cadence"
                options={cadences.map(c => ({ ...c, value: c.id }))}
                value={cadence}
                onChange={setCadence}
                style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(3, 1fr)', gap: isNarrow ? 14 : 10 }}
                optionStyle={() => ({ position: 'relative', padding: '20px 14px', textAlign: 'left' })}
                renderOption={(c, checked) => (
                  <>
                    {c.recommended && <span style={{ position: 'absolute', top: -8, right: 12, background: 'var(--accent)', color: 'var(--ink-900)', font: '700 9px var(--font-ui)', padding: '3px 8px', borderRadius: 999, letterSpacing: '0.12em' }}>BEST</span>}
                    <div style={{ font: '600 14px var(--font-ui)' }}>{c.label}</div>
                    <div className="mono-sm" style={{ color: checked ? 'var(--accent)' : 'var(--fg-3)', marginTop: 6 }}>SAVE {c.save}%</div>
                  </>
                )}
              />
            </div>
          </div>

          {/* Summary */}
          <div style={isWide ? { position: 'sticky', top: 100, minWidth: 0 } : { minWidth: 0 }}>
            <div className="card" style={{ padding: isNarrow ? 20 : 28 }}>
              <div className="mono-sm" style={{ color: 'var(--accent)', marginBottom: 8 }}>// ORDER SUMMARY</div>
              <div className="h3" style={{ marginBottom: 24 }}>Your subscription</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {Object.entries(picks).map(([id, qty]) => {
                  const f = flavors.find(x => x.id === id);
                  return <SubscribeSummaryRow key={id} flavor={f} qty={qty} animateIn={hasMountedRef.current} reduceMotion={reduceMotion}/>;
                })}
                {totalPicked === 0 && (
                  <div className="body" style={{ fontSize: 13, color: 'var(--fg-3)', textAlign: 'center', padding: 24, border: '1px dashed var(--border-1)', borderRadius: 12 }}>Pick some flavors →</div>
                )}
              </div>

              <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="body" style={{ fontSize: 13, color: 'var(--fg-3)' }}>Subtotal</span>
                  <span className="mono" style={{ color: 'var(--fg-2)' }}>${basePrice.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="body" style={{ fontSize: 13, color: 'var(--accent)' }}>Subscriber savings</span>
                  <span className="mono" style={{ color: 'var(--accent)' }}>−${savings.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-1)' }}>
                  <span className="body-lg">Total / order</span>
                  <span style={{ font: '700 28px var(--font-mono)', color: 'var(--accent)' }}>${discounted.toFixed(2)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={checkout}
                disabled={!isFull}
                className={isFull ? 'btn btn-primary btn-xl' : 'btn btn-xl'}
                style={{
                  width: '100%', marginTop: 20, borderRadius: 12,
                  transition: subscribeTransition('background-color', 'color', 'border-color', 'box-shadow', 'transform'),
                  ...(isFull ? null : {
                    background: 'var(--bg-sunken)', color: 'var(--fg-3)',
                    border: '1px dashed var(--border-2)', boxShadow: 'none', cursor: 'not-allowed',
                  }),
                }}
              >
                {isFull ? 'Start subscription' : `Pick ${remaining} more`}
              </button>
              <div className="mono-sm" style={{ color: 'var(--fg-4)', textAlign: 'center', marginTop: 12, fontSize: 10 }}>
                CANCEL · PAUSE · SWAP ANYTIME · NO LOCK-IN
              </div>
            </div>

            {/* perks */}
            <div className="card" style={{ marginTop: 16, padding: 20 }}>
              <div className="mono-sm" style={{ color: 'var(--accent)', marginBottom: 12 }}>// SUBSCRIBER PERKS</div>
              {[['flame', 'Streak rewards every 30 days'], ['star', 'Early access to new flavors'], ['shield', 'Free shipping on every order'], ['swap', 'Swap any flavor before each ship date']].map(([icon, label]) => (
                <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0' }}>
                  <span aria-hidden="true" style={{ color: 'var(--accent)' }}><Icon name={icon} size={14}/></span>
                  <span className="body" style={{ fontSize: 13 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

window.SubscribePage = SubscribePage;
