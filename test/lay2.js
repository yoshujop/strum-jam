const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture=' + __dirname + '/real_right.wav'] });
 const p = await b.newPage({ viewport: { width: 1000, height: 517 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
 await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(800); await p.click('#btn-start', { force: true }); await p.waitForTimeout(1500);
 await p.click('text=Chord Drill: G, C, D'); await p.waitForTimeout(500); await p.evaluate(() => Settings.tuneFirst = false); await p.click('#btn-practice'); await p.waitForTimeout(2500);
 for (const [w, h] of [[1366, 640], [1920, 1000], [510, 660], [390, 844], [844, 390], [1000, 517]]) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(1200);
   const m = await p.evaluate(() => { const r = e => document.querySelector(e).getBoundingClientRect(); const b = document.querySelector('.board'); return { stage: Math.round(r('.stage-wrap').height), sheet: Math.round(r('.board').height), overflow: b.scrollHeight - b.clientHeight }; });
   console.log(w + 'x' + h, JSON.stringify(m)); await p.screenshot({ path: __dirname + `/shots/L-${w}x${h}.png` }); }
 console.log('ERR', errs.join('; ')); await b.close(); })();
