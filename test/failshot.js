// Stage mode going wrong: screenshots at rising danger, then a real fail from missing every chord.
// node test/failshot.js [outdir]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/fail';
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(800);
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(800);
  await p.click('#btn-play', { force: true }); await p.waitForTimeout(900);
  await p.click('text=Chord Drill: G, C, D'); await p.waitForTimeout(400); await p.evaluate(() => Settings.tuneFirst = false);
  await p.click('#btn-stage'); await p.waitForTimeout(3000);
  await p.evaluate(() => { G.hype = 0.6; G.setLevel(2); }); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/d0.png` });
  for (const d of [0.45, 0.75, 0.95]) {
    await p.evaluate(d => { G.danger = d; G._ad = G._ad || G.addDanger; G.addDanger = () => {}; }, d); await p.waitForTimeout(2500);
    await p.screenshot({ path: `${out}/d${Math.round(d * 100)}.png` });
  }
  // now a real fail: restore scoring and miss everything
  await p.evaluate(() => { G.addDanger = G._ad; G.danger = 0.5; });
  let t = 0; while (t < 40000 && !(await p.evaluate(() => G.failed))) { await p.waitForTimeout(500); t += 500; }
  const st = await p.evaluate(() => ({ failed: G.failed, danger: G.danger }));
  await p.waitForTimeout(900); await p.screenshot({ path: `${out}/fail.png` });
  await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/results.png` });
  console.log(JSON.stringify(st), await p.evaluate(() => UI.screen), errs.length ? 'ERR ' + errs.join('; ') : 'no page errors'); await b.close();
})();
