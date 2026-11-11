#!/usr/bin/env node
// Price-drift check.
//
// Run before every merge: node scripts/check-prices.mjs
//
// Prices live in three places that must agree:
//   api/_lib/catalog.js  FLAVOR_PRICES (cents) and CADENCES (save %), used by the server to price PayPal orders
//   shell.jsx            FLAVORS (price in dollars), shown on the site and in the Fridge
//   subscribe.jsx        SUB_CADENCES (save %), shown on #/subscribe
//
// The script reads the two .jsx files as text (it never runs them), compares them with catalog.js,
// checks that the subscribe page rounds discounted bottles the same way as unitCents(), and exits 0
// when everything matches or 1 with a list of differences.
//
// It does not cover prices or discounts written into page copy (for example "SAVE 28%").
//
// Options:
//   --catalog <path>   check against another catalog.js (handy for testing the script itself)
//
// Plain Node, no dependencies.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const opts = { catalog: path.join(ROOT, 'api', '_lib', 'catalog.js') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--catalog') {
      const v = argv[++i];
      if (!v) fail('--catalog needs a path.');
      opts.catalog = path.resolve(v);
    } else if (a.startsWith('--catalog=')) {
      opts.catalog = path.resolve(a.slice('--catalog='.length));
    } else if (a === '-h' || a === '--help') {
      console.log('Usage: node scripts/check-prices.mjs [--catalog <path>]');
      process.exit(0);
    } else {
      fail(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function fail(msg) {
  console.error(`check-prices: ${msg}`);
  process.exit(1);
}

// Returns the source text of the array literal assigned to `const <name> = [ ... ];`.
// Walks the text so brackets inside strings and comments don't confuse it.
function arrayLiteral(src, name, file) {
  const m = new RegExp(`\\bconst\\s+${name}\\s*=\\s*\\[`).exec(src);
  if (!m) fail(`could not find "const ${name} = [" in ${file}.`);
  const start = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(src, i); continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; if (i <= 0) break; continue; }
    if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return src.slice(start, i + 1);
  }
  fail(`could not find the end of ${name} in ${file}.`);
}

function skipString(src, i) {
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === q) return j;
  }
  return src.length;
}

// Splits an array literal's text into the text of each top-level { ... } object.
function objectLiterals(arr) {
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 1; i < arr.length - 1; i++) {
    const c = arr[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(arr, i); continue; }
    if (c === '/' && arr[i + 1] === '/') { i = arr.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && arr[i + 1] === '*') { i = arr.indexOf('*/', i + 2) + 1; if (i <= 0) break; continue; }
    if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}' && --depth === 0) out.push(arr.slice(start, i + 1));
  }
  return out;
}

// Blanks out everything nested inside the object ({...}, [...], (...)) so only its own keys remain.
// Strings and comments are kept or blanked whole, so brackets inside them don't count.
function ownLevel(obj) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < obj.length; i++) {
    const c = obj[i];
    if (c === '"' || c === "'" || c === '`') {
      const end = skipString(obj, i);
      const s = obj.slice(i, end + 1);
      out += depth === 1 ? s : ' '.repeat(s.length);
      i = end;
      continue;
    }
    if (c === '/' && (obj[i + 1] === '/' || obj[i + 1] === '*')) {
      let end = obj[i + 1] === '/' ? obj.indexOf('\n', i) : obj.indexOf('*/', i + 2) + 1;
      if (end <= 0) end = obj.length - 1;
      out += ' '.repeat(end - i + 1);
      i = end;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') depth++;
    out += depth <= 1 ? c : ' ';
    if (c === '}' || c === ']' || c === ')') depth--;
  }
  return out;
}

// Reads one of the object's own fields: a quoted string or a plain number literal.
// Anything else (an expression, a variable) is treated as missing rather than guessed at.
function field(obj, key) {
  const m = new RegExp(`[{,]\\s*['"]?${key}['"]?\\s*:\\s*(?:'([^']*)'|"([^"]*)"|(-?[0-9]*\\.?[0-9]+))\\s*(?=[,}])`).exec(ownLevel(obj));
  if (!m) return undefined;
  if (m[3] !== undefined) return Number(m[3]);
  return m[1] !== undefined ? m[1] : m[2];
}

