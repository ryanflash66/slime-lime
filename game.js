/* Slime Lime "game layer" — gamified scroll on top of motion.js (GSAP).
 *
 * window.SLGame (null without GSAP):
 *   pageIn(root)          called by SLMotion.pageIn inside its gsap.context: levels, counters, hero exit
 *   achieve(id)           unlock an achievement (toast + trophy count), persisted per browser
 *   loot(fromEl, src)     fly a bottle from fromEl into the header Fridge button; resolves on landing
 *
 * Global pieces: HUD (level + XP bar + trophies), level-up banner, velocity skew / speed lines /
 * ticker boost, Konami code "Slime Mode". Everything decorative is aria-hidden; toasts use a polite
 * live region. Under prefers-reduced-motion the HUD and achievements still work, motion does not.
 */
(function () {
  var M = window.SLMotion;
  if (!M) { window.SLGame = null; return; }
  var gsap = M.gsap, ST = M.ScrollTrigger;
  var plugins = [window.ScrambleTextPlugin, window.Physics2DPlugin, window.MotionPathPlugin].filter(Boolean);
  if (plugins.length) gsap.registerPlugin.apply(gsap, plugins);
  var canScramble = !!window.ScrambleTextPlugin;
  var GLYPHS = '01<>/\\|_#*+=';

  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function scramble(node, text, dur) {
    if (!node) return;
    if (canScramble && !M.reduced()) gsap.to(node, { duration: dur || 0.7, scrambleText: { text: text, chars: GLYPHS, speed: 0.6 }, overwrite: true });
    else node.textContent = text;
  }

  // ───────── Achievements ─────────
  var ACH = [
    { id: 'first',  code: 'FB', name: 'First Blood',    desc: 'Left the spawn point' },
    { id: 'scout',  code: 'FS', name: 'Flavor Scout',   desc: 'Inspected all six flavors' },
    { id: 'lore',   code: 'LM', name: 'Lore Master',    desc: 'Played the story to the end' },
    { id: 'speed',  code: 'SR', name: 'Speedrunner',    desc: 'Scrolled at ludicrous speed' },
    { id: 'loot',   code: 'LT', name: 'Looter',         desc: 'Picked up 3 bottles' },
    { id: 'end',    code: 'CP', name: 'Completionist',  desc: 'Reached the edge of the map' },
    { id: 'konami', code: '↑↑', name: 'Cheat Code',     desc: '↑ ↑ ↓ ↓ ← → ← → B A' },
  ];
  var KEY = 'sl-achievements-v1';
  var unlocked = {};
  try { unlocked = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { unlocked = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(unlocked)); } catch (e) { /* private mode */ } }
  function count() { return ACH.filter(function (a) { return unlocked[a.id]; }).length; }

  // ───────── HUD ─────────
  var hud = el('div', 'sl-hud');
  hud.innerHTML =
    '<div class="sl-hud-top" aria-hidden="true">' +
      '<span class="sl-hud-lvl">LVL <b>01</b></span>' +
      '<span class="sl-hud-name">SPAWN</span>' +
      '<span class="sl-hud-xp">XP <b>0000</b></span>' +
    '</div>' +
    '<div class="sl-hud-bar" aria-hidden="true"><i></i></div>' +
    '<button type="button" class="sl-hud-trophy" aria-expanded="false" aria-controls="sl-ach-panel">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7 3h10v2h3v3a5 5 0 0 1-4.6 5A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5 5 0 0 1 8.6 13 5 5 0 0 1 4 8V5h3V3Zm0 4H6v1a3 3 0 0 0 1.4 2.5A7 7 0 0 1 7 8V7Zm10 0v1c0 .9-.1 1.7-.4 2.5A3 3 0 0 0 18 8V7h-1Z"/></svg>' +
      '<span class="sl-hud-count">0/7</span><span class="sr-only"> achievements unlocked</span>' +
    '</button>' +
    '<div class="sl-ach-panel" id="sl-ach-panel" hidden></div>';
  var toasts = el('div', 'sl-toasts'); toasts.setAttribute('role', 'status'); toasts.setAttribute('aria-live', 'polite');
  var banner = el('div', 'sl-banner', '<span class="sl-banner-k"></span><span class="sl-banner-t"></span><i class="sl-banner-scan"></i>');
  banner.setAttribute('aria-hidden', 'true');
  var speed = el('div', 'sl-speed'); speed.setAttribute('aria-hidden', 'true');
  [speed, hud, toasts, banner].forEach(function (n) { document.body.appendChild(n); });

  var lvlB = hud.querySelector('.sl-hud-lvl b'), nameEl = hud.querySelector('.sl-hud-name'),
      xpB = hud.querySelector('.sl-hud-xp b'), barI = hud.querySelector('.sl-hud-bar i'),
      trophy = hud.querySelector('.sl-hud-trophy'), countEl = hud.querySelector('.sl-hud-count'),
      panel = hud.querySelector('.sl-ach-panel');

  function renderPanel() {
    countEl.textContent = count() + '/' + ACH.length;
    panel.innerHTML = '<div class="sl-ach-h">ACHIEVEMENTS · ' + count() + '/' + ACH.length + '</div>' + ACH.map(function (a) {
      var on = !!unlocked[a.id];
      return '<div class="sl-ach' + (on ? ' is-on' : '') + '"><span class="sl-ach-code">' + (on ? a.code : '??') + '</span>' +
        '<span><b>' + (on ? a.name : 'Locked') + '</b><small>' + (on ? a.desc : a.desc.replace(/[A-Za-z]/g, '·')) + '</small></span></div>';
    }).join('');
  }
  renderPanel();
  trophy.addEventListener('click', function () {
    var open = panel.hidden;
    panel.hidden = !open; trophy.setAttribute('aria-expanded', String(open));
    if (open && !M.reduced()) gsap.fromTo(panel.children, { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, stagger: 0.04, duration: 0.3, ease: 'power3.out' });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { panel.hidden = true; trophy.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('pointerdown', function (e) { if (!panel.hidden && !hud.contains(e.target)) { panel.hidden = true; trophy.setAttribute('aria-expanded', 'false'); } });

  function achieve(id) {
    var a = ACH.filter(function (x) { return x.id === id; })[0];
    if (!a || unlocked[id]) return;
    unlocked[id] = Date.now(); save(); renderPanel();
    var t = el('div', 'sl-toast',
      '<span class="sl-toast-code">' + a.code + '</span><span><small>ACHIEVEMENT UNLOCKED</small><b></b><em>' + a.desc + '</em></span>');
    toasts.appendChild(t);
    var nameB = t.querySelector('b');
    if (M.reduced()) {
      nameB.textContent = a.name;
      gsap.timeline({ onComplete: function () { t.remove(); } }).from(t, { autoAlpha: 0, duration: 0.2 }).to(t, { autoAlpha: 0, duration: 0.3 }, '+=3.2');
    } else {
      gsap.timeline({ onComplete: function () { t.remove(); } })
        .from(t, { xPercent: 115, duration: 0.55, ease: 'back.out(1.6)' })
        .from(t.querySelector('.sl-toast-code'), { rotation: -180, scale: 0, duration: 0.5, ease: 'back.out(2.5)' }, 0.2)
        .add(function () { scramble(nameB, a.name, 0.8); }, 0.25)
        .to(trophy, { scale: 1.25, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.out' }, 0.5)
        .to(t, { xPercent: 115, autoAlpha: 0, duration: 0.45, ease: 'power3.in' }, '+=3');
    }
  }

  // ───────── Levels + XP (rebuilt per page) ─────────
  var maxLevel = 0;
  function levelName(sec, i) {
    var n = sec.getAttribute('data-level');
    if (!n) n = (sec.getAttribute('data-screen-label') || '').replace(/^\d+\s*/, '') || ('ZONE ' + (i + 1));
    return n.toUpperCase();
  }
  function setLevel(i, name, announce) {
    lvlB.textContent = pad(i + 1, 2);
    scramble(nameEl, name, 0.6);
    if (i >= 1) achieve('first');
    if (!announce || i <= maxLevel) return;
    maxLevel = i;
    if (M.reduced()) return;
    var k = banner.querySelector('.sl-banner-k'), t = banner.querySelector('.sl-banner-t'), scan = banner.querySelector('.sl-banner-scan');
    k.textContent = 'LEVEL ' + pad(i + 1, 2); t.textContent = '';
    gsap.timeline({ overwrite: true })
      .set(banner, { autoAlpha: 1 })
      .fromTo(banner, { clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0% 0 0%)', duration: 0.35, ease: 'power4.out' })
      .fromTo(scan, { xPercent: -100 }, { xPercent: 100, duration: 0.6, ease: 'power2.inOut' }, 0)
      .add(function () { scramble(t, name, 0.7); }, 0.1)
      .to(banner, { clipPath: 'inset(0 50% 0 50%)', duration: 0.3, ease: 'power3.in' }, '+=1.1')
      .set(banner, { autoAlpha: 0 });
  }

  function pageIn(root) {
    maxLevel = 0;
    var secs = Array.prototype.filter.call(root.querySelectorAll('section'), function (s) {
      return !s.parentElement.closest('section') && (s.hasAttribute('data-level') || s.hasAttribute('data-screen-label'));
    });
    // de-dupe consecutive sections that share a label
    var levels = [];
    secs.forEach(function (s) { var n = levelName(s, levels.length); if (!levels.length || levels[levels.length - 1].name !== n) levels.push({ el: s, name: n }); else levels[levels.length - 1].end = s; });
    setLevel(0, levels.length ? levels[0].name : 'SPAWN', false);
    // A pinned section is measured through its pin-spacer, which carries the pinned scroll length.
    function box(n) { var p = n && n.parentElement; return p && p.classList.contains('pin-spacer') ? p : n; }
    levels.forEach(function (lv, i) {
      ST.create({
        trigger: box(lv.el), endTrigger: box(lv.end || lv.el), start: 'top 55%', end: 'bottom 55%',
        onToggle: function (self) { if (self.isActive) setLevel(i, lv.name, true); },
      });
    });

    // XP = how much of this map you've explored
    var setBar = gsap.quickSetter(barI, 'scaleX');
    ST.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        setBar(self.progress);
        xpB.textContent = pad(Math.round(self.progress * 1000), 4);
        if (self.progress > 0.985) achieve('end');
        velocity(self.getVelocity());
      },
    });

    // Scoreboard counters: <span data-count="75" data-suffix="mg" [data-from="99"]>
    Array.prototype.forEach.call(root.querySelectorAll('[data-count]'), function (node) {
      var to = parseFloat(node.getAttribute('data-count')), from = parseFloat(node.getAttribute('data-from') || '0');
      var suf = node.getAttribute('data-suffix') || '';
      if (M.reduced()) return;
      var o = { v: from };
      node.textContent = Math.round(from) + suf;
      gsap.to(o, {
        v: to, duration: 1.6, ease: 'power3.out', snap: { v: 1 },
        onUpdate: function () { node.textContent = o.v + suf; },
        onComplete: function () {
          gsap.fromTo(node, { textShadow: '0 0 0 transparent' }, { textShadow: '0 0 24px var(--accent-glow)', duration: 0.25, yoyo: true, repeat: 1 });
        },
        scrollTrigger: { trigger: node, start: 'top 88%', once: true },
      });
    });

    // Hero "warp out": copy lifts away and the stage sinks as you leave spawn.
    var heroCopy = root.querySelector('[data-hero-copy]');
    if (heroCopy && !M.reduced()) {
      var sec = heroCopy.closest('section');
      gsap.to(heroCopy, { yPercent: -18, autoAlpha: 0.1, filter: 'blur(6px)', ease: 'none',
        scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom 15%', scrub: true } });
      var stage = root.querySelector('[data-hero-stage]');
      if (stage) gsap.to(stage, { scale: 0.86, yPercent: 8, ease: 'none',
        scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom top', scrub: true } });
    }
  }

  // ───────── Velocity FX: skew, speed lines, ticker boost ─────────
  var docEl = document.documentElement;
  var fx = { v: 0 };
  var clampSkew = gsap.utils.clamp(-7, 7);
  function applyFx() {
    docEl.style.setProperty('--sl-skew', fx.v.toFixed(3) + 'deg');
    speed.style.opacity = Math.min(0.85, Math.abs(fx.v) / 7);
    var rate = 1 + Math.abs(fx.v) * 0.9;
    Array.prototype.forEach.call(document.querySelectorAll('.sl-ticker'), function (t) {
      (t.getAnimations ? t.getAnimations({ subtree: true }) : []).forEach(function (a) { a.playbackRate = rate; });
    });
  }
  function velocity(v) {
    if (M.reduced() || M.autoScrolling()) return;
    if (Math.abs(v) > 7000) achieve('speed');
    var s = clampSkew(v / -320);
    if (Math.abs(s) > Math.abs(fx.v)) {
      fx.v = s;
      gsap.to(fx, { v: 0, duration: 0.9, ease: 'power3', overwrite: true, onUpdate: applyFx });
    }
  }

  // ───────── Loot: bottle flies into the fridge ─────────
  var looted = 0;
  function loot(fromEl, src) {
    looted++;
    if (looted >= 3) achieve('loot');
    var btn = document.querySelector('header .btn-primary');
    if (!fromEl || !btn || M.reduced() || !window.MotionPathPlugin) return Promise.resolve();
    var a = fromEl.getBoundingClientRect(), b = btn.getBoundingClientRect();
    var img = el('img', 'sl-loot'); img.src = src; img.alt = '';
    var w = 64;
    img.style.cssText = 'left:' + (a.left + a.width / 2 - w / 2) + 'px;top:' + (a.top + a.height / 2 - w * 0.67) + 'px;width:' + w + 'px';
    document.body.appendChild(img);
    var dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    var plus = el('span', 'sl-plus', '+1');
    return new Promise(function (resolve) {
      gsap.timeline({ onComplete: function () { img.remove(); resolve(); } })
        .fromTo(img, { scale: 0.4, autoAlpha: 0 }, { scale: 1.2, autoAlpha: 1, duration: 0.16, ease: 'back.out(3)' })
        .to(img, {
          duration: 0.75, ease: 'power2.in', rotation: 540, scale: 0.35,
          motionPath: { path: [{ x: 0, y: 0 }, { x: dx * 0.35, y: Math.min(dy, 0) - 180 }, { x: dx, y: dy }], curviness: 1.3 },
        })
        .add(function () {
          btn.appendChild(plus);
          gsap.fromTo(btn, { scale: 1.22 }, { scale: 1, duration: 0.8, ease: 'elastic.out(1, 0.3)', clearProps: 'transform' });
          gsap.fromTo(plus, { y: 0, autoAlpha: 1 }, { y: -34, autoAlpha: 0, duration: 0.8, ease: 'power2.out', onComplete: function () { plus.remove(); } });
        });
    });
  }

  // ───────── Konami code → Slime Mode ─────────
  var SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var pos = 0;
  document.addEventListener('keydown', function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pos = k === SEQ[pos] ? pos + 1 : (k === SEQ[0] ? 1 : 0);
    if (pos === SEQ.length) { pos = 0; slimeMode(); }
  });
  var FLAV = ['lemon-lime', 'cherry', 'blue-rasp', 'mango', 'grape', 'watermelon'];
  function slimeMode() {
    achieve('konami');
    if (M.reduced() || !window.Physics2DPlugin) return;
    var layer = el('div', 'sl-rain'); layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    var flash = el('div', 'sl-slime-flash', '<b>SLIME MODE</b>'); layer.appendChild(flash);
    var tl = gsap.timeline({ onComplete: function () { layer.remove(); } });
    tl.fromTo(flash, { autoAlpha: 0, scale: 1.4 }, { autoAlpha: 1, scale: 1, duration: 0.25, ease: 'power4.out' }, 0)
      .add(function () { scramble(flash.querySelector('b'), 'SLIME MODE', 0.8); }, 0)
      .to(flash, { autoAlpha: 0, duration: 0.5 }, 1.6);
    gsap.fromTo('#root', { x: -10 }, { x: 0, duration: 0.6, ease: 'elastic.out(1.2, 0.15)', clearProps: 'transform' });
    for (var i = 0; i < 42; i++) {
      var b = el('img', 'sl-rain-b'); b.src = 'assets/bottle/renders/card-' + FLAV[i % FLAV.length] + '.webp'; b.alt = '';
      b.style.left = (window.innerWidth / 2 - 30) + 'px'; b.style.top = (window.innerHeight + 10) + 'px';
      layer.appendChild(b);
      tl.to(b, {
        duration: 2.6, ease: 'none', rotation: gsap.utils.random(-720, 720),
        physics2D: { velocity: gsap.utils.random(900, 1600), angle: gsap.utils.random(-125, -55), gravity: 1500 },
      }, i * 0.025);
    }
  }

  window.SLGame = { pageIn: pageIn, achieve: achieve, loot: loot };
})();
