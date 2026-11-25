// Charting rules, honest errors, offline search and the lyrics clock, in plain Node with a scripted network.
//   node test/chartflow.js                      the working tree (exits 1 when a check fails)
//   SRC=/path/to/old/src node test/chartflow.js   another copy of src/ (before/after; checks the old code lacks print n/a)
const fs = require('fs');
let net = async () => { throw new TypeError('Failed to fetch'); };
const { ctx, files } = require('./lib/core')({ fetch: (u, o) => net(String(u), o) });
const C = ctx, has = n => typeof C[n] === 'function' || (C[n] && typeof C[n] === 'object');
let pass = 0, fail = 0; const lines = [];
const ok = (name, cond, detail) => { if (cond) pass++; else fail++; lines.push(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); };
const na = name => lines.push(`n/a  ${name}`);
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json' } });
const down = async () => { throw new TypeError('Failed to fetch'); };
const track = (title, artist, dur, id) => ({ title, artist, trackId: id || '', durationMs: (dur || 0) * 1000, previewUrl: '', album: '', year: 0, art: '' });
const chart = async (t, o) => { const s = await C.Chart.make(t, { ai: false, web: false, ...(o || {}) }); const v = C.validateSong(s, 'dataset'); return { s, v, ch: C.compileSong(v, { shapes: 'standard' }) }; };
const R = (v, n) => Array(n).fill(v).join(' ');