function readEntries(file, name, valueKey) {
  const rel = path.relative(ROOT, file) || file;
  let src;
  try { src = readFileSync(file, 'utf8'); } catch (e) { fail(`cannot read ${rel}: ${e.message}`); }
  const objs = objectLiterals(arrayLiteral(src, name, rel));
  if (!objs.length) fail(`${name} in ${rel} looks empty.`);
  return objs.map((o, n) => {
    const id = field(o, 'id');
    const value = field(o, valueKey);
    if (typeof id !== 'string') fail(`${name}[${n}] in ${rel} has no string id.`);
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${name} entry "${id}" in ${rel} has no numeric ${valueKey}.`);
    return { id, value };
  });
}

// Compares two id -> value maps and returns readable problem lines.
function diff({ label, left, leftName, right, rightName, fmt }) {
  const problems = [];
  for (const id of Object.keys(left)) {
    if (!(id in right)) problems.push(`  ${label} "${id}": in ${leftName} (${fmt(left[id])}) but missing from ${rightName}`);
    else if (left[id] !== right[id]) problems.push(`  ${label} "${id}": ${leftName} ${fmt(left[id])}  !=  ${rightName} ${fmt(right[id])}`);
  }
  for (const id of Object.keys(right)) {
    if (!(id in left)) problems.push(`  ${label} "${id}": in ${rightName} (${fmt(right[id])}) but missing from ${leftName}`);
  }
  return problems;
}

function duplicates(entries, name, file) {
  const seen = new Set();
  const out = [];
  for (const { id } of entries) {
    if (seen.has(id)) out.push(`  ${name} in ${file} lists "${id}" more than once`);
    seen.add(id);
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
const catalogRelRaw = path.relative(ROOT, opts.catalog);
// Short label for messages: repo-relative when inside the repo, otherwise just the file name.
const catalogRel = !catalogRelRaw || catalogRelRaw.startsWith('..') || path.isAbsolute(catalogRelRaw)
  ? `${path.basename(opts.catalog)} (--catalog)`
  : catalogRelRaw.split(path.sep).join('/');

let catalog;
try {
  catalog = createRequire(import.meta.url)(opts.catalog);
} catch (e) {
  fail(`cannot load ${opts.catalog}: ${String(e.message).split('\n')[0]}`);
}
const { FLAVOR_PRICES, CADENCES } = catalog;
if (!FLAVOR_PRICES || typeof FLAVOR_PRICES !== 'object') fail(`${catalogRel} does not export FLAVOR_PRICES.`);
if (!CADENCES || typeof CADENCES !== 'object') fail(`${catalogRel} does not export CADENCES.`);

const flavors = readEntries(path.join(ROOT, 'shell.jsx'), 'FLAVORS', 'price');
const cadences = readEntries(path.join(ROOT, 'subscribe.jsx'), 'SUB_CADENCES', 'save');

const serverCents = Object.fromEntries(Object.entries(FLAVOR_PRICES).map(([id, f]) => [id, f && f.cents]));
const siteCents = Object.fromEntries(flavors.map(f => [f.id, Math.round(f.value * 100)]));
const serverSave = Object.fromEntries(Object.entries(CADENCES).map(([id, c]) => [id, c && c.save]));
const siteSave = Object.fromEntries(cadences.map(c => [c.id, c.value]));

const money = c => (Number.isFinite(c) ? `$${(c / 100).toFixed(2)}` : String(c));
const pct = s => (Number.isFinite(s) ? `${s}%` : String(s));

// The subscribe page rounds each discounted bottle with subUnitCents(). Fed the server's own prices,
// it must give the same cents as unitCents() for every flavor and cadence, or the page and PayPal
// disagree even when the price lists match. Only that one-line arrow function is evaluated.
function roundingProblems() {
  if (typeof catalog.unitCents !== 'function') return [`  ${catalogRel} does not export unitCents()`];
  const src = readFileSync(path.join(ROOT, 'subscribe.jsx'), 'utf8');
  const m = /\bconst\s+subUnitCents\s*=\s*\(([^)]*)\)\s*=>\s*([^;\n]+);/.exec(src);
  if (!m) return ['  subscribe.jsx no longer defines "const subUnitCents = (dollars, save) => ...;" on one line, so its rounding cannot be checked'];
  // Only compile the expression if it is plain arithmetic over its own parameters and Math.round,
  // so a changed subscribe.jsx can never make this script run arbitrary code.
  const params = m[1].split(',').map(s => s.trim());
  const allowed = new Set([...params, 'Math', 'round']);
  const idents = m[2].match(/[A-Za-z_$][\w$]*/g) || [];
  if (!/^[\w$\s().*+\-/,]*$/.test(m[2]) || idents.some(id => !allowed.has(id))) {
    return ['  subscribe.jsx subUnitCents is no longer plain arithmetic (only its parameters, numbers, + - * / and Math.round), so its rounding cannot be checked safely'];
  }
  let siteUnit;
  try {
    siteUnit = new Function(...params, `return (${m[2]});`);
  } catch (e) {
    return [`  subscribe.jsx subUnitCents could not be read: ${e.message}`];
  }
  const out = [];
  for (const [fid, f] of Object.entries(FLAVOR_PRICES)) {
    for (const [cid, c] of Object.entries(CADENCES)) {
      const server = catalog.unitCents(fid, cid);
      const site = siteUnit(f.cents / 100, c.save);
      if (site !== server) out.push(`  rounding "${fid}" ${cid}: subscribe.jsx subUnitCents gives ${money(site)}, ${catalogRel} unitCents gives ${money(server)}`);
    }
  }
  return out;
}

const problems = [
  ...duplicates(flavors, 'FLAVORS', 'shell.jsx'),
  ...duplicates(cadences, 'SUB_CADENCES', 'subscribe.jsx'),
  ...flavors.filter(f => Math.abs(f.value * 100 - Math.round(f.value * 100)) > 1e-6)
    .map(f => `  flavor "${f.id}": shell.jsx price ${f.value} is not a whole number of cents`),
  ...diff({ label: 'flavor', left: serverCents, leftName: catalogRel, right: siteCents, rightName: 'shell.jsx FLAVORS', fmt: money }),
  ...diff({ label: 'cadence', left: serverSave, leftName: catalogRel, right: siteSave, rightName: 'subscribe.jsx SUB_CADENCES', fmt: pct }),
  ...roundingProblems(),
];

if (problems.length) {
  console.error(`check-prices: prices are OUT OF SYNC (${problems.length} problem${problems.length === 1 ? '' : 's'})`);
  console.error(problems.join('\n'));
  console.error(`Fix the site files or ${catalogRel} so they agree, then run this again.`);
  process.exit(1);
}

console.log(`check-prices: prices in sync. ${flavors.length} flavors, ${cadences.length} cadences (${catalogRel} = shell.jsx = subscribe.jsx).`);
