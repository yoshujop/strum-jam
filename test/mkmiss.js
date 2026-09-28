const R = require('/home/claude/real/mkreal.js'); const SR = 48000;
const LEN = 18 * SR, out = new Float32Array(LEN);
const add = (x, at, gn) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); const s = Math.round(at * SR); for (let i = 0; i < x.length && s + i < LEN; i++) out[s + i] += x[i] / m * gn; };
add(R.strum([43,47,50,55,59,67], 'guitar-acoustic', 2.8), 1.5, 0.45);
add(R.strum([48,52,55,60,64], 'guitar-acoustic', 2.8), 4.5, 0.45);
for (const t of [7.5, 10.5, 13.5]) add(R.strum([50,57,62], 'guitar-acoustic', 2.8), t, 0.45);   // D chord without the high e (F#4)
let s = 1; for (let i = 0; i < LEN; i++) { s = (s * 16807) % 2147483647; out[i] += 0.002 * (s / 2147483647 - 0.5); }
R.wav(__dirname + '/missing_string.wav', out); console.log('ok');
