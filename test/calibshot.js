// Ear calibration: the modal mid-run (fake mic), then what it learns from simulated readings: a clean mic (no change),
// a quiet ghosty mic (lower "heard" bars, higher "wrong" bar), vocals, and drums told apart. node test/calibshot.js [outdir]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/calib'; require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(700);
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(500);
  await p.evaluate(async () => { await Mic.start(); UI.openCalib('guitar'); });
  await p.click('#btn-cal-go', { force: true }); await p.waitForTimeout(4200);
  await p.screenshot({ path: `${out}/modal.png` });
  const r = await p.evaluate(() => {
    const L = (inst, r, f) => { const o = Calib.learn(inst, r, f || 0.002); return { msg: o.msg, ears: Mic.ears[inst] }; };
    const clean = L('guitar', { played: [0.8, 0.9, 0.7, 0.85, 0.75, 0.9], ghosts: [0.1, 0.2, 0.15, 0.1, 0.3, 0.2], chordsOk: 1, chords: 1 });
    const cleanCal = Listen.cal;
    const weak = L('guitar', { played: [0.3, 0.35, 0.28, 0.4, 0.32, 0.3], ghosts: [0.5, 0.45, 0.55, 0.4, 0.5, 0.52], chordsOk: 0, chords: 1 });
    const vox = L('vocals', { rms: [0.02, 0.03, 0.025, 0.04], seen: 30, want: 50 });
    // drums: learn from three clusters, then classify fresh hits
    const mk = (cen, low) => ({ cen, low });
    const dr = L('drums', { hits: { kick: [mk(120, 0.7), mk(140, 0.65), mk(110, 0.75)], snare: [mk(1500, 0.1), mk(1800, 0.12), mk(1600, 0.08)], hat: [mk(7000, 0.01), mk(8000, 0.02), mk(7500, 0.01)] } });
    const cls = [[130, 0.7], [1700, 0.1], [7600, 0.01]].map(([c, l]) => { Calib.hitFeatures = () => ({ cen: c, low: l }); return Calib.classify(); });
    return { clean, cleanCal, weak, weakCal: Listen.cal, vox, dr: dr.msg, cls, saved: !!(Settings.micProfiles[Mic.deviceId] || {}).ears };
  });
  console.log(JSON.stringify(r, null, 1)); console.log(errs.join(';') || 'no page errors'); await b.close();
})();
