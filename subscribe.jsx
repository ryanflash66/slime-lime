/* global React */
// SUBSCRIBE BUILDER PAGE
const { useState: useStateS, useMemo: useMemoS } = React;

function SubscribePage({ onAdd }) {
  const flavors = window.FLAVORS;
  const [picks, setPicks] = useStateS({ 'lemon-lime': 6, 'cherry': 3, 'blue-rasp': 3 });
  const [packSize, setPackSize] = useStateS(12);
  const [cadence, setCadence] = useStateS('monthly');

  const cadences = [
    { id: 'biweekly', label: 'Every 2 weeks', mult: 1, save: 22 },
    { id: 'monthly',  label: 'Every month',   mult: 1, save: 28, recommended: true },
    { id: 'quarterly',label: 'Every 3 months', mult: 1, save: 18 },
  ];
  const sizes = [6, 12, 24, 48];

  const totalPicked = useMemoS(() => Object.values(picks).reduce((s, n) => s + n, 0), [picks]);
  const remaining = packSize - totalPicked;

  const update = (id, delta) => {
    setPicks(p => {
      const next = { ...p };
      const cur = next[id] || 0;
      const wanted = cur + delta;
      if (wanted < 0) return p;
      if (delta > 0 && remaining <= 0) return p;
      next[id] = wanted;
      if (next[id] === 0) delete next[id];
      return next;
    });
  };

  const basePrice = useMemoS(() => Object.entries(picks).reduce((s, [id, qty]) => {
    const f = flavors.find(x => x.id === id);
    return s + (f?.price || 2.5) * qty;
  }, 0), [picks]);
  const cad = cadences.find(c => c.id === cadence);
  const discounted = basePrice * (1 - cad.save / 100);
  const savings = basePrice - discounted;

  const checkout = () => {
    Object.entries(picks).forEach(([id, qty]) => {
      const f = flavors.find(x => x.id === id);
      if (f && qty > 0) onAdd(f, qty);
    });
  };

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
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 32, alignItems: 'flex-start' }}>
          {/* Builder */}
          <div className="card" style={{ padding: 32 }}>
            {/* Step 1: Pack size */}
            <div style={{ marginBottom: 32 }}>
              <div className="mono-sm" style={{ color: 'var(--accent)', marginBottom: 8 }}>STEP 01 · PACK SIZE</div>
              <div className="h3" style={{ marginBottom: 16 }}>How many cans?</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {sizes.map(s => (
                  <button key={s} onClick={() => { setPackSize(s); setPicks({}); }} style={{
                    padding: '16px 12px', borderRadius: 12,
                    background: packSize === s ? 'var(--accent-soft)' : 'var(--bg-sunken)',
                    border: `1px solid ${packSize === s ? 'var(--accent)' : 'var(--border-1)'}`,
                    color: 'var(--fg-1)', cursor: 'pointer',
                    boxShadow: packSize === s ? '0 0 16px var(--accent-soft)' : 'none',
                  }}>
                    <div style={{ font: '700 26px JetBrains Mono', color: packSize === s ? 'var(--accent)' : 'var(--fg-1)' }}>{s}</div>
                    <div className="mono-sm" style={{ color: 'var(--fg-3)', fontSize: 10 }}>CANS</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Flavors */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <div>
                  <div className="mono-sm" style={{ color: 'var(--accent)', marginBottom: 4 }}>STEP 02 · FLAVORS</div>
                  <div className="h3">Pick {packSize} cans</div>
                </div>
                <div className="hud-pill" style={{ background: remaining > 0 ? 'var(--ink-900)' : 'var(--accent-soft)', borderColor: remaining > 0 ? 'var(--border-2)' : 'var(--accent)' }}>
                  {remaining > 0 ? `${remaining} TO PICK` : 'FULL'} · {totalPicked}/{packSize}
                </div>
              </div>

              {/* Progress */}
              <div style={{ background: 'var(--ink-900)', borderRadius: 999, height: 6, overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ width: `${(totalPicked / packSize) * 100}%`, height: '100%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)', transition: 'width 220ms' }}/>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {flavors.map(f => {
                  const qty = picks[f.id] || 0;
                  return (
                    <div key={f.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: 12,
                      background: qty > 0 ? `${f.color}10` : 'var(--bg-sunken)',
                      border: `1px solid ${qty > 0 ? f.color : 'var(--border-1)'}`,
                      borderRadius: 12,
                    }}>
                      <div style={{
                        width: 36, height: 48,
                        borderRadius: 4,
                        background: `linear-gradient(180deg, ${f.color}, ${f.accent})`,
                        boxShadow: `0 0 12px ${f.color}55, inset 0 1px 0 rgba(255,255,255,0.4)`,
                        flexShrink: 0,
                      }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: '600 13px Space Grotesk' }}>{f.short}</div>
                        <div className="mono-sm" style={{ color: 'var(--fg-3)', fontSize: 10 }}>${f.price.toFixed(2)}/CAN</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--border-2)', borderRadius: 999, padding: 3 }}>
                        <button onClick={() => update(f.id, -1)} disabled={qty === 0} style={{ background: 'transparent', border: 0, color: qty > 0 ? 'var(--fg-2)' : 'var(--fg-4)', width: 24, height: 24, cursor: qty > 0 ? 'pointer' : 'default', borderRadius: 999 }}><Icon name="minus" size={12}/></button>
                        <span style={{ font: '600 12px JetBrains Mono', minWidth: 18, textAlign: 'center' }}>{qty}</span>
                        <button onClick={() => update(f.id, +1)} disabled={remaining <= 0} style={{ background: 'transparent', border: 0, color: remaining > 0 ? f.color : 'var(--fg-4)', width: 24, height: 24, cursor: remaining > 0 ? 'pointer' : 'default', borderRadius: 999 }}><Icon name="plus" size={12}/></button>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {cadences.map(c => (
                  <button key={c.id} onClick={() => setCadence(c.id)} style={{
                    position: 'relative',
                    padding: '20px 14px', borderRadius: 12,
                    background: cadence === c.id ? 'var(--accent-soft)' : 'var(--bg-sunken)',
                    border: `1px solid ${cadence === c.id ? 'var(--accent)' : 'var(--border-1)'}`,
                    color: 'var(--fg-1)', cursor: 'pointer', textAlign: 'left',
                  }}>
                    {c.recommended && <span style={{ position: 'absolute', top: -8, right: 12, background: 'var(--accent)', color: 'var(--ink-900)', font: '700 9px Space Grotesk', padding: '3px 8px', borderRadius: 999, letterSpacing: '0.12em' }}>BEST</span>}
                    <div style={{ font: '600 14px Space Grotesk' }}>{c.label}</div>
                    <div className="mono-sm" style={{ color: cadence === c.id ? 'var(--accent)' : 'var(--fg-3)', marginTop: 6 }}>SAVE {c.save}%</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div style={{ position: 'sticky', top: 100 }}>
            <div className="card" style={{ padding: 28 }}>
              <div className="mono-sm" style={{ color: 'var(--accent)', marginBottom: 8 }}>// ORDER SUMMARY</div>
              <div className="h3" style={{ marginBottom: 24 }}>Your subscription</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {Object.entries(picks).filter(([, q]) => q > 0).map(([id, qty]) => {
                  const f = flavors.find(x => x.id === id);
                  return (
                    <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-1)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 999, background: f.color }}/>
                        <span style={{ font: '500 13px Inter' }}>{f.short} × {qty}</span>
                      </div>
                      <span className="mono" style={{ color: 'var(--fg-2)', fontSize: 12 }}>${(f.price * qty).toFixed(2)}</span>
                    </div>
                  );
                })}
                {totalPicked === 0 && (
                  <div className="body" style={{ fontSize: 13, color: 'var(--fg-3)', textAlign: 'center', padding: 24, border: '1px dashed var(--border-1)', borderRadius: 8 }}>Pick some flavors →</div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-1)' }}>
                  <span className="body-lg">Total / order</span>
                  <span style={{ font: '700 28px JetBrains Mono', color: 'var(--accent)' }}>${discounted.toFixed(2)}</span>
                </div>
              </div>

              <button onClick={checkout} disabled={totalPicked < packSize} className="btn btn-primary btn-xl" style={{ width: '100%', marginTop: 20, opacity: totalPicked < packSize ? 0.5 : 1 }}>
                {totalPicked < packSize ? `Pick ${packSize - totalPicked} more` : 'Start subscription'}
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
                  <span style={{ color: 'var(--accent)' }}><Icon name={icon} size={14}/></span>
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
