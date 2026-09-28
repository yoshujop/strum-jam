// the drummer in a real Stage run: frame timing (is his clock smooth?) and a strip of frames.
// node test/drumgame.js [outdir] [level]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/dg', LV = +(process.argv[3] || 3);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(800);
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(800);
  await p.click('text=Chord Drill: G, C, D'); await p.waitForTimeout(400); await p.evaluate(() => Settings.tuneFirst = false);
  await p.click('#btn-stage'); await p.waitForTimeout(4500);
  await p.evaluate(L => { G.hype = 0.8; G.setLevel(L); }, LV); await p.waitForTimeout(1500);
  const stats = await p.evaluate(() => new Promise(res => {
    const orig = FunkDrummer.draw, rec = [];
    FunkDrummer.draw = function (c, st, o) { if (o.x > 0 && o.h > 50) rec.push({ now: o.now, real: performance.now() / 1000 }); return orig.apply(this, arguments); };
    setTimeout(() => { FunkDrummer.draw = orig; const d = []; for (let i = 1; i < rec.length; i++) d.push([(rec[i].now - rec[i - 1].now) * 1000, (rec[i].real - rec[i - 1].real) * 1000]);
      const stalls = d.filter(([a, r]) => a < 1 && r > 5).length, jumps = d.filter(([a, r]) => Math.abs(a - r) > 6).length;
      res({ frames: d.length, stalls, jumps, sample: d.slice(0, 20).map(([a, r]) => a.toFixed(1) + '/' + r.toFixed(1)).join(' ') }); }, 2000);
  }));
  console.log('clock', JSON.stringify(stats));
  const box = await p.evaluate(() => { const d = Stage.drumAt, r = document.getElementById('stage').getBoundingClientRect(); return { x: r.x + d.cx - d.h * 0.42, y: r.y + d.floorY - d.h * 0.85, width: d.h * 0.84, height: d.h * 0.9 }; });
  for (let i = 0; i < 16; i++) { await p.screenshot({ path: `${out}/f${String(i).padStart(2, '0')}.png`, clip: box }); await p.waitForTimeout(45); }
  console.log(errs.length ? 'ERR ' + errs.join('; ') : 'no page errors'); await b.close();
})();
