// The engine demo: a lit toon stage with outlines, stage lights, bloom, a glossy floor, an instanced crowd and VFX,
// built ONLY on the public API (GFX, Toon, Assets, StageKit, VFX) with the test fixtures.
//   node test/gfxdemo.js            writes dist/gfxdemo.html (open it in a browser: keys 1/2/3 = low/medium/high tier,
//                                   A = auto tier, O = outlines on/off, C = confetti, click = a hit)
//   node test/gfxdemo.js <outdir>   also screenshots it at 1280x665 (low, medium, high) and 390x844, prints GFX.stats
const fs = require('fs'), path = require('path');
const { ROOT, findModel, buildPage } = require('./gfxpage.js');
const models = ['cap', 'guitar', 'shades', 'amp', 'club'].map(findModel);
const pageJs = `
const Demo = { t: 0, beatN: -1, band: [], errors: [] };
window.addEventListener('error', e => Demo.errors.push(e.message));
Demo.ready = (async () => {
  const T = THREE, q = new URLSearchParams(location.search), hud = document.getElementById('hud');
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  if (!GFX.init(document.getElementById('c'), { tier: q.get('tier') || 'auto' })) { hud.textContent = 'WebGL2 is not available'; return; }
  await Assets.load((done, total, name) => { hud.textContent = 'loading ' + name + ' ' + done + '/' + total; });
  const scene = new T.Scene(), portrait = innerHeight > innerWidth, cam = new T.PerspectiveCamera(portrait ? 36 : 30, 1, 0.1, 200);
  GFX.setScene(scene, cam);
  const st = GfxTest.stage(scene);
  scene.add(VFX.init());
  // the band: five instances of the fixture person, each its own skeleton; props on attachment bones
  [-3.2, -1.6, 0, 1.6, 3.2].forEach((x, i) => { const m = Assets.spawn('cap'); m.root.position.set(x, 0, -0.3 - 0.3 * Math.abs(x)); scene.add(m.root);
    GfxTest.face(m, i); StageKit.blob(m.root, 0.42); Demo.band.push(m); });
  const gtr = Assets.spawn('guitar'); gtr.root.rotation.z = 0.45; Demo.band[2].attach(gtr.root, 'chest', { pos: [0.05, -0.28, 0.2], scale: 0.9 });
  Demo.band[1].attach(Assets.spawn('shades').root, 'att_head'); Demo.band[3].attach(Assets.spawn('shades').root, 'att_head');
  [-4.3, 4.3].forEach(x => { const a = Assets.spawn('amp'); a.root.position.set(x, 0, -2.2); a.root.rotation.y = -x * 0.08; scene.add(a.root); });
  // the crowd: one instanced bean (body + head), ONE fill draw + ONE ink draw for all of them
  const N = 140, body = new T.CapsuleGeometry(0.2, 0.55, 4, 10); body.translate(0, 0.48, 0);
  const head = new T.SphereGeometry(0.2, 12, 8); head.translate(0, 1.12, 0);
  const pos = [], nor = [], idx = []; let off = 0;
  for (const g of [body, head]) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); off += g.attributes.position.count; }
  const bean = new T.BufferGeometry(); bean.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bean.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); bean.setIndex(idx);
  const crowd = Demo.crowd = Toon.instanced(bean, N, { cls: 'cloth', outline: { px: 2.6 } });
  const cols = ['#3d3470', '#4a2f6e', '#2f3b7a', '#5a3a86', '#34405f'], c = new T.Color(); Demo.seats = [];
  for (let i = 0; i < N; i++) { const row = i % 5, x = ((i * 0.618034) % 1) * 15 - 7.5, z = 4.4 + row * 0.85 + ((i * 0.37) % 1) * 0.4;
    Demo.seats.push([x, z, (i * 0.777) % 1, 0.85 + ((i * 0.29) % 1) * 0.3]); crowd.setColorAt(i, c.set(cols[i % cols.length])); }
  crowd.instanceColor.needsUpdate = true; scene.add(crowd);
  const m4 = new T.Matrix4(), v = new T.Vector3(), s = new T.Vector3(), qI = new T.Quaternion(), words = ['PERFECT!', 'GREAT!', 'NICE!', 'ROCK ON!'];
  let last = performance.now(), ol = true;
  Demo.step = dt => {
    Demo.t += dt; const t = Demo.t, beat = t * 2, bn = Math.floor(beat);
    Demo.band.forEach((m, i) => GfxTest.groove(m, t, i * 0.25, 1));
    for (let i = 0; i < N; i++) { const p = Demo.seats[i], ph = (beat + p[2]) % 1, j = Math.pow(1 - ph, 2) * 0.16 * p[3];
      m4.compose(v.set(p[0], j - 0.75, p[1]), qI, s.set(p[3], p[3] * (1 + j * 0.5), p[3])); crowd.setMatrixAt(i, m4); }
    crowd.instanceMatrix.needsUpdate = true;
    if (bn !== Demo.beatN) { Demo.beatN = bn; GFX.beat(bn % 4 === 0 ? 1 : 0.55);
      const who = Demo.band[bn % 5].root.position; v.set(who.x + 0.35, 1.25, who.z + 0.45);
      VFX.hit(v, ['perfect', 'good', 'perfect', 'ok'][bn % 4]);
      if (bn % 4 === 0) { VFX.text(words[(bn / 4) % words.length], v.set(who.x, 2.35, who.z + 0.3), { color: ['#FFCE3A', '#2EC4B6', '#FF8FC7'][(bn / 4) % 3], size: 0.55 }); VFX.shock([who.x, 0.03, who.z], { color: '#FFF7E6' }); }
      if (bn % 8 === 2) { VFX.confetti([-3.5, 3.4, 0.5], { count: 70 }); VFX.confetti([3.5, 3.4, 0.5], { count: 70 }); }
      if (bn % 8 === 3) VFX.speedLines([0, 1.3, 0.4], { dir: [0, 1, 0], radius: 1.1, count: 18, color: '#FFF7E6' }); }
    const a = Math.sin(t * 0.25) * 0.22;
    if (portrait) { cam.position.set(Math.sin(a) * 8.2, 1.7, Math.cos(a) * 8.2); cam.lookAt(0, 1.15, 0); }
    else { cam.position.set(Math.sin(a) * 11, 2.1 + 0.25 * Math.sin(t * 0.17), Math.cos(a) * 11); cam.lookAt(0, 1.3, -0.4); }
    GFX.render(dt);
  };
  const loop = now => { const dt = Math.min(0.1, (now - last) / 1000); last = now; if (!Demo.manual) Demo.step(dt);
    const g = GFX.stats; hud.textContent = g.tier + (GFX.auto ? ' (auto)' : '') + '  ' + g.fps + ' fps  ' + g.calls + ' draws  ' + (g.tris / 1000 | 0) + 'k tris  ' + g.w + 'x' + g.h + '   [1/2/3 tier, A auto, O outlines, C confetti]';
    requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  addEventListener('keydown', e => { const k = e.key.toLowerCase();
    if (k === '1' || k === '2' || k === '3') { GFX.auto = false; GFX.setTier(['low', 'medium', 'high'][+k - 1]); }
    if (k === 'a') GFX.auto = !GFX.auto;
    if (k === 'o') { ol = !ol; Demo.band.forEach(m => m.setOutline(ol)); }
    if (k === 'c') VFX.confetti([0, 3.5, 1], { count: 120, spread: 1 }); });
  addEventListener('pointerdown', () => { VFX.hit([(Math.random() - 0.5) * 5, 1 + Math.random() * 1.2, 1], 'perfect'); GFX.beat(1); });
})();
`;
const html = buildPage(models, pageJs, '<div id="hud" style="position:fixed;left:10px;bottom:8px;color:#fff7e6;font:600 13px \'Baloo 2\',sans-serif;text-shadow:0 1px 0 #1e1b2e;opacity:.85;pointer-events:none"></div>', 'Strum Jam GFX demo');
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const file = path.join(ROOT, 'dist', 'gfxdemo.html'); fs.writeFileSync(file, html); console.log(file, (html.length / 1e6).toFixed(1) + ' MB');
const out = process.argv[2];
if (out) (async () => {
  const { chromium } = require('playwright'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); let bad = false;
  const shots = (process.env.SHOTS || '1280x665:medium,1280x665:high,1280x665:low,390x844:medium').split(',').map(s => { const [wh, tier] = s.split(':'), [w, h] = wh.split('x').map(Number); return [w, h, tier]; });
  for (const [w, h, tier] of shots) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('file://' + file + '?tier=' + tier); await p.evaluate(() => { Demo.manual = true; GFX.auto = false; return Demo.ready; });
    // fixed steps (software GL is slow): about 2.1 s of show, ending a few frames after a downbeat
    const stats = await p.evaluate(async () => { for (let i = 0; i < 64; i++) { Demo.step(1 / 30); if (i % 6 === 5) await new Promise(r => requestAnimationFrame(r)); } await new Promise(r => requestAnimationFrame(r)); return Object.assign({}, GFX.stats, { errors: Demo.errors }); });
    const f = path.join(out, 'demo-' + w + 'x' + h + '-' + tier + '.png'); await p.screenshot({ path: f });
    console.log(f, JSON.stringify(stats), errs.length ? 'ERR ' + errs.join('; ') : 'ok'); if (errs.length || stats.errors.length) bad = true;
    await p.close();
  }
  await b.close(); if (bad) process.exitCode = 2;
})();
