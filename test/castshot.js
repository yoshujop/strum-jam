// A band member from src/55-cast.js through the REAL engine (Assets + Rig + FaceDecal + Toon + StageKit):
//   node test/castshot.js <outdir> [what] [member=riff]        (NODE_PATH=$(npm root -g) for Playwright; minutes: software GL)
// what (default: all), comma separated:
//   faces    <m>-faces.png: every named expression as 2D ink (large, and at 40 px = a face on a phone)
//   turn     <m>-turntable.png: the rest pose, no instrument, 8 angles
//   hair     (with turn) <m>-hair.png: the head close up from 8 angles (the last one from above)
//   heads    <m>-heads.png: the head in 3D with 6 expressions, front and three-quarter
//   hold     <m>-hold.png: the hands on the instrument from three sides;  <m>-hype.png: the hair's hype levels 0..4
//   poses    <m>-poses.png: the signature poses, front and three-quarter;  <m>-pose-<name>.png large
//   sil      <m>-silhouette.png: ART_BIBLE 12.1, black silhouettes at 64 px (and x4), without and with the instrument
//   stage    <m>-stage-1280x665-<pose>.png / -390x844-<pose>.png: on the lit club stage at real in-game size, framed as the
//            hero (low, close camera); FRAME=wide for the old whole-band distance
// Env: FRAME=wide (stage);  MODELS=path/a.glb,path/b.glb to use scratch builds instead of vendor/models.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { findModel, buildPage } = require('./gfxpage.js');
const out = process.argv[2] || '/tmp/castshot'; fs.mkdirSync(out, { recursive: true });
const what = (process.argv[3] || 'faces,turn,heads,hold,poses,sil,stage').split(',');
const member = process.argv[4] || 'riff';
const over = (process.env.MODELS || '').split(',').filter(Boolean).map(findModel);
const need = { riff: ['riff', 'offcut'] }[member].concat(['club']);
const models = need.map(n => over.find(m => m.name === n) || findModel(n));

