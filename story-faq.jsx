/* global React */
// STORY + FAQ pages
const { useState: useStateO, useEffect: useEffectO, useLayoutEffect: useLayoutEffectO, useRef: useRefO } = React;

const storyFaqEaseOut = 'cubic-bezier(0.23,1,0.32,1)';
const storyFaqAutoGrid = (gap, min = 240) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap });

const storyFaqTimeline = [
  { y: '2023', t: 'The rant', b: 'A Discord thread about why every energy drink crashes you at hour four turns into a 200-message manifesto.' },
  { y: '2024', t: 'Formula 01', b: 'Six months in a food-science lab. We test 31 caffeine/L-theanine combos. We pick the smoothest one.' },
  { y: '2025', t: 'First batch', b: 'Lemon-Lime ships to 4,200 backers. Sells through in 11 days. We restock and add Cherry, Blue Rasp.' },
  { y: '2026', t: 'You', b: 'Mango and Grape drop. The lineup is six. We ship to 41 countries. The fridge keeps growing.' },
];

function storyFaqUseReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useStateO(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches);
  useEffectO(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    onChange();
    if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', onChange); else mq.removeListener(onChange); };
  }, []);
  return reduced;
}

function StoryPage() {
  return (
    <>
      <section style={{ position: 'relative', paddingTop: 120, paddingBottom: 80, overflow: 'hidden' }} data-screen-label="01 Story Hero">
        <div className="hero-bg" style={{ opacity: 0.4 }}/>
        <div className="container" style={{ position: 'relative' }}>
          <div className="eyebrow" style={{ marginBottom: 24 }}>// OUR STORY · FOUNDED 2024</div>
          <h1 className="display-xl" style={{ maxWidth: 1000, marginBottom: 32, overflowWrap: 'break-word' }}>
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
          {/* Two pairs in an outer auto-fit grid -> 4 / 2x2 / 1 columns, never a 3+1 orphan. */}
          <div style={storyFaqAutoGrid(24, 504)}>
            {[storyFaqTimeline.slice(0, 2), storyFaqTimeline.slice(2)].map((pair, g) => (
              <div key={g} style={storyFaqAutoGrid(24)}>
                {pair.map((s, j) => (
                  <div key={s.y} className="card" style={{ position: 'relative' }}>
                    <div className="mono-sm" style={{ color: 'var(--accent)', marginBottom: 12 }}>{s.y}</div>
                    <div className="h3" style={{ fontSize: 22, marginBottom: 12 }}>{s.t}</div>
                    <p className="body" style={{ fontSize: 14 }}>{s.b}</p>
                    <div aria-hidden="true" style={{ position: 'absolute', top: 12, right: 12, font: '700 32px var(--font-mono)', color: 'var(--border-2)' }}>0{g * 2 + j + 1}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="science">
        <div className="container">
          <div className="eyebrow" style={{ marginBottom: 16 }}>// THE SCIENCE</div>
          <h2 className="display-lg" style={{ marginBottom: 40, maxWidth: 800 }}>What's actually in the bottle.</h2>
          <div style={storyFaqAutoGrid(20, 300)}>
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
                <div style={{ font: '700 32px var(--font-mono)', color: 'var(--accent)', marginBottom: 12, overflowWrap: 'anywhere' }}>{s.n}</div>
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
            {['Late-night ops', 'Clean formulation', 'No VC strings', 'Carbon-neutral bottles', 'Recyclable everything'].map(v => (
              <span key={v} className="hud-pill" style={{ fontSize: 11 }}>{v}</span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

// One accordion row. The answer collapses with the grid-rows technique (0fr -> 1fr)
// so long answers are never clipped; closed answers are inert (no focus, not in the a11y tree).
function StoryFaqItem({ q, a, idx, isOpen, reduced, onToggle }) {
  const regionRef = useRefO(null);
  const qId = `storyfaq-q-${idx}`;
  const aId = `storyfaq-a-${idx}`;
  // Layout effect so closed panels are inert before first paint.
  useLayoutEffectO(() => {
    if (regionRef.current) regionRef.current.inert = !isOpen;
  }, [isOpen]);
  const dur = 260;
  return (
    <div style={{ borderBottom: '1px solid var(--border-1)' }}>
      <button id={qId} type="button" aria-expanded={isOpen} aria-controls={aId} onClick={onToggle} style={{
        width: '100%', padding: '20px 0',
        background: 'transparent', border: 0, cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
        color: 'var(--fg-1)', textAlign: 'left',
        font: '600 17px/1.35 var(--font-ui)',
      }}>
        <span>{q}</span>
        <span aria-hidden="true" style={{
          color: 'var(--accent)', flexShrink: 0, display: 'inline-flex',
          transform: isOpen ? 'rotate(180deg)' : 'none',
          transition: reduced ? 'none' : `transform 220ms ${storyFaqEaseOut}`,
        }}>
          <Icon name="chevD" size={20}/>
        </span>
      </button>
      <div id={aId} ref={regionRef} role="region" aria-labelledby={qId} style={{
        display: 'grid',
        gridTemplateRows: isOpen ? '1fr' : '0fr',
        transition: reduced ? 'none' : `grid-template-rows ${dur}ms ${storyFaqEaseOut}`,
      }}>
        <div style={{
          minHeight: 0, overflow: 'hidden',
          // Hide after the collapse finishes (instantly when opening or under reduced motion).
          visibility: isOpen ? 'visible' : 'hidden',
          transition: isOpen || reduced ? 'none' : `visibility 0s linear ${dur}ms`,
        }}>
          <p className="body" style={{ paddingBottom: 20, color: 'var(--fg-2)' }}>{a}</p>
        </div>
      </div>
    </div>
  );
}

function FAQPage() {
  const [open, setOpen] = useStateO(0);
  const reduced = storyFaqUseReducedMotion();
  const groups = [
    { name: 'Product', qs: [
      ['How is Slime Lime different from a regular energy drink?', "Most energy drinks are tuned for shift workers — high sugar, max stim, fast crash. We're tuned for 6-hour focus sessions. 75mg of clean caffeine, 100mg L-theanine, real fruit, six electrolytes."],
      ['Is there caffeine in every flavor?', "Yes. Every bottle has the same 75mg dose. We don't make decaf — yet."],
      ['Where are the bottles made?', "Co-packed in Wisconsin and the Netherlands. Glass bottles (recyclable). Carbon-neutral shipping in the US and EU."],
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
                  <StoryFaqItem key={q} q={q} a={a} idx={myIdx} isOpen={isOpen} reduced={reduced}
                    onToggle={() => setOpen(isOpen ? -1 : myIdx)}/>
                );
              })}
            </div>
          ))}

          <div className="card" style={{ marginTop: 56, textAlign: 'center', padding: 'clamp(24px, 6vw, 40px)' }}>
            <div className="h3" style={{ marginBottom: 12 }}>Still got questions?</div>
            <p className="body" style={{ marginBottom: 24 }}>Drop into Discord or email us. We're online late.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a className="btn btn-primary" href="https://discord.com" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <Icon name="discord" size={16}/> Join Discord
              </a>
              <a className="btn btn-secondary" href="mailto:support@slimelime.gg" style={{ textDecoration: 'none' }}>support@slimelime.gg</a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

window.StoryPage = StoryPage;
window.FAQPage = FAQPage;
