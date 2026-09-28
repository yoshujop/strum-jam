// the main menu: backdrop close-up and each mode button's hover effect: node test/menushot.js [outdir]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/menu'; require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(700);
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(1200);
  await p.addStyleTag({ content: '#fx{display:none!important}' });
  await p.screenshot({ path: `${out}/bg-zoom.png`, clip: { x: 0, y: 60, width: 640, height: 340 } });
  for (const id of ['btn-play', 'btn-story', 'btn-battle']) {
    await p.hover('#' + id); await p.waitForTimeout(650);
    const r = await p.evaluate(id => { const q = document.getElementById(id).getBoundingClientRect(); return { x: q.x - 20, y: q.y - 60, width: q.width + 40, height: q.height + 80 }; }, id);
    await p.screenshot({ path: `${out}/hover-${id}.png`, clip: r });
  }
  // a click burst, caught mid-flight
  await p.evaluate(() => { UI.modeBurst(document.getElementById('btn-battle'), 'battle', () => {}); }); await p.waitForTimeout(180);
  await p.screenshot({ path: `${out}/burst-battle.png`, clip: { x: 700, y: 380, width: 560, height: 420 } });
  console.log(errs.join(';') || 'no page errors'); await b.close();
})();
