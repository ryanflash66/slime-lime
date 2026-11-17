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

// The SDK's own default cloud model in hybrid mode, named here because the pack models set
// inCloudParams (for the JSON schema) and so must name a model.
const CLOUD_MODEL = 'gemini-3.5-flash-lite';

let ai = null;
let model = null;      // PREFER_ON_DEVICE: Nano when ready, cloud otherwise
let cloudModel = null; // ONLY_IN_CLOUD: the "Cloud only" switch, and the fallback when Nano stalls
try {
  const app = initializeApp(firebaseConfig);
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  ai = getAI(app, { backend: new GoogleAIBackend() });
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

// Runs one request on a { hybrid, cloud } model pair: on-device when Nano is ready, otherwise
// cloud Gemini through Firebase. { cloudOnly: true } skips Nano. Resolves to
// { response, source: 'on-device' | 'cloud', fellBack }; fellBack is true when Nano was ready
// but stalled or failed, so the cloud answered instead.
async function run(pair, prompt, { cloudOnly = false } = {}) {
  if (!pair.hybrid) throw new Error('Firebase AI did not load. Check the console.');
  if (!cloudOnly) initDevice(); // called from a click, so a pending download may start now
  let result = null;
  let fellBack = false;
  try {
    if (!cloudOnly && state.nano === 'available') {
      try {
        result = await withTimeout(pair.hybrid.generateContent(prompt), ON_DEVICE_TIMEOUT_MS);
        if (!result) console.warn(`[hybrid-ai] on-device answer took over ${ON_DEVICE_TIMEOUT_MS / 1000}s, asking the cloud`);
      } catch (err) {
        // A failed cloud request (the SDK routed this one to the cloud, e.g. App Check) would only
        // fail again, so it surfaces as is. Anything else came from Nano: ask the cloud.
        if (err && err.code === AIErrorCode.FETCH_ERROR) throw err;
        console.warn('[hybrid-ai] on-device answer failed, asking the cloud', err);
      }
      fellBack = !result;
    }
    if (!result) result = await (cloudOnly || fellBack ? pair.cloud : pair.hybrid).generateContent(prompt);
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
  return { response, source, fellBack };
}

// One free-text prompt. Resolves to { text, source, fellBack }.
async function ask(prompt, opts) {
  const { response, source, fellBack } = await run({ hybrid: model, cloud: cloudModel }, prompt, opts);
  return { text: response.text(), source, fellBack };
}

// ---------------------------------------------------------------------------------------------
// Vibe to Pack: a shopper's vibe ("chill, low sugar, 6") becomes a pack of real flavors.
// The model only picks flavor ids and bottle counts; every price is still set by the server at
// checkout. The same JSON schema (with an enum of the real flavor ids) constrains Nano
// (Prompt API responseConstraint) and the cloud (responseJsonSchema), and the answer is checked
// again here before it reaches the Fridge.

const PACK_DEFAULT_BOTTLES = 6;
const PACK_MAX_BOTTLES = 48;
const VIBE_MAX_CHARS = 200;

function lineupFlavors() {
  return (window.FLAVORS || []).map(f => ({ id: f.id, name: f.short || f.name, sub: f.sub || '', desc: f.desc || '' }));
}

function packSchema(ids) {
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        maxItems: ids.length,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: ids },
            qty: { type: 'integer', minimum: 1, maximum: PACK_MAX_BOTTLES },
          },
          required: ['id', 'qty'],
        },
      },
      why: { type: 'string' },
    },
    required: ['items', 'why'],
  };
}

let packPair = null;
let packPairKey = '';
// Built on first use: the flavor list comes from shell.jsx, which loads after this module.
function packModels(ids) {
  const key = ids.join(',');
  if (packPair && packPairKey === key) return packPair;
  if (!ai) return { hybrid: null, cloud: null };
  const schema = packSchema(ids);
  const inCloudParams = {
    model: CLOUD_MODEL,
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.4 },
  };
  packPair = {
    hybrid: getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams: { createOptions: ON_DEVICE_CREATE_OPTIONS, promptOptions: { responseConstraint: schema } },
      inCloudParams,
    }),
    cloud: getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams }),
  };
  packPairKey = key;
  return packPair;
}

