// Show (src/58-show.js): the gameplay core played by bots over every LIBRARY song, in plain Node.
//   node test/showtest.js            prints the tables and the checks; exit code 1 if a check fails
//   node test/showtest.js --songs    also prints one line per song (guitar, Normal)
// "before" numbers are the old game's guitar targets (one per chord change: compileSong events), same songs.
const fs = require('fs'), path = require('path');
const load = require('./lib/showcore'), { Show, LIBRARY, compileSong } = load(), { play, BOTS } = load;
const INSTS = ['guitar', 'bass', 'piano', 'drums', 'vocals'];
let fails = 0, checks = 0;
const check = (ok, msg, detail) => { checks++; if (!ok) fails++; console.log((ok ? '  ok    ' : '  FAIL  ') + msg + (detail ? '  [' + detail + ']' : '')); };
const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1), pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);
const charts = LIBRARY.map(s => compileSong(s));
const tracks = {};
const track = (ci, inst, diff) => tracks[ci + inst + diff] || (tracks[ci + inst + diff] = Show.build(charts[ci], { inst, difficulty: diff }));

/* ---------- 1. density ---------- */
console.log('\n== 1. Judged actions per minute (before = old guitar game, one target per chord change) ==');
console.log(pad('song', 34) + lpad('bpm', 4) + lpad('before', 8) + ' | guitar E/N/H        | bass N | piano N | drums N | vocals N');
const dens = { before: [], guitar: [], bass: [], piano: [], drums: [], vocals: [], easy: [], hard: [] };
charts.forEach((c, i) => {
  const dur = c.totalBeats * 60 / c.bpm, before = c.events.filter(e => !e.rest).length / dur * 60;
  const g = ['easy', 'normal', 'hard'].map(d => track(i, 'guitar', d).apm), o = ['bass', 'piano', 'drums', 'vocals'].map(n => track(i, n, 'normal').apm);
  dens.before.push(before); dens.guitar.push(g[1]); dens.easy.push(g[0]); dens.hard.push(g[2]); ['bass', 'piano', 'drums', 'vocals'].forEach((n, k) => dens[n].push(o[k]));
  console.log(pad(c.song.title.slice(0, 33), 34) + lpad(c.bpm, 4) + lpad(before.toFixed(1), 8) + ' | ' + pad(g.map(x => x.toFixed(0)).join(' / '), 19) + ' | ' + lpad(o[0].toFixed(0), 6) + ' | ' + lpad(o[1].toFixed(0), 7) + ' | ' + lpad(o[2].toFixed(0), 7) + ' | ' + lpad(o[3].toFixed(0), 8));
});
const rng = a => Math.min(...a).toFixed(1) + '-' + Math.max(...a).toFixed(1);
console.log(pad('ALL (mean, range)', 38) + lpad(avg(dens.before).toFixed(1), 8) + '   guitar N ' + avg(dens.guitar).toFixed(1) + ' (' + rng(dens.guitar) + ')');
check(Math.max(...dens.before) < 60, 'before: the old guitar game is under 60 actions/min on every song', 'mean ' + avg(dens.before).toFixed(1) + ', range ' + rng(dens.before));
for (const inst of ['guitar', 'bass', 'piano', 'drums']) check(dens[inst].every(x => x >= 60 && x <= 200), inst + ' Normal: 60-200 judged actions/min on all ' + charts.length + ' songs', rng(dens[inst]));
check(dens.vocals.every(x => x >= 60 && x <= 200), 'vocals Normal: 60-200 sung segments/min', rng(dens.vocals));
check(dens.easy.every((x, i) => x <= dens.guitar[i]) && dens.hard.every((x, i) => x >= dens.guitar[i]), 'guitar: Easy is never thicker than Normal, Hard is at least as thick', 'easy ' + rng(dens.easy) + ', hard ' + rng(dens.hard));
const kinds = {}; charts.forEach((c, i) => track(i, 'guitar', 'normal').targets.forEach(t => { kinds[t.kind] = (kinds[t.kind] || 0) + 1; if (t.dir === 'U') kinds.up = (kinds.up || 0) + 1; if (t.echo) kinds.echo = (kinds.echo || 0) + 1; if (t.finisher) kinds.finisher = (kinds.finisher || 0) + 1; }));
const hardKinds = {}; charts.forEach((c, i) => track(i, 'guitar', 'hard').targets.forEach(t => { hardKinds[t.kind] = (hardKinds[t.kind] || 0) + 1; }));
check(kinds.strum > 0 && kinds.gate > 0 && kinds.hold > 0 && kinds.up > 0 && kinds.echo > 0 && kinds.finisher === charts.length && hardKinds.mute > 0, 'guitar targets: strums, ups, chord gates, holds, echo bars, a finisher per song; mutes on Hard', JSON.stringify(kinds) + ' hard mutes ' + hardKinds.mute);
// windows never overlap the neighbour
let worst = 0, minW = 1e9, maxW = 0;
charts.forEach((c, i) => { for (const inst of ['guitar', 'drums']) for (const d of ['normal', 'hard']) { const T = track(i, inst, d), run = Show.start(T, { mode: 'mic' }), mpb = 60000 / T.bpm;
  const lanes = {}; T.targets.forEach((t, k) => { const L = inst === 'drums' ? t.lane : '*', p = lanes[L]; if (p != null && t.beat - T.targets[p].beat > 1e-6) worst = Math.max(worst, (run.windowMs(p) + run.windowMs(k)) / ((t.beat - T.targets[p].beat) * mpb)); lanes[L] = k; minW = Math.min(minW, run.windowMs(k)); maxW = Math.max(maxW, run.windowMs(k)); }); } });
