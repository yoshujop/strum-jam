const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  // pretend to be inside the claude.ai viewer: fake sample capability, no mic
  await page.addInitScript(() => {
    const fake = async () => ({ text: '' });
    fake.json = async (prompt) => { await new Promise(r => setTimeout(r, 400)); return {
      found: true, title: 'Test Tune', artist: 'The Examples', bpm: 124, time: '4/4', feel: 'straight', style: 'rock', capo: 0, key: 'E',
      strum: 'D.DU.UDU', drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, note: 'Keep the strumming hand moving.',
      sections: [{ name: 'Intro', bars: ['E', 'A', 'B7', 'E'] }, { name: 'Verse 1', bars: ['E', 'C#m', 'A', 'B', 'E', 'C#m', 'F#m7', 'B7sus4'] }, { name: 'Chorus', bars: ['A . E .', 'B', 'A', 'B'] }] }; };
    window.claude = { use: async n => n === 'sample' ? fake : null };
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
  });
  await page.goto('file://' + __dirname + '/../dist/strum-jam.html');
  await page.waitForTimeout(800);
  await page.fill('#search-input', 'test tune');
  await page.click('#search-form button[type=submit]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shot-searching.png' });
  await page.waitForSelector('#scr-song:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shot-song2.png', fullPage: true });
  // easy mode
  await page.click('#seg-easy button[data-v="1"]');
  console.log('easy note:', await page.textContent('#easy-note'));
  await page.click('#seg-easy button[data-v="0"]');
  await page.click('#btn-stage');
  await page.waitForSelector('#m-tune:not([hidden])', { timeout: 3000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shot-tune.png' });
  console.log('tune msg:', await page.textContent('#tune2-msg'));
  await page.click('#btn-tune-go');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shot-stage-countin.png' });
  // tap in time with the chord events
  const evs = await page.evaluate(() => G.list.map(e => e.t));
  let taps = 0;
  const t0 = Date.now();
  for (const t of evs) {
    const wait = await page.evaluate(tt => (tt - AudioEngine.now() + AudioEngine.outputLatency()) * 1000, t);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.evaluate(() => G.onStrum(AudioEngine.now() - AudioEngine.outputLatency(), 'tap'));
    taps++;
    if (taps === 6) await page.screenshot({ path: 'shot-stage.png' });
  }
  await page.waitForSelector('#scr-results:not([hidden])', { timeout: 20000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'shot-results.png' });
  console.log('results:', await page.textContent('#res-grade'), await page.textContent('#res-title'), (await page.textContent('#res-stats')).replace(/\s+/g, ' '));
  console.log('ERRORS:', errs.join('\n'));
  await browser.close();
})();
