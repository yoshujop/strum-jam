const { chromium } = require('playwright');
const sizes = [[1440,900],[1024,768],[820,1180],[700,900],[390,844],[844,390]];
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+__dirname+'/real_right.wav','--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + __dirname + '/../dist/strum-jam.html');
  await page.waitForTimeout(800); await page.click('#btn-start', { force: true }); await page.waitForTimeout(1800);
  const check = async (tag) => {
    const info = await page.evaluate(() => {
      const de = document.documentElement, out = { sw: de.scrollWidth, cw: de.clientWidth, sh: de.scrollHeight, ch: de.clientHeight, over: [] };
      for (const el of document.querySelectorAll('.screen.on *, .screen.active *')) {
        const r = el.getBoundingClientRect(); if (!r.width) continue;
        if (r.right > innerWidth + 1 || r.left < -1) out.over.push((el.id || el.className || el.tagName).toString().slice(0, 30) + ' ' + Math.round(r.left) + '-' + Math.round(r.right));
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible' && el.clientWidth) out.over.push('clip:' + (el.id || el.className).toString().slice(0,30) + ' ' + el.scrollWidth + '>' + el.clientWidth);
      }
      out.over = [...new Set(out.over)].slice(0, 12); return out;
    });
    console.log(tag, JSON.stringify(info));
  };
  for (const [w, h] of sizes) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(400); await page.screenshot({ path: `shots/title-${w}x${h}.png` }); await check('title ' + w + 'x' + h); }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('text=Chord Drill: G, C, D'); await page.waitForTimeout(700);
  for (const [w, h] of sizes) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(400); await page.screenshot({ path: `shots/song-${w}x${h}.png` }); await check('song ' + w + 'x' + h); }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => { Settings.tuneFirst = false; });
  await page.click('#btn-practice'); await page.waitForTimeout(3000);
  for (const [w, h] of sizes) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(700); await page.screenshot({ path: `shots/game-${w}x${h}.png` }); await check('game ' + w + 'x' + h); }
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(700); await page.screenshot({ path: `shots/game-back-1440.png` });
  console.log('ERR', errs.join('\n'));
  await browser.close();
})();