check(worst <= 1.0001, 'timing windows of neighbouring targets never overlap (sum of windows / gap <= 1)', 'worst ' + worst.toFixed(2) + ', windows ' + minW.toFixed(0) + '-' + maxW.toFixed(0) + ' ms');

/* ---------- 2. bots over the library ---------- */
console.log('\n== 2. Bots over all ' + charts.length + ' LIBRARY songs, Normal, mic mode with chord checks (mashTap: tap mode) ==');
const R = {};       // R[inst][bot] = results[]
for (const inst of INSTS) { R[inst] = {}; for (const b of Object.keys(BOTS)) R[inst][b] = charts.map((c, i) => play(Show, track(i, inst, 'normal'), b).result); }
const hiShare = r => (r.levelBeats[3] + r.levelBeats[4]) / (r.levelBeats.reduce((a, b) => a + b, 0) || 1);
for (const inst of INSTS) {
  console.log('\n' + inst.toUpperCase());
  console.log(pad('bot', 13) + lpad('score', 7) + lpad('min', 7) + lpad('acc', 6) + lpad('stars', 6) + lpad('combo', 6) + lpad('hypeLv', 7) + lpad('minLv', 6) + lpad('lv3+%', 6) + lpad('encores', 8) + '  medals');
  for (const b of Object.keys(BOTS)) { const rs = R[inst][b], med = {}; rs.forEach(r => med[r.medal] = (med[r.medal] || 0) + 1);
    console.log(pad(b, 13) + lpad(Math.round(avg(rs.map(r => r.score))), 7) + lpad(Math.min(...rs.map(r => r.score)), 7) + lpad(avg(rs.map(r => r.accuracy)).toFixed(2), 6) + lpad(avg(rs.map(r => r.stars)).toFixed(1), 6) + lpad(Math.round(avg(rs.map(r => r.maxCombo))), 6)
      + lpad(avg(rs.map(r => r.levelMax)).toFixed(1), 7) + lpad(Math.min(...rs.map(r => r.levelMax)), 6) + lpad(Math.round(100 * avg(rs.map(hiShare))), 6) + lpad(avg(rs.map(r => r.encores)).toFixed(1), 8) + '  ' + ['perfect', 'superb', 'ok', 'tryagain'].filter(m => med[m]).map(m => m + ' ' + med[m]).join(', ')); }
}
if (process.argv.includes('--songs')) { console.log('\nguitar Normal, per song: decent / casual / beginner score (medal, max hype level)'); charts.forEach((c, i) => console.log('  ' + pad(c.song.title.slice(0, 33), 34) + ['decent', 'casual', 'beginner'].map(b => { const r = R.guitar[b][i]; return lpad(r.score, 6) + ' ' + pad(r.medal, 8) + ' L' + r.levelMax; }).join(' | '))); }

