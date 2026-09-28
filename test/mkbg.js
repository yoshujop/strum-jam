const R = require('/home/claude/real/mkreal.js'); const SR = 48000;
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const g = () => rnd() + rnd() + rnd() - 1.5;
const LEN = 40 * SR, out = new Float32Array(LEN);
const G = [48, 52, 55, 60, 64];   // the drone is a C chord (the 2nd chord of the drill)
for (const m of G) { const f = 440 * Math.pow(2, (m - 69) / 12); for (let h = 1; h <= 6; h++) for (let i = 0; i < LEN; i++) out[i] += 0.012 / h * Math.sin(2 * Math.PI * f * h * i / SR); }
let lp = 0; for (let i = 0; i < LEN; i++) { lp = lp * 0.97 + g() * 0.03; out[i] += lp * 0.15; }
const add = (x, at, gn) => { const s = Math.round(at * SR); for (let i = 0; i < x.length && s + i < LEN; i++) out[s + i] += x[i] * gn; };
for (let t = 2; t < 39; t += 1.7) { const k = Math.floor(t) % 3; if (k === 0) { const c = new Float32Array(0.2 * SR); for (let i = 0; i < 2000; i++) c[i] = g() * Math.exp(-i / 200); add(c, t, 0.6); } else if (k === 1) add(R.clip('x_198-209-0000', t % 3, 0.8), t, 1.5); else { const x = new Float32Array(0.4 * SR); for (let i = 0; i < x.length; i++) { const s = i / SR; x[i] = Math.exp(-s * 25) * Math.sin(2 * Math.PI * 105 * s); } add(x, t, 0.5); } }
add(R.strum([43, 47, 50, 55, 59, 67], 'guitar-acoustic', 2.5), 5.0, 0.35);   // the player strums G once, so the game moves on to C
R.wav(__dirname + '/bg_drone_noises.wav', out);
console.log('ok');
