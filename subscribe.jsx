/* global React */
// SUBSCRIBE: "Stock the fridge", the subscription builder as a mini game.
// Pick a fridge (the pack size), then fill its shelves from the dispenser:
//   tap a flavor to drop a bottle into the next free slot · hold it to rapid-fill
//   drag a flavor onto any slot (or a bottle onto another slot to swap, or off the fridge to toss)
//   tap an empty slot to place the armed flavor there · tap a bottle to pull it out
//   pull the lever to fill the rest at random · keys 1-6 add, Backspace undoes, R pulls the lever
// A shelf of one flavor is a STACK, a shelf of all-different flavors a RAINBOW; the more shelves
// that pattern, the higher the rank. When the fridge is full the door swings shut and locks the
// loadout in. Shares the fridge look (and the 3D bottle) with the cart in fridge.jsx.
const { useState: useStateS, useMemo: useMemoS, useEffect: useEffectS, useRef: useRefS, useLayoutEffect: useLayoutEffectS } = React;

const SUBSCRIBE_EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const SUBSCRIBE_SELECT_TRANSITION = ['border-color', 'background-color', 'box-shadow'].map(p => `${p} 160ms ${SUBSCRIBE_EASE_OUT}`).join(', ');
const SUB_MAX = 48;
const SUB_KEY = 'sl-sub-build-v2';
const SUB_MODELS = [
  { size: 6,  name: 'Mini',     cols: 3, slot: 118 },
  { size: 12, name: 'Standard', cols: 6, slot: 96 },
  { size: 24, name: 'Double',   cols: 6, slot: 80 },
  { size: 48, name: 'Walk-in',  cols: 6, slot: 60 },
];
const SUB_CADENCES = [
  { id: 'biweekly',  label: 'Every 2 weeks',  short: '2 WK', save: 22 },
  { id: 'monthly',   label: 'Every month',    short: '1 MO', save: 28, recommended: true },
  { id: 'quarterly', label: 'Every 3 months', short: '3 MO', save: 18 },
];
// Loadout stats per bottle (0-3): FOCUS, HYPE, CHILL, ZEST
const SUB_AXES = ['FOCUS', 'HYPE', 'CHILL', 'ZEST'];
const SUB_STATS = {
  'lemon-lime': [3, 1, 1, 3], cherry: [3, 2, 0, 2], 'blue-rasp': [1, 2, 3, 1],
  mango: [1, 3, 1, 2], grape: [2, 3, 0, 1], watermelon: [1, 0, 3, 2],
};
const SUB_CLASSES = ['Tactician', 'Rusher', 'Support', 'Flex'];
const SUB_PTS = { bottle: 10, stack: 40, rainbow: 60, all6: 100 };
const subImg = id => `assets/bottle/renders/card-${id}.webp`;
const subMoney = n => '$' + n.toFixed(2);
// Discounted price of one bottle in cents, rounded per bottle exactly like unitCents() in
// api/_lib/catalog.js, so the total shown here matches the Fridge and what the PayPal subscription bills.
const subUnitCents = (dollars, save) => Math.round(Math.round(dollars * 100) * (100 - save) / 100);
const subRand = (a, b) => a + Math.random() * (b - a);
const subPick = arr => arr[Math.floor(Math.random() * arr.length)];
const subShuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function subscribeUseMedia(query) {
  const [matches, setMatches] = useStateS(() => window.matchMedia(query).matches);
  useEffectS(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

// Eases a number (or array of numbers) toward its target (rolling score, radar shape).
function subscribeUseTween(target, ms = 420) {
  const [val, setVal] = useStateS(target);
  const from = useRefS(target);
  const cur = useRefS(target);
  useEffectS(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    from.current = cur.current;
    if (reduced) { cur.current = target; setVal(target); return; }
    let raf = 0; const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      const f = from.current;
      const v = Array.isArray(target) ? target.map((t, i) => f[i] + (t - f[i]) * e) : f + (target - f) * e;
      cur.current = v; setVal(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [Array.isArray(target) ? target.join(',') : target]);
  return val;
}

// Accessible single-select group: role=radiogroup, roving tabIndex, arrows move selection.
function SubscribeRadioGroup({ label, options, value, onChange, className, renderOption }) {
  const refs = useRefS([]);
  const selectedIndex = options.findIndex(o => o.value === value);
  const onKeyDown = (e, i) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const last = options.length - 1;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = i === last ? 0 : i + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = i === 0 ? last : i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault(); e.stopPropagation();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={className}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button key={o.value} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={checked}
            tabIndex={checked || (selectedIndex === -1 && i === 0) ? 0 : -1}
            className={checked ? 'is-on' : ''} onClick={() => onChange(o.value)} onKeyDown={e => onKeyDown(e, i)}>
            {renderOption(o, checked)}
          </button>
        );
      })}
    </div>
  );
}

