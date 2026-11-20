// A band member from src/55-cast.js through the REAL engine (Assets + Rig + FaceDecal + Toon + StageKit):
//   node test/castshot.js <outdir> [what] [member=riff]        (NODE_PATH=$(npm root -g) for Playwright; minutes: software GL)
// what (default: all), comma separated:
//   faces    <m>-faces.png: every named expression as 2D ink (large, and at 40 px = a face on a phone)
//   turn     <m>-turntable.png: the rest pose, no instrument, 8 angles
//   heads    <m>-heads.png: the head in 3D with 6 expressions, front and three-quarter
//   hold     <m>-hold.png: the hands on the instrument from three sides;  <m>-hype.png: the hair's hype levels 0..4
//   poses    <m>-poses.png: the signature poses, front and three-quarter;  <m>-pose-<name>.png large
//   stage    <m>-stage-1280x665-<pose>.png / -390x844-<pose>.png: on the lit club stage at real in-game size
// Env: MODELS=path/a.glb,path/b.glb to use scratch builds instead of vendor/models.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { findModel, buildPage } = require('./gfxpage.js');
const out = process.argv[2] || '/tmp/castshot'; fs.mkdirSync(out, { recursive: true });
const what = (process.argv[3] || 'faces,turn,heads,hold,poses,stage').split(',');
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
    A.root.visible = false;
  }
  if (what.includes('heads') || what.includes('hold') || what.includes('poses')) {
    const A = Cast.spawn(M); scene.add(A.root); A.lookAt(front);
    if (what.includes('heads')) {
      A.pose('rest'); const names = ['smirk', 'locked', 'grin', 'yell', 'flinch', 'camera'], S = 520, cv = document.createElement('canvas'); cv.width = S * 6; cv.height = S * 2; const c = cv.getContext('2d');
      names.forEach((n, i) => { A.express(n, { snap: true }); Shot.settle(A, 6); A.rig.worldPos('head', hp); const b = box(hp.x - 0.4, hp.y - 0.08, hp.z - 0.3, hp.x + 0.4, hp.y + 0.72, hp.z + 0.3);
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
      const list = [['lean', 0, 'smirk'], ['lean', 1, 'locked'], ['lean', -1, 'grin'], ['kickstand', 1, 'yell']], CW = 640, CH = 760, cv = document.createElement('canvas'); cv.width = CW * 4; cv.height = CH * 2; const c = cv.getContext('2d');
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
  if (portrait) { cam.position.set(0, 1.5, 7.6); cam.lookAt(0, 1.02, 0); } else { cam.position.set(0, 1.7, 10.4); cam.lookAt(0, 1.25, 0); }
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
  if (['turn', 'heads', 'hold', 'poses'].some(k => what.includes(k))) { const p = await open(1280, 800); const info = await p.evaluate(() => Shot.info);
    console.log(JSON.stringify({ tris: info.tris, draws: info.draws, bones: info.bones, warnings: info.warnings }));
    const o = await p.evaluate(w => Shot.studio(w), what); for (const k in o) save(k, o[k]); await p.close(); }
  if (what.includes('stage')) for (const [w, h] of [[1280, 665], [390, 844]]) {
    const p = await open(w, h); await p.evaluate(t => Shot.stage(t), process.env.TIER || 'medium');
    for (const [pose, strum, face, hype] of [['lean', 1, 'smirk', 0], ['kickstand', 1, 'yell', 4]]) { const st = await p.evaluate(a => Shot.pose(a[0], a[1], a[2], a[3]), [pose, strum, face, hype]);
      const f = path.join(out, member + '-stage-' + w + 'x' + h + '-' + pose + '.png'); await p.screenshot({ path: f }); console.log(f, st.calls + ' draws', st.tris + ' tris', st.errors.length ? st.errors : ''); }
    await p.close(); }
  await b.close(); if (bad) process.exitCode = 2;
})();
