/* global React */
// VOICE LOOP (Hands-free mode): the shopper talks to the Flavor Concierge and it answers out loud.
//
// While the mode is 'handsfree' (mode.jsx), Web Speech recognition runs continuously and every
// committed transcript goes to window.slConcierge.send(text). Concierge replies (the 'sl-concierge'
// reply events from concierge.jsx) are spoken with speechSynthesis. The mic pauses while the agent
// talks, so it never hears itself, and comes back when the speech ends.
//
// Voice commands, handled here before the agent sees anything:
//   "stop listening"                   -> mic off, "Tap to talk" shows
//   "start listening" / "resume ..."   -> mic stays on
//   "confirm" / "yes confirm"          -> window 'sl-confirm' event (same path as the on-screen
//                                         Confirm button), when something is waiting for it.
//                                         Otherwise the words go to the agent like any other.
// Payment approval is never by voice: PayPal's window always needs a click.
//
// Contract for other layers (the hands-free stage renders its own big mic from this):
//   window 'sl-voice' event, detail:
//     state:  'off'         mic off and staying off until a tap: Legacy, Hands-free before the first
//                           tap, after "stop listening", or mic blocked/missing (see reason)
//             'listening'   recognizer running, nobody talking
//             'hearing'     words coming in: interim holds the live text
//             'speaking'    the agent is talking; the mic is paused until it finishes
//             'paused'      mic briefly down and coming back by itself (starting up, restarting)
//             'unsupported' Hands-free in a browser without SpeechRecognition (typed fallback)
//     interim: live text while hearing ('' otherwise)
//     final:   the transcript just committed (only on the event that commits it)
//     reason:  why the mic is off: 'legacy' | 'gesture' | 'stopped' | 'blocked' | 'nomic' | 'error' | ''
//     message: a sentence for the shopper when something went wrong ('' otherwise)
//     supported, speaking: booleans
//   window.slVoice = { start(), stop(), state(), supported(), snapshot() }
//     start() needs to run inside a user gesture the first time (mic permission prompt).
//
// A pending confirmation is detected by either a rendered, enabled [data-sl-confirm] element or
// window.slConcierge.confirmPending() returning true. The confirm flow (agent subscription tools)
// can provide either one.
const { useState: useStateVoice, useEffect: useEffectVoice } = React;

const VOICE_LANG = 'en-US';
const VOICE_COMMIT_MS = 700;        // merge final results split by a short breath
const VOICE_RESTART_MS = 150;       // normal restart after the recognizer ends
const VOICE_BACKOFF_MAX_MS = 8000;  // ceiling for restarts after quick failures
const VOICE_MAX_FAILS = 6;          // quick failures in a row before giving up
const VOICE_RESUME_MS = 350;        // after speech ends, let the room go quiet before listening
const VOICE_SPEECH_CAP_MS = 30000;  // hard cap on waiting for speechSynthesis to finish
const VOICE_MAX_CHARS = 320;        // spoken replies: 2-3 sentences, about this long
const VOICE_PAYPAL_LINE = 'Tap the PayPal button to approve.';
const VOICE_MSG_BLOCKED = 'Mic blocked — allow it in the address bar, or type.';
const VOICE_MSG_NOMIC = 'No mic found — plug one in and tap to talk, or type.';
const VOICE_MSG_UNSUPPORTED = 'Voice needs Chrome — type instead.';
const VOICE_MSG_FLAKY = 'Voice keeps dropping out — tap to talk to retry, or type.';
const VOICE_MSG_LANG = 'Voice isn’t available in this browser — type instead.';

const VoiceRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const voiceSynth = ('speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function') ? window.speechSynthesis : null;

// Built at runtime (not as literals) so Babel standalone leaves the Unicode property escapes alone.
let VOICE_EMOJI_RE = null;
try {
  VOICE_EMOJI_RE = new RegExp('[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}\\u{1F3FB}-\\u{1F3FF}\\u{E0020}-\\u{E007F}\\uFE0E\\uFE0F\\u200D\\u20E3]', 'gu');
} catch (e) {
  VOICE_EMOJI_RE = /[\uD83C-\uDBFF][\uDC00-\uDFFF]|[☀-➿︎️‍⃣]/g;
}