console.log('\nChecks:');
const playable = ['guitar', 'bass', 'piano', 'drums'];
for (const inst of INSTS) {
  const r = R[inst];
  check(r.perfect.every(x => x.score === 100000 && x.medal === 'perfect' && x.stars === 5), inst + ': a perfect run is 100,000, 5 stars, PERFECT medal on every song');
  check(r.idle.every(x => x.score === 0 && x.medal === 'tryagain' && x.levelMax === 0), inst + ': doing nothing scores 0, Try Again, hype never leaves 0');
  check(r.decent.every(x => x.levelMax >= 3), inst + ': a decent player reaches hype level 3+ on every song', 'min level ' + Math.min(...r.decent.map(x => x.levelMax)) + ', share of the song at 3+: ' + Math.round(100 * avg(r.decent.map(hiShare))) + '%');
  check(r.decent.filter(x => x.medal === 'superb' || x.medal === 'perfect').length >= charts.length - 2, inst + ': a decent player gets Superb (at most 2 songs lower)', r.decent.filter(x => x.medal === 'ok').length + ' OK');
  const sc = b => avg(r[b].map(x => x.score));
  check(sc('perfect') > sc('pro') && sc('pro') > sc('decent') && sc('decent') > sc('casual') && sc('casual') > sc('beginner') && sc('beginner') > sc('idle'), inst + ': score follows skill (perfect > pro > decent > casual > beginner > idle)',
    ['pro', 'decent', 'casual', 'beginner'].map(b => Math.round(sc(b))).join(' > '));
}
for (const inst of playable) {
  const r = R[inst];
  check(r.mashTap.every(x => x.medal === 'tryagain' && x.score < 5000 && x.maxCombo < 5 && x.levelMax === 0), inst + ': mashing in tap mode (10 hits/s) is not rewarded', 'max score ' + Math.max(...r.mashTap.map(x => x.score)) + ', max combo ' + Math.max(...r.mashTap.map(x => x.maxCombo)) + ', ghosts/song ' + Math.round(avg(r.mashTap.map(x => x.ghosts))));
  check(r.mashMic.every(x => x.medal === 'tryagain' && x.levelMax === 0 && x.stars === 0), inst + ': spraying 10 onsets/s at the mic is not rewarded', 'max score ' + Math.max(...r.mashMic.map(x => x.score)));
}
for (const inst of ['guitar', 'bass', 'piano']) check(R[inst].wrongchord.every(x => x.medal === 'tryagain' && x.score < 40000) && avg(R[inst].wrongchord.map(x => x.wrongs)) > 5, inst + ': perfect timing on the wrong chords is Try Again', 'score ' + Math.round(avg(R[inst].wrongchord.map(x => x.score))) + ', wrong spans/song ' + Math.round(avg(R[inst].wrongchord.map(x => x.wrongs))));
// comparable across instruments
{ let worstR = 0, where = '';
  for (const b of ['pro', 'decent', 'casual']) charts.forEach((c, i) => { const s = playable.map(inst => R[inst][b][i].score), r = Math.max(...s) / Math.min(...s); if (r > worstR) { worstR = r; where = b + ' on ' + c.song.title + ' ' + s.join('/'); } });
  const means = b => playable.map(inst => Math.round(avg(R[inst][b].map(x => x.score))));
  check(Math.max(...means('decent')) / Math.min(...means('decent')) < 1.12, 'scores are on one scale: the same decent bot averages within 12% on guitar/bass/piano/drums', means('decent').join(' / '));
  check(worstR < 1.45, 'worst single-song spread between instruments for the same bot stays under 1.45x', worstR.toFixed(2) + 'x: ' + where); }
