// SL3D — real-time 3D render of the Slime Lime square bottle (three.js, ES module).
// Exposes window.SL3D.create(container, opts) -> { setFlavor(opts), destroy() } and fires
// a 'sl3d-ready' event on window once loaded. Callers fall back to the SVG <Bottle> until then.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const SEGS = 160;

// ── Geometry ───────────────────────────────────────────────────
// Superellipse cross-section: p≈5 is a soft square, p=2 a circle.
function ringPoint(a, p, t) {
  const c = Math.cos(t), s = Math.sin(t);
  const e = 2 / p;
  return [a * Math.sign(c) * Math.pow(Math.abs(c), e), a * Math.sign(s) * Math.pow(Math.abs(s), e)];
}

// Sweep a profile [{ y, a, p }] into a closed tube with a bottom cap.
function sweep(profile, segs = SEGS, capBottom = true) {
  const pos = [], idx = [];
  profile.forEach(({ y, a, p }) => {
    for (let i = 0; i < segs; i++) {
      const [x, z] = ringPoint(a, p, (i / segs) * TAU);
      pos.push(x, y, z);
    }
  });
  for (let r = 0; r < profile.length - 1; r++) {
    for (let i = 0; i < segs; i++) {
      const a = r * segs + i, b = r * segs + ((i + 1) % segs);
      const c = a + segs, d = b + segs;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (capBottom) {
    const center = pos.length / 3;
    pos.push(0, profile[0].y, 0);
    for (let i = 0; i < segs; i++) idx.push(center, i, (i + 1) % segs);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Bottle profile, from the SVG mockup (100px = 1 unit; base at y=0).
const BODY = 0.8, BODY_P = 5;
const bottleProfile = inset => {
  const k = a => Math.max(0.05, a - inset);
  return [
    { y: 0.00 + inset, a: k(0.70), p: BODY_P },
    { y: 0.03 + inset * 0.5, a: k(0.77), p: BODY_P },
    { y: 0.10, a: k(BODY), p: BODY_P },
    { y: 3.45, a: k(BODY), p: BODY_P },
    { y: 3.62, a: k(0.78), p: 4.4 },
    { y: 3.80, a: k(0.68), p: 3.4 },
    { y: 3.98, a: k(0.56), p: 2.4 },
    { y: 4.10, a: k(0.51), p: 2.0 },
    { y: 4.40, a: k(0.50), p: 2.0 },
  ];
};

// Liquid: same shape, inset, filled to just below the shoulder, flat top.
function liquidGeometry() {
  const prof = bottleProfile(0.035).filter(r => r.y < 3.5);
  prof.push({ y: 3.5, a: BODY - 0.035, p: BODY_P });
  const g = sweep(prof);
  // flat meniscus disc
  const pos = Array.from(g.attributes.position.array);
  const idx = Array.from(g.index.array);
  const top = (prof.length - 1) * SEGS;
  const c = pos.length / 3;
  pos.push(0, 3.5, 0);
  for (let i = 0; i < SEGS; i++) idx.push(c, top + ((i + 1) % SEGS), top + i);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

// Ridged twist cap.
function capGeometry(r = 0.53, h = 0.44, ridges = 56) {
  const g = new THREE.CylinderGeometry(r, r, h, ridges * 4, 1, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const rr = Math.hypot(x, z);
    if (rr < r * 0.98 || Math.abs(y) > h / 2 - 1e-4 && rr < r * 0.99) continue;
    const t = Math.atan2(z, x);
    const k = 1 - 0.022 * (Math.cos(t * ridges) > 0 ? 1 : 0);
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// Flat label plane wrapped onto the bottle's front face.
function labelGeometry(w, h, cy) {
  const g = new THREE.PlaneGeometry(w, h, 48, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const u = Math.min(0.999, Math.abs(x) / BODY);
    const z = BODY * Math.pow(1 - Math.pow(u, BODY_P), 1 / BODY_P);
    p.setZ(i, z + 0.006);
    p.setY(i, p.getY(i) + cy);
  }
  g.computeVertexNormals();
  return g;
}

// ── Textures ───────────────────────────────────────────────────
function blobPath(ctx, cx, cy, r, bumps, ratio, rot = 0) {
  const n = bumps * 2, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2 + rot;
    const rad = i % 2 === 0 ? r * (1 + ratio) : r * (1 - ratio * 0.35);
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p[0], p[1], mx, my);
  }
  ctx.closePath();
}

function drawLabel(canvas, o) {
  const S = canvas.width, ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  blobPath(ctx, S / 2, S / 2, S * 0.4, 6, 0.14);
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = S * 0.01;
  ctx.fillStyle = '#FBFBF5'; ctx.fill();
  ctx.restore();
  // subtle paper grain
  ctx.save();
  blobPath(ctx, S / 2, S / 2, S * 0.4, 6, 0.14); ctx.clip();
  const grd = ctx.createLinearGradient(0, 0, S, S);
  grd.addColorStop(0, 'rgba(255,255,255,0.0)'); grd.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, S, S);
  ctx.restore();

  const ink = '#0E0F0A';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const spaced = (txt, x, y, track) => {
    if ('letterSpacing' in ctx) { ctx.letterSpacing = track + 'px'; ctx.fillText(txt, x + track / 2, y); ctx.letterSpacing = '0px'; return; }
    ctx.fillText(txt, x, y);
  };
  ctx.fillStyle = ink;
  ctx.font = `700 ${S * 0.042}px "Space Grotesk", sans-serif`;
  spaced(o.brand || 'SLIME LIME', S / 2, S * 0.29, S * 0.012);

  const [l1, l2] = (o.flavor || 'Lemon · Lime').split(' · ');
  ctx.fillStyle = o.accent || '#7A8A00';
  const big = l2 ? 0.118 : 0.13;
  ctx.font = `800 ${S * big}px "Bricolage Grotesque", "Space Grotesk", sans-serif`;
  // shrink long names to fit the label
  const fit = (txt, max) => { let f = S * big; ctx.font = `800 ${f}px "Bricolage Grotesque", sans-serif`; while (ctx.measureText(txt).width > max && f > 20) { f -= 4; ctx.font = `800 ${f}px "Bricolage Grotesque", sans-serif`; } };
  fit(l1, S * 0.66);
  spaced(l1, S / 2, l2 ? S * 0.47 : S * 0.53, -S * 0.004);
  if (l2) { fit(l2, S * 0.66); spaced(l2, S / 2, S * 0.585, -S * 0.004); }

  ctx.fillStyle = ink;
  ctx.font = `600 ${S * 0.038}px "Space Grotesk", sans-serif`;
  spaced((o.subtitle || 'CLEAN FOCUS').toUpperCase(), S / 2, l2 ? S * 0.665 : S * 0.64, S * 0.011);
  ctx.fillStyle = 'rgba(14,15,10,0.7)';
  ctx.font = `500 ${S * 0.026}px "JetBrains Mono", monospace`;
  spaced(o.stats || '75MG · 5G SUGAR · 12FL OZ', S / 2, S * 0.75, S * 0.006);
}

function drawSticker(canvas, color) {
  const S = canvas.width, ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  blobPath(ctx, S / 2, S / 2, S * 0.33, 5, 0.32); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  blobPath(ctx, S / 2, S / 2, S * 0.24, 5, 0.32); ctx.fillStyle = color; ctx.fill();
}

function radialTexture(stops, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── Studio environment: dark room with softbox strips (crisp glass highlights) ──
function studioEnv(renderer, tint) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020302);
  const strip = (w, h, color, intensity, pos, rotY = 0, rotX = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(rotX, rotY, 0); scene.add(m);
  };
  strip(1.4, 9, 0xffffff, 7, [-5, 1, 2], Math.PI / 2.4);        // key strip, left
  strip(0.8, 9, 0xffffff, 4, [5, 1, 1.5], -Math.PI / 2.2);      // rim strip, right
  strip(4, 1.2, 0xffffff, 1.4, [0, 6, 1], 0, Math.PI / 2);      // top softbox
  strip(10, 3, tint, 1.6, [0, -1, -6]);                          // flavor glow behind
  strip(0.5, 6, 0xffffff, 0.5, [1.5, 1, 7], Math.PI);              // narrow front fill
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return rt;
}

// ── Public API ─────────────────────────────────────────────────
function create(container, opts = {}) {
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state = { juice: '#CAE00F', accent: '#7A8A00', ...opts };

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  let envRT = studioEnv(renderer, state.juice);
  scene.environment = envRT.texture;

  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  const AIM = 2.55;
  camera.position.set(0, AIM + 0.6, 12.2);
  camera.lookAt(0, AIM, 0);

  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-4, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(5, 3, -4); scene.add(rim);

  const root = new THREE.Group(); scene.add(root);

  // Full-bleed stage: an opaque backdrop the glass can refract (transmission needs something behind it).
  let frame = { x: 0, y: 0, fill: 1, ...(opts.frame || {}) };
  const backdropCanvas = document.createElement('canvas');
  const backdropTex = new THREE.CanvasTexture(backdropCanvas); backdropTex.colorSpace = THREE.SRGBColorSpace;
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: backdropTex, toneMapped: false, depthWrite: false }));
  backdrop.renderOrder = -1; scene.add(backdrop);
  const BACK_Z = -9, DIST = 12.2, FAR = (DIST - BACK_Z) / DIST;
  // Backdrop: page-colour field, a flavour-tinted glow behind the bottle, and the flavour name set huge
  // behind it (so the glass refracts the type). `bx/by` = where the bottle sits on the canvas (0..1).
  let bx = 0.5, by = 0.5, unitPx = 100;
  const paintBackdrop = () => {
    const W = backdropCanvas.width, H = backdropCanvas.height;
    if (!W || !H) return;
    const ctx = backdropCanvas.getContext('2d');
    const c = new THREE.Color(state.juice);
    const base = [6, 13, 8];
    const tint = k => `rgb(${[c.r, c.g, c.b].map((v, i) => Math.round(v * 255 * k + base[i] * (1 - k))).join(',')})`;
    ctx.fillStyle = 'rgb(6,13,8)'; ctx.fillRect(0, 0, W, H);
    const cx = bx * W, cy = by * H, R = unitPx * 5.2;
    const g = ctx.createRadialGradient(cx, cy + unitPx * 0.9, 0, cx, cy + unitPx * 0.9, R);
    g.addColorStop(0, tint(0.5)); g.addColorStop(0.3, tint(0.2)); g.addColorStop(0.65, tint(0.05)); g.addColorStop(1, 'rgb(6,13,8)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const word = (state.word || '').toUpperCase();
    if (word) {
      const lines = word.split(/\s+/).slice(0, 2);
      const lineH = unitPx * (lines.length > 1 ? 1.9 : 2.3);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let size = lineH * 1.1;
      const setF = () => { ctx.font = `800 ${size}px "Bricolage Grotesque", "Space Grotesk", sans-serif`; };
      setF();
      const maxW = Math.min(W * 0.96, unitPx * 7.6);
      while (lines.some(l => ctx.measureText(l).width > maxW) && size > 20) { size *= 0.94; setF(); }
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${-size * 0.04}px`;
      const tg = ctx.createLinearGradient(0, cy - lineH * 1.4, 0, cy + lineH * 1.4);
      tg.addColorStop(0, tint(0.48)); tg.addColorStop(1, tint(0.1));
      ctx.fillStyle = tg;
      const top = cy - unitPx * (lines.length > 1 ? 0.2 : 0.75) - ((lines.length - 1) * lineH) / 2;
      lines.forEach((l, i) => ctx.fillText(l, cx, top + i * lineH));
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    backdropTex.needsUpdate = true;
  };
  const bottle = new THREE.Group(); root.add(bottle);

  // Glass
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.2, ior: 1.5,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.15, specularIntensity: 1, transparent: false,
  });
  const glass = new THREE.Mesh(sweep(bottleProfile(0)), glassMat);
  bottle.add(glass);

  // Liquid (opaque so the glass transmission refracts it)
  // Backlit-juice look: saturated, glowing toward the centre, deeper at the edges and the base.
  const liquidMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(state.juice), roughness: 0.4, metalness: 0,
    emissive: new THREE.Color(state.juice), emissiveIntensity: 0.78, envMapIntensity: 0.3,
  });
  liquidMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float vH = clamp(vP.y / 3.5, 0.0, 1.0);
        float edge = smoothstep(0.18, 0.8, min(abs(vP.x), abs(vP.z)) / 0.765);
        float facing = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
        float glow = mix(1.0, 0.28, edge) * mix(0.42, 1.08, smoothstep(0.0, 0.95, vH)) * mix(0.6, 1.0, facing);
        totalEmissiveRadiance *= glow;
        diffuseColor.rgb *= mix(0.62, 0.22, edge);`);
  };
  const liquid = new THREE.Mesh(liquidGeometry(), liquidMat);
  bottle.add(liquid);

  // Carbonation clinging to the inside of the glass (seeded, so every render matches).
  {
    const N = 90;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const bub = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshPhysicalMaterial({ color: 0xe9eedc, roughness: 0.12, metalness: 0,
        clearcoat: 1, envMapIntensity: 1.3 }), N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      // mostly on the front face, some on the sides
      const t = (rnd() - 0.5) * Math.PI * 0.55 + (rnd() < 0.75 ? 0 : (Math.PI / 2) * (rnd() < 0.5 ? 1 : -1));
      const y = 0.12 + Math.pow(rnd(), 0.8) * 3.3;
      const [x, z] = ringPoint(BODY - 0.022, BODY_P, Math.PI / 2 - t);
      const r = 0.005 + Math.pow(rnd(), 4) * 0.014;
      m.compose(v.set(x, y, z), q, sc.setScalar(r));
      bub.setMatrixAt(i, m);
    }
    bottle.add(bub);
  }

  // Cap
  const capMat = new THREE.MeshStandardMaterial({ color: 0xc9c9c9, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
  const cap = new THREE.Mesh(capGeometry(), capMat);
  cap.position.y = 4.4 + 0.22; bottle.add(cap);
  const capTop = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 12, 96), capMat);
  capTop.rotation.x = Math.PI / 2; capTop.position.y = 4.4 + 0.44; bottle.add(capTop);
  const neckRing = new THREE.Mesh(new THREE.CylinderGeometry(0.545, 0.545, 0.05, 96),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.4 }));
  neckRing.position.y = 4.4 + 0.02; bottle.add(neckRing);

  // Cap sticker (wraps the cap front)
  const stickerCanvas = document.createElement('canvas'); stickerCanvas.width = stickerCanvas.height = 512;
  const stickerTex = new THREE.CanvasTexture(stickerCanvas); stickerTex.colorSpace = THREE.SRGBColorSpace;
  const sticker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.538, 0.538, 0.46, 48, 1, true, -Math.PI * 0.27 + Math.PI / 2 - Math.PI / 2, Math.PI * 0.54),
    new THREE.MeshPhysicalMaterial({ map: stickerTex, transparent: true, alphaTest: 0.4, roughness: 0.35, clearcoat: 0.5 }));
  sticker.position.y = cap.position.y; bottle.add(sticker);

  // Front label
  const labelCanvas = document.createElement('canvas'); labelCanvas.width = labelCanvas.height = 1024;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace; labelTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const label = new THREE.Mesh(labelGeometry(1.52, 1.52, 1.62),
    new THREE.MeshPhysicalMaterial({ map: labelTex, transparent: true, alphaTest: 0.35, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.2 }));
  bottle.add(label);

  // Contact shadow + light pool tinted by the juice
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.3),
    new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(0,0,0,0.85)'], [0.45, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; root.add(shadow);
  const poolMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.2), poolMat);
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.001; root.add(pool);

  const paint = () => {
    drawLabel(labelCanvas, state); labelTex.needsUpdate = true;
    drawSticker(stickerCanvas, state.juice); stickerTex.needsUpdate = true;
    liquidMat.color.set(state.juice); liquidMat.emissive.set(state.juice);
    if (poolMat.map) poolMat.map.dispose();
    const c = new THREE.Color(state.juice);
    const rgba = a => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
    poolMat.map = radialTexture([[0, rgba(0.55)], [0.5, rgba(0.15)], [1, rgba(0)]]); poolMat.needsUpdate = true;
    paintBackdrop();
    // re-tint the studio's back glow
    envRT.dispose(); envRT = studioEnv(renderer, state.juice); scene.environment = envRT.texture;
    dirty = true;
  };

  // ── Sizing ──
  let w = 0, h = 0, dirty = true;
  const resize = () => {
    const r = container.getBoundingClientRect();
    if (r.width === w && r.height === h) return;
    w = r.width; h = r.height;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    layout();
  };
  // Fit ~6.2 units (bottle + cap + float) into `fill` of the height, widening on narrow aspect ratios,
  // then slide the bottle to frame.x (-1 = left edge, 1 = right edge of the view).
  const layout = () => {
    if (!w || !h) return;
    const needH = (6.2 / frame.fill) * Math.max(1, (0.5 / frame.fill) / camera.aspect);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((needH / 2) / DIST));
    camera.updateProjectionMatrix();
    const visH = needH, visW = visH * camera.aspect;
    root.position.x = frame.x * visW / 2;
    root.position.y = frame.y * visH / 2;
    // backdrop covers the view at its depth; its canvas matches its aspect so type isn't stretched
    const pw = visW * FAR * 1.08, ph = visH * FAR * 1.08;
    backdrop.scale.set(pw, ph, 1);
    backdrop.position.set(0, AIM + 0.6 * (1 - FAR), BACK_Z);
    const px = Math.min(2048, Math.round(w * Math.min(window.devicePixelRatio || 1, 1.5)));
    backdropCanvas.width = px; backdropCanvas.height = Math.round(px * ph / pw);
    unitPx = (px / pw) * FAR;                       // canvas px per world unit at the bottle's depth
    bx = 0.5 + (root.position.x * FAR) / pw;
    by = 0.5 - ((root.position.y + 2.45 - AIM) * FAR) / ph;
    paintBackdrop();
    dirty = true;
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  // ── Motion ──
  let px = 0, py = 0, tx = 0, ty = 0, spin = 0, spinFrom = 0, spinStart = -1, visible = true, raf = 0;
  const onPointer = e => {
    const r = container.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  const fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fine && !reduced && opts.interactive !== false) window.addEventListener('pointermove', onPointer, { passive: true });

  const io = 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); }) : null;
  if (io) io.observe(container);
  const onVis = () => { if (!document.hidden) loop(); };
  document.addEventListener('visibilitychange', onVis);

  const t0 = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 4);
  const tick = now => {
    raf = 0;
    const t = (now - t0) / 1000;
    if (!reduced) {
      px += (tx - px) * 0.06; py += (ty - py) * 0.06;
      let s = 0;
      if (spinStart >= 0) {
        const k = Math.min(1, (now - spinStart) / 1100);
        s = spinFrom * (1 - ease(k));
        if (k >= 1) spinStart = -1;
      }
      bottle.rotation.y = -0.38 + Math.sin(t * 0.45) * 0.16 + px * 0.35 + s;
      root.rotation.z = -0.05 + Math.sin(t * 0.3) * 0.015;
      root.rotation.x = py * 0.05;
      bottle.position.y = 0.18 + Math.sin(t * 0.9) * 0.05;
      shadow.scale.setScalar(1 - (bottle.position.y - 0.18) * 0.8);
      dirty = true;
    } else if (dirty) {
      bottle.rotation.y = -0.38; root.rotation.z = -0.05; bottle.position.y = 0.18;
    }
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    if (!reduced || spinStart >= 0) loop();
  };
  const loop = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); };

  // fonts must be ready before the label is drawn
  const fontsReady = document.fonts && document.fonts.load
    ? Promise.all(['800 80px "Bricolage Grotesque"', '700 40px "Space Grotesk"', '600 40px "Space Grotesk"', '500 20px "JetBrains Mono"'].map(f => document.fonts.load(f))).catch(() => {})
    : Promise.resolve();
  paint();
  fontsReady.then(() => { if (!destroyed) { paint(); loop(); } });
  loop();

  let destroyed = false;
  return {
    canvas,
    setFrame(next) { frame = { ...frame, ...next }; layout(); loop(); },
    setFlavor(next) {
      const changed = next.juice && next.juice !== state.juice;
      state = { ...state, ...next };
      paint();
      if (changed && !reduced) { spinFrom = TAU; spinStart = performance.now(); }
      loop();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf); ro.disconnect(); if (io) io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onPointer);
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
      envRT.dispose(); renderer.dispose();
      canvas.remove();
    },
  };
}

function supported() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}

window.SL3D = { create, supported: supported() };
window.dispatchEvent(new Event('sl3d-ready'));
