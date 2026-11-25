// The arranger is plain data (src/32-arrange.js: no audio, no DOM), so it is checked here in Node, without a browser.
//   node test/arrangetest.js
// Checks, for all 16 styles (+ 'none'), every section kind, hype 0-4 and four metres: bars are well formed and
// deterministic, the leak-safe rules hold (what the band may play with the mic open on speakers), hype adds parts,
// bars vary, styles differ from each other, section changes get fills, the player's instrument drops out, the ending.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const audio = src('30-audio.js');
const pats = audio.slice(audio.indexOf('const P44'), audio.indexOf('/* ---------------- the groove scheduler'));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src('32-arrange.js') + '\n' + pats + '\nthis.Arranger = Arranger; this.buildPattern = buildPattern; this.P44 = P44;', ctx);
const { Arranger, buildPattern, P44 } = ctx;
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; if (!ok) { fails++; console.log('  FAIL  ' + msg); } };
const m12 = n => ((n % 12) + 12) % 12;
const PROG = [[7, 4], [0, 4], [2, 4], [4, 3], [0, 4], [7, 4], [2, 4], [9, 3]];       // G C D Em C G D Am
const chordOf = bar => { const [pc, third] = PROG[((bar % 8) + 8) % 8]; return { root: 28 + m12(pc - 4), pcs: [pc, m12(pc + third), m12(pc + 7)], fifth: 7, third }; };
function q(o){
  const beats = o.beats || 4, sub = o.sub || 4, P = buildPattern({ song: { style: o.style }, beats, sub });
  return Object.assign({ beats, sub, n: beats * sub, P, seed: 11, bar: 0, barIn: 0, secBars: 8, kind: 'verse', nextKind: 'chorus', lastOfSec: false, isLast: false, first: false, level: 2, levelUp: false, upFill: false,
    leak: 'full', noKit: false, noBass: false, noComp: false, chordAt: () => chordOf(o.bar || 0), nextChord: chordOf((o.bar || 0) + 1) }, o);
}
const STYLES = Object.keys(P44).concat(['none']);
const KINDS = ['intro', 'verse', 'chorus', 'bridge', 'solo', 'outro'];
const METRES = [[4, 4], [3, 4], [2, 3], [4, 3]];
const PITCHED = ['bass', 'ep', 'organ', 'pluck', 'pad', 'gtr', 'lead', 'whoa'];
const midis = e => e.midi != null ? [e.midi] : (e.notes || []);

// 1. well formed, in every combination
let bars = 0;
for (const style of STYLES) for (const kind of KINDS) for (let level = 0; level <= 4; level++) for (const [beats, sub] of METRES) for (const leak of ['full', 'safe', 'drums']) for (const barIn of [0, 3, 7]) {
  const Q = q({ style, kind, level, beats, sub, leak, barIn, bar: 8 + barIn, lastOfSec: barIn === 7 });
  let E; try { E = Arranger.bar(Q); } catch (e) { check(false, `${style} ${kind} L${level} ${beats}x${sub} ${leak}: throws ${e.message}`); continue; }
  bars++;
  const bad = E.find(e => !(e.i >= 0 && e.i < Q.n) || !(e.v > 0 && e.v <= 1.3) || typeof e.inst !== 'string' || midis(e).some(m => !(m >= 24 && m <= 108)));
  check(!bad, `${style} ${kind} L${level} ${beats}x${sub} ${leak}: malformed event ${JSON.stringify(bad)}`);
  // 2. the leak rules
  if (leak === 'drums') check(!E.some(e => midis(e).length), `${style} ${kind} L${level}: 'drums' band plays a pitched note`);
  if (leak === 'safe') {
    const ch = chordOf(8 + barIn), other = E.find(e => PITCHED.includes(e.inst) && e.inst !== 'bass' && e.inst !== 'pad');
    check(!other, `${style} ${kind} L${level}: 'safe' band plays ${other && other.inst}`);
    for (const e of E) {
      if (e.inst === 'bass') check([ch.pcs[0], ch.pcs[2]].includes(m12(e.midi)), `${style} ${kind} L${level}: 'safe' bass plays pitch class ${m12(e.midi)}, not the root or fifth`);
      if (e.inst === 'pad') { check(ch.pcs.includes(m12(e.midi)) && e.midi >= 72, `${style} ${kind} L${level}: 'safe' pad plays ${e.midi}`); check(e.o === 'safe', `'safe' pad uses voice ${e.o}`); }
    }
  }
  if (leak === 'full') for (const e of E) if (e.inst === 'bass') check(e.midi >= 28 && e.midi <= 52, `${style}: bass note ${e.midi} out of range`);
}
console.log(`  ${bars} bars well formed (17 styles x 6 section kinds x 5 hype levels x 4 metres x 3 leak modes x 3 positions)`);

