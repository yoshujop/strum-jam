// The band's sound, measured.  NODE_PATH=$(npm root -g) node test/audiotest.js <job> [outdir]
//   offline  (default) renders songs through the real engine into an OfflineAudioContext (fast, repeatable): every
//            style with its sections at rising hype, rock at each hype level, the leak-safe modes, odd metres.
//            Asserts: no sample at or above 1.0, loudness window, energy above 250 Hz, stereo side level, level steps.
//   rt       records the real-time output at the destination (works on older builds too: DIST=/path/strum-jam.html):
//            rock at hype 0-4, the same on speakers with the mic on, eight styles at hype 3.
//   stall    blocks the main thread for 150 / 400 / 1000 ms while the groove plays; reports dropped steps and holes.
//   sfx      every effect and jingle: peak level, length, how long it mutes strum detection.
//   menu     30 s of the menu theme.
// WAV=1 also writes each render to <outdir> (default /tmp/audiotest).
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const job = process.argv[2] || 'offline', out = process.argv[3] || '/tmp/audiotest';
const DIST = process.env.DIST || path.join(__dirname, '..', 'dist', 'strum-jam.html');
fs.mkdirSync(out, { recursive: true });

// runs in the page: numbers for a stereo render
const ANALYZE = `window.__an = function(L, R, sr){
  const n = L.length; let pk = 0, over = 0, sl = 0, sr2 = 0, slr = 0, sm = 0, ss = 0;
  const M = new Float32Array(n);
  for (let i = 0; i < n; i++) { const l = L[i], r = R[i], a = Math.max(Math.abs(l), Math.abs(r)); if (a > pk) pk = a; if (a >= 1) over++;
    sl += l * l; sr2 += r * r; slr += l * r; const m = (l + r) / 2, s = (l - r) / 2; M[i] = m; sm += m * m; ss += s * s; }
  const db = x => 10 * Math.log10(Math.max(x, 1e-12));
  const rms = db((sl + sr2) / (2 * n));
  function fft(re, im){ const N = re.length; for (let i = 1, j = 0; i < N; i++) { let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
  // long-window spectrum: band shares and flatness
  const N = 4096, win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const acc = new Float64Array(N / 2); let flat = 0, fr = 0;
  for (let p = 0; p + N <= n; p += N / 2) { const re = new Float32Array(N), im = new Float32Array(N); let e = 0; for (let i = 0; i < N; i++) { re[i] = M[p + i] * win[i]; e += re[i] * re[i]; } if (e < 1e-7) continue; fft(re, im);
    let lg = 0, ar = 0, c = 0; for (let k = Math.ceil(50 * N / sr); k < 10000 * N / sr; k++) { const pw = re[k] * re[k] + im[k] * im[k] + 1e-14; acc[k] += pw; lg += Math.log(pw); ar += pw; c++; } for (let k = 0; k < Math.ceil(50 * N / sr); k++) acc[k] += re[k] * re[k] + im[k] * im[k]; for (let k = Math.ceil(10000 * N / sr); k < N / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
    flat += Math.exp(lg / c) / (ar / c); fr++; }
  let tot = 0; for (let k = 0; k < N / 2; k++) tot += acc[k];
  const share = (a, b) => { let s = 0; for (let k = Math.ceil(a * N / sr); k < Math.min(N / 2, Math.ceil(b * N / sr)); k++) s += acc[k]; return s / (tot || 1); };
  // onsets: spectral flux peaks
  const n2 = 1024, h2 = 441, w2 = new Float32Array(n2); for (let i = 0; i < n2; i++) w2[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n2);
  let prev = null; const flux = [];
  for (let p = 0; p + n2 <= n; p += h2) { const re = new Float32Array(n2), im = new Float32Array(n2); for (let i = 0; i < n2; i++) re[i] = M[p + i] * w2[i]; fft(re, im); const mag = new Float32Array(n2 / 2); let f = 0; for (let k = 1; k < n2 / 2; k++) { mag[k] = Math.log(1 + 100 * Math.hypot(re[k], im[k])); if (prev) f += Math.max(0, mag[k] - prev[k]); } prev = mag; flux.push(f); }
  const srt = flux.slice().sort((a, b) => a - b), med = srt[srt.length >> 1] || 0, hi = srt[Math.floor(srt.length * 0.98)] || 0, thr = med + 0.25 * (hi - med); let ons = 0, last = -9;
  for (let i = 1; i < flux.length - 1; i++) if (flux[i] > thr && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1] && i - last > 4) { ons++; last = i; }
  // short-term level (400 ms windows, 200 ms hop)
  const wn = Math.round(sr * 0.4), st = []; for (let p = 0; p + wn <= n; p += wn / 2 | 0) { let e = 0; for (let i = p; i < p + wn; i++) e += M[i] * M[i]; st.push(db(e / wn)); }
  const act = st.filter(x => x > -60).sort((a, b) => a - b);
  return { sec: +(n / sr).toFixed(1), peak: +pk.toFixed(3), over, rms: +rms.toFixed(1), crest: +(20 * Math.log10(pk + 1e-9) - rms).toFixed(1),
    sub60: +share(0, 60).toFixed(3), b60_250: +share(60, 250).toFixed(3), b250_1k: +share(250, 1000).toFixed(3), b1k_4k: +share(1000, 4000).toFixed(3), b4k: +share(4000, sr / 2).toFixed(3),
    above250: +share(250, sr / 2).toFixed(3), laptop: +(10 * Math.log10(share(200, sr / 2) + 1e-9)).toFixed(1), flat: +(flat / (fr || 1)).toFixed(3), onsets: +(ons / (n / sr)).toFixed(1),
    corr: +(slr / Math.sqrt(sl * sr2 + 1e-20)).toFixed(3), side: +(db(ss) - db(sm)).toFixed(1), st10: act.length ? +act[Math.floor(act.length * 0.1)].toFixed(1) : -99, st90: act.length ? +act[Math.floor(act.length * 0.9)].toFixed(1) : -99 };
};
window.__wav = function(L, R, sr){ const b = new Uint8Array(44 + L.length * 4), dv = new DataView(b.buffer); const w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + L.length * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, L.length * 4, true);
  for (let i = 0; i < L.length; i++) { dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return btoa(s); };
// a little song: G C D Em style changes, with sections
window.__song = function(style, beats, sub){
  const prog = [[7, 4], [0, 4], [2, 4], [4, 3], [0, 4], [7, 4], [2, 4], [2, 4]];      // G C D Em C G D D
  const chord = bar => { const [pc, third] = prog[bar % prog.length]; return { root: 28 + ((pc - 4 + 12) % 12), fifth: 7, pcs: [pc, (pc + third) % 12, (pc + 7) % 12] }; };
  const chart = { song: { style }, beats, sub }, pattern = buildPattern(chart);
  return { pattern, chord, bassAt: k => chord(Math.floor(k / pattern.n)) };
};
// record whatever reaches the speakers (real-time jobs)
window.__rec = { on: false, L: [], R: [], sr: 0 };
(() => { const oc = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(dest, ...a){
    if (dest instanceof AudioDestinationNode && !this.__tap && !(this.context instanceof OfflineAudioContext)) { const ctx = this.context;
      if (!ctx.__sp) { const sp = ctx.__sp = ctx.createScriptProcessor(4096, 2, 2); window.__rec.sr = ctx.sampleRate;
        sp.onaudioprocess = e => { if (!window.__rec.on) return; window.__rec.L.push(new Float32Array(e.inputBuffer.getChannelData(0))); window.__rec.R.push(new Float32Array(e.inputBuffer.getChannelData(1))); };
        const z = ctx.createGain(); z.gain.value = 0; oc.call(sp, z); oc.call(z, ctx.destination); }
      this.__tap = true; oc.call(this, ctx.__sp); }
    return oc.call(this, dest, ...a); };
  window.__take = function(name, wav){ const r = window.__rec, cat = a => { let n = 0; for (const c of a) n += c.length; const o = new Float32Array(n); let k = 0; for (const c of a) { o.set(c, k); k += c.length; } return o; };
    const L = cat(r.L), R = cat(r.R); r.L = []; r.R = []; const m = window.__an(L, R, r.sr); m.name = name; if (wav) m.wav = window.__wav(L, R, r.sr); return m; };
})();`;

