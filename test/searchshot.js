// The song search with no network, in the real page: type a misspelt title, the built-in song shows, one click opens
// a full chart (capo, strum, sections). Then a song that isn't built in: the message says "no connection", not "add a key".
//   python3 build.py && node test/searchshot.js [outdir]      (Playwright; NODE_PATH=$(npm root -g))
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/search'; require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  let bad = 0;
  for (const [W, H] of [[1280, 665], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route(/^https?:/, r => r.abort());
    await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(700);
    await p.click('#btn-start', { force: true }); await p.waitForTimeout(3800);
    await p.click('#btn-play', { force: true }); await p.waitForTimeout(900);
    const t0 = Date.now();
    await p.fill('#search-input', 'wonderwal oasis'); await p.press('#search-input', 'Enter');
    await p.waitForSelector('#rec-results .rec', { timeout: 15000 });
    const tHit = Date.now() - t0, first = await p.$eval('#rec-results .rec', e => e.innerText.replace(/\n/g, ' / '));
    await p.waitForTimeout(600); await p.screenshot({ path: `${out}/search-offline-${W}x${H}.png` });
    await p.click('#rec-results .rec'); await p.waitForFunction(() => UI.song && /wonderwall/i.test(UI.song.title), null, { timeout: 15000 });
    const tSong = Date.now() - t0;
    const s = await p.evaluate(() => ({ title: UI.song.title, src: UI.song.prov && UI.song.prov.src, bpm: UI.song.bpm, capo: UI.song.capo, strum: UI.song.strum, secs: UI.song.sections.length, bars: UI.chart.totalBars, model: chartModel(UI.song).sections[0].strum.pattern }));
    await p.waitForTimeout(500); await p.screenshot({ path: `${out}/song-offline-${W}x${H}.png` });
    // not built in
    const msg = await p.evaluate(async () => { try { await Chart.make({ title: 'Qwrtplk Zzxv', artist: 'Nobody', trackId: 5, durationMs: 0 }, { ai: false }); return 'charted'; } catch (e) { return UI.lookupErr(e, 'chart'); } });
    const ok = /wonderwall/i.test(first) && s.capo === 2 && s.strum && s.bars > 60 && !errs.length && /connection|reach/i.test(msg) && !/API key/i.test(msg);
    if (!ok) bad++;
    console.log(`${W}x${H} ${ok ? 'ok' : 'FAIL'}: first card "${first}" after ${tHit} ms, song screen after ${tSong} ms, ${JSON.stringify(s)}; unknown song: "${msg}"${errs.length ? ' ERR ' + errs.join('; ') : ''}`);
    await p.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