const pageJs = `
const M = ${JSON.stringify(member)}, DEF = Cast[M], Shot = { errors: [] };
window.addEventListener('error', e => Shot.errors.push(e.message));
Shot.png = cv => cv.toDataURL('image/png');
Shot.ready = (async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; await Assets.load(); Shot.info = Assets.info(DEF.model); })();
Shot.label = (c, t, x, y) => { c.fillStyle = '#1E1B2E'; c.font = '600 20px sans-serif'; c.textAlign = 'left'; c.fillText(t, x + 10, y + 26); };
// ---- 2D faces
Shot.faces = () => {
  const names = Object.keys(DEF.face.expressions), cell = 320, cols = 5, rows = Math.ceil(names.length / cols);
  const cv = document.createElement('canvas'); cv.width = cols * cell; cv.height = rows * (cell + 24) + 70; const c = cv.getContext('2d');
  c.fillStyle = '#efe6d6'; c.fillRect(0, 0, cv.width, cv.height);
  const f = FaceDecal.create(null, DEF.face.spec, { size: 512 }); f.autoBlink = false;
  names.forEach((n, i) => { const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + 24); f.set(DEF.face.expressions[n], { snap: true }); f.draw();
    c.fillStyle = DEF.palette.skin; c.beginPath(); c.ellipse(x + cell / 2, y + cell * 0.5, cell * 0.49, cell * 0.5, 0, 0, 7); c.fill();
    c.fillStyle = DEF.palette.hair; c.fillRect(x + 4, y, cell - 8, cell * 0.1); c.drawImage(f.canvas, x, y, cell, cell);
    c.fillStyle = '#1E1B2E'; c.font = '600 17px sans-serif'; c.textAlign = 'center'; c.fillText(n, x + cell / 2, y + cell + 17);
    const t = document.createElement('canvas'); t.width = t.height = 128; const tc = t.getContext('2d'); tc.imageSmoothingQuality = 'high'; tc.drawImage(f.canvas, 0, 0, 128, 128);
    const sx = 20 + i * 60, sy = rows * (cell + 24) + 12; c.fillStyle = DEF.palette.skin; c.beginPath(); c.ellipse(sx + 20, sy + 21, 20, 21, 0, 0, 7); c.fill(); c.imageSmoothingQuality = 'high'; c.drawImage(t, sx, sy, 40, 40); });
  return { faces: Shot.png(cv) };
};
// ---- studio
Shot.beat = 8;
Shot.settle = (A, n) => { for (let i = 0; i < (n || 40); i++) A.update(Shot.beat += 0.03, 1 / 60); A.face.autoBlink = false; A.face.bk = 1; A.face.bs = 0; A.face.draw(); Shot.scene.updateMatrixWorld(true); };
Shot.studio = async (what) => {
  const T = THREE; GFX.init(document.getElementById('c'), { tier: 'high', auto: false });
  const scene = Shot.scene = new T.Scene(), cam = new T.PerspectiveCamera(24, 1, 0.1, 200); GfxTest.studio(scene);
  GFX.shadow.center = new T.Vector3(0, 1, 0); GFX.shadow.radius = 2.6;
  const outs = {}, front = new T.Vector3(0, 1.5, 8), hp = new T.Vector3();
  const snap = (b, az, el, w, h, pad) => { cam.aspect = w / h; GfxTest.frame(cam, b, az, el, pad || 1.08); return GFX.snapshot(scene, cam, w, h); };
  const box = (x0, y0, z0, x1, y1, z1) => new T.Box3(new T.Vector3(x0, y0, z0), new T.Vector3(x1, y1, z1));
  if (what.includes('turn')) {
    const A = Cast.spawn(M, { guitar: false }); scene.add(A.root); A.rig.layerBy.arms.to('rest', { in: 0 }); A.rig.lookAt(null); Shot.settle(A);
    const CW = 560, CH = 760, cv = document.createElement('canvas'); cv.width = CW * 4; cv.height = CH * 2; const c = cv.getContext('2d'), b = box(-0.75, 0, -0.3, 0.75, 1.82, 0.3);
    for (let i = 0; i < 8; i++) c.drawImage(snap(b, i * 45, 6, CW, CH, 1.06), (i % 4) * CW, (i >> 2) * CH);
    outs.turntable = Shot.png(cv);
    const cv2 = document.createElement('canvas'); cv2.width = 2400; cv2.height = 1200; const c2 = cv2.getContext('2d');
    c2.drawImage(snap(box(-0.45, 1.0, -0.3, 0.45, 1.82, 0.3), -25, 4, 1200, 1200, 1.0), 0, 0); c2.drawImage(snap(box(-0.5, 0, -0.3, 0.5, 0.7, 0.3), 30, 12, 1200, 1200, 1.0), 1200, 0);
    outs.detail = Shot.png(cv2);
    if (what.includes('hair')) { A.rig.worldPos('head', hp); const S = 480, hv = document.createElement('canvas'); hv.width = S * 4; hv.height = S * 2; const hc = hv.getContext('2d');
      const hb = box(hp.x - 0.3, hp.y - 0.12, hp.z - 0.3, hp.x + 0.3, hp.y + 0.52, hp.z + 0.3);
      for (let i = 0; i < 8; i++) hc.drawImage(snap(hb, i * 45, i === 7 ? 40 : 6, S, S, 1.0), (i % 4) * S, (i >> 2) * S);
      outs.hair = Shot.png(hv); }
    A.root.visible = false;
  }
  if (what.includes('sil')) {
    // black on paper: the character's pixels are whatever differs from the same shot without it (its cast shadow is switched off)
    const W = 240, H = 300, views = [0, -40, 90, 180], cv = document.createElement('canvas'); cv.width = views.length * 2 * W + 40; cv.height = H + 64 + 60; const c = cv.getContext('2d');
    c.fillStyle = '#efe6d6'; c.fillRect(0, 0, cv.width, cv.height); c.imageSmoothingQuality = 'high';
    const b = box(-0.8, 0, -0.4, 0.8, 1.85, 0.5);
    const sil = (A, az) => { const on = snap(b, az, 4, W, H, 1.04).getContext('2d').getImageData(0, 0, W, H); A.root.visible = false; Shot.scene.updateMatrixWorld(true);
      const off = snap(b, az, 4, W, H, 1.04).getContext('2d').getImageData(0, 0, W, H); A.root.visible = true; Shot.scene.updateMatrixWorld(true);
      const o = document.createElement('canvas'); o.width = W; o.height = H; const oc = o.getContext('2d'), im = oc.createImageData(W, H);
      for (let i = 0; i < W * H * 4; i += 4) { const d = Math.abs(on.data[i] - off.data[i]) + Math.abs(on.data[i + 1] - off.data[i + 1]) + Math.abs(on.data[i + 2] - off.data[i + 2]); const k = d > 26;
        im.data[i] = k ? 30 : 239; im.data[i + 1] = k ? 27 : 230; im.data[i + 2] = k ? 46 : 214; im.data[i + 3] = 255; }
      let y0 = H, y1 = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (im.data[(y * W + x) * 4] < 100) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
      oc.putImageData(im, 0, 0); o.y0 = y0; o.h = Math.max(1, y1 - y0 + 1); return o; };
    const row = (A, col0) => views.forEach((az, i) => { const s = sil(A, az), x = (col0 + i) * W + (col0 ? 40 : 0); c.drawImage(s, x, 0); const k = 64 / s.h; c.drawImage(s, 0, s.y0, W, s.h, x + W / 2 - W * k / 2, H + 40, W * k, 64); });
    const A0 = Cast.spawn(M, { guitar: false }); scene.add(A0.root); A0.root.traverse(o => o.layers.disable(GFX.CAST)); A0.rig.layerBy.arms.to('rest', { in: 0 }); A0.rig.lookAt(null); Shot.settle(A0); row(A0, 0); A0.root.visible = false;
    const A1 = Cast.spawn(M); scene.add(A1.root); A1.root.traverse(o => o.layers.disable(GFX.CAST)); A1.pose('lean'); Shot.settle(A1, 50); row(A1, views.length); A1.root.visible = false;
    Shot.label(c, 'rest, no instrument   (below: 64 px tall)', 0, H); Shot.label(c, 'the Lean, with the instrument', views.length * W + 40, H);
    outs.silhouette = Shot.png(cv);
  }
  if (what.includes('heads') || what.includes('hold') || what.includes('poses')) {
    const A = Cast.spawn(M); scene.add(A.root); A.lookAt(front);
    if (what.includes('heads')) {
      A.pose('rest'); const names = ['smirk', 'locked', 'grin', 'yell', 'flinch', 'camera'], S = 520, cv = document.createElement('canvas'); cv.width = S * 6; cv.height = S * 2; const c = cv.getContext('2d');
      names.forEach((n, i) => { A.express(n, { snap: true }); Shot.settle(A, 6); A.rig.worldPos('head', hp); const b = box(hp.x - 0.26, hp.y - 0.1, hp.z - 0.3, hp.x + 0.26, hp.y + 0.42, hp.z + 0.3);
        c.drawImage(snap(b, 0, 2, S, S, 1.0), i * S, 0); c.drawImage(snap(b, i % 2 ? 38 : -38, 6, S, S, 1.0), i * S, S); Shot.label(c, n, i * S, 0); });
      outs.heads = Shot.png(cv); A.express(DEF.face.base, { snap: true });
    }
    if (what.includes('hold')) {
      A.pose('lean'); A.strum(1, { in: 0 }); Shot.settle(A); A.rig.worldPos('att_hip', hp); const S = 760, cv = document.createElement('canvas'); cv.width = S * 3; cv.height = S * 2; const c = cv.getContext('2d');
      const b = box(hp.x - 0.45, hp.y - 0.3, hp.z - 0.2, hp.x + 0.75, hp.y + 0.55, hp.z + 0.3);
      [[0, 8], [48, 22], [-52, 14]].forEach((v, k) => c.drawImage(snap(b, v[0], v[1], S, S, 0.92), k * S, 0));
      A.strum(-1, { in: 0 }); Shot.settle(A, 10);
      [[0, 60], [20, 4], [-25, 30]].forEach((v, k) => c.drawImage(snap(b, v[0], v[1], S, S, 0.92), k * S, S));
      outs.hold = Shot.png(cv);
      const hv = document.createElement('canvas'); hv.width = 420 * 5; hv.height = 520; const hc = hv.getContext('2d'); A.pose('rest'); A.strum(0, { in: 0 });
      for (let l = 0; l <= 4; l++) { A.hype(l); Shot.settle(A, 60); A.rig.worldPos('head', hp); hc.drawImage(snap(box(-0.45, hp.y + 0.05, -0.3, 0.45, hp.y + 0.95, 0.3), -22, 4, 420, 520, 1.0), l * 420, 0); Shot.label(hc, 'hype ' + l, l * 420, 0); }
      outs.hype = Shot.png(hv); A.hype(0);
    }
    if (what.includes('poses')) {
      const list = [['lean', 0, 'smirk'], ['lean_dip', 1, 'locked'], ['lean', -1, 'grin'], ['kickstand', 1, 'yell']], CW = 640, CH = 760, cv = document.createElement('canvas'); cv.width = CW * 4; cv.height = CH * 2; const c = cv.getContext('2d');
      const b = box(-0.8, 0, -0.4, 0.8, 1.85, 0.5);
      list.forEach((p, i) => { A.pose(p[0]); A.strum(p[1], { in: 0 }); A.express(p[2], { snap: true }); Shot.settle(A, 50);
        c.drawImage(snap(b, 0, 5, CW, CH, 1.04), i * CW, 0); c.drawImage(snap(b, i === 3 ? 55 : -40, 8, CW, CH, 1.04), i * CW, CH);
        Shot.label(c, p[0] + (p[1] ? (p[1] > 0 ? ' + down strum' : ' + up strum') : ''), i * CW, 0);
        if (i === 0 || i === 3) outs['pose-' + p[0]] = Shot.png(snap(b, i === 3 ? 30 : -18, 5, 1100, 1300, 1.02)); });
      outs.poses = Shot.png(cv);
    }
  }
  return outs;
};
// ---- the lit stage at the page's real size
Shot.stage = async (tier) => {
  const T = THREE; GFX.init(document.getElementById('c'), { tier, auto: false });
  const scene = Shot.scene = new T.Scene(), portrait = innerHeight > innerWidth, cam = new T.PerspectiveCamera(portrait ? 34 : 30, innerWidth / innerHeight, 0.1, 200);
  GFX.setScene(scene, cam); GfxTest.stage(scene); if (typeof VFX !== 'undefined') scene.add(VFX.init());
  // hero framing (default): low and close, the character fills about two thirds of the frame height. FRAME=wide: the old band shot.
  if (${JSON.stringify(process.env.FRAME || 'hero')} === 'wide') { if (portrait) { cam.position.set(0, 1.5, 7.6); cam.lookAt(0, 1.02, 0); } else { cam.position.set(0, 1.7, 10.4); cam.lookAt(0, 1.25, 0); } }
  else if (portrait) { cam.position.set(0.3, 0.85, 5.6); cam.lookAt(0.06, 0.96, 0); } else { cam.fov = 28; cam.updateProjectionMatrix(); cam.position.set(0.9, 0.85, 4.9); cam.lookAt(0.2, 1.0, 0); }
  cam.updateMatrixWorld(true);
  const A = Shot.A = Cast.spawn(M); scene.add(A.root); StageKit.blob(A.root, 0.5); A.lookAt(cam.position);
};
Shot.pose = async (p, strum, face, hype) => { const A = Shot.A; A.pose(p); A.strum(strum, { in: 0 }); A.express(face, { snap: true }); A.hype(hype || 0); Shot.settle(A, 50);
  for (let i = 0; i < 4; i++) { GFX.render(1 / 60); await new Promise(r => requestAnimationFrame(r)); } return Object.assign({ errors: Shot.errors }, GFX.stats); };
`;

