/* global React */
// HYBRID AI (Firebase AI Logic): the On-device / Cloud badge, the Gemini Nano status pill,
// and the #/hybrid test page. The model calls live in hybrid-ai.js (window.slHybrid).
const { useState: useStateH, useEffect: useEffectH, useRef: useRefH } = React;

const HYBRID_FALLBACK_STATE = { firebase: 'loading', nano: 'checking', progress: null, error: null };

// Live status from hybrid-ai.js. That module may load before or after this file compiles.
function useHybrid() {
  const [state, setState] = useStateH(() => (window.slHybrid ? window.slHybrid.state : HYBRID_FALLBACK_STATE));
  useEffectH(() => {
    const onChange = e => setState(e.detail);
    window.addEventListener('sl-hybrid', onChange);
    if (window.slHybrid) setState(window.slHybrid.state);
    return () => window.removeEventListener('sl-hybrid', onChange);
  }, []);
  return state;
}

// Shown on every AI answer: which model actually wrote it.
function HybridBadge({ source }) {
  const onDevice = source === 'on-device';
  return (
    <span className={'sl-hy-badge ' + (onDevice ? 'is-device' : 'is-cloud')}
      title={onDevice ? 'Answered by Gemini Nano, running in this browser' : 'Answered by Gemini in the cloud, through Firebase AI Logic'}>
      <span className="sl-hy-dot" aria-hidden="true"/>
      {onDevice ? 'On-device' : 'Cloud'}
    </span>
  );
}

function hybridNanoLabel(s) {
  if (s.firebase === 'error') return { tone: 'bad', text: 'AI unavailable' };
  switch (s.nano) {
    case 'checking': return { tone: 'idle', text: 'Checking on-device model…' };
    case 'available': return { tone: 'good', text: 'On-device model ready' };
    case 'downloading': return {
      tone: 'busy',
      text: s.progress != null && s.progress > 0
        ? `Downloading on-device model ${Math.round(s.progress * 100)}%`
        : 'Downloading on-device model…',
    };
    case 'downloadable': return { tone: 'idle', text: 'On-device model not downloaded' };
    default: return { tone: 'idle', text: 'Cloud only in this browser' };
  }
}

// Gemini Nano state, so a first on-device call never looks like a frozen spinner.
function HybridStatus() {
  const s = useHybrid();
  const { tone, text } = hybridNanoLabel(s);
  const canDownload = s.firebase === 'ready' && s.nano === 'downloadable';
  return (
    <div className={'sl-hy-status tone-' + tone} role="status" aria-live="polite">
      <span className="sl-hy-dot" aria-hidden="true"/>
      <span>{text}</span>
      {s.nano === 'downloading' && (
        <span className="sl-hy-bar" aria-hidden="true">
          <span style={{ width: s.progress != null && s.progress > 0 ? `${Math.round(s.progress * 100)}%` : '35%' }}
            className={s.progress != null && s.progress > 0 ? '' : 'is-indeterminate'}/>
        </span>
      )}
      {canDownload && (
        <button type="button" className="sl-hy-link" onClick={() => window.slHybrid.initDevice()}>Download</button>
      )}
    </div>
  );
}

const HYBRID_DEFAULT_PROMPT = 'In one upbeat sentence, pitch Slime Lime, a clean-formula lemon-lime soda for late-night gaming.';

function HybridLabPage() {
  const s = useHybrid();
  const [prompt, setPrompt] = useStateH(HYBRID_DEFAULT_PROMPT);
  const [answers, setAnswers] = useStateH([]);
  const [busy, setBusy] = useStateH(false);
  const [error, setError] = useStateH(null);
  const [cloudOnly, setCloudOnly] = useStateH(false);
  const [elapsed, setElapsed] = useStateH(0);
  const idRef = useRefH(0);

  // Seconds since Ask, so a slow on-device call reads as working, not frozen.
  useEffectH(() => {
    if (!busy) return;
    setElapsed(0);
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function onAsk(e) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || busy || !window.slHybrid || s.firebase !== 'ready') return; // also guards Ctrl+Enter
    setBusy(true);
    setError(null);
    const started = performance.now();
    try {
      const res = await window.slHybrid.ask(text, { cloudOnly });
      const ms = Math.round(performance.now() - started);
      setAnswers(list => [{ id: ++idRef.current, prompt: text, ...res, ms }, ...list].slice(0, 6));
    } catch (err) {
      console.error('[hybrid] ask failed', err);
      setError(err && err.message ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const ready = s.firebase === 'ready' && !!window.slHybrid;
  return (
    <section className="sl-hy-page" data-screen-label="Hybrid AI">
      <div className="container-prose">
        <div className="eyebrow" style={{ marginBottom: 16 }}>// HYBRID AI · FIREBASE AI LOGIC</div>
        <h1 className="display-lg" style={{ marginBottom: 12 }}>On-device first,<br/>cloud when it has to.</h1>
        <p className="body" style={{ color: 'var(--fg-2)', marginBottom: 24, maxWidth: 560 }}>
          Each answer comes from Gemini Nano inside Chrome when this browser has it, or from Gemini in the cloud
          through Firebase when it doesn't. The badge says which one answered.
        </p>
        <HybridStatus/>
        <form className="sl-hy-form" onSubmit={onAsk}>
          <label htmlFor="sl-hy-prompt" className="mono-sm" style={{ color: 'var(--fg-3)' }}>Prompt</label>
          <textarea id="sl-hy-prompt" rows={3} value={prompt} maxLength={500}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onAsk(e); }}/>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={!ready || busy || !prompt.trim()}>
              {busy ? (elapsed > 0 ? `Thinking… ${elapsed}s` : 'Thinking…') : 'Ask'}
            </button>
            <label className="sl-hy-switch">
              <input type="checkbox" checked={cloudOnly} onChange={e => setCloudOnly(e.target.checked)}/>
              Cloud only
            </label>
            {!ready && s.firebase !== 'error' && <span className="mono-sm" style={{ color: 'var(--fg-3)' }}>Loading Firebase…</span>}
          </div>
        </form>
        {(error || s.firebase === 'error') && (
          <p className="sl-hy-error" role="alert">{error || s.error}</p>
        )}
        <ol className="sl-hy-answers">
          {answers.map(a => (
            <li key={a.id} className="sl-hy-answer">
              <div className="sl-hy-answer-head">
                <HybridBadge source={a.source}/>
                <span className="mono-sm" style={{ color: 'var(--fg-4)' }}>{(a.ms / 1000).toFixed(1)}s</span>
              </div>
              <p className="sl-hy-q">{a.prompt}</p>
              <p className="sl-hy-a">{a.text}</p>
              {a.fellBack && <p className="sl-hy-note">On-device model stalled or failed, so the cloud answered.</p>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

window.useHybrid = useHybrid;
window.HybridBadge = HybridBadge;
window.HybridStatus = HybridStatus;
window.HybridLabPage = HybridLabPage;