// latency
{ const g = R.guitar, b = R.bass;
  check(b.late180.every(x => x.levelMax >= 2), 'bass: every hit 180 ms late still builds hype (old game: stuck at "Warming up")', 'min level ' + Math.min(...b.late180.map(x => x.levelMax)) + ', reported offset ' + Math.round(avg(b.late180.map(x => x.offsetMs))) + ' ms');
  const plain = charts.map((c, i) => play(Show, track(i, 'guitar', 'normal'), Object.assign({ name: 'late120' }, BOTS.late120auto, { auto: false })).result);
  check(avg(g.late120auto.map(x => x.score)) > avg(plain.map(x => x.score)) + 15000 && g.late120auto.every(x => x.medal !== 'tryagain'), 'guitar: 120 ms of uncorrected latency is absorbed by the running offset',
    'fixed offset ' + Math.round(avg(plain.map(x => x.score))) + ' -> auto ' + Math.round(avg(g.late120auto.map(x => x.score))) + ', learned ' + Math.round(avg(g.late120auto.map(x => x.offsetMs))) + ' ms'); }

/* ---------- 3. scenarios ---------- */
console.log('\n== 3. Scenarios ==');
const sus = LIBRARY.findIndex(s => s.id === 'lib-susanna');
{ // strumming through is free with a mic (the old game dropped from 6/12 to 1/12 here)
  for (const d of ['easy', 'normal']) { const T = track(sus, 'guitar', d), a = play(Show, T, 'perfect').result, b = play(Show, T, Object.assign({ name: 'perfect' }, BOTS.perfect, { extraEvery: 0.5 })).result;
    check(b.score === a.score && b.medal === 'perfect' && b.extras > 20, 'Oh! Susanna ' + d + ', mic: strumming eighths all the way through costs nothing', 'targets only ' + a.score + ', with ' + b.extras + ' extra strums ' + b.score + ' (' + b.medal + ')'); }
  const T = track(sus, 'guitar', 'normal'), old = charts[sus].events.filter(e => !e.rest).length;
  check(T.judged > 5 * old, 'Oh! Susanna Normal: the song pattern D.DUD.DU is the chart', old + ' chord-change targets before -> ' + T.judged + ' judged strums, section pattern "' + T.sections[0].pattern + '"');
}
{ // instant timing verdict, chord verdict afterwards
  const T = track(1, 'guitar', 'normal'), ev = []; const run = Show.start(T, { mode: 'mic', on: e => ev.push(e) });
  const t0 = T.targets[0]; run.tick(t0.beat - 1); const n0 = ev.length; const v = run.onset(t0.beat + 0.01, {});
  const hit = ev.slice(n0).find(e => e.type === 'hit');
  check(v && v.grade === 'perfect' && hit && hit.pts > 0, 'a strum is judged inside the onset() call (timing verdict + points, no waiting for the chord)', 'grade ' + (v && v.grade) + ', +' + (hit && hit.pts));
  run.tick(t0.beat + 0.5); const s1 = run.state().score; const verdict = run.chordResult(t0.span, { ok: true });
  const lock = ev.find(e => e.type === 'lock');
  check(verdict === 'lock' && lock && lock.pts > 0 && run.state().score > s1, 'the chord verdict arrives later as its own event and adds the "locked in" bonus', 'lock +' + (lock && lock.pts));
  const t1 = T.targets.find(t => t.span !== t0.span); run.tick(t1.beat); run.onset(t1.beat, {}); const s2 = run.state().score; run.chordResult(t1.span, { ok: false, frac: 0.1 });
  check(ev.some(e => e.type === 'wrong') && run.state().score < s2 && run.state().combo === 0, 'a wrong chord downgrades the strums of that span and breaks the combo', s2 + ' -> ' + run.state().score);
}
{ // forgiving by default, real stakes on request
  const out = [];
  for (const inst of INSTS) { const ts = charts.map((c, i) => { const T = track(i, inst, 'normal'), r = play(Show, T, 'idle', { fail: 'boo' }).result; return r.failed ? (r.failBeat - T.targets[0].beat) * 60 / T.bpm : Infinity; }); out.push(inst + ' ' + Math.min(...ts).toFixed(1) + '-' + Math.max(...ts).toFixed(1) + ' s');
    check(ts.every(t => t >= 6 && t <= 13), inst + ' with fail:"boo": an idle player is booed off 6-13 s after the first target on every song', out[out.length - 1]); }
  const dec = playable.flatMap(inst => charts.map((c, i) => play(Show, track(i, inst, 'normal'), 'decent', { fail: 'boo' }).result)), beg = playable.flatMap(inst => charts.map((c, i) => play(Show, track(i, inst, 'normal'), 'casual', { fail: 'boo' }).result));
  check(dec.every(r => !r.failed) && beg.every(r => !r.failed), 'fail:"boo" never ends a decent or casual run', dec.length + beg.length + ' runs');
  check(R.guitar.idle.every(r => !r.failed), 'default (fail:"never"): nobody is ejected mid-song, the medal decides');
}
{ // determinism, JSON-safe tracks, chartModel input
  const T = track(7, 'guitar', 'hard'), a = play(Show, T, 'casual').result, b = play(Show, JSON.parse(JSON.stringify(T)), 'casual').result;
  check(JSON.stringify(a) === JSON.stringify(b), 'same track + same inputs = identical result, and a track survives JSON round-trip');
  const c = charts[1], B = c.beats;
  const model = { v: 2, id: 'm', title: 'm', bpm: c.bpm, time: '4/4', beatsPerBar: B, stepsPerBeat: 4, feel: 'straight', style: 'rock', totalBars: c.totalBars, totalBeats: c.totalBeats,
    sections: c.sections.map((s, si) => ({ index: si, name: s.name, type: si ? 'chorus' : 'verse', intensity: si ? 3 : 1, startBar: s.startBar, barCount: s.bars,
      strum: { id: 'x', pattern: 'D.DU.UDU', hits: [[0, 'D'], [1, 'D'], [1.5, 'U'], [2.5, 'U'], [3, 'D'], [3.5, 'U']].map(([beat, dir]) => ({ beat, dir, accent: beat === 0 })) },
      bars: Array.from({ length: s.bars }, (_, bi) => ({ index: s.startBar + bi, chords: c.events.filter(e => e.beat < (s.startBar + bi + 1) * B && e.beat + e.len > (s.startBar + bi) * B).map(e => ({ name: e.label, sounds: e.sounds, beat: Math.max(0, e.beat - (s.startBar + bi) * B), len: Math.min(e.beat + e.len, (s.startBar + bi + 1) * B) - Math.max(e.beat, (s.startBar + bi) * B) })) })) })) };
  const M = Show.build(model, { inst: 'guitar' });
  check(M.targets.length > 80 && M.sections[0].pattern === '0D 1D 1.5U 2.5U 3D 3.5U' && play(Show, M, 'perfect').result.score === 100000, 'a chartModel v2 chart (charting track) with per-section strum hits builds and plays', M.judged + ' targets, pattern "' + M.sections[0].pattern + '"');
}