// 3. the same question gives the same bar
check(JSON.stringify(Arranger.bar(q({ style: 'funk', level: 3, bar: 5, barIn: 5 }))) === JSON.stringify(Arranger.bar(q({ style: 'funk', level: 3, bar: 5, barIn: 5 }))), 'not deterministic');

// 4. hype adds parts; 5. bars vary; 6. styles differ
const count = (style, level, kind, leak) => { let n = 0; const insts = new Set(); for (let b = 0; b < 8; b++) { const E = Arranger.bar(q({ style, level, kind, leak: leak || 'full', bar: b, barIn: b, lastOfSec: b === 7 })); n += E.length; E.forEach(e => insts.add(e.inst)); } return { n, insts }; };
const rows = [], sigs = new Map();
for (const style of Object.keys(P44)) {
  const c = [0, 1, 2, 3, 4].map(L => count(style, L, 'verse')), ch = count(style, 4, 'chorus');
  rows.push(`  ${style.padEnd(9)} events per 8 verse bars at hype 0-4: ${c.map(x => String(x.n).padStart(4)).join(' ')}   chorus at 4: ${String(ch.n).padStart(4)}   parts at hype 0 -> 4: ${c[0].insts.size} -> ${new Set([...c[4].insts, ...ch.insts]).size}`);
  for (let L = 1; L <= 4; L++) check(c[L].n >= c[L - 1].n, `${style}: hype ${L} plays fewer events than hype ${L - 1} (${c[L].n} < ${c[L - 1].n})`);
  check(c[1].n >= c[0].n * 1.3, `${style}: hype 1 is not clearly busier than hype 0`);
  check(c[4].n >= c[1].n * 1.3, `${style}: hype 4 is not clearly busier than hype 1`);
  check(c[1].insts.size > c[0].insts.size, `${style}: no new instrument at hype 1`);
  check(ch.insts.has('cclap'), `${style}: no crowd claps in a hype-4 chorus`);
  const safe = [0, 1, 2, 3, 4].map(L => count(style, L, 'verse', 'safe'));
  check(safe[1].insts.has('pad') && safe[0].insts.has('bass'), `${style}: the leak-safe band has no bass at hype 0 or no pad at hype 1`);
  check(safe[4].n > safe[1].n, `${style}: the leak-safe band does not grow with hype`);
  const distinct = new Set(); for (let b = 0; b < 8; b++) distinct.add(JSON.stringify(Arranger.bar(q({ style, level: 3, bar: b, barIn: b, chordAt: () => chordOf(0), nextChord: chordOf(0) })).map(e => [e.i, e.inst, e.f || 0])));
  check(distinct.size >= 3, `${style}: only ${distinct.size} different bars in an 8-bar verse on one chord`);
  // a style's fingerprint: which instrument plays on which step in a hype-3 chorus bar
  const sig = JSON.stringify(Arranger.bar(q({ style, level: 3, kind: 'chorus', bar: 1, barIn: 1 })).filter(e => e.inst !== 'crash').map(e => e.i + e.inst + (e.o && e.o.kind || typeof e.o === 'string' && e.o || '')).sort());
  check(!sigs.has(sig), `${style} plays the same chorus bar as ${sigs.get(sig)}`); sigs.set(sig, style);
  const pk = Arranger.pack(style); check(pk && pk.prim && pk.bass, `${style}: no style pack`);
}
console.log(rows.join('\n'));
const combos = new Set(Object.keys(P44).map(s => { const p = Arranger.pack(s); return [p.bass, p.prim[0] + p.prim[1], p.sec ? p.sec[0] + p.sec[1] : '-', (p.pad || ['-'])[0], p.hook[0], p.perc, p.chHat].join('|'); }));
check(combos.size === Object.keys(P44).length, `only ${combos.size} different instrumentations for ${Object.keys(P44).length} styles`);
console.log(`  ${combos.size} different instrumentations (bass, two chord parts, pad, hook, percussion, chorus cymbal) for ${Object.keys(P44).length} styles`);

