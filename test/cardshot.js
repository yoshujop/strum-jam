// the three mode buttons at many screen widths (nothing may be cut off): node test/cardshot.js [outdir]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/cards'; require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch(); const bad = [];
  for (const [W, H] of [[1440, 900], [1280, 800], [1024, 768], [900, 1000], [768, 1024], [600, 900], [414, 896], [390, 844], [360, 740]]) {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(600);
    await p.click('#btn-start', { force: true }); await p.waitForTimeout(1100);
    await p.addStyleTag({ content: '#fx{display:none!important}' });
    // anything inside a card that spills out of it
    const spill = await p.evaluate(() => [...document.querySelectorAll('.mcard')].flatMap(c => { const r = c.getBoundingClientRect();
      return [...c.querySelectorAll('.mi,b,.md')].filter(e => e.offsetParent).map(e => ({ e, q: e.getBoundingClientRect() })).filter(({ q }) => q.left < r.left + 2 || q.right > r.right - 2 || q.top < r.top + 2 || q.bottom > r.bottom - 2).map(({ e }) => c.id + ' ' + e.className + e.tagName); }));
    if (spill.length) bad.push(W + ': ' + spill.join(', '));
    const r = await p.evaluate(() => { const q = document.querySelector('.modes3').getBoundingClientRect(); return { x: Math.max(0, q.x - 8), y: q.y - 8, width: q.width + 16, height: q.height + 20 }; });
    await p.screenshot({ path: `${out}/cards-${W}.png`, clip: r });
    const fits = await p.evaluate(() => document.getElementById('scr-title').scrollHeight <= innerHeight + 2);
    if (!fits) bad.push(W + 'x' + H + ': menu needs scrolling');
    await p.close();
  }
  console.log(bad.length ? 'PROBLEMS\n' + bad.join('\n') : 'all cards fit'); await b.close();
})();
