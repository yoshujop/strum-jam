// Does the band's sound, leaking from the speakers into the mic, fool the note check?
//   NODE_PATH=$(npm root -g) node test/audioleak.js <silence | path/to.wav> [secs=30] [level=2] [band=safe|drums]
// Practice mode on "Chord Drill: G, C, D" with the game's own output mixed into the mic chain at a speaker-ish level
// (gain 0.5, 23 ms late). With `silence` the player does nothing: every "chord found" is a false accept, every green
// string a false light. With test/right.wav (node test/mkwav.js: G C D, two strums each, 3 s per chord) the player plays
// the right chords: count how many are found, to compare bands (band=drums is the old drums-only behaviour).
// DIST=/path/strum-jam.html runs an older build.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const os = require('os');
const src = process.argv[2] || 'silence', secs = +(process.argv[3] || 30), level = +(process.argv[4] || 2), band = process.argv[5] || 'safe';
const DIST = process.env.DIST || path.join(__dirname, '..', 'dist', 'strum-jam.html');
let wav = src;
if (src === 'silence') {
  wav = path.join(os.tmpdir(), 'sj-silence.wav'); const n = 48000 * 40, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(48000, 24); b.writeUInt32LE(96000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round((Math.random() - 0.5) * 40), 44 + i * 2);       // a quiet room
  fs.writeFileSync(wav, b);
}
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + path.resolve(wav), '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + DIST); await p.waitForTimeout(800); await p.click('#btn-start', { force: true }); await p.waitForTimeout(3800);
  for (let w = 0; w < 40 && !(await p.evaluate(() => Listen.ready)); w++) await p.waitForTimeout(300);
  await p.click('#btn-play', { force: true }); await p.waitForTimeout(900);
  await p.click('text=Chord Drill: G, C, D', { timeout: 8000 }); await p.waitForTimeout(400);
  await p.evaluate(band => { Settings.tuneFirst = false; Settings.leakBand = band; }, band);
  await p.click('#btn-practice'); await p.waitForTimeout(800);
  const info = await p.evaluate(([lv, silent]) => {
    const ctx = AudioEngine.ctx, g = ctx.createGain(); g.gain.value = 0.5; AudioEngine.master.connect(g);
    const d = ctx.createDelay(0.1); d.delayTime.value = 0.023; g.connect(d);
    if (Listen.node) d.connect(Listen.node); d.connect(Mic.anLong); d.connect(Mic.anSmall);
    G.hype = [0.05, 0.3, 0.5, 0.7, 0.95][lv]; G.setLevel(lv);
    window.__found = 0; const ps = G.practiceSuccess.bind(G);
    G.practiceSuccess = function(now, how){ if (how !== 'tap' && how !== 'skip') window.__found++; if (!silent) return ps(now, how); };     // silent player: stay on G
    return { mic: Mic.on, model: Listen.ready, mode: typeof Groove.leakMode === 'function' ? Groove.leakMode() : 'old build (drums only)' };
  }, [level, src === 'silence']);
  const sh = { samples: 0, green: 0, wrong: 0, wrongNotes: {}, strings: [0, 0, 0, 0, 0, 0] };
  for (let i = 0; i < secs * 4; i++) { await p.waitForTimeout(250);
    const f = await p.evaluate(() => G.fb ? { s: G.fb.states.slice(), w: G.fb.wrong.map(w => midiName(w.midi)) } : null);
    sh.samples++; if (f) { f.s.forEach((x, k) => { if (x === 'heard') sh.strings[k]++; }); if (f.s.includes('heard')) sh.green++; if (f.w.length) { sh.wrong++; for (const w of f.w) sh.wrongNotes[w] = (sh.wrongNotes[w] || 0) + 1; } } }
  const found = await p.evaluate(() => window.__found);
  console.log(JSON.stringify({ wav: path.basename(src), level, band: info.mode, secs, chordsFound: found, samplesWithGreenStrings: sh.green, greenPerString: sh.strings.join(' '), samplesWithWrongNotes: sh.wrong, of: sh.samples, wrongNotes: sh.wrongNotes, mic: info.mic, model: info.model, errors: errs }));
  await b.close();
})();
