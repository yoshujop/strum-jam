// Renders fake-mic WAVs for browser tests from the offline harness synth.
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/eartest.js', 'utf8');
eval(h.slice(0, h.indexOf('// the judgement used by the game')).replace("const { Ear } = require('../src/45-ear.js');", '').replace('const fs = require', 'var fsx = require').replace(/^(const|let) /gm, 'var '));
global.DETUNE = 6;
function wav(name, x){
  let mx = 0; for (const v of x) mx = Math.max(mx, Math.abs(v)); const g = 0.7 / mx;
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * g * 32767))), 44 + i * 2);
  fs.writeFileSync(__dirname + '/' + name, b);
}
function seq(items, mic){
  const total = items.reduce((a, it) => a + it.dur, 0) + 1;
  const out = new Float32Array(Math.round(total * SR)); let t = 0.5;
  for (const it of items) {
    for (const at of it.at || [0]) mix(out, it.sig(), Math.round((t + at) * SR), 1);
    t += it.dur;
  }
  return addNoise(MICS[mic](room(out)), 0.002);
}
const ch = n => () => strum(chordMidis(n), 1.6);
// right: G C D cycle, two strums each
const right = [];
for (let k = 0; k < 3; k++) for (const n of ['G', 'C', 'D']) right.push({ sig: ch(n), dur: 3, at: [0, 1.5] });
wav('right.wav', seq(right, 'laptop'));
// wrong: everything that is NOT a G chord
const G = chordMidis('G');
const wrong = [
  { sig: ch('Em'), dur: 2.5 }, { sig: ch('Am'), dur: 2.5 }, { sig: () => strum(G.map((m, i) => i === 4 ? m + 1 : m), 1.6), dur: 2.5 },
  { sig: () => strum([55], 1.6), dur: 2.5 }, { sig: () => voice(2), dur: 2.5 }, { sig: () => claps(2), dur: 2.5 }, { sig: () => strum([40, 45, 50, 55, 59, 64], 1.6), dur: 2.5 },
  { sig: ch('D'), dur: 2.5 }, { sig: ch('C'), dur: 2.5 }, { sig: () => strum([43, 50, 55], 1.6), dur: 2.5 }, { sig: ch('Em7'), dur: 2.5 }, { sig: () => drums(2.4, 100), dur: 2.5 },
];
wav('wrong.wav', seq(wrong, 'webcam'));
console.log('ok');
// second synth (additive, inharmonic) and extra non-chord sounds, all NOT a G
pluck = pluckAdd;
const right2 = []; for (let k = 0; k < 3; k++) for (const n of ['G', 'C', 'D']) right2.push({ sig: ch(n), dur: 3, at: [0, 1.5] });
wav('right2.wav', seq(right2, 'phone'));
const wrong2 = [
  { sig: () => whistle(2.4, 392), dur: 2.5 }, { sig: () => hum(2.4, 98), dur: 2.5 }, { sig: () => voice(2.4), dur: 2.5 }, { sig: () => fan(2.4), dur: 2.5 },
  { sig: () => tapBody(2.4), dur: 2.5 }, { sig: () => strum([40, 45, 50, 55, 59, 64], 1.6).map(v => v * 4), dur: 2.5 }, { sig: ch('G7'), dur: 2.5 }, { sig: ch('Em7'), dur: 2.5 },
  { sig: () => strum([43, 47, 50], 2.4), dur: 2.5 }, { sig: ch('Bm'), dur: 2.5 }, { sig: () => whistle(2.4, 587), dur: 2.5 }, { sig: ch('Cmaj7'), dur: 2.5 },
];
wav('wrong2.wav', seq(wrong2, 'laptop'));
console.log('ok2');