const voiceS = {
  active: false,     // Hands-free: listeners attached, replies spoken
  wanted: false,     // the shopper wants the mic on
  reason: 'legacy',  // why the mic is off (see header)
  message: '',
  rec: null,
  running: false,    // start() called and no 'end' yet
  live: false,       // 'start' event seen: actually capturing
  everLive: false,   // captured at least once since the shopper turned the mic on
  selfStopped: false, // we aborted it on purpose (agent speaking, stop): not a failure
  startedAt: 0,
  lastError: '',
  fails: 0,
  restartTimer: 0,
  buffer: '',        // final text not yet committed
  interim: '',
  commitTimer: 0,
  speaking: false,
  speechSeq: 0,
  utterance: null,   // kept referenced: Chrome drops onend for garbage-collected utterances
  speechTimer: 0,
  thinking: false,
  queued: '',        // spoken while the agent was busy; sent once it's free
  checkoutPending: false, // a checkout just appeared: its reply must mention the PayPal button
  checkoutOpen: false,    // a PayPal checkout is waiting in the panel
  lastSpeechEnd: 0,
  voice: undefined,  // chosen speechSynthesis voice (undefined = not picked yet)
  lastKey: '',
  state: 'off',
};

const voiceMode = () => (window.slMode ? window.slMode.get() : 'legacy');

// The PayPal approval window is open (a checkout is waiting and this page lost focus): hold the mic
// so nothing said meanwhile reaches the agent and swaps the pack mid-payment.
const voiceHeld = () => voiceS.checkoutOpen && typeof document.hasFocus === 'function' && !document.hasFocus();

function voiceComputeState() {
  if (!voiceS.active) return 'off';
  if (!VoiceRecognition) return 'unsupported';
  if (voiceS.speaking) return 'speaking';
  if (!voiceS.wanted) return 'off';
  if (voiceHeld()) return 'paused';
  // Automatic restarts between sessions read as still listening, not as a flicker.
  if (!voiceS.live) return voiceS.everLive && !voiceS.fails ? 'listening' : 'paused';
  return voiceS.interim || voiceS.buffer ? 'hearing' : 'listening';
}

function voiceSnapshot(final = '') {
  const state = voiceComputeState();
  const off = state === 'off' || state === 'unsupported';
  return {
    state,
    interim: state === 'hearing' ? `${voiceS.buffer} ${voiceS.interim}`.trim() : '',
    final,
    reason: off ? (voiceS.active ? voiceS.reason : 'legacy') : '',
    message: !voiceS.active ? '' : state === 'unsupported' ? VOICE_MSG_UNSUPPORTED : off ? voiceS.message : '',
    supported: !!VoiceRecognition,
    speaking: voiceS.speaking,
  };
}

// Emits 'sl-voice' when anything visible changed (always when a transcript is committed).
function voiceUpdate(final = '') {
  const detail = voiceSnapshot(final);
  voiceS.state = detail.state;
  const key = [detail.state, detail.interim, detail.reason, detail.message, detail.speaking].join('|');
  if (!final && key === voiceS.lastKey) return;
  voiceS.lastKey = key;
  try { window.dispatchEvent(new CustomEvent('sl-voice', { detail })); } catch (e) {}
}

// Typed fallback: only when the panel is open and the shopper isn't typing somewhere else.
function voiceFocusInput() {
  const el = document.querySelector('.cc-panel.is-open .cc-input');
  if (!el || typeof el.focus !== 'function') return;
  const ae = document.activeElement;
  const elsewhere = ae && ae !== document.body && !ae.closest('.cc-panel')
    && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName));
  if (!elsewhere) el.focus({ preventScroll: true });
}

function voiceClearTimer(name) {
  if (voiceS[name]) { clearTimeout(voiceS[name]); voiceS[name] = 0; }
}

// ── Recognition ─────────────────────────────────────────────────────────────

function voiceMakeRec() {
  const rec = new VoiceRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = VOICE_LANG;
  rec.maxAlternatives = 1;
  rec.onstart = () => { voiceS.live = true; voiceS.everLive = true; voiceUpdate(); };
  rec.onresult = voiceOnResult;
  rec.onerror = voiceOnError;
  rec.onend = voiceOnEnd;
  return rec;
}

function voiceDropRec() {
  const rec = voiceS.rec;
  voiceS.rec = null;
  voiceS.running = false;
  voiceS.live = false;
  if (!rec) return;
  rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
  try { rec.abort(); } catch (e) {}
}

