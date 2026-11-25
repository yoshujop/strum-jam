// Loads the gameplay core (theory, songs, Show) into a plain Node context: no browser, no audio.
//   const load = require('./lib/showcore'); const { Show, LIBRARY, compileSong } = load();   SRC=<dir>: another copy of src/
//   load.play(Show, track, 'decent')  plays a track with a bot player (load.BOTS) at 60 ticks a second
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = function load(opts){
  opts = opts || {};
  const src = opts.src || process.env.SRC || path.join(__dirname, '..', '..', 'src');
  const files = ['10-theory.js', '20-songs.js', '21-arrange.js', '58-show.js'].filter(f => fs.existsSync(path.join(src, f)));
  const mem = {};
  const ctx = vm.createContext({ console, TextEncoder, TextDecoder, atob, btoa, Store: { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } } });
  const names = ['Show', 'LIBRARY', 'compileSong', 'chartModel', 'validateSong'];
  vm.runInContext(files.map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('\n') + '\n;globalThis.__api = {' + names.map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(',') + '};', ctx, { filename: 'show-core.js' });
  return ctx.__api;
};

// ---- bot players ----
function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s){ let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// sd: timing jitter (ms, gaussian); miss: targets skipped; chord: chance the chord check says ok; pitch: share of sung
// frames in tune; bias: constant lateness (ms); mash: a hit every N ms whatever the chart says
const BOTS = {
  perfect:     { sd: 0, miss: 0, chord: 1, pitch: 1 },
  pro:         { sd: 15, miss: 0.01, chord: 0.99, pitch: 0.95 },
  decent:      { sd: 35, miss: 0.04, chord: 0.95, pitch: 0.8 },
  casual:      { sd: 60, miss: 0.10, chord: 0.88, pitch: 0.62 },
  beginner:    { sd: 90, miss: 0.22, chord: 0.75, pitch: 0.42 },
  late180:     { sd: 10, miss: 0, chord: 1, pitch: 1, bias: 180 },
  late120auto: { sd: 10, miss: 0, chord: 1, pitch: 1, bias: 120, auto: true },
  wrongchord:  { sd: 0, miss: 0, chord: 0, pitch: 0 },
  idle:        { idle: true, pitch: 0 },
  mashTap:     { mode: 'tap', mash: 100, idle: true, pitch: 0 },
  mashMic:     { mash: 100, mashJit: 40, idle: true, chord: 0, pitch: 0 },
};
// Returns { result, events, run }. o: { mode, fail, autoEncore, verify, seed, lagMs }
function play(Show, track, bot, o){
  o = o || {};
  if (typeof bot === 'string') bot = Object.assign({ name: bot }, BOTS[bot]);
  const R = rng(hash((track.id || '') + '|' + track.inst + '|' + track.difficulty + '|' + (bot.name || '') + '|' + (o.seed || 0)));
  const gauss = () => { let u = 0; while (!u) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
  const mpb = 60000 / track.bpm, mode = bot.mode || o.mode || 'mic', lanes = track.lanes;
  const all = [];
  const run = Show.start(track, { mode, fail: o.fail, autoEncore: o.autoEncore !== false, autoLatency: o.autoLatency != null ? o.autoLatency : !!bot.auto, verify: o.verify, on: e => all.push(e) });
  const ons = [];
  if (!bot.idle) for (const t of track.targets) {
    if (t.kind === 'rest' || t.kind === 'sing') continue;
    if (R() < bot.miss) continue;
    ons.push({ b: t.beat + ((bot.bias || 0) + gauss() * bot.sd) / mpb, o: { lane: lanes.length > 1 ? t.lane : undefined, dir: t.dir && t.dir !== 'X' ? t.dir : undefined } });
  }
  if (bot.mash) for (let ms = track.startBeat * mpb; ms < track.endBeat * mpb; ms += bot.mash) {
    const b = (ms + (bot.mashJit ? (R() - 0.5) * 2 * bot.mashJit : 0)) / mpb;
    if (lanes.length > 1) for (const lane of lanes) ons.push({ b, o: { lane } }); else ons.push({ b, o: {} });
  }
  // extra strums between the targets (a guitarist keeping the hand moving): every `extraEvery` beats
  if (bot.extraEvery) for (let b = track.startBeat; b < track.endBeat - 1; b += bot.extraEvery) if (!track.targets.some(t => Math.abs(t.beat - b) < 0.2 || (t.kind === 'hold' && b > t.beat && b < t.beat + t.len))) ons.push({ b: b + gauss() * 10 / mpb, o: {} });
  ons.sort((a, b) => a.b - b.b);
  const lagB = (o.lagMs != null ? o.lagMs : mode === 'mic' ? 60 : 0) / mpb;        // the host hears about a mic onset a little late
  const due = []; let oi = 0, seen = 0;
  const step = (1 / 60) * track.bpm / 60, end = track.endBeat + 6;
  for (let beat = track.startBeat - 2; beat < end && !run.done; beat += step) {
    while (oi < ons.length && ons[oi].b + lagB <= beat) { run.onset(ons[oi].b, Object.assign({ src: mode }, ons[oi].o)); oi++; }
    if (lanes[0] === 'vox') run.level(beat, { ok: R() < (bot.pitch || 0) });
    for (; seen < all.length; seen++) if (all[seen].type === 'span') due.push({ at: all[seen].at + Math.min(all[seen].len, 900 / mpb) + 300 / mpb, id: all[seen].span, ok: R() < (bot.chord == null ? 1 : bot.chord) });
    for (let k = due.length - 1; k >= 0; k--) if (due[k].at <= beat) { run.chordResult(due[k].id, { ok: due[k].ok, frac: due[k].ok ? 1 : 0.1 }); due.splice(k, 1); }
    run.tick(beat);
  }
  return { result: run.result, events: all, run };
}
module.exports.BOTS = BOTS; module.exports.play = play; module.exports.rng = rng;
