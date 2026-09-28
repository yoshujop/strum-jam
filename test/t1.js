const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + __dirname + '/gcd.wav', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto('file://' + __dirname + '/../dist/strum-jam.html');
  await page.waitForTimeout(800);
  await page.click('#btn-start', { force: true });
  await page.waitForTimeout(1600);
  await page.click('text=Chord Drill: G, C, D');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shot-song.png', fullPage: false });
  await page.click('#btn-practice');
  await page.waitForSelector('#m-tune:not([hidden])');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'shot-tuner-live.png' });
  await page.click('#btn-tune-go');
  await page.waitForTimeout(600);
  const log = [];
  for (let i = 0; i < 22; i++) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => ({ lvl2: G.level + '/' + G.hype.toFixed(2) + ' s' + G.streak, on: Mic.on, idx: G.idx, cur: G.cur() && G.cur().label, lvl: +Mic.level.toFixed(3),
      top: Mic.topNotes(6).map(o => midiName(o.m) + ':' + Mic.sal[o.m].toFixed(1)).join(' '), hint: document.getElementById('hint').textContent.slice(0, 80) }));
    log.push(i + 's ' + JSON.stringify(st));
    if (i === 6) await page.screenshot({ path: 'shot-game.png' });
  }
  console.log(log.join('\n'));
  console.log('ERRORS:\n' + errs.slice(0, 20).join('\n'));
  await browser.close();
})();
