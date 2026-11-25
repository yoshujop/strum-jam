/* =====================================================================
   Show: the rhythm-show gameplay core ("rhythm show + microgames")
   =====================================================================
   Pure and deterministic: no DOM, no audio, no three.js, no timers, no Date/Math.random (the gauntlet has its own
   seeded generator). Plain data in, plain data out, so it ports to iOS / Roblox as is. The host owns the clock, the
   microphone and the screen (see 59-showhost.js); this file owns what is asked of the player and how it is judged.
   Nothing runs at load. 60-game.js (the old game) does not use it.

   TIME is measured in song BEATS (float; beat 0 = first beat of bar 0, negative during a count-in). Windows are defined
   in milliseconds and converted with the track's bpm, so they are the same real-time size at every tempo, and they
   shrink (never below a floor) when targets are close together: a window is at most 45% of the gap to the next target,
   so a strum can never be captured by the neighbour's window (the bug that punished strumming in the old game).

   1. BUILD        track = Show.build(chart, { inst, difficulty, mods, fromBar, toBar, bpm, swing, drums, vocal })
        chart       compileSong() output (20-songs.js) or chartModel() v2 (charting track). Strum patterns come from, in
                    order: section.strum.hits (chartModel), strumPattern(section.strum id) when that global exists,
                    song.strum (legacy one-bar string), the built-in Show.PATTERNS style library.
        inst        'guitar' (default) | 'bass' | 'piano' | 'drums' | 'vocals'
        difficulty  'easy' (changes + strong beats) | 'normal' (the song's main pattern) | 'hard' (full pattern, ups,
                    mutes, syncopation). Density is then fitted to a per-tier band (Normal: 60-200 judged actions/min).
        mods        { echo: true|false (call-and-response intro), holds: true|false (let-ring bar ending a section),
                      finisher: true|false (the last big strum) }
        drums       { k, s, h } one-bar step strings/arrays when the host has the band's groove (buildPattern(chart))
        vocal       [{ beat, len, m, text }] sung phrases from the host (Lyrics); else one phrase per chord bar
      track (JSON-safe):
        { v, id, title, inst, difficulty, bpm, beatsPerBar, sub, swing, totalBars, startBeat, endBeat, durationSec,
          lanes: ['strum'] | ['bass'] | ['keys'] | ['kick','snare','hat'] | ['vox'],
          sections: [{ i, name, type, intensity 0-3, startBeat, endBeat, startBar, bars, pattern, first, last }],
          spans:    [{ id, chord, sounds, beat, len, sec, ref, first, last }]      // one chord, at most one bar: what the
                                                                                    // host verifies once (chordResult)
          targets:  [{ id, beat, lane, kind, dir, accent, w, sec, bar, span, chord, len, gate, echo, finisher, m, pc }],
          calls:    [{ beat, len, chord, hits: [{ beat, dir, accent }] }]          // bars the BAND plays (echo)
          commands: [{ beat, word, lead }],                                        // one-word commands for the view
          judged, apm (judged actions per minute), wsum, fmax, noEncore, micro? }
        target.kind: 'strum' | 'gate' (first strum of a new chord) | 'mute' (X chuck) | 'hold' (strum and let ring for
                     len beats) | 'rest' (stay silent on this beat) | 'note' (bass) | 'chord' (piano) | 'hit' (drums) |
                     'sing' (hold the pitch for len beats). dir: 'D' | 'U' | 'X' | null.

   2. RUN          run = Show.start(track, { mode, verify, latencyMs, inputLagMs, autoLatency, fail, autoEncore, on })
        mode        'mic' (a real instrument: extra strums are free, windows a little wider, chord checked afterwards)
                    | 'tap' (keys / touch / pads / MIDI: anti-mash rules, timing pays in full at once)
        verify      chord confirmation on (default: mic + guitar/piano/bass)
        fail        'never' (default: play to the end, medal decides) | 'boo' (crowd meter can end the run)
        on          optional function(event) called for every event as it happens (else read run.drain())
      Feed it:
        run.tick(beatNow)                              every frame; advances misses, sections, commands, the finish
        run.onset(beat, { dir, lane, src, vel, ok })   one strum / hit / key, at the beat it HAPPENED (the core subtracts
                                                       latencyMs); judged at once -> 'hit' | 'extra' | 'ghost'
        run.chordResult(spanId, { ok, frac, unsure })  the after-the-fact chord verdict -> 'lock' | 'buzz' | 'wrong'
        run.level(beat, { lane, ok })                  a pitch/level sample for 'sing' targets (ok: bool or 0..1)
        run.encore(beat)                               the player fires the Encore (true if it started)
        run.state()                                    { beat, score, combo, mult, hype, level, danger, crowd, encore,
                                                         encoreReady, encoreActive, accuracy, section, done }
        run.drain()                                    events since the last drain
      Show.tick / onset / chordResult / level / encore / state / drain act on the last started run (Show.run).

   3. EVENTS       { type, beat, ... }
        start {track}  sectionStart {section}  sectionEnd {section, accuracy, medal}  command {word, at}
        call {call}  span {span}  hit {target, grade, ms, early, score, combo, mult, encore, upgrade}
        miss {target, reason}  held {target}  holdBreak {target}  extra {}  ghost {penalty}
        lock {span, chord}  buzz {span, chord}  wrong {span, chord}  combo {n}  comboBreak {n}  mult {x}
        levelUp / levelDown {level, name}  encoreReady  encoreStart {until}  encoreEnd  finisher {grade, encore}
        fail {}  finish {result}
      result: { id, inst, difficulty, mode, score (0..100000 on every instrument), accuracy, medal ('tryagain' | 'ok' |
        'superb' | 'perfect'), stars 0-5, counts {perfect, great, good, ok, sloppy, miss}, judged, hits, ghosts, extras,
        maxCombo, maxMult, hypeMax, levelMax, levelBeats[5], encores, finisher, locks, buzzes, wrongs, offsetMs (median
        timing error of the hits: feed it back as latency), sections [{name, accuracy, medal}], chords {name: {n, ok,
        wrong}}, failed, passed (microgames), durationSec, apm }

   4. MICROGAMES   Show.MICROS (data), Show.micro(id, { bpm, chords, inst, difficulty }) -> a 4-8 beat track with one
                   command word; Show.gauntlet({ seed, lives, bpm, chords, pool, speedEvery, speedUp, bossEvery, boss })
                   -> { state, next(), report(result) }; Show.LESSONS (the same games ordered as a course).
   ===================================================================== */
