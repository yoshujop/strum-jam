// menu + stage screenshots at laptop / desktop / phone sizes: node test/uishot.js [outdir] [tag]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/ui'; const tag = process.argv[3] || '';
require('fs').mkdirSync(out, { recursive: true });
const sizes = (process.env.SIZES || '1280x665,1366x657,1536x730,1920x960,390x844,844x390').split(',').map(s => s.split('x').map(Number));
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [W, H] of sizes) {
    const p = await b.newPage({ viewport: { width: W, height: H } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(700);
    await p.click('#btn-start', { force: true }); await p.waitForTimeout(3800);
    await p.screenshot({ path: `${out}/menu-${W}x${H}${tag}.png` });
    if (!process.env.NOSTAGE) {
      await p.click('#btn-play', { force: true }); await p.waitForTimeout(900);
      await p.click('text=Chord Drill: G, C, D'); await p.waitForTimeout(400); await p.evaluate(() => Settings.tuneFirst = false);
      await p.click('#btn-stage'); await p.waitForTimeout(3500);
      await p.evaluate(() => { G.hype = 0.6; G.setLevel(2); }); await p.waitForTimeout(2200);
      await p.screenshot({ path: `${out}/stage-${W}x${H}${tag}.png` });
    }
    console.log(W, H, errs.length ? 'ERR ' + errs.join('; ') : 'ok');
    await p.close();
  }
  await b.close();
})();
