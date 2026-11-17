/* global React */
// VIBE TO PACK (home page): the shopper types a vibe, Gemini Nano in Chrome (or cloud Gemini through
// Firebase when Nano isn't there) picks flavors and bottle counts, and the pack fills the Fridge.
// The model call, the JSON schema and the checks live in hybrid-ai.js (window.slHybrid.vibeToPack).
// Prices are never part of it: the Fridge shows its own, and the server sets them at checkout.
const { useState: useStateV, useEffect: useEffectV } = React;

const VIBE_EXAMPLES = [
  'chill, low sugar, 6',
  'late-night ranked, nothing too sweet, 12 bottles',
  'fruity LAN party pack, 24',
];

function VibePack({ onFillPack, onOpenFridge }) {
  const s = window.useHybrid();
  const [vibe, setVibe] = useStateV('');
  const [cloudOnly, setCloudOnly] = useStateV(false);
  const [busy, setBusy] = useStateV(false);
  const [elapsed, setElapsed] = useStateV(0);
  const [result, setResult] = useStateV(null);
  const [error, setError] = useStateV(null);

  // Seconds since the ask, so a slow first on-device answer reads as working, not frozen.
  useEffectV(() => {
    if (!busy) return;
    setElapsed(0);
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const ready = s.firebase === 'ready' && !!window.slHybrid;

  async function build(text) {
    const v = (text ?? vibe).trim();
    if (!v || busy || !ready) return;
    if (text != null) setVibe(text);
    setBusy(true);
    setError(null);
    setResult(null);
    const started = performance.now();
    try {
      const pack = await window.slHybrid.vibeToPack(v, { cloudOnly });
      onFillPack(pack.lines);
      setResult({ ...pack, vibe: v, ms: Math.round(performance.now() - started) });
    } catch (err) {
      console.error('[vibe-pack] failed', err);
      setError(err && err.message ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const flavors = window.FLAVORS;
  const flavorOf = id => flavors.find(f => f.id === id);

  return (
    <section className="section sl-vp" id="vibe" data-level="Character select" data-screen-label="02b Vibe to Pack">
      <div className="container-narrow">
        <div className="eyebrow" style={{ marginBottom: 16 }}>// VIBE TO PACK · ON-DEVICE AI</div>
        <h2 className="display-lg" style={{ marginBottom: 16 }}>
          Say the vibe.<br/><span style={{ color: 'var(--accent)' }}>Get the pack.</span>
        </h2>
        <p className="body" style={{ maxWidth: 600, marginBottom: 24 }}>
          Gemini Nano builds your pack right inside Chrome, so it works even offline once the model is on your
          device. No Nano? Gemini in the cloud steps in. The badge tells you which one did it.
        </p>
        <window.HybridStatus/>
        <form className="sl-vp-form" onSubmit={e => { e.preventDefault(); build(); }}>
          <label htmlFor="sl-vp-input" className="sr-only">Your vibe</label>
          <input id="sl-vp-input" type="text" value={vibe} maxLength={200} autoComplete="off"
            placeholder="chill, low sugar, 6" onChange={e => setVibe(e.target.value)}/>
          <button type="submit" className="btn btn-primary btn-lg" disabled={!ready || busy || !vibe.trim()}>
            {busy ? (elapsed > 0 ? `Building… ${elapsed}s` : 'Building…') : 'Build my pack'}
          </button>
        </form>
        <div className="sl-vp-row">
          <div className="sl-vp-chips" role="group" aria-label="Try a vibe">
            {VIBE_EXAMPLES.map(x => (
              <button key={x} type="button" className="sl-vp-chip" disabled={!ready || busy} onClick={() => build(x)}>{x}</button>
            ))}
          </div>
          <label className="sl-hy-switch">
            <input type="checkbox" checked={cloudOnly} onChange={e => setCloudOnly(e.target.checked)}/>
            Cloud only
          </label>
        </div>
        {!ready && s.firebase !== 'error' && <p className="mono-sm" style={{ color: 'var(--fg-3)', marginTop: 12 }}>Loading AI…</p>}
        {(error || s.firebase === 'error') && <p className="sl-hy-error" role="alert" style={{ marginTop: 16 }}>{error || s.error}</p>}
        {result && (
          <div className="sl-vp-result" aria-live="polite">
            <div className="sl-hy-answer-head">
              <window.HybridBadge source={result.source}/>
              <span className="mono-sm" style={{ color: 'var(--fg-4)' }}>{(result.ms / 1000).toFixed(1)}s</span>
            </div>
            <p className="sl-hy-q">“{result.vibe}”</p>
            {result.why && <p className="sl-hy-a" style={{ marginBottom: 14 }}>{result.why}</p>}
            <ul className="sl-vp-lines">
              {result.lines.map(l => {
                const f = flavorOf(l.id);
                return (
                  <li key={l.id}>
                    <span className="sl-vp-dot" style={{ background: f ? f.color : 'var(--fg-3)' }} aria-hidden="true"/>
                    <span>{l.qty} × {f ? f.short : l.id}</span>
                  </li>
                );
              })}
            </ul>
            <div className="sl-vp-foot">
              <span className="mono-sm">{result.bottles} BOTTLES · IN YOUR FRIDGE</span>
              <button type="button" className="btn btn-secondary" onClick={onOpenFridge}>Open Fridge</button>
            </div>
            {result.fellBack && <p className="sl-hy-note">On-device model stalled or failed, so the cloud built this one.</p>}
          </div>
        )}
      </div>
    </section>
  );
}

window.VibePack = VibePack;
