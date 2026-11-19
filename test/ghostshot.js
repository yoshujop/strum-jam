// the new stage overlay over time: lane cards, the next chord's ghost, the strike pulse. node test/ghostshot.js outdir [WxH] [lefty] [practice]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/ghost'; const [W, H] = (process.argv[3] || '1280x665').split('x').map(Number);
const lefty = process.argv.includes('lefty'), practice = process.argv.includes('practice');
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: W, height: H } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(700);
  await p.evaluate(l => { Settings.lefty = l; }, lefty);
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(3500);
  await p.click('#btn-play', { force: true }); await p.waitForTimeout(900);
  await p.click('text=Chord Drill: G, C, D'); await p.waitForTimeout(400); await p.evaluate(() => Settings.tuneFirst = false);
  await p.click(practice ? '#btn-practice' : '#btn-stage'); await p.waitForTimeout(practice ? 1500 : 3000);
  const shots = [];
  for (let i = 0; i < 10; i++) {
    const st = await p.evaluate(() => ({ ghost: document.getElementById('fretboard').classList.contains('ghost'), label: Fretboard.cur && Fretboard.cur.label, beat: +G.beatNow.toFixed(2) }));
    if (practice && i === 3) await p.evaluate(() => { const n = Fretboard.cur.notes.map(n => n.string); const st = ['', '', '', '', '', '']; n.forEach((s, k) => { if (k < n.length - 1) st[s] = 'heard'; }); Fretboard.feedback(st, []); });
    await p.screenshot({ path: `${out}/g${i}.png` }); shots.push(st);
    await p.waitForTimeout(practice ? 500 : +(process.env.STEP || 330));
  }
  console.log(JSON.stringify(shots), errs.length ? 'ERR ' + errs.join('; ') : 'no page errors'); await b.close();
})();
