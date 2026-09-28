// screenshots of the title and the stage with the new drummer: node test/drumshot.js [w h]
const { chromium } = require('playwright');
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 800);
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(1200);
  await p.screenshot({ path: '/home/claude/dtest/title.png' });
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(1200);
  await p.click('text=Chord Drill: G, C, D'); await p.waitForTimeout(400); await p.evaluate(() => Settings.tuneFirst = false);
  await p.click('#btn-stage'); await p.waitForTimeout(3000);
  for (const L of [1, 4]) { await p.evaluate(L => { G.hype = [0.05, 0.45, 0.5, 0.7, 0.95][L]; G.setLevel(L); }, L); await p.waitForTimeout(1500);
    const box = await p.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await p.screenshot({ path: `/home/claude/dtest/stage${L}.png`, clip: box }); }
  console.log('ERR', errs.join('; ')); await b.close();
})();
