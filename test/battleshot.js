// a two-player battle end to end in tap mode (each run ended early): node test/battleshot.js [outdir]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/battle'; require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 820 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(700);
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(800);
  await p.evaluate(() => { Settings.tuneFirst = false; });
  await p.click('#btn-battle'); await p.waitForTimeout(800); await p.click('#btn-on-local'); await p.waitForTimeout(400);  // the local battle, from the Online home
  await p.fill('[data-p="0"]', 'Josh'); await p.fill('[data-p="1"]', 'Sam');
  await p.screenshot({ path: `${out}/setup.png` });
  await p.click('#btn-bt-start', { force: true }); await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/turn.png` });
  for (const score of [4200, 5100]) {
    await p.click('#btn-bt-play', { force: true }); await p.waitForTimeout(3500);
    await p.evaluate(sc => { G.score = sc; G.judgedN = 4; G.accSum = 300; G.finish(); }, score); await p.waitForTimeout(1500);
    if (score === 4200) { await p.screenshot({ path: `${out}/results1.png` }); await p.click('[data-bt="next"]', { force: true }); await p.waitForTimeout(800); }
    else { await p.screenshot({ path: `${out}/results2.png` }); await p.click('[data-bt="done"]', { force: true }); await p.waitForTimeout(800); }
  }
  await p.screenshot({ path: `${out}/final.png` });
  console.log(await p.evaluate(() => Battle.st.players.map(x => x.name + ' ' + x.score).join(', ')), errs.join(';') || 'no page errors'); await b.close();
})();
