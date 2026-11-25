/* =====================================================================
   The arranger: what every band member plays in one bar. Pure data in, pure data out (no audio, no DOM, no
   globals besides Math), so it ports as it is. Groove (30-audio.js) calls it once per bar and plays the events.

   Arranger.bar(q) -> [{ i, inst, v, f?, dt?, kind?, midi?, notes?, len?, o? }]
     i     step in the bar (0 .. q.n-1)          f    fraction of a step later (rolls)     dt   seconds off the grid (feel)
     inst  kick snare rim brush clap tamb shaker cowbell hat ohat ride crash tom | bass | ep organ pad gtr lead |
           cclap whoa riser
     kind  for drum hits the drummer should be seen playing: kick | snare | hat | tom | crash
     len   length in steps                       o    voice options (bass kind, guitar options, lead kind, tom pitch)
   q = { style, beats, sub, n (= beats*sub), P (lanes from buildPattern: k, s, h, sv, hv, none), seed, bar,
         barIn, secBars, kind (intro|verse|chorus|bridge|solo|outro), nextKind, lastOfSec, isLast, first,
         level (0-4), levelUp, upFill, leak ('full'|'safe'|'drums'), noKit, noBass, noComp,
         chordAt(step) -> { root (bass note, midi 28-39), pcs [pitch classes, chord root first], fifth, third } | null,
         nextChord }
   The same q always gives the same bar (the variation is hashed from seed, bar and step), so the drummer's
   look-ahead (Groove.plan) and the audio agree.

   Hype levels (bar-quantised by Groove):  0 drums + bass   1 + the style's main chord instrument   2 + a second part,
   percussion, busier bass   3 + hook, ghost notes, open hats, bass approach notes   4 + crowd claps, sung 'whoa' in the
   chorus, pad, hook everywhere.
   Sections: intro (thin drums, chords first, bass joins half way), verse, chorus (ride / open hats / crash-ride, the
   chorus rhythm, crash), bridge (a one-bar drop, ride + rim, pad), fills into every section change (a snare build with a
   riser into a chorus), a small fill every fourth bar, a full-bar fill into the last hit.
   Leak 'safe' (mic open on speakers): unpitched drums, bass on root / fifth / octave only, one soft slow pad on the
   chord's third and fifth (C5 and up), no hook, no 'whoa'.  Leak 'drums': drums only.
   ===================================================================== */
