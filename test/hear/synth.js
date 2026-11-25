// Synthetic instruments for the recognition audit (no real samples in the repo).
// Additive inharmonic plucked string (primary), extended Karplus-Strong (second timbre), piano, bass, voice, drums.
const SR = 48000;
let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const setSeed = s => { seed = s; };
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

function biquad(x, type, f, q = 0.707, gainDb = 0){
  const w = 2 * Math.PI * f / SR, s = Math.sin(w), c = Math.cos(w), al = s / (2 * q); let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { const A = Math.pow(10, gainDb / 40); b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function mix(dst, src, at, gain = 1){ for (let i = 0; i < src.length && at + i < dst.length; i++) if (at + i >= 0) dst[at + i] += src[i] * gain; }
function peak(x){ let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m; }
function norm(x, p){ const m = peak(x) || 1; const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] / m * p; return y; }

// steel/nylon string, additive: inharmonic partials, pluck-position comb, frequency-dependent decay, pick noise
function pluckAdd(midi, dur, vel, o = {}){
  const cents = (o.cents || 0) + (rnd() - 0.5) * 2 * (o.jitter == null ? 4 : o.jitter);
  const f0 = hz(midi) * Math.pow(2, cents / 1200);
  const nylon = !!o.nylon;
  const B = nylon ? 3e-5 : midi < 50 ? 2.2e-4 : midi < 57 ? 1.2e-4 : midi < 62 ? 6e-5 : 3e-5;
  const n = Math.round(dur * SR), out = new Float32Array(n);
  const pos = 0.11 + rnd() * 0.12;
  const t60base = (nylon ? 2.2 : 4.2) * Math.pow(110 / f0, 0.3) * (o.muted ? 0.035 : 1);
  for (let h = 1; h <= 40; h++) {
    const f = h * f0 * Math.sqrt(1 + B * h * h); if (f > 11000) break;
    let a = Math.abs(Math.sin(Math.PI * h * pos)) / Math.pow(h, nylon ? 1.35 : 1.0) * (0.7 + rnd() * 0.6);
    const t60 = t60base / (1 + (nylon ? 0.22 : 0.1) * (h - 1));
    const k = 6.9 / (t60 * SR), ph = rnd() * 6.283, w = 2 * Math.PI * f / SR;
    // two-stage decay: fast initial drop then sustain
    for (let i = 0; i < n; i++) out[i] += a * (0.55 * Math.exp(-k * i) + 0.45 * Math.exp(-k * 3.5 * i)) * Math.sin(w * i + ph);
  }
  // pick attack: 6 ms noise burst
  const na = Math.round(0.006 * SR); for (let i = 0; i < na && i < n; i++) out[i] += gauss() * 0.5 * (1 - i / na);
  // soft 1 ms fade-in
  for (let i = 0; i < 48 && i < n; i++) out[i] *= i / 48;
  for (let i = 0; i < n; i++) out[i] *= vel;
  return out;
}
// extended Karplus-Strong (like the game's own preview guitar, different timbre family)
function pluckKS(midi, dur, vel, o = {}){
  const cents = (o.cents || 0) + (rnd() - 0.5) * 2 * (o.jitter == null ? 4 : o.jitter);
  const f = hz(midi) * Math.pow(2, cents / 1200), wound = midi < 55;
  const t60 = (wound ? 5.2 : 3.4) * Math.pow(110 / f, 0.35) * (o.muted ? 0.04 : 1);
  const len = Math.round(SR * dur), out = new Float32Array(len);
  const L = SR / f, N = Math.max(2, Math.floor(L - 0.5 - 0.1)), dfrac = L - 0.5 - N, C = (1 - dfrac) / (1 + dfrac);
  const rho = Math.pow(10, -3 / (t60 * f));
  const line = new Float32Array(N), bright = 0.35 + 0.5 * vel - (wound ? 0.12 : 0);
  let lp = 0; for (let i = 0; i < N; i++) { const r = rnd() * 2 - 1; lp = lp + bright * (r - lp); line[i] = lp; }
  const pp = Math.max(1, Math.round(N * 0.13)), ex = new Float32Array(N);
  for (let i = 0; i < N; i++) ex[i] = line[i] - (i >= pp ? line[i - pp] : 0);
  let mean = 0; for (let i = 0; i < N; i++) mean += ex[i]; mean /= N;
  for (let i = 0; i < N; i++) line[i] = (ex[i] - mean) * vel;
  let idx = 0, prev = 0, apx = 0, apy = 0;
  for (let i = 0; i < len; i++) {
    const x = line[idx]; const avg = 0.5 * x + 0.5 * prev; prev = x;
    const y = C * (avg - apy) + apx; apx = avg; apy = y;
    line[idx] = y * rho; out[i] = x * 3; idx = idx + 1 === N ? 0 : idx + 1;
  }
  return out;
}
function body(x){ let y = biquad(x, 'pk', 100, 2.5, 6); y = biquad(y, 'pk', 200, 2.5, 4); y = biquad(y, 'pk', 400, 2, 2); y = biquad(y, 'pk', 3000, 1, -3); return y; }
// strum: o.spread (s across all strings), o.cents (whole guitar off), o.stringCents [..], o.mute [idx], o.drop [idx], o.up (upstroke), o.synth 'add'|'ks', o.nylon
function strum(midis, dur, o = {}){
  const out = new Float32Array(Math.round(dur * SR));
  const spread = o.spread == null ? 0.02 : o.spread, pl = o.synth === 'ks' ? pluckKS : pluckAdd;
  const order = midis.map((m, i) => i); if (o.up) order.reverse();
  const n = midis.length;
  order.forEach((si, k) => {
    if (o.drop && o.drop.includes(si)) return;
    const muted = o.mute && o.mute.includes(si);
    const at = Math.round((n > 1 ? k / (n - 1) : 0) * spread * (0.8 + rnd() * 0.4) * SR);
    const v = (o.vel || 0.25) * (0.75 + rnd() * 0.5) * (muted ? 0.6 : 1);
    mix(out, pl(midis[si], dur, v, { cents: (o.cents || 0) + ((o.stringCents || [])[si] || 0), nylon: o.nylon, muted, jitter: o.jitter }), at, 1);
  });
  return body(out);
}
// fully muted "chk" strum: all strings damped
function chk(dur = 0.4){ return strum([40, 45, 50, 55, 59, 64], dur, { mute: [0, 1, 2, 3, 4, 5], spread: 0.015 }); }
function room(x, wet = 0.25){
  const y = Float32Array.from(x);
  for (const [d, g] of [[0.011, 0.5], [0.019, 0.42], [0.031, 0.36], [0.043, 0.3], [0.061, 0.25], [0.083, 0.2], [0.113, 0.16], [0.151, 0.12], [0.211, 0.08], [0.293, 0.05]]) mix(y, x, Math.round(d * SR), g * wet * 2);
  return y;
}
const MICS = {
  clean: x => x,
  laptop: x => { let y = biquad(x, 'hp', 180, 0.7); y = biquad(y, 'lp', 8000, 0.7); y = biquad(y, 'pk', 2500, 1, 5); return y; },
  phone: x => { let y = biquad(x, 'hp', 300, 0.7); y = biquad(y, 'hp', 300, 0.7); y = biquad(y, 'lp', 7000, 0.7); y = biquad(y, 'pk', 3000, 1.2, 6); return y; },
  bluetooth: x => { let y = biquad(x, 'hp', 250, 0.7); y = biquad(y, 'lp', 3600, 0.7); y = biquad(y, 'lp', 3600, 0.7); return y; },
  clipped: x => x.map(v => Math.tanh(v * 6) / 6),
};
function addNoise(x, level){ const y = Float32Array.from(x); for (let i = 0; i < y.length; i++) y[i] += gauss() * level + level * 0.5 * Math.sin(2 * Math.PI * 60 * i / SR) + level * 0.25 * Math.sin(2 * Math.PI * 180 * i / SR); return y; }
// piano note: stiff strings, hammer thump, long decay
function piano(midi, dur, vel = 0.3){
  const f0 = hz(midi), n = Math.round(dur * SR), out = new Float32Array(n), B = 4e-4 * Math.pow(2, (midi - 60) / 12);
  for (let h = 1; h <= 24; h++) {
    const f = h * f0 * Math.sqrt(1 + B * h * h); if (f > 10000) break;
    const a = Math.pow(h, -1.25) * (0.8 + rnd() * 0.4), t60 = 6 * Math.pow(261 / f0, 0.5) / (1 + 0.15 * (h - 1)), k = 6.9 / (t60 * SR), w = 2 * Math.PI * f / SR, ph = rnd() * 6.28;
    for (let i = 0; i < n; i++) out[i] += a * (0.6 * Math.exp(-k * i) + 0.4 * Math.exp(-k * 5 * i)) * Math.sin(w * i + ph);
  }
  const na = Math.round(0.01 * SR); let lp = 0; for (let i = 0; i < na; i++) { lp = lp * 0.8 + gauss() * 0.2; out[i] += lp * 0.8 * (1 - i / na); }
  for (let i = 0; i < 96; i++) out[i] *= i / 96;
  for (let i = 0; i < n; i++) out[i] *= vel;
  return out;
}
function pianoChord(midis, dur, o = {}){ const out = new Float32Array(Math.round(dur * SR)); midis.forEach(m => mix(out, piano(m, dur, (o.vel || 0.25) * (0.8 + rnd() * 0.4)), Math.round(rnd() * (o.spread == null ? 0.012 : o.spread) * SR))); return out; }
// electric bass note (fingered): strong low partials
function bass(midi, dur, vel = 0.4, o = {}){
  const f0 = hz(midi) * Math.pow(2, (o.cents || 0) / 1200), n = Math.round(dur * SR), out = new Float32Array(n), B = 1.2e-4;
  for (let h = 1; h <= 20; h++) {
    const f = h * f0 * Math.sqrt(1 + B * h * h); if (f > 5000) break;
    const a = Math.pow(h, -1.4) * Math.abs(Math.sin(Math.PI * h * 0.18)) * (0.8 + rnd() * 0.4) * (h === 1 ? 1.4 : 1), t60 = 5 / (1 + 0.25 * (h - 1)), k = 6.9 / (t60 * SR), w = 2 * Math.PI * f / SR, ph = rnd() * 6.28;
    for (let i = 0; i < n; i++) out[i] += a * Math.exp(-k * i) * Math.sin(w * i + ph);
  }
  const na = Math.round(0.008 * SR); let lp = 0; for (let i = 0; i < na; i++) { lp = lp * 0.7 + gauss() * 0.3; out[i] += lp * 0.4 * (1 - i / na); }
  for (let i = 0; i < 96; i++) out[i] *= i / 96;
  // release
  const rel = Math.round(0.03 * SR); for (let i = 0; i < rel; i++) out[n - 1 - i] *= i / rel;
  for (let i = 0; i < n; i++) out[i] *= vel;
  return out;
}
// sung vowel at a given midi pitch (can be fractional), vibrato, formants
function voice(midi, dur, o = {}){
  const n = Math.round(dur * SR), src = new Float32Array(n); let ph = 0;
  const vib = o.vib == null ? 0.25 : o.vib, drift = o.drift || 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, m = midi + vib * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.3) + drift * t + (o.scoop ? -o.scoop * Math.exp(-t / 0.08) : 0);
    const f0 = hz(m); ph += f0 / SR; if (ph >= 1) ph -= 1;
    // glottal-ish pulse: smoothed sawtooth
    src[i] = (ph < 0.6 ? Math.sin(Math.PI * ph / 0.6) : 0) - 0.3 + gauss() * 0.01;
  }
  const F = o.formants || [[700, 5, 16], [1150, 6, 12], [2600, 6, 9]];
  let y = src; for (const [f, q, g] of F) y = biquad(y, 'pk', f, q, g);
  y = biquad(y, 'hp', 90, 0.7); y = biquad(y, 'lp', 5000, 0.7);
  const a = Math.round(0.04 * SR); for (let i = 0; i < a; i++) { y[i] *= i / a; y[n - 1 - i] *= i / a; }
  return norm(y, o.level || 0.25);
}
// speech-like babble: gliding pitch, syllables
function speech(dur){
  const n = Math.round(dur * SR), src = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; const f0 = 130 + 35 * Math.sin(t * 5.1) + 22 * Math.sin(t * 1.7 + 1) + 10 * Math.sin(t * 11); ph += f0 / SR; if (ph >= 1) { ph -= 1; src[i] = 1; } }
  let y = biquad(src, 'pk', 650, 4, 18); y = biquad(y, 'pk', 1300, 4, 14); y = biquad(y, 'pk', 2500, 4, 10); y = biquad(y, 'hp', 100, 0.7);
  for (let i = 0; i < n; i++) { const t = i / SR; y[i] *= Math.pow(Math.max(0, Math.sin(2 * Math.PI * 3.3 * t)), 0.6); }
  return norm(y, 0.25);
}
const drum = {
  kick(){ const n = Math.round(0.35 * SR), o = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const f = 48 + 110 * Math.exp(-i / (0.02 * SR)); ph += 2 * Math.PI * f / SR; o[i] = Math.sin(ph) * Math.exp(-i / (0.09 * SR)) + (i < 300 ? gauss() * 0.3 * (1 - i / 300) : 0); } return o; },
  snare(){ const n = Math.round(0.25 * SR), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = gauss() * 0.7 * Math.exp(-i / (0.045 * SR)) + 0.5 * Math.sin(2 * Math.PI * 185 * i / SR) * Math.exp(-i / (0.03 * SR)) + 0.3 * Math.sin(2 * Math.PI * 330 * i / SR) * Math.exp(-i / (0.02 * SR)); return biquad(o, 'hp', 120, 0.7); },
  hat(){ const n = Math.round(0.08 * SR), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = gauss() * Math.exp(-i / (0.012 * SR)); return biquad(biquad(o, 'hp', 6000, 0.7), 'hp', 6000, 0.7); },
  clap(){ const n = Math.round(0.12 * SR), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = gauss() * Math.exp(-i / (0.008 * SR)); return biquad(o, 'bp', 1500, 1); },
};
function pcm16b64(x){ const b = Buffer.alloc(x.length * 2); for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), i * 2); return b.toString('base64'); }
function wav(path, x){
  const fs = require('fs'), b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(path, b);
}
// standard open voicings (low -> high), cross-checked against the game's voicingFor() in probe.js
const CH = {
  G: [43, 47, 50, 55, 59, 67], C: [48, 52, 55, 60, 64], D: [50, 57, 62, 66], Em: [40, 47, 52, 55, 59, 64], Am: [45, 52, 57, 60, 64], E: [40, 47, 52, 56, 59, 64],
  A: [45, 52, 57, 61, 64], Dm: [50, 57, 62, 65], F: [41, 48, 53, 57, 60, 65], Fmaj7: [53, 57, 60, 64], Dsus4: [50, 57, 62, 67], Dsus2: [50, 57, 62, 64], G7: [43, 47, 50, 55, 59, 65],
  Cmaj7: [48, 52, 55, 59, 64], Em7: [40, 47, 50, 55, 59, 64], D7: [50, 57, 60, 66], A7: [45, 52, 55, 61, 64], Am7: [45, 52, 55, 60, 64], Asus2: [45, 52, 57, 59, 64], Asus4: [45, 52, 57, 62, 64],
  Bm: [47, 54, 59, 62, 66], Cadd9: [48, 52, 55, 62, 64], E7: [40, 47, 50, 56, 59, 64], B7: [47, 51, 57, 59, 66], Fm: [41, 48, 53, 56, 60, 65], Gm: [43, 50, 55, 58, 62, 67],
};
module.exports = { SR, rnd, setSeed, gauss, hz, biquad, mix, peak, norm, pluckAdd, pluckKS, strum, chk, body, room, MICS, addNoise, piano, pianoChord, bass, voice, speech, drum, pcm16b64, wav, CH };