(async () => {
  /* ---------- 1. rules: tempo, strum library, capo, the compiled chart ---------- */
  if (has('normalizeTempo')) {
    const t = (bpm, time, lens) => { const r = C.normalizeTempo(bpm, time, lens); return r.bpm + ' ' + r.time; };
    ok('tempo: 6/4 at 246 is 6/8 at 82 (House of the Rising Sun)', t(246, '6/4', [6, 6, 6, 6]) === '82 6/8', t(246, '6/4', [6, 6, 6, 6]));
    ok('tempo: 3/4 at 192 is 6/8 at 64 (Perfect)', t(192, '3/4', [6, 6, 6, 6]) === '64 6/8', t(192, '3/4', [6, 6, 6, 6]));
    ok('tempo: 4/4 at 174 with chords of 4+ beats is 87 (Wonderwall)', t(174, '4/4', [4, 4, 4, 4, 8]) === '87 4/4', t(174, '4/4', [4, 4, 4, 4, 8]));
    ok('tempo: 4/4 at 171 with quick changes stays 171', t(171, '4/4', [2, 2, 2, 2, 4, 2, 2]) === '171 4/4', t(171, '4/4', [2, 2, 2, 2, 4, 2, 2]));
    ok('tempo: 4/4 at 246 is always halved', t(246, '4/4', [2, 2, 2, 2]) === '123 4/4', t(246, '4/4', [2, 2, 2, 2]));
    ok('tempo: 4/4 at 120 untouched', t(120, '4/4', [4, 4, 2, 2]) === '120 4/4');
    ok('tempo: slow 3/4 stays a waltz', t(96, '3/4', [3, 3, 3]) === '96 3/4');
    ok('tempo: 5/4 is laid in 4/4 and says so', /as 4\/4/.test(C.normalizeTempo(120, '5/4', [5, 5]).rule));
  } else na('tempo rules (normalizeTempo)');
  if (has('STRUMS')) {
    let bad = 0; const fam = Object.keys(C.STRUMS);
    for (const id of fam) { const f = C.STRUMS[id], T = C.parseTime(f.time); if (f.levels.length !== 4 || f.levels.some(p => !/^[DUBX.]+$/.test(p) || p.length % T.beats || !/[DUBX]/.test(p))) bad++; }
    ok(`strum library: ${fam.length} families, 4 levels each, whole bars`, fam.length >= 12 && !bad, fam.join(' '));
    const pk = o => C.pickStrum(o);
    ok('strum pick: country -> boom-chick, reggae -> offbeat, 6/8, 3/4, slow ballad', pk({ time: '4/4', bpm: 110, style: 'country' }) === 'boomchick' && pk({ time: '4/4', bpm: 75, style: 'reggae' }) === 'reggae'
      && pk({ time: '6/8', bpm: 64 }) === 'six8' && pk({ time: '3/4', bpm: 100 }) === 'waltz' && pk({ time: '4/4', bpm: 62, style: 'ballad' }) === 'ballad' && pk({ time: '4/4', bpm: 100, style: 'pop' }) === 'straight');
    const p = C.strumPattern('straight', '4/4', 'chorus', 'normal'), e = C.strumPattern('straight', '4/4', 'chorus', 'easy'), h = C.strumPattern('straight', '4/4', 'chorus', 'hard');
    ok('strum tiers: easy < normal < hard hits in a chorus', e.hits.length < p.hits.length && p.hits.length < h.hits.length && p.pattern === 'D.DU.UDU', [e.pattern, p.pattern, h.pattern].join(' / '));
  } else na('strum library');
  if (has('easyCapo')) {
    const song = (key, bars) => C.validateSong({ title: 'x', bpm: 100, time: '4/4', key, sections: [{ name: 'Verse', bars }] }, 'dataset');
    const rip = C.easyCapo(song('Db', ['Bbm', 'Ab', 'Db', 'Db'])), ww = C.easyCapo(song('F#m', ['F#m7 A', 'Esus4 B7sus4'])), g = C.easyCapo(song('G', ['G', 'C', 'D', 'Em'])), f = C.easyCapo(song('C', ['C', 'Am', 'F', 'G']));
    ok('capo: Bbm Ab Db -> capo 1, Am G C (Riptide)', rip.capo === 1 && rip.sections[0].bars.join(' ') === 'Am G C C' && rip.orig && rip.orig.sections[0][0] === 'Bbm', 'capo ' + rip.capo + ': ' + rip.sections[0].bars.join(' '));
    ok('capo: F#m7 A Esus4 B7sus4 -> capo 2, Em7 G Dsus4 A7sus4 (Wonderwall)', ww.capo === 2 && ww.sections[0].bars.join(' | ') === 'Em7 G | Dsus4 A7sus4', 'capo ' + ww.capo + ': ' + ww.sections[0].bars.join(' | '));
    ok('capo: open-chord songs are left alone (G C D Em; C Am F G)', g.capo === 0 && f.capo === 0 && !g.orig && !f.orig);
    const before = C.songDifficulty(song('Db', ['Bbm', 'Ab', 'Db', 'Db'])), after = C.songDifficulty(rip);
    ok('difficulty: the capo version is easier', after.tier < before.tier, before.label + ' -> ' + after.label);
  } else na('capo / easy-shape pass');
  if (has('chartModel')) {
    // every built-in song and a slice of Hooktheory, three tiers each: whole bars, known section types, a strum per section
    const songs = C.LIBRARY.map(s => C.finishChart(s, { easy: false }));
    for (const p of C.SONG_PACK) songs.push((await chart(track(p.t, p.a))).v);
    const db = await C.Lookup.loadHT(), keys = Object.keys(db).filter((_, i) => i % 150 === 0);
    let htOk = 0;
    for (const k of keys) { const i = k.indexOf('|'); try { songs.push((await chart({ ...track(C.Lookup.unslug(k.slice(i + 1)), C.Lookup.unslug(k.slice(0, i)), 0), local: k }, { offline: true })).v); htOk++; } catch (e) { } }
    let bad = [], n = 0;
    for (const s of songs) for (const tier of ['easy', 'normal', 'hard']) {
      const m = C.chartModel(s, { tier }); n++;
      const why = !(m.bpm >= 40 && m.bpm <= 200) ? 'bpm ' + m.bpm : !m.sections.length ? 'no sections'
        : m.sections.some(x => !x.strum || !x.strum.hits.length || x.strum.steps % m.beatsPerBar) ? 'strum'
        : m.sections.some(x => !['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'solo', 'interlude', 'outro'].includes(x.type)) ? 'type'
        : m.sections.some(x => x.bars.some(b => b.chords.length && Math.abs(b.chords.reduce((a, c) => a + c.len, 0) + b.chords[0].beat - m.beatsPerBar) > 0.01)) ? 'bar length'
        : m.sections.some(x => x.bars.some(b => b.chords.some(c => c.beat < 0 || c.beat >= m.beatsPerBar))) ? 'beat' : tier === 'easy' && m.sections.some(x => x.bars.some(b => b.chords.length > 2)) ? 'easy tier > 2 chords' : '';
      if (why) bad.push(s.title + ' [' + tier + '] ' + why);
    }
    ok(`compiled chart: ${n} charts (${C.LIBRARY.length} library, ${C.SONG_PACK.length} pack, ${htOk}/${keys.length} sampled Hooktheory songs x 3 tiers) are well formed`, !bad.length && htOk >= keys.length * 0.95, bad.slice(0, 5).join('; '));
    const tempos = songs.slice(C.LIBRARY.length + C.SONG_PACK.length).map(s => s.bpm), sane = tempos.filter(b => b >= 50 && b <= 185).length;
    ok('sampled Hooktheory songs: tempo in 50-185', sane >= tempos.length * 0.97, sane + '/' + tempos.length);
  } else na('compiled chart model (chartModel)');

  /* ---------- 2. honest errors, no silent wrong song ---------- */
  const code = async (t, o) => { try { const r = await chart(t, o); return 'chart:' + r.s.prov.src; } catch (e) { return e.code || String(e.message).slice(0, 40); } };
  // a title whose hash collides in the index but is no song
  let ghost = null; for (let i = 0; i < 5000 && !ghost; i++) if (C.Lookup.findKey('zzqx' + i + ' nonsense|nobody ' + (i * 7919)).length) ghost = track('zzqx' + i + ' nonsense', 'nobody ' + i * 7919, 200, 901);
  const hfRow = chords => u => { const row = +new URL(u).searchParams.get('offset'); return json({ rows: [{ row: { id: row + 1, chords, spotify_song_id: 'abcdefghij' + row, main_genre: 'rock', genres: '' } }] }); };
  const world = (rowFn, titleFn) => async u => u.includes('datasets-server.huggingface.co') ? rowFn(u) : u.includes('open.spotify.com/oembed') ? titleFn(u) : u.includes('listenbrainz') ? json([]) : down();
  const tw = track('Tennessee Whiskey', 'Chris Stapleton', 293, 902);
  net = down;
  let c = await code(tw);
  ok('song in the index, chord host unreachable -> "offline" (retry), not "not in dataset"', c === 'offline', c);
  net = world(hfRow('<verse_1> F Bb C F Bb C Dmin Bb F C'), down);
  c = await code(ghost);
  ok('hash false positive + title check unreachable -> refused ("unverified"), not charted', c === 'unverified', c);
  net = world(hfRow('<verse_1> F Bb C F Bb C Dmin Bb F C'), () => json({ title: 'Some Other Song' }));
  c = await code({ ...ghost, trackId: 905 });
  ok('hash false positive + title says another song -> "not_in_dataset"', c === 'not_in_dataset', c);
  net = world(() => json({ rows: [] }), down);
  c = await code(track('Qwrtplk Zzxv', 'Nobody Xqj', 200, 903));
  ok('online, song nowhere -> "not_in_dataset"', c === 'not_in_dataset', c);
  c = await code(track('Qwrtplk Zzxv', 'Nobody Xqj', 200, 903), { offline: true });
  ok('offline, song not built in -> "offline_nf"', c === 'offline_nf', c);
  if (has('songHint')) ok('error kinds: fetch failure is offline, 429 is busy', C.Lookup.errKind(new TypeError('Failed to fetch')) === 'offline' && C.Lookup.errKind({ status: 429 }) === 'busy'); else na('Lookup.errKind');

  /* ---------- 3. the dataset path (scripted rows: chords with no timing, as the dataset has them) ---------- */
  const WW = `<intro_1> ${R('Emin7 G Dsus4 A7sus4', 4)} <verse_1> ${R('Emin7 G Dsus4 A7sus4', 4)} <verse_2> ${R('Emin7 G Dsus4 A7sus4', 4)} <prechorus_1> C D Emin C D Emin C D G D Emin A7sus4 <chorus_1> ${R('C Emin G Emin', 4)} <verse_3> ${R('Emin7 G Dsus4 A7sus4', 4)} <prechorus_2> C D Emin C D Emin C D G D Emin A7sus4 <chorus_2> ${R('C Emin G Emin', 8)} <outro_1> ${R('C Emin G Emin', 4)}`;
  const TW = '<intro_1> A Bmin <verse_1> A Bmin D A <chorus_1> A Bmin D A A Bmin D A <verse_2> A Bmin D A <chorus_2> A Bmin D A A Bmin D A <solo_1> A Bmin D A <chorus_3> A Bmin D A A Bmin D A';
  // a chord that starts on beat 4 or is carried over a bar line into the middle of the next bar (a bar of '.' alone is a hold)
  const smeared = v => v.sections.reduce((a, s) => a + s.bars.filter(b => /^\. .*[A-G]|^\S+ \. \. \S+$/.test(b)).length, 0);
  try {
    net = world(hfRow(WW), () => json({ title: 'Wonderwall' }));
    const r = await chart(track('Wonderwall', 'Oasis', 258, 904), { noPack: true }), sec = Math.round(r.ch.totalBeats * 60 / r.v.bpm);
    ok('dataset row (Wonderwall): tempo 87 from the transcription, not a default 100', r.s.prov.src === 'dataset' && Math.abs(r.v.bpm - 87) <= 5, `src ${r.s.prov.src} bpm ${r.v.bpm} (${r.s.prov.bpmFrom})`);
    ok('dataset row (Wonderwall): chords stay on bar lines', smeared(r.v) === 0, smeared(r.v) + ' smeared bars; ' + r.v.sections.flatMap(s => s.bars).filter(b => /^\. .*[A-G]|^\S+ \. \. \S+$/.test(b)).join(' | ') + ' in ' + r.v.sections.map(s => s.name + ':' + s.bars.join('|')).join('  ').slice(0, 700));
    ok('dataset row (Wonderwall): capo 2 shapes kept, strum + sections typed', r.v.capo === 2 && !!r.v.strum && r.v.sections.every(s => !C.chartModel || s.type), `capo ${r.v.capo} key ${r.v.key} strum ${r.v.strum} ${sec}s of 258s`);
  } catch (e) { ok('dataset row (Wonderwall) charts', false, e.code || e.message); }
  try {
    net = world(hfRow(TW), () => json({ title: 'Tennessee Whiskey' }));
    const r = await chart(tw), sec = Math.round(r.ch.totalBeats * 60 / r.v.bpm);
    lines.push(`info dataset row with no timing anywhere (Tennessee Whiskey): bpm ${r.v.bpm} (${r.s.prov.bpmFrom}, confidence ${r.s.prov.tempo ? r.s.prov.tempo.conf : '?'}) ${r.v.time} ${sec}s of 293s, strum ${r.v.strum || '-'}`);
    ok('dataset row with no timing still gets a strum pattern and a sane tempo', !!r.v.strum && r.v.bpm >= 50 && r.v.bpm <= 185, 'bpm ' + r.v.bpm + ' strum ' + (r.v.strum || '-'));
  } catch (e) { ok('dataset row (Tennessee Whiskey) charts', false, e.code || e.message); }

  /* ---------- 4. search with no network ---------- */
  net = down;
  const Q = [['wonderwall oasis', 'Wonderwall'], ['wonderwal', 'Wonderwall'], ['hotel californa', 'Hotel California'], ['smels like teen spirit', 'Smells Like Teen Spirit'], ['riptide', 'Riptide'],
    ['knocking on heavens door', "Knockin' on Heaven's Door"], ['let it be beatles', 'Let It Be'], ['sweet child o mine', "Sweet Child O' Mine"], ['halelujah buckley', 'Hallelujah'], ['country roads', 'Take Me Home Country Roads'],
    ['hey soul sister', 'Hey, Soul Sister'], ['seven nation army', 'Seven Nation Army'], ['free fallin tom petty', "Free Fallin'"], ['zombie cranberries', 'Zombie'], ['creep radiohed', 'Creep'], ['im yours', "I'm Yours"],
    ['brown eyed girl', 'Brown Eyed Girl'], ['stand by me', 'Stand by Me'], ['house of the rising sun', 'House of the Rising Sun'], ['bella ciao', 'Bella ciao'], ['wish you were here pink floyd', 'Wish You Were Here'], ['perfect ed sheeran', 'Perfect'],
    ['someone like you', 'Someone Like You'], ['thinking out loud', 'Thinking Out Loud']];
  if (C.Lookup.searchLocal) {
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    let top1 = 0, top3 = 0, playable = 0, ms = []; const miss = [];
    for (const [q, want] of Q) {
      const t0 = performance.now(), hits = await C.Lookup.searchLocal(q, { limit: 6 }); ms.push(performance.now() - t0);
      const at = hits.findIndex(h => norm(h.title) === norm(want));
      if (at === 0) top1++; if (at >= 0 && at < 3) top3++; else miss.push(q + ' -> ' + (hits[0] ? hits[0].title + ' / ' + hits[0].artist : 'nothing'));
      if (at >= 0) { try { const r = await chart(hits[at].track, { offline: true }); if (r.ch.totalBars >= 16) playable++; } catch (e) { } }
    }
    ms.sort((a, b) => a - b);
    ok(`offline search: ${Q.length} queries (10 misspelt or partial), right song first`, top1 >= Q.length * 0.85, `${top1}/${Q.length} first, ${top3}/${Q.length} in the top 3` + (miss.length ? '; missed: ' + miss.join('; ') : ''));
    ok('offline search: the hit opens as a full chart with no network', playable >= top3 - 1, playable + '/' + Q.length);
    ok('offline search: fast after the first query', ms[ms.length >> 1] < 60, `median ${ms[ms.length >> 1].toFixed(0)} ms, first ${ms[ms.length - 1].toFixed(0)} ms (builds the catalogue)`);
    const sr = await C.Lookup.search('wonderwall', {});
    ok('Lookup.search with the song service down still answers from the built-in catalogue', sr.local.length > 0 && sr.online.length === 0 && sr.offline === true, `local ${sr.local.length}, offline ${sr.offline}`);
    net = async u => u.includes('itunes.apple.com') ? json({ results: [{ wrapperType: 'track', kind: 'song', trackId: 1, trackName: 'Wonderwall (Live)', artistName: 'Oasis', collectionName: 'Live', trackTimeMillis: 250000 }, { wrapperType: 'track', kind: 'song', trackId: 2, trackName: 'Wonderwall', artistName: 'Oasis', collectionName: "(What's the Story) Morning Glory?", trackTimeMillis: 258000 }] }) : down();
    const on = await C.Lookup.search('wonderwall', {});
    ok('online search: the studio original is listed before the live cut', on.online.length === 2 && String(on.online[0].trackId) === '2', on.online.map(r => r.title).join(' , '));
    net = down;
  } else { ok(`offline search: ${Q.length} queries`, false, 'no offline search: 0/' + Q.length + ' (every search needs the song service)'); }

  /* ---------- 5. vocals: lyrics and chords on one clock ---------- */
  // synced lines over the recording as LRCLIB gives them (seconds of the recording), against charts made with no network
  const L = [['Wonderwall', 'Oasis', 258, 87], ['Let It Be', 'The Beatles', 243, 72], ['Riptide', 'Vance Joy', 204, 102], ['Hotel California', 'Eagles', 391, 74], ['Zombie', 'The Cranberries', 306, 84],
    ['Creep', 'Radiohead', 238, 92], ['Stand By Me', 'Ben E. King', 180, 118], ['Someone Like You', 'Adele', 285, 67], ['Perfect', 'Ed Sheeran', 263, 63], ['Hey Jude', 'The Beatles', 431, 74],
    ['Imagine', 'John Lennon', 183, 76], ['Yellow', 'Coldplay', 269, 87]];
  let inside = 0, total = 0, onBeat = 0, charts = 0; const how = {};
  for (const [t, a, dur, bpm] of L) {
    // a line every two bars of the real song from 0:20 to 15 s before the end, starting on its bar lines
    const bar = 4 * 60 / bpm, ls = []; for (let x = Math.ceil(20 / bar) * bar; x < dur - 15; x += 2 * bar) ls.push({ t0: +x.toFixed(2), t1: +(x + 1.6 * bar).toFixed(2), text: 'la' });
    try {
      const r = await chart(track(t, a, dur, 950 + charts), { noPack: true }), m = C.Lyrics.fitMap(ls, r.ch, dur); m.nudge = 0; charts++;
      how[m.how || 'offset'] = (how[m.how || 'offset'] || 0) + 1;
      for (const l of ls) { const b0 = C.Lyrics.mapBeat(m, l.t0), b1 = C.Lyrics.mapBeat(m, l.t1); total++; if (b0 >= -0.5 && b1 <= r.ch.totalBeats + 0.5) inside++; if (Math.abs(b0 - Math.round(b0)) <= 0.25) onBeat++; }
    } catch (e) { total += ls.length; }
  }
  ok(`lyrics: every synced line lands inside the chart (${charts} songs, charts from the embedded transcriptions)`, inside === total && total > 0, `${inside}/${total} lines inside, ${onBeat}/${total} start within a quarter beat of a beat; maps ${JSON.stringify(how)}`);
  if (C.SONG_PACK) {
    const r = await chart(track('Wonderwall', 'Oasis', 258, 990)), ls = []; for (let x = 22.07; x < 240; x += 5.52) ls.push({ t0: x, t1: x + 4.5, text: 'la' });
    const m = C.Lyrics.fitMap(ls, r.ch, 258), cv = C.Lyrics.coverage(ls, m, r.ch);
    ok('lyrics on a starter-pack chart: all inside, on the beat', cv.inside === cv.lines && cv.onBeat >= cv.lines * 0.9, JSON.stringify(cv) + ' ' + m.how);
  }
  const pl = C.Lyrics.spreadPlain('one\ntwo\nthree\nfour\nfive\nsix', 200);
  { const r = await chart(track('Let It Be', 'The Beatles', 0, 991)), m = C.Lyrics.fitMap(pl, r.ch, 200); const b = pl.map(l => C.Lyrics.mapBeat(m, l.t1)); ok('unsynced lyrics on a chart with no recording length stay inside it', Math.max(...b) <= r.ch.totalBeats + 0.5 && C.Lyrics.mapBeat(m, pl[0].t0) >= -0.5, `last line ends at beat ${Math.max(...b).toFixed(0)} of ${r.ch.totalBeats}`); }

  console.log(lines.join('\n'));
  console.log(`\nsrc/: ${files.join(' ')}\n${pass} passed, ${fail} failed`);
  if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(lines, null, 1));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(lines.join('\n')); console.error(e); process.exit(2); });
