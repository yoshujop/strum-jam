// A synthetic "recording" for the Vocals song-file test: the chart's chords as a soft pad and a lead line on top
// (the chord's root, an octave up, one note per beat), starting at T0 seconds. node test/mkvoxwav.js out.wav '<json {bpm, beats, events:[{beat,len,pcs}]}>' T0
const fs = require('fs');
const [,, out, js, t0s] = process.argv, C = JSON.parse(js), T0 = +t0s, SR = 22050, spb = 60 / C.bpm;
const end = T0 + (C.events.at(-1).beat + C.events.at(-1).len) * spb + 2, N = Math.ceil(end * SR), x = new Float32Array(N);
const tone = (m, t0, t1, amp) => { const f = 440 * 2 ** ((m - 69) / 12); for (let i = Math.floor(t0 * SR); i < Math.min(N, t1 * SR); i++) { const t = i / SR - t0, env = Math.min(1, t * 40) * Math.min(1, (t1 - i / SR) * 30) * Math.exp(-t * 0.8);
  let v = 0; for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t) / h; x[i] += v * amp * env; } };
for (const e of C.events) {
  const a = T0 + e.beat * spb, b = a + e.len * spb;
  e.pcs.forEach(p => tone(48 + p, a, b, 0.06));
  for (let k = 0; k < e.len; k++) tone(72 + e.pcs[0] - (e.pcs[0] > 7 ? 12 : 0) + (k % 2 ? 4 : 0) % 12, a + k * spb, a + (k + 0.9) * spb, 0.18);
}
let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
const b = Buffer.alloc(44 + N * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + N * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) b.writeInt16LE(Math.round(x[i] / pk * 0.9 * 32767), 44 + i * 2);
fs.writeFileSync(out, b);
