/* =====================================================================
   Arrange: everything a chart needs beyond its chords, as pure functions
   over plain data (no DOM, no audio): felt tempo + metre, the strum
   pattern library, section types, the easy-capo pass, difficulty, and
   chartModel() - the compiled chart the gameplay core consumes.
   The data model is documented at the top of 20-songs.js.
   ===================================================================== */
const SECTION_TYPES = ['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'solo', 'interlude', 'outro'];
// how hard a section should hit (0 quiet .. 3 full): drives which strum level it gets and the show's escalation
const SECTION_INTENSITY = { intro: 0, verse: 1, prechorus: 2, chorus: 3, bridge: 1, solo: 2, interlude: 1, outro: 1 };
function sectionType(name){
  const n = String(name || '').toLowerCase();
  return /pre/.test(n) ? 'prechorus' : /chorus|refrain|hook/.test(n) ? 'chorus' : /bridge|middle/.test(n) ? 'bridge' : /intro/.test(n) ? 'intro'
    : /outro|coda|ending|tag/.test(n) ? 'outro' : /solo/.test(n) ? 'solo' : /interlude|instrumental|break|riff/.test(n) ? 'interlude' : 'verse';
}

/* ---------- felt tempo and metre ----------
   Sources count beats in whatever unit the transcriber chose: 6/8 written as 6/4 at 246, a ballad at 174 in "4/4",
   eighth-note beats in x/8. The game needs the pulse a player taps a foot to. Rule, in order:
   1. x/8 metres count eighths: three to a beat.
   2. Triple groupings (3/4, 6/4, 9/4, 12/4) with a beat faster than 150: nobody feels that as the pulse; the bar of
      three is the beat, so it is compound time (6/8 or 12/8) at a third of the tempo.
      Slower 6/4, 9/4 are bars of 3/4; 12/4, 8/4 bars of 4/4; 5/4 and 7/4 have no drum groove here and are laid in 4/4 (flagged).
   3. "4/4" faster than 150 whose chords last 3, 6, 12 beats (never 4 or 8) is compound time too.
   4. Simple time: over 200 is always half; 160-200 is half when the chords typically last 4+ counted beats (a real
      fast song changes chord faster than that for at least part of it, a ballad counted in eighths never does).
      Under 50 is doubled.
   lens: chord lengths in the source's beats. Returns { bpm, time, scale (source beat -> felt beat), rule }.        */
function normalizeTempo(bpm, time, lens){
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(time || '4/4')), n = m ? +m[1] : 4, d = m ? +m[2] : 4;
  lens = (lens || []).filter(x => x > 0);
  let out = '4/4', scale = 1; const rule = [];
  const total = lens.reduce((a, x) => a + x, 0) || 1;
  const frac = f => lens.reduce((a, x) => a + (f(x) ? x : 0), 0) / total;
  const whole = (x, k) => Math.abs(x / k - Math.round(x / k)) < 0.02 && x >= k;
  const known = bpm > 0;
  if (d === 8) {
    out = n === 12 ? '12/8' : '6/8'; scale = 1 / 3; rule.push('eighths');
    if (n !== 6 && n !== 12) rule.push('metre ' + n + '/8 as 6/8');
  } else if (n === 3 || n === 6 || n === 9 || n === 12) {
    if (known && bpm >= 150) { out = n === 12 ? '12/8' : '6/8'; scale = 1 / 3; rule.push('compound'); }
    else { out = n === 12 ? '4/4' : '3/4'; if (n !== 3) rule.push(n + '/4 as bars of ' + out); }
  } else if (n === 2) out = '2/4';
  else if (n === 4 || n === 8) {
    if (n === 8) rule.push('8/4 as bars of 4/4');
    if (known && bpm >= 150 && lens.length >= 4 && frac(x => whole(x, 3)) >= 0.85 && frac(x => whole(x, 4)) <= 0.3) { out = '6/8'; scale = 1 / 3; rule.push('compound'); }
  } else rule.push('metre ' + n + '/' + d + ' as 4/4');
  let felt = known ? bpm * scale : 0;
  if (known && scale === 1) {
    // time-weighted median chord length: the song's typical harmonic rhythm
    const s = lens.slice().sort((a, b) => a - b); let acc = 0, med = 0;
    for (const x of s) { acc += x; if (acc >= total / 2) { med = x; break; } }
    if (felt > 200 || (felt >= 160 && med >= 4)) { felt /= 2; scale /= 2; rule.push('halved'); }
    else if (felt < 50) { felt *= 2; scale *= 2; rule.push('doubled'); }
  } else if (known) {
    if (felt > 150) { felt /= 2; scale /= 2; rule.push('halved'); }
    else if (felt < 30) { felt *= 2; scale *= 2; rule.push('doubled'); }
  }
  return { bpm: felt ? Math.round(felt) : 0, time: out, scale, rule: rule.join(', ') };
}

