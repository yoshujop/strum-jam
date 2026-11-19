// Renders any ASSET SPEC v1 model through the REAL engine (GFX + Toon + Assets + StageKit), so what you see is what
// the game will draw:   node test/modelshot.js <name-or-path.glb> [outdir]      (NODE_PATH=$(npm root -g) for Playwright)
//   <name>-turntable.png   8 angles, 4x2 contact sheet (each cell 640x800), studio light, high tier
//   <name>-close-*.png     close-ups: top half from the front-left, top third from the front, a low hero angle
//   <name>-stage-1280x665.png / -390x844.png   at real in-game size on the sample lit stage (medium tier), with the
//                          fixture band around it when the model is a character
//   <name>-info.json       triangles, draws, bones, material classes, spec warnings, GFX.stats of the stage frame
// Options (env): TIER=low|medium|high for the stage shots, CELL=640x800, EXTRA=amp,guitar (more models to load),
//   ALONE=1 (no fixture band), POSE=0 (rest pose on the stage), NOSTUDIO=1 (stage shots only).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { findModel, buildPage } = require('./gfxpage.js');
const arg = process.argv[2]; if (!arg) { console.error('usage: node test/modelshot.js <name-or-path.glb> [outdir]'); process.exit(1); }
const out = process.argv[3] || '/tmp/modelshot'; fs.mkdirSync(out, { recursive: true });
const model = findModel(arg), models = [model];
for (const n of ['club', 'cap'].concat((process.env.EXTRA || '').split(',').filter(Boolean))) if (!models.some(m => m.name === n)) { try { models.push(findModel(n)); } catch (e) {} }
const [CW, CH] = (process.env.CELL || '640x800').split('x').map(Number);

const pageJs = `
const NAME = ${JSON.stringify(model.name)}, CW = ${CW}, CH = ${CH};
const Shot = { errors: [] };
window.addEventListener('error', e => Shot.errors.push(e.message));
Shot.ready = (async () => {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await Assets.load();
  Shot.info = Assets.info(NAME);
})();
Shot.box = inst => { inst.root.updateMatrixWorld(true); const b = new THREE.Box3(); inst.meshes.forEach(m => { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); }); return b; };
// studio: turntable + close-ups, drawn with GFX.snapshot into 2D canvases
Shot.studio = () => {
  const T = THREE, canvas = document.getElementById('c');
  GFX.init(canvas, { tier: 'high', auto: false });
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(24, CW / CH, 0.1, 200);
    const studio = GfxTest.studio(scene);

  const inst = Assets.spawn(NAME); scene.add(inst.root);
  if (inst.face) GfxTest.face(inst);
  const box = Shot.box(inst), c = box.getCenter(new T.Vector3()), s = box.getSize(new T.Vector3());
    studio.floor.position.y = Math.min(0, box.min.y) - 0.001;            // props modelled around their origin still stand on the paper
  GFX.shadow.center = c.clone(); GFX.shadow.radius = Math.max(s.x, s.y, s.z) * 0.9 + 0.3;
  const sheet = document.createElement('canvas'); sheet.width = CW * 4; sheet.height = CH * 2;
  const cx = sheet.getContext('2d');
  for (let i = 0; i < 8; i++) { GfxTest.frame(cam, box, i * 45, 8, 1.12); cx.drawImage(GFX.snapshot(scene, cam, CW, CH), (i % 4) * CW, (i >> 2) * CH); }
  const outs = { turntable: sheet.toDataURL('image/png') };
  const sub = (y0, y1, x0, x1) => { const b = box.clone(); b.min.y = box.min.y + s.y * y0; b.max.y = box.min.y + s.y * y1; if (x0 != null) { b.min.x = c.x + s.x * x0; b.max.x = c.x + s.x * x1; b.min.z = c.z - s.x * 0.2; b.max.z = c.z + s.x * 0.2; } return b; };
  const snap = (b, az, el, w, h, pad) => { cam.aspect = w / h; GfxTest.frame(cam, b, az, el, pad || 1.08); return GFX.snapshot(scene, cam, w, h).toDataURL('image/png'); };
  outs['close-upper'] = snap(sub(0.5, 1), -28, 6, 1100, 1100);
  outs['close-top'] = snap(sub(0.68, 1), 12, 2, 1100, 1100);
  outs['close-low'] = snap(sub(0, 1), 35, -12, 900, 1100);
  outs['close-side'] = snap(sub(0.3, 0.75), 80, 10, 1100, 1100);
  inst.dispose(); StageKit.clear(); GFX.dispose();
  return outs;
};
// stage: live frames at the page's real size
Shot.stage = async (tier, alone, pose) => {
  const T = THREE, canvas = document.getElementById('c');
  GFX.init(canvas, { tier, auto: false });
  const scene = new T.Scene(), portrait = innerHeight > innerWidth;
  const cam = new T.PerspectiveCamera(portrait ? 34 : 30, innerWidth / innerHeight, 0.1, 200);
  GFX.setScene(scene, cam);
  const st = GfxTest.stage(scene);
  scene.add(VFX.init());
  const inst = Assets.spawn(NAME); scene.add(inst.root);
  const isChar = !!inst.bones.hips, band = [];
  if (inst.face) GfxTest.face(inst);
  const venueLike = !isChar && Shot.box(inst).getSize(new T.Vector3()).y > 3.5;
  if (venueLike && st.venue) st.venue.root.visible = false;
  if (isChar) { band.push(inst); StageKit.blob(inst.root, 0.42); }
  if (!alone && Assets.has('cap')) {
    const xs = isChar ? [-3.2, -1.6, 1.6, 3.2] : venueLike ? [-3.2, -1.6, 0, 1.6, 3.2] : [-2.4, 2.4];
    xs.forEach((x, i) => { const m = Assets.spawn('cap'); m.root.position.set(x, 0, -0.3 - 0.3 * Math.abs(x)); scene.add(m.root); if (m.face) GfxTest.face(m, i + 1); band.push(m); StageKit.blob(m.root, 0.42); });
  }
  if (portrait) { cam.position.set(0, 1.5, 7.6); cam.lookAt(0, 1.02, 0); } else { cam.position.set(0, 1.7, 10.4); cam.lookAt(0, 1.25, 0); }
  let t = 0, frames = 0;
  await new Promise(res => { const step = () => { const dt = 1 / 30; t += dt;
    if (pose) band.forEach((m, i) => GfxTest.groove(m, 0.4, i * 0.37, 1));
    if (frames === 20) { GFX.beat(1); VFX.hit([1.2, 1.6, 0.8], 'perfect'); VFX.confetti([-2, 2.2, 0.5], { count: 40 }); }
    GFX.render(dt); if (++frames < 34) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
  return Object.assign({}, GFX.stats);
};
`;

