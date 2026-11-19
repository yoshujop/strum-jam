// every scene of the menu's mode icons, at real size and blown up: node test/iconshot.js outdir
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/icons'; require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 665 }, deviceScaleFactor: 3 }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(600);
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(3500);
  await p.addStyleTag({ content: '#fx{display:none!important}' });
  await p.evaluate(() => { const o = ModeIcons.draw.bind(ModeIcons); ModeIcons.draw = () => o(window.__T || 0); });
  for (const [id, off, n] of [['btn-play', 0.9, 5], ['btn-battle', 1.7, 3]]) for (let i = 0; i < n; i++) for (const d of [0.25, 1.4]) {
    await p.evaluate(T => { window.__T = T; }, i * 2.6 - off + d); await p.waitForTimeout(80);
    const r = await p.evaluate(id => { const q = document.querySelector('#' + id + ' .mi').getBoundingClientRect(); return { x: q.x, y: q.y, width: q.width, height: q.height }; }, id);
    await p.screenshot({ path: `${out}/${id}-${i}-${d}.png`, clip: r });
  }
  console.log(errs.length ? 'ERR ' + errs.join('; ') : 'no page errors'); await b.close();
})();
