// Offline accuracy on REAL recorded guitar notes + real speech/music + impulsive noises, through simple mic models.
// usage: node test/realtest.js [mode]
const { Ear } = require('../src/45-ear.js');
const R = require('/home/claude/real/mkreal.js');
const SR = 48000, mode = process.argv[2] || 'normal';
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const gauss = () => rnd() + rnd() + rnd() - 1.5;
function biquad(x, type, f, q = 0.707){
  const w = 2 * Math.PI * f / SR, a = Math.sin(w) / (2 * q), c = Math.cos(w); let b0, b1, b2, a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
  if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; } else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y;
}
const MICS = {
  studio: x => x,
  laptop: x => biquad(biquad(x, 'hp', 180), 'lp', 9000),
  phone: x => biquad(biquad(biquad(x, 'hp', 300), 'hp', 300), 'lp', 7000),
  bluetooth: x => biquad(biquad(biquad(x, 'hp', 250), 'lp', 3600), 'lp', 3600),
};
function room(x){ const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] + 0.25 * (x[i - 1100] || 0) + 0.15 * (x[i - 2300] || 0) + 0.08 * (x[i - 4100] || 0); return y; }
function finish(x, mic, level, noise){
  let y = MICS[mic](room(x)); let mx = 0; for (const v of y) mx = Math.max(mx, Math.abs(v));
  const out = new Float32Array(y.length); for (let i = 0; i < y.length; i++) out[i] = y[i] / (mx || 1) * level + noise * gauss() + 0.001 * Math.sin(2 * Math.PI * 60 * i / SR);
  return out;
}
const pad = (x, secs = 2.2) => { const o = new Float32Array(Math.round(secs * SR) + 4800); o.set(x.subarray(0, Math.min(x.length, o.length - 4800)), 4800); return o; };
// frames after an onset at 0.1 s, like the game: every 1/20 s from 0.46 s to 1.7 s
function judge(sig, target, noiseProfile){
  let ok = 0, frames = 0, bestFit = 0, run = 0, runMax = 0; const times = [];
  for (let t = 0.1 + 0.4; t <= 0.1 + 1.6; t += 0.05) {
    const end = Math.round(t * SR); if (end < Ear.N || end > sig.length) continue;
    const an = Ear.analyze(sig.subarray(0, end), SR, noiseProfile);
    const r = Ear.matchTarget(an, { midis: target }, mode);
    frames++; bestFit = Math.max(bestFit, r.fit);
    if (r.ok) { ok++; times.push(t); run++; runMax = Math.max(runMax, run); } else run = 0;
  }
  // practice rule: 3 ok frames within 1.3 s
  let pass = false; for (let i = 0; i + 2 < times.length; i++) if (times[i + 2] - times[i] <= 1.3) pass = true;
  return { pass, ok, frames, bestFit };
}
function noiseProfileFor(mic, noise){
  const sil = finish(new Float32Array(Ear.N + 100), mic, 0, noise);
  const an = Ear.analyze(sil, SR); return Float32Array.from(an.T);
}
const CH = { G: [43,47,50,55,59,67], C: [48,52,55,60,64], D: [50,57,62,66], Em: [40,47,52,55,59,64], Am: [45,52,57,60,64], E: [40,47,52,56,59,64], A: [45,52,57,61,64], Dm: [50,57,62,65], Em7: [40,47,50,55,59,64], G7: [43,47,50,55,59,65], Cmaj7: [48,52,55,59,64], Bm: [47,54,59,62,66], F: [41,48,53,57,60,65], Asus2: [45,52,57,59,64], D7: [50,57,60,66] };
const CONF = { G: ['Em', 'Em7', 'G7', 'C', 'D'], C: ['Am', 'Cmaj7', 'F', 'Em'], D: ['Bm', 'D7', 'G', 'A'], Em: ['G', 'Em7', 'C', 'E'], Am: ['C', 'F', 'Dm', 'A'], E: ['Em', 'A'], A: ['Asus2', 'D', 'E'], Dm: ['F', 'D', 'Am'] };
const insts = ['guitar-acoustic', 'guitar-nylon'];
function impulses(n, bright){ const x = new Float32Array(2 * SR); for (let k = 0; k < n; k++) { const o = Math.round((0.05 + k * 0.35) * SR); let lp = 0; for (let i = 0; i < 0.04 * SR; i++) { const v = gauss() * Math.exp(-i / (bright ? 150 : 900)); lp = bright ? v : lp * 0.9 + v * 0.1; x[o + i] += lp * 3; } } return x; }
function knock(){ const x = new Float32Array(2 * SR); for (let i = 0; i < 0.3 * SR; i++) { const t = i / SR; x[i + 2400] = Math.exp(-t * 25) * (Math.sin(2 * Math.PI * 105 * t) + 0.6 * Math.sin(2 * Math.PI * 210 * t + 1) + 0.3 * Math.sin(2 * Math.PI * 330 * t) + 0.3 * gauss() * Math.exp(-t * 80)); } return x; }
function muted(){ const x = new Float32Array(2 * SR); for (let s = 0; s < 6; s++) { const o = 2400 + s * 500, f = 80 * Math.pow(1.33, s); for (let i = 0; i < 0.08 * SR; i++) { const t = i / SR; x[o + i] += Math.exp(-t * 60) * (Math.sin(2 * Math.PI * f * t) + gauss() * 0.5); } } return x; }
function whiteNoise(){ const x = new Float32Array(2 * SR); for (let i = 0; i < x.length; i++) x[i] = gauss(); return x; }
const SPEECH = ['x_5703-47212-0', 'x_198-209-0000'], MUSIC = ['x_Kevin_MacLeo', 'x_admiralbob77', 'x_Hungarian_Da', 'x_sorohanro_-_', 'x_147793__setu'];
let tp = 0, tpN = 0, fp = 0, fpN = 0; const misses = [], falses = [];
for (const mic of Object.keys(MICS)) {
  const noise = (mic === 'phone' || mic === 'bluetooth' ? 0.006 : 0.002) * (+process.env.NOISE || 1), prof = process.env.NOPROF ? undefined : noiseProfileFor(mic, noise);
  for (const ch of Object.keys(CONF)) {
    const tgt = CH[ch];
    for (const inst of insts) for (const lvl of [0.5, 0.08]) {
      const r = judge(finish(pad(R.strum(tgt, inst, 2.2)), mic, lvl, noise), tgt, prof); tpN++; if (r.pass) tp++; else misses.push(`${mic} ${inst} ${ch} lvl${lvl}: ok ${r.ok}/${r.frames} fit ${r.bestFit.toFixed(2)}`);
    }
    const W = CONF[ch].map(n => ['chord ' + n, () => R.strum(CH[n], insts[fpN % 2], 2.2)]);
    W.push(['single note', () => R.strum([tgt[2]], 'guitar-acoustic', 2.2)]);
    W.push(['two notes', () => R.strum(tgt.slice(-2), 'guitar-acoustic', 2.2)]);
    W.push(['three low strings', () => R.strum(tgt.slice(0, 3), 'guitar-acoustic', 2.2)]);
    W.push(['open strings', () => R.strum([40, 45, 50, 55, 59, 64], 'guitar-acoustic', 2.2)]);
    W.push(['one string off', () => R.strum(tgt.map((m, i) => i === 1 ? m + 1 : m), 'guitar-acoustic', 2.2)]);
    W.push(['whole step off', () => R.strum(tgt.map(m => m + 2), 'guitar-acoustic', 2.2)]);
    for (const s of SPEECH) W.push(['speech ' + s, () => R.clip(s, rnd() * 3, 2.2)]);
    for (const s of MUSIC) W.push(['music ' + s, () => R.clip(s, 3 + rnd() * 20, 2.2)]);
    W.push(['claps', () => impulses(5, true)]); W.push(['thumps', () => impulses(5, false)]); W.push(['body knock', knock]); W.push(['muted strum', muted]); W.push(['white noise', whiteNoise]);
    W.push(['silence', () => new Float32Array(2 * SR)]);
    for (const [label, f] of W) for (const lvl of [0.5, 0.08]) {
      const r = judge(finish(pad(f()), mic, lvl, noise), tgt, prof); fpN++; if (r.pass) { fp++; falses.push(`${mic} ${ch} ← ${label} lvl${lvl}: ok ${r.ok}/${r.frames} fit ${r.bestFit.toFixed(2)}`); }
    }
  }
}
console.log(`MODE ${mode}: real chords accepted ${tp}/${tpN} (${(100 * tp / tpN).toFixed(1)}%), wrong sounds accepted ${fp}/${fpN} (${(100 * fp / fpN).toFixed(1)}%)`);
console.log('--- missed ---'); misses.slice(0, 30).forEach(l => console.log(l));
console.log('--- false accepts ---'); falses.slice(0, 50).forEach(l => console.log(l));
