#!/usr/bin/env node
// Subscription pricing check.
//
// Run before every merge: node scripts/check-sub-pricing.mjs
//
// priceSubscription() (what PayPal bills each cycle) must cost exactly what priceCart() charges
// for the same pack as '--sub' cart lines. This script checks that over many random packs and
// every cadence, and that each packCode (stored in the subscription's custom_id) decodes back to
// the same pack, re-prices to the same total, and stays within PayPal's 127-character limit,
// including for the longest pack the server accepts. It also checks that bad packs are refused.
//
// Exits 0 when everything holds, 1 with a list of failures otherwise.
// Options:
//   --runs <n>   random packs per cadence (default 2000)
//   --seed <n>   PRNG seed (default 691), so a failure can be replayed
//
// Plain Node, no dependencies.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const catalog = require('../api/_lib/catalog.js');
const { FLAVOR_PRICES, CADENCES, priceCart, priceSubscription, decodePackCode } = catalog;

// PayPal's custom_id limit is fixed here on purpose, so a wrong value in catalog.js can't hide.
const CUSTOM_ID_MAX = 127;
// The pack limits come from catalog.js, so raising them there is checked against custom_id here.
const MAX_LINES = catalog.MAX_LINES;
const MAX_QTY = catalog.MAX_QTY_PER_LINE;
if (!Number.isInteger(MAX_LINES) || !Number.isInteger(MAX_QTY)) {
  console.error('check-sub-pricing: catalog.js must export MAX_LINES and MAX_QTY_PER_LINE.');
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { runs: 2000, seed: 691 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [key, inline] = a.includes('=') ? a.split(/=(.*)/s) : [a, undefined];
    if (key === '--runs' || key === '--seed') {
      const v = Number(inline !== undefined ? inline : argv[++i]);
      if (!Number.isInteger(v) || v < 0) die(`${key} needs a whole number.`);
      opts[key.slice(2)] = v;
    } else if (a === '-h' || a === '--help') {
      console.log('Usage: node scripts/check-sub-pricing.mjs [--runs <n>] [--seed <n>]');
      process.exit(0);
    } else {
      die(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function die(msg) {
  console.error(`check-sub-pricing: ${msg}`);
  process.exit(1);
}

// Small deterministic PRNG (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const opts = parseArgs(process.argv.slice(2));
const rand = rng(opts.seed);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const flavorIds = Object.keys(FLAVOR_PRICES);
const cadenceIds = Object.keys(CADENCES);
const problems = []; // The first 50, for the report.
let failures = 0;
const report = (msg) => { failures++; if (problems.length < 50) problems.push(`  ${msg}`); };

const show = (lines) => JSON.stringify(lines);
const sameLines = (a, b) => Array.isArray(b) && a.length === b.length
  && a.every((l, i) => l.id === b[i].id && Number(l.qty) === b[i].qty);

function checkPack(lines, cadence) {
  let sub;
  try {
    sub = priceSubscription(lines, cadence);
  } catch (e) {
    report(`${cadence} ${show(lines)}: priceSubscription threw "${e.message}"`);
    return;
  }
  const cart = priceCart(lines.map((l) => ({ id: `${l.id}--sub`, qty: l.qty, subscription: cadence })));
  if (sub.totalCents !== cart.totalCents || sub.total !== cart.total) {
    report(`${cadence} ${show(lines)}: priceSubscription ${sub.total} (${sub.totalCents}c) != priceCart ${cart.total} (${cart.totalCents}c)`);
  }
  if (typeof sub.packCode !== 'string' || sub.packCode.length === 0 || sub.packCode.length > CUSTOM_ID_MAX) {
    report(`${cadence} ${show(lines)}: packCode "${sub.packCode}" is not 1-${CUSTOM_ID_MAX} characters`);
  } else if (!/^[\x20-\x7E]+$/.test(sub.packCode)) {
    report(`${cadence} ${show(lines)}: packCode "${sub.packCode}" has characters PayPal's custom_id refuses`);
  }
  const decoded = decodePackCode(sub.packCode);
  if (!sameLines(lines, decoded)) {
    report(`${cadence} ${show(lines)}: packCode "${sub.packCode}" decodes to ${show(decoded)}`);
    return;
  }
  const again = priceSubscription(decoded, cadence);
  if (again.totalCents !== sub.totalCents || again.packCode !== sub.packCode) {
    report(`${cadence} ${show(lines)}: decoded pack re-prices to ${again.total} "${again.packCode}", not ${sub.total} "${sub.packCode}"`);
  }
}

function expect400(label, fn) {
  try {
    fn();
    report(`${label}: was accepted, expected a 400`);
  } catch (e) {
    if (e.status !== 400) report(`${label}: threw ${e.status || 'no status'} "${e.message}", expected a 400`);
  }
}

let packs = 0;

// Random packs: 1-20 lines, any flavors (repeats allowed, as in the cart), qty 1-96.
for (const cadence of cadenceIds) {
  for (let r = 0; r < opts.runs; r++) {
    const n = int(1, MAX_LINES);
    const lines = Array.from({ length: n }, () => ({ id: pick(flavorIds), qty: int(1, MAX_QTY) }));
    checkPack(lines, cadence);
    packs++;
  }
  // Every flavor alone at the qty edges.
  for (const id of flavorIds) {
    for (const qty of [1, 6, 12, 24, MAX_QTY]) { checkPack([{ id, qty }], cadence); packs++; }
  }
}

// Worst case for custom_id length: the most lines, each at the largest quantity.
let longest = 0;
for (const cadence of cadenceIds) {
  const lines = Array.from({ length: MAX_LINES }, (_, i) => ({ id: flavorIds[i % flavorIds.length], qty: MAX_QTY }));
  checkPack(lines, cadence);
  packs++;
  longest = Math.max(longest, priceSubscription(lines, cadence).packCode.length);
}
if (longest > CUSTOM_ID_MAX) report(`worst-case packCode is ${longest} characters, over ${CUSTOM_ID_MAX}`);

// String quantities from JSON-ish clients still encode to the number.
checkPack([{ id: flavorIds[0], qty: '12' }], cadenceIds[0]);

// Refusals: same rules as priceCart.
const ok = { id: flavorIds[0], qty: 6 };
expect400('unknown cadence', () => priceSubscription([ok], 'weekly'));
expect400('missing cadence', () => priceSubscription([ok]));
expect400('prototype cadence', () => priceSubscription([ok], 'constructor'));
expect400('empty pack', () => priceSubscription([], cadenceIds[0]));
expect400('pack not an array', () => priceSubscription({ 0: ok }, cadenceIds[0]));
expect400('too many lines', () => priceSubscription(Array.from({ length: MAX_LINES + 1 }, () => ok), cadenceIds[0]));
expect400('qty 0', () => priceSubscription([{ ...ok, qty: 0 }], cadenceIds[0]));
expect400(`qty ${MAX_QTY + 1}`, () => priceSubscription([{ ...ok, qty: MAX_QTY + 1 }], cadenceIds[0]));
expect400('qty 1.5', () => priceSubscription([{ ...ok, qty: 1.5 }], cadenceIds[0]));
expect400('unknown flavor', () => priceSubscription([{ id: 'cola', qty: 6 }], cadenceIds[0]));
expect400('id already --sub', () => priceSubscription([{ id: `${flavorIds[0]}--sub`, qty: 6 }], cadenceIds[0]));
expect400('line without id', () => priceSubscription([{ qty: 6 }], cadenceIds[0]));
expect400('null line', () => priceSubscription([null], cadenceIds[0]));
// Names inherited from Object.prototype are not flavors or cadences, in either pricer.
for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
  expect400(`prototype cadence "${name}"`, () => priceSubscription([ok], name));
  expect400(`prototype flavor "${name}"`, () => priceSubscription([{ id: name, qty: 6 }], cadenceIds[0]));
  expect400(`priceCart prototype cadence "${name}"`, () => priceCart([{ id: `${flavorIds[0]}--sub`, qty: 6, subscription: name }]));
  expect400(`priceCart prototype flavor "${name}"`, () => priceCart([{ id: name, qty: 6 }]));
  expect400(`priceCart prototype sub flavor "${name}"`, () => priceCart([{ id: `${name}--sub`, qty: 6, subscription: cadenceIds[0] }]));
}

// Malformed pack codes decode to null and never throw.
for (const bad of ['', 'lm', 'lm0', 'lm06', 'zz6', 'lm6.', '.lm6', 'lm6..ch4', 'LM6', 'lm6,ch4', 'lm-1', 'lm1000', 'x'.repeat(200), null, 42, {}]) {
  let out;
  try { out = decodePackCode(bad); } catch (e) { report(`decodePackCode(${JSON.stringify(bad)}) threw "${e.message}"`); continue; }
  if (out !== null) report(`decodePackCode(${JSON.stringify(bad)}) gave ${show(out)}, expected null`);
}

if (failures) {
  console.error(`check-sub-pricing: FAILED (${failures} problem${failures === 1 ? '' : 's'}, seed ${opts.seed})`);
  console.error(problems.join('\n'));
  if (failures > problems.length) console.error(`  ... and ${failures - problems.length} more`);
  process.exit(1);
}

console.log(`check-sub-pricing: ok. ${packs} packs over ${cadenceIds.length} cadences price the same as the cart; `
  + `packCodes round-trip; longest packCode ${longest}/${CUSTOM_ID_MAX} characters.`);
