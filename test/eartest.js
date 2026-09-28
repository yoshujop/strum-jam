// Offline accuracy test for Ear: simulated guitars, mics, rooms and distractors.
const fs = require('fs');
const src = ['10-theory.js'].map(f => fs.readFileSync(__dirname + '/../src/' + f, 'utf8')).join('\n');
eval(src + '\n;global.T={parseChord,voicingFor,soundingNotes,OPEN_MIDI,midiToHz,mod12,noteName};');
const { Ear } = require('../src/45-ear.js');
const SR = 48000;
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
// Karplus-Strong string with slight inharmonic stretch via allpass-ish detune and pick position
function pluck(midi, dur, vel, bright){
  // Karplus-Strong with an accurate fractional delay; strings detuned by up to ±DETUNE cents
  const cents = (rnd() - 0.5) * 2 * (global.DETUNE || 8);
  const f = T.midiToHz(midi) * Math.pow(2, cents / 1200);
  const n = Math.round(dur * SR), out = new Float32Array(n);
  const L = SR / f - 0.5;                 // the averaging filter adds half a sample of delay
  const size = Math.ceil(L) + 4, buf = new Float32Array(size);
  const Ni = Math.floor(L), frac = L - Ni;
  for (let i = 0; i < Ni; i++) buf[i] = rnd() * 2 - 1;
  const pp = Math.max(2, Math.round(Ni * (0.12 + rnd() * 0.1)));
  const tmp = buf.slice(0, Ni); for (let i = 0; i < Ni; i++) buf[i] = tmp[i] - tmp[(i + pp) % Ni];
  // delay line with fractional read
  const line = new Float32Array(size * 2); for (let i = 0; i < Ni; i++) line[i] = buf[i];
  let w = Ni, prev = 0; const g = midi > 60 ? 0.994 : 0.996;
  const hist = new Float32Array(n + size * 2); for (let i = 0; i < Ni; i++) hist[i] = buf[i];
  for (let i = 0; i < n; i++) {
    const pos = i + Ni + frac;          // read L samples back from write index i+L
    const rp = i + (Ni - Ni) ;          // not used
    const a0 = hist[i], a1 = hist[i + 1] || 0;
    const x = a0 * (1 - frac) + a1 * frac;   // fractional delay
    const y = g * 0.5 * (x + prev); prev = x;
    hist[i + Ni + 1] = y;
    out[i] = x * vel;
  }
  return out;
}
function mix(dst, src, at, gain){ for (let i = 0; i < src.length && at + i < dst.length; i++) if (at + i >= 0) dst[at + i] += src[i] * gain; }
function strum(midis, dur, opts){
  opts = opts || {};
  const out = new Float32Array(Math.round(dur * SR));
  const t0 = Math.round(0.05 * SR), spread = (opts.spread || 0.012) * SR;
  midis.forEach((m, i) => mix(out, pluck(m, dur, 0.25 * (0.75 + rnd() * 0.5), 0.5), t0 + Math.round(i * spread * (0.7 + rnd() * 0.6)), 1));
  // guitar body: resonant bump ~110 Hz and ~220 Hz (simple 2-pole bandpass mixed in)
  return body(out);
}
function biquad(x, type, f, q, gainDb){
  const w = 2 * Math.PI * f / SR, s = Math.sin(w), c = Math.cos(w), al = s / (2 * q); let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { const A = Math.pow(10, gainDb / 40); b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function body(x){ let y = biquad(x, 'pk', 110, 2, 6); y = biquad(y, 'pk', 220, 2, 4); y = biquad(y, 'pk', 3000, 1, -4); return y; }
function room(x){ // cheap reverb: a few damped echoes
  const y = Float32Array.from(x);
  for (const [d, g] of [[0.013, 0.35], [0.029, 0.28], [0.047, 0.2], [0.071, 0.15], [0.11, 0.1]]) mix(y, x, Math.round(d * SR), g);
  return y;
}
const MICS = {
  studio: x => x,
  laptop: x => { let y = biquad(x, 'hp', 220, 0.7); y = biquad(y, 'lp', 7000, 0.7); y = biquad(y, 'pk', 2500, 1, 6); return y; },
  webcam: x => { let y = biquad(x, 'hp', 150, 0.7); y = biquad(y, 'lp', 5000, 0.7); return y.map(v => Math.tanh(v * 3) / 3); },
  phone: x => { let y = biquad(x, 'hp', 300, 0.7); y = biquad(y, 'lp', 3400, 0.7); y = biquad(y, 'lp', 3400, 0.7); return y; },
};
function addNoise(x, level){ const y = Float32Array.from(x); for (let i = 0; i < y.length; i++) y[i] += gauss() * level; // + mains hum
  for (let i = 0; i < y.length; i++) y[i] += level * 0.6 * Math.sin(2 * Math.PI * 60 * i / SR) + level * 0.3 * Math.sin(2 * Math.PI * 180 * i / SR); return y; }
function drums(dur, bpm){
  const out = new Float32Array(Math.round(dur * SR)), beat = 60 / bpm;
  for (let t = 0.05; t < dur; t += beat / 2) {
    const i0 = Math.round(t * SR), k = Math.round(t / (beat / 2));
    for (let i = 0; i < 0.05 * SR && i0 + i < out.length; i++) out[i0 + i] += gauss() * 0.05 * Math.exp(-i / (0.01 * SR)); // hat
    if (k % 2 === 0) for (let i = 0; i < 0.3 * SR && i0 + i < out.length; i++) { const f = 50 + 100 * Math.exp(-i / (0.03 * SR)); out[i0 + i] += 0.5 * Math.sin(2 * Math.PI * f * i / SR) * Math.exp(-i / (0.08 * SR)); } // kick
    if (k % 4 === 2) for (let i = 0; i < 0.2 * SR && i0 + i < out.length; i++) out[i0 + i] += gauss() * 0.25 * Math.exp(-i / (0.05 * SR)) + 0.15 * Math.sin(2 * Math.PI * 190 * i / SR) * Math.exp(-i / (0.03 * SR)); // snare
  }
  return out;
}
function voice(dur){ // speech-like: glottal pulses through formants with gliding pitch
  const out = new Float32Array(Math.round(dur * SR)); let ph = 0;
  for (let i = 0; i < out.length; i++) { const f0 = 140 + 30 * Math.sin(i / SR * 5) + 20 * Math.sin(i / SR * 1.3); ph += f0 / SR; if (ph >= 1) { ph -= 1; out[i] = 1; } }
  let y = biquad(out, 'pk', 700, 4, 18); y = biquad(y, 'pk', 1200, 4, 14); y = biquad(y, 'pk', 2500, 4, 10); y = biquad(y, 'hp', 100, 0.7);
  let mx = 0; for (const v of y) mx = Math.max(mx, Math.abs(v)); return y.map(v => v / mx * 0.2);
}
function claps(dur){ const out = new Float32Array(Math.round(dur * SR)); for (let t = 0.05; t < dur; t += 0.5) { const i0 = Math.round(t * SR); for (let i = 0; i < 0.04 * SR; i++) out[i0 + i] += gauss() * 0.4 * Math.exp(-i / (0.006 * SR)); } return out; }

// independent second synth: additive partials with string inharmonicity, pluck-position comb and per-partial decay
function pluckAdd(midi, dur, vel){
  const cents = (rnd() - 0.5) * 2 * (global.DETUNE || 8);
  const f0 = T.midiToHz(midi) * Math.pow(2, cents / 1200);
  const B = midi < 52 ? 1.5e-4 : midi < 60 ? 8e-5 : 4e-5;   // wound strings are stiffer
  const n = Math.round(dur * SR), out = new Float32Array(n);
  const pos = 0.1 + rnd() * 0.15;
  for (let h = 1; h <= 30; h++) {
    const f = h * f0 * Math.sqrt(1 + B * h * h); if (f > SR / 2.2) break;
    const a = Math.abs(Math.sin(Math.PI * h * pos)) / h * (0.6 + rnd() * 0.8);
    const tau = 1.8 / (1 + 0.004 * f) * (midi < 52 ? 1.4 : 1);
    const ph = rnd() * 6.283, w = 2 * Math.PI * f / SR;
    for (let i = 0; i < n; i++) out[i] += a * Math.sin(w * i + ph) * Math.exp(-i / SR / tau) * Math.min(1, i / 48);
  }
  for (let i = 0; i < n; i++) out[i] *= vel * 0.6;
  return out;
}
if (process.env.ADD) pluck = pluckAdd;
function whistle(dur, f){ const o = new Float32Array(Math.round(dur * SR)); for (let i = 0; i < o.length; i++) o[i] = 0.15 * Math.sin(2 * Math.PI * f * (1 + 0.003 * Math.sin(i / SR * 30)) * i / SR); return o; }
function hum(dur, f){ const o = new Float32Array(Math.round(dur * SR)); let ph = 0; for (let i = 0; i < o.length; i++) { ph += f / SR; if (ph >= 1) { ph -= 1; o[i] = 1; } } let y = biquad(o, 'pk', 500, 3, 15); y = biquad(y, 'lp', 1500, 0.7); let mx = 0; for (const v of y) mx = Math.max(mx, Math.abs(v)); return y.map(v => v / mx * 0.2); }
function fan(dur){ const o = new Float32Array(Math.round(dur * SR)); for (let i = 0; i < o.length; i++) o[i] = gauss() * 0.05; return biquad(o, 'lp', 1200, 0.7); }
function tapBody(dur){ const o = new Float32Array(Math.round(dur * SR)); for (let t = 0.05; t < dur; t += 0.3) { const i0 = Math.round(t * SR); for (let i = 0; i < 0.15 * SR && i0 + i < o.length; i++) o[i0 + i] += 0.3 * Math.sin(2 * Math.PI * 105 * i / SR) * Math.exp(-i / (0.03 * SR)) + gauss() * 0.1 * Math.exp(-i / (0.004 * SR)); } return o; }
function chordMidis(name, capo){ const v = T.voicingFor(T.parseChord(name), false); return T.soundingNotes(v, capo || 0).map(n => n.midi); }
// the judgement used by the game: frames 0.26s..1.0s after the strum, need 3+ matching frames
function judge(signal, target, mode, noise){
  let ok = 0, frames = 0, best = null;
  for (let t = 0.05 + 0.42; t <= 0.05 + 1.4; t += 1 / 20) {
    const end = Math.round(t * SR); if (end < Ear.N || end > signal.length) continue;
    const an = Ear.analyze(signal.subarray(0, end), SR, noise);
    const r = (process.env.OLD ? Ear.match : Ear.matchTarget)(an, { midis: target }, mode);
    frames++; if (r.ok) ok++;
    if (!best || r.purity > best.purity) best = { ...r, notes: an.notes.map(n => T.noteName(n.m) + Math.floor(n.m / 12 - 1)) };
  }
  return { pass: ok >= 3, ok, frames, best };
}
const CHORDS = ['G', 'C', 'D', 'Em', 'Am', 'E', 'A', 'Dm', 'F', 'Bm', 'G7', 'C7', 'D7', 'Cmaj7', 'Fmaj7', 'Em7', 'Am7', 'Dsus4', 'Asus2', 'B7'];
const CONFUSE = { G: ['Em7', 'G7', 'D', 'C'], C: ['Am', 'Cmaj7', 'Am7', 'F'], D: ['Dsus4', 'D7', 'Bm', 'G'], Em: ['Em7', 'G', 'C', 'E'], Am: ['C', 'Am7', 'F', 'Dm'],
  E: ['Em', 'A', 'B7'], A: ['Asus2', 'Am', 'D'], Dm: ['F', 'D', 'Am'], F: ['Dm', 'Fmaj7', 'C'], Bm: ['D', 'G', 'Em'], G7: ['G', 'B7'], C7: ['C', 'Cmaj7'], D7: ['D', 'Am7'],
  Cmaj7: ['C', 'Em'], Fmaj7: ['F', 'Am'], Em7: ['Em', 'G'], Am7: ['Am', 'C'], Dsus4: ['D', 'G'], Asus2: ['A', 'E'], B7: ['E', 'Em'] };
const mode = process.argv[2] || 'normal'; global.DETUNE = +(process.argv[3] || 8);
let tp = 0, tpN = 0, fp = 0, fpN = 0; const fails = [], falses = [];
for (const micName of Object.keys(MICS)) {
  const mic = MICS[micName];
  for (const ch of CHORDS) {
    const target = chordMidis(ch);
    for (const bleed of [false, true]) {
      let sig = strum(target, 1.6);
      if (bleed) mix(sig, drums(1.6, 110), 0, 0.5);
      sig = addNoise(mic(room(sig)), micName === 'phone' ? 0.004 : 0.002);
      const r = judge(sig, target, mode); tpN++; if (r.pass) tp++; else fails.push(`${micName}${bleed ? '+drums' : ''} ${ch}: ok ${r.ok}/${r.frames} purity ${r.best.purity.toFixed(2)} miss ${r.best.missing.map(T.noteName)} wrong ${r.best.wrong.map(T.noteName)} notes ${r.best.notes.join(' ')}`);
    }
    // distractors for this target
    const wrongs = (CONFUSE[ch] || []).map(n => ({ label: 'chord ' + n, sig: strum(chordMidis(n), 1.6) }));
    wrongs.push({ label: 'single note', sig: strum([target[Math.floor(rnd() * target.length)]], 1.6) });
    wrongs.push({ label: 'two notes', sig: strum(target.slice(-2), 1.6) });
    { const ch0 = T.parseChord(ch), pw = target.filter(m => [ch0.root, (ch0.root + 7) % 12].includes(m % 12)); if (pw.length >= 2) wrongs.push({ label: 'power chord', sig: strum(pw, 1.6) }); }
    wrongs.push({ label: 'open strings', sig: strum([40, 45, 50, 55, 59, 64], 1.6) });
    wrongs.push({ label: 'a whole step off', sig: strum(target.map(m => m + 2), 1.6) });
    wrongs.push({ label: 'muted strum', sig: (() => { const x = new Float32Array(1.6 * SR); for (let i = 0; i < 0.06 * SR; i++) x[Math.round(0.05 * SR) + i] = gauss() * 0.3 * Math.exp(-i / (0.01 * SR)); return x; })() });
    wrongs.push({ label: 'speech', sig: voice(1.6) });
    wrongs.push({ label: 'claps', sig: claps(1.6) });
    wrongs.push({ label: 'drums only', sig: drums(1.6, 110) });
    wrongs.push({ label: 'whistle', sig: whistle(1.6, T.midiToHz(target[target.length - 1])) });
    wrongs.push({ label: 'hum root', sig: hum(1.6, T.midiToHz(target[0])) });
    wrongs.push({ label: 'fan noise', sig: fan(1.6) });
    wrongs.push({ label: 'body taps', sig: tapBody(1.6) });
    wrongs.push({ label: 'loud open strum', sig: strum([40, 45, 50, 55, 59, 64].map(m => m), 1.6).map(v => v * 4) });
    wrongs.push({ label: 'silence', sig: new Float32Array(1.6 * SR) });
    wrongs.push({ label: 'one string off', sig: strum(target.map((m, i) => i === Math.floor(target.length / 2) ? m + 1 : m), 1.6) });
    for (const w of wrongs) {
      const sig = addNoise(mic(room(w.sig)), micName === 'phone' ? 0.004 : 0.002);
      const r = judge(sig, target, mode); fpN++;
      if (r.pass) { fp++; falses.push(`${micName} target ${ch} ← ${w.label}: ok ${r.ok} purity ${r.best.purity.toFixed(2)} notes ${r.best.notes.join(' ')}`); }
    }
  }
}
console.log(`MODE ${mode}: correct chords accepted ${tp}/${tpN} (${(100 * tp / tpN).toFixed(1)}%), wrong sounds accepted ${fp}/${fpN} (${(100 * fp / fpN).toFixed(1)}%)`);
console.log('--- missed correct chords ---'); fails.slice(0, 40).forEach(l => console.log(l));
console.log('--- false accepts ---'); falses.slice(0, 40).forEach(l => console.log(l));