// The armed flavor on a turntable: the live 3D bottle (drag to turn), still render until it loads.
function SubscribePedestal({ flavor }) {
  const hostRef = useRefS(null);
  const instRef = useRefS(null);
  const [ready, setReady] = useStateS(false);
  useEffectS(() => {
    let cancelled = false;
    const mount = () => {
      if (cancelled || instRef.current || !hostRef.current || !window.SL3D || !window.SL3D.supported) return;
      try {
        instRef.current = window.SL3D.create(hostRef.current, {
          id: flavor.id, juice: flavor.color, accent: flavor.accent, flavor: flavor.name, word: '', bg: null,
          base: [10, 18, 14], rest: 0, drag: true, interactive: false, frame: { x: 0, y: 0.05, fill: 0.9 },
        });
        Promise.resolve(instRef.current.whenReady).then(() => { if (!cancelled) { setReady(true); instRef.current && instRef.current.spin(); } });
      } catch (err) { instRef.current = null; }
    };
    if (window.SL3D) mount(); else window.addEventListener('sl3d-ready', mount, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('sl3d-ready', mount);
      if (instRef.current) { instRef.current.destroy(); instRef.current = null; }
    };
  }, []);
  useEffectS(() => {
    if (instRef.current) instRef.current.setFlavor({ id: flavor.id, juice: flavor.color, accent: flavor.accent, flavor: flavor.name });
  }, [flavor.id]);
  return (
    <div className="sb-pedestal" style={{ '--g': flavor.color }}>
      <img src={subImg(flavor.id)} alt="" className="sb-pedestal-img" style={{ opacity: ready ? 0 : 1 }}/>
      <div ref={hostRef} className="sb-pedestal-3d" style={{ opacity: ready ? 1 : 0 }}/>
      <div className="sb-pedestal-base" aria-hidden="true"/>
      <div className="sb-pedestal-tag"><span>ARMED</span><b style={{ color: flavor.color }}>{flavor.short}</b></div>
    </div>
  );
}

