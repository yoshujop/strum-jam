// Art preview: renders a .glb the way the game will (cel shading from COLOR_0, one shadow tone,
// inverted-hull ink line from _SJOUT/_SJOUTW, the sj_face decal) into a contact sheet PNG.
// A throwaway viewer for the art pipeline, independent of the runtime engine.
//
//   NODE_PATH=$(npm root -g) node art/preview/artshot.js <model.glb> <out.png> [sheet] [key=value ...]
//
// sheets:  turn    front 3/4, side, back, head close-up, hands close-up   (default)
//          game    the model at in-game size on a 1280x665 laptop and a 390x844 phone
//          poses   one panel per frame of the first animation (see sjart.rig.Poser.key)
//          prop    3/4, front, back, top views of a static prop
// options: h=1600 (panel height), line=0.5 (ink width, % of model height), bg=#cfd3dc, cols=N,
//          face=1 (draw a test face on the sj_face region), only=name, az=deg el=deg zoom=1 (override camera)
// The three.js bundle is read from vendor/three.bundle.min.js, or $SJ_THREE_BUNDLE.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
if (args.length < 2) { console.error('usage: artshot.js model.glb out.png [turn|game|poses|prop] [key=value ...]'); process.exit(1); }
const [glbPath, outPath] = args;
const sheet = args[2] && !args[2].includes('=') ? args[2] : 'turn';
const opt = { h: 1600, line: 0.5, bg: '#cfd3dc', face: 1 };
for (const a of args.slice(2)) { const m = a.match(/^(\w+)=(.*)$/); if (m) opt[m[1]] = isNaN(+m[2]) ? m[2] : +m[2]; }
const repo = path.resolve(__dirname, '..', '..');
const bundlePath = [process.env.SJ_THREE_BUNDLE, path.join(repo, 'vendor', 'three.bundle.min.js')].find(p => p && fs.existsSync(p));
if (!bundlePath) { console.error('three bundle not found: set SJ_THREE_BUNDLE or build vendor/three.bundle.min.js'); process.exit(1); }

