// Story mode career screen and the swap sheet, at desktop and phone size: node test/storyshot.js [outdir]
// (needs the career JSON from: OUT=/tmp/career.json node test/storytest.js, and a fresh python3 build.py)
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '/tmp/storyshot', careerFile = process.env.CAREER || '/tmp/career.json';
fs.mkdirSync(out, { recursive: true });
const career = JSON.parse(fs.readFileSync(careerFile, 'utf8'));
(async () => {
  const b = await chromium.launch();
  for (const [name, W, H] of [['desk', 1280, 900], ['phone', 390, 844]]) {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(c => { try { localStorage.setItem('strumjam.careers', JSON.stringify([c])); } catch (e) {} }, career);
    await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(1000);
    await p.click('#btn-start', { force: true }); await p.waitForTimeout(1000);
    await p.evaluate(() => Story.openCareer('c-kanye-west')); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}/${name}-career.png`, fullPage: true });
    // swap the second song of level 1
    const before = await p.evaluate(() => Story.get('c-kanye-west').levels[0].songs.map(s => s.title));
    await p.locator('#story-levels .lvl').first().locator('.swap').nth(1).click(); await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/${name}-swap.png` });
    const opts = await p.$$eval('#sw-list .sw-opt .t', els => els.map(e => e.textContent));
    await p.click('#sw-list .sw-opt >> nth=0'); await p.waitForTimeout(700);
    const after = await p.evaluate(() => { const L = Story.get('c-kanye-west').levels[0]; return { songs: L.songs.map(s => s.title), alts: L.alts.map(s => s.title), name: L.name, albums: L.albums, years: L.years, prog: Story.get('c-kanye-west').progress }; });
    await p.locator('#story-levels .lvl').first().screenshot({ path: `${out}/${name}-after.png` });
    console.log(name, JSON.stringify({ before, opts, after }), errs.length ? 'ERR ' + errs.join('; ') : 'no page errors');
    await p.close();
  }
  await b.close();
})();
