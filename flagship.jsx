/* global React */
// PDP — Product Detail Page for the flagship Lemon-Lime
const { useState: useStateP } = React;

function FlagshipPage({ flavor, onAdd }) {
  const flagship = window.FLAVORS[0]; // lemon-lime
  const [qty, setQty] = useStateP(12);
  const [tab, setTab] = useStateP('overview');

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'science', label: 'The science' },
    { id: 'nutrition', label: 'Nutrition' },
    { id: 'reviews', label: 'Reviews' },
  ];

  return (
    <>
      <section style={{ position: 'relative', paddingTop: 80, paddingBottom: 80, overflow: 'hidden', borderBottom: '1px solid var(--border-1)' }} data-screen-label="01 PDP">
        <div className="hero-bg" style={{ opacity: 0.35 }}/>
        <div className="container" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div style={{ position: 'relative', height: 640, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              position: 'absolute', width: 480, height: 480,
              background: `radial-gradient(circle, ${flagship.color}55, transparent 65%)`,
              filter: 'blur(40px)', animation: 'slime-morph 10s ease-in-out infinite',
            }}/>
            <div style={{ filter: `drop-shadow(0 30px 60px ${flagship.color}55)` }}>
              <Can flavor={flagship} height={620}/>
            </div>
            <div style={{ position: 'absolute', top: 24, left: 24 }} className="hud-pill"><span className="dot"/>FLAGSHIP · SL-LEM</div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 16 }}>// PRODUCT 01 · ORIGINAL FORMULA</div>
            <h1 className="display-lg" style={{ marginBottom: 16 }}>Lemon · Lime</h1>
            <p className="body-lg" style={{ maxWidth: 480, marginBottom: 24 }}>
              The original. Crisp lemon, real lime, six electrolytes, 75mg of clean caffeine. The flavor that started Slime Lime — and still the one we drink most.
            </p>

            <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
              {[1,2,3,4,5].map(n => <span key={n} style={{ color: 'var(--accent)' }}><Icon name="star" size={16}/></span>)}
              <span className="mono-sm" style={{ color: 'var(--fg-2)', marginLeft: 8 }}>4.8 · 8,201 reviews</span>
            </div>

            <div style={{ display: 'flex', gap: 32, padding: '20px 0', borderTop: '1px solid var(--border-1)', borderBottom: '1px solid var(--border-1)', marginBottom: 24 }}>
              {[['75mg', 'caffeine'], ['5g', 'sugar'], ['35', 'cal'], ['12oz', 'can']].map(([v, l]) => (
                <div key={l}>
                  <div style={{ font: '700 24px JetBrains Mono', color: 'var(--accent)' }}>{v}</div>
                  <div className="mono-sm" style={{ color: 'var(--fg-3)', fontSize: 10 }}>{l.toUpperCase()}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <span className="mono-sm" style={{ color: 'var(--fg-3)', minWidth: 60 }}>QTY</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--border-2)', borderRadius: 999, padding: 4 }}>
                <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ background: 'transparent', border: 0, color: 'var(--fg-2)', width: 32, height: 32, cursor: 'pointer', borderRadius: 999 }}><Icon name="minus" size={14}/></button>
                <span style={{ font: '600 14px JetBrains Mono', minWidth: 24, textAlign: 'center' }}>{qty}</span>
                <button onClick={() => setQty(q => q + 1)} style={{ background: 'transparent', border: 0, color: 'var(--accent)', width: 32, height: 32, cursor: 'pointer', borderRadius: 999 }}><Icon name="plus" size={14}/></button>
              </div>
              <div style={{ marginLeft: 'auto', font: '700 28px JetBrains Mono', color: 'var(--accent)' }}>${(flagship.price * qty).toFixed(2)}</div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => onAdd(flagship, qty)} className="btn btn-primary btn-xl" style={{ flex: 1 }}>
                <Icon name="cart" size={18}/> Add {qty} to fridge
              </button>
              <button onClick={() => window.navTo('/subscribe')} className="btn btn-secondary btn-xl">Subscribe & save 20%</button>
            </div>

            <div style={{ marginTop: 24, display: 'flex', gap: 16, color: 'var(--fg-3)' }}>
              <span className="mono-sm">SHIPS IN 24H</span>
              <span className="mono-sm">FREE OVER $40</span>
              <span className="mono-sm">30-DAY GUARANTEE</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" data-screen-label="02 PDP Tabs">
        <div className="container">
          <div style={{ display: 'flex', gap: 4, padding: 4, border: '1px solid var(--border-1)', borderRadius: 12, background: 'var(--bg-sunken)', width: 'fit-content', marginBottom: 40 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '10px 18px', borderRadius: 8,
                background: tab === t.id ? 'var(--surface-card)' : 'transparent',
                color: tab === t.id ? 'var(--fg-1)' : 'var(--fg-3)',
                border: 0, font: '600 13px Space Grotesk', cursor: 'pointer',
              }}>{t.label}</button>
            ))}
          </div>

          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
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
          )}

          {tab === 'science' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
              <div className="card">
                <div className="eyebrow">CAFFEINE × L-THEANINE</div>
                <h3 className="h3" style={{ marginTop: 12, marginBottom: 12 }}>The 1:1.3 ratio</h3>
                <p className="body" style={{ fontSize: 14 }}>The pairing smooths the caffeine curve and cuts jitter. We dose 75mg + 100mg — clinically backed, not maxed-out.</p>
                <div style={{ marginTop: 24, height: 100, position: 'relative' }}>
                  <svg viewBox="0 0 300 100" style={{ width: '100%', height: '100%' }}>
                    <path d="M 0 80 Q 50 20 80 30 T 150 50 Q 220 80 300 70" stroke="var(--accent)" strokeWidth="2" fill="none"/>
                    <path d="M 0 80 Q 30 10 50 20 Q 80 70 100 80 Q 150 90 300 90" stroke="var(--fg-4)" strokeWidth="2" fill="none" strokeDasharray="4 4"/>
                    <text x="200" y="45" fill="var(--accent)" fontSize="10" fontFamily="JetBrains Mono">SLIME LIME</text>
                    <text x="180" y="92" fill="var(--fg-4)" fontSize="10" fontFamily="JetBrains Mono">TYPICAL ENERGY</text>
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
          )}

          {tab === 'nutrition' && (
            <div className="card" style={{ maxWidth: 540 }}>
              <h3 className="h3" style={{ marginBottom: 16 }}>Nutrition Facts</h3>
              <div className="mono-sm" style={{ color: 'var(--fg-3)', paddingBottom: 12, borderBottom: '2px solid var(--fg-1)' }}>SERVING SIZE 1 CAN (12 FL OZ / 355ML)</div>
              {[['Calories', '35'], ['Total carbs', '8g'], ['Sugars', '5g'], ['Added sugar', '0g'], ['Caffeine', '75mg'], ['L-theanine', '100mg'], ['Sodium', '120mg']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-1)' }}>
                  <span className="body" style={{ fontSize: 14 }}>{k}</span>
                  <span className="mono" style={{ color: 'var(--accent)' }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'reviews' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {[
                { name: 'Kovacs', stars: 5, body: "Switched from Red Bull, never going back. No 4pm wall." },
                { name: 'Mira L.', stars: 5, body: "Real flavor, not chemical. Plays well with my pre-game routine." },
                { name: 'Jordan T.', stars: 4, body: "Wish it came in bigger cans for long sessions, but the formula is clean." },
                { name: 'Sam V.', stars: 5, body: "I'm a streamer. Six hours, no jitter. That's the whole sales pitch." },
              ].map((r, i) => (
                <div key={i} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ font: '600 14px Space Grotesk' }}>{r.name}</span>
                    <span style={{ display: 'flex', gap: 2, color: 'var(--accent)' }}>{[...Array(r.stars)].map((_, n) => <Icon key={n} name="star" size={12}/>)}</span>
                  </div>
                  <p className="body" style={{ fontSize: 14, margin: 0 }}>"{r.body}"</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

window.FlagshipPage = FlagshipPage;