function voiceStartRec() {
  if (!voiceS.rec) voiceS.rec = voiceMakeRec();
  voiceS.lastError = '';
  voiceS.selfStopped = false;
  voiceS.startedAt = Date.now();
  try {
    voiceS.rec.start();
    voiceS.running = true;
  } catch (e) {
    // InvalidStateError: still running or still winding down. Its 'end' event restarts it.
    if (e && e.name === 'InvalidStateError') voiceS.running = true;
    else voiceGiveUp('error', VOICE_MSG_FLAKY);
  }
}

// Brings the recognizer in line with what should be happening right now.
function voiceSync() {
  const want = voiceS.active && !!VoiceRecognition && voiceS.wanted && !voiceS.speaking && !document.hidden && !voiceHeld();
  if (want && !voiceS.running && !voiceS.restartTimer) voiceStartRec();
  else if (!want) {
    voiceClearTimer('restartTimer');
    if (voiceS.running && voiceS.rec) {
      // abort, not stop: drop whatever half-heard audio is in flight instead of transcribing it.
      voiceS.selfStopped = true;
      try { voiceS.rec.abort(); } catch (e) {}
    }
  }
  voiceUpdate();
}

function voiceGiveUp(reason, message) {
  voiceS.wanted = false;
  voiceS.everLive = false;
  voiceS.reason = reason;
  voiceS.message = message || '';
  voiceS.buffer = '';
  voiceS.interim = '';
  voiceClearTimer('commitTimer');
  voiceSync();
  if (reason === 'blocked' || reason === 'nomic' || reason === 'error') voiceFocusInput();
}

function voiceOnResult(e) {
  if (voiceS.speaking || !e || !e.results) return;
  let interim = '';
  let gotFinal = false;
  for (let i = e.resultIndex || 0; i < e.results.length; i++) {
    const r = e.results[i];
    const t = (r && r[0] && r[0].transcript) || '';
    if (r.isFinal) {
      if (t.trim()) { voiceS.buffer = `${voiceS.buffer} ${t}`.replace(/\s+/g, ' ').trim(); gotFinal = true; }
    } else interim += t;
  }
  voiceS.interim = interim.replace(/\s+/g, ' ').trim();
  voiceS.fails = 0;
  // Still talking: wait for the next final. Quiet with something final in hand: commit soon.
  if (voiceS.interim) voiceClearTimer('commitTimer');
  else if (gotFinal || voiceS.buffer) {
    voiceClearTimer('commitTimer');
    voiceS.commitTimer = setTimeout(voiceCommit, VOICE_COMMIT_MS);
  }
  voiceUpdate();
}

function voiceOnError(e) {
  const err = (e && e.error) || 'unknown';
  voiceS.lastError = err;
  if (err === 'no-speech' || err === 'aborted') return; // 'end' follows and restarts
  if (err === 'not-allowed' || err === 'service-not-allowed') voiceGiveUp('blocked', VOICE_MSG_BLOCKED);
  else if (err === 'audio-capture') voiceGiveUp('nomic', VOICE_MSG_NOMIC);
  else if (err === 'language-not-supported') voiceGiveUp('error', VOICE_MSG_LANG);
  // 'network' and the rest: 'end' follows and restarts with backoff.
}

function voiceOnEnd() {
  voiceS.running = false;
  voiceS.live = false;
  // Anything already final still counts, unless the agent took the floor.
  if (voiceS.buffer && !voiceS.speaking) voiceCommit();
  voiceS.buffer = '';
  voiceS.interim = '';
  voiceClearTimer('commitTimer');
  const err = voiceS.lastError;
  const quick = Date.now() - voiceS.startedAt < 1000;
  const failed = !voiceS.selfStopped && ((err && err !== 'no-speech' && err !== 'aborted') || quick);
  voiceS.fails = failed ? voiceS.fails + 1 : 0;
  if (voiceS.wanted && voiceS.fails >= VOICE_MAX_FAILS) { voiceGiveUp('error', VOICE_MSG_FLAKY); return; }
  if (voiceS.active && voiceS.wanted && !voiceS.speaking && !voiceS.restartTimer) {
    let delay = voiceS.fails ? Math.min(VOICE_RESTART_MS * Math.pow(2, voiceS.fails), VOICE_BACKOFF_MAX_MS) : VOICE_RESTART_MS;
    // Speech may have ended before this 'end' arrived: still give the room its quiet beat.
    delay = Math.max(delay, VOICE_RESUME_MS - (Date.now() - voiceS.lastSpeechEnd));
    voiceS.restartTimer = setTimeout(() => { voiceS.restartTimer = 0; voiceSync(); }, delay);
  }
  voiceUpdate();
}