// 7. section changes: a fill in the last bar of a section, a build with a riser into a chorus, a crash on the next downbeat
for (const style of Object.keys(P44)) {
  const P = buildPattern({ song: { style }, beats: 4, sub: 4 });
  const plain = Arranger.bar(q({ style, level: 2, bar: 2, barIn: 2 })), fill = Arranger.bar(q({ style, level: 2, bar: 7, barIn: 7, lastOfSec: true, nextKind: 'chorus' }));
  const last = E => E.filter(e => e.i >= 8 && ['snare', 'tom'].includes(e.inst)).length;
  check(last(fill) > last(plain) || fill.some(e => e.inst === 'tom'), `${style}: no fill into the chorus`);
  check(fill.some(e => e.inst === 'riser'), `${style}: no riser into the chorus`);
  check(Arranger.bar(q({ style, level: 2, kind: 'chorus', bar: 8, barIn: 0 })).some(e => e.inst === 'crash' && e.i === 0), `${style}: no crash on the chorus downbeat`);
  const end = Arranger.ending(q({ style, level: 3, bar: 16 }));
  check(end.some(e => e.inst === 'crash') && end.some(e => e.inst === 'bass') && end.some(e => PITCHED.includes(e.inst) && e.inst !== 'bass'), `${style}: the ending is missing the crash, the bass or the chord`);
  const lastBar = Arranger.bar(q({ style, level: 3, kind: 'chorus', bar: 15, barIn: 7, isLast: true, nextKind: null }));
  check(lastBar.filter(e => e.i >= 8 && ['snare', 'tom'].includes(e.inst)).length >= 3, `${style}: no fill into the last hit`);
  // 8. the player's own instrument drops out of the band
  check(!Arranger.bar(q({ style, level: 4, noKit: true })).some(e => ['kick', 'snare', 'hat', 'ohat', 'ride', 'crash', 'tom'].includes(e.inst)), `${style}: noKit still plays drums`);
  check(!Arranger.bar(q({ style, level: 4, noBass: true })).some(e => e.inst === 'bass'), `${style}: noBass still plays bass`);
  check(!Arranger.bar(q({ style, level: 4, noComp: true })).some(e => ['ep', 'organ', 'gtr', 'pad', 'pluck'].includes(e.inst)), `${style}: noComp still plays chords`);
  // an intro starts thin, a bridge opens with a drop
  const intro = Arranger.bar(q({ style, level: 2, kind: 'intro', bar: 0, barIn: 0, secBars: 4, first: true })), verse = Arranger.bar(q({ style, level: 2, bar: 4, barIn: 0 }));
  check(intro.length < verse.length, `${style}: the intro is as busy as the verse`);
  const drop = Arranger.bar(q({ style, level: 3, kind: 'bridge', bar: 16, barIn: 0, secBars: 4 })), br = Arranger.bar(q({ style, level: 3, kind: 'bridge', bar: 17, barIn: 1, secBars: 4 }));
  check(drop.filter(e => e.inst === 'snare' || e.inst === 'kick').length < br.filter(e => e.inst === 'snare' || e.inst === 'kick' || e.inst === 'rim').length + 1 && drop.length < br.length, `${style}: the bridge does not open with a drop`);
}
// 9. voicings: common tones stay where they are from chord to chord
const g = Arranger.keysV(chordOf(0), 57), c = Arranger.keysV(chordOf(1), 57);
check(g.filter(m => c.includes(m)).length >= 1 && Math.max(...g.concat(c)) - Math.min(...g.concat(c)) <= 12, 'keys voicings do not share a tone / leave the octave window');
check(Arranger.gtrV(chordOf(0)).length >= 5 && Arranger.gtrV(chordOf(0))[0] === 43, 'guitar voicing of G is not a 6th-string barre shape');
check(['intro', 'verse', 'chorus', 'bridge', 'solo', 'outro'].join() === ['Intro', 'Verse 2', 'Chorus', 'Bridge', 'Guitar solo', 'Outro'].map((n, i) => Arranger.kindOf(n, i)).join(), 'section names are not recognised');

console.log(fails ? `\n${fails} of ${checks} checks failed` : `\nall ${checks} checks passed`);
process.exit(fails ? 1 : 0);