const Arranger = (() => {
  const m12 = n => ((n % 12) + 12) % 12;
  const hsh = a => { a |= 0; a = Math.imul(a ^ (a >>> 16), 0x45d9f3b); a = Math.imul(a ^ (a >>> 16), 0x45d9f3b); a ^= a >>> 16; return (a >>> 0) / 4294967296; };
  // bass lines, 16 steps: [step, interval, length]; interval: semitones above the root, 'f' fifth, 't' third, 'c' sixth/seventh colour, 'a' approach to the next root
  const E8 = (a, b) => [0, 2, 4, 6, 8, 10, 12, 14].map((s, j) => [s, j % 2 ? b : a, 2]);
  const BASS = {
    rock:     [E8(0, 0), [[0, 0, 2], [2, 0, 2], [4, 0, 2], [6, 12, 2], [8, 0, 2], [10, 0, 2], [12, 0, 2], [14, 'f', 2]]],
    pop:      [[[0, 0, 3], [6, 0, 2], [8, 0, 3], [14, 'f', 2]], [[0, 0, 3], [3, 0, 1], [6, 12, 2], [8, 0, 2], [10, 'f', 2], [12, 0, 2], [14, 'f', 2]]],
    ballad:   [[[0, 0, 8], [8, 0, 6], [14, 'f', 2]], [[0, 0, 6], [6, 'f', 2], [8, 12, 4], [12, 'f', 4]]],
    halftime: [[[0, 0, 6], [6, 0, 2], [10, 0, 6]], [[0, 0, 5], [6, 0, 2], [8, 12, 2], [10, 0, 3], [14, 'f', 2]]],
    funk:     [[[0, 0, 2], [3, 0, 1], [6, 0, 2], [8, 0, 2], [11, 'f', 1], [14, 0, 2]], [[0, 0, 2], [3, 12, 1], [6, 0, 1], [7, 'f', 1], [8, 0, 2], [10, 12, 1], [11, 'c', 1], [14, 0, 1], [15, 'a', 1]]],
    disco:    [E8(0, 12), [[0, 0, 2], [2, 12, 2], [4, 0, 2], [6, 12, 2], [8, 0, 2], [10, 12, 2], [12, 'f', 2], [14, 12, 1], [15, 'a', 1]]],
    shuffle:  [[[0, 0, 4], [4, 't', 4], [8, 'f', 4], [12, 'c', 4]], [[0, 0, 3], [3, 0, 1], [4, 't', 3], [7, 't', 1], [8, 'f', 3], [11, 'f', 1], [12, 'c', 3], [15, 'f', 1]]],
    country:  [[[0, 0, 4], [8, 'f', 4]], [[0, 0, 4], [8, 'f', 4], [12, 'f', 2], [14, 'a', 2]]],
    reggae:   [[[0, 0, 3], [4, 'f', 2], [6, 0, 2], [10, 0, 2]], [[0, 0, 3], [3, 0, 1], [4, 'f', 2], [6, 0, 2], [10, 12, 2], [12, 'f', 2]]],
    punk:     [E8(0, 0), E8(0, 0)],
    hiphop:   [[[0, 0, 6], [7, 0, 1], [10, 0, 5]], [[0, 0, 3], [3, 0, 3], [7, 12, 1], [10, 0, 3], [14, 'f', 2]]],
    metal:    [E8(0, 0), Array.from({ length: 16 }, (_, s) => [s, 0, 1])],
    folk:     [[[0, 0, 4], [8, 'f', 4]], [[0, 0, 4], [6, 0, 2], [8, 'f', 4], [14, 'a', 2]]],
    bossa:    [[[0, 0, 6], [6, 'f', 2], [8, 'f', 6], [14, 0, 2]], [[0, 0, 6], [6, 'f', 2], [8, 'f', 6], [14, 0, 2]]],
    edm:      [[[2, 0, 2], [6, 0, 2], [10, 0, 2], [14, 0, 2]], [[2, 0, 1], [3, 12, 1], [6, 0, 1], [7, 12, 1], [10, 0, 1], [11, 12, 1], [14, 0, 1], [15, 12, 1]]],
    waltz:    [[[0, 0, 4], [8, 'f', 4]], [[0, 0, 4], [8, 'f', 4], [14, 'a', 2]]],
    none:     [[[0, 0, 8], [8, 0, 8]], [[0, 0, 8], [8, 'f', 8]]],
  };
  /* Style packs. prim / sec = [instrument, guitar kind, verse rhythm, chorus rhythm] over 16 steps.
     Guitar: p palm-muted power chord, P open power chord, c down-strum, u up-strum, t short chord, k dead strum,
             b alternating bass string, digits = one string of the chord.   Keys: h held chord, s stab, digits = arpeggio. */
  const PACK = {
    rock:     { kit: {}, bass: 'pick', chHat: 'ride', perc: 'tamb', ghost: 1, prim: ['gtr', 'D', 'p.p.p.p.p.p.p.p.', 'P.....P.P...P.P.'], sec: ['organ', '', 'h...............', 'h.......h.......'], hook: ['brass', 'stab'] },
    pop:      { kit: { k: 1.05, kd: 0.8, s: 1.1, sd: 0.8 }, bass: 'finger', chHat: 'open', perc: 'tamb', ghost: 1, prim: ['ep', '', 'h..h..h...h.h...', 'h..h..h.h..h..h.'], sec: ['gtr', 'E', '..k...u...k...u.', 'c.k.u.k.c.k.u.k.'], pad: ['pad', 3], hook: ['bell', 'line'] },
    ballad:   { kit: { k: 0.9, kd: 1.1, s: 0.9, sd: 1.3 }, bass: 'finger', chHat: 'ride', perc: 'shaker', prim: ['ep', '', '0.1.2.3.2.1.2.1.', '0.1.2.3.2.3.2.1.'], sec: ['gtr', 'A', 'c...............', 'c.......c.....u.'], pad: ['strings', 2], hook: ['bell', 'line'] },
    halftime: { kit: { k: 0.85, kd: 1.3, s: 0.85, sd: 1.5 }, bass: 'synth', chHat: 'open', perc: 'shaker', ghost: 1, prim: ['ep', '', 'h.....h....h....', 'h.....h...h.h...'], sec: ['gtr', 'D', 'P...............', 'P.........P.....'], pad: ['pad', 2], hook: ['pluck', 'line'] },
    funk:     { kit: { k: 1.15, kd: 0.6, s: 1.25, sd: 0.6 }, bass: 'finger', chHat: 'open', perc: 'cowbell', ghost: 1, prim: ['gtr', 'E', 't.kt.kt.k.tk.tk.', 'tkkt.ktkkttk.tkk'], sec: ['ep', '', '...s......s.....', '...s..s...s..s..'], hook: ['brass', 'stab'] },
    disco:    { kit: { k: 1.1, kd: 0.7, s: 1.1, sd: 0.8 }, bass: 'synth', chHat: 'open', perc: 'tamb', prim: ['gtr', 'E', '..tk..tk..tk..tk', '..tk..tk..tk..tk'], sec: ['ep', '', 'h.......h.......', 'h..h..h.h..h..h.'], pad: ['strings', 2], hook: ['brass', 'stab'] },
    shuffle:  { kit: { k: 0.95, kd: 0.9, s: 1.05, sd: 0.9 }, bass: 'finger', chHat: 'ride', perc: 'tamb', ghost: 1, prim: ['organ', '', '....s..s....s..s', 'h...s..sh...s..s'], sec: ['gtr', 'D', 'p..pp..pp..pp..p', 'p..pp..pp..pp..p'], hook: ['brass', 'stab'] },
    country:  { kit: { kd: 0.7, s: 1.1, sd: 0.7 }, bass: 'upright', chHat: 'same', perc: 'tamb', prim: ['gtr', 'A', '....t.u.....t.u.', 'c...t.u.c...t.u.'], sec: ['gtr', 'E', '..2...3...2...4.', '..2.3.4...2.3.4.'], hook: ['pluck', 'line'] },
    reggae:   { kit: { k: 0.9, kd: 0.9, s: 1.4, sd: 0.5 }, bass: 'finger', chHat: 'same', perc: 'shaker', prim: ['gtr', 'E', '..t...t...t...t.', '..t...t...t...t.'], sec: ['organ', '', '...s...s...s...s', 'h..s...sh..s...s'], hook: ['brass', 'stab'] },
    punk:     { kit: { k: 1.1, kd: 0.7, s: 1.15, sd: 0.8 }, bass: 'pick', chHat: 'crash', perc: 'tamb', prim: ['gtr', 'D', 'P.P.P.P.P.P.P.P.', 'P.P.P.P.P.P.P.P.'], sec: null, hook: ['saw', 'line'] },
    hiphop:   { kit: { k: 0.75, kd: 1.6, sd: 0.9 }, bass: 'sub', chHat: 'same', perc: 'shaker', ghost: 1, rolls: 1, prim: ['ep', '', 'h.........h.....', 'h.....h...h.....'], sec: null, pad: ['pad', 2], hook: ['bell', 'line'] },
    metal:    { kit: { k: 1.2, kd: 0.5, s: 1.1, sd: 0.9, click: 2 }, bass: 'pick', chHat: 'crash', perc: null, prim: ['gtr', 'D', 'pppppppppppppppp', 'P..P..P.P..P..P.'], sec: null, pad: ['strings', 4], hook: ['saw', 'line'] },
    folk:     { kit: { k: 0.95, kd: 0.7, sd: 0.7 }, bass: 'upright', chHat: 'same', perc: 'shaker', prim: ['gtr', 'A', 'b.2.b.3.b.2.b.4.', 'c...c.u...u.c.u.'], sec: ['organ', '', 'h...............', 'h...............'], hook: ['whistle', 'line'] },
    bossa:    { kit: { kd: 0.5, s: 1.3, sd: 0.5 }, bass: 'upright', chHat: 'ride', perc: 'shaker', prim: ['gtr', 'A', 't..t..t...t..t..', 't..t..t...t..t..'], sec: ['ep', '', 'h.......h.......', 'h.......h.......'], hook: ['mallet', 'line'] },
    edm:      { kit: { k: 0.9, kd: 1.1, s: 1.05, click: 1.5 }, bass: 'synth', chHat: 'open', perc: 'clap', pump: 0.75, prim: ['pluck', '', '..s..s..s..s..s.', 's.ss.s.ss.ss.s.s'], sec: null, pad: ['saw', 1], hook: ['saw', 'line'] },
    waltz:    { kit: { kd: 0.8, sd: 0.8 }, bass: 'upright', chHat: 'ride', perc: 'tamb', prim: ['ep', '', 'h...s...s...s...', 'h...s...s...s...'], sec: ['gtr', 'A', '....t.......t...', '....t...t...t...'], pad: ['strings', 3], hook: ['bell', 'line'] },
    none:     { kit: {}, bass: 'upright', chHat: 'same', perc: null, prim: ['gtr', 'A', '0.1.2.3.2.1.2.1.', '0.1.2.3.2.1.2.1.'], sec: ['ep', '', 'h...............', 'h...............'], hook: ['whistle', 'line'] },
  };
  const FILL = {
    4: { 2: ['ss', 'sS', 'gs'], 4: ['ssss', 'sshh', 'hmll', 's.ss', 'ggsS', 'k.ss', 'hhll', 's.sl'],
         8: ['s.s.ssss', 'sshhmmll', 's..sssll', 'hhmmllff', 'S.k.sshl', 'ssk.hmll', 's.sshhll'],
         16: ['S.k.S.k.sshhmmll', 's.s.sshhmmmmllff', 'S..sS..shhmmllff'], build8: 's.s.ssss', build16: 's...s...s.s.ssss' },
    3: { 1: ['s'], 3: ['sss', 'hml', 's.s', 'gsS'], 6: ['s.ssss', 'ssshml', 'hhmmll', 's.shml'], 12: ['s.ss.shhmmll', 's..s.sssshml'], build6: 's.ssss', build12: 's..s..s.ssss' },
  };
  const TOM = { h: 215, m: 162, l: 118, f: 90 };
  const STAB = ['s..s..s.........', '......s.s..s....'];
  const MOTIF = [                      // two-bar hooks: [step, length, rung of the chord's ladder]
    [[[0, 3, 2], [3, 3, 1], [6, 2, 0], [10, 2, 1], [12, 4, 2]], [[0, 2, 3], [2, 2, 2], [4, 4, 1], [10, 2, 0], [12, 2, 1], [14, 2, 2]]],
    [[[2, 2, 0], [4, 2, 1], [6, 4, 2], [12, 2, 3], [14, 2, 2]], [[0, 6, 1], [6, 2, 2], [8, 6, 3]]],
    [[[0, 2, 2], [2, 2, 2], [4, 2, 3], [6, 2, 2], [8, 4, 1], [12, 4, 0]], [[0, 4, 1], [4, 2, 2], [6, 2, 3], [8, 8, 4]]],
  ];
  const pack = style => PACK[style] || PACK.rock;
  // a section's role, from its name; unknown names alternate verse / chorus so there is still an arc
  function kindOf(name, idx){
    const s = String(name || '').toLowerCase();
    if (/intro/.test(s)) return 'intro';
    if (/outro|ending|coda/.test(s)) return 'outro';
    if (/chorus|refrain|hook/.test(s) && !/pre/.test(s)) return 'chorus';
    if (/bridge|middle|break/.test(s)) return 'bridge';
    if (/solo|instrumental|interlude/.test(s)) return 'solo';
    if (/verse|pre/.test(s)) return 'verse';
    return idx % 2 ? 'chorus' : 'verse';
  }
  /* ---- voicings ---- */
  const inWin = (pc, lo) => lo + m12(pc - lo);
  // close voicing with every note in one octave window: common tones stay put from chord to chord (voice leading for free)
  function keysV(ch, lo){
    let pcs = ch.pcs.slice(0, 5); if (pcs.length >= 4) pcs = pcs.slice(1);          // the bass has the root
    return pcs.slice(0, 4).map(pc => inWin(pc, lo)).sort((a, b) => a - b);
  }
  // the leak-safe pad: the chord's third and fifth above every note an open-position shape frets (the bass has the root).
  // A close triad lower down is harmonics 4:5:6 of the root two octaves below, and the note model then hears that root
  // (measured: a false light on the root's strings); two high notes do not.
  const safeV = ch => ch.pcs.slice(1, 3).map(pc => inWin(pc, 72));
  const padV = (ch, lo) => ch.pcs.slice(0, 4).map(pc => inWin(pc, lo)).sort((a, b) => a - b);
  // barre-chord shapes: root on the 6th or 5th string, then 5th, octave (or 7th), 3rd, 5th, octave
  function gtrV(ch){
    const cr = ch.pcs[0], r = 40 + m12(cr - 4), has = iv => ch.pcs.includes(m12(cr + iv));
    const t3 = has(4) ? 4 : has(3) ? 3 : has(5) ? 5 : has(2) ? 2 : null, f5 = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7, s7 = has(10) ? 10 : has(11) ? 11 : has(9) ? 9 : 12;
    const v = [r, r + f5, r + s7]; if (t3 != null) v.push(r + 12 + t3); v.push(r + 12 + f5); if (r <= 45) v.push(r + 24);
    return v;
  }
  function powerV(ch){ const cr = ch.pcs[0], r = 40 + m12(cr - 4), f5 = ch.pcs.includes(m12(cr + 6)) && !ch.pcs.includes(m12(cr + 7)) ? 6 : 7; return [r, r + f5, r + 12]; }
  function ladder(ch, lo){ const tri = ch.pcs.slice(0, 3).map(pc => inWin(pc, lo)).sort((a, b) => a - b); return tri.concat(tri.map(m => m + 12)); }
  const same = (a, b) => (!a && !b) || (a && b && a.root === b.root && a.pcs.join() === b.pcs.join());
  // a 16-step rhythm for other bar lengths
  function adapt(str, q, isGtr){
    const { n, sub, beats } = q; if (n === 16) return str;
    const a = new Array(n).fill('.');
    if (/\d/.test(str)) { const cyc = [0, 1, 2, 3, 2, 1], st = sub === 3 ? 1 : 2; for (let i = 0, j = 0; i < n; i += st, j++) a[i] = String(cyc[j % 6]); }
    else if (/p/.test(str)) { for (let i = 0; i < n; i += sub === 3 ? 1 : 2) a[i] = 'p'; }
    else for (let b = 0; b < beats; b++) {
      const i = b * sub;
      if (beats === 3) a[i] = b === 0 ? (isGtr ? '.' : 'h') : (isGtr ? 't' : 's');
      else { a[i] = b % 2 === 0 ? (isGtr ? 'c' : 'h') : (isGtr ? 't' : 's'); if (sub === 3 && b % 2 === 1) a[i + 2] = isGtr ? 'u' : 's'; }
    }
    return a.join('');
  }
  function bassPat(q, L){
    const { n, sub, beats } = q;
    if (n === 16) return L === 0 ? [[0, 0, 7], [8, 0, 7]] : (BASS[q.style] || BASS.rock)[L >= 2 ? 1 : 0];
    const mid = (beats === 3 ? 2 : Math.ceil(beats / 2)) * sub, out = [[0, 0, Math.min(n, mid) - 0.4]];
    if (mid < n && (L >= 1 || beats !== 3)) out.push([mid, L >= 1 ? 'f' : 0, n - mid - 0.4]);
    if (L >= 2 && sub === 3) out.push([n - 1, 0, 1]);
    return out;
  }

  function bar(q){
    const E = [], { n, sub, beats, P, style, kind } = q, L = q.level | 0, pk = pack(style), leak = q.leak || 'full', seed = q.seed | 0;
    const rd = (i, salt) => hsh(seed + Math.imul(q.bar + 1, 7919) + Math.imul(i + 1, 104729) + Math.imul(salt, 1299721));
    const jit = (v, i, salt, a = 0.08) => v * (1 - a + rd(i, salt) * 2 * a);
    const push = (i, inst, v, x) => { E.push(Object.assign({ i, inst, v }, x)); };
    const chorusy = kind === 'chorus' || kind === 'solo' || kind === 'outro';
    const introThin = kind === 'intro' && q.secBars >= 2 && q.barIn < Math.ceil(q.secBars / 2);
    const drop = kind === 'bridge' && q.barIn === 0 && q.secBars >= 4 && !q.first;
    const kitOn = !q.noKit && !P.none;
    // chord spans in this bar
    const spans = []; { let cur = q.chordAt(0), i0 = 0; for (let i = 1; i <= n; i++) { const c = i < n ? q.chordAt(i) : undefined; if (i === n || !same(c, cur)) { spans.push({ i0, i1: i, ch: cur }); cur = c; i0 = i; } } }
    const spanOf = i => spans.find(s => i >= s.i0 && i < s.i1);

    /* ---------- which fill ---------- */
    let F = 0, fstr = '', build = false;
    if (kitOn) {
      const lib = FILL[sub === 3 ? 3 : 4], toChorus = q.lastOfSec && q.nextKind === 'chorus' && kind !== 'chorus';
      let fb = 0;
      if (q.isLast) fb = beats >= 4 ? 4 : beats >= 3 ? 2 : 1;
      else if (q.lastOfSec) { if (toChorus && L >= 1) { build = true; fb = beats >= 4 && L >= 2 ? 4 : Math.min(2, beats - 1); } else fb = L >= 2 ? Math.min(2, beats - 1) : 1; }
      else if (q.upFill) fb = 1;
      else if (q.barIn % 4 === 3 && L >= 1 && !introThin && rd(0, 9) < 0.75) fb = L >= 2 ? 1 : 0.5;
      F = Math.max(fb ? 1 : 0, Math.round(fb * sub)); if (sub !== 3 && sub !== 4) F = fb ? sub : 0;
      if (F) {
        const opts = build ? [lib['build' + F]] : lib[F];
        fstr = opts && opts[0] ? opts[Math.floor(rd(1, 10) * opts.length)] : 's'.repeat(F);
        if (L === 0) fstr = fstr.replace(/[hmlf]/g, 's');
      }
    }

    /* ---------- drums ---------- */
    if (kitOn) {
      const hasOnHat = P.h.some((v, i) => v && i % sub === 0);
      let mode = chorusy ? pk.chHat : kind === 'bridge' ? (pk.chHat === 'ride' ? 'same' : 'ride') : 'same';
      if (L === 0 || P.hv === 'ride') mode = P.hv === 'ride' && chorusy && L > 0 ? pk.chHat : 'same';
      const snv = kind === 'bridge' && L < 3 && P.sv === 'snare' ? 'rim' : P.sv;
      const lay = style === 'ballad' || style === 'hiphop' || style === 'halftime' || style === 'reggae' ? 0.008 : 0.003;
      for (let i = 0; i < n - F; i++) {
        const on = i % sub === 0, off8 = (i % sub) * 2 === sub, beat = (i / sub) | 0;
        let kv = P.k[i], sv = P.s[i], hv = P.h[i];
        if (drop) { sv = 0; if (i) kv = 0; }
        if (introThin) { sv = 0; if (!on) kv = 0; }
        if (L === 0) { if (!on) { kv = 0; sv = 0; if (hasOnHat) hv = 0; } else { kv *= 0.9; sv *= 0.85; } }
        else if (!drop && !introThin && sub === 4 && !kv && !sv) {
          if (q.barIn % 2 === 1 && i === n - 2 && rd(i, 1) < 0.55) kv = 0.6;                         // pickup into the next bar
          else if (L >= 2 && q.barIn % 4 === 2 && i === n - 5 && rd(i, 3) < 0.5) kv = 0.55;
        }
        if (kv > 0) push(i, 'kick', jit(kv * (i === 0 ? 1 : 0.92), i, 20, 0.05), { kind: 'kick' });
        if (sv > 0) push(i, snv, jit(sv * (chorusy ? 1 : 0.9), i, 21), { kind: 'snare', dt: lay });
        else if (L >= 2 && pk.ghost && sub === 4 && i % 2 === 1 && !kv && !drop && !introThin && rd(i, 2) < 0.09 * L) push(i, 'snare', 0.22 + rd(i, 4) * 0.08, { dt: lay });   // ghost note
        if (hv) {
          const a = Math.abs(hv) * (on ? 1 : off8 ? 0.74 : 0.55), dt = (rd(i, 5) - 0.5) * 0.006;
          if (mode === 'crash') { if (on) push(i, 'crash', jit(0.36, i, 22), { kind: 'hat' }); else if (off8) push(i, 'hat', jit(a, i, 22), { dt }); }
          else if (mode === 'ride' || P.hv === 'ride') push(i, 'ride', jit(a * 1.05, i, 22), { kind: 'hat', dt });
          else if (hv < 0 || (mode === 'open' && off8 && beat % 2 === 1)) push(i, 'ohat', jit(a, i, 22), { kind: 'hat', dt });
          else push(i, 'hat', jit(a * (mode === 'open' ? 1.12 : 1), i, 22), { kind: 'hat', dt });
        } else if (L >= 3 && sub === 4 && i % 2 === 1 && mode === 'same' && P.hv !== 'ride' && P.h[i - 1] > 0 && !drop) push(i, 'hat', 0.24 + rd(i, 6) * 0.06, { dt: (rd(i, 5) - 0.5) * 0.008 });
        if (L >= 3 && i === n - Math.max(1, sub >> 1) && q.barIn % 2 === 1 && !hv && mode === 'same' && P.hv !== 'ride' && !introThin && !drop) push(i, 'ohat', 0.5, { kind: 'hat' });
        if (pk.rolls && L >= 3 && sub === 4 && beat === beats - 1 && q.barIn % 2 === 1 && hv) push(i, 'hat', 0.3, { f: 0.5 });                    // trap-style hat roll
        // percussion layer
        if (L >= 2 && pk.perc && !drop && !introThin) {
          if (pk.perc === 'tamb') { if (off8 || (L >= 4 && on) || (sub === 3 && on && beat % 2 === 1)) push(i, 'tamb', jit(off8 ? 0.42 : 0.3, i, 23)); }
          else if (pk.perc === 'shaker') { if (i % (sub === 3 ? 1 : L >= 4 ? 1 : 2) === 0) push(i, 'shaker', jit(off8 ? 0.5 : on ? 0.34 : 0.24, i, 23), { dt: (rd(i, 7) - 0.5) * 0.008 }); }
          else if (pk.perc === 'cowbell') { if (L >= 3 && on) push(i, 'cowbell', jit(0.4, i, 23)); else if (L === 2 && on && beat % 2 === 1) push(i, 'tamb', 0.35); }
          else if (pk.perc === 'clap') { if (P.s[i] >= 0.5) push(i, 'clap', 0.6); }
        }
      }
      for (let j = 0; j < F; j++) {
        const i = n - F + j, ch = fstr[j] || '.', cres = 0.62 + 0.38 * (F > 1 ? j / (F - 1) : 1);
        if (j % sub === 0 && ch !== 'k' && L >= 1) push(i, 'kick', 0.7, { kind: 'kick' });
        if (ch === 's') push(i, 'snare', jit(0.85 * cres, i, 24), { kind: 'snare' });
        else if (ch === 'S') push(i, 'snare', 1, { kind: 'snare' });
        else if (ch === 'g') push(i, 'snare', 0.3, {});
        else if (ch === 'k') push(i, 'kick', 0.85, { kind: 'kick' });
        else if (TOM[ch]) push(i, 'tom', jit(0.9 * cres, i, 24), { kind: 'tom', o: TOM[ch] * (pk.kit.k || 1) });
      }
      const cr = q.barIn === 0 && !q.first ? 0.9 : q.levelUp ? 0.75 : (L === 4 || (chorusy && L >= 2)) && q.barIn % 4 === 0 && !q.first ? 0.5 : 0;
      if (cr) { push(0, 'crash', cr, { kind: 'crash' }); if (!(P.k[0] > 0) || drop) push(0, 'kick', 0.9, { kind: 'kick' }); }
    }
    if (build) push(Math.max(0, n - Math.max(F, 2 * sub)), 'riser', 1, { len: Math.min(n, Math.max(F, 2 * sub)) });

    /* ---------- bass ---------- */
    if (!q.noBass && leak !== 'drums' && !introThin) {
      let pat = drop ? [[0, 0, n - 0.5]] : bassPat(q, L);
      const at = new Map(pat.map(p => [p[0], p]));
      for (const s of spans) if (s.ch && !at.has(s.i0)) at.set(s.i0, [s.i0, 0, 2]);
      const list = Array.from(at.values()).sort((a, b) => a[0] - b[0]);
      list.forEach(([i, iv, len], j) => {
        const ch = q.chordAt(i); if (!ch) return;
        const sp = spanOf(i), nextAt = list[j + 1] ? list[j + 1][0] : n;
        len = Math.max(0.5, Math.min(len, sp.i1 - i, nextAt - i));
        const has = x => ch.pcs.includes(m12(ch.root + x));
        let m = ch.root;
        if (iv === 'f') m += ch.fifth || 7;
        else if (iv === 12) m += 12;
        else if (leak === 'safe') m += 0;
        else if (iv === 't') m += ch.third || ch.fifth || 7;
        else if (iv === 'c') m += has(10) ? 10 : has(9) ? 9 : has(11) ? 11 : (ch.fifth || 7);
        else if (iv === 'a') { const nx = i + len >= sp.i1 ? (sp.i1 < n ? q.chordAt(sp.i1) : q.nextChord) : null; if (L >= 3 && nx && nx.root !== ch.root) { m = nx.root + (rd(i, 30) < 0.5 ? -1 : 1); if (m - ch.root > 7) m -= 12; if (ch.root - m > 7) m += 12; } }
        else m += iv || 0;
        while (m > 52) m -= 12; while (m < 28) m += 12;
        push(i, 'bass', jit(i === 0 ? 1 : 0.86, i, 31, 0.06), { midi: m, len: len * 0.92, o: pk.bass });
      });
    }

    /* ---------- chords ---------- */
    if (leak === 'safe') {
      if (L >= 1 && !q.noComp && !introThin) for (const s of spans) if (s.ch) safeV(s.ch).forEach(m => push(s.i0, 'pad', 0.7, { midi: m, len: s.i1 - s.i0, o: 'safe' }));
    } else if (leak === 'full') {
      const layers = [];
      if (!q.noComp) {
        if (L >= 1 || kind === 'intro') layers.push([pk.prim, 1]);
        if (pk.sec && L >= 2 && kind !== 'intro' && kind !== 'bridge') layers.push([pk.sec, 0.8]);
      }
      for (const [ly, gainK] of layers) {
        const [inst, gk, vr, cr] = ly, isG = inst === 'gtr';
        let str = adapt(chorusy ? cr : vr, q, isG).split('');
        if (drop) str = str.map(() => '.');
        for (const s of spans) if (s.ch && str[s.i0] === '.' && (ly === pk.prim || drop) && !/[0-9b]/.test(str.join(''))) str[s.i0] = isG ? (gk === 'D' ? 'P' : 'c') : 'h';   // every chord change is heard
        for (let i = 0; i < n; i++) {
          const c = str[i]; if (c === '.') continue;
          const ch = q.chordAt(i); if (!ch) continue;
          const sp = spanOf(i); let nx = i + 1; while (nx < sp.i1 && str[nx] === '.') nx++;
          const len = nx - i, on = i % sub === 0, v0 = gainK * (L >= 4 ? 1.05 : 1), dt = (rd(i, 40) - 0.5) * 0.008;
          if (isG) {
            const full = gk === 'D' ? powerV(ch) : gtrV(ch);
            if (c === 'p') push(i, 'gtr', jit(v0 * (on ? 0.9 : 0.68), i, 41), { notes: powerV(ch).slice(0, 2), len: 0, o: { kind: gk, mute: 0.075, gap: 0.003 }, dt });
            else if (c === 'P' || c === 'c') push(i, 'gtr', jit(v0 * 0.88, i, 41), { notes: full, len, o: { kind: gk, gap: gk === 'D' ? 0.004 : 0.012 }, dt });
            else if (c === 'u') push(i, 'gtr', jit(v0 * 0.62, i, 41), { notes: full.slice(-4), len, o: { kind: gk, up: 1 }, dt });
            else if (c === 't') push(i, 'gtr', jit(v0 * 0.78, i, 41), { notes: full.slice(-4), len: 0, o: { kind: gk, mute: 0.1, gap: 0.006, up: i % 4 === 2 }, dt });
            else if (c === 'k') push(i, 'gtr', jit(v0 * 0.55, i, 41), { notes: [], len: 0, o: { kind: gk, chk: 1 }, dt });
            else if (c === 'b') push(i, 'gtr', jit(v0 * 0.75, i, 41), { notes: [full[(i / sub | 0) % 2 ? 1 : 0]], len: 4, o: { kind: gk }, dt });
            else push(i, 'gtr', jit(v0 * 0.66, i, 41), { notes: [full[Math.min(full.length - 1, +c + 1)]], len: 6, o: { kind: gk }, dt });
          } else {
            const vv = keysV(ch, inst === 'pluck' ? 62 : 57);
            if (c === 'h') vv.forEach(m => push(i, inst, jit(v0 * 0.72, i, 42), { midi: m, len: len * 0.95, dt }));
            else if (c === 's') vv.forEach(m => push(i, inst, jit(v0 * 0.8, i, 42), { midi: m, len: 0.8, dt }));
            else { const k = +c, lad = [vv[0] - 12].concat(vv); push(i, inst, jit(v0 * (k === 0 ? 0.8 : 0.62), i, 42), { midi: lad[Math.min(lad.length - 1, k)], len: 5, dt }); }
          }
        }
      }
      // pad
      const pd = pk.pad || ['pad', 4];
      if (!q.noComp && kind !== 'intro' && (L >= pd[1] || (chorusy && L >= Math.max(1, pd[1] - 1)) || (kind === 'bridge' && L >= 1)))
        for (const s of spans) if (s.ch) { const v = padV(s.ch, 60); if (L >= 4 && pd[0] !== 'saw') v.push(v[0] + 12); v.forEach(m => push(s.i0, 'pad', 0.7, { midi: m, len: s.i1 - s.i0, o: pd[0] })); }
      // hook
      if (pk.hook && L >= 3 && (chorusy || L >= 4 || q.barIn % 4 >= 2) && kind !== 'intro' && !drop && !F) {      // at hype 3 a verse gets the hook as an answer in the second half of each 4-bar phrase
        const [hk, type] = pk.hook, odd = q.barIn % 2;
        if (type === 'stab') {
          const str = n === 16 ? STAB[odd] : 's' + '.'.repeat(n - 1);
          for (let i = 0; i < n; i++) if (str[i] === 's') { const ch = q.chordAt(i); if (ch) keysV(ch, 67).slice(-3).forEach(m => push(i, 'lead', 0.7, { midi: m, len: 1.3, o: hk })); }
        } else {
          const lib = MOTIF[Math.floor(hsh(seed + style.length * 77) * MOTIF.length)][odd];
          const mot = n === 16 ? lib : Array.from({ length: beats }, (_, b) => [b * sub, sub, (b + odd) % 4]);
          for (const [i, len, rung] of mot) { const ch = q.chordAt(i); if (ch) push(i, 'lead', 0.72, { midi: ladder(ch, 72)[rung % 6], len: len * 0.9, o: hk }); }
        }
      }
      // the crowd sings along in the chorus
      if (L >= 4 && chorusy && !drop) for (const s of spans) if (s.ch) { const r = inWin(s.ch.pcs[0], 57); push(s.i0, 'whoa', 0.7, { midi: r, len: s.i1 - s.i0 }); push(s.i0, 'whoa', 0.5, { midi: r + (s.ch.fifth || 7), len: s.i1 - s.i0 }); }
    }
    // the crowd claps along
    if ((L >= 4 || (L >= 3 && chorusy)) && !drop && !introThin) for (let b = 0; b < beats; b++) if (beats === 3 ? b > 0 : b % 2 === 1) push(b * sub, 'cclap', L >= 4 ? 0.85 : 0.55);
    return E;
  }
  // the last hit of the song, on the downbeat after the final bar
  function ending(q){
    const E = [], pk = pack(q.style), ch = q.chordAt(0), leak = q.leak || 'full', hold = q.sub * Math.min(4, q.beats) ;
    if (!q.noKit && !q.P.none) { E.push({ i: 0, inst: 'crash', v: 1, kind: 'crash' }, { i: 0, inst: 'kick', v: 1, kind: 'kick' }); }
    if (!ch || leak === 'drums') return E;
    if (!q.noBass) E.push({ i: 0, inst: 'bass', v: 1, midi: ch.root, len: hold, o: pk.bass });
    if (q.noComp) return E;
    if (leak === 'safe') { safeV(ch).forEach(m => E.push({ i: 0, inst: 'pad', v: 0.7, midi: m, len: hold, o: 'safe' })); return E; }
    const [inst, gk] = pk.prim;
    if (inst === 'gtr') E.push({ i: 0, inst: 'gtr', v: 0.95, notes: gk === 'D' ? powerV(ch) : gtrV(ch), len: hold, o: { kind: gk, gap: 0.02 } });
    else keysV(ch, 57).forEach(m => E.push({ i: 0, inst: inst === 'pluck' ? 'ep' : inst, v: 0.85, midi: m, len: hold }));
    padV(ch, 60).forEach(m => E.push({ i: 0, inst: 'pad', v: 0.7, midi: m, len: hold, o: (pk.pad || ['pad'])[0] }));
    return E;
  }
  // what joins at each hype level, for the level-up banner
  function layerName(style, level, leak){
    const pk = pack(style), nm = { gtr: 'GUITAR', ep: 'KEYS', organ: 'ORGAN', pluck: 'SYNTH' };
    if (leak === 'drums') return level >= 2 ? 'MORE DRUMS' : '';
    if (leak === 'safe') return ['', 'PAD JOINS IN', 'PERCUSSION', 'MORE DRUMS', 'CROWD CLAPS ALONG'][level] || '';
    return ['', nm[pk.prim[0]] + ' JOINS IN', pk.sec ? nm[pk.sec[0]] + ' JOINS IN' : 'BASS GETS BUSY', 'THE HOOK', 'CROWD SINGS ALONG'][level] || '';
  }
  return { bar, ending, kindOf, pack, layerName, PACK, keysV, gtrV, powerV, padV };
})();
