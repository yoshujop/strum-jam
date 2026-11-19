// The animation toolkit (src/53-rig.js) and the 2D-ink faces (src/54-face.js) in the real engine:
//   node test/rigshot.js <outdir> [what]         (NODE_PATH=$(npm root -g) for Playwright)
// what (default: all), comma separated:
//   faces    faces-<spec>.png: every expression preset of each ready-made face spec (pure 2D, fast), faces-small.png: the
//            same at 40 px (what a face is on a phone), faces-tween.png: the in-between frames of a change
//   sheet    rig-sheet.png: 24 frames across two bars (3 per beat; frame 0 of each beat is the contact) in the studio,
//            rig-big-<n>.png: four of them large, rig-face.png: head close-ups on 8 beats
//   stage    rig-stage-1280x665-<n>.png / rig-stage-390x844-<n>.png: real in-game size on the lit stage (beats 0, 2.33, 6.67, 7)
//   poses    rig-poses.png: every pose of Rig.POSES held (the library at a glance), rig-hands.png: the hand presets
//   perf     prints the cost of rig.update + face.update for five characters (ms per frame, in this browser)
// Also writes dist/rigdemo.html: the live demo (open it in a browser).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ROOT, findModel, buildPage } = require('./gfxpage.js');
const out = process.argv[2] || '/tmp/rigshot'; fs.mkdirSync(out, { recursive: true });
const what = (process.argv[3] || 'faces,sheet,stage,poses,perf').split(',');
const models = ['mannequin', 'guitar', 'club'].map(findModel);
const demo = fs.readFileSync(path.join(__dirname, 'rigdemo.js'), 'utf8');
const pageJs = demo + `
const Shot = {};
Shot.png = cv => cv.toDataURL('image/png');
// ---- faces (2D only) ------------------------------------------------------------------------------------------
Shot.faces = () => {
  const outs = {}, specs = Object.keys(FaceDecal.SPECS);
  for (const s of specs) outs['faces-' + s] = Shot.png(FaceDecal.sheet(s, null, 256));
  // phone size: each face drawn at 512 then shown 40 px wide (bilinear, like the mipmapped decal), 3x zoom beside it
  const names = Object.keys(FaceDecal.PRESETS), cv = document.createElement('canvas'); cv.width = names.length * 50 + 10; cv.height = specs.length * 190 + 10; const c = cv.getContext('2d');
  c.fillStyle = '#efe6d6'; c.fillRect(0, 0, cv.width, cv.height);
  specs.forEach((s, r) => { const f = FaceDecal.create(null, s, { size: 512 }); f.autoBlink = false;
    names.forEach((n, i) => { f.set(n, { snap: true }); f.draw(); const x = 10 + i * 50, y = 10 + r * 190;
      const t = document.createElement('canvas'); t.width = t.height = 128; const tc = t.getContext('2d'); tc.imageSmoothingQuality = 'high'; tc.drawImage(f.canvas, 0, 0, 128, 128);
      c.fillStyle = '#f5b48a'; c.beginPath(); c.ellipse(x + 20, y + 21, 19, 20, 0, 0, 7); c.fill(); c.imageSmoothingQuality = 'high'; c.drawImage(t, x, y, 40, 40); }); });
  outs['faces-small'] = Shot.png(cv);
  // a change, frame by frame: happy -> shock -> angry
  const f = FaceDecal.create(null, 'hero', { size: 256 }); f.autoBlink = false; f.set('happy', { snap: true }); f.draw();
  const tw = document.createElement('canvas'); tw.width = 256 * 8; tw.height = 256; const t2 = tw.getContext('2d'); let col = 0;
  const put = () => { t2.fillStyle = '#f5b48a'; t2.beginPath(); t2.ellipse(col * 256 + 128, 133, 118, 120, 0, 0, 7); t2.fill(); t2.drawImage(f.canvas, col * 256, 0); col++; };
  put(); f.set('shock'); f.draw(); put(); f.update(0.05); put(); f.update(0.05); put(); f.set('angry'); f.draw(); put(); f.update(0.05); put(); f.update(0.05); put(); f.blink(); f.update(0.04); f.update(0.04); put();
  outs['faces-tween'] = Shot.png(tw);
  return outs;
};
// ---- the demo, stepped at 60 fps; frames are grabbed with GFX.snapshot ------------------------------------------
Shot.sheet = async (CW, CH) => {
  const D = await RigDemo.init({ tier: 'high', venue: 'studio' }), T = THREE, dt = 1 / 60;
  for (let i = 0; i < 480; i++) D.step(dt, false);                         // one full loop of warm-up: springs and loops are in their cycle
  const sheet = document.createElement('canvas'); sheet.width = CW * 6; sheet.height = CH * 4; const cx = sheet.getContext('2d'), outs = {};
  const faces = document.createElement('canvas'); faces.width = 300 * 8; faces.height = 300; const fx = faces.getContext('2d');
  const fcam = new T.PerspectiveCamera(14, 1, 0.1, 50), hp = new T.Vector3();
  const big = { 0: 'contact', 7: 'offbeat', 20: 'windup', 21: 'pump' };
  for (let f = 0; f < 24; f++) {
    D.scene.updateMatrixWorld(true);
    cx.drawImage(GFX.snapshot(D.scene, D.cam, CW, CH), (f % 6) * CW, Math.floor(f / 6) * CH);
    cx.fillStyle = '#1E1B2E'; cx.font = '600 20px sans-serif'; cx.fillText('beat ' + (f / 3).toFixed(2), (f % 6) * CW + 10, Math.floor(f / 6) * CH + 26);
    if (f in big) outs['rig-big-' + big[f]] = Shot.png(GFX.snapshot(D.scene, D.cam, 1400, 1000));
    if (f % 3 === 1) { D.chars[0].rig.worldPos('head', hp); fcam.position.set(hp.x + 0.5, hp.y + 0.12, hp.z + 3.4); fcam.lookAt(hp.x, hp.y + 0.1, hp.z); fcam.updateMatrixWorld(true);
      fx.drawImage(GFX.snapshot(D.scene, fcam, 300, 300), Math.floor(f / 3) * 300, 0); }
    for (let i = 0; i < 20; i++) D.step(dt, false);                        // 1/3 of a beat at 120 bpm
  }
  outs['rig-sheet'] = Shot.png(sheet); outs['rig-face'] = Shot.png(faces);
  return { outs, errors: D.errors, redraws: D.chars.map(c => c.face.redraws) };
};
Shot.stage = async (tier) => { Shot.D = await RigDemo.init({ tier, venue: 'stage' }); if (typeof VFX !== 'undefined') Shot.D.scene.add(VFX.init()); for (let i = 0; i < 480; i++) Shot.D.step(1 / 60, false); Shot.at = 0; };
Shot.until = async beat => { const D = Shot.D, n = Math.round((beat - Shot.at) * 30); for (let i = 0; i < n; i++) D.step(1 / 60, i >= n - 3); Shot.at = beat; await new Promise(r => requestAnimationFrame(r)); return Object.assign({ errors: D.errors }, GFX.stats); };
// ---- the pose library, each pose held ---------------------------------------------------------------------------
Shot.poses = async () => {
  const T = THREE; await Assets.load(); GFX.init(document.getElementById('c'), { tier: 'high', auto: false });
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(24, 1, 0.1, 100); GfxTest.studio(scene);
  const m = Assets.spawn('mannequin'); scene.add(m.root); const rig = Rig.create(m), face = FaceDecal.create(m, 'hero'); rig.plant('foot_L'); rig.plant('foot_R');
  const L = rig.layer('p', { mask: 'all' }), names = Object.keys(Rig.POSES), cols = 7, CW = 380, CH = 470, rows = Math.ceil(names.length / cols);
  const cv = document.createElement('canvas'); cv.width = cols * CW; cv.height = rows * CH; const c = cv.getContext('2d');
  cam.position.set(2.2, 1.35, 6.6); cam.lookAt(0, 1.0, 0); cam.updateMatrixWorld(true); GFX.shadow.center = new T.Vector3(0, 1, 0); GFX.shadow.radius = 2.5;
  names.forEach((n, i) => { L.to(n, { in: 0 }); for (let k = 0; k < 3; k++) rig.update(i + k * 0.01, 0); scene.updateMatrixWorld(true);
    c.drawImage(GFX.snapshot(scene, cam, CW, CH), (i % cols) * CW, Math.floor(i / cols) * CH); c.fillStyle = '#1E1B2E'; c.font = '600 20px sans-serif'; c.fillText(n, (i % cols) * CW + 10, Math.floor(i / cols) * CH + 26); });
  const outs = { 'rig-poses': Shot.png(cv) };
  // hands: the left hand, palm to the camera
  const hn = Object.keys(Rig.HANDS), hv = document.createElement('canvas'); hv.width = hn.length * 300; hv.height = 600; const hc = hv.getContext('2d'), hp = new T.Vector3();
  L.to({ bones: { upperarm_L: [0, -60, 30], forearm_L: { bend: 60 }, upperarm_R: [0, 60, -30], forearm_R: { bend: 60 } } }, { in: 0 });
  hn.forEach((n, i) => { rig.hand('L', n); rig.hand('R', n); rig.update(100 + i, 0); scene.updateMatrixWorld(true);
    ['L', 'R'].forEach((s, r) => { rig.worldPos('middle1_' + s, hp); cam.fov = 6; cam.position.set(hp.x + (s === 'L' ? 1.2 : -2.2), hp.y + 0.8, hp.z + 3.2); cam.lookAt(hp); cam.updateMatrixWorld(true);
      hc.drawImage(GFX.snapshot(scene, cam, 300, 300), i * 300, r * 300); }); hc.fillStyle = '#1E1B2E'; hc.font = '600 20px sans-serif'; hc.fillText(n, i * 300 + 10, 26); });
  outs['rig-hands'] = Shot.png(hv);
  return outs;
};
Shot.perf = async () => {
  const T = THREE; await Assets.load(); const scene = new T.Scene(), list = [];
  if (!GFX.r) GFX.init(document.getElementById('c'), { tier: 'low', auto: false });
  for (let i = 0; i < 5; i++) { const m = Assets.spawn('mannequin', { faceSize: 256 }); m.root.position.x = i; scene.add(m.root); const rig = Rig.create(m), face = FaceDecal.create(m, 'hero');
    rig.layer('body', { mask: 'body' }).loop([{ at: 0, pose: 'bob_down', in: 0.15, over: 0.3, follow: 0.03 }, { at: 0.5, pose: 'bob_up', in: 0.3, follow: 0.03 }], 1);
    rig.layer('sway', { mask: 'torso,head', mode: 'add' }).loop([{ at: 0, pose: 'sway_L', in: 0.3 }, { at: 2, pose: 'sway_R', in: 0.3 }], 4);
    rig.layer('arms', { mask: 'arms' }).to('guitar_hold', { in: 0 });
    rig.plant('foot_L'); rig.plant('foot_R'); rig.ik('arm_L', { target: [0.3, 1.2, 0.3], tip: 'att_hand_L' }); rig.ik('arm_R', { target: [-0.2, 1.0, 0.3], tip: 'att_hand_R' });
    rig.lookAt(new T.Vector3(0, 1.6, 8)); list.push({ rig, face }); }
  scene.updateMatrixWorld(true);
  let beat = 0; const N = 3000, dt = 1 / 60; for (let i = 0; i < 300; i++) { beat += dt * 2; for (const c of list) { c.rig.update(beat, dt); c.face.update(dt); } }
  const r0 = list.reduce((a, c) => a + c.face.redraws, 0), t0 = performance.now();
  for (let i = 0; i < N; i++) { beat += dt * 2; for (const c of list) { c.rig.update(beat, dt); c.face.look(c.rig.look.eyeX, -c.rig.look.eyeY); c.face.update(dt); } }
  const t1 = performance.now();
  for (let i = 0; i < N; i++) { beat += dt * 2; for (const c of list) c.rig.update(beat, dt); }
  const t2 = performance.now();
  return { fiveCharsRigAndFaceMs: +((t1 - t0) / N).toFixed(4), fiveCharsRigOnlyMs: +((t2 - t1) / N).toFixed(4), faceRedrawsPerSecondPerChar: +((list.reduce((a, c) => a + c.face.redraws, 0) - r0) / 5 / (N / 60)).toFixed(2), bones: list[0].rig.nb };
};
`;
(async () => {
  const html = path.join(out, 'rigshot.html'); fs.writeFileSync(html, buildPage(models, pageJs, '', 'rigshot'));
  // the live demo
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'dist', 'rigdemo.html'), buildPage(models, demo + `
RigDemo.init({ tier: new URLSearchParams(location.search).get('tier') || 'medium', venue: new URLSearchParams(location.search).get('venue') || 'stage' }).then(D => { let last = performance.now();
  if (typeof VFX !== 'undefined') D.scene.add(VFX.init());
  const loop = now => { const dt = Math.min(0.1, (now - last) / 1000); last = now; D.step(dt); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });`, '', 'Strum Jam rig demo'));
  const b = await chromium.launch(); let bad = false;
  const open = async (w, h) => { const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => { bad = true; console.log('PAGE ERROR', e.message); }); p.on('console', m => { if (m.type() === 'error') { bad = true; console.log('CONSOLE', m.text()); } });
    await p.goto('file://' + html); return p; };
  const save = (name, dataUrl) => { const f = path.join(out, name + '.png'); fs.writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64')); console.log(f); };
  if (what.includes('faces')) { const p = await open(800, 600); const o = await p.evaluate(() => Shot.faces()); for (const k in o) save(k, o[k]); await p.close(); }
  if (what.includes('sheet')) { const p = await open(1280, 800); const [cw, ch] = (process.env.CELL || '560x480').split('x').map(Number);
    const r = await p.evaluate(a => Shot.sheet(a[0], a[1]), [cw, ch]); for (const k in r.outs) save(k, r.outs[k]); console.log('face redraws over 16 beats:', r.redraws, r.errors.length ? r.errors : ''); await p.close(); }
  if (what.includes('poses')) { const p = await open(1280, 800); const o = await p.evaluate(() => Shot.poses()); for (const k in o) save(k, o[k]); await p.close(); }
  if (what.includes('stage')) for (const [w, h] of [[1280, 665], [390, 844]]) {
    const p = await open(w, h); await p.evaluate(t => Shot.stage(t), process.env.TIER || 'medium');
    for (const [beat, n] of [[0.02, 'contact'], [2.34, 'mid'], [6.68, 'windup'], [7.0, 'pump'], [7.12, 'settle']]) { const st = await p.evaluate(bt => Shot.until(bt), beat);
      const f = path.join(out, 'rig-stage-' + w + 'x' + h + '-' + n + '.png'); await p.screenshot({ path: f }); console.log(f, st.calls + ' draws', st.tris + ' tris', st.errors.length ? st.errors : ''); }
    await p.close(); }
  if (what.includes('perf')) { const p = await open(640, 400); console.log('perf', JSON.stringify(await p.evaluate(() => Shot.perf()))); await p.close(); }
  await b.close(); if (bad) process.exitCode = 2;
})();
