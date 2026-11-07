// SL3D — real-time 3D render of the Slime Lime double-bubble bottle (three.js, ES module).
// Loads the Claude Design model (assets/bottle/slime-lime-bottle.glb), then exposes
// window.SL3D.create(container, opts) -> { setFlavor(opts), setFrame(frame), destroy() } and fires
// a 'sl3d-ready' event on window. Callers show the still render until then.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TAU = Math.PI * 2;
const ASSETS = new URL('assets/bottle/', import.meta.url);
const asset = p => new URL(p, ASSETS).href;

// Model units are metres (cap top at 0.1534 m). Scale so the bottle is 4.4 scene units tall.
const MODEL_H = 0.1534, SCALE = 4.4 / MODEL_H;
const FILL_Y = 0.138;                       // liquid fill line, metres above the base

// ── Shared assets (loaded once per page) ───────────────────────
const texLoader = new THREE.TextureLoader();
const labelCache = new Map();
const bgImages = new Map();                 // url -> HTMLImageElement once loaded (null while loading)
function labelTexture(file, renderer) {
  if (labelCache.has(file)) return labelCache.get(file);
  const p = new Promise((res, rej) => texLoader.load(asset('labels/' + file), t => {
    t.flipY = false;                        // glTF UV convention
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
    res(t);
  }, undefined, rej));
  labelCache.set(file, p);
  return p;
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
  strip(0.5, 6, 0xffffff, 0.5, [1.5, 1, 7], Math.PI);            // narrow front fill
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return rt;
}

