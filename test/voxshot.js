// Vocals mode end to end: lyrics from a mocked LRCLIB (placeholder words, timed to the chart with a known offset),
// the song screen's lyrics card, a Stage run with a simulated voice (in tune, then silent), results.
// node test/voxshot.js [outdir]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/vox'; require('fs').mkdirSync(out, { recursive: true });
const T0 = 3.2;
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errs = [];
  const open = async vp => {
    const p = await b.newPage({ viewport: vp }); p.on('pageerror', e => errs.push(e.message));
    let lrc = '';
    await p.route('https://lrclib.net/**', rt => rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ id: 1, trackName: 'x', artistName: 'y', duration: 90, instrumental: false, plainLyrics: 'x', syncedLyrics: lrc }) }));
    await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(700);
    await p.click('#btn-start', { force: true }); await p.waitForTimeout(600);
    // placeholder lines every 2 bars, at recording time T0 + beat * spb
    lrc = await p.evaluate(T0 => {
      Settings.tuneFirst = false; Settings.inst = 'vocals'; saveSettings();
      const s = validateSong(LIBRARY.find(x => /Twinkle/.test(x.title)), 'library'), ch = compileSong(s, { shapes: 'easy' }), spb = 60 / ch.bpm, L = [];
      for (let b = 0, n = 1; b < ch.totalBeats - 2; b += ch.beats * 2, n++) { const t = T0 + b * spb; L.push(`[${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}] placeholder line number ${n} la la la`); }
      window.__song = s; return L.join('\n');
    }, T0);
    await p.evaluate(() => UI.openSong(window.__song)); await p.waitForTimeout(1200);
    return p;
  };
  const p = await open({ width: 1280, height: 800 });
  await p.screenshot({ path: `${out}/song.png`, fullPage: true });
  const fit = await p.evaluate(() => UI.vox && { T0: UI.vox.map.pts[0][0], lines: UI.vox.lines.length });
  // a voice that sings the target for the first 12 s, then nothing
  await p.evaluate(() => { const t0 = performance.now(); Parts.voice = () => { if (performance.now() - t0 > 14000) return null; const now = AudioEngine.now() - (Settings.latency || 0) / 1000; const t = Parts.targets.find(x => now >= x.t0 && now <= x.t1); return t ? { m: 60 + (t.m != null ? t.m % 12 : t.pcs[0]) + 0.1, clarity: 0.9 } : null; }; });
  await p.click('#btn-stage', { force: true }); await p.waitForTimeout(9000);
  await p.screenshot({ path: `${out}/stage.png` });
  const mid = await p.evaluate(() => ({ score: G.score, counts: G.counts, targets: Parts.targets.length, inst: Parts.inst }));
  let t = 0; while (t < 90000 && !(await p.evaluate(() => UI.screen === 'results'))) { await p.waitForTimeout(1000); t += 1000; }
  await p.waitForTimeout(1200); await p.screenshot({ path: `${out}/results.png` });
  const res = await p.evaluate(() => ({ screen: UI.screen, grade: $('res-grade').textContent, sub: $('res-sub').textContent, failed: G.failed }));
  // the song file: a synthetic recording of the chart (pad + lead line) at the same offset; melody and time map from it
  const sp = await open({ width: 1280, height: 800 });
  const spec = await sp.evaluate(() => { const ch = UI.chart; return JSON.stringify({ bpm: ch.bpm, beats: ch.beats, events: ch.events.filter(e => !e.rest).map(e => ({ beat: e.beat, len: e.len, pcs: chordPcs(parseChord(e.sounds)) })) }); });
  require('child_process').execFileSync('node', [__dirname + '/mkvoxwav.js', out + '/song.wav', spec, String(T0)]);
  await sp.setInputFiles('#vox-file', out + '/song.wav');
  let w = 0; while (w < 120000 && !(await sp.evaluate(() => !!(UI.vox && UI.vox.melody)))) { await sp.waitForTimeout(1000); w += 1000; }
  const file = await sp.evaluate(() => UI.vox && { melody: UI.vox.melody && UI.vox.melody.length, first: UI.vox.melody && UI.vox.melody.slice(0, 4), map: UI.vox.map.file ? UI.vox.map.pts.slice(0, 3) : null, msg: $('vox-msg') && $('vox-msg').textContent });
  await sp.screenshot({ path: `${out}/song-file.png` });
  await sp.evaluate(() => { Parts.voice = () => { const now = AudioEngine.now() - (Settings.latency || 0) / 1000; const t = Parts.targets.find(x => now >= x.t0 && now <= x.t1); return t ? { m: 60 + (t.m != null ? t.m % 12 : t.pcs[0]) + 0.1, clarity: 0.9 } : null; }; });
  await sp.click('#btn-stage', { force: true }); await sp.waitForTimeout(9000);
  await sp.screenshot({ path: `${out}/stage-melody.png` }); await sp.waitForTimeout(3500); await sp.screenshot({ path: `${out}/stage-melody2.png` });
  console.log('file', JSON.stringify(file), '| melody run', JSON.stringify(await sp.evaluate(() => ({ counts: G.counts, guide: Parts.guide }))));
  const q = await open({ width: 390, height: 844 });
  await q.screenshot({ path: `${out}/phone-song.png`, fullPage: true });
  await q.evaluate(() => { Parts.voice = () => ({ m: 64.2, clarity: 0.9 }); });
  await q.click('#btn-stage', { force: true }); await q.waitForTimeout(8000);
  await q.screenshot({ path: `${out}/phone-stage.png` });
  // pause and resume mid-song: the part moves to the band's new clock
  await q.evaluate(() => { G.pause(); }); await q.waitForTimeout(800); await q.evaluate(() => { G.resume(); }); await q.waitForTimeout(4000);
  console.log('after resume', JSON.stringify(await q.evaluate(() => ({ running: G.running, active: Parts.active, skipped: Parts.targets.filter(t => t.result === 'skip').length, judged: G.judgedN }))));
  console.log('fit', JSON.stringify(fit), '(true T0', T0 + ')', '| mid', JSON.stringify(mid), '| end', JSON.stringify(res));
  console.log(errs.join(';') || 'no page errors'); await b.close();
})();
