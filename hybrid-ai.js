// Hybrid AI: Firebase AI Logic in the browser, on-device Gemini Nano first, cloud Gemini as fallback.
// Plain ES module (not Babel). The Firebase SDK comes from Google's CDN through the import map in
// `Slime Lime.html`. Exposes window.slHybrid and fires `sl-hybrid` on window whenever its status changes,
// so the Babel components can render the On-device / Cloud badge and the model download state.
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { AIErrorCode, getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource } from 'firebase/ai';

// Web config for Firebase project `slime-lime`. These values are public by design: App Check,
// not the API key, is what keeps other sites from spending this project's AI Logic quota.
const firebaseConfig = {
  apiKey: 'AIzaSyAuIQB5rU4wB4QolZ8svpksO6h-bD5enrI', // gitleaks:allow (public Firebase web key, not a secret)
  authDomain: 'slime-lime.firebaseapp.com',
  projectId: 'slime-lime',
  storageBucket: 'slime-lime.firebasestorage.app',
  messagingSenderId: '547055700626',
  appId: '1:547055700626:web:5cc7bbf4e81fe6d724344b',
};
const RECAPTCHA_ENTERPRISE_SITE_KEY = '6LcYKSQuAAAAAFugucEduuiGu2AkDItDEd47teB5';
const DEBUG_TOKEN_KEY = 'sl-appcheck-debug-token';

// Text in, text out, English. Matches what we ask Nano for, so the page-load availability check
// and the SDK's own check agree (the SDK default also expects image input).
const ON_DEVICE_CREATE_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const isLocal = LOCAL_HOSTS.includes(location.hostname);

// The reCAPTCHA Enterprise key only lists the Vercel domain, so local dev must use an App Check
// debug token. Register one in the Firebase console, then once per browser:
//   localStorage.setItem('sl-appcheck-debug-token', '<token>')
// With none set, the SDK makes a new token and prints it in the console for you to register.
if (isLocal) {
  let token = null;
  try { token = localStorage.getItem(DEBUG_TOKEN_KEY); } catch {}
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = token || true;
}

const state = {
  firebase: 'loading', // loading | ready | error
  nano: 'checking',    // checking | unsupported | unavailable | downloadable | downloading | available
  progress: null,      // 0..1 while the on-device model downloads, when Chrome reports it
  error: null,
};

function setState(patch) {
  Object.assign(state, patch);
  window.dispatchEvent(new CustomEvent('sl-hybrid', { detail: { ...state } }));
}

// How long an on-device answer may take before we give up on it and ask the cloud instead.
// Chrome can be slow to load Nano into memory, and a stuck call must never freeze the page.
const ON_DEVICE_TIMEOUT_MS = 20000;

let model = null;      // PREFER_ON_DEVICE: Nano when ready, cloud otherwise
let cloudModel = null; // ONLY_IN_CLOUD: the "Cloud only" switch, and the fallback when Nano stalls
try {
  const app = initializeApp(firebaseConfig);
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  model = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: ON_DEVICE_CREATE_OPTIONS },
  });
  cloudModel = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD });
  setState({ firebase: 'ready' });
} catch (err) {
  console.error('[hybrid-ai] Firebase failed to start', err);
  setState({ firebase: 'error', error: String(err && err.message || err) });
}

// Chrome's Prompt API. Missing in other browsers, and in Chrome without the Gemini Nano flag.
async function readNanoAvailability() {
  if (typeof self.LanguageModel === 'undefined') return 'unsupported';
  try { return await self.LanguageModel.availability(ON_DEVICE_CREATE_OPTIONS); }
  catch { return 'unavailable'; }
}

let pollTimer = null;
async function refreshNano() {
  const nano = await readNanoAvailability();
  setState({ nano, progress: nano === 'available' ? 1 : state.progress });
  // A download Chrome started on its own reports no progress to us, so poll until it lands.
  clearTimeout(pollTimer);
  if (nano === 'downloading') pollTimer = setTimeout(refreshNano, 4000);
  return nano;
}

let downloadPromise = null;
// Starts (or joins) the on-device model download. Chrome only allows this after a click or key press.
// Until it finishes, PREFER_ON_DEVICE answers from the cloud, so nothing waits on it.
function initDevice() {
  if (!model || downloadPromise) return downloadPromise || Promise.resolve();
  if (state.nano !== 'downloadable' && state.nano !== 'downloading') return Promise.resolve();
  setState({ nano: 'downloading', progress: state.progress ?? 0 });
  downloadPromise = model.initializeDeviceModel(p => setState({ nano: 'downloading', progress: p }))
    .catch(err => console.warn('[hybrid-ai] on-device download failed', err))
    .finally(() => { downloadPromise = null; refreshNano(); });
  return downloadPromise;
}

// Resolves to null after `ms`. The call it wraps can't be cancelled, so a late failure is swallowed.
function withTimeout(promise, ms) {
  let timer;
  promise.catch(() => {});
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise(resolve => { timer = setTimeout(() => resolve(null), ms); }),
  ]);
}

// One prompt, answered on-device when Nano is ready, otherwise by cloud Gemini through Firebase.
// { cloudOnly: true } skips Nano. Resolves to { text, source: 'on-device' | 'cloud', fellBack }.
// fellBack is true when Nano was ready but stalled or failed, so the cloud answered instead.
async function ask(prompt, { cloudOnly = false } = {}) {
  if (!model) throw new Error('Firebase AI did not load. Check the console.');
  if (!cloudOnly) initDevice(); // called from a click, so a pending download may start now
  let result = null;
  let fellBack = false;
  try {
    if (!cloudOnly && state.nano === 'available') {
      try {
        result = await withTimeout(model.generateContent(prompt), ON_DEVICE_TIMEOUT_MS);
        if (!result) console.warn(`[hybrid-ai] on-device answer took over ${ON_DEVICE_TIMEOUT_MS / 1000}s, asking the cloud`);
      } catch (err) {
        // A failed cloud request (the SDK routed this one to the cloud, e.g. App Check) would only
        // fail again, so it surfaces as is. Anything else came from Nano: ask the cloud.
        if (err && err.code === AIErrorCode.FETCH_ERROR) throw err;
        console.warn('[hybrid-ai] on-device answer failed, asking the cloud', err);
      }
      fellBack = !result;
    }
    if (!result) result = await (cloudOnly || fellBack ? cloudModel : model).generateContent(prompt);
  } catch (err) {
    const msg = String(err && err.message || err);
    if (/app check/i.test(msg)) {
      throw new Error(isLocal
        ? `App Check rejected this browser. Set a registered debug token: localStorage.setItem('${DEBUG_TOKEN_KEY}', '<token>'), then reload.`
        : 'App Check rejected this request, so the cloud model is off for this browser.');
    }
    throw err;
  }
  const response = result.response;
  const source = response.inferenceSource === InferenceSource.ON_DEVICE ? 'on-device' : 'cloud';
  return { text: response.text(), source, fellBack };
}

window.slHybrid = {
  get state() { return { ...state }; },
  ask,
  initDevice,
  refreshNano,
};
window.dispatchEvent(new CustomEvent('sl-hybrid', { detail: { ...state } }));
refreshNano();