(async () => {
  const html = path.join(out, model.name + '-modelshot.html');
  fs.writeFileSync(html, buildPage(models, pageJs, '', 'modelshot ' + model.name));
  const b = await chromium.launch();
  const open = async (w, h) => { const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/ReadPixels/.test(m.text())) errs.push(m.text()); });
    await p.goto('file://' + html); await p.evaluate(() => Shot.ready); return { p, errs }; };
  const save = (name, dataUrl) => { const f = path.join(out, model.name + '-' + name + '.png'); fs.writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64')); console.log(f); };
  let { p, errs } = await open(1280, 800);
  const info = await p.evaluate(() => Shot.info);
  if (!process.env.NOSTUDIO) { const outs = await p.evaluate(() => Shot.studio()); for (const k in outs) save(k, outs[k]); }
  await p.close();
  const stats = {};
  for (const [w, h] of [[1280, 665], [390, 844]]) {
    const o = await open(w, h); errs = errs.concat(o.errs);
    stats[w + 'x' + h] = await o.p.evaluate(a => Shot.stage(a.tier, a.alone, a.pose), { tier: process.env.TIER || 'medium', alone: !!process.env.ALONE, pose: process.env.POSE !== '0' });
    const f = path.join(out, model.name + '-stage-' + w + 'x' + h + '.png'); await o.p.screenshot({ path: f }); console.log(f);
    errs = errs.concat(o.errs.slice()); await o.p.close();
  }
  errs = Array.from(new Set(errs));
  fs.writeFileSync(path.join(out, model.name + '-info.json'), JSON.stringify({ info, stage: stats, errors: errs }, null, 1));
  console.log(JSON.stringify({ tris: info.tris, verts: info.verts, draws: info.draws, bones: info.bones, classes: info.classes, size: info.size, warnings: info.warnings, stage: stats }, null, 1));
  if (errs.length) { console.log('PAGE ERRORS / WARNINGS:\n  ' + errs.join('\n  ')); process.exitCode = 2; }
  await b.close();
})();
