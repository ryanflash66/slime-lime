/* Slime Lime motion layer (GSAP 3 + ScrollTrigger + ScrollToPlugin).
 *
 * window.SLMotion (null when GSAP failed to load — every caller falls back to plain behavior):
 *   cover()          -> Promise, resolves once the route curtain hides the page
 *   uncover()        -> slides the curtain away
 *   pageIn(root)     -> scroll reveals + parallax for one page; returns a cleanup fn
 *   scrollTo(target) -> eased scroll to an element/selector/y, offset by the sticky header
 * Hover (delegated, fine pointers only, off under reduced motion):
 *   .btn-primary / .btn-secondary / [data-magnetic]  magnetic pull toward the cursor
 *   .sl-tilt                                         3D tilt + glare toward the cursor
 * Markup hooks: [data-no-reveal] opts a subtree out of reveals, [data-reveal] opts an element in,
 * [data-parallax="0.2"] drifts an (oversized) element against the scroll.
 */
(function () {
  var gsap = window.gsap;
  if (!gsap || !window.ScrollTrigger) { window.SLMotion = null; return; }
  var ST = window.ScrollTrigger;
  gsap.registerPlugin(ST, window.ScrollToPlugin);
  // GSAP owns smooth scrolling now; CSS smooth scrolling would fight every scrollTo.
  document.documentElement.style.scrollBehavior = 'auto';

  function mq(q) { return window.matchMedia && window.matchMedia(q).matches; }
  function reduced() { return mq('(prefers-reduced-motion: reduce)'); }
  function finePointer() { return mq('(hover: hover) and (pointer: fine)'); }

  // ───────── Route curtain ─────────
  var curtain = document.createElement('div');
  curtain.className = 'sl-curtain';
  curtain.setAttribute('aria-hidden', 'true');
  curtain.innerHTML =
    '<div class="sl-curtain-panel sl-curtain-accent"></div>' +
    '<div class="sl-curtain-panel sl-curtain-ink">' +
      '<img class="sl-curtain-mark" src="assets/mark-slime.png" alt="" width="72" height="72"/>' +
      '<span class="sl-curtain-label">LOADING&nbsp;·&nbsp;SL</span>' +
    '</div>';
  (document.body || document.documentElement).appendChild(curtain);
  var accent = curtain.children[0], ink = curtain.children[1];
  var mark = ink.querySelector('.sl-curtain-mark'), label = ink.querySelector('.sl-curtain-label');
  gsap.set(curtain, { autoAlpha: 0 });

  var state = 'idle', tl = null, coverPromise = null;

  function cover() {
    if (state === 'covered') return Promise.resolve();
    if (state === 'covering') return coverPromise;
    if (tl) tl.kill();
    state = 'covering';
    coverPromise = new Promise(function (resolve) {
      var done = function () { state = 'covered'; resolve(); };
      if (reduced()) {
        gsap.set([accent], { yPercent: 0, autoAlpha: 0 });
        gsap.set([ink], { yPercent: 0, autoAlpha: 1 });
        gsap.set([mark, label], { autoAlpha: 0 });
        tl = gsap.timeline({ onComplete: done }).to(curtain, { autoAlpha: 1, duration: 0.14, ease: 'none' });
        return;
      }
      gsap.set(curtain, { autoAlpha: 1 });
      gsap.set([accent, ink], { autoAlpha: 1 });
      tl = gsap.timeline({ onComplete: done })
        .fromTo(accent, { yPercent: 100 }, { yPercent: 0, duration: 0.42, ease: 'power4.inOut' }, 0)
        .fromTo(ink, { yPercent: 100 }, { yPercent: 0, duration: 0.42, ease: 'power4.inOut' }, 0.07)
        .fromTo(mark, { autoAlpha: 0, scale: 0.6, rotation: -20 }, { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.3, ease: 'back.out(2)' }, 0.3)
        .fromTo(label, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.2, ease: 'power2.out' }, 0.34);
    });
    return coverPromise;
  }

  function uncover() {
    if (state === 'idle' || state === 'uncovering') return;
    var from = state;
    if (tl) tl.kill();
    state = 'uncovering';
    var done = function () { state = 'idle'; gsap.set(curtain, { autoAlpha: 0 }); };
    if (reduced()) {
      tl = gsap.timeline({ onComplete: done }).to(curtain, { autoAlpha: 0, duration: 0.2, ease: 'none' });
      return;
    }
    // If a cover was cut short, finish quickly from wherever it is.
    var lag = from === 'covered' ? 0.12 : 0;
    tl = gsap.timeline({ onComplete: done, delay: lag })
      .to([mark, label], { autoAlpha: 0, y: -8, duration: 0.18, ease: 'power2.in' }, 0)
      .to(ink, { yPercent: -100, duration: 0.5, ease: 'power4.inOut' }, 0.06)
      .to(accent, { yPercent: -100, duration: 0.5, ease: 'power4.inOut' }, 0.14);
  }

  // ───────── Scroll reveals + parallax ─────────
  var REVEAL = '.eyebrow, h1, h2, .display-xl, .display-lg, .h1, .h2, .body-lg, article, [data-reveal]';

  function pageIn(root) {
    if (!root) return function () {};
    var ctx = gsap.context(function () {
      if (!reduced()) {
        var all = Array.prototype.slice.call(root.querySelectorAll(REVEAL));
        var targets = all.filter(function (el) {
          if (el.closest('[data-no-reveal]')) return false;
          // a heading inside a revealed card rides along with its card
          var p = el.parentElement && el.parentElement.closest(REVEAL);
          return !(p && root.contains(p));
        });
        if (targets.length) {
          targets.forEach(function (el) { el.classList.add('sl-rv'); });
          gsap.set(targets, { autoAlpha: 0, '--rv': '28px' });
          var born = performance.now();
          ST.batch(targets, {
            start: 'top 92%',
            once: true,
            onEnter: function (batch) {
              // first screen of a new page waits for the curtain to clear
              var first = performance.now() - born < 120;
              gsap.to(batch, {
                autoAlpha: 1, '--rv': '0px', duration: 0.9, ease: 'expo.out',
                stagger: 0.075, delay: first ? 0.32 : 0, overwrite: true,
                clearProps: 'opacity,visibility,--rv',
              });
            },
          });
        }
        Array.prototype.forEach.call(root.querySelectorAll('[data-parallax]'), function (el) {
          var k = parseFloat(el.getAttribute('data-parallax')) || 0.15;
          gsap.fromTo(el, { yPercent: -k * 50 }, {
            yPercent: k * 50, ease: 'none',
            scrollTrigger: { trigger: el.parentElement || el, start: 'top bottom', end: 'bottom top', scrub: true },
          });
        });
      }
    }, root);
    // Web fonts and late images can shift layout after the triggers were measured.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ST.refresh(); });
    return function () { ctx.revert(); };
  }

  function scrollTo(target, opts) {
    opts = opts || {};
    var header = document.querySelector('header');
    var off = header ? header.offsetHeight : 0;
    if (opts.instant || reduced()) {
      var el = typeof target === 'string' ? document.querySelector(target) : target;
      var y = typeof target === 'number' ? target : (el ? el.getBoundingClientRect().top + window.scrollY - off : 0);
      window.scrollTo({ top: y, behavior: 'instant' });
      return;
    }
    gsap.to(window, { duration: opts.duration || 1.1, ease: 'power3.inOut', overwrite: 'auto',
      scrollTo: { y: target, offsetY: typeof target === 'number' ? 0 : off, autoKill: true } });
  }

  // ───────── Hover: magnetic buttons + tilt ─────────
  var MAGNET = '.btn-primary, .btn-secondary, [data-magnetic]';
  var movers = new WeakMap();
  var UNITS = { '--mx': 'px', '--my': 'px', '--tx': 'deg', '--ty': 'deg', '--gx': '%', '--gy': '%', '--ga': '' };
  function moverFor(el, props) {
    var m = movers.get(el);
    if (!m) {
      m = {};
      props.forEach(function (p) { m[p] = gsap.quickTo(el, p, { duration: 0.45, ease: 'power3.out', unit: UNITS[p] }); });
      movers.set(el, m);
    }
    return m;
  }

  var activeMagnet = null, activeTilt = null;
  function release(el, props, ease) {
    var to = { duration: 0.7, ease: ease, overwrite: true };
    props.forEach(function (p) { to[p] = '0' + UNITS[p]; });
    movers.delete(el);
    gsap.to(el, to);
  }

  document.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || reduced() || !finePointer()) return;
    var t = e.target instanceof Element ? e.target : null;

    var mag = t && t.closest(MAGNET);
    if (mag && mag.disabled) mag = null;
    if (activeMagnet && activeMagnet !== mag) { release(activeMagnet, ['--mx', '--my'], 'elastic.out(1, 0.4)'); activeMagnet = null; }
    if (mag) {
      activeMagnet = mag;
      var r = mag.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      var m = moverFor(mag, ['--mx', '--my']);
      m['--mx'](Math.max(-10, Math.min(10, dx * 0.22)));
      m['--my'](Math.max(-7, Math.min(7, dy * 0.3)));
    }

    var tilt = t && t.closest('.sl-tilt');
    if (activeTilt && activeTilt !== tilt) { releaseTilt(activeTilt); activeTilt = null; }
    if (tilt) {
      activeTilt = tilt;
      var b = tilt.getBoundingClientRect();
      var px = (e.clientX - b.left) / b.width - 0.5, py = (e.clientY - b.top) / b.height - 0.5;
      var q = moverFor(tilt, ['--tx', '--ty', '--gx', '--gy', '--ga']);
      q['--tx'](-py * 9); q['--ty'](px * 11);
      q['--gx']((px + 0.5) * 100); q['--gy']((py + 0.5) * 100); q['--ga'](1);
    }
  }, { passive: true });

  function releaseTilt(el) {
    movers.delete(el);
    gsap.to(el, { '--tx': '0deg', '--ty': '0deg', '--ga': 0, duration: 0.8, ease: 'power3.out', overwrite: true });
  }
  document.documentElement.addEventListener('mouseleave', function () {
    if (activeMagnet) { release(activeMagnet, ['--mx', '--my'], 'elastic.out(1, 0.4)'); activeMagnet = null; }
    if (activeTilt) { releaseTilt(activeTilt); activeTilt = null; }
  });

  window.SLMotion = { gsap: gsap, ScrollTrigger: ST, cover: cover, uncover: uncover, pageIn: pageIn, scrollTo: scrollTo, reduced: reduced };
})();
