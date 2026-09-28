const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })); });
  await page.goto('file://' + __dirname + '/../dist/strum-jam.html');
  await page.waitForTimeout(900);
  await page.click('#btn-start', { force: true });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 's4-title.png' });
  await page.evaluate(() => document.getElementById('scr-title').scrollTo(0, 620));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 's4-tiles.png' });
  await page.click('.tile >> text=Chord Drill: G, C, D');
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 's4-song.png' });
  await page.click('#btn-stage');
  await page.waitForSelector('#m-tune:not([hidden])');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 's4-tune.png' });
  await page.click('#btn-tune-skip');
  await page.waitForTimeout(1200);
  const evs = await page.evaluate(() => G.list.map(e => e.t));
  for (let i = 0; i < evs.length; i++) {
    const wait = await page.evaluate(tt => (tt - AudioEngine.now() + AudioEngine.outputLatency()) * 1000, evs[i]);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.evaluate(() => G.onStrum(AudioEngine.now() - AudioEngine.outputLatency(), 'tap'));
    if (i === 3) await page.screenshot({ path: 's4-stage-early.png' });
    if (i === 9) { await page.waitForTimeout(150); await page.screenshot({ path: 's4-stage-hype.png' }); }
  }
  console.log('level', await page.evaluate(() => G.level + ' ' + G.hype.toFixed(2)));
  await page.waitForSelector('#scr-results:not([hidden])', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 's4-results.png' });
  console.log('ERRORS:', errs.join('\n') || 'none');
  await browser.close();
})();
