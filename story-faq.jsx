/* global React */
// STORY + FAQ pages
const { useState: useStateO } = React;

function StoryPage() {
  return (
    <>
      <section style={{ position: 'relative', paddingTop: 120, paddingBottom: 80, overflow: 'hidden' }} data-screen-label="01 Story Hero">
        <div className="hero-bg" style={{ opacity: 0.4 }}/>
        <div className="container" style={{ position: 'relative' }}>
          <div className="eyebrow" style={{ marginBottom: 24 }}>// OUR STORY · FOUNDED 2024</div>
          <h1 className="display-xl" style={{ maxWidth: 1000, marginBottom: 32 }}>
            We were tired<br/>of crashing<br/><span style={{ color: 'var(--accent)' }}>at hour four.</span>
          </h1>
          <p className="body-lg" style={{ maxWidth: 640 }}>
            Slime Lime started as a Discord server full of mid-tournament rants about energy drinks. Two years later it's a clean-formula soda built specifically for the long session — and the brand we wish had existed when we were pulling all-nighters in college.
          </p>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--ink-900)', borderTop: '1px solid var(--border-1)' }}>
        <div className="container">
          <div className="eyebrow" style={{ marginBottom: 16 }}>// THE TIMELINE</div>
          <h2 className="display-lg" style={{ marginBottom: 56 }}>How we got here.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
            {[
              { y: '2023', t: 'The rant', b: 'A Discord thread about why every energy drink crashes you at hour four turns into a 200-message manifesto.' },
              { y: '2024', t: 'Formula 01', b: 'Six months in a food-science lab. We test 31 caffeine/L-theanine combos. We pick the smoothest one.' },
              { y: '2025', t: 'First batch', b: 'Lemon-Lime ships to 4,200 backers. Sells through in 11 days. We restock and add Cherry, Blue Rasp.' },
              { y: '2026', t: 'You', b: 'Mango and Grape drop. The lineup is six. We ship to 41 countries. The fridge keeps growing.' },
            ].map((s, i) => (
              <div key={s.y} className="card" style={{ position: 'relative' }}>
                <div className="mono-sm" style={{ color: 'var(--accent)', marginBottom: 12 }}>{s.y}</div>
                <div className="h3" style={{ fontSize: 22, marginBottom: 12 }}>{s.t}</div>
                <p className="body" style={{ fontSize: 14 }}>{s.b}</p>
                <div style={{ position: 'absolute', top: 12, right: 12, font: '700 32px JetBrains Mono', color: 'var(--border-2)' }}>0{i+1}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="science">
        <div className="container">
          <div className="eyebrow" style={{ marginBottom: 16 }}>// THE SCIENCE</div>
          <h2 className="display-lg" style={{ marginBottom: 40, maxWidth: 800 }}>What's actually in the can.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { h: 'Clean caffeine', n: '75mg', b: 'Sourced from green coffee. Slow-release. No taurine, no guarana, no synthetic stim stack.' },
              { h: 'L-theanine', n: '100mg', b: 'Pairs with caffeine to flatten the curve. Calm focus, no jitter, no cliff.' },
              { h: 'Six electrolytes', n: '480mg', b: 'Sodium, potassium, magnesium, calcium, chloride, phosphate. Real hydration, not just flavor.' },
              { h: 'Real fruit', n: '5g sugar', b: 'Lemon and lime juice. Cane sugar, low dose. No HFCS, no aspartame, no sucralose.' },
              { h: 'Vitamin stack', n: 'B6 · B12 · D', b: 'Targeted micronutrients for cognitive performance. Not a multivitamin — a focus stack.' },
              { h: 'Zero BS', n: '0', b: 'No fake colors, no artificial flavors, no preservatives we can\'t pronounce. If it\'s in there, it\'s working.' },
            ].map(s => (
              <div key={s.h} className="card">
                <div className="h3" style={{ fontSize: 22, marginBottom: 8 }}>{s.h}</div>
                <div style={{ font: '700 32px JetBrains Mono', color: 'var(--accent)', marginBottom: 12 }}>{s.n}</div>
                <p className="body" style={{ fontSize: 14 }}>{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--ink-900)', borderTop: '1px solid var(--border-1)', textAlign: 'center' }}>
        <div className="container-narrow">
          <div className="eyebrow" style={{ marginBottom: 16, display: 'inline-flex' }}>// THE PEOPLE</div>
          <h2 className="display-lg" style={{ marginBottom: 24 }}>Built by gamers.<br/><span style={{ color: 'var(--accent)' }}>Backed by chemists.</span></h2>
          <p className="body-lg" style={{ maxWidth: 600, margin: '0 auto 48px' }}>
            Six full-time, scattered across Berlin, Austin, and Toronto. One food scientist on retainer. A long list of late-night testers in Discord.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            {['Late-night ops', 'Clean formulation', 'No VC strings', 'Carbon-neutral cans', 'Recyclable everything'].map(v => (
              <span key={v} className="hud-pill" style={{ fontSize: 11 }}>{v}</span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function FAQPage() {
  const [open, setOpen] = useStateO(0);
  const groups = [
    { name: 'Product', qs: [
      ['How is Slime Lime different from a regular energy drink?', "Most energy drinks are tuned for shift workers — high sugar, max stim, fast crash. We're tuned for 6-hour focus sessions. 75mg of clean caffeine, 100mg L-theanine, real fruit, six electrolytes."],
      ['Is there caffeine in every flavor?', "Yes. Every can has the same 75mg dose. We don't make decaf — yet."],
      ['Where are the cans made?', "Co-packed in Wisconsin and the Netherlands. Aluminum cans (recyclable). Carbon-neutral shipping in the US and EU."],
      ['Is it vegan / gluten-free?', "Yes to both. No animal products, no gluten, no GMOs. Kosher certified."],
    ]},
    { name: 'Subscription', qs: [
      ['Can I pause my subscription?', "Anytime. From your dashboard, hit pause. We'll skip the next ship cycle and pick back up when you're ready."],
      ['Can I swap flavors between orders?', "Yes — up to 24 hours before each ship date. No fees, no penalties."],
      ['Is there a minimum commitment?', "No. Cancel after one order if it's not for you. We'd rather you actually like it."],
      ['How much do subscribers save?', "Up to 28% on monthly. Every order ships free."],
    ]},
    { name: 'Shipping', qs: [
      ['How fast does it ship?', "Orders placed before 2pm ET ship same-day. Standard delivery is 3–5 business days in the US."],
      ['Where do you ship?', "All 50 US states, Canada, and 41 EU countries. Asia coming Q3 2026."],
      ['Is shipping free?', "Free on orders $40+. Free on every subscription order, no minimum."],
    ]},
  ];

  let idx = 0;
  return (
    <>
      <section style={{ paddingTop: 100, paddingBottom: 40 }} data-screen-label="01 FAQ">
        <div className="container-narrow">
          <div className="eyebrow" style={{ marginBottom: 16 }}>// SUPPORT · FAQ</div>
          <h1 className="display-lg" style={{ marginBottom: 16 }}>Questions, <span style={{ color: 'var(--accent)' }}>answered.</span></h1>
          <p className="body-lg">If we missed something, ping us in Discord — we read every message.</p>
        </div>
      </section>
      <section style={{ paddingBottom: 120 }}>
        <div className="container-narrow">
          {groups.map(g => (
            <div key={g.name} style={{ marginBottom: 32 }}>
              <div className="mono-sm" style={{ color: 'var(--accent)', marginBottom: 12 }}>// {g.name.toUpperCase()}</div>
              {g.qs.map(([q, a]) => {
                const myIdx = idx++;
                const isOpen = open === myIdx;
                return (
                  <div key={q} style={{ borderBottom: '1px solid var(--border-1)' }}>
                    <button onClick={() => setOpen(isOpen ? -1 : myIdx)} style={{
                      width: '100%', padding: '20px 0',
                      background: 'transparent', border: 0, cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      color: 'var(--fg-1)', textAlign: 'left',
                      font: '600 17px Space Grotesk',
                    }}>
                      <span>{q}</span>
                      <span style={{ color: 'var(--accent)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 220ms' }}>
                        <Icon name="chevD" size={20}/>
                      </span>
                    </button>
                    <div style={{
                      maxHeight: isOpen ? 200 : 0,
                      overflow: 'hidden',
                      transition: 'max-height 320ms var(--ease-slime)',
                    }}>
                      <p className="body" style={{ paddingBottom: 20, color: 'var(--fg-2)' }}>{a}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="card" style={{ marginTop: 56, textAlign: 'center', padding: 40 }}>
            <div className="h3" style={{ marginBottom: 12 }}>Still got questions?</div>
            <p className="body" style={{ marginBottom: 24 }}>Drop into Discord or email us. We're online late.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn-primary"><Icon name="discord" size={16}/> Join Discord</button>
              <button className="btn btn-secondary">support@slimelime.gg</button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

window.StoryPage = StoryPage;
window.FAQPage = FAQPage;
