const { chromium } = require('playwright');
const faces = JSON.parse(process.argv[2]);
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: +(process.argv[3] || 1) });
  await p.goto('file:///home/claude/strumjam/dist/strum-jam.html'); await p.waitForTimeout(800);
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(1200);
  await p.click('text=Chord Drill: G, C, D'); await p.waitForTimeout(400); await p.evaluate(() => Settings.tuneFirst = false);
  await p.click('#btn-stage'); await p.waitForTimeout(2500); await p.evaluate(() => { G.hype = 0.7; G.setLevel(3); G.lastMissAt = -99; });
  let i = 0;
  for (const f of faces) { await p.evaluate(f => { Stage.drumSt.forceFace = f; G.lastMissAt = -99; }, f); await p.waitForTimeout(700);
    const r = await p.evaluate(() => { const d = Stage.drumAt, cv = document.getElementById('stage').getBoundingClientRect(); return { x: cv.x + d.cx - d.h * 0.16, y: cv.y + d.floorY - d.h * 0.66, width: d.h * 0.32, height: d.h * 0.26 }; });
    await p.screenshot({ path: `/home/claude/dtest/face${i++}.png`, clip: r }); }
  await b.close();
})();