/* ---------- the strum library ----------
   A family is one feel at four levels: 0 let it ring, 1 basic, 2 the real pattern, 3 busy. The player's tier caps the
   level (easy 1, normal 2, hard 3) and the section's intensity picks within it, so a song escalates intro -> chorus.
   One string = one bar. D down, U up, B bass note (boom), X muted chuck, . nothing. Capital steps on the beat.   */
const STRUMS = {
  straight: { name: 'Old faithful (D-DU-UDU)', time: '4/4', levels: ['D.......', 'D.D.D.D.', 'D.DU.UDU', 'D.DUDUDU'] },
  slow16:   { name: 'Sixteenth-note strum', time: '4/4', levels: ['D.......', 'D.D.D.DU', 'D.DU.UDU', 'D.DU.UDUD.DU.UDU'] },
  ballad:   { name: 'Ballad', time: '4/4', levels: ['D.......', 'D...D...', 'D...D.DU', 'D.DU.UDU'] },
  drive:    { name: 'Driving eighths', time: '4/4', levels: ['D...D...', 'D.D.D.D.', 'DDDDDDDD', 'DDDDDUDU'] },
  fast:     { name: 'Fast four', time: '4/4', levels: ['D.......', 'D...D...', 'D.D.D.D.', 'D.D.DUDU'] },
  rock:     { name: 'Rock (D-D-DUDU)', time: '4/4', levels: ['D...D...', 'D.D.D.D.', 'D.D.DUDU', 'D.DUDUDU'] },
  boomchick:{ name: 'Boom-chick', time: '4/4', levels: ['B...B...', 'B.D.B.D.', 'B.DUB.DU', 'B.DUBUDU'] },
  reggae:   { name: 'Reggae offbeat', time: '4/4', levels: ['..D...D.', '..D...D.', '.D.D.D.D', '.DUD.DUD'] },
  shuffle:  { name: 'Shuffle', time: '4/4', swing: true, levels: ['D...D...', 'D.D.D.D.', 'D.DUD.DU', 'DUDUDUDU'] },
  funk:     { name: 'Chuck strum', time: '4/4', levels: ['D...D...', 'D.X.D.X.', 'D.XU.UXU', 'D.XUDUXU'] },
  bossa:    { name: 'Bossa', time: '4/4', levels: ['D...D...', 'D..D..D.', 'D..D..DU', 'D.DD.D.D'] },
  waltz:    { name: 'Waltz', time: '3/4', levels: ['D.....', 'D.D.D.', 'B.D.D.', 'D.DUDU'] },
  six8:     { name: '6/8 sway', time: '6/8', levels: ['D.....', 'D..D..', 'DDDDDD', 'D.D.DUD.D.DU'] },
  twelve8:  { name: '12/8 slow blues', time: '12/8', levels: ['D.....D.....', 'D..D..D..D..', 'D.DD.DD.DD.D', 'DDDDDDDDDDDD'] },
  two4:     { name: 'Two-step', time: '2/4', levels: ['D...', 'D.D.', 'B.DU', 'DUDU'] },
};
// the family for a song (or one of its sections), from the metre, the felt tempo, the style and the feel
function pickStrum(o){
  const T = parseTime(o.time), bpm = o.bpm || 100, st = o.style || 'rock';
  if (T.sub === 3) return T.beats >= 4 ? 'twelve8' : 'six8';
  if (T.beats === 3) return 'waltz';
  if (T.beats === 2) return 'two4';
  if (T.beats !== 4) return 'straight';
  if (st === 'reggae') return 'reggae';
  if (o.feel === 'swing' || st === 'shuffle') return 'shuffle';
  if (st === 'country') return 'boomchick';
  if (st === 'funk' || st === 'disco') return 'funk';
  if (st === 'bossa') return 'bossa';
  if (st === 'punk' || st === 'metal') return 'drive';
  if (bpm >= 152) return 'fast';
  if (st === 'ballad' || bpm < 66) return bpm < 84 && st !== 'ballad' ? 'slow16' : 'ballad';
  if (bpm < 84) return 'slow16';
  if (st === 'rock' && bpm >= 112) return 'rock';
  return 'straight';
}
const TIER_CAP = { easy: 1, normal: 2, hard: 3 };
// the one-bar pattern a section plays: family + section type + player tier -> { id, name, level, pattern, steps, hits }
function strumPattern(id, time, type, tier){
  let fam = STRUMS[id];
  const T = parseTime(time), label = T.label;
  if (!fam || fam.time !== label) { id = pickStrum({ time }); fam = STRUMS[id]; }
  const cap = TIER_CAP[tier] != null ? TIER_CAP[tier] : 2;
  const base = { intro: 0, verse: 2, prechorus: 2, chorus: 3, bridge: 1, solo: 2, interlude: 1, outro: 1 }[type];
  const level = Math.min(cap, base != null ? base : 2);
  const pattern = fam.levels[level], steps = pattern.length, per = T.beats / steps, hits = [];
  for (let i = 0; i < steps; i++) { const c = pattern[i]; if (c === '.') continue; const beat = i * per; hits.push({ step: i, beat: +beat.toFixed(4), dir: c, accent: Math.abs(beat - Math.round(beat)) < 1e-6 && (c === 'D' || c === 'B') }); }
  return { id, name: fam.name, level, pattern, steps, swing: !!fam.swing, hits };
}
// the legacy one-bar string for song.strum (D U . only)
function strumLegacy(pattern){ return String(pattern).replace(/B/g, 'D').replace(/X/g, '.'); }