// 4-axis radar of the loadout's average stats.
function SubscribeRadar({ values, color }) {
  const R = 54, C = 70;
  const pts = values.map((v, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 2, r = (v / 3) * R;
    return `${(C + Math.cos(a) * r).toFixed(1)},${(C + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="sb-radar" viewBox="0 0 140 140" aria-hidden="true">
      {[1, 2, 3].map(k => (
        <polygon key={k} points={[0, 1, 2, 3].map(i => { const a = -Math.PI / 2 + i * Math.PI / 2, r = (k / 3) * R; return `${C + Math.cos(a) * r},${C + Math.sin(a) * r}`; }).join(' ')}
          fill="none" stroke="currentColor" strokeOpacity={k === 3 ? 0.22 : 0.1}/>
      ))}
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="currentColor" strokeOpacity="0.1"/>
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="currentColor" strokeOpacity="0.1"/>
      <polygon points={pts} fill={color} fillOpacity="0.28" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      {SUB_AXES.map((n, i) => {
        const a = -Math.PI / 2 + i * Math.PI / 2, x = C + Math.cos(a) * (R + 11), y = C + Math.sin(a) * (R + 11) + 3;
        return <text key={n} x={x} y={y} textAnchor="middle" className="sb-radar-l">{n}</text>;
      })}
    </svg>
  );
}

function subscribeLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(SUB_KEY) || 'null');
    if (s && Array.isArray(s.slots) && s.slots.length === SUB_MAX && SUB_MODELS.some(m => m.size === s.packSize)) {
      // Drop flavor ids that no longer exist, so a retired flavor can't count toward a full pack
      // and then vanish at checkout (an underfilled subscription).
      const known = new Set((window.FLAVORS || []).map(f => f.id));
      const slots = s.slots.map(id => (id && known.has(id) ? id : null));
      const cadence = SUB_CADENCES.some(c => c.id === s.cadence) ? s.cadence : 'monthly';
      return { ...s, slots, cadence };
    }
  } catch (e) { /* ignore */ }
  return null;
}

function SubscribePage({ onAdd, onSubscribe, onSync, fridgeSubs = [] }) {
  const flavors = window.FLAVORS;
  const byId = id => flavors.find(f => f.id === id);
  const saved = useMemoS(subscribeLoad, []);
  const fridgeSubBottles = fridgeSubs.reduce((s, i) => s + i.qty, 0);
  // Linked: this builder's pack is in the Fridge, so edits here update the Fridge (and emptying a
  // slot takes the pack out until the fridge is full again). Restored on a return visit only when
  // the Fridge still holds exactly this pack, so a pack the concierge built is never overwritten.
  const [linked, setLinked] = useStateS(() => {
    if (!saved || !saved.linked || !fridgeSubBottles) return false;
    const want = {};
    saved.slots.slice(0, saved.packSize).forEach(id => { if (id) want[`${id}--sub`] = (want[`${id}--sub`] || 0) + 1; });
    const n = Object.values(want).reduce((s, q) => s + q, 0);
    return n === saved.packSize && fridgeSubs.length === Object.keys(want).length
      && fridgeSubs.every(i => want[i.id] === i.qty && i.subscription === saved.cadence);
  });
  const pushed = useRefS(null); // what the last sync sent the Fridge: 'full' | 'empty'
  const [slots, setSlots] = useStateS(() => saved ? saved.slots : Array(SUB_MAX).fill(null));
  const [packSize, setPackSize] = useStateS(() => saved ? saved.packSize : 12);
  const [cadence, setCadence] = useStateS(() => saved ? saved.cadence : 'monthly');
  const [armed, setArmed] = useStateS('lemon-lime');
  const [doorOpen, setDoorOpen] = useStateS(true);
  const [pops, setPops] = useStateS([]);
  const [reel, setReel] = useStateS({});          // slot index -> flavor id shown while the lever spins
  const [hoverSlot, setHoverSlot] = useStateS(-1);
  const [flash, setFlash] = useStateS({});        // row index -> 'stack' | 'rainbow' (brief glow)
  const [pulled, setPulled] = useStateS(false);

  const isWide = subscribeUseMedia('(min-width: 900px)');
  const reduced = subscribeUseMedia('(prefers-reduced-motion: reduce)');
  const model = SUB_MODELS.find(m => m.size === packSize);
  const cols = model.cols;

  const cabRef = useRefS(null);
  const slotEls = useRefS({});
  const chipEls = useRefS({});
  const rowEls = useRefS({});
  const landing = useRefS(new Set());
  const history = useRefS([]);
  const combo = useRefS({ n: 0, t: 0 });
  const popId = useRefS(0);
  const slotsRef = useRefS(slots); slotsRef.current = slots;
  const doorRef = useRefS(doorOpen); doorRef.current = doorOpen;
  const reelRef = useRefS(reel); reelRef.current = reel;

  useEffectS(() => { try { localStorage.setItem(SUB_KEY, JSON.stringify({ slots, packSize, cadence, linked })); } catch (e) { /* ignore */ } }, [slots, packSize, cadence, linked]);

  // ── derived loadout ──
  const active = slots.slice(0, packSize);
  const filled = active.filter(Boolean).length;
  const remaining = packSize - filled;
  const isFull = remaining === 0;
  const picks = active.reduce((m, id) => { if (id) m[id] = (m[id] || 0) + 1; return m; }, {});
  const rows = [];
  for (let r = 0; r < packSize / cols; r++) rows.push(active.slice(r * cols, r * cols + cols));
  const rowKind = rows.map(row => {
    if (row.some(x => !x)) return null;
    if (row.every(x => x === row[0])) return 'stack';
    if (new Set(row).size === row.length) return 'rainbow';
    return null;
  });
  const stacks = rowKind.filter(k => k === 'stack').length;
  const rainbows = rowKind.filter(k => k === 'rainbow').length;
  const distinct = Object.keys(picks).length;
  const score = filled * SUB_PTS.bottle + stacks * SUB_PTS.stack + rainbows * SUB_PTS.rainbow + (distinct === 6 ? SUB_PTS.all6 : 0);
  const patternShare = rows.length ? (stacks + rainbows) / rows.length : 0;
  const rank = !isFull ? null : patternShare >= 1 ? 'S' : patternShare >= 0.5 ? 'A' : patternShare > 0 ? 'B' : 'C';
  const statAvg = SUB_AXES.map((_, i) => filled ? active.reduce((s, id) => s + (id ? SUB_STATS[id][i] : 0), 0) / filled : 0);
  const topAxis = statAvg.indexOf(Math.max(...statAvg));
  const spread = Math.max(...statAvg) - Math.min(...statAvg);
  const archetype = !filled ? 'Unranked' : spread < 0.6 ? 'All-Rounder' : SUB_CLASSES[topAxis];
  const mainFlavor = byId(Object.entries(picks).sort((a, b) => b[1] - a[1])[0]?.[0] || armed);
  const radar = subscribeUseTween(statAvg, 520);
  const shownScore = Math.round(subscribeUseTween(score, 600));
  const nextFree = active.findIndex(x => !x);

  const cad = SUB_CADENCES.find(c => c.id === cadence);
  // The bottles that become cart lines. checkout() builds its lines from this same list with the same
  // per-bottle rounding, and the totals add up whole cents, so the price shown here is the price the
  // Fridge and PayPal show.
  const subPicks = Object.entries(picks).map(([id, qty]) => ({ f: byId(id), qty })).filter(p => p.f && p.qty > 0);
  const baseCents = subPicks.reduce((s, p) => s + Math.round(p.f.price * 100) * p.qty, 0);
  const discountedCents = subPicks.reduce((s, p) => s + subUnitCents(p.f.price, cad.save) * p.qty, 0);
  const basePrice = baseCents / 100;
  const discounted = discountedCents / 100;
  const savings = (baseCents - discountedCents) / 100;

  // ── feedback bits ──
  const pop = (text, kind, x, y) => {
    const id = ++popId.current;
    setPops(p => [...p.slice(-6), { id, text, kind, x, y }]);
    setTimeout(() => setPops(p => p.filter(q => q.id !== id)), 950);
  };
  const cabPoint = el => {
    const c = cabRef.current && cabRef.current.getBoundingClientRect();
    const r = el && el.getBoundingClientRect();
    if (!c || !r) return { x: 50, y: 20 };
    return { x: ((r.left + r.width / 2 - c.left) / c.width) * 100, y: ((r.top - c.top) / c.height) * 100 };
  };
  const nudge = msg => {
    const el = cabRef.current;
    if (el && el.animate && !reduced) el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
    if (msg) pop(msg, 'warn', 50, 6);
  };
  const buzz = () => { if (navigator.vibrate && window.matchMedia('(pointer: coarse)').matches) navigator.vibrate(8); };

  // A bottle flies along an arc from `fromRect` to slot i, then lands with a squash.
  const fly = (id, fromRect, i, done) => {
    const slot = slotEls.current[i];
    if (!slot || !fromRect || reduced) { done && done(); return; }
    const to = slot.getBoundingClientRect();
    const node = document.createElement('img');
    node.src = subImg(id); node.alt = ''; node.className = 'sb-fly';
    node.style.width = to.width + 'px'; node.style.height = to.height + 'px';
    document.body.appendChild(node);
    const s0 = Math.max(0.3, fromRect.width / to.width);
    const x0 = fromRect.left + fromRect.width / 2 - to.width / 2, y0 = fromRect.top + fromRect.height / 2 - to.height / 2;
    const x1 = to.left, y1 = to.top, d = Math.hypot(x1 - x0, y1 - y0);
    const arc = Math.min(220, 60 + d * 0.32), spin = (x1 > x0 ? 1 : -1) * subRand(160, 260);
    const frames = [];
    for (let k = 0; k <= 14; k++) {
      const t = k / 14;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t - arc * 4 * t * (1 - t);
      frames.push({ transform: `translate(${x}px, ${y}px) rotate(${(spin * (1 - t)).toFixed(1)}deg) scale(${(s0 + (1 - s0) * t).toFixed(3)})` });
    }
    const a = node.animate(frames, { duration: Math.min(620, 360 + d * 0.35), easing: 'cubic-bezier(0.45, 0.05, 0.4, 1)' });
    a.onfinish = () => { node.remove(); done && done(); };
  };
  const land = i => {
    const img = slotEls.current[i] && slotEls.current[i].querySelector('img');
    landing.current.delete(i);
    if (!img) return;
    img.style.opacity = '';
    if (reduced || !img.animate) return;
    img.animate([
      { transform: 'translateY(-10px) scale(0.94, 1.08)' },
      { transform: 'translateY(0) scale(1.09, 0.86)', offset: 0.42 },
      { transform: 'scale(0.97, 1.04)', offset: 0.74 },
      { transform: 'none' },
    ], { duration: 380, easing: 'ease-out' });
    const row = rowEls.current[Math.floor(i / cols)];
    if (row && row.animate) row.animate([{ transform: 'none' }, { transform: 'translateY(2px)' }, { transform: 'none' }], { duration: 240, easing: 'ease-out' });
  };

  const comboHit = (el) => {
    const now = performance.now();
    combo.current = now - combo.current.t < 850 ? { n: combo.current.n + 1, t: now } : { n: 1, t: now };
    if (combo.current.n >= 3) { const p = cabPoint(el); pop(`COMBO ×${combo.current.n}`, 'combo', p.x, Math.max(2, p.y - 6)); }
  };

  // ── actions ──
  const place = (id, i, fromRect) => {
    const prev = slotsRef.current[i];
    landing.current.add(i);
    setSlots(s => { const n = s.slice(); n[i] = id; return n; });
    history.current = history.current.filter(x => x !== i).concat(i);
    setArmed(id); buzz();
    if (prev && prev !== id) { const p = cabPoint(slotEls.current[i]); pop('SWAP', 'info', p.x, p.y); }
    else comboHit(slotEls.current[i]);
    if (fromRect && !reduced) fly(id, fromRect, i, () => land(i)); else requestAnimationFrame(() => land(i));
  };
  const add = (id, fromEl) => {
    if (!doorRef.current) { nudge('DOOR LOCKED · TAP TO OPEN'); return false; }
    const i = slotsRef.current.slice(0, packSize).findIndex(x => !x);
    if (i < 0 || reelRef.current && Object.keys(reelRef.current).length) { nudge(i < 0 ? 'FRIDGE FULL' : null); return false; }
    place(id, i, fromEl ? (fromEl.querySelector('img') || fromEl).getBoundingClientRect() : null);
    return true;
  };
  const removeAt = (i, toss) => {
    const id = slotsRef.current[i];
    if (!id || !doorRef.current) return;
    const img = slotEls.current[i] && slotEls.current[i].querySelector('img');
    const from = img && img.getBoundingClientRect();
    setSlots(s => { const n = s.slice(); n[i] = null; return n; });
    history.current = history.current.filter(x => x !== i);
    if (!from || reduced) return;
    const chip = chipEls.current[id];
    const node = document.createElement('img');
    node.src = subImg(id); node.alt = ''; node.className = 'sb-fly';
    node.style.width = from.width + 'px'; node.style.height = from.height + 'px';
    document.body.appendChild(node);
    const x0 = from.left, y0 = from.top;
    let frames;
    if (toss || !chip) {
      frames = [{ transform: `translate(${x0}px, ${y0}px)`, opacity: 1 }, { transform: `translate(${x0 + subRand(-40, 40)}px, ${y0 + 140}px) rotate(${subRand(-120, 120)}deg) scale(0.6)`, opacity: 0 }];
    } else {
      const c = (chip.querySelector('img') || chip).getBoundingClientRect();
      const x1 = c.left + c.width / 2 - from.width / 2, y1 = c.top + c.height / 2 - from.height / 2, s1 = c.width / from.width;
      frames = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        frames.push({ transform: `translate(${x0 + (x1 - x0) * t}px, ${y0 + (y1 - y0) * t - 90 * 4 * t * (1 - t)}px) scale(${1 + (s1 - 1) * t}) rotate(${-200 * t}deg)`, opacity: t > 0.85 ? (1 - t) / 0.15 : 1 });
      }
    }
    const a = node.animate(frames, { duration: 460, easing: 'cubic-bezier(0.45, 0.05, 0.4, 1)' });
    a.onfinish = () => node.remove();
  };
  const swap = (i, j) => {
    if (i === j) return;
    setSlots(s => { const n = s.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; });
    [i, j].forEach(k => { landing.current.add(k); requestAnimationFrame(() => land(k)); });
  };
  const undo = () => {
    const i = history.current.filter(k => k < packSize && slotsRef.current[k]).pop();
    if (i != null) removeAt(i, false);
  };
  const clearAll = () => {
    if (!doorRef.current) setDoorOpen(true);
    const imgs = Object.keys(slotEls.current).map(k => slotEls.current[k] && slotEls.current[k].querySelector('img')).filter(Boolean);
    const finish = () => { setSlots(s => s.map((x, k) => (k < packSize ? null : x))); history.current = []; };
    if (reduced || !imgs.length) { finish(); return; }
    imgs.forEach((img, k) => img.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(40px) rotate(${subRand(-30, 30)}deg)`, opacity: 0 }],
      { duration: 280, delay: k * 12, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' }));
    setTimeout(() => { finish(); requestAnimationFrame(() => imgs.forEach(img => img.getAnimations().forEach(a => a.cancel()))); }, 280 + imgs.length * 12);
  };

  // Lever: empty shelves often come up as a STACK or a RAINBOW (jackpot), the rest is random.
  const pullLever = () => {
    if (Object.keys(reelRef.current).length) return;
    if (!doorRef.current) { nudge('DOOR LOCKED · TAP TO OPEN'); return; }
    const cur = slotsRef.current.slice(0, packSize);
    if (!cur.some(x => !x)) { nudge('FRIDGE FULL'); return; }
    setPulled(true); setTimeout(() => setPulled(false), 420);
    const ids = flavors.map(f => f.id);
    const plan = {};
    for (let r = 0; r < packSize / cols; r++) {
      const idx = Array.from({ length: cols }, (_, c) => r * cols + c);
      const empty = idx.filter(k => !cur[k]);
      if (!empty.length) continue;
      const roll = Math.random();
      if (empty.length === cols && roll < 0.45) { const f = subPick(ids); idx.forEach(k => { plan[k] = f; }); }
      else if (empty.length === cols && roll < 0.8) { const sh = subShuffle(ids); idx.forEach((k, c) => { plan[k] = sh[c % sh.length]; }); }
      else empty.forEach(k => { plan[k] = subPick(ids); });
    }
    const keys = Object.keys(plan).map(Number);
    if (reduced) { setSlots(s => { const n = s.slice(); keys.forEach(k => { n[k] = plan[k]; }); return n; }); history.current.push(...keys); return; }
    const t0 = performance.now();
    const stopAt = {}; keys.forEach((k, n) => { stopAt[k] = 380 + n * Math.max(22, 520 / keys.length) + subRand(0, 60); });
    setReel(Object.fromEntries(keys.map(k => [k, subPick(ids)])));
    const tick = () => {
      const now = performance.now() - t0;
      const done = keys.filter(k => now >= stopAt[k] && !landed.has(k));
      done.forEach(k => landed.add(k));
      if (done.length) {
        setSlots(s => { const n = s.slice(); done.forEach(k => { n[k] = plan[k]; }); return n; });
        history.current.push(...done);
        requestAnimationFrame(() => done.forEach(k => land(k)));
        buzz();
      }
      const left = keys.filter(k => !landed.has(k));
      setReel(left.length ? Object.fromEntries(left.map(k => [k, subPick(ids)])) : {});
      if (left.length) setTimeout(tick, 70);
    };
    const landed = new Set();
    setTimeout(tick, 70);
  };

  // ── row patterns: flash + points when a shelf completes ──
  const prevKinds = useRefS({ kinds: rowKind, size: packSize });
  useEffectS(() => {
    const prev = prevKinds.current;
    prevKinds.current = { kinds: rowKind, size: packSize };
    if (prev.size !== packSize) return;
    const fresh = {};
    rowKind.forEach((k, r) => { if (k && prev.kinds[r] !== k) fresh[r] = k; });
    if (!Object.keys(fresh).length) return;
    setFlash(f => ({ ...f, ...fresh }));
    setTimeout(() => setFlash(f => { const n = { ...f }; Object.keys(fresh).forEach(r => { delete n[r]; }); return n; }), 1100);
    Object.entries(fresh).forEach(([r, k]) => {
      const el = rowEls.current[r], c = cabRef.current;
      if (!el || !c) return;
      const rr = el.getBoundingClientRect(), cr = c.getBoundingClientRect();
      pop(k === 'stack' ? `STACK! +${SUB_PTS.stack}` : `RAINBOW! +${SUB_PTS.rainbow}`, k, 50, ((rr.top + rr.height * 0.35 - cr.top) / cr.height) * 100);
      if (k === 'rainbow' && window.SLGame) window.SLGame.achieve('rainbow');
    });
  }, [rowKind.join(','), packSize]);

  // ── door: swings shut when the last bottle goes in; any edit or a smaller fill reopens it ──
  const prevFill = useRefS({ filled, packSize });
  useEffectS(() => {
    const prev = prevFill.current;
    prevFill.current = { filled, packSize };
    if (!isFull) { setDoorOpen(true); return; }
    if (prev.filled < packSize && prev.packSize === packSize) {
      const t = setTimeout(() => {
        setDoorOpen(false);
        if (window.SLGame) window.SLGame.achieve('stocked');
      }, reduced ? 0 : 520);
      return () => clearTimeout(t);
    }
  }, [filled, packSize]);

  useEffectS(() => { if (rank === 'S' && window.SLGame) window.SLGame.achieve('srank'); }, [rank]);

  // ── keyboard: 1-6 add · Backspace undo · R lever ──
  useEffectS(() => {
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat && e.key.toLowerCase() === 'r') return;
      const t = e.target;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]') || t.closest('[aria-modal="true"]'))) return;
      if (document.querySelector('[aria-modal="true"]') && document.body.style.overflow === 'hidden') return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= flavors.length) { e.preventDefault(); add(flavors[n - 1].id, chipEls.current[flavors[n - 1].id]); }
      else if (e.key === 'Backspace') { e.preventDefault(); undo(); }
      else if (e.key.toLowerCase() === 'r') { e.preventDefault(); pullLever(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // ── pointer: tap / hold-to-fill / drag, shared by dispenser chips and stocked bottles ──
  const gesture = useRefS(null);
  const slotUnder = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const s = el && el.closest && el.closest('[data-slot]');
    const i = s ? Number(s.getAttribute('data-slot')) : -1;
    return i >= 0 && i < packSize ? i : -1;
  };
  const inCabinet = (x, y) => { const r = cabRef.current && cabRef.current.getBoundingClientRect(); return r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  const onPointerDown = (e, src) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const g = { src, el, x: e.clientX, y: e.clientY, dragging: false, held: false, ghost: null, hold: 0, rep: 0, id: e.pointerId };
    gesture.current = g;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (src.kind === 'chip') {
      g.hold = setTimeout(() => {
        if (gesture.current !== g || g.dragging) return;
        g.held = true;
        const step = () => { if (gesture.current !== g || !add(src.id, el)) return; g.rep = setTimeout(step, 130); };
        step();
      }, 380);
    }
  };
  const onPointerMove = e => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.dragging) {
      if (g.held || Math.hypot(e.clientX - g.x, e.clientY - g.y) < 7) return;
      if (g.src.kind === 'slot' && (!doorRef.current || !slotsRef.current[g.src.i])) return;
      if (g.src.kind === 'chip' && !doorRef.current) return;
      g.dragging = true; clearTimeout(g.hold);
      const id = g.src.kind === 'chip' ? g.src.id : slotsRef.current[g.src.i];
      g.dragId = id;
      const base = (g.el.querySelector('img') || g.el).getBoundingClientRect();
      const ghost = document.createElement('img');
      ghost.src = subImg(id); ghost.alt = ''; ghost.className = 'sb-ghost';
      const w = Math.max(48, Math.min(84, base.width * 1.15));
      ghost.style.width = w + 'px'; ghost.style.height = (w * 4 / 3) + 'px';
      document.body.appendChild(ghost);
      g.ghost = ghost; g.gw = w; g.lastX = e.clientX;
      if (g.src.kind === 'slot') { const img = g.el.querySelector('img'); if (img) img.style.opacity = '0.25'; }
      setArmed(id);
    }
    const tilt = Math.max(-18, Math.min(18, (e.clientX - g.lastX) * 1.6)); g.lastX = e.clientX;
    g.ghost.style.transform = `translate(${e.clientX - g.gw / 2}px, ${e.clientY - g.gw * 0.9}px) rotate(${tilt}deg) scale(1.05)`;
    const i = slotUnder(e.clientX, e.clientY);
    setHoverSlot(i);
  };
  const endGesture = (e, cancelled) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    clearTimeout(g.hold); clearTimeout(g.rep);
    setHoverSlot(-1);
    if (g.dragging) {
      const ghost = g.ghost, i = cancelled ? -1 : slotUnder(e.clientX, e.clientY);
      const gr = ghost.getBoundingClientRect();
      ghost.remove();
      if (g.src.kind === 'slot') { const img = g.el.querySelector('img'); if (img) img.style.opacity = ''; }
      if (Object.keys(reelRef.current).length) return;
      if (g.src.kind === 'chip') {
        if (i >= 0) place(g.src.id, i, gr);
        else if (!cancelled && inCabinet(e.clientX, e.clientY)) add(g.src.id, null);
      } else if (i >= 0) swap(g.src.i, i);
      else if (!cancelled && !inCabinet(e.clientX, e.clientY)) removeAt(g.src.i, true);
      return;
    }
    if (cancelled || g.held) return;
    if (g.src.kind === 'chip') add(g.src.id, g.el);
    else if (slotsRef.current[g.src.i]) removeAt(g.src.i, false);
    else if (!doorRef.current) nudge('DOOR LOCKED · TAP TO OPEN');
    else if (Object.keys(reelRef.current).length) return;
    else place(armed, g.src.i, chipEls.current[armed] ? (chipEls.current[armed].querySelector('img') || chipEls.current[armed]).getBoundingClientRect() : null);
  };
  const activate = (src, el) => {
    if (src.kind === 'chip') add(src.id, el);
    else if (slotsRef.current[src.i]) removeAt(src.i, false);
    else if (doorRef.current && !Object.keys(reelRef.current).length) place(armed, src.i, null);
  };
  const pointerProps = src => ({
    onPointerDown: e => onPointerDown(e, src),
    onPointerMove,
    onPointerUp: e => endGesture(e, false),
    onPointerCancel: e => endGesture(e, true),
    onKeyDown: e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); e.stopPropagation();
      activate(src, e.currentTarget);
    },
    // screen readers / switch access fire a bare click (detail 0) with no pointer events
    onClick: e => { if (e.detail === 0) activate(src, e.currentTarget); },
    onContextMenu: e => e.preventDefault(),
  });

  const packLines = () => subPicks.map(({ f, qty }) => (
    { ...f, qty, id: `${f.id}--sub`, price: subUnitCents(f.price, cad.save) / 100, sub: `SUB · ${cad.label.toUpperCase()} · −${cad.save}%`, subscription: cad.id }
  ));

  // Builder → Fridge: while linked, every edit replaces the Fridge's pack; an unfilled fridge takes it out.
  const packSig = subPicks.map(p => `${p.f.id}:${p.qty}`).join(',') + '|' + cadence + '|' + isFull;
  useEffectS(() => {
    if (!linked || !onSync) return;
    pushed.current = isFull ? 'full' : 'empty';
    onSync(isFull ? packLines() : []);
  }, [packSig, linked]);
  // Fridge → builder: once the Fridge's pack no longer matches the builder (subscribed in PayPal,
  // changed or removed in the Fridge, or rebuilt by the concierge), unlink so the builder never
  // overwrites it. "Add to Fridge" sends the builder's pack again.
  const fridgeSig = fridgeSubs.map(i => `${i.id.replace(/--sub$/, '')}:${i.qty}:${i.subscription}`).sort().join(',');
  useEffectS(() => {
    if (!linked || pushed.current !== 'full') return;
    const want = subPicks.map(p => `${p.f.id}:${p.qty}:${cadence}`).sort().join(',');
    if (fridgeSig !== want) { pushed.current = null; setLinked(false); }
  }, [fridgeSig]);

  // Adding the pack: a few bottles fly up into the header Fridge, then the pack lands in the Fridge,
  // which opens on the "Start subscription" (PayPal) step.
  const checkout = () => {
    const lines = packLines();
    const send = () => {
      pushed.current = 'full'; setLinked(true);
      if (onSubscribe) onSubscribe(lines); else lines.forEach(l => onAdd(l, l.qty));
    };
    if (linked || !window.SLGame || reduced) { send(); return; }
    const picksEls = subShuffle(Object.keys(slotEls.current).map(Number).filter(i => i < packSize && slotsRef.current[i])).slice(0, 3);
    setDoorOpen(true);
    Promise.all(picksEls.map((i, n) => new Promise(res => setTimeout(() => window.SLGame.loot(slotEls.current[i], subImg(slotsRef.current[i])).then(res), 120 + n * 110)))).then(send);
  };

  const modelOpts = SUB_MODELS.map(m => ({ ...m, value: m.size }));
  const armedF = byId(armed);
  const reelBusy = Object.keys(reel).length > 0;

  return (
    <>
      <section className="sb-hero" data-level="Loadout builder" data-screen-label="01 Subscribe Builder">
        <div className="hero-bg" style={{ opacity: 0.3 }}/>
        <div className="container-narrow" style={{ position: 'relative', textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 18, display: 'inline-flex' }}>// SUBSCRIBE · MINI GAME</div>
          <h1 className="display-lg" style={{ marginBottom: 16 }}>Stock the<br/><span style={{ color: 'var(--accent)' }}>perfect fridge.</span></h1>
          <p className="body-lg" style={{ maxWidth: 620, margin: '0 auto' }}>
            Fill every slot and that's your subscription. Line a shelf with one flavor for a <b className="sb-k-stack">STACK</b>,
            or every different flavor for a <b className="sb-k-rainbow">RAINBOW</b>. Pattern every shelf for S rank.
          </p>
        </div>
      </section>

      <section data-level="Stock the fridge" className="sb-section">
        <div className="container sb-stage">
          {/* ───────── Fridge + dispenser ───────── */}
          <div className="sb-left">
            <div className="sb-fridge">
              <div className="sb-fridge-top">
                <span className="mono-sm" style={{ color: 'var(--accent)' }}>FRIDGE MODEL</span>
                <SubscribeRadioGroup label="Fridge size (bottles per delivery)" options={modelOpts} value={packSize}
                  onChange={setPackSize} className="sb-models"
                  renderOption={o => (<><b>{o.size}</b><span>{o.name}</span></>)}/>
              </div>

              <div ref={cabRef} className={'sb-cabinet' + (doorOpen ? '' : ' is-shut')} style={{ '--cols': cols, '--slot': model.slot + 'px' }}>
                <div className="sb-led" aria-hidden="true"/>
                <div className="sb-shelves" key={packSize}>
                  {rows.map((row, r) => (
                    <div key={r} className={'sb-row' + (rowKind[r] ? ' is-' + rowKind[r] : '') + (flash[r] ? ' is-flash' : '')}
                      style={{ '--rc': rowKind[r] === 'stack' ? byId(row[0]).color : undefined }}>
                      <div ref={el => { rowEls.current[r] = el; }} className="sb-row-slots">
                        {row.map((id, c) => {
                          const i = r * cols + c;
                          const shown = reel[i] || id;
                          const f = shown && byId(shown);
                          const label = id ? `Shelf ${r + 1}, slot ${c + 1}: ${byId(id).name}. Press to remove, drag to move.`
                            : `Shelf ${r + 1}, slot ${c + 1}: empty. Press to place ${armedF.name}.`;
                          return (
                            <button key={i} type="button" data-slot={i} data-ghost-target={id ? '' : undefined}
                              ref={el => { slotEls.current[i] = el; }}
                              className={'sb-slot' + (id ? ' is-full' : '') + (i === nextFree && doorOpen && !reelBusy ? ' is-next' : '') + (hoverSlot === i ? ' is-hover' : '') + (reel[i] ? ' is-reel' : '')}
                              style={{ '--g': f ? f.color : armedF.color, animationDelay: `${Math.min(i * 10, 300)}ms` }}
                              aria-label={label} tabIndex={doorOpen ? 0 : -1} {...pointerProps({ kind: 'slot', i })}>
                              {f && <img src={subImg(shown)} alt="" draggable="false"
                                ref={img => { if (img && landing.current.has(i)) img.style.opacity = '0'; }}/>}
                              {!f && <span className="sb-slot-plus" aria-hidden="true"><Icon name="plus" size={12} stroke={2.2}/></span>}
                            </button>
                          );
                        })}
                      </div>
                      <div className="sb-shelf" aria-hidden="true"/>
                      {rowKind[r] && <span className="sb-row-badge" aria-hidden="true">{rowKind[r] === 'stack' ? 'STACK' : 'RAINBOW'}</span>}
                    </div>
                  ))}
                </div>

                {/* door: swings shut over a full fridge */}
                <button type="button" className="sb-door" onClick={() => setDoorOpen(true)} tabIndex={doorOpen ? -1 : 0}
                  aria-hidden={doorOpen} aria-label={`Loadout locked in, rank ${rank || ''}. Open the door to edit`}>
                  <span className="sb-door-handle" aria-hidden="true"/>
                  <span className="sb-door-stamp">
                    <span className="mono-sm">LOADOUT LOCKED IN</span>
                    <b className={'sb-rank sb-rank-' + (rank || 'C')}>{rank}</b>
                    <span className="sb-door-score">{score} PTS · {archetype.toUpperCase()}</span>
                    <span className="sb-door-open mono-sm">TAP TO OPEN</span>
                  </span>
                </button>

                <div className="sb-pops" aria-hidden="true">
                  {pops.map(p => <span key={p.id} className={'sb-pop sb-pop-' + p.kind} style={{ left: p.x + '%', top: p.y + '%' }}>{p.text}</span>)}
                </div>
              </div>

              <div className="sb-fridge-bar">
                <button type="button" className={'sb-lever' + (pulled ? ' is-pulled' : '')} onClick={pullLever} disabled={isFull || reelBusy}
                  aria-label="Surprise me: fill the empty slots at random (R)">
                  <span className="sb-lever-arm" aria-hidden="true"><i/></span>
                  <span><b>SURPRISE ME</b><small>PULL · R</small></span>
                </button>
                <span className="sb-count" aria-live="polite">
                  <b>{filled}</b>/{packSize}<small>{isFull ? 'FULL' : `${remaining} TO GO`}</small>
                </span>
                <button type="button" className="sb-ghostbtn" onClick={undo} disabled={!filled} aria-label="Undo last bottle (Backspace)">Undo</button>
                <button type="button" className="sb-ghostbtn" onClick={clearAll} disabled={!filled}>Empty</button>
              </div>
            </div>

            {/* dispenser */}
            <div className="sb-disp">
              {isWide && <SubscribePedestal flavor={armedF}/>}
              <div className="sb-disp-main">
                <div className="sb-disp-h">
                  <span className="mono-sm" style={{ color: 'var(--accent)' }}>DISPENSER</span>
                  <span className="mono-sm sb-disp-hint">TAP · HOLD TO RAPID-FILL · DRAG ONTO A SLOT</span>
                </div>
                <div className="sb-chips" role="group" aria-label="Flavors">
                  {flavors.map((f, n) => (
                    <button key={f.id} type="button" ref={el => { chipEls.current[f.id] = el; }}
                      className={'sb-chip' + (armed === f.id ? ' is-armed' : '')} style={{ '--g': f.color }}
                      aria-label={`Add ${f.name} (${n + 1}). ${picks[f.id] || 0} in the fridge`}
                      {...pointerProps({ kind: 'chip', id: f.id })}>
                      <img src={subImg(f.id)} alt="" draggable="false"/>
                      <span className="sb-chip-name">{f.short}</span>
                      <span className="sb-chip-key" aria-hidden="true">{n + 1}</span>
                      {picks[f.id] > 0 && <span className="sb-chip-n" aria-hidden="true">×{picks[f.id]}</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ───────── Loadout + checkout ───────── */}
          <div className="sb-right">
            <div className="sb-card sb-loadout">
              <div className="sb-card-h"><span className="mono-sm" style={{ color: 'var(--accent)' }}>// LOADOUT</span>
                <span className="mono-sm sb-score">SCORE <b>{String(shownScore).padStart(4, '0')}</b></span></div>
              <div className="sb-loadout-body">
                <SubscribeRadar values={radar} color={mainFlavor.color}/>
                <div className="sb-loadout-info">
                  <span className="mono-sm" style={{ color: 'var(--fg-3)' }}>CLASS</span>
                  <b className="sb-class" style={{ color: filled ? mainFlavor.color : 'var(--fg-3)' }}>{archetype}</b>
                  <div className="sb-rankrow">
                    <span className={'sb-rank sb-rank-sm sb-rank-' + (rank || 'none')}>{rank || '–'}</span>
                    <span className="mono-sm" style={{ color: 'var(--fg-3)' }}>{rank ? 'RANK' : 'RANK AT FULL'}</span>
                  </div>
                  <ul className="sb-patterns">
                    <li className={stacks ? 'is-on' : ''}><b>{stacks}</b> STACK{stacks === 1 ? '' : 'S'}</li>
                    <li className={rainbows ? 'is-on' : ''}><b>{rainbows}</b> RAINBOW{rainbows === 1 ? '' : 'S'}</li>
                    <li className={distinct === 6 ? 'is-on' : ''}><b>{distinct}</b>/6 FLAVORS</li>
                  </ul>
                </div>
              </div>
              <div className="sb-mix" aria-hidden="true">
                {flavors.map(f => picks[f.id] ? <i key={f.id} style={{ flexGrow: picks[f.id], background: f.color }}/> : null)}
                {remaining > 0 && <i className="is-empty" style={{ flexGrow: remaining }}/>}
              </div>
              <p className="sb-tip mono-sm">{
                !filled ? 'TIP · TAP A FLAVOR OR PULL THE LEVER' :
                !isFull ? `${rows.length - stacks - rainbows} SHELF${rows.length - stacks - rainbows === 1 ? '' : 'S'} WITHOUT A PATTERN · S RANK NEEDS ALL ${rows.length}` :
                rank === 'S' ? 'PERFECT LOADOUT · S RANK' : 'SWAP BOTTLES TO PATTERN MORE SHELVES'
              }</p>
            </div>

            <div className="sb-card">
              <div className="sb-card-h"><span className="mono-sm" style={{ color: 'var(--accent)' }}>// RESTOCK TIMER</span></div>
              <SubscribeRadioGroup label="Delivery cadence" options={SUB_CADENCES.map(c => ({ ...c, value: c.id }))} value={cadence}
                onChange={setCadence} className="sb-cad"
                renderOption={c => (<>{c.recommended && <em>BEST</em>}<b>{c.short}</b><span>{c.label}</span><small>SAVE {c.save}%</small></>)}/>
            </div>

            <div className="sb-card">
              <div className="sb-line"><span>Subtotal</span><span className="mono">{subMoney(basePrice)}</span></div>
              <div className="sb-line is-save"><span>Subscriber savings · {cad.save}%</span><span className="mono">−{subMoney(savings)}</span></div>
              <div className="sb-line is-total"><span>Per delivery</span><b>{subMoney(discounted)}</b></div>
              <button type="button" onClick={checkout} disabled={!isFull}
                className={'btn btn-xl sb-cta' + (isFull ? ' btn-primary' : '')}>
                {!isFull ? `Stock ${remaining} more`
                  : linked ? <>In your Fridge · Open it <Icon name="arrowR" size={16}/></>
                  : <>Add to Fridge <Icon name="arrowR" size={16}/></>}
              </button>
              <div className="mono-sm sb-fine">{linked && isFull ? 'Changes here update your Fridge' : 'Then start it in your Fridge'} · billed {cad.label.toLowerCase()} by PayPal · pause or cancel anytime</div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

window.SubscribePage = SubscribePage;