const COLS = ['name', 'sec', 'peak', 'over', 'rms', 'crest', 'sub60', 'b60_250', 'b250_1k', 'b1k_4k', 'b4k', 'above250', 'laptop', 'flat', 'onsets', 'corr', 'side', 'st10', 'st90', 'cpu'];
function table(rows, cols = COLS){
  const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] == null ? '' : r[c]).length)));
  console.log(cols.map((c, i) => c.padEnd(w[i])).join('  '));
  for (const r of rows) console.log(cols.map((c, i) => String(r[c] == null ? '' : r[c]).padEnd(w[i])).join('  '));
}
function save(rows){ for (const r of rows) if (r.wav) { fs.writeFileSync(path.join(out, r.name + '.wav'), Buffer.from(r.wav, 'base64')); delete r.wav; } }
const fails = [];
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log('FAIL  ' + msg); } };

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 665 } }); const errs = [];
  p.on('pageerror', e => { errs.push(e.message); console.log('PAGE ERROR', e.message); });
  await p.addInitScript(ANALYZE);
  await p.goto('file://' + DIST); await p.waitForTimeout(700);
  const WAV = !!process.env.WAV, w = ms => p.waitForTimeout(ms);
  const isNew = await p.evaluate(() => typeof Arranger !== 'undefined');

  if (job === 'offline') {
    // one render: opts = { style, bpm, beats, sub, swing, mode, bars, level | levelScript, leakSafe, sections }
    const render = (name, o) => p.evaluate(async ([name, o, wav]) => {
      const s = window.__song(o.style, o.beats || 4, o.sub || 4), beats = o.beats || 4, bars = o.bars || 8, bd = 60 / o.bpm;
      const sec = 0.2 + bars * beats * bd + (o.mode === 'song' ? beats * bd + 1.2 : 0);
      let info = {}; const t0 = performance.now();
      const buf = await AudioEngine.offline(sec, () => {
        Groove.level = o.level || 0;
        Groove.start({ mode: o.mode || 'loop', bpm: o.bpm, sub: o.sub || 4, swing: o.swing || 0, pattern: s.pattern, click: false, countIn: 0, firstBar: 0, endBar: bars, bassAt: s.bassAt,
          sections: o.sections, levelScript: o.levelScript, leakSafe: o.leakSafe, seed: 7, noKit: o.noKit, noBass: o.noBass, noComp: o.noComp });
        return t => Groove.pump(t + 0.5);
      });
      info = { hits: Groove.hits.length }; Groove.stop(true);
      const m = window.__an(buf.getChannelData(0), buf.getChannelData(1), buf.sampleRate); m.name = name; m.hits = info.hits; m.cpu = +((performance.now() - t0) / 1000 / sec).toFixed(2);
      if (wav) m.wav = window.__wav(buf.getChannelData(0), buf.getChannelData(1), buf.sampleRate);
      return m;
    }, [name, o, WAV]);
    if (process.env.TUNE) {       // a quick look while balancing the mix
      const rows = [];
      for (const [n, o] of [['rock-L2', { style: 'rock', bpm: 110, level: 2, bars: 4 }], ['rock-L2-drums', { style: 'rock', bpm: 110, level: 2, bars: 4, noBass: true, noComp: true }], ['rock-L2-bass', { style: 'rock', bpm: 110, level: 2, bars: 4, noKit: true, noComp: true }], ['rock-L2-comp', { style: 'rock', bpm: 110, level: 2, bars: 4, noKit: true, noBass: true }],
        ['pop-L2', { style: 'pop', bpm: 110, level: 2, bars: 4 }], ['pop-L2-comp', { style: 'pop', bpm: 110, level: 2, bars: 4, noKit: true, noBass: true }], ['hiphop-L2', { style: 'hiphop', bpm: 90, level: 2, bars: 4 }], ['funk-L3', { style: 'funk', bpm: 100, level: 3, bars: 4 }], ['ballad-L2', { style: 'ballad', bpm: 80, level: 2, bars: 4 }], ['ballad-L2-comp', { style: 'ballad', bpm: 80, level: 2, bars: 4, noKit: true, noBass: true }], ['folk-L2-comp', { style: 'folk', bpm: 100, level: 2, bars: 4, noKit: true, noBass: true }], ['reggae-L2-comp', { style: 'reggae', bpm: 80, level: 2, bars: 4, noKit: true, noBass: true }], ['edm-L2', { style: 'edm', bpm: 126, level: 2, bars: 4 }],
        ['safe-L2', { style: 'rock', bpm: 110, level: 2, bars: 4, leakSafe: true }], ['safe-L2-drums', { style: 'rock', bpm: 110, level: 2, bars: 4, leakSafe: 'drums' }], ['safe-L2-bass', { style: 'rock', bpm: 110, level: 2, bars: 4, leakSafe: true, noKit: true, noComp: true }], ['safe-L2-pad', { style: 'rock', bpm: 110, level: 2, bars: 4, leakSafe: true, noKit: true, noBass: true }]]) rows.push(await render(n, o));
      save(rows); table(rows); await b.close(); return;
    }
    const SEC = [{ name: 'Intro', startBar: 0, bars: 2 }, { name: 'Verse', startBar: 2, bars: 4 }, { name: 'Chorus', startBar: 6, bars: 4 }, { name: 'Bridge', startBar: 10, bars: 4 }, { name: 'Chorus 2', startBar: 14, bars: 4 }];
    const LS = { 0: 0, 2: 1, 4: 2, 6: 3, 10: 2, 14: 4 };
    const STY = [['rock', 120], ['pop', 104], ['ballad', 72], ['halftime', 140], ['funk', 100], ['disco', 120], ['shuffle', 112, 1], ['country', 116], ['reggae', 80], ['punk', 172], ['hiphop', 90, 0.4], ['metal', 160], ['folk', 100], ['bossa', 124], ['edm', 126], ['waltz', 110]];
    console.log('\n== every style: an 18-bar song (intro, verse, chorus, bridge, chorus) with hype rising 0 -> 4 ==');
    const songs = []; for (const [st, bpm, sw] of STY) songs.push(await render('song-' + st, { style: st, bpm, swing: sw, mode: 'song', bars: 18, sections: SEC, levelScript: LS }));
    save(songs); table(songs);
    console.log('\n== rock 120 bpm, 16 bars (a verse phrase and a chorus phrase) at each hype level (full band: headphones or tap mode) ==');
    const lv = []; for (let L = 0; L <= 4; L++) lv.push(await render('rock-L' + L, { style: 'rock', bpm: 120, level: L, bars: 16 }));
    save(lv); table(lv);
    console.log('\n== the same on speakers with the mic open (leak-safe band) ==');
    const lk = []; for (let L = 0; L <= 4; L++) lk.push(await render('rock-safe-L' + L, { style: 'rock', bpm: 120, level: L, leakSafe: true, bars: 16 }));
    lk.push(await render('rock-drumsonly-L3', { style: 'rock', bpm: 100, level: 3, leakSafe: 'drums' }));
    save(lk); table(lk);
    console.log('\n== other metres and tempos, the player in the band ==');
    const ot = [];
    ot.push(await render('waltz-3-4', { style: 'waltz', bpm: 110, beats: 3, mode: 'song', bars: 16, sections: [{ name: 'Verse', startBar: 0, bars: 8 }, { name: 'Chorus', startBar: 8, bars: 8 }], levelScript: { 0: 1, 4: 2, 8: 3, 12: 4 } }));
    ot.push(await render('ballad-6-8', { style: 'ballad', bpm: 60, beats: 2, sub: 3, mode: 'song', bars: 16, sections: [{ name: 'Verse', startBar: 0, bars: 8 }, { name: 'Chorus', startBar: 8, bars: 8 }], levelScript: { 0: 1, 4: 2, 8: 3, 12: 4 } }));
    ot.push(await render('shuffle-12-8', { style: 'shuffle', bpm: 96, beats: 4, sub: 3, level: 3 }));
    ot.push(await render('rock-60bpm-L2', { style: 'rock', bpm: 60, level: 2, bars: 4 }));
    ot.push(await render('punk-200bpm-L4', { style: 'punk', bpm: 200, level: 4, bars: 16 }));
    ot.push(await render('pop-noKit-L3', { style: 'pop', bpm: 104, level: 3, noKit: true }));
    ot.push(await render('pop-noBass-L3', { style: 'pop', bpm: 104, level: 3, noBass: true }));
    ot.push(await render('pop-noComp-L3', { style: 'pop', bpm: 104, level: 3, noComp: true }));
    ot.push(await render('none-L2', { style: 'none', bpm: 90, level: 2 }));
    save(ot); table(ot);
    // assertions
    const all = songs.concat(lv, lk, ot);
    for (const r of all) check(r.over === 0 && r.peak < 0.999, `${r.name}: clips (peak ${r.peak}, ${r.over} samples at or above 1.0)`);
    for (const r of songs.concat(lv.slice(1))) {
      check(r.rms > -24 && r.rms < -13, `${r.name}: loudness ${r.rms} dBFS outside -24..-13`);
      check(r.above250 >= 0.15, `${r.name}: only ${(r.above250 * 100).toFixed(0)}% of the energy above 250 Hz`);
      check(r.side > -24, `${r.name}: stereo side level ${r.side} dB (mono)`);
      check(r.flat < 0.3, `${r.name}: spectral flatness ${r.flat} (noise, not music)`);
    }
    for (let L = 1; L <= 4; L++) check(Math.abs(lv[L].rms - lv[L - 1].rms) < 6, `rock L${L - 1}->L${L}: level step ${(lv[L].rms - lv[L - 1].rms).toFixed(1)} dB`);
    for (let L = 1; L <= 4; L++) check(lv[L].onsets >= lv[L - 1].onsets - 0.3, `rock L${L}: not busier than L${L - 1} (${lv[L].onsets} vs ${lv[L - 1].onsets} onsets/s)`);
    const rs = songs.map(r => r.rms); check(Math.max(...rs) - Math.min(...rs) < 7, `styles differ by ${(Math.max(...rs) - Math.min(...rs)).toFixed(1)} dB in loudness`);
    for (const r of lk.slice(0, 5)) check(r.rms > -27, `${r.name}: ${r.rms} dBFS, too quiet`);
    // same seed -> same bar: the look-ahead (Groove.plan) must agree with what was played
    const det = await p.evaluate(() => { const mk = () => { const s = window.__song('funk', 4, 4), q = { style: 'funk', beats: 4, sub: 4, n: 16, P: s.pattern, seed: 5, bar: 3, barIn: 3, secBars: 8, kind: 'verse', level: 3, leak: 'full', chordAt: i => { const c = s.chord(3); return { root: c.root, pcs: c.pcs, fifth: 7, third: 4 }; }, nextChord: null }; return JSON.stringify(Arranger.bar(q)); }; return mk() === mk(); });
    check(det, 'Arranger.bar is not deterministic for the same input');
  }

  if (job === 'rt') {
    const groove = (style, bpm, level, swing, leakOn) => p.evaluate(([style, bpm, level, swing, leakOn]) => {
      AudioEngine.ensure(); Mic.on = !!leakOn; Settings.headphones = false;
      const s = window.__song(style, 4, 4);
      Groove.level = level;
      Groove.start({ mode: 'loop', bpm, sub: 4, swing, pattern: s.pattern, click: false, countIn: 0, bassAt: s.bassAt, seed: 7 });
      Groove.level = level;
    }, [style, bpm, level, swing, leakOn]);
    const take = name => p.evaluate(([n, wav]) => window.__take(n, wav), [name, WAV]);
    const rows = [];
    await p.evaluate(() => { AudioEngine.ensure(); }); await w(400);
    const run = async (name, ...a) => { await groove(...a); await w(600); await p.evaluate(() => { window.__rec.L = []; window.__rec.R = []; window.__rec.on = true; }); await w(9600); const m = await take(name); await p.evaluate(() => window.__rec.on = false); rows.push(m); };
    for (let L = 0; L <= 4; L++) await run('rock100-L' + L, 'rock', 100, L, 0, false);
    for (let L = 0; L <= 4; L += 2) await run('rock100-mic-speakers-L' + L, 'rock', 100, L, 0, true);
    for (const [s, bpm, sw] of [['pop', 104, 0], ['funk', 100, 0], ['ballad', 72, 0], ['country', 116, 0], ['reggae', 80, 0], ['metal', 160, 0], ['edm', 126, 0], ['shuffle', 112, 1]]) await run(s + '-L3', s, bpm, 3, sw, false);
    const st = await p.evaluate(() => { const r = { dropped: Groove.dropped, late: Groove.late }; Groove.stop(); return r; });
    save(rows); console.log('\n== real-time output at the destination, ' + (isNew ? 'this build' : 'older build') + ' ==' + (isNew ? '  dropped ' + st.dropped + ' late ' + st.late : '')); table(rows);
    if (isNew) for (const r of rows) check(r.over === 0, `${r.name}: ${r.over} samples at or above 1.0`);
  }

  if (job === 'stall') {
    await p.evaluate(() => { AudioEngine.ensure(); }); await w(400);
    // every scheduled hit vs what the grid says should have sounded: count the grid steps that never got scheduled in time
    const res = await p.evaluate(async () => {
      const s = window.__song('funk', 4, 4), sleep = ms => new Promise(r => setTimeout(r, ms));
      Groove.level = 2;
      // count what actually gets handed to the audio thread in time
      let played = 0, skipped = 0;
      const AC = AudioEngine.ctx, op = Groove.play.bind(Groove);
      Groove.play = function(k, t){ if (AC.currentTime - t > (typeof Arranger !== 'undefined' ? 0.1 : 0.01)) skipped++; else played++; return op(k, t); };
      Groove.start({ mode: 'loop', bpm: 100, sub: 4, swing: 0, pattern: s.pattern, click: false, countIn: 0, bassAt: s.bassAt, seed: 7 });
      Groove.level = 2;
      const out = [];
      await sleep(3000);
      for (const ms of [150, 400, 400, 1000, 1000]) {
        const p0 = played, s0 = skipped; const e = performance.now() + ms; while (performance.now() < e);
        await sleep(3000); out.push({ stallMs: ms, steps: played + skipped - p0 - s0, skipped: skipped - s0 });
      }
      Groove.stop(); delete Groove.play;
      return out;
    });
    console.log('\n== main-thread stalls while the groove plays (' + (isNew ? 'this build' : 'older build') + ') =='); table(res, ['stallMs', 'steps', 'skipped']);
    if (isNew) { check(res[0].skipped === 0 && res[1].skipped === 0, 'steps were dropped by a stall of 400 ms or less'); check(res[2].skipped === 0, 'the second 400 ms stall dropped steps'); check(res[4].skipped <= res[3].skipped, 'the look-ahead did not adapt after a 1 s stall'); }
  }

  if (job === 'sfx') {
    await p.click('#btn-start', { force: true }); await w(3600);
    await p.evaluate(() => { Settings.musicOn = false; Music.update(false); }); await w(700);
    const names = await p.evaluate(() => Object.keys(Sfx).filter(k => typeof Sfx[k] === 'function' && !['stinger', 'jingle', 'setKey', 'key', 'at'].includes(k)));
    const jing = isNew ? await p.evaluate(() => Sfx.JINGLES || []) : [];
    const rows = [];
    const one = async (name, call, ms, leak) => {
      await p.evaluate(leak => { Mic.on = !!leak; Settings.headphones = false; Mic.muteUntil = 0; window.__rec.L = []; window.__rec.R = []; window.__rec.on = true; }, leak);
      const mute = await p.evaluate(call => { const t = AudioEngine.ctx.currentTime; (0, eval)(call); return Math.max(0, Mic.muteUntil - t); }, call);
      await w(ms);
      const m = await p.evaluate(([n, wav]) => { window.__rec.on = false; return window.__take(n, wav); }, [name, WAV]);
      rows.push({ name, peakDb: +(20 * Math.log10(m.peak + 1e-9)).toFixed(1), rms: m.rms, over: m.over, muteMs: Math.round(mute * 1000), side: m.side });
      if (m.wav) fs.writeFileSync(path.join(out, 'sfx-' + name + '.wav'), Buffer.from(m.wav, 'base64'));
    };
    for (const n of names) await one(n, `Sfx.${n}(${n === 'gotIt' ? 5 : n === 'levelUp' ? 3 : n === 'hover' ? 2 : ''})`, ['boo', 'powerOn', 'cheer', 'levelUp'].includes(n) ? 2800 : 1200, false);
    for (const n of ['perfect', 'great', 'good', 'miss', 'gotIt', 'combo', 'levelUp']) if (names.includes(n)) await one(n + ' (mic on, speakers)', `Sfx.${n}(${n === 'gotIt' ? 5 : n === 'levelUp' ? 3 : ''})`, 1200, true);
    for (const j of jing) await one('jingle:' + j, `Sfx.jingle('${j}')`, 2600, false);
    console.log('\n== effects (' + (isNew ? 'this build' : 'older build') + '): peak dBFS at the output, ms of muted strum detection =='); table(rows, ['name', 'peakDb', 'rms', 'over', 'muteMs', 'side']);
    if (isNew) for (const r of rows) check(r.over === 0, `${r.name} clips`);
  }

  if (job === 'menu') {
    await p.evaluate(() => { window.__rec.on = true; });
    await p.click('#btn-start', { force: true }); await w(4000);
    await p.evaluate(() => { window.__rec.L = []; window.__rec.R = []; }); await w(30000);
    const m = await p.evaluate(wav => window.__take('menu', wav), WAV); save([m]);
    console.log('\n== menu theme, 30 s (' + (isNew ? 'this build' : 'older build') + ') =='); table([m]);
    if (isNew) { check(m.over === 0, 'menu clips'); check(m.above250 >= 0.25, `menu: only ${(m.above250 * 100).toFixed(0)}% of the energy above 250 Hz`); check(m.side > -24, 'menu is mono'); }
  }

  await b.close();
  if (errs.length) { console.log('PAGE ERRORS: ' + errs.join(' | ')); process.exit(1); }
  if (fails.length) { console.log('\n' + fails.length + ' check(s) failed'); process.exit(1); }
  console.log('\nall checks passed');
})();