// ── Transcripts and commands ────────────────────────────────────────────────

function voiceCommand(text) {
  const t = String(text).toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();
  // Whole utterance only (a little politeness allowed): "I can't stop listening to synthwave" is a request.
  if (/^(?:(?:ok|okay|hey|please)\s+)*(?:stop|pause) listening(?:\s+(?:please|now|for now|thanks|thank you))*$/.test(t)) return 'stop';
  if (/^(?:(?:ok|okay|hey|please)\s+)*(?:start|resume) listening(?:\s+(?:please|now|again|thanks|thank you))*$/.test(t)) return 'start';
  if (/^(?:(?:yes|yeah|yep|ok|okay|sure)\s+)?(?:i\s+)?confirm(?:\s+(?:it|that|this|please))?(?:\s+please)?$/.test(t)) return 'confirm';
  return '';
}

function voiceConfirmPending() {
  try {
    const cc = window.slConcierge;
    if (cc && typeof cc.confirmPending === 'function' && cc.confirmPending()) return true;
    const el = document.querySelector('[data-sl-confirm]');
    return !!(el && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
  } catch (e) {
    return false;
  }
}

// The concierge shows its typing dots while a request is in flight.
const voiceConciergeBusy = () => !!document.querySelector('.cc-panel .cc-typing');

// The shopper has a half-typed message: add the words to it instead of sending (send() would wipe
// the draft). The input is React-controlled, so set it through the native setter and fire 'input'.
function voiceAppendToDraft(text) {
  const el = document.querySelector('.cc-panel .cc-input');
  if (!el || !el.value.trim()) return false;
  try {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const max = el.maxLength > 0 ? el.maxLength : 500;
    setter.call(el, `${el.value.replace(/\s+$/, '')} ${text}`.slice(0, max));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  } catch (e) {
    return false;
  }
}

// concierge send() drops a message that arrives while it is busy, so hold it here until it's free.
function voiceSendToAgent(text) {
  const cc = window.slConcierge;
  if (voiceS.thinking || voiceS.speaking || voiceConciergeBusy() || !cc || typeof cc.send !== 'function') {
    voiceS.queued = `${voiceS.queued} ${text}`.trim();
    return;
  }
  if (voiceAppendToDraft(text)) return;
  try { Promise.resolve(cc.send(text)).catch(() => {}); } catch (e) {}
}

function voiceFlushQueued() {
  if (!voiceS.queued || voiceS.thinking || voiceS.speaking || !voiceS.active) return;
  const text = voiceS.queued;
  voiceS.queued = '';
  voiceSendToAgent(text);
}

function voiceCommit() {
  voiceClearTimer('commitTimer');
  const text = voiceS.buffer.trim();
  voiceS.buffer = '';
  voiceS.interim = '';
  if (!text) { voiceUpdate(); return; }
  voiceUpdate(text);
  const cmd = voiceCommand(text);
  if (cmd === 'stop') { voiceStopListening(); return; }
  if (cmd === 'start') { voiceS.wanted = true; voiceSync(); return; }
  if (cmd === 'confirm' && voiceConfirmPending()) {
    try { window.dispatchEvent(new CustomEvent('sl-confirm', { detail: { source: 'voice' } })); } catch (e) {}
    return;
  }
  voiceSendToAgent(text);
}

function voiceStopListening() {
  voiceS.wanted = false;
  voiceS.everLive = false;
  voiceS.reason = 'stopped';
  voiceS.message = '';
  voiceS.buffer = '';
  voiceS.interim = '';
  voiceClearTimer('commitTimer');
  voiceSync();
}

// ── Speech out ──────────────────────────────────────────────────────────────

// Markdown and emoji read badly aloud.
function voiceClean(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s.,!?;:)]|$)/g, '$1$2')
    .replace(/[*#|~]+/g, ' ')
    .replace(VOICE_EMOJI_RE, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/([.!?])\s*\.(\s|$)/g, '$1$2')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// About 2-3 sentences: cut at sentence boundaries, never mid-word.
function voiceTrim(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const parts = (t.match(/[\s\S]*?(?:[.!?]+["')\]]*(?=\s|$)|$)/g) || []).map(s => s.trim()).filter(Boolean);
  let out = '';
  for (let i = 0; i < parts.length && i < 3; i++) {
    const next = out ? `${out} ${parts[i]}` : parts[i];
    if (out && next.length > VOICE_MAX_CHARS) break;
    out = next;
  }
  if (out.length > VOICE_MAX_CHARS + 80) {
    const cut = out.lastIndexOf(' ', VOICE_MAX_CHARS);
    out = `${out.slice(0, cut > 40 ? cut : VOICE_MAX_CHARS).replace(/[\s,;:–—-]+$/, '')}.`;
  }
  return out;
}

// A natural English voice when the browser has one, else the default.
function voicePickVoice() {
  if (!voiceSynth) return null;
  if (voiceS.voice !== undefined) return voiceS.voice;
  let voices = [];
  try { voices = voiceSynth.getVoices() || []; } catch (e) {}
  if (!voices.length) return null; // not loaded yet: 'voiceschanged' picks again
  let best = null, bestScore = -1;
  voices.forEach(v => {
    const lang = String(v.lang || '').toLowerCase().replace('_', '-');
    if (!lang.startsWith('en')) return;
    const name = String(v.name || '');
    let score = 0;
    if (/natural|neural|premium|enhanced/i.test(name)) score += 6;
    if (/google/i.test(name)) score += 4;
    if (/\b(aria|jenny|ava|samantha|allison|emma|guy|andrew|brian|zira)\b/i.test(name)) score += 2;
    if (lang === 'en-us') score += 2;
    if (v.default) score += 1;
    if (score > bestScore) { best = v; bestScore = score; }
  });
  voiceS.voice = best;
  return best;
}

function voiceOnVoicesChanged() { voiceS.voice = undefined; voicePickVoice(); }

function voiceSpeechDone(seq) {
  if (seq !== voiceS.speechSeq || !voiceS.speaking) return;
  voiceClearTimer('speechTimer');
  voiceS.speaking = false;
  voiceS.utterance = null;
  voiceS.lastSpeechEnd = Date.now();
  // Give the room a beat before the mic comes back, so it doesn't catch the speech tail.
  if (voiceS.active && voiceS.wanted && !voiceS.running) {
    voiceClearTimer('restartTimer');
    voiceS.restartTimer = setTimeout(() => { voiceS.restartTimer = 0; voiceSync(); }, VOICE_RESUME_MS);
  }
  voiceUpdate();
  voiceFlushQueued();
}

function voiceCancelSpeech() {
  const seq = voiceS.speechSeq;
  if (voiceSynth) { try { voiceSynth.cancel(); } catch (e) {} }
  voiceSpeechDone(seq);
}

function voiceSpeak(text) {
  return voiceSpeakLine(voiceTrim(voiceClean(text)));
}

// Speaks a line that is already cleaned and trimmed.
function voiceSpeakLine(line) {
  if (!voiceSynth || !voiceS.active || !line) return false;
  // Words already final but still in the commit window go out (or queue) instead of being lost.
  if (voiceS.buffer) voiceCommit();
  const seq = ++voiceS.speechSeq; // before cancel(): the old utterance's onend is now stale
  try { if (voiceSynth.speaking || voiceSynth.pending) voiceSynth.cancel(); } catch (e) {}
  voiceClearTimer('speechTimer');
  const u = new SpeechSynthesisUtterance(line);
  u.lang = VOICE_LANG;
  const v = voicePickVoice();
  if (v) { u.voice = v; u.lang = v.lang || VOICE_LANG; }
  u.onend = () => voiceSpeechDone(seq);
  u.onerror = () => voiceSpeechDone(seq);
  voiceS.utterance = u;
  voiceS.speaking = true;
  voiceS.interim = '';
  voiceSync(); // pauses the mic
  try { voiceSynth.speak(u); } catch (e) { voiceSpeechDone(seq); return false; }
  // Chrome sometimes never fires onend. Wait about as long as the line takes, then keep waiting only
  // while speechSynthesis still says it is speaking, up to a hard cap.
  const t0 = Date.now();
  const check = () => {
    if (seq !== voiceS.speechSeq) return;
    let still = false;
    try { still = voiceSynth.speaking; } catch (e) {}
    if (still && Date.now() - t0 < VOICE_SPEECH_CAP_MS) { voiceS.speechTimer = setTimeout(check, 1000); return; }
    voiceSpeechDone(seq);
  };
  voiceS.speechTimer = setTimeout(check, Math.min(2500 + line.length * 75, VOICE_SPEECH_CAP_MS));
  return true;
}

function voiceSpeakReply(text) {
  let line = voiceTrim(voiceClean(text));
  if (voiceS.checkoutPending) {
    voiceS.checkoutPending = false;
    if (!/paypal button|(tap|click|press|hit)\b.{0,30}\bpaypal/i.test(line)) line = `${line} ${VOICE_PAYPAL_LINE}`.trim();
  }
  voiceSpeakLine(line);
}

// ── Concierge + mode wiring ─────────────────────────────────────────────────

function voiceOnConcierge(e) {
  const d = (e && e.detail) || {};
  switch (d.type) {
    case 'thinking':
      voiceS.thinking = !!d.on;
      if (!d.on) voiceFlushQueued();
      break;
    case 'checkout':
      voiceS.checkoutOpen = !!d.checkout;
      if (d.checkout) voiceS.checkoutPending = true;
      voiceSync();
      break;
    case 'pack':
    case 'paid':
      // A new pack retires the old checkout; a capture finishes it.
      voiceS.checkoutOpen = false;
      voiceSync();
      break;
    case 'reply':
      voiceSpeakReply(d.text);
      break;
    case 'error':
      voiceS.checkoutPending = false;
      voiceSpeak(d.message || 'Something glitched. Try again.');
      break;
    case 'user-message':
      // The shopper typed over the agent: stop talking and listen.
      if (!d.auto && voiceS.speaking) voiceCancelSpeech();
      break;
    default:
      break;
  }
}

function voiceOnVisibility() { if (voiceS.active) { voiceSync(); voiceFlushQueued(); } }

function voiceActivate(withGesture) {
  if (!voiceS.active) {
    voiceS.active = true;
    voiceS.wanted = false;
    voiceS.reason = 'gesture';
    voiceS.message = '';
    voiceS.fails = 0;
    // Joining mid-request: the concierge may already be thinking.
    voiceS.thinking = voiceConciergeBusy();
    voiceS.queued = '';
    voiceS.checkoutPending = false;
    voiceS.checkoutOpen = !!document.querySelector('.cc-panel .cc-pay-btn');
    window.addEventListener('sl-concierge', voiceOnConcierge);
    document.addEventListener('visibilitychange', voiceOnVisibility);
    window.addEventListener('focus', voiceOnVisibility);
    window.addEventListener('blur', voiceOnVisibility);
    if (voiceSynth && typeof voiceSynth.addEventListener === 'function') {
      voiceSynth.addEventListener('voiceschanged', voiceOnVoicesChanged);
      voicePickVoice();
    }
  }
  if (!VoiceRecognition) { voiceUpdate(); return; }
  if (withGesture) {
    voiceS.wanted = true;
    voiceS.reason = '';
    voiceS.message = '';
    voiceS.fails = 0;
    voiceSync();
    return;
  }
  // Restored from storage or changed in another tab: no gesture, so wait for "Tap to talk". Even with
  // the mic already allowed, starting here would leave the page without user activation, and Chrome
  // then refuses speechSynthesis.speak(), so the agent could hear but not answer.
  voiceUpdate();
}

function voiceDeactivate() {
  const was = voiceS.active;
  voiceS.active = false;
  voiceS.wanted = false;
  voiceS.everLive = false;
  voiceS.reason = 'legacy';
  voiceS.message = '';
  voiceS.buffer = '';
  voiceS.interim = '';
  voiceS.queued = '';
  voiceS.thinking = false;
  voiceS.checkoutPending = false;
  voiceS.checkoutOpen = false;
  ['restartTimer', 'commitTimer', 'speechTimer'].forEach(voiceClearTimer);
  voiceDropRec();
  if (voiceS.speaking || was) {
    voiceS.speechSeq++;
    voiceS.speaking = false;
    voiceS.utterance = null;
    if (voiceSynth) { try { voiceSynth.cancel(); } catch (e) {} }
  }
  window.removeEventListener('sl-concierge', voiceOnConcierge);
  document.removeEventListener('visibilitychange', voiceOnVisibility);
  window.removeEventListener('focus', voiceOnVisibility);
  window.removeEventListener('blur', voiceOnVisibility);
  if (voiceSynth && typeof voiceSynth.removeEventListener === 'function') voiceSynth.removeEventListener('voiceschanged', voiceOnVoicesChanged);
  voiceS.lastKey = '';
  voiceUpdate();
}

// mode.jsx fires 'sl-mode' synchronously inside the picker / nav click, so starting the recognizer
// here still counts as a user gesture for the mic prompt. Another tab's change ('storage') doesn't.
window.addEventListener('sl-mode', e => {
  const d = (e && e.detail) || {};
  if (d.mode === 'handsfree') voiceActivate(d.source !== 'storage');
  else voiceDeactivate();
});

const slVoice = {
  start() {
    if (voiceMode() !== 'handsfree') return false;
    if (!voiceS.active) voiceActivate(false);
    if (!VoiceRecognition) return false;
    voiceS.wanted = true;
    voiceS.reason = '';
    voiceS.message = '';
    voiceS.fails = 0;
    voiceClearTimer('restartTimer');
    voiceSync();
    return true;
  },
  stop() { if (voiceS.active) voiceStopListening(); },
  state: () => voiceS.state,
  supported: () => !!VoiceRecognition,
  snapshot: () => voiceSnapshot(),
};

if (voiceMode() === 'handsfree' && window.slMode && window.slMode.chosen()) voiceActivate(false);

// ── Compact mic status inside the concierge panel (Hands-free only) ────────

function VoiceBar() {
  const [v, setV] = useStateVoice(() => voiceSnapshot());
  useEffectVoice(() => {
    const onVoice = e => setV(e.detail);
    window.addEventListener('sl-voice', onVoice);
    setV(voiceSnapshot());
    return () => window.removeEventListener('sl-voice', onVoice);
  }, []);
  if (v.reason === 'legacy') return null; // Legacy: the panel is the plain typed concierge

  const st = v.state;
  let label, sub = '', subClass = '';
  if (st === 'unsupported') { label = v.speaking ? 'Speaking' : 'Typing mode'; sub = VOICE_MSG_UNSUPPORTED; subClass = ' is-note'; }
  else if (st === 'speaking') { label = 'Speaking'; sub = 'Mic paused while I talk'; }
  else if (st === 'listening') { label = 'Listening'; sub = 'Talk to me. Say “stop listening” to pause.'; }
  else if (st === 'hearing') { label = 'Hearing you'; sub = `“${v.interim}”`; subClass = ' is-interim'; }
  else if (st === 'paused') { label = 'Mic starting'; sub = 'One sec…'; }
  else {
    label = 'Mic off';
    sub = v.message || 'Or type below.';
    if (v.message) subClass = ' is-warn';
  }
  const showTap = st === 'off';
  const showStop = st === 'listening' || st === 'hearing' || st === 'paused';
  const wave = st === 'hearing' || st === 'speaking' || (st === 'unsupported' && v.speaking);

  return (
    <div className={'vc-bar is-' + st + (v.reason ? ' is-' + v.reason : '')} role="group" aria-label="Voice">
      <span className="vc-mic" aria-hidden="true">
        {wave ? <span className="vc-wave"><i/><i/><i/><i/></span> : <Icon name="mic" size={16}/>}
      </span>
      <div className="vc-text">
        <span className="vc-label" role="status">{label}</span>
        {sub && <span className={'vc-sub' + subClass}>{sub}</span>}
      </div>
      {showTap && (
        <button type="button" className="btn btn-primary vc-talk" onClick={() => slVoice.start()}>
          <Icon name="mic" size={16}/> Tap to talk
        </button>
      )}
      {showStop && (
        <button type="button" className="iconbtn vc-stop" onClick={() => slVoice.stop()} aria-label="Stop listening" title="Stop listening">
          <Icon name="pause" size={16}/>
        </button>
      )}
    </div>
  );
}

Object.assign(window, { slVoice, VoiceBar });