/* ---------- 4. microgames + gauntlet ---------- */
console.log('\n== 4. Microgames and the gauntlet ==');
console.log(pad('game', 10) + pad('command', 11) + lpad('beats', 6) + lpad('targets', 8) + '  perfect / decent / idle / masher(tap) / strum-through');
for (const id of Object.keys(Show.MICROS)) {
  const T = Show.micro(id, { bpm: 96, chords: ['G', 'C', 'D'] });
  const p = play(Show, T, 'perfect').result, d = play(Show, T, 'decent').result, i = play(Show, T, 'idle').result, m = play(Show, T, 'mashTap').result;
  const thru = play(Show, T, { name: 'thru', mode: 'tap', idle: true, mash: 60000 / 96 / 2 }).result;      // a tap on every half-beat, whatever is asked
  const f = r => (r.passed ? 'pass' : 'FAIL') + ' ' + Math.round(r.accuracy * 100) + '%';
  console.log(pad(id, 10) + pad(T.micro.cmd, 11) + lpad(T.micro.beats, 6) + lpad(T.judged, 8) + '  ' + [p, d, i, m, thru].map(f).join(' / '));
  check(p.passed && p.medal === 'perfect' && !i.passed && !m.passed && T.micro.beats >= 4 && T.micro.beats <= 8 && T.commands[0].word === T.micro.cmd, id + ': perfect passes, idle and masher fail, 4-8 beats, one command word');
  if (['stop', 'one', 'hold', 'offbeat'].includes(id)) check(!thru.passed, id + ': playing on every half-beat regardless (tap) does not pass clean', f(thru));
}
check(Show.LESSONS.every(l => l.micros.every(id => Show.MICROS[id])) && Show.LESSONS.length >= 4, 'lessons: ' + Show.LESSONS.map(l => l.title + ' (' + l.micros.join(', ') + ')').join('; '));
for (const inst of ['bass', 'piano', 'drums']) check(Object.keys(Show.MICROS).every(id => play(Show, Show.micro(id, { inst }), 'perfect').result.passed), 'every microgame also builds and passes on ' + inst);
{
  const mk = () => Show.gauntlet({ seed: 7, bpm: 90, lives: 4, chords: ['G', 'C', 'D', 'Em'], boss: [charts[7], charts[6]], bossEvery: 8 });
  const runG = (bot, max) => { const g = mk(), log = []; for (let k = 0; k < max && !g.state.over; k++) { const n = g.next(), r = play(Show, n.track, bot, { seed: k }).result, rep = g.report(r); log.push(n.kind[0] + ':' + n.id + '@' + n.bpm + (rep.passed ? '+' : '-') + (rep.speedUp ? '^' : '')); } return { g, log }; };
  const a = runG('perfect', 24), b = runG('perfect', 24), i = runG('idle', 24), d = runG('decent', 24), c = runG('beginner', 40);
  console.log('  perfect bot: ' + a.log.join(' '));
  check(a.log.join() === b.log.join(), 'gauntlet: same seed = same sequence');
  check(a.g.state.lives === 4 && a.g.state.round === 24 && a.g.state.speed > 1.55 && a.g.state.bosses === 3 && a.g.state.streak === 24, 'gauntlet: a perfect player clears 24 rounds, 6 speed-ups, 3 bosses, no life lost', 'speed x' + a.g.state.speed.toFixed(2) + ', score ' + a.g.state.score);
  check(i.g.state.over && i.g.state.round === 4 && i.g.state.score === 0, 'gauntlet: an idle player is out after 4 games', 'rounds ' + i.g.state.round);
  check(d.g.state.round >= 16 && d.g.state.score > 0.6 * a.g.state.score * d.g.state.round / 24, 'gauntlet: a decent player gets deep', 'rounds ' + d.g.state.round + ', lives ' + d.g.state.lives + ', score ' + d.g.state.score);
  check(c.g.state.over && c.g.state.round < 40, 'gauntlet: a beginner runs out of lives as it speeds up', 'out at round ' + c.g.state.round + ', speed x' + c.g.state.speed.toFixed(2));
}

/* ---------- 5. the core is engine-agnostic ---------- */
{ const src = fs.readFileSync(path.join(__dirname, '..', 'src', '58-show.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const bad = src.match(/\b(document|window|navigator|setTimeout|setInterval|requestAnimationFrame|Date|Math\.random|AudioContext|AudioEngine|Groove|Mic|THREE|localStorage|performance)\b/g);
  check(!bad, '58-show.js touches no DOM, audio, timers, clock or random source', bad ? [...new Set(bad)].join(',') : 'none found'); }

console.log('\n' + (checks - fails) + ' / ' + checks + ' checks passed');
process.exit(fails ? 1 : 0);
