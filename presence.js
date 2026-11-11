/* Slime Lime presence: "players online" count + other players' ghost cursors.
 *
 * window.SLPresence
 *   mock                    true while the numbers are simulated (no backend yet)
 *   get()                   { online, here, history[] }
 *   subscribe(fn)           fn(state) on every change; returns an unsubscribe function
 *   ghosts(on?)             read / set whether ghost cursors show (persisted per browser)
 *   onGhosts(fn)            fn(on) when that setting changes; returns an unsubscribe function
 *
 * MOCK MODE. The count follows a daily curve (busiest around 9pm local, quietest in the morning)
 * with a small random walk, and the ghosts are scripted. To go live, replace `tickCount` with a
 * presence channel (e.g. Supabase Realtime presence or PartyKit) and drive `spawn()` from remote
 * cursor events instead of the scheduler. The UI only reads get()/subscribe(), so nothing else changes.
 *
 * Ghosts: a new one every ~4-9 s (often two together, up to 3 on screen), each around for ~5-10 s.
 * A ghost glides to something on the page (a card, a button, a heading), hovers, often drops a short
 * chat bubble about it, sometimes clicks, checks out a second thing, then fades away. The cursor look
 * (pointer + name/message bubble) is ported from the shadcn-style `Cursor` component.
 * They never take pointer events, stay away from your own cursor, pause while a dialog is open or
 * the tab is hidden, and are off under prefers-reduced-motion.
 */