// The bottle count the shopper asked for, if they named exactly one: "6 bottles", "a 12-pack",
// or a lone number like the 6 in "chill, low sugar, 6". "2am" or "3 flavors" don't count.
function requestedBottles(vibe) {
  const tagged = /(?<!\d)(\d+)\s*-?\s*(?:pack|bottles?|cans?|sodas?)\b/i.exec(vibe);
  let n = tagged ? Number(tagged[1]) : null;
  if (n == null) {
    const lone = vibe.match(/(?:^|[\s,;:])(\d+)(?=$|[\s,;:.!?])(?!\s*(?:flavou?rs?|kinds?|types?)\b)/gi) || [];
    if (lone.length === 1) n = Number(lone[0].replace(/\D/g, ''));
  }
  return n >= 1 ? Math.min(n, PACK_MAX_BOTTLES) : null;
}

// Scales the quantities so they add up to exactly `target`, keeping the model's proportions
// (largest remainder). Small models are often off by a few; the shopper's number wins.
function fitToTotal(lines, target) {
  if (lines.length > target) lines = [...lines].sort((a, b) => b.qty - a.qty).slice(0, target);
  const sum = lines.reduce((s, l) => s + l.qty, 0);
  const spare = target - lines.length; // every line keeps at least 1 bottle
  const raw = lines.map(l => (spare * l.qty) / sum);
  const out = lines.map((l, i) => ({ id: l.id, qty: 1 + Math.floor(raw[i]) }));
  let left = target - out.reduce((s, l) => s + l.qty, 0);
  raw.map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => { if (left > 0) { out[i].qty += 1; left -= 1; } });
  return out;
}

function parsePack(text, ids) {
  let data;
  try {
    data = JSON.parse(String(text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.items)) return null;
  const known = new Set(ids);
  const merged = new Map();
  for (const item of data.items) {
    const qty = Math.floor(Number(item && item.qty));
    if (!item || !known.has(item.id) || !(qty >= 1)) continue; // invented flavors and bad counts are dropped
    merged.set(item.id, Math.min(PACK_MAX_BOTTLES, (merged.get(item.id) || 0) + qty));
  }
  const lines = [...merged].map(([id, qty]) => ({ id, qty }));
  if (!lines.length) return null;
  const why = typeof data.why === 'string' ? data.why.trim().replace(/\s+/g, ' ').slice(0, 200) : '';
  return { lines, why };
}

function packPrompt(vibe, flavors, target) {
  const menu = flavors.map(f => `- ${f.id}: ${f.name} (${f.sub}). ${f.desc}`).join('\n');
  return [
    'You build soda packs for Slime Lime, a gaming soda. These are the only flavors:',
    menu,
    '',
    `The shopper's vibe: "${vibe}"`,
    '',
    'Pick 1 to 4 flavors that fit the vibe, and how many bottles of each.',
    `The bottle counts must add up to exactly ${target}.`,
    'Use only the flavor ids listed above. In "why", say in one short, upbeat sentence why the pack fits.',
    'Reply with JSON only, shaped like {"items":[{"id":"<flavor id>","qty":<bottles>}],"why":"<sentence>"}.',
  ].join('\n');
}

// Resolves to { lines: [{ id, qty }], why, bottles, source, fellBack }, or throws an Error whose
// message can be shown to the shopper.
async function vibeToPack(vibeText, opts) {
  const vibe = String(vibeText || '').replace(/[\r\n"]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, VIBE_MAX_CHARS);
  if (!vibe) throw new Error('Tell us a vibe first, like "chill, low sugar, 6".');
  const flavors = lineupFlavors();
  const ids = flavors.map(f => f.id);
  if (!ids.length) throw new Error('The flavor lineup has not loaded yet. Try again in a moment.');
  const target = requestedBottles(vibe) || PACK_DEFAULT_BOTTLES;
  const { response, source, fellBack } = await run(packModels(ids), packPrompt(vibe, flavors, target), opts);
  const pack = parsePack(response.text(), ids);
  if (!pack) throw new Error('That vibe didn’t turn into a pack. Try something like "chill, low sugar, 6".');
  const lines = fitToTotal(pack.lines, target);
  return { lines, why: pack.why, bottles: target, source, fellBack };
}

window.slHybrid = {
  get state() { return { ...state }; },
  ask,
  vibeToPack,
  initDevice,
  refreshNano,
};
window.dispatchEvent(new CustomEvent('sl-hybrid', { detail: { ...state } }));
refreshNano();
