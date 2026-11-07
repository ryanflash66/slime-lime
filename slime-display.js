/*!
 * Slime Lime "Glossy Slime" display lettering.
 * Turns <span class="sl-display">Late nights</span> into layered SVG lettering set in the element's own font
 * (Al Fresco Bold in production). The text stays real text for screen readers and search.
 *
 * Options via data attributes:
 *   data-palette = lime | cherry | blue-rasp | mango | grape | watermelon   (default lime)
 *   data-ground  = light | dark   (dark adds the white sticker ring)      (default light)
 *   data-swash   = true | false                                           (default true)
 * Size it with CSS font-size; the lettering scales in em. Call SlimeDisplay.render(el) after changing text.
 */
(function (root) {
  'use strict';

  var PALETTES = {
    'lime':       { f1: '#F4FAC2', f2: '#CAE00F', f3: '#7FA80F', shade: '#3E5400', pop: '#CAE00F' },
    'cherry':     { f1: '#FFC2CB', f2: '#FF3D5C', f3: '#A8132B', shade: '#5E0716', pop: '#FF3D5C' },
    'blue-rasp':  { f1: '#C9DEFF', f2: '#3D8BFF', f3: '#0F4FB3', shade: '#072B66', pop: '#3D8BFF' },
    'mango':      { f1: '#FFE0B3', f2: '#FF9A1F', f3: '#A85A00', shade: '#5C3100', pop: '#FF9A1F' },
    'grape':      { f1: '#E9D4FF', f2: '#B96BFF', f3: '#6A2EAF', shade: '#3A1466', pop: '#B96BFF' },
    'watermelon': { f1: '#FFD1DB', f2: '#FF6B8A', f3: '#B23052', shade: '#5E1428', pop: '#FF6B8A' }
  };
  var INK = '#060D08', PAPER = '#FBFBF5', SIZE = 200, uid = 0;
  var ctx = document.createElement('canvas').getContext('2d');

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function f(v) { return v.toFixed(2); }

  function swashPath(x0, x1, y, th, rise) {
    var n = 40, top = [], bot = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, x = x0 + (x1 - x0) * t;
      var yc = y - rise * Math.pow(t, 2.2) + th * 0.4 * Math.sin(Math.PI * t);
      var w = th * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.8) * (1 - 0.35 * t);
      top.push([x, yc - w / 2]); bot.push([x, yc + w / 2]);
    }
    var pts = top.concat(bot.reverse());
    return 'M' + pts.map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' L') + ' Z';
  }

  function build(text, family, opt) {
    var p = PALETTES[opt.palette] || PALETTES.lime, s = SIZE / 200, id = 'sl' + (++uid);
    ctx.font = '700 ' + SIZE + 'px ' + family;
    var w = ctx.measureText(text).width;
    var K = SIZE * 0.15, K2 = K + SIZE * 0.085, BOLD = SIZE * 0.035;
    var depth = [1, 2, 3, 4].map(function (i) { return [SIZE * 0.018 * i, SIZE * 0.024 * i]; });
    var pop = [SIZE * 0.12, SIZE * 0.15];
    var padx = SIZE * 0.34, pady = SIZE * 0.26, swH = opt.swash ? SIZE * 0.28 : 0;
    var W = w + 2 * padx + SIZE * 0.2, H = SIZE * 1.25 + 2 * pady + swH;
    var bx = padx, by = pady + SIZE * 0.95;
    var sw = opt.swash ? swashPath(bx + w * 0.12, bx + w * 0.98, by + SIZE * 0.20, SIZE * 0.13, SIZE * 0.18) : '';
    var lj = ' stroke-linejoin="round" stroke-linecap="round"';
    var art = '<g id="art-' + id + '"><text x="' + f(bx) + '" y="' + f(by) + '" font-family="' + esc(family) +
      '" font-weight="700" font-size="' + SIZE + '">' + esc(text) + '</text>' + (sw ? '<path d="' + sw + '"/>' : '') + '</g>';
    var defs = '<defs>' +
      '<linearGradient id="fill-' + id + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + f(by - SIZE * 0.78) + '" x2="0" y2="' + f(by + SIZE * 0.12) + '">' +
      '<stop offset="0" stop-color="' + p.f1 + '"/><stop offset="0.45" stop-color="' + p.f2 + '"/><stop offset="1" stop-color="' + p.f3 + '"/></linearGradient>' +
      '<filter id="shade-' + id + '" x="-5%" y="-10%" width="110%" height="120%" color-interpolation-filters="sRGB">' +
      '<feOffset in="SourceAlpha" dx="' + f(-7 * s) + '" dy="' + f(-9 * s) + '" result="o"/>' +
      '<feComposite in="SourceAlpha" in2="o" operator="out" result="rim"/>' +
      '<feGaussianBlur in="rim" stdDeviation="' + f(2.2 * s) + '" result="rb"/>' +
      '<feComposite in="rb" in2="SourceAlpha" operator="in" result="r2"/>' +
      '<feFlood flood-color="' + p.shade + '" flood-opacity="0.75"/><feComposite in2="r2" operator="in"/></filter>' +
      '<filter id="gloss-' + id + '" x="-5%" y="-10%" width="110%" height="120%" color-interpolation-filters="sRGB">' +
      '<feMorphology in="SourceAlpha" operator="erode" radius="' + f(3.2 * s) + '" result="a"/>' +
      '<feOffset in="a" dx="' + f(4.5 * s) + '" dy="' + f(6 * s) + '" result="b"/>' +
      '<feComposite in="a" in2="b" operator="out" result="line"/>' +
      '<feMorphology in="line" operator="erode" radius="' + f(0.6 * s) + '" result="thin"/>' +
      '<feGaussianBlur in="thin" stdDeviation="' + f(0.7 * s) + '" result="tl"/>' +
      '<feGaussianBlur in="SourceAlpha" stdDeviation="' + f(5 * s) + '" result="bump"/>' +
      '<feSpecularLighting in="bump" surfaceScale="' + f(5 * s) + '" specularConstant="0.9" specularExponent="26" lighting-color="#ffffff" result="spec">' +
      '<feDistantLight azimuth="225" elevation="55"/></feSpecularLighting>' +
      '<feComposite in="spec" in2="SourceAlpha" operator="in" result="sheen"/>' +
      '<feColorMatrix in="sheen" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.33 0.33 0.33 0 0" result="sheenA"/>' +
      '<feComponentTransfer in="sheenA" result="sheenS"><feFuncA type="linear" slope="0.14"/></feComponentTransfer>' +
      '<feFlood flood-color="#ffffff"/><feComposite in2="tl" operator="in" result="white"/>' +
      '<feMerge><feMergeNode in="sheenS"/><feMergeNode in="white"/></feMerge></filter>' +
      '<filter id="close-' + id + '" x="-5%" y="-10%" width="110%" height="125%">' +
      '<feMorphology in="SourceAlpha" operator="dilate" radius="' + f(15 * s) + '" result="d"/>' +
      '<feMorphology in="d" operator="erode" radius="' + f(15 * s) + '" result="c"/>' +
      '<feFlood flood-color="' + INK + '"/><feComposite in2="c" operator="in"/></filter>' + art + '</defs>';
    var use = function (attrs) { return '<use href="#art-' + id + '" ' + attrs + '/>'; };
    var L = [];
    var ringW = opt.ground === 'dark' ? K2 : K;
    L.push(use('transform="translate(' + f(pop[0]) + ',' + f(pop[1]) + ')" fill="' + p.pop + '" stroke="' + p.pop + '" stroke-width="' + f(ringW) + '"' + lj));
    if (opt.ground === 'dark') {
      [[0, 0]].concat(depth).forEach(function (d) {
        L.push(use('transform="translate(' + f(d[0]) + ',' + f(d[1]) + ')" fill="' + PAPER + '" stroke="' + PAPER + '" stroke-width="' + f(K2) + '"' + lj));
      });
    }
    var ink = depth.concat([[0, 0]]).map(function (d) {
      return use('transform="translate(' + f(d[0]) + ',' + f(d[1]) + ')" fill="' + INK + '" stroke="' + INK + '" stroke-width="' + f(K) + '"' + lj);
    }).join('');
    L.push('<g filter="url(#close-' + id + ')">' + ink + '</g>');
    L.push(use('fill="url(#fill-' + id + ')" stroke="url(#fill-' + id + ')" stroke-width="' + f(BOLD) + '"' + lj));
    L.push(use('fill="#000" stroke="#000" stroke-width="' + f(BOLD) + '"' + lj + ' filter="url(#shade-' + id + ')"'));
    L.push(use('fill="#000" stroke="#000" stroke-width="' + f(BOLD) + '"' + lj + ' filter="url(#gloss-' + id + ')"'));
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(W) + ' ' + f(H) + '" aria-hidden="true" focusable="false" ' +
      'style="display:block;width:min(' + f(W / SIZE) + 'em,100%);height:auto;overflow:visible">' + defs + L.join('') + '</svg>';
  }

  function render(el) {
    var text = (el.getAttribute('data-text') || el.textContent || '').trim();
    if (!text) return;
    el.setAttribute('data-text', text);
    var family = getComputedStyle(el).fontFamily;
    var opt = {
      palette: el.getAttribute('data-palette') || 'lime',
      ground: el.getAttribute('data-ground') || 'light',
      swash: el.getAttribute('data-swash') !== 'false'
    };
    el.innerHTML = '<span class="sl-sr">' + esc(text) + '</span>' + build(text, family, opt);
    el.classList.add('is-rendered');
  }

  function init(scope) {
    var els = (scope || document).querySelectorAll('.sl-display');
    var families = new Set();
    els.forEach(function (el) { families.add(getComputedStyle(el).fontFamily); });
    var loads = Array.from(families).map(function (fam) { return document.fonts.load('700 ' + SIZE + 'px ' + fam); });
    return Promise.all(loads).catch(function () {}).then(function () { els.forEach(render); });
  }

  root.SlimeDisplay = { render: render, init: init, palettes: PALETTES };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
})(window);
