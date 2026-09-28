// Practice/stage with a fake mic file. usage: node t5.js right.wav practice 24 [shotPrefix]
const { chromium } = require('playwright');
const [wavName, mode = 'practice', secs = '24', shot = ''] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + __dirname + '/' + wavName, '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto('file://' + __dirname + '/../dist/strum-jam.html');
  await page.waitForTimeout(800);
  await page.click("#btn-start", { force: true }); for (let w = 0; w < 30 && !(await page.evaluate(() => Listen.ready || !!Listen.failed)); w++) await page.waitForTimeout(300);
  await page.waitForTimeout(1600);
  await page.click('text=Chord Drill: G, C, D');
  await page.waitForTimeout(600);
  await page.evaluate(() => { Settings.tuneFirst = false; });
  await page.click(mode === 'stage' ? '#btn-stage' : '#btn-practice');
  const log = [];
  const t0 = Date.now();
  for (let i = 0; i < +secs * 2; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => {
      const r = G.lastR;
      return { t: +AudioEngine.now().toFixed(1), idx: G.idx, cur: G.mode === 'practice' ? (G.cur() && G.cur().label) : (G.shownEv && G.shownEv.label), score: G.score, combo: G.combo,
        heard: Mic.heardNotes().map(o => midiName(o.m)).join(' '), fb: (G.fb ? G.fb.states.join(',') + ' wrong:' + G.fb.wrong.map(w => w.string + '@' + w.fret + '=' + midiName(w.midi)).join('/') : ''),
        r: r ? `fr ${typeof r.fresh === "number" ? r.fresh : (r.fresh ? r.fresh.rose : "-")} fit ${r.fit.toFixed(2)} miss[${r.missing}] wrong[${r.wrongNotes.map(m => midiName(m))}] ok ${r.ok}` : '', lvl: +Mic.level.toFixed(3), nr: +Mic.noiseRms.toFixed(4), hint: document.getElementById('hint').textContent.slice(0, 90) };
    });
    log.push(JSON.stringify(st));
    if (shot && (i === 9 || i === 17 || i === 25)) await page.screenshot({ path: __dirname + `/${shot}-${i}.png` });
  }
  console.log(log.join('\n'));
  if (mode === 'stage') console.log(await page.evaluate(() => JSON.stringify(G.list.map(e => e.label + ':' + (e.result || '-') + '/' + e.timing + '/ok' + e.earOk + '/' + e.earN)))); 
  console.log('ERRORS:\n' + errs.slice(0, 20).join('\n'));
  await browser.close();
})();
