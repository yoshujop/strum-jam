const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })); });
  await page.goto('file://' + __dirname + '/../dist/strum-jam.html');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 's3-splash.png' });
  await page.click('#btn-start', { force: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 's3-opening.png' });
  await page.waitForTimeout(1600);
  console.log('music playing:', await page.evaluate(() => Music.playing), 'splash on:', await page.evaluate(() => Splash.on));
  await page.screenshot({ path: 's3-title.png' });
  await page.click('text=Chord Drill: G, C, D');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 's3-wipe.png' });
  await page.waitForTimeout(900);
  await page.click('#seg-hand button[data-v="1"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 's3-song-lefty.png' });
  // stage in tap mode, tapping right on time to build hype
  await page.click('#btn-stage');
  await page.waitForSelector('#m-tune:not([hidden])');
  await page.click('#btn-tune-skip');
  await page.waitForTimeout(1500);
  console.log('music stopped in game:', !(await page.evaluate(() => Music.playing)));
  const evs = await page.evaluate(() => G.list.map(e => e.t));
  const levels = [];
  for (let i = 0; i < evs.length; i++) {
    const wait = await page.evaluate(tt => (tt - AudioEngine.now() + AudioEngine.outputLatency()) * 1000, evs[i]);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.evaluate(() => G.onStrum(AudioEngine.now() - AudioEngine.outputLatency(), 'tap'));
    levels.push(await page.evaluate(() => G.level + ':' + G.hype.toFixed(2)));
    if (i === 7) await page.screenshot({ path: 's3-stage-hype.png' });
  }
  console.log('levels', levels.join(' '));
  await page.waitForSelector('#scr-results:not([hidden])', { timeout: 20000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 's3-results.png' });
  console.log('music back on results:', await page.evaluate(() => Music.playing));
  console.log('ERRORS:', errs.join('\n') || 'none');
  await browser.close();
})();