// Carbonation clinging to the inside of both glass bubbles (seeded, so every render matches).
// Sphere centres/radii in metres, from the hand-off spec.
function bubbles() {
  const spheres = [
    { cy: 0.0358, r: 0.0394, phi: [0.6, 2.45], n: 70 },   // bottom bubble
    { cy: 0.1155, r: 0.0292, phi: [0.95, 2.5], n: 40 },    // top bubble (below the fill line)
  ];
  const N = spheres.reduce((s, b) => s + b.n, 0);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshPhysicalMaterial({ color: 0xe9eedc, roughness: 0.12, metalness: 0, clearcoat: 1, envMapIntensity: 1.3 }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  let i = 0;
  spheres.forEach(({ cy, r, phi, n }) => {
    for (let k = 0; k < n; k++) {
      const p = phi[0] + rnd() * (phi[1] - phi[0]);
      const t = (rnd() - 0.5) * Math.PI * 1.3;            // around the front (+Z), some on the sides
      v.set(r * Math.sin(p) * Math.sin(t), cy + r * Math.cos(p), r * Math.sin(p) * Math.cos(t));
      if (v.y > FILL_Y - 0.002) v.y = FILL_Y - 0.002 - rnd() * 0.01;
      m.compose(v, q, sc.setScalar(0.00016 + Math.pow(rnd(), 4) * 0.0005));
      mesh.setMatrixAt(i++, m);
    }
  });
  return mesh;
}

// Backlit-juice look: saturated, glowing toward the centre, deeper at the rim and the base.
function liquidMaterial(juice) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(juice), roughness: 0.4, metalness: 0,
    emissive: new THREE.Color(juice), emissiveIntensity: 0.6, envMapIntensity: 0.15,
  });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float vH = clamp(vP.y / ${FILL_Y.toFixed(4)}, 0.0, 1.0);
        float facing = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
        float core = smoothstep(0.05, 1.0, facing);
        float glow = mix(0.1, 1.0, pow(core, 1.6)) * mix(0.55, 1.05, smoothstep(0.0, 0.95, vH));
        totalEmissiveRadiance *= glow;
        diffuseColor.rgb *= mix(0.04, 0.24, core);`);
  };
  return mat;
}

// ── Public API ─────────────────────────────────────────────────
function create(gltf, container, opts = {}) {
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state = { id: 'lemon-lime', juice: '#CAE00F', accent: '#7A8A00', ...opts };

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
    // Flavor stage photo (cover-fit, centred on the bottle where the crop allows), dimmed for the type.
    const img = state.bg && bgImages.get(state.bg);
    if (img && img.naturalWidth) {
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
      const dx = Math.min(0, Math.max(W - iw, cx - iw / 2)), dy = Math.min(0, Math.max(H - ih, cy - ih * 0.55));
      ctx.drawImage(img, dx, dy, iw, ih);
      ctx.fillStyle = 'rgba(6,13,8,0.38)'; ctx.fillRect(0, 0, W, H);
    }
    const g = ctx.createRadialGradient(cx, cy + unitPx * 0.9, 0, cx, cy + unitPx * 0.9, R);
    g.addColorStop(0, tint(0.5)); g.addColorStop(0.3, tint(0.2)); g.addColorStop(0.65, tint(0.05)); g.addColorStop(1, 'rgb(6,13,8)');
    ctx.globalAlpha = img ? 0.45 : 1;
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = img ? 0.7 : 1;
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
    ctx.globalAlpha = 1;
    backdropTex.needsUpdate = true;
  };
  const loadBg = () => {
    const url = state.bg;
    if (!url || bgImages.has(url)) return;
    const img = new Image();
    img.decoding = 'async';
    bgImages.set(url, null);
    img.onload = () => { bgImages.set(url, img); if (!destroyed && state.bg === url) { paintBackdrop(); dirty = true; loop(); } };
    img.onerror = () => bgImages.delete(url);
    img.src = url;
  };

  // ── The bottle (shared geometry from the GLB; materials cloned per instance) ──
  const bottle = new THREE.Group(); root.add(bottle);
  const model = gltf.scene.clone(true);
  model.scale.setScalar(SCALE);
  bottle.add(model);
  const parts = {};
  const ownMaterials = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone(); ownMaterials.push(o.material);
    parts[o.name] = o;
  });
  const { Glass, Liquid, Cap, LabelFront, LabelBack, CapSticker } = parts;
  if (Glass) {
    Object.assign(Glass.material, {
      transmission: 1, roughness: 0.03, ior: 1.52, thickness: 0.005,
      clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.15, specularIntensity: 1,
    });
    Glass.renderOrder = 2;
  }
  if (Liquid) {
    Liquid.material.dispose(); ownMaterials.splice(ownMaterials.indexOf(Liquid.material), 1);
    Liquid.material = liquidMaterial(state.juice); ownMaterials.push(Liquid.material);
  }
  if (Cap) Object.assign(Cap.material, { metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
  [LabelFront, LabelBack].forEach(l => { if (l) { l.renderOrder = 3; if (l.material.map) l.material.map.anisotropy = renderer.capabilities.getMaxAnisotropy(); } });
  const bub = bubbles(); model.add(bub); ownMaterials.push(bub.material);

  // Contact shadow + light pool tinted by the juice
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.6),
    new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(0,0,0,0.85)'], [0.45, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; root.add(shadow);
  const poolMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.6), poolMat);
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.001; root.add(pool);

  // Flavor labels: swap the front label + cap sticker maps once the textures arrive.
  let labelReq = 0;
  const applyLabels = () => {
    const req = ++labelReq, id = state.id;
    return Promise.all([
      labelTexture(`label-front-${id}.webp`, renderer),
      labelTexture(`cap-${id}.webp`, renderer),
    ]).then(([front, capTex]) => {
      if (destroyed || req !== labelReq) return;
      if (LabelFront) { LabelFront.material.map = front; LabelFront.material.needsUpdate = true; }
      if (CapSticker) { CapSticker.material.map = capTex; CapSticker.material.needsUpdate = true; }
      dirty = true; loop();
    }).catch(() => {});
  };

  const paint = () => {
    loadBg();
    if (Liquid) { Liquid.material.color.set(state.juice); Liquid.material.emissive.set(state.juice); }
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
  // Fit ~6.2 units tall (bottle + float + headroom) and ~3.2 wide into `fill` of the view,
  // then slide the bottle to frame.x (-1 = left edge, 1 = right edge of the view).
  const layout = () => {
    if (!w || !h) return;
    const needH = Math.max(6.2, 3.2 / camera.aspect) / frame.fill;
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
    const cw = px, ch = Math.round(px * ph / pw);
    if (cw !== backdropCanvas.width || ch !== backdropCanvas.height) {
      backdropCanvas.width = cw; backdropCanvas.height = ch;
      // three allocates immutable texture storage on first upload; a resized canvas would only
      // partially overwrite it (stale flavor showing through), so free it and let it re-allocate.
      backdropTex.dispose();
    }
    unitPx = (px / pw) * FAR;                       // canvas px per world unit at the bottle's depth
    bx = 0.5 + (root.position.x * FAR) / pw;
    by = 0.5 - ((root.position.y + 2.4 - AIM) * FAR) / ph;
    paintBackdrop();
    dirty = true;
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  // ── Motion ──
  let px = 0, py = 0, tx = 0, ty = 0, spinFrom = 0, spinStart = -1, visible = true, raf = 0;
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

  const REST = -0.3;                                // label turned slightly toward the copy
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
      bottle.rotation.y = REST + Math.sin(t * 0.45) * 0.16 + px * 0.35 + s;
      root.rotation.z = -0.05 + Math.sin(t * 0.3) * 0.015;
      root.rotation.x = py * 0.05;
      bottle.position.y = 0.18 + Math.sin(t * 0.9) * 0.05;
      shadow.scale.setScalar(1 - (bottle.position.y - 0.18) * 0.8);
      dirty = true;
    } else if (dirty) {
      bottle.rotation.y = REST; root.rotation.z = -0.05; bottle.position.y = 0.18;
    }
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    if (!reduced || spinStart >= 0) loop();
  };
  const loop = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); };

  let destroyed = false;
  paint();
  // The backdrop type needs its font; repaint once it's loaded.
  if (document.fonts && document.fonts.load) {
    document.fonts.load('800 80px "Bricolage Grotesque"').then(() => { if (!destroyed) { paintBackdrop(); dirty = true; loop(); } }).catch(() => {});
  }
  const whenReady = applyLabels();
  loop();

  return {
    canvas,
    whenReady,
    setFrame(next) { frame = { ...frame, ...next }; layout(); loop(); },
    setFlavor(next) {
      const changed = next.juice && next.juice !== state.juice;
      const idChanged = next.id && next.id !== state.id;
      state = { ...state, ...next };
      paint();
      if (idChanged) applyLabels();
      if (changed && !reduced) { spinFrom = TAU; spinStart = performance.now(); }
      loop();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf); ro.disconnect(); if (io) io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onPointer);
      // Model geometry and label textures are shared across instances; dispose only what this one made.
      ownMaterials.forEach(m => m.dispose());
      bub.geometry.dispose(); bub.dispose();
      [backdrop, shadow, pool].forEach(o => { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); });
      envRT.dispose(); renderer.dispose();
      canvas.remove();
    },
  };
}

function supported() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}

const isSupported = supported();
const ready = isSupported
  ? new GLTFLoader().loadAsync(asset('slime-lime-bottle.glb'))
  : Promise.reject(new Error('WebGL unavailable'));

ready.then(gltf => {
  window.SL3D = { create: (container, opts) => create(gltf, container, opts), supported: true };
  window.dispatchEvent(new Event('sl3d-ready'));
}, () => {
  window.SL3D = { create() { throw new Error('3D unavailable'); }, supported: false };
  window.dispatchEvent(new Event('sl3d-ready'));
});