/* ---------- style when the source has no genre ---------- */
function styleGuess(time, bpm, feel){
  const T = parseTime(time);
  if (T.sub === 3) return 'ballad';
  if (T.beats === 3) return 'waltz';
  if (feel === 'swing') return 'shuffle';
  if (bpm < 76) return 'ballad';
  if (bpm < 104) return 'pop';
  if (bpm >= 168) return 'punk';
  return 'rock';
}

/* ---------- spelling and the easy-capo pass ---------- */
const FLAT_MAJ = [5, 10, 3, 8, 1], FLAT_MIN = [2, 7, 0, 5, 10, 3];
function keyParts(key){ const m = /^([A-G][#b]?)(m?)$/.exec(String(key || '').replace('♯', '#').replace('♭', 'b')), c = m && parseChord(m[1]); return c ? { tonic: c.root, minor: !!m[2] } : null; }
function keyFlat(tonic, minor){ return minor ? FLAT_MIN.includes(tonic) : FLAT_MAJ.includes(tonic); }
function keyName(tonic, minor){ return noteName(tonic, keyFlat(tonic, minor)) + (minor ? 'm' : ''); }
// a chord token moved by d semitones and spelled with flats or sharps; untouched when nothing changes
function respellTok(tok, d, flat){
  const ch = parseChord(tok); if (!ch) return tok;
  const m = /^([A-G][#b♯♭]?)([^\/]*)(?:\/([A-G][#b♯♭]?))?$/.exec(String(tok).trim());
  if (!m) return tok;
  const r = mod12(ch.root + d), b = ch.bass == null ? null : mod12(ch.bass + d);
  return noteName(r, flat) + m[2] + (m[3] && b != null ? '/' + noteName(b, flat) : '');
}
function mapBars(sections, f){ return sections.map(s => ({ ...s, bars: s.bars.map(b => b.split(/\s+/).filter(Boolean).map(f).join(' ')) })); }
// every chord with how many bars-worth it is played
function chordWeights(sections){
  const w = new Map();
  for (const s of sections) for (const b of s.bars) {
    const toks = b.split(/\s+/).filter(Boolean); let last = null;
    for (const t of toks) { const c = parseChord(t); if (c) last = t; if (last) w.set(last, (w.get(last) || 0) + 1 / toks.length); }
  }
  return w;
}
function shapeCost(weights, shift){
  let cost = 0, tot = 0, barre = 0; const hard = new Set();
  for (const [name, w] of weights) {
    const ch = parseChord(name); if (!ch) continue;
    const v = voicingFor(shift ? transposeChord(ch, shift) : ch, false);
    cost += v.diff * w; tot += w; if (v.barre && v.barre.to - v.barre.from >= 2) { barre += w; hard.add(ch.root + (/^m(?!aj)/.test(ch.quality) ? 'm' : '')); }
  }
  return { avg: tot ? cost / tot : 0, barre: tot ? barre / tot : 0, hard };
}
// Beginner pass: when the song as written leans on barre chords, find the capo (0-7) whose open shapes are easiest and
// rewrite the chart in those shapes. The song sounds the same; song.orig keeps the version as it came.
// Returns the song (a new object when changed) with prov.easy = { capo, from, before, after }.
function easyCapo(song, opts){
  opts = opts || {};
  const c0 = song.capo || 0, w = chordWeights(song.sections);
  if (!w.size || song.tuning) return song;
  const cur = shapeCost(w, 0);
  if (!opts.force && cur.barre < 0.2 && cur.avg < 2.2) return song;       // already open-chord friendly
  // a capo costs a little, and high up the neck (6, 7) a lot: the shapes get cramped and the guitar thin
  const pen = c => c * 0.08 + Math.max(0, c - 4) * 0.4, cur0 = cur.avg + cur.barre * 2 + pen(c0);
  let best = { c: c0, score: cur0, st: cur };
  // a song whose only barre chord is F or Bm (the two every beginner meets first) keeps its usual shapes
  const k0 = keyParts(song.key), fOrBm = cur.hard.size === 1 && (cur.hard.has('5') || cur.hard.has('11m'));
  if (fOrBm && !opts.force) return song;
  for (let c = 0; c <= 7; c++) {
    if (c === c0) continue;
    const st = shapeCost(w, c0 - c), score = st.avg + st.barre * 2 + pen(c);
    if (score < best.score - 0.01) best = { c, score, st };
  }
  if (best.c === c0 || best.score > cur0 - 0.45) return song;             // not clearly easier: leave it
  const k = k0;
  const shapeTonic = k ? mod12(k.tonic - best.c) : null;
  const flat = k ? keyFlat(shapeTonic, k.minor) : false;
  const out = { ...song, capo: best.c, sections: mapBars(song.sections, t => respellTok(t, c0 - best.c, flat)),
    orig: song.orig || { capo: c0, key: song.key, sections: song.sections.map(s => s.bars.slice()) } };
  out.prov = { ...(song.prov || {}), easy: { capo: best.c, from: c0, before: +cur.avg.toFixed(2), after: +best.st.avg.toFixed(2) } };
  return out;
}
// chords spelled the way the key is written (E/Ab in A -> E/G#, C# chords under a Db key -> Db)
function respellSong(song){
  const k = keyParts(song.key); if (!k) return song;
  const shapeTonic = mod12(k.tonic - (song.capo || 0) - (song.tuning || 0)), flat = keyFlat(shapeTonic, k.minor);
  return { ...song, key: keyName(k.tonic, k.minor), sections: mapBars(song.sections, t => { const c = parseChord(t); return c && /[#b♯♭]/.test(t) ? respellTok(t, 0, flat) : t; }) };
}

/* ---------- difficulty ---------- */
// 1 Easy (open chords, steady changes), 2 Medium, 3 Hard (barres, fast changes, fast tempo)
function songDifficulty(song){
  const w = chordWeights(song.sections), st = shapeCost(w, 0), T = parseTime(song.time);
  let bars = 0, changes = 0;
  for (const s of song.sections) for (const b of s.bars) { bars++; changes += b.split(/\s+/).filter(t => parseChord(t)).length; }
  const perBar = bars ? changes / bars : 1, cps = perBar * (song.bpm || 100) / 60 / T.beats;       // chord changes per second
  const reasons = [];
  let score = st.avg + st.barre * 3;
  if (st.barre >= 0.15) reasons.push('barre chords');
  if (w.size > 6) { score += 0.4; reasons.push(w.size + ' different chords'); }
  if (cps > 0.9) { score += 0.9; reasons.push('fast chord changes'); } else if (cps > 0.6) score += 0.4;
  if ((song.bpm || 0) > 150 && T.sub !== 3) { score += 0.4; reasons.push('fast tempo'); }
  const tier = score >= 3.4 || st.barre >= 0.3 ? 3 : score >= 2.1 || w.size > 5 ? 2 : 1;
  if (!reasons.length) reasons.push(tier === 1 ? 'open chords, steady changes' : 'a few trickier shapes');
  return { tier, label: ['', 'Easy', 'Medium', 'Hard'][tier], score: +score.toFixed(2), reasons, chords: w.size, barre: +st.barre.toFixed(2), changesPerBar: +perBar.toFixed(2) };
}

/* ---------- finish: fill in whatever the source left out ---------- */
// song: any object validateSong accepts. opts: { easy: false to skip the capo pass, hint: {bpm, time, style, strum, feel} }
// Never changes the chords' sound; only tempo sanity, style, strum family, section types, capo shapes, level.
function finishChart(song, opts){
  opts = opts || {};
  let s = { ...song, sections: song.sections.map(x => ({ ...x })) };
  const prov = s.prov = { ...(s.prov || {}) }, hint = opts.hint || (typeof songHint === 'function' ? songHint(s.title, s.artist) : null) || {};
  if (!TIMES.includes(s.time)) s.time = '4/4';
  if (!(s.bpm > 0)) { s.bpm = hint.bpm || 100; prov.tempo = { raw: 0, rule: '', from: hint.bpm ? 'hint' : 'default', conf: hint.bpm ? 'high' : 'low' }; }
  if (hint.feel && !s.feel) s.feel = hint.feel;
  const guessed = !STYLES.includes(s.style) || opts.styleUnknown;
  if (hint.style && (guessed || opts.preferHint)) s.style = hint.style;
  else if (guessed) s.style = styleGuess(s.time, s.bpm, s.feel);
  s.sections.forEach(x => { if (!SECTION_TYPES.includes(x.type)) x.type = sectionType(x.name); });
  if (opts.easy !== false) s = easyCapo(s);
  s = respellSong(s);
  const fam = hint.strum && STRUMS[hint.strum] && STRUMS[hint.strum].time === parseTime(s.time).label ? hint.strum : pickStrum(s);
  if (!s.strum) s.strum = strumLegacy(strumPattern(fam, s.time, 'verse', 'normal').pattern);
  s.sections.forEach(x => { if (!x.strum || !STRUMS[x.strum]) x.strum = fam; });
  if (!s.level) s.level = songDifficulty(s).tier;
  return s;
}

/* ---------- the compiled chart for the gameplay core ---------- */
function chartModel(song, opts){
  opts = opts || {};
  const tier = TIER_CAP[opts.tier] != null ? opts.tier : 'normal';
  const T = parseTime(song.time), bpb = T.beats, capo = song.capo || 0, tun = song.tuning || 0;
  const fam0 = pickStrum(song), k = keyParts(song.key), flatS = k ? keyFlat(k.tonic, k.minor) : false;
  const sounds = t => respellTok(t, capo + tun, flatS);
  const counts = new Map(), sections = [];
  let bar = 0, lastName = null;
  song.sections.forEach((s, si) => {
    const type = SECTION_TYPES.includes(s.type) ? s.type : sectionType(s.name), bars = [];
    for (const b of s.bars) {
      const toks = b.split(/\s+/).filter(Boolean), n = toks.length, chords = [];
      let lens = n === bpb ? toks.map(() => 1) : (n && (bpb % n === 0 || n > bpb)) ? toks.map(() => bpb / n) : toks.map((_, i) => Math.floor(bpb / n) + (i < bpb - Math.floor(bpb / n) * n ? 1 : 0));
      let pos = 0;
      toks.forEach((t, i) => {
        const ch = /^(N\.?C\.?|rest)$/i.test(t) ? null : parseChord(t), len = lens[i];
        if (ch) {
          // easy tier: triads and plain 7ths, no slash basses
          const name = tier === 'easy' ? noteName(ch.root, ch.flat) + (/^m(?!aj)/.test(ch.quality) ? 'm' : /^(7|9|13)$/.test(ch.quality) ? '7' : '') : t;
          const prev = chords[chords.length - 1];
          if (prev && prev.name === name) prev.len += len;
          else { chords.push({ name, sounds: sounds(name), beat: pos, len }); counts.set(name, (counts.get(name) || 0) + 1); }
          lastName = name;
        } else {
          const prev = chords[chords.length - 1], rest = /^(N\.?C\.?|rest)$/i.test(t);
          if (prev) prev.len += len;                                   // a hold (or a rest: the chord rings on)
          else if (lastName && !rest) chords.push({ name: lastName, sounds: sounds(lastName), beat: pos, len });   // held over the bar line
        }
        pos += len;
      });
      // easy tier: at most two chords a bar (the ones on beat 1 and the half bar)
      const kept = tier === 'easy' && chords.length > 2 ? (() => { const a = chords[0], h = chords.find(c => c.beat >= bpb / 2) || chords[chords.length - 1]; return [{ ...a, len: h.beat - a.beat }, { ...h, len: bpb - h.beat }]; })() : chords;
      bars.push({ index: bar + bars.length, chords: kept.map(c => ({ ...c, beat: +c.beat.toFixed(3), len: +c.len.toFixed(3) })) });
    }
    const st = strumPattern(s.strum && STRUMS[s.strum] ? s.strum : fam0, song.time, type, tier);
    sections.push({ index: si, name: s.name, type, intensity: SECTION_INTENSITY[type], startBar: bar, startBeat: bar * bpb, barCount: bars.length, approx: !!s.approx || undefined, conf: s.conf, strum: st, bars });
    bar += bars.length;
  });
  const totalBeats = bar * bpb;
  return { v: 2, id: song.id, title: song.title, artist: song.artist, source: (song.prov && song.prov.src) || song.source || '', approx: !!song.approx,
    bpm: song.bpm, time: T.label, beatsPerBar: bpb, stepsPerBeat: T.sub, feel: song.feel === 'swing' ? 'swing' : 'straight', style: song.style, key: song.key || '', capo, tuning: tun,
    tier, difficulty: songDifficulty(song), totalBars: bar, totalBeats, durationSec: +(totalBeats * 60 / (song.bpm || 100)).toFixed(1),
    chords: [...counts].map(([name, count]) => ({ name, sounds: sounds(name), count })), sections, anchors: song.anchors || null };
}