(function () {
  var MOCK = true;
  var KEY_GHOSTS = 'sl-ghosts-v1', KEY_COUNT = 'sl-online-v1';
  var reducedMQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  var coarseMQ = window.matchMedia ? matchMedia('(pointer: coarse)') : null;
  var reduced = function () { return !!(reducedMQ && reducedMQ.matches); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  // ───────── Count ─────────
  // Busiest ~21:00 local (2,400), quietest ~09:00 (1,440).
  function baseline(d) {
    var h = d.getHours() + d.getMinutes() / 60;
    return 2400 * (0.6 + 0.4 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (h - 21) / 24)));
  }
  // Share of players on each part of the site ("here" in the popover).
  var ROUTE_SHARE = { '/': 0.034, '/flagship': 0.012, '/subscribe': 0.009, '/story': 0.007, '/faq': 0.004 };
  function routeShare() {
    var r = (location.hash.replace(/^#/, '') || '/').split('#')[0];
    var base = '/' + (r.split('/')[1] || '');
    return ROUTE_SHARE[base] || 0.006;
  }

  var state = { online: 0, here: 0, history: [] };
  var subs = [];
  function emit() { subs.forEach(function (fn) { try { fn(state); } catch (e) { /* listener error */ } }); }

  (function seed() {
    var now = new Date(), b = baseline(now), v = b * rnd(0.97, 1.03);
    try {
      var saved = JSON.parse(sessionStorage.getItem(KEY_COUNT) || 'null');
      // Reloads within a few minutes continue from the last number instead of jumping.
      if (saved && now - saved.t < 5 * 60 * 1000) v = saved.v;
    } catch (e) { /* storage unavailable */ }
    state.online = Math.round(v);
    state.here = Math.max(1, Math.round(state.online * routeShare() * rnd(0.85, 1.15)));
    for (var i = 0; i < 24; i++) state.history.push(Math.round(state.online + rnd(-30, 30)));
    state.history.push(state.online);
  })();

  function tickCount() {
    var b = baseline(new Date());
    var step = Math.round(rnd(-7, 7) + (b - state.online) * 0.04);   // random walk, pulled to the curve
    if (step === 0) step = Math.random() < 0.5 ? -1 : 1;
    state.online = Math.max(1, state.online + step);
    var target = state.online * routeShare();
    state.here = Math.max(1, Math.round(state.here + (target - state.here) * 0.35 + rnd(-1.5, 1.5)));
    state.history = state.history.concat(state.online).slice(-25);
    try { sessionStorage.setItem(KEY_COUNT, JSON.stringify({ v: state.online, t: Date.now() })); } catch (e) { /* ignore */ }
    emit();
    setTimeout(tickCount, rnd(2500, 5200));
  }
  setTimeout(tickCount, rnd(1800, 3200));
  window.addEventListener('hashchange', function () {
    state.here = Math.max(1, Math.round(state.online * routeShare() * rnd(0.85, 1.15)));
    emit();
  });

  // ───────── Ghost cursors ─────────
  var ghostsOn = true;
  try { ghostsOn = localStorage.getItem(KEY_GHOSTS) !== '0'; } catch (e) { /* default on */ }
  var ghostSubs = [];

  var TAGS = ['kovacs_77', 'mira.gg', 'voidstep', 'oxide__', 'frame_', 'lazerblue', 'pacing.exe', 'glitch.me',
    'peak_peak', 'noir.dev', 'sl1me.queen', 'fps_doug', 'tiltproof', 'respawn.jpg', 'lowping', 'byte_mage',
    'neonwolf', 'afk.not', 'crit.chance', 'hydra8', 'nightowl.tv', 'zer0lag'];
  var COLORS = ['#CAE00F', '#FF3D5C', '#3D8BFF', '#FF9A1F', '#B96BFF', '#FF6B8A', '#2ED3B7'];
  var SAY = {
    btn: ['copping a 12-pack', 'adding to fridge', 'subscribe or nah?', 'ok im in', 'restock time', 'cart go brrr'],
    card: ['this one slaps', 'cherry > all', 'grape is so underrated', 'mango for ranked', 'need this rn', 'the colors tho'],
    img: ['that label tho', 'clean bottle', 'drip check', 'looks so cold'],
    head: ['lol', 'real', 'facts', 'zero sugar??', 'locked in', 'gg'],
    any: ['where is free shipping', 'first time here', 'brb', 'ooh', 'saw this on stream', 'hydrate or diedrate'],
  };
  function line(el) {
    var k = /^(BUTTON|A)$/.test(el.tagName) || el.classList.contains('btn') ? 'btn'
      : el.matches('.cs-slot, article, .sl-tilt') ? 'card'
      : el.tagName === 'IMG' ? 'img'
      : /^H[12]$/.test(el.tagName) ? 'head' : 'any';
    return pick(Math.random() < 0.8 ? SAY[k] : SAY.any);
  }
  var TARGETS = '.cs-slot, article, .btn, .hero-dot, .hero-arrow, [data-ghost-target], h1, h2, .sl-tilt, img';

  var layer = null, live = [], mouse = { x: -9999, y: -9999 }, timer = 0, lastTags = [];
  window.addEventListener('pointermove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.className = 'sl-ghosts';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  }

  // Something modal is up (cart, menu panel, dialog): stay out of the way.
  function busy() {
    if (document.hidden) return true;
    if (document.body.style.overflow === 'hidden') return true;
    var d = document.querySelectorAll('[aria-modal="true"]');
    for (var i = 0; i < d.length; i++) {
      if (getComputedStyle(d[i]).visibility !== 'hidden' && d[i].getClientRects().length) return true;
    }
    return false;
  }

  function findTarget(avoid) {
    var vw = innerWidth, vh = innerHeight, list = document.querySelectorAll(TARGETS), ok = [];
    for (var i = 0; i < list.length && ok.length < 160; i++) {
      var el = list[i];
      if (el === avoid || (layer && layer.contains(el)) || el.closest('header, [aria-modal="true"], .sl-hud, .sl-toasts')) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 16) continue;
      // a point inside it, comfortably on screen
      var x = r.left + r.width * rnd(0.3, 0.7), y = r.top + r.height * rnd(0.3, 0.7);
      if (x < 40 || x > vw - 140 || y < 120 || y > vh - 60) continue;
      if (Math.hypot(x - mouse.x, y - mouse.y) < 240) continue;     // never on top of your cursor
      var w = /^(BUTTON|A)$/.test(el.tagName) || el.classList.contains('btn') ? 3 : el.matches('.cs-slot, article, .sl-tilt') ? 3 : 1;
      for (var k = 0; k < w; k++) ok.push({ el: el, x: x - r.left, y: y - r.top });
    }
    return ok.length ? pick(ok) : null;
  }

  // Cubic bezier through p0..p3.
  function bez(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
  }
  var easeInOut = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  // A natural, slightly curved stroke from a to b (positions relative to the anchor element).
  function stroke(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    var bend = rnd(-0.28, 0.28) * d;
    return {
      p0: a, p3: b,
      p1: { x: a.x + dx * 0.3 + nx * bend, y: a.y + dy * 0.3 + ny * bend },
      p2: { x: a.x + dx * 0.75 + nx * bend * 0.4, y: a.y + dy * 0.75 + ny * bend * 0.4 },
      ms: Math.min(1500, Math.max(520, d / 0.62)),
    };
  }

  function spawn() {
    if (live.length >= 3) return;
    var t1 = findTarget(null);
    if (!t1) return;
    ensureLayer();
    var tag = pick(TAGS.filter(function (t) { return lastTags.indexOf(t) < 0; }));
    lastTags = lastTags.concat(tag).slice(-6);
    var color = pick(COLORS);
    var node = document.createElement('div');
    node.className = 'sl-ghost';
    node.style.setProperty('--g', color);
    node.innerHTML =
      '<i class="sl-ghost-ring"></i>' +
      '<svg class="sl-ghost-arrow" width="18" height="18" viewBox="0 0 20 20" fill="none"><path fill="currentColor" d="M19.438 6.716 1.115.05A.832.832 0 0 0 .05 1.116L6.712 19.45a.834.834 0 0 0 1.557.025l3.198-8 7.995-3.2a.833.833 0 0 0 0-1.559h-.024Z"/></svg>' +
      '<span class="sl-ghost-body"><span class="sl-ghost-name"></span><span class="sl-ghost-msg"></span></span>';
    node.querySelector('.sl-ghost-name').textContent = '@' + tag;
    layer.appendChild(node);

    var anchor = t1.el, a0 = anchor.getBoundingClientRect();
    var end1 = { x: t1.x, y: t1.y };
    // start 220-380px away, from the side with more room
    var ang = rnd(0, Math.PI * 2), dist = rnd(220, 380);
    var start = { x: end1.x + Math.cos(ang) * dist, y: end1.y + Math.sin(ang) * dist };
    var talk = Math.random() < 0.7;
    var segs = [{ kind: 'move', s: stroke(start, end1) },
      { kind: 'hover', ms: talk ? rnd(2000, 3400) : rnd(900, 1800), click: Math.random() < 0.45, say: talk ? line(anchor) : null }];
    if (Math.random() < 0.55) {                  // sometimes checks out a second thing nearby
      var t2 = findTarget(anchor);
      if (t2) {
        var r2 = t2.el.getBoundingClientRect();
        var end2 = { x: r2.left - a0.left + t2.x, y: r2.top - a0.top + t2.y };
        if (Math.hypot(end2.x - end1.x, end2.y - end1.y) < 520) {
          var talk2 = !talk && Math.random() < 0.6;
          segs.push({ kind: 'move', s: stroke(end1, end2) },
            { kind: 'hover', ms: talk2 ? rnd(1800, 2800) : rnd(700, 1400), click: Math.random() < 0.35, say: talk2 ? line(t2.el) : null });
        }
      }
    }
    var last = segs[segs.length - 2].s.p3;
    var a = rnd(0, Math.PI * 2);
    segs.push({ kind: 'move', s: stroke(last, { x: last.x + Math.cos(a) * rnd(40, 90), y: last.y + Math.sin(a) * rnd(30, 70) }), out: true });

    var g = { node: node, anchor: anchor, a0: a0, segs: segs, i: 0, t0: performance.now(), pos: start, born: performance.now(), clicked: false };
    live.push(g);
    node.style.transform = 'translate3d(' + (a0.left + start.x).toFixed(1) + 'px,' + (a0.top + start.y).toFixed(1) + 'px,0)';
    node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    if (live.length === 1) requestAnimationFrame(frame);
  }

  function kill(g) {
    live.splice(live.indexOf(g), 1);
    var a = g.node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = function () { g.node.remove(); };
  }

  function frame(now) {
    for (var k = live.length - 1; k >= 0; k--) {
      var g = live[k], seg = g.segs[g.i], el = 0;
      if (!document.contains(g.anchor) || busy()) { kill(g); continue; }
      var dur = seg.kind === 'move' ? seg.s.ms : seg.ms;
      el = Math.min(1, (now - g.t0) / dur);
      if (seg.kind === 'move') {
        g.pos = bez(seg.s.p0, seg.s.p1, seg.s.p2, seg.s.p3, seg.out ? 1 - Math.pow(1 - el, 2) : easeInOut(el));
        if (seg.out) g.node.style.opacity = String(1 - el * 0.85);
      } else {
        if (seg.say && !seg.said && el > 0.12) { seg.said = true; say(g, seg.say); }
        if (seg.click && !seg.done && el > 0.45) { seg.done = true; click(g); }
      }
      // ride along with the element (scroll, pinned sections, layout shifts) + a little hand tremor
      var r = g.anchor.getBoundingClientRect();
      var jx = Math.sin(now / 170 + k) * 0.8, jy = Math.cos(now / 210 + k) * 0.8;
      var x = r.left + g.pos.x + jx, y = r.top + g.pos.y + jy;
      g.node.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      // keep the name tag on screen
      g.node.classList.toggle('is-flip', x > innerWidth - (g.wide || 150));
      if (el >= 1) {
        g.i++; g.t0 = now;
        if (g.i >= g.segs.length) { live.splice(k, 1); g.node.remove(); }
      }
    }
    if (live.length) requestAnimationFrame(frame);
  }

  // message bubble pops in under the name (the shadcn Cursor's name + message layout)
  function say(g, text) {
    var body = g.node.querySelector('.sl-ghost-body'), msg = g.node.querySelector('.sl-ghost-msg');
    msg.textContent = text;
    body.classList.add('has-msg');
    g.wide = Math.max(150, body.offsetWidth + 40);
    body.animate([{ transform: 'scale(0.92)', opacity: 0.6 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 240, easing: 'cubic-bezier(0.23,1,0.32,1)' });
  }

  function click(g) {
    var ring = g.node.querySelector('.sl-ghost-ring'), arrow = g.node.querySelector('.sl-ghost-arrow');
    ring.animate([{ transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }],
      { duration: 520, easing: 'cubic-bezier(0.23,1,0.32,1)' });
    arrow.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.82)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
  }

  function schedule(first) {
    clearTimeout(timer);
    if (!ghostsOn || reduced()) return;
    var slow = (coarseMQ && coarseMQ.matches) || innerWidth < 700 ? 1.3 : 1;
    var wait = first ? rnd(1500, 3000) : rnd(4000, 9000) * slow;
    timer = setTimeout(function () {
      if (!busy()) {
        spawn();
        if (Math.random() < 0.4) setTimeout(function () { if (!busy() && ghostsOn) spawn(); }, rnd(600, 2000));   // a duo
      }
      schedule(false);
    }, wait);
  }

  function setGhosts(on) {
    ghostsOn = !!on;
    try { localStorage.setItem(KEY_GHOSTS, ghostsOn ? '1' : '0'); } catch (e) { /* ignore */ }
    if (!ghostsOn) live.slice().forEach(kill);
    schedule(true);
    ghostSubs.forEach(function (fn) { try { fn(ghostsOn); } catch (e) { /* ignore */ } });
  }

  if (reducedMQ && reducedMQ.addEventListener) reducedMQ.addEventListener('change', function () { schedule(true); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) live.slice().forEach(kill); });
  if (document.readyState === 'complete') schedule(true); else window.addEventListener('load', function () { schedule(true); });

  window.SLPresence = {
    mock: MOCK,
    get: function () { return state; },
    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },
    ghosts: function (on) { if (arguments.length) setGhosts(on); return ghostsOn; },
    onGhosts: function (fn) { ghostSubs.push(fn); return function () { ghostSubs = ghostSubs.filter(function (f) { return f !== fn; }); }; },
    reducedMotion: reduced,
    _spawn: spawn,                                   // for testing
  };
})();