const page = (glbB64, bundle) => `<!doctype html><html><body style="margin:0;background:${opt.bg};font:600 15px sans-serif">
<canvas id="c"></canvas><div id="labels"></div>
<script>${bundle}</script>
<script>
const OPT = ${JSON.stringify(opt)}, SHEET = ${JSON.stringify(sheet)};
const glb = Uint8Array.from(atob("${glbB64}"), c => c.charCodeAt(0)).buffer;
const INK = new THREE.Color('#1E1B2E');
const VS = \`
#include <common>
#include <skinning_pars_vertex>
attribute vec3 _sjout; attribute float _sjoutw;
#ifdef USE_UV0
varying vec2 vUv;
#endif
uniform float uLine;
varying vec3 vN; varying vec3 vC; varying vec3 vV;
void main() {
  #ifdef HULL
  vec3 objectNormal = normalize(_sjout);
  #else
  vec3 objectNormal = normal;
  #endif
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  vec3 transformedNormal = normalMatrix * objectNormal;
  vec3 transformed = position;
  #include <skinning_vertex>
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  #ifdef HULL
  mvPosition.xyz += normalize(transformedNormal) * uLine * _sjoutw;
  #endif
  gl_Position = projectionMatrix * mvPosition;
  vN = transformedNormal; vV = -mvPosition.xyz;
  #ifdef USE_COLOR_ALPHA
  vC = color.rgb;
  #elif defined(USE_COLOR)
  vC = color;
  #else
  vC = vec3(1.0);
  #endif
  #ifdef USE_UV0
  vUv = uv;
  #endif
}\`;
const FS = \`
uniform vec3 uLight; uniform vec3 uShade; uniform vec3 uInk; uniform float uSpec; uniform float uUnlit;
#ifdef USE_UV0
uniform sampler2D uFace; varying vec2 vUv;
#endif
varying vec3 vN; varying vec3 vC; varying vec3 vV;
void main() {
  #ifdef HULL
  gl_FragColor = vec4(uInk, 1.0);
  #else
  vec3 n = normalize(vN); vec3 v = normalize(vV);
  vec3 base = vC;
  #ifdef USE_UV0
  vec4 f = texture2D(uFace, vUv); base = mix(base, f.rgb, f.a);
  #endif
  float lit = smoothstep(-0.02, 0.02, dot(n, uLight) - 0.12);
  vec3 col = mix(base * uShade, base, lit);
  if (uSpec > 0.0) { vec3 hv = normalize(uLight + v); float s = smoothstep(0.0, 0.015, pow(max(dot(n, hv), 0.0), 60.0 / uSpec) - 0.55); col = mix(col, vec3(1.0), s * 0.85); }
  col = mix(col, base, uUnlit);
  gl_FragColor = vec4(col, 1.0);
  #endif
  #include <colorspace_fragment>
}\`;
function faceCanvas() {            // a test face: the character's LEFT eye (viewer's right) winks, so mirroring shows
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const eye = (x, wink) => { g.fillStyle = '#fff'; g.strokeStyle = '#1E1B2E'; g.lineWidth = 9;
    if (wink) { g.beginPath(); g.moveTo(x - 42, 262); g.quadraticCurveTo(x, 232, x + 42, 262); g.stroke(); return; }
    g.beginPath(); g.ellipse(x, 256, 40, 50, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#1E1B2E'; g.beginPath(); g.ellipse(x + 6, 262, 19, 26, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 13, 250, 7, 0, 7); g.fill(); };
  eye(256 - 88, false); eye(256 + 88, OPT.face == 2);
  g.strokeStyle = '#1E1B2E'; g.lineWidth = 11;
  g.beginPath(); g.moveTo(256 - 132, 184); g.lineTo(256 - 50, 172); g.stroke();
  g.beginPath(); g.moveTo(256 + 132, 184); g.lineTo(256 + 50, 172); g.stroke();
  g.lineWidth = 10; g.beginPath(); g.moveTo(256 - 52, 388); g.quadraticCurveTo(256, 430, 256 + 60, 380); g.stroke();
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const faceTex = faceCanvas();
function mats(name, hasUv, hasOut) {
  const spec = name === 'sj_metal' ? 1.0 : name === 'sj_gloss' ? 0.55 : 0.0;
  const shade = { sj_skin: [0.80, 0.60, 0.66], sj_face: [0.80, 0.60, 0.66], sj_hair: [0.62, 0.58, 0.78], sj_cloth: [0.66, 0.62, 0.82], sj_metal: [0.55, 0.56, 0.72] }[name] || [0.66, 0.62, 0.80];
  const u = () => ({ uLight: { value: new THREE.Vector3(-0.42, 0.62, 0.66).normalize() }, uShade: { value: new THREE.Vector3(...shade) }, uInk: { value: INK },
    uSpec: { value: spec }, uUnlit: { value: name === 'sj_emit' ? 1 : 0 }, uLine: { value: 0.01 }, uFace: { value: faceTex } });
  const defs = {}; if (name === 'sj_face' && hasUv && OPT.face) defs.USE_UV0 = 1;
  const fill = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: u(), vertexColors: true, defines: defs,
    transparent: name === 'sj_glass', opacity: 1 });
  const hull = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: u(), vertexColors: true, defines: { HULL: 1 }, side: THREE.BackSide });
  return { fill, hull };
}
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.autoClear = false;
const scene = new THREE.Scene();
let root, mixer, clip, hulls = [], bones = {}, stats = { tris: 0, draws: 0 };
new THREE.GLTFLoader().parse(glb, '', gl => {
  root = gl.scene; scene.add(root);
  const add = [];
  root.traverse(o => { if (o.isBone) bones[o.name] = o;
    if (!o.isMesh) return;
    const g = o.geometry, name = o.material.name;
    stats.tris += (g.index ? g.index.count : g.attributes.position.count) / 3; stats.draws++;
    if (!g.attributes._sjout) { g.setAttribute('_sjout', g.attributes.normal); }
    if (!g.attributes._sjoutw) { g.setAttribute('_sjoutw', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1)); }
    const m = mats(name, !!g.attributes.uv); o.material = m.fill; o.frustumCulled = false;
    if (!/_noline$/.test(o.name) && !/_noline$/.test(o.parent.name) && name !== 'sj_glass') {
      const h = o.isSkinnedMesh ? new THREE.SkinnedMesh(g, m.hull) : new THREE.Mesh(g, m.hull);
      if (o.isSkinnedMesh) h.bind(o.skeleton, o.bindMatrix);
      h.frustumCulled = false; add.push([o, h]); hulls.push(h); }
  });
  for (const [o, h] of add) o.add(h);
  clip = gl.animations[0]; if (clip) { mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play(); }
  try { draw(); } catch (e) { window.err = String(e.stack || e); }
  window.done = true;
}, e => { window.err = String(e); window.done = true; });

function bbox() { const b = new THREE.Box3();
  root.updateMatrixWorld(true);
  const names = Object.keys(bones);
  if (names.length) { const v = new THREE.Vector3(); for (const n of names) { bones[n].getWorldPosition(v); b.expandByPoint(v); } b.expandByScalar(0.09); }
  else b.setFromObject(root);
  return b; }
function restBox() { const b = new THREE.Box3(); root.traverse(o => { if (o.isMesh && o.material.defines && !o.material.defines.HULL) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone(); if (!o.isSkinnedMesh) bb.applyMatrix4(o.matrixWorld); b.union(bb); } }); return b; }
function cam(target, size, az, el, aspect, fov) {
  fov = fov || 22; const c = new THREE.PerspectiveCamera(fov, aspect, 0.05, 200);
  const d = size / 2 / Math.tan(fov * Math.PI / 360);
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  c.position.set(target.x + d * Math.sin(a) * Math.cos(e), target.y + d * Math.sin(e), target.z + d * Math.cos(a) * Math.cos(e));
  c.lookAt(target); return c; }
function label(x, y, text, color) { const d = document.createElement('div'); d.textContent = text;
  d.style.cssText = 'position:absolute;left:' + (x + 8) + 'px;top:' + (y + 6) + 'px;color:' + (color || '#3b3f52'); document.getElementById('labels').appendChild(d); }
function panel(x, y, w, h, c, line, bg) {
  const H = renderer.domElement.height;
  renderer.setViewport(x, H - y - h, w, h); renderer.setScissor(x, H - y - h, w, h); renderer.setScissorTest(true);
  renderer.setClearColor(bg || OPT.bg, 1); renderer.clear();
  for (const hm of hulls) hm.material.uniforms.uLine.value = line;
  renderer.render(scene, c); }
function setTime(t) { if (mixer) { mixer.setTime(t); root.updateMatrixWorld(true); } }
function size(w, h) { renderer.setSize(w, h, false); const c = renderer.domElement; c.style.width = w + 'px'; c.style.height = h + 'px'; window.sheetSize = [w, h]; }

function draw() {
  const rb = restBox(), ctr = rb.getCenter(new THREE.Vector3()), sz = rb.getSize(new THREE.Vector3());
  const Hm = sz.y, line = OPT.line / 100 * Math.max(Hm, 0.4);
  const o = OPT;
  if (SHEET === 'turn') {
    const h = o.h, w = Math.round(h * 0.70), cw = Math.round(h * 0.56), full = Hm * 1.08;
    const views = [['front 3/4', 28, 6], ['front', 0, 4], ['side', 90, 4], ['back 3/4', 152, 6]];
    size(w * views.length + cw, h);
    views.forEach(([n, az, el], i) => { panel(i * w, 0, w, h, cam(ctr, full, az, el, w / h), line); label(i * w, 0, n); });
    const x = w * views.length, hh = h / 2;
    const hd = bones.head ? bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, Hm * 0.075, 0.0)) : ctr;
    panel(x, 0, cw, hh, cam(hd, Hm * 0.27, 24, 4, cw / hh), line); label(x, 0, 'head');
    const hl = bones.middle1_L ? bones.middle1_L.getWorldPosition(new THREE.Vector3()) : ctr;
    panel(x, hh, cw / 2, hh, cam(hl, Hm * 0.17, 62, 28, cw / 2 / hh), line); label(x, hh, 'hand (back)');
    panel(x + cw / 2, hh, cw / 2, hh, cam(hl, Hm * 0.17, -20, -30, cw / 2 / hh), line); label(x + cw / 2, hh, 'hand (palm)');
  } else if (SHEET === 'hands') {
    const h = o.h, w = h; const V = [['back', 62, 28], ['palm', -20, -30], ['thumb side', 0, 5], ['pinky side', 170, 10], ['tips', 60, -50], ['above', 100, 70]]; size(w * 3, h * 2);
    const b = new THREE.Box3(); for (const n of ['hand_L', 'middle2_L', 'thumb2_L', 'pinky2_L', 'index2_L']) b.expandByPoint(bones[n].getWorldPosition(new THREE.Vector3()));
    const t = b.getCenter(new THREE.Vector3());
    V.forEach(([n, az, el], i) => { const x = (i % 3) * w, y = Math.floor(i / 3) * h; panel(x, y, w, h, cam(t, Hm * 0.16, az, el, 1), line); label(x, y, n); });
  } else if (SHEET === 'one') {
    const h = o.h, w = Math.round(h * (o.aspect || 0.6)); size(w, h);
    const t = o.at && bones[o.at] ? bones[o.at].getWorldPosition(new THREE.Vector3()) : ctr;
    if (o.time !== undefined) setTime(o.time);
    panel(0, 0, w, h, cam(t, Hm * (o.zoom ? 1.08 / o.zoom : 1.08), o.az || 0, o.el || 0, w / h), line);
  } else if (SHEET === 'game') {
    // in-game size: the band stands about 200 px tall on the laptop stage, 150 px on a phone
    size(1280 + 390, 844); renderer.setScissorTest(false); renderer.setClearColor('#ffffff', 1); renderer.clear();
    const bg = '#5b4a8a';
    const draw3 = (X, Y, W, Hh, px, lw) => { renderer.setViewport(0, 0, 1, 1);
      const n = 3, az = [-22, 8, 30];
      for (let i = 0; i < n; i++) { const pw = W / n; const full = Hm * (Hh / px);
        panel(X + i * pw, Y, pw, Hh, cam(ctr, full, az[i], 5, pw / Hh), lw / 100 * Hm, bg); } };
    draw3(0, 0, 1280, 665, 205, o.gline || 1.25); label(0, 0, 'laptop 1280x665, character 205 px tall', '#fff');
    draw3(1280, 0, 390, 844, 150, o.gline || 1.25); label(1280, 0, 'phone 390x844, 150 px', '#fff');
    draw3(0, 665, 1280, 179, 120, o.gline || 1.25);
  } else if (SHEET === 'poses') {
    const n = clip ? Math.max(1, Math.round(clip.duration * 24) + 1) : 1; const cols = o.cols || Math.min(n, 5), rows = Math.ceil(n / cols);
    const h = o.h, w = Math.round(h * 0.78); size(w * cols, h * rows);
    const names = (o.names || '').split(',');
    for (let i = 0; i < n; i++) { setTime(i / 24); const b = bbox(); const c2 = b.getCenter(new THREE.Vector3()); const s = b.getSize(new THREE.Vector3());
      const x = (i % cols) * w, y = Math.floor(i / cols) * h;
      panel(x, y, w, h, cam(c2, Math.max(s.y, s.x * 1.05, Hm * 0.9) * 1.1, o.az === undefined ? 24 : o.az, o.el === undefined ? 6 : o.el, w / h), line); label(x, y, names[i] || ('pose ' + i)); }
  } else if (SHEET === 'closeups') {
    // joints of every pose, close: shoulder, elbow, wrist/hand, hip, knee
    const n = clip ? Math.max(1, Math.round(clip.duration * 24) + 1) : 1; const list = (o.frames !== undefined ? String(o.frames).split(',').map(Number) : [...Array(n).keys()]);
    const spots = [['shoulder', 'upperarm_L', 0.34, 30, 10], ['elbow', 'forearm_L', 0.30, 40, 5], ['hand', 'middle1_L', 0.24, 50, 15], ['hip', 'thigh_L', 0.42, 35, 0], ['knee', 'shin_L', 0.36, 60, 0], ['back', 'chest', 0.6, 180, 10]];
    const h = o.h, w = h; size(w * spots.length, h * list.length);
    list.forEach((fr, r) => { setTime(fr / 24); spots.forEach(([nm, bn, s, az, el], k) => { const t = bones[bn].getWorldPosition(new THREE.Vector3());
      panel(k * w, r * h, w, h, cam(t, Hm * s * 0.6, az, el, 1), line); label(k * w, r * h, 'pose ' + fr + ' ' + nm); }); });
  } else {  // prop
    const h = o.h, w = Math.round(h * 1.6); const s = Math.max(sz.x / 1.6, sz.y, sz.z) * 1.12; size(w * 2, h * 2); const lw = o.lw || 0.006;   // lw: ink width in metres (a 1.8 m character's line is 0.009)
    [['3/4', 30, 18], ['front', 0, 0], ['back 3/4', 205, 14], ['top / edge', 0, 80]].forEach(([n, az, el], i) => { const x = (i % 2) * w, y = Math.floor(i / 2) * h;
      panel(x, y, w, h, cam(ctr, s, az, el, w / h), lw); label(x, y, n); });
  }
  window.stats = stats;
}
</script></body></html>`;

(async () => {
  const html = page(fs.readFileSync(glbPath).toString('base64'), fs.readFileSync(bundlePath, 'utf8'));
  const tmp = outPath.replace(/\.png$/, '') + '.html';
  fs.writeFileSync(tmp, html);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', e => console.log('page error:', e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 400)); });
  await p.goto('file://' + path.resolve(tmp));
  await p.waitForFunction('window.done', null, { timeout: 180000 });
  const err = await p.evaluate('window.err');
  if (err) { console.log('viewer error:', err); }
  const [w, h] = await p.evaluate('window.sheetSize');
  await p.setViewportSize({ width: w, height: h });
  await p.waitForTimeout(150);
  await p.screenshot({ path: outPath, clip: { x: 0, y: 0, width: w, height: h } });
  console.log(outPath, w + 'x' + h, JSON.stringify(await p.evaluate('window.stats')));
  await b.close();
  if (!process.env.SJ_KEEP_HTML) fs.unlinkSync(tmp);
})().catch(e => { console.error(e); process.exit(1); });
