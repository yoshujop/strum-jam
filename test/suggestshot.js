// the Play & Learn screen with song suggestions open (Apple's search stubbed): node test/suggestshot.js [outdir]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/sugg'; require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  for (const [n, W, H] of [['desk', 1280, 800], ['phone', 390, 844]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(700);
    await p.click('#btn-start', { force: true }); await p.waitForTimeout(900);
    await p.evaluate(() => { Lookup.itunes = async q => [
      { trackId: 1, title: 'Wonderwall', artist: 'Oasis', album: "(What's the Story) Morning Glory?", year: 1995, art: '' },
      { trackId: 2, title: 'Wonderwall (Live)', artist: 'Oasis', album: 'Familiar to Millions', year: 2000, art: '' },
      { trackId: 3, title: 'Wonderwall', artist: 'Ryan Adams', album: 'Love Is Hell', year: 2004, art: '' },
      { trackId: 4, title: 'Wonder', artist: 'Shawn Mendes', album: 'Wonder', year: 2020, art: '' } ]; });
    await p.click('#btn-play'); await p.waitForTimeout(900);
    await p.type('#search-input', 'wonder', { delay: 40 }); await p.waitForTimeout(900);
    await p.keyboard.press('ArrowDown');
    await p.screenshot({ path: `${out}/${n}.png` });
    console.log(n, await p.$$eval('.sg b', e => e.map(x => x.textContent).join(' | ')), errs.join(';') || 'ok');
  }
  await b.close();
})();
