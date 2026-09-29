// Bass, Piano and Drums on Stage with simulated playing (right notes / chords / hits on time for ~10 s, then nothing),
// screenshots of the song screen, the stage mid-run and the results, at desktop and phone size. node test/bandshot.js [outdir]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/band'; require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errs = [], log = [];
  for (const [inst, vp, tag] of [['bass', { width: 1280, height: 800 }, 'd'], ['piano', { width: 1280, height: 800 }, 'd'], ['drums', { width: 1280, height: 800 }, 'd'], ['bass', { width: 390, height: 844 }, 'p'], ['drums', { width: 390, height: 844 }, 'p'], ['piano', { width: 390, height: 844 }, 'p']]) {
    const p = await b.newPage({ viewport: vp }); p.on('pageerror', e => errs.push(inst + ': ' + e.message));
    await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(700);
    await p.click('#btn-start', { force: true }); await p.waitForTimeout(500);
    await p.evaluate(inst => { Settings.tuneFirst = false; Settings.inst = inst; saveSettings(); UI.openSong(validateSong(LIBRARY.find(x => /Saints/.test(x.title)), 'library')); }, inst);
    await p.waitForTimeout(700);
    if (tag === 'd') await p.screenshot({ path: `${out}/${inst}-song.png` });
    // simulated player: plays every target right for 10 s
    await p.evaluate(() => {
      const t0 = performance.now(), on = () => performance.now() - t0 < 10000, nowJ = () => AudioEngine.now() - (Settings.latency || 0) / 1000;
      const cur = () => Parts.targets.find(t => !t.result && nowJ() >= t.t0 - 0.02 && nowJ() <= t.t1);
      Parts.bassPitch = () => { const t = on() && cur(); return t ? { m: t.m + 12.05, rms: 0.05 } : null; };
      Parts.heardPcs = () => { const t = on() && cur(); return { pcs: new Set(t ? t.pcs : []), midi: false }; };
      const iv = setInterval(() => { if (!Parts.active) return; if (!on()) return clearInterval(iv);
        for (const t of Parts.targets) if (!t.result && t.lane && !t.sent && AudioEngine.now() >= t.t0 + 0.01) { t.sent = 1; Parts.drumHit(t.lane, t.t0 + 0.03, 'key'); } }, 10);
    });
    await p.click('#btn-stage', { force: true }); await p.waitForTimeout(8500);
    await p.screenshot({ path: `${out}/${inst}-${tag}-stage.png` });
    const mid = await p.evaluate(() => ({ counts: G.counts, score: G.score, n: Parts.targets.length }));
    let w = process.env.QUICK ? 1e9 : 0; while (w < 120000 && !(await p.evaluate(() => UI.screen === 'results'))) { await p.waitForTimeout(1000); w += 1000; }
    await p.waitForTimeout(1000); if (tag === 'd') await p.screenshot({ path: `${out}/${inst}-results.png` });
    log.push(`${inst}/${tag} mid ${JSON.stringify(mid)} end ${await p.evaluate(() => $('res-grade').textContent + ' · ' + $('res-sub').textContent)}`);
    await p.close();
  }
  console.log(log.join('\n')); console.log(errs.join(';') || 'no page errors'); await b.close();
})();