(async () => {
  const html = path.join(out, member + '-castshot.html'); fs.writeFileSync(html, buildPage(models, pageJs, '', 'castshot ' + member));
  const b = await chromium.launch(); let bad = false;
  const open = async (w, h) => { const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => { bad = true; console.log('PAGE ERROR', e.message); }); p.on('console', m => { if (m.type() === 'error') { bad = true; console.log('CONSOLE', m.text()); } });
    await p.goto('file://' + html); await p.evaluate(() => Shot.ready); return p; };
  const save = (name, dataUrl) => { const f = path.join(out, member + '-' + name + '.png'); fs.writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64')); console.log(f); };
  if (what.includes('faces')) { const p = await open(800, 600); const o = await p.evaluate(() => Shot.faces()); for (const k in o) save(k, o[k]); await p.close(); }
  if (['turn', 'heads', 'hold', 'poses', 'sil'].some(k => what.includes(k))) { const p = await open(1280, 800); const info = await p.evaluate(() => Shot.info);
    console.log(JSON.stringify({ tris: info.tris, draws: info.draws, bones: info.bones, warnings: info.warnings }));
    const o = await p.evaluate(w => Shot.studio(w), what); for (const k in o) save(k, o[k]); await p.close(); }
  if (what.includes('stage')) for (const [w, h] of [[1280, 665], [390, 844]]) {
    const p = await open(w, h); await p.evaluate(t => Shot.stage(t), process.env.TIER || 'medium');
    for (const [pose, strum, face, hype] of [['lean', 1, 'smirk', 0], ['kickstand', 1, 'yell', 4]]) { const st = await p.evaluate(a => Shot.pose(a[0], a[1], a[2], a[3]), [pose, strum, face, hype]);
      const f = path.join(out, member + '-stage-' + w + 'x' + h + '-' + pose + '.png'); await p.screenshot({ path: f }); console.log(f, st.calls + ' draws', st.tris + ' tris', st.errors.length ? st.errors : ''); }
    await p.close(); }
  await b.close(); if (bad) process.exitCode = 2;
})();
