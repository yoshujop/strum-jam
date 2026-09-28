const R = require('/home/claude/real/mkreal.js'); const SR = 48000;
let seed = 4; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const g = () => rnd() + rnd() + rnd() - 1.5;
const LEN = 16 * SR, out = new Float32Array(LEN);
const add = (x, at, gn) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); const s = Math.round(at * SR); for (let i = 0; i < x.length && s + i < LEN; i++) out[s + i] += x[i] / m * gn; };
add(R.strum([59], 'guitar-acoustic', 2.5), 3.0, 0.4);      // B3: a note of G
add(R.strum([61], 'guitar-acoustic', 2.5), 6.0, 0.4);      // C#4: not in G
const c = new Float32Array(0.2 * SR); for (let i = 0; i < 2000; i++) c[i] = g() * Math.exp(-i / 200); add(c, 9.0, 0.6);
add(R.clip('x_198-209-0000', 0.5, 2.5), 11.0, 0.4);
for (let i = 0; i < LEN; i++) out[i] += 0.002 * g();
R.wav(__dirname + '/single_notes.wav', out); console.log('ok');