const Show = (() => {
  const EPS = 1e-6;
  const GV = { perfect: 1, great: 0.85, good: 0.6, ok: 0.35, sloppy: 0.1, miss: 0 };
  const ORDER = ['perfect', 'great', 'good', 'ok'];
  const LEVELS = ['Warming up', 'Grooving', 'On a roll', 'On fire', 'LEGENDARY'];
  const LEVEL_AT = [0.18, 0.4, 0.62, 0.85];
  const WEIGHT = { strum: 1, gate: 1.5, mute: 1, hold: 2, rest: 2, note: 1, chord: 1, hit: 1, sing: 1 };
  const MEDAL_AT = { superb: 0.8, ok: 0.55 };
  const STARS_AT = [30000, 50000, 65000, 78000, 90000];
  const DENSITY = { easy: [36, 110], normal: [60, 200], hard: [80, 300] };          // judged actions per minute
  const TIERS = ['easy', 'normal', 'hard'];

  /* ---- strum pattern library: one bar per string; D down, U up, B bass note (a light down), X muted chuck, . nothing.
          [easy, normal, hard] per metre and style; '_' is the metre's default. ---- */
  const PATTERNS = {
    '4/4': { _: ['D...D...', 'D.D.D.DU', 'D.DU.UDU'], rock: ['D...D...', 'D.D.D.DU', 'D.DU.UDU'], pop: ['D...D...', 'D.DU.UDU', 'D.DUXUDU'],
      ballad: ['D.......', 'D...D.DU', 'D.DU.UDU'], halftime: ['D.......', 'D...D.D.', 'D..UD.DU'], funk: ['D...D...', 'D.DUX.DU', 'D..DX.DU.UD.X.DU'],
      disco: ['D...D...', 'D.DUD.DU', 'D.XUD.XU'], shuffle: ['D...D...', 'D.DUD.DU', 'D.DUDUDU'], country: ['B...B...', 'B.D.B.DU', 'B.DUB.DU'],
      reggae: ['..D...D.', 'X.D.X.D.', 'X.DUX.DU'], punk: ['D.D.D.D.', 'D.D.D.D.', 'DDDDDDDD'], hiphop: ['D...D...', 'D..UX.D.', 'D..UX.DU'],
      metal: ['D.D.D.D.', 'D.D.D.D.', 'DXDXD.DU'], folk: ['B...B...', 'B.DUB.DU', 'B.DUBUDU'], bossa: ['D...D...', 'D..D..D.', 'D.UD.UD.'],
      edm: ['D...D...', 'D.D.D.D.', 'D.DUD.DU'] },
    '3/4': { _: ['D.....', 'D.D.D.', 'D.DUDU'], waltz: ['B.....', 'B.D.D.', 'B.DUDU'], folk: ['D.....', 'D.DUD.', 'D.DUDU'] },
    '2/4': { _: ['D...', 'D.DU', 'DUDU'] },
    '2/3': { _: ['D..D..', 'D.DD.D', 'DDUDDU'] },                                  // 6/8 (two dotted beats)
    '4/3': { _: ['D.....D.....', 'D..D.UD..D.U', 'D.UD.UD.UD.U'] },                // 12/8
  };
  const DRUMS = {
    '4/4': { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    '3/4': { k: 'x...........', s: '....x...x...', h: 'x.x.x.x.x.x.' },
    '2/4': { k: 'x...x...', s: '..x...x.', h: 'x.x.x.x.' },
    '2/3': { k: 'x.....', s: '...x..', h: 'xxxxxx' },
    '4/3': { k: 'x.....x.....', s: '...x.....x..', h: 'xxxxxxxxxxxx' },
  };
  const SEC_INT = { intro: 0, verse: 1, prechorus: 2, pre: 2, chorus: 3, refrain: 3, hook: 3, bridge: 1, solo: 2, interlude: 1, instrumental: 1, break: 0, outro: 1, coda: 1 };
  const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  const r6 = x => Math.round(x * 1e6) / 1e6;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const isInt = x => Math.abs(x - Math.round(x)) < EPS;
  function rootPc(name){
    const s = /\/([A-G])([#b]?)$/.exec(name || ''), m = s || /^([A-G])([#b]?)/.exec(name || '');
    return m ? (PCS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12 : null;
  }
  function secType(name){ const m = /^(intro|verse|pre[\s-]?chorus|chorus|refrain|hook|bridge|solo|interlude|instrumental|break|outro|coda)/i.exec(name || ''); return m ? m[1].toLowerCase().replace(/[\s-]/g, '').replace('prechorus', 'prechorus') : null; }

  /* ---- chart -> one internal shape (works for compileSong and chartModel v2) ---- */
  function norm(chart){
    if (!chart) throw new Error('Show.build: no chart');
    if (chart.beatsPerBar && chart.sections && chart.sections[0] && Array.isArray(chart.sections[0].bars) && typeof chart.sections[0].bars[0] === 'object') {
      const B = chart.beatsPerBar, events = [];
      chart.sections.forEach((s, si) => s.bars.forEach((bar, bi) => (bar.chords || []).forEach(c => {
        const beat = (s.startBar + bi) * B + c.beat, last = events[events.length - 1], rest = !c.name || !!c.rest;
        if (last && last.sec === si && last.name === (rest ? null : c.name) && Math.abs(last.beat + last.len - beat) < EPS) last.len += c.len;
        else events.push({ name: rest ? null : c.name, sounds: c.sounds || c.name, beat, len: c.len, sec: si, rest });
      })));
      return { id: chart.id, title: chart.title, bpm: chart.bpm, B, sub: chart.stepsPerBeat || 4, time: chart.time, swing: chart.feel === 'swing', style: chart.style || 'rock',
        strum: chart.strum, drums: chart.drums, totalBars: chart.totalBars, events,
        sections: chart.sections.map(s => ({ name: s.name, type: s.type, intensity: s.intensity, startBar: s.startBar, bars: s.barCount, strum: s.strum })) };
    }
    const s = chart.song || {};
    return { id: s.id, title: s.title, bpm: chart.bpm, B: chart.beats, sub: chart.sub, time: s.time, swing: !!chart.swing, style: s.style || 'rock', strum: s.strum, drums: s.drums,
      totalBars: chart.totalBars,
      events: chart.events.map((e, i) => ({ name: e.rest ? null : (e.label || e.name), sounds: e.sounds || e.label || e.name, beat: e.beat, len: e.len, sec: e.sec, rest: !!e.rest, ref: i })),
      sections: chart.sections.map((x, i) => ({ name: x.name, type: (s.sections && s.sections[i] || {}).type, strum: (s.sections && s.sections[i] || {}).strum, startBar: x.startBar, bars: x.bars })) };
  }

  /* ---- patterns ---- */
  function parsePattern(str, B){
    const n = str.length, out = [];
    for (let i = 0; i < n; i++) { const ch = str[i].toUpperCase(); if ('DUBX'.includes(ch)) { const b = r6(i * B / n); out.push({ b, dir: ch, accent: b === 0 ? 2 : isInt(b) ? 1 : 0 }); } }
    return out;
  }
  function hitsFrom(list){
    return list.map(h => { const d = String(h.dir || 'D')[0].toUpperCase(), b = r6(h.beat != null ? h.beat : h.b); return { b, dir: 'DUBX'.includes(d) ? d : 'D', accent: h.accent ? (b === 0 ? 2 : 1) : 0 }; });
  }
  // keep the judged rate inside [lo, hi] per minute: drop the weakest strokes, or fill the beat grid
  function fit(hits, B, sub, bpm, lo, hi){
    const rate = n => n * bpm / B;
    let h = hits.slice();
    const prio = x => (x.b === 0 ? 100 : 0) + (isInt(x.b) ? 50 : 0) + (x.dir === 'D' || x.dir === 'B' ? 10 : x.dir === 'X' ? 3 : 0) + (isInt(x.b * 2) ? 5 : 0) + x.accent;
    while (h.length > 1 && rate(h.length) > hi) { let k = 0; for (let i = 1; i < h.length; i++) if (prio(h[i]) <= prio(h[k])) k = i; h.splice(k, 1); }
    const has = b => h.some(x => Math.abs(x.b - b) < EPS);
    const grids = sub === 3 ? [[0], [2 / 3], [1 / 3]] : [[0], [0.5], [0.25, 0.75]];
    for (const g of grids) {
      if (rate(h.length) >= lo) break;
      const ks = [...Array(B).keys()].sort((x, y) => (x === (B >> 1) ? -1 : 0) - (y === (B >> 1) ? -1 : 0) || x - y);     // mid-bar first
      for (const k of ks) for (const f of g) { const b = r6(k + f); if (rate(h.length) < lo && !has(b) && rate(h.length + 1) <= hi) h.push({ b, dir: f === 0 ? 'D' : 'U', accent: f === 0 ? 1 : 0 }); }
    }
    return h.sort((a, b) => a.b - b.b);
  }
  function legacyOk(str, B, sub){ const n = (str || '').length; return /^[DUdu.xXbB]+$/.test(str || '') && n >= B && (n % B === 0) && [1, 2, 3, 4].includes(n / B) && (sub !== 3 || n / B === 3); }
  // the bar pattern a section asks for, before the inst-specific mapping
  function sectionHits(c, sec, tier, isLast){
    const B = c.B, ti = TIERS.indexOf(tier), key = B + '/' + (c.sub === 3 ? 3 : 4);
    let hits = null, src = '';
    if (sec.strum && typeof sec.strum === 'object' && Array.isArray(sec.strum.hits) && sec.strum.hits.length) { hits = hitsFrom(sec.strum.hits); src = 'chart'; }
    else if (typeof sec.strum === 'string' && typeof strumPattern === 'function' && c.time) {
      try { const p = strumPattern(sec.strum, c.time, sec.type, tier); if (p && Array.isArray(p.hits) && p.hits.length) { hits = hitsFrom(p.hits); src = 'chart'; } } catch (e) { hits = null; }
    }
    let level = ti;
    if (!hits) {
      // escalation: a quiet section (intro / break) plays one tier down; on Normal the chorus (or the last section of
      // a song with unnamed sections) lifts to the full pattern
      if (sec.intensity === 0) level = Math.max(0, ti - 1);
      if (legacyOk(c.strum, B, c.sub)) {
        const base = parsePattern(c.strum, B), n = c.strum.length;
        if (level === 0) hits = base.filter(h => h.dir !== 'U' && (h.b === 0 || (B % 2 === 0 && Math.abs(h.b - B / 2) < EPS)));
        else if (level === 1) hits = base;
        else { hits = base.slice(); if (n === 2 * B) for (let k = 0; k < B; k++) if (!hits.some(h => Math.abs(h.b - (k + 0.5)) < EPS)) hits.push({ b: k + 0.5, dir: 'U', accent: 0 }); hits.sort((a, b) => a.b - b.b); }
        if (!hits.length) hits = [{ b: 0, dir: 'D', accent: 2 }];
        src = 'song';
      } else {
        if (ti === 1 && (sec.intensity === 3 || (isLast && sec.typeless))) level = 2;
        const fam = PATTERNS[key];
        if (fam) hits = parsePattern((fam[c.style] || fam._)[level], B);
        else { hits = []; for (let k = 0; k < B; k++) { if (level > 0 || k === 0) hits.push({ b: k, dir: 'D', accent: k ? 1 : 2 }); if (level === 2 || (level === 1 && k === B - 1)) hits.push({ b: k + 0.5, dir: 'U', accent: 0 }); } }
        src = 'style';
      }
    }
    return { hits, src, level };
  }
  function swingOff(beat, c){
    if (!c.swingAmt || c.sub !== 4) return 0;
    const i = Math.round((beat - Math.floor(beat + EPS)) * 4) % 4;
    return [0, 0.0833, 0.1667, 0.0833][i] * c.swingAmt;
  }

  /* ---- build ---- */
  function build(chart, opts){
    opts = opts || {};
    const c = norm(chart), B = c.B, inst = opts.inst || 'guitar', tier = TIERS.includes(opts.difficulty) ? opts.difficulty : 'normal';
    const mods = Object.assign({ echo: true, holds: true, finisher: true }, opts.mods || {});
    c.bpm = opts.bpm || c.bpm || 100;
    c.swingAmt = opts.swing != null ? opts.swing : (c.swing ? 1 : c.style === 'hiphop' ? 0.4 : 0);
    const fromBar = clamp(opts.fromBar || 0, 0, c.totalBars - 1), toBar = clamp(opts.toBar || c.totalBars, fromBar + 1, c.totalBars);
    const lo = DENSITY[tier][0] * (tier === 'easy' ? 1 : 1.15), hi = DENSITY[tier][1] * 0.95;            // margin: holds, echo bars and gates move the song's average
    const typeless = c.sections.every(s => !(s.type || secType(s.name)));
    const sections = c.sections.map((s, i) => {
      const type = s.type || secType(s.name), n = c.sections.length;
      const intensity = s.intensity != null ? s.intensity : type && SEC_INT[type] != null ? SEC_INT[type] : (n > 1 && i >= n / 2 ? 2 : 1);
      return { i, name: s.name, type: type || null, intensity, typeless, strum: s.strum, startBar: s.startBar, bars: s.bars, startBeat: s.startBar * B, endBeat: (s.startBar + s.bars) * B, pattern: '', first: -1, last: -1 };
    }).filter(s => s.startBar < toBar && s.startBar + s.bars > fromBar);
    const lastSec = sections[sections.length - 1];
    const evs = c.events.filter(e => e.beat < toBar * B - EPS && e.beat + e.len > fromBar * B + EPS);
    const evAt = b => { for (const e of evs) if (e.beat <= b + EPS && b < e.beat + e.len - EPS) return e; return null; };
    const isChange = e => { if (e.rest) return false; const k = c.events.indexOf(e); for (let j = k - 1; j >= 0; j--) { const p = c.events[j]; if (p.rest) return true; return p.name !== e.name; } return true; };
    const T = { v: 1, id: c.id || '', title: c.title || '', inst, difficulty: tier, bpm: c.bpm, beatsPerBar: B, sub: c.sub, swing: c.swingAmt, totalBars: toBar - fromBar,
      startBeat: fromBar * B, endBeat: toBar * B, lanes: [], sections, spans: [], targets: [], calls: [], commands: [] };
    const spanKey = new Map();
    const spanFor = (e, bar) => {
      const k = c.events.indexOf(e) + ':' + bar; let sp = spanKey.get(k);
      if (!sp) { const b0 = Math.max(e.beat, bar * B), b1 = Math.min(e.beat + e.len, (bar + 1) * B); sp = { id: T.spans.length, chord: e.name, sounds: e.sounds, beat: r6(b0), len: r6(b1 - b0), sec: e.sec, ref: e.ref, first: -1, last: -1 }; T.spans.push(sp); spanKey.set(k, sp); }
      return sp.id;
    };
    const add = t => { T.targets.push(t); return t; };
    const cache = new Map();
    const patFor = sec => {
      let p = cache.get(sec.i);
      if (!p) {
        const sh = sectionHits(c, sec, inst === 'vocals' ? 'normal' : tier, sec === lastSec && sections.length > 1);
        let h = sh.hits;
        if (inst === 'piano') h = h.filter(x => x.dir !== 'X' && (tier === 'hard' || x.dir !== 'U'));
        if (inst === 'bass') { h = tier === 'hard' ? h.filter(x => x.dir !== 'X') : h.filter(x => isInt(x.b)); }
        if (!h.length) h = [{ b: 0, dir: 'D', accent: 2 }];
        h = fit(h, B, c.sub, c.bpm, lo, hi);
        p = { hits: h, src: sh.src }; cache.set(sec.i, p);
        sec.pattern = h.map(x => x.b + x.dir).join(' ');
      }
      return p;
    };
    const secOfBar = bar => sections.find(s => bar >= s.startBar && bar < s.startBar + s.bars);

    if (inst === 'drums') {
      const key = B + '/' + (c.sub === 3 ? 3 : 4), n = B * c.sub;
      const P = opts.drums || (c.drums && { k: c.drums.kick, s: c.drums.snare, h: c.drums.hat }) || DRUMS[key] || { k: 'x' + '.'.repeat(n - 1), s: '.'.repeat(n >> 1) + 'x' + '.'.repeat(n - (n >> 1) - 1), h: 'x.'.repeat(n).slice(0, n) };
      const on = (l, i) => { const v = l && l[i % l.length]; return typeof v === 'number' ? v > 0 : !!v && v !== '.' && v !== '-' && v !== ' '; };
      let steps = [];
      for (let i = 0; i < n; i++) {
        const onBeat = i % c.sub === 0;
        if (on(P.k, i) && (tier !== 'easy' || onBeat)) steps.push({ i, lane: 'kick', pr: 3 + (i === 0 ? 2 : 0) + (onBeat ? 1 : 0) });
        if (on(P.s, i) && (tier !== 'easy' || onBeat)) steps.push({ i, lane: 'snare', pr: 3 + (onBeat ? 1 : 0) });
        if (on(P.h, i) && tier !== 'easy' && (tier === 'hard' || onBeat)) steps.push({ i, lane: 'hat', pr: onBeat ? 1 : 0 });
      }
      if (!steps.length) steps = [{ i: 0, lane: 'kick', pr: 5 }];
      const rate = k => k * c.bpm / B;
      while (steps.length > 1 && rate(steps.length) > hi) { let k = 0; for (let j = 1; j < steps.length; j++) if (steps[j].pr <= steps[k].pr) k = j; steps.splice(k, 1); }
      for (let k = 0; k < B && rate(steps.length) < lo; k++) if (!steps.some(s => s.lane === 'hat' && s.i === k * c.sub)) steps.push({ i: k * c.sub, lane: 'hat', pr: 1 });
      steps.sort((a, b) => a.i - b.i);
      for (let bar = fromBar; bar < toBar; bar++) { const sec = secOfBar(bar); for (const s of steps) { const b = bar * B + s.i / c.sub; add({ beat: r6(b + swingOff(b, c)), lane: s.lane, kind: 'hit', dir: null, accent: s.i === 0 ? 2 : 0, sec: sec ? sec.i : 0, bar }); } }
      sections.forEach(s => { s.pattern = steps.map(x => x.i + x.lane[0]).join(' '); });
      if (mods.finisher) add({ beat: toBar * B, lane: 'kick', kind: 'hit', dir: null, accent: 2, sec: lastSec.i, bar: toBar, finisher: true });
      T.lanes = ['kick', 'snare', 'hat'];
    } else if (inst === 'vocals') {
      const seg = c.bpm >= 60 ? 1 : 1 / (c.sub === 3 ? 3 : 2);
      const phrases = Array.isArray(opts.vocal) && opts.vocal.length ? opts.vocal.filter(p => p.beat < toBar * B && p.beat + p.len > fromBar * B)
        : evs.filter(e => !e.rest).flatMap(e => {                                    // no lyrics: one phrase per bar of each chord
          const out = [], end = Math.min(e.beat + e.len, toBar * B);
          for (let b = Math.max(e.beat, fromBar * B); b < end - EPS;) { const nb = Math.min(end, (Math.floor(b / B + EPS) + 1) * B); out.push({ beat: b, len: nb - b, chord: e.name }); b = nb; }
          return out;
        });
      for (const p of phrases) for (let b = p.beat; b < p.beat + p.len - EPS; b += seg) {
        const bar = Math.floor(b / B + EPS), sec = secOfBar(bar);
        add({ beat: r6(b), lane: 'vox', kind: 'sing', dir: null, accent: b === p.beat ? 1 : 0, len: r6(Math.min(seg, p.beat + p.len - b)), sec: sec ? sec.i : 0, bar, m: p.m, chord: p.chord, text: b === p.beat ? p.text : undefined });
      }
      T.lanes = ['vox'];
    } else {
      const lane = inst === 'bass' ? 'bass' : inst === 'piano' ? 'keys' : 'strum';
      const altBass = ['country', 'folk', 'bossa', 'waltz', 'reggae'].includes(c.style), octBass = ['funk', 'disco', 'hiphop', 'edm'].includes(c.style);
      // call and response: the band plays bar 1, the player answers in bar 2 (same chord for both bars)
      const e0 = evAt(fromBar * B);
      const echoBar = mods.echo && tier !== 'easy' && toBar - fromBar >= 8 && e0 && !e0.rest && e0.beat + e0.len >= (fromBar + 2) * B - EPS ? fromBar : -1;
      for (let bar = fromBar; bar < toBar; bar++) {
        const sec = secOfBar(bar); if (!sec) continue;
        const b0 = bar * B, p = patFor(sec), eb = evAt(b0);
        if (bar === echoBar) {
          T.calls.push({ beat: b0, len: B, chord: eb.name, sounds: eb.sounds, hits: p.hits.map(h => ({ beat: r6(b0 + h.b + swingOff(b0 + h.b, c)), dir: h.dir === 'B' ? 'D' : h.dir, accent: h.accent })) });
          T.commands.push({ beat: b0, word: 'LISTEN!', lead: 1 }, { beat: b0 + B, word: 'ECHO!', lead: 1 });
          continue;
        }
        const lastOfSec = bar === sec.startBar + sec.bars - 1, single = eb && !eb.rest && eb.beat + eb.len >= b0 + B - EPS;
        if (mods.holds && lastOfSec && sec.bars >= 4 && single && bar !== toBar - 1 && bar !== echoBar + 1 && B >= 2) {
          add({ beat: r6(b0), lane, kind: 'hold', dir: 'D', accent: 2, len: B - 1, sec: sec.i, bar, span: spanFor(eb, bar), chord: eb.name, gate: Math.abs(eb.beat - b0) < EPS && isChange(eb) || undefined });
          T.commands.push({ beat: b0, word: 'HOLD!', lead: 1 });
          continue;
        }
        const barHits = p.hits.map(h => ({ b: b0 + h.b, dir: h.dir, accent: h.accent }));
        for (const e of evs) if (!e.rest && e.beat >= b0 - EPS && e.beat < b0 + B - EPS && isChange(e)) {       // a chord change is always a target
          const at = barHits.find(h => Math.abs(h.b - e.beat) < EPS);
          if (at) { at.gate = true; if (at.dir === 'U' || at.dir === 'X') at.dir = 'D'; } else barHits.push({ b: e.beat, dir: 'D', accent: 1, gate: true });
        }
        barHits.sort((a, b) => a.b - b.b);
        for (const h of barHits) {
          const e = evAt(h.b); if (!e || e.rest) continue;
          const t = { beat: r6(h.b + swingOff(h.b, c)), lane, kind: 'strum', dir: h.dir === 'B' ? 'D' : h.dir, accent: h.accent, sec: sec.i, bar, span: spanFor(e, bar), chord: e.name };
          if (h.dir === 'B') t.bassNote = true;
          if (bar === echoBar + 1 && echoBar >= 0) t.echo = true;
          if (inst === 'guitar') { if (h.dir === 'X') t.kind = 'mute'; if (h.gate) { t.kind = 'gate'; t.gate = true; } }
          else if (inst === 'piano') { t.kind = 'chord'; t.dir = null; if (h.gate) t.gate = true; }
          else {
            const root = rootPc(e.sounds || e.name), k = Math.round(h.b - e.beat);
            if (root == null) continue;
            const fifth = /dim|b5/.test(e.name || '') ? 6 : 7;
            const iv = !isInt(h.b - e.beat) ? (octBass ? 12 : 0) : altBass && k % 2 === 1 ? fifth : 0;
            t.kind = 'note'; t.dir = null; t.m = 28 + ((root - 4 + 12) % 12) + iv; t.pc = (t.m % 12 + 12) % 12; if (h.gate) t.gate = true;
          }
          add(t);
        }
      }
      if (mods.finisher) {
        let e = null; for (const x of evs) if (!x.rest) e = x;
        if (e) {
          const t = add({ beat: toBar * B, lane, kind: inst === 'guitar' ? 'hold' : inst === 'piano' ? 'chord' : 'note', dir: inst === 'guitar' ? 'D' : null, accent: 2, len: inst === 'guitar' ? Math.min(B, 4) : undefined,
            sec: lastSec.i, bar: toBar, chord: e.name, finisher: true });
          const sp = { id: T.spans.length, chord: e.name, sounds: e.sounds, beat: toBar * B, len: Math.min(B, 4), sec: lastSec.i, ref: e.ref, first: -1, last: -1 }; T.spans.push(sp); t.span = sp.id;
          if (inst === 'bass') { const root = rootPc(e.sounds || e.name) || 0; t.m = 28 + ((root - 4 + 12) % 12); t.pc = t.m % 12; }
          T.commands.push({ beat: toBar * B, word: 'FINISH!', lead: 2 });
        }
      }
      T.lanes = [lane];
    }
    return finalize(T);
  }
  function finalize(T){
    T.targets.sort((a, b) => a.beat - b.beat || (a.lane < b.lane ? -1 : a.lane > b.lane ? 1 : 0));
    T.spans.sort((a, b) => a.beat - b.beat);
    const remap = new Map(); T.spans.forEach((s, i) => { remap.set(s.id, i); s.id = i; s.first = -1; s.last = -1; });
    T.sections.forEach(s => { s.first = -1; s.last = -1; });
    let wsum = 0, fmax = 0, end = T.endBeat;
    T.targets.forEach((t, i) => {
      t.id = i;
      t.w = t.finisher ? 3 : (WEIGHT[t.kind] || 1) + (t.gate && t.kind !== 'gate' ? 0.5 : 0);
      if (t.span != null) { t.span = remap.get(t.span); const sp = T.spans[t.span]; if (sp.first < 0) sp.first = i; sp.last = i; }
      const sec = T.sections.find(s => s.i === t.sec); if (sec) { if (sec.first < 0) sec.first = i; sec.last = i; }
      wsum += t.w; fmax += t.w * (multOf(i + 1) - 1) / 3;
      end = Math.max(end, t.beat + (t.len || 0));
    });
    T.commands.sort((a, b) => a.beat - b.beat); T.calls.sort((a, b) => a.beat - b.beat);
    T.judged = T.targets.length; T.wsum = r6(wsum); T.fmax = r6(fmax);
    T.endBeat = r6(end + 1);
    T.durationSec = r6((T.endBeat - T.startBeat) * 60 / T.bpm);
    const playSec = (T.totalBars * T.beatsPerBar) * 60 / T.bpm;
    T.apm = playSec > 0 ? Math.round(T.judged / playSec * 600) / 10 : 0;
    T.noEncore = !!T.micro || playSec < 20;
    return T;
  }
  function multOf(combo){ return 1 + Math.min(3, Math.floor(combo / 10)); }

  /* ---- a run ---- */
  function start(track, opts){
    opts = opts || {};
    const T = track, N = T.targets.length, mode = opts.mode === 'tap' ? 'tap' : 'mic';
    const drums = T.inst === 'drums';
    const verify = opts.verify != null ? !!opts.verify : (mode === 'mic' && T.spans.length > 0 && !drums);
    const msPerBeat = 60000 / T.bpm;
    const P = mode === 'mic' ? { max: 220, perf: 90, floor: 55 } : { max: 180, perf: 60, floor: 35 };
    const lag = (opts.inputLagMs != null ? opts.inputLagMs : mode === 'mic' ? 350 : 0) / msPerBeat;
    const latency = (opts.latencyMs || 0) / msPerBeat;
    const autoLat = opts.autoLatency != null ? !!opts.autoLatency : mode === 'mic';
    // per-target window (ms): at most 45% of the gap to the nearest target in the lane
    const win = new Float64Array(N), gap = new Float64Array(N).fill(Infinity), byLane = {};
    T.targets.forEach((t, i) => { if (t.kind !== 'sing') (byLane[drums ? t.lane : '*'] || (byLane[drums ? t.lane : '*'] = [])).push(i); });
    for (const L in byLane) {
      const ix = byLane[L], beats = [...new Set(ix.map(i => T.targets[i].beat))];              // sorted: targets are
      const g = new Map(beats.map((b, k) => [b, Math.min(k ? b - beats[k - 1] : Infinity, k + 1 < beats.length ? beats[k + 1] - b : Infinity)]));
      for (const i of ix) gap[i] = g.get(T.targets[i].beat);
    }
    let maxWinB = 0;
    for (let i = 0; i < N; i++) { win[i] = clamp(0.45 * gap[i] * msPerBeat, 60, P.max); if (0.45 * gap[i] * msPerBeat < 60) win[i] = Math.max(25, 0.48 * gap[i] * msPerBeat); maxWinB = Math.max(maxWinB, win[i] / msPerBeat); }
    const gradeOf = (i, adMs) => { const W = win[i], p = clamp(0.42 * W, Math.min(P.floor, W * 0.6), P.perf); return adMs <= p ? 'perfect' : adMs <= 0.68 * W ? 'great' : adMs <= 0.86 * W ? 'good' : adMs <= W ? 'ok' : null; };

    const st = T.targets.map(() => ({ done: false, hit: false, g: 0, lf: 1, m: 1, enc: 0, d: 0, grade: null, n: 0, okN: 0, broken: 0 }));
    const ss = T.spans.map(() => ({ v: null, open: false }));
    const dtT = N ? T.durationSec / N : 1;                                         // seconds of song per judged action
    const gHype = dtT / clamp(0.45 * T.durationSec, 14, 40), gEnc = dtT / clamp(0.3 * T.durationSec, 12, 25), gDanger = dtT / 9;
    const encLen = Math.max(2 * T.beatsPerBar, 8, Math.ceil(6000 / msPerBeat / T.beatsPerBar) * T.beatsPerBar);
    const R = { track: T, mode, verify, beat: -Infinity, done: false, failed: false, result: null };
    let i0 = 0, A = 0, F = 0, E = 0, combo = 0, maxCombo = 0, mult = 1, maxMult = 1, hype = 0, hypeMax = 0, level = 0, levelMax = 0, danger = 0, enc = 0, encReady = false, encUntil = -Infinity, encores = 0;
    let started = false, secPos = -1, cmdPos = 0, callPos = 0, spanPos = 0, spanOpenPos = 0, lockUntil = -Infinity, autoOff = 0, finisher = null, lastLevelBeat = null, failBeat = null;
    const counts = { perfect: 0, great: 0, good: 0, ok: 0, sloppy: 0, miss: 0 }, levelBeats = [0, 0, 0, 0, 0], chords = {};
    let ghosts = 0, extras = 0, locks = 0, buzzes = 0, wrongs = 0, hitsN = 0;
    const recent = [], ghostBeats = [], offs = [], autoBuf = [];
    let q = [];
    const emit = (type, o) => { const e = Object.assign({ type, beat: r6(R.beat) }, o || {}); if (opts.on) opts.on(e); else q.push(e); return e; };

    const contrib = i => T.targets[i].w * st[i].g * st[i].lf;
    function score(){
      const acc = T.wsum ? A / T.wsum : 0, flow = T.fmax > 0 ? Math.min(1, F / T.fmax) : 0, en = Math.min(1, E / (0.1 * T.wsum || 1));
      let wa = 0.8, wf = 0.15, we = 0.05; if (!(T.fmax > 0)) { wa += wf; wf = 0; } if (T.noEncore) { wa += we; we = 0; }
      return Math.max(0, Math.round(100000 * (wa * acc + wf * flow + we * en)));
    }
    function setVal(i, g, lf){                                                      // change a target's worth, keep the sums right
      const s = st[i], old = contrib(i); s.g = g; s.lf = lf; const d = contrib(i) - old;
      A += d; F += d * (s.m - 1) / 3; E += d * s.enc;
    }
    function setLevel(){
      let L = level;
      while (L < 4 && hype >= LEVEL_AT[L]) L++;
      while (L > 0 && hype < LEVEL_AT[L - 1] - 0.05) L--;
      if (L !== level) { const up = L > level; level = L; levelMax = Math.max(levelMax, L); emit(up ? 'levelUp' : 'levelDown', { level: L, name: LEVELS[L] }); }
    }
    function addHype(d){ if (d < 0 && R.beat < encUntil) return; hype = clamp(hype + d, 0, 1); hypeMax = Math.max(hypeMax, hype); setLevel(); }
    function addDanger(d){
      danger = clamp(danger + d, 0, 1);
      if (opts.fail === 'boo' && danger >= 1 && !R.done) { R.failed = true; failBeat = R.beat; emit('fail', {}); finish(); }
    }
    function addEnc(d){
      if (T.noEncore || R.beat < encUntil) return;
      enc = clamp(enc + d, 0, 1);
      if (enc >= 1 && !encReady) { encReady = true; emit('encoreReady', {}); }
    }
    function breakCombo(){ if (combo >= 5) emit('comboBreak', { n: combo }); combo = 0; if (mult !== 1) { mult = 1; emit('mult', { x: 1 }); } }
    function fireEncore(b){
      if (!encReady || R.done) return false;
      encReady = false; enc = 0; encores++; encUntil = (b != null ? b : R.beat) + encLen;
      emit('encoreStart', { until: r6(encUntil) }); return true;
    }
    function sectionAcc(sec){
      if (sec.first < 0) return { accuracy: 0, medal: 'tryagain', n: 0 };
      let a = 0, w = 0, miss = 0;
      for (let i = sec.first; i <= sec.last; i++) if (T.targets[i].sec === sec.i) { const s = st[i]; a += T.targets[i].w * s.g * (s.lf === 0.6 ? 1 : s.lf); w += T.targets[i].w; if (s.done && !s.hit) miss++; }
      const acc = w ? a / w : 0;
      return { accuracy: Math.round(acc * 1000) / 1000, medal: medalOf(acc, miss === 0), n: sec.last - sec.first + 1 };
    }
    function medalOf(acc, clean){ return clean && acc >= MEDAL_AT.superb ? 'perfect' : acc >= MEDAL_AT.superb ? 'superb' : acc >= MEDAL_AT.ok ? 'ok' : 'tryagain'; }

    function applyHit(i, grade, dMs, o){
      const t = T.targets[i], s = st[i], sp = t.span != null ? ss[t.span] : null;
      s.hit = true; s.grade = grade; s.d = dMs;
      if (grade !== 'sloppy') { combo++; maxCombo = Math.max(maxCombo, combo); }
      const m = multOf(combo); if (m !== mult) { mult = m; maxMult = Math.max(maxMult, m); emit('mult', { x: m }); }
      s.m = mult; s.enc = R.beat < encUntil || (o && o.at < encUntil) ? 1 : 0;
      let lf = 1;
      if (o && o.ok === false) lf = 0.35;                                           // the host already knows it was the wrong note
      else if (verify && sp) lf = sp.v ? { pass: 1, lock: 1, buzz: 0.7, wrong: 0.35 }[sp.v] : 0.6;   // 60% now, the rest when the chord locks
      const before = score();
      const held = t.kind === 'hold' ? 0.5 : 1;                                     // a hold pays half on the strum, half for letting it ring
      setVal(i, GV[grade] * held, lf);
      if (t.kind !== 'hold' && t.kind !== 'sing') s.done = true;
      counts[grade]++; hitsN++;
      const k = { perfect: 1.25, great: 1, good: 0.55, ok: 0.15, sloppy: 0 }[grade];
      s.hy = gHype * k * (s.enc ? 1.5 : 1) * (lf === 0.6 ? 0.5 : lf === 0.35 ? 0 : 1);                 // with a chord check pending, half the hype waits for the lock
      addHype(s.hy); addDanger(-gDanger * 0.8 * k);
      s.en = gEnc * { perfect: 1.2, great: 1, good: 0.5, ok: 0, sloppy: 0 }[grade];
      if (lf === 0.35) s.en = 0;
      if (lf !== 0.6) addEnc(s.en);                                                 // pending chord: the Encore meter waits for the lock
      if (grade !== 'sloppy' && dMs != null) { offs.push(dMs); autoBuf.push(dMs); if (autoLat && autoBuf.length >= 8) { const md = median(autoBuf); if (Math.abs(md) > 8) autoOff = clamp(autoOff + clamp(md, -25, 25), -120, 120); autoBuf.length = 0; } }
      if (t.chord) { const c = chords[t.chord] || (chords[t.chord] = { n: 0, hit: 0, ok: 0, wrong: 0 }); c.hit++; }
      emit('hit', { target: t.id, lane: t.lane, kind: t.kind, dir: t.dir, grade, ms: dMs == null ? null : Math.round(dMs), early: dMs != null && dMs < 0, score: score(), pts: score() - before,
        combo, mult, encore: !!s.enc, span: t.span });
      if (combo && combo % 10 === 0 && grade !== 'sloppy') emit('combo', { n: combo });
      if (t.finisher) { if (encReady) fireEncore(t.beat); s.enc = R.beat < encUntil || s.enc ? 1 : 0; setVal(i, s.g, s.lf); finisher = grade; emit('finisher', { grade, encore: !!s.enc }); }
    }
    function miss(i, reason){
      const t = T.targets[i], s = st[i]; if (s.done) return;
      s.done = true;
      if (s.hit) return;
      counts.miss++; breakCombo(); addHype(-4 * gHype); addEnc(-0.5 * gEnc); addDanger(gDanger);
      emit('miss', { target: t.id, lane: t.lane, kind: t.kind, reason: reason || 'late' });
    }

    R.onset = function(beat, o){
      if (R.done) return null;
      o = o || {};
      const src = o.src || mode, tapLike = mode === 'tap' || (src !== 'mic' && src !== mode);
      const b = beat - latency - autoOff / msPerBeat;
      recent.push(b); while (recent.length && recent[0] < b - 1000 / msPerBeat) recent.shift();
      const laneOk = t => !o.lane || t.lane === o.lane;
      // silence targets: a sound inside the window breaks the rest
      let best = -1, bd = Infinity, up = -1, ud = Infinity;
      for (let j = Math.max(0, i0 - 8); j < N && T.targets[j].beat - maxWinB <= b; j++) {
        const t = T.targets[j], s = st[j]; if (!laneOk(t) || t.kind === 'sing') continue;
        const d = Math.abs(b - t.beat) * msPerBeat; if (d > win[j]) continue;
        if (t.kind === 'rest') { if (!s.done) { s.broken = 1; miss(j, 'rest'); } continue; }
        if (!s.hit && !s.done) { if (d < bd) { bd = d; best = j; } }
        else if (s.hit && !s.broken && s.grade !== 'perfect' && d < ud) { ud = d; up = j; }
      }
      if (best >= 0 && (tapLike || drums) && b < lockUntil) best = -1;                         // locked out after a stray tap
      if (best >= 0) {
        const t = T.targets[best], dMs = (b - t.beat) * msPerBeat;
        let grade = gradeOf(best, Math.abs(dMs));
        if (o.dir && (t.dir === 'D' || t.dir === 'U') && o.dir[0].toUpperCase() !== t.dir) grade = ORDER[Math.min(3, ORDER.indexOf(grade) + 1)];   // wrong stroke: one grade down
        if (!tapLike && !drums) {                                                   // spraying strums at a mic is not strumming
          let tn = 0; for (let j = Math.max(0, i0 - 16); j < N && T.targets[j].beat <= b; j++) if (T.targets[j].beat > b - 1000 / msPerBeat) tn++;
          if (recent.length >= 7 && recent.length >= 4 * tn + 2) grade = 'sloppy';
        }
        const group = [best];
        if (!o.lane && T.lanes.length > 1) for (let j = best + 1; j < N && Math.abs(T.targets[j].beat - t.beat) < EPS; j++) if (!st[j].hit && !st[j].done) group.push(j);   // one mic thump can be kick + hat
        for (const j of group) applyHit(j, grade, dMs, { ok: o.ok, at: b });
        return { target: best, grade, ms: dMs };
      }
      if (up >= 0 && !tapLike && !drums) {                                          // mic: a closer strum replaces the earlier one
        const t = T.targets[up], s = st[up], dMs = (b - t.beat) * msPerBeat, g = gradeOf(up, Math.abs(dMs));
        if (g && GV[g] > GV[s.grade] && ORDER.includes(s.grade)) {
          const before = score(); counts[s.grade]--; counts[g]++; s.grade = g; s.d = dMs; setVal(up, GV[g] * (t.kind === 'hold' ? 0.5 : 1) + (t.kind === 'hold' && s.done ? 0.5 : 0), s.lf);
          emit('hit', { target: t.id, lane: t.lane, kind: t.kind, dir: t.dir, grade: g, ms: Math.round(dMs), early: dMs < 0, score: score(), pts: score() - before, combo, mult, encore: !!s.enc, span: t.span, upgrade: true });
          return { target: up, grade: g, ms: dMs, upgrade: true };
        }
      }
      // a strum inside a hold (the chord should be ringing)
      for (let j = Math.max(0, i0 - 4); j < N && T.targets[j].beat <= b; j++) {
        const t = T.targets[j], s = st[j];
        if (t.kind === 'hold' && s.hit && !s.done && laneOk(t) && b > t.beat + win[j] / msPerBeat && b < t.beat + t.len - 0.1) { s.n++; if (!s.broken && (tapLike || s.n >= 2)) { s.broken = 1; emit('holdBreak', { target: t.id }); } }
      }
      if (!tapLike && !drums) { extras++; emit('extra', {}); return { extra: true }; }   // mic: extra strums are free
      // tap / pads / MIDI / drums: a stray hit
      ghosts++; lockUntil = b + 110 / msPerBeat;
      ghostBeats.push(b); while (ghostBeats.length && ghostBeats[0] < b - 1) ghostBeats.shift();
      const penalty = drums || T.difficulty !== 'easy' || ghostBeats.length >= 2;
      if (penalty) { breakCombo(); addHype(-1.5 * gHype); addDanger(0.5 * gDanger); }
      emit('ghost', { penalty });
      return { ghost: true, penalty };
    };

    R.chordResult = function(spanId, r){
      const sp = T.spans[spanId], x = ss[spanId]; if (!sp || !x || x.v || R.result) return null;
      r = r || {};
      const v = r.unsure ? 'pass' : r.ok || (r.ok == null && r.frac >= 0.6) ? 'lock' : (r.frac != null && r.frac >= 0.5 ? 'buzz' : 'wrong');
      x.v = v;
      if (!verify) return v;
      const lf = { pass: 1, lock: 1, buzz: 0.7, wrong: 0.35 }[v], before = score();
      let n = 0, hy = 0, en = 0;
      for (let i = sp.first; i >= 0 && i <= sp.last; i++) if (T.targets[i].span === spanId && st[i].hit) { setVal(i, st[i].g, lf); n++; hy += st[i].hy || 0; en += st[i].en || 0; }
      if (!n) return v;
      const c = chords[sp.chord] || (chords[sp.chord] = { n: 0, hit: 0, ok: 0, wrong: 0 }); c.n++;
      if (v === 'pass') { addHype(hy); addEnc(en); }
      else if (v === 'lock') { locks++; c.ok++; addHype(hy * 1.2); addEnc(en * 1.2); emit('lock', { span: spanId, chord: sp.chord, score: score(), pts: score() - before, n }); }
      else if (v === 'buzz') { buzzes++; emit('buzz', { span: spanId, chord: sp.chord, score: score(), pts: score() - before }); }
      else if (v === 'wrong') { wrongs++; c.wrong++; breakCombo(); addHype(-hy - 2 * gHype); addEnc(-gEnc * 2); addDanger(0.6 * gDanger * n); emit('wrong', { span: spanId, chord: sp.chord, score: score(), pts: score() - before }); }
      return v;
    };

    R.level = function(beat, o){
      if (R.done) return;
      const ok = o && o.ok === true ? 1 : o && typeof o.ok === 'number' ? clamp(o.ok, 0, 1) : 0, b = beat - latency;
      for (let j = i0; j < N && T.targets[j].beat <= b + EPS; j++) { const t = T.targets[j]; if (t.kind === 'sing' && !st[j].done && b < t.beat + t.len && (!o || !o.lane || o.lane === t.lane)) { st[j].n++; st[j].okN += ok; } }
    };
    R.encore = function(beat){ return fireEncore(beat); };

    R.tick = function(beat){
      if (R.done) return R;
      const prev = R.beat; R.beat = beat;
      if (!started) { started = true; emit('start', { track: T.id, inst: T.inst, difficulty: T.difficulty }); }
      if (prev > -Infinity && beat > prev && beat > T.startBeat) levelBeats[level] += beat - Math.max(prev, T.startBeat);
      while (cmdPos < T.commands.length && beat >= T.commands[cmdPos].beat - (T.commands[cmdPos].lead || 0)) { const c = T.commands[cmdPos++]; emit('command', { word: c.word, at: c.beat }); }
      while (callPos < T.calls.length && beat >= T.calls[callPos].beat - 1) emit('call', { call: T.calls[callPos++] });
      while (secPos + 1 < T.sections.length && beat >= T.sections[secPos + 1].startBeat - EPS) {
        if (secPos >= 0) endSection(secPos);
        secPos++; const s = T.sections[secPos];
        emit('sectionStart', { section: secPos, name: s.name, kind: s.type, intensity: s.intensity, pattern: s.pattern });
      }
      if (verify) while (spanOpenPos < T.spans.length && beat >= T.spans[spanOpenPos].beat - EPS) { const sp = T.spans[spanOpenPos++]; emit('span', { span: sp.id, chord: sp.chord, sounds: sp.sounds, at: sp.beat, len: sp.len, ref: sp.ref }); }
      // targets that ran out of time, holds and rests that completed, sung notes that ended
      for (let j = i0; j < N && T.targets[j].beat - maxWinB <= beat; j++) {
        const t = T.targets[j], s = st[j]; if (s.done) continue;
        const wB = win[j] / msPerBeat;
        if (t.kind === 'sing') {
          if (beat >= t.beat + t.len + lag) { const f = s.n ? s.okN / s.n : 0, g = f >= 0.85 ? 'perfect' : f >= 0.7 ? 'great' : f >= 0.5 ? 'good' : f >= 0.3 ? 'ok' : null; if (g) { applyHit(j, g, null); s.done = true; } else miss(j, 'pitch'); }
        } else if (t.kind === 'rest') {
          if (beat >= t.beat + wB + lag) { let p = j - 1; while (p >= 0 && (T.targets[p].kind === 'rest' || T.targets[p].lane !== t.lane)) p--; if (p < 0 || st[p].hit) applyHit(j, 'perfect', null); else miss(j, 'idle'); }
        } else if (t.kind === 'hold' && s.hit) {
          if (beat >= t.beat + t.len) { s.done = true; if (!s.broken) { setVal(j, s.g + 0.5, s.lf); emit('held', { target: t.id, score: score() }); } }
        } else if (beat > t.beat + wB + lag) miss(j, 'late');
      }
      while (i0 < N && st[i0].done) i0++;
      if (verify) {
        const to = 2000 / msPerBeat;
        while (spanPos < T.spans.length && (ss[spanPos].v || beat >= T.spans[spanPos].beat + T.spans[spanPos].len + to)) { if (!ss[spanPos].v) R.chordResult(spanPos, { unsure: true }); spanPos++; }
      }
      if (encUntil > -Infinity && beat >= encUntil) { encUntil = -Infinity; emit('encoreEnd', {}); }
      if (opts.autoEncore && encReady && prev > -Infinity && Math.floor(beat / T.beatsPerBar) !== Math.floor(prev / T.beatsPerBar)) fireEncore(beat);
      if (!R.done && beat >= T.endBeat && i0 >= N) finish();
      return R;
    };
    function endSection(k){
      const s = T.sections[k], a = sectionAcc(s);
      emit('sectionEnd', { section: k, name: s.name, accuracy: a.accuracy, medal: a.medal });
    }
    function median(a){ const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }
    function finish(){
      if (R.done) return;
      if (verify) for (let k = 0; k < T.spans.length; k++) if (!ss[k].v) R.chordResult(k, { unsure: true });
      for (let j = 0; j < N; j++) if (!st[j].done && !st[j].hit) { st[j].done = true; counts.miss++; }
      if (secPos >= 0 && !R.failed) endSection(secPos);
      R.done = true;
      const acc = T.wsum ? A / T.wsum : 0, sc = R.failed ? Math.round(score() * 0.5) : score();
      const clean = !R.failed && counts.miss === 0 && counts.sloppy === 0 && wrongs === 0 && hitsN > 0 && st.every(s => s.hit && !s.broken);
      const medal = R.failed ? 'tryagain' : medalOf(acc, clean);
      R.result = { id: T.id, inst: T.inst, difficulty: T.difficulty, mode, score: sc, maxScore: 100000, accuracy: Math.round(acc * 1000) / 1000, medal,
        stars: STARS_AT.filter(x => sc >= x).length, counts: Object.assign({}, counts), judged: N, hits: hitsN, ghosts, extras, maxCombo, maxMult,
        hypeMax: Math.round(hypeMax * 1000) / 1000, levelMax, levelBeats: levelBeats.map(r6), encores, finisher, locks, buzzes, wrongs,
        offsetMs: Math.round(median(offs) + autoOff), sections: T.sections.map(s => Object.assign({ name: s.name }, sectionAcc(s))), chords,
        failed: R.failed, failBeat: failBeat == null ? null : r6(failBeat), durationSec: T.durationSec, apm: T.apm };
      if (T.micro) R.result.passed = !R.failed && acc >= (T.micro.pass || 0.6);
      emit('finish', { result: R.result });
    }
    R.state = () => ({ beat: R.beat, score: score(), combo, mult, hype, level, levelName: LEVELS[level], danger, crowd: hype - danger, encore: enc, encoreReady: encReady, encoreActive: R.beat < encUntil,
      accuracy: T.wsum ? A / T.wsum : 0, section: secPos, done: R.done, offsetMs: Math.round(autoOff) });
    R.drain = () => { const e = q; q = []; return e; };
    R.windowMs = i => win[i];
    api.run = R;
    return R;
  }

  /* ---- microgames: 4-8 beat challenges with one command word (data) ----
     pat / call: one char per grid step (grid = steps per beat, default 2): D U X strums, H hold (then - while it rings),
     R rest (stay silent), . nothing. chord: same length, a digit switches to that chord of the set from that step.
     intro: beats before play (the command is shown, the band counts). pass: accuracy needed.                       */
  const MICROS = {
    strum:   { cmd: 'STRUM!', beats: 4, pat: 'D.D.D.D.', teach: 'Steady down-strums on the beat.' },
    downup:  { cmd: 'DOWN-UP!', beats: 4, pat: 'DUDUDUDU', teach: 'Keep the hand swinging: down on the beat, up in between.' },
    switch:  { cmd: 'SWITCH!', beats: 4, pat: 'D.D.D.D.', chord: '0...1...', chords: 2, teach: 'Change chord on beat 3 without stopping the hand.' },
    echo:    { cmd: 'ECHO!', beats: 8, call: 'D.D.DU.U', pat: '........D.D.DU.U', teach: 'Listen to the bar, then play it back.' },
    mute:    { cmd: 'MUTE!', beats: 4, pat: 'D.X.D.X.', teach: 'Strum, then chuck: relax the fretting hand and hit dead strings.' },
    hold:    { cmd: 'HOLD!', beats: 4, pat: 'H-----..', pass: 0.7, teach: 'One strum, then let every string ring.' },
    stop:    { cmd: 'STOP!', beats: 4, pat: 'D.D.D.R.', pass: 0.7, teach: 'Three strums, then silence on four: damp the strings.' },
    speedup: { cmd: 'SPEED UP!', beats: 8, pat: 'D.D.D.D.DUDUDUDU', teach: 'Same tempo, twice the strums.' },
    offbeat: { cmd: 'OFFBEAT!', beats: 4, pat: 'RURURURU', pass: 0.7, teach: 'Only the ups: miss the strings on the way down.' },
    one:     { cmd: 'ONE!', beats: 8, pat: 'D.R.R.R.D.R.R.R.', pass: 0.7, teach: 'Hit only beat one and wait for the next bar.' },
    pattern: { cmd: 'GROOVE!', beats: 8, pat: 'D.DU.UDUD.DU.UDU', teach: 'The strum behind a thousand songs: D, D-U, U-D-U.' },
    change:  { cmd: 'CHANGE!', beats: 8, pat: 'D.D.D.D.D.D.D.D.', chord: '0...1...2...0...', chords: 3, teach: 'A new chord every two beats.' },
  };
  const LESSONS = [
    { id: 'l1', title: 'Find the beat', micros: ['strum', 'one', 'stop'] },
    { id: 'l2', title: 'Down and up', micros: ['downup', 'offbeat', 'speedup'] },
    { id: 'l3', title: 'Changes', micros: ['switch', 'change', 'hold'] },
    { id: 'l4', title: 'The groove', micros: ['echo', 'mute', 'pattern'] },
  ];
  function micro(id, opts){
    opts = opts || {};
    const M = typeof id === 'string' ? MICROS[id] : id; if (!M) throw new Error('Show.micro: unknown game ' + id);
    const bpm = opts.bpm || 90, g = M.grid || 2, intro = opts.intro != null ? opts.intro : M.intro != null ? M.intro : 2, B = opts.beatsPerBar || 4;
    const set = (opts.chords && opts.chords.length ? opts.chords : ['G', 'C', 'D']), inst = opts.inst || 'guitar';
    const lane = inst === 'bass' ? 'bass' : inst === 'piano' ? 'keys' : inst === 'drums' ? 'snare' : 'strum';
    const T = { v: 1, id: 'micro-' + (typeof id === 'string' ? id : M.id || 'x'), title: M.cmd, inst, difficulty: opts.difficulty || 'normal', bpm, beatsPerBar: B, sub: 4, swing: 0, totalBars: (intro + M.beats) / B,
      startBeat: 0, endBeat: intro + M.beats, lanes: inst === 'drums' ? ['kick', 'snare', 'hat'] : [lane], spans: [], targets: [], calls: [], commands: [{ beat: 0, word: M.cmd, lead: 0 }],
      sections: [{ i: 0, name: M.cmd, type: 'micro', intensity: 2, startBeat: 0, endBeat: intro + M.beats, startBar: 0, bars: (intro + M.beats) / B, pattern: M.pat, first: -1, last: -1 }],
      micro: { id: typeof id === 'string' ? id : M.id, cmd: M.cmd, pass: M.pass || 0.6, teach: M.teach || '', intro, beats: M.beats } };
    let ci = 0, span = null;
    const chordAt = i => { const d = M.chord && M.chord[i]; if (d != null && d !== '.' && d !== ' ') { const k = +d % set.length; if (k !== ci || !span) { ci = k; span = null; return true; } } return false; };
    for (let i = 0; i < M.pat.length; i++) {
      const changed = chordAt(i), ch = M.pat[i], beat = r6(intro + i / g);
      if (ch === '.' || ch === '-') continue;
      if (!span && inst !== 'drums') { let j = i + 1; while (j < M.pat.length && !(M.chord && /\d/.test(M.chord[j] || '') && +M.chord[j] % set.length !== ci)) j++; span = { id: T.spans.length, chord: set[ci % set.length], sounds: set[ci % set.length], beat, len: r6((j - i) / g), sec: 0, first: -1, last: -1 }; T.spans.push(span); }
      const t = { beat, lane, sec: 0, bar: Math.floor(beat / B), accent: isInt(beat) ? 1 : 0, chord: span ? span.chord : undefined, span: span && ch !== 'R' ? span.id : undefined };
      if (ch === 'R') { t.kind = 'rest'; t.dir = null; }
      else if (ch === 'H') { let n = 1; while (M.pat[i + n] === '-') n++; t.kind = inst === 'drums' ? 'hit' : 'hold'; t.dir = 'D'; t.len = r6(n / g); }
      else { t.kind = inst === 'drums' ? 'hit' : inst === 'bass' ? 'note' : inst === 'piano' ? 'chord' : ch === 'X' ? 'mute' : changed && T.targets.length ? 'gate' : 'strum'; t.dir = inst === 'guitar' ? ch : null; if (t.kind === 'gate') t.gate = true; }
      if (inst === 'bass') { const r = rootPc(t.chord) || 0; t.m = 28 + ((r - 4 + 12) % 12); t.pc = t.m % 12; }
      T.targets.push(t);
    }
    if (M.call) T.calls.push({ beat: intro, len: M.call.length / g, chord: set[0], sounds: set[0], hits: [...M.call].map((ch, i) => 'DUX'.includes(ch) ? { beat: r6(intro + i / g), dir: ch, accent: i % g === 0 ? 1 : 0 } : null).filter(Boolean) });
    return finalize(T);
  }

  /* ---- gauntlet: microgames back to back, faster every few, lives, boss songs ---- */
  function rng(seed){ let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauntlet(opts){
    opts = opts || {};
    const rnd = rng(opts.seed != null ? opts.seed : 1), pool = (opts.pool || Object.keys(MICROS)).filter(id => MICROS[id]);
    const speedEvery = opts.speedEvery || 4, speedUp = opts.speedUp || 1.08, bossEvery = opts.bossEvery || 8, maxBpm = opts.maxBpm || 168;
    const S = { lives: opts.lives || 4, round: 0, speed: 1, bpm: opts.bpm || 90, score: 0, streak: 0, best: 0, bosses: 0, over: false, last: null };
    let lastId = null, pending = null;
    return {
      state: S,
      // the next game: { kind: 'micro' | 'boss', id, word, track, round, bpm }
      next(){
        if (S.over) return null;
        S.round++;
        const bpm = Math.min(maxBpm, Math.round(S.bpm * S.speed));
        if (opts.boss && bossEvery && S.round % bossEvery === 0) {
          const charts = Array.isArray(opts.boss) ? opts.boss : [opts.boss], ch = charts[S.bosses % charts.length];
          const bars = ch.totalBars, n = Math.min(bars, opts.bossBars || 8), from = Math.floor(rnd() * Math.max(1, bars - n + 1));
          const base = (ch.bpm || 100);
          const track = build(ch, { inst: opts.inst, difficulty: opts.bossDifficulty || 'hard', fromBar: from, toBar: from + n, bpm: Math.round(base * Math.min(S.speed, 1.25)), mods: { echo: false, holds: false } });
          pending = { kind: 'boss', id: track.id, word: 'BOSS!', track, round: S.round, bpm: track.bpm };
        } else {
          let id; do { id = pool[Math.floor(rnd() * pool.length)]; } while (pool.length > 1 && id === lastId);
          lastId = id;
          const set = opts.chords || ['G', 'C', 'D'], k = Math.floor(rnd() * set.length), chords = set.map((_, i) => set[(i + k) % set.length]);
          const track = micro(id, { bpm, chords, inst: opts.inst, difficulty: opts.difficulty });
          pending = { kind: 'micro', id, word: MICROS[id].cmd, track, round: S.round, bpm };
        }
        return pending;
      },
      // tell it how the game went (a run's result): { passed, lives, speedUp, over }
      report(result){
        if (!pending || S.over) return null;
        const boss = pending.kind === 'boss', passed = boss ? !result.failed && result.medal !== 'tryagain' : !!result.passed;
        if (passed) { S.streak++; S.best = Math.max(S.best, S.streak); S.score += Math.round(result.score / 100) * (boss ? 3 : 1); if (boss) S.bosses++; }
        else { S.streak = 0; S.lives -= boss ? 2 : 1; }
        let faster = false;
        if (S.round % speedEvery === 0) { S.speed = r6(S.speed * speedUp); faster = true; }
        if (S.lives <= 0 || (opts.length && S.round >= opts.length)) S.over = true;
        S.last = { kind: pending.kind, id: pending.id, passed };
        pending = null;
        return { passed, lives: Math.max(0, S.lives), speedUp: faster, over: S.over, won: S.over && S.lives > 0 };
      },
    };
  }

  const api = { version: 1, build, start, micro, gauntlet, MICROS, LESSONS, PATTERNS, LEVELS, GRADES: GV, run: null,
    tick: b => api.run && api.run.tick(b), onset: (b, o) => api.run && api.run.onset(b, o), chordResult: (s, r) => api.run && api.run.chordResult(s, r),
    level: (b, o) => api.run && api.run.level(b, o), encore: b => api.run && api.run.encore(b), state: () => api.run && api.run.state(), drain: () => api.run ? api.run.drain() : [] };
  return api;
})();
