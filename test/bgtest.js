// Background robustness: a steady background (music, TV speech, fan, a droning chord) plays the whole time,
// then at 1.5 s either the player strums the target chord, or some other noise happens (which is also an "onset").
// Uses the same rule as Practice: >=3 frames that fit the chord AND are fresh vs the frame before the onset.
const { Ear } = require('../src/45-ear.js');
const R = require('/home/claude/real/mkreal.js');
const SR = 48000, mode = process.argv[2] || 'normal', USE_FRESH = process.env.NOFRESH ? false : true;
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const g = () => rnd() + rnd() + rnd() - 1.5;
const LEN = 3.4 * SR, ON = 1.5;
const norm = (x, peak) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); const o = new Float32Array(x.length); for (let i = 0; i < x.length; i++) o[i] = x[i] / (m || 1) * peak; return o; };
const place = (x, at) => { const o = new Float32Array(LEN); const s = Math.round(at * SR); for (let i = 0; i < x.length && s + i < LEN; i++) o[s + i] = x[i]; return o; };
const loop = (x) => { const o = new Float32Array(LEN); for (let i = 0; i < LEN; i++) o[i] = x[i % x.length]; return o; };
const organ = (midis) => { const o = new Float32Array(LEN); for (const m of midis) { const f = 440 * Math.pow(2, (m - 69) / 12); for (let h = 1; h <= 6; h++) { const a = 0.5 / h; for (let i = 0; i < LEN; i++) o[i] += a * Math.sin(2 * Math.PI * f * h * i / SR); } } return o; };
const fan = () => { const o = new Float32Array(LEN); let lp = 0; for (let i = 0; i < LEN; i++) { lp = lp * 0.97 + g() * 0.03; o[i] = lp * 3 + 0.3 * Math.sin(2 * Math.PI * 120 * i / SR); } return o; };
const CH = { G: [43, 47, 50, 55, 59, 67], C: [48, 52, 55, 60, 64], D: [50, 57, 62, 66], Em: [40, 47, 52, 55, 59, 64], Am: [45, 52, 57, 60, 64] };
const BGS = {
  none: t => new Float32Array(LEN),
  fan: t => norm(fan(), 0.05),
  music: t => norm(R.clip('x_Kevin_MacLeo', 30, 3.4), 0.25),
  music2: t => norm(R.clip('x_Hungarian_Da', 8, 3.4), 0.25),
  tv_speech: t => norm(R.clip('x_5703-47212-0', 0.5, 3.4), 0.2),
  drone_target: t => norm(organ(CH[t]), 0.12),                // the worst case: the target chord already sounding
  drone_other: t => norm(organ(CH.Am), 0.12),
};
const EVENTS = {
  strum: t => norm(R.strum(CH[t], 'guitar-acoustic', 1.9), 0.5),
  strum_soft: t => norm(R.strum(CH[t], 'guitar-acoustic', 1.9), 0.2),
  clap: t => { const x = new Float32Array(0.3 * SR); for (let i = 0; i < 2000; i++) x[i] = g() * Math.exp(-i / 200); return norm(x, 0.6); },
  knock: t => { const x = new Float32Array(0.4 * SR); for (let i = 0; i < x.length; i++) { const s = i / SR; x[i] = Math.exp(-s * 25) * (Math.sin(2 * Math.PI * 105 * s) + 0.4 * g() * Math.exp(-s * 80)); } return norm(x, 0.6); },
  cough: t => norm(R.clip('x_198-209-0000', 1.2, 0.6), 0.5),
  other_chord: t => norm(R.strum(CH[t === 'Am' ? 'C' : 'Am'], 'guitar-acoustic', 1.9), 0.5),
  nothing: t => new Float32Array(10),
};
const noise = () => { const o = new Float32Array(LEN); for (let i = 0; i < LEN; i++) o[i] = 0.002 * g(); return o; };
function judge(sig, tgt){
  const base = Ear.analyze(sig.subarray(0, Math.round((ON - 0.03) * SR)), SR);
  const times = [];
  for (let ta = ON + 0.36; ta <= ON + 1.6; ta += 0.05) {
    const an = Ear.analyze(sig.subarray(0, Math.round(ta * SR)), SR);
    let r = Ear.matchTarget(an, { midis: tgt }, mode); if (USE_FRESH && !r.ok) { const rd = Ear.matchTarget(Ear.delta(an, base), { midis: tgt }, mode); if (rd.ok) r = rd; } const fr = Ear.fresh(an, base, tgt);
    if (r.ok && (!USE_FRESH || fr.ok)) times.push(ta);
  }
  for (let i = 0; i + 2 < times.length; i++) if (times[i + 2] - times[i] <= 1.3) return true;
  return false;
}
let res = {};
for (const bg of Object.keys(BGS)) for (const ev of Object.keys(EVENTS)) {
  let pass = 0, n = 0;
  for (const t of ['G', 'C', 'D', 'Em', 'Am']) {
    const b = BGS[bg](t), e = place(EVENTS[ev](t), ON), nz = noise(), sig = new Float32Array(LEN);
    for (let i = 0; i < LEN; i++) sig[i] = b[i] + e[i] + nz[i];
    n++; if (judge(sig, CH[t])) pass++;
  }
  (res[bg] = res[bg] || {})[ev] = pass + '/' + n;
}
console.log('fresh check', USE_FRESH ? 'ON' : 'OFF', 'mode', mode);
console.table(res);
