/* =====================================================================
   Game logic: Practice (wait for every note) and Stage (scored, in time)
   ===================================================================== */
const PRAISE = ['GOT IT!', 'NICE!', 'SWEET!', 'YES!', 'CLEAN!', 'GROOVY!'];
const G = {
  chart: null, mode: 'practice', running: false, paused: false, tapMode: false,
  beatNow: 0, trackBeat: 0, danger: 0, failed: false, trackEvents: [], sectionIndex: 0, capoText: '', strumSteps: null, countText: '', hype: 0,
  streak: 0, bestStreak: 0, level: 0, topLevel: 0, fastest: null,
  lastStrumAt: -9, lastGoodAt: -9, lastMissAt: -9, opts: null, lastFrame: 0,
  // practice
  list: [], idx: 0, chordStart: 0, heard: [-9,-9,-9,-9,-9,-9], stats: [], laps: 0, strayMark: 0, shownEv: null, skipped: 0,
  // stage
  score: 0, combo: 0, maxCombo: 0, counts: null, accSum: 0, judgedN: 0, chordStats: null, fromBar: 0, endBar: 0, lead: 0.5,
  mood(now){
    // whichever happened last wins, so the face doesn't flicker between the two
    if (this.lastMissAt > this.lastGoodAt && now - this.lastMissAt < 0.7) return 'miss';
    if (now - this.lastGoodAt < 0.55) return 'great';
    return this.mode === 'practice' && this.running ? 'focus' : 'idle';
  },
  // Story levels set their own note check; otherwise the player's setting
  strictMode(){ return (this.opts && this.opts.strict) || Settings.strict; },
  relaxed(){ return this.strictMode() === 'relaxed'; },

  start(chart, mode, opts){
    this.stop();
    this.chart = chart; this.mode = mode; this.opts = opts;
    this.tapMode = !Mic.on;
    this.capoText = [chart.capo ? 'CAPO ' + chart.capo : '', chart.tuning ? (chart.tuning === -1 ? 'TUNED ½ STEP DOWN' : 'TUNED ' + (-chart.tuning / 2) + ' STEP DOWN') : ''].filter(Boolean).join(' · ');
    this.strumSteps = chart.song.strum ? chart.song.strum.split('') : null;
    this.hype = 0; this.danger = 0; this.failed = false; this.countText = ''; this.streak = 0; this.bestStreak = 0; this.level = 0; this.topLevel = 0; this.fastest = null; Groove.level = 0; this.lastGoodAt = this.lastMissAt = this.lastStrumAt = -9;
    Stage.reset();
    const secs = chart.sections, s0 = secs[opts.section] || secs[0];
    this.fromBar = s0.startBar;
    this.endBar = opts.loop ? s0.startBar + s0.bars : chart.totalBars;
    const fromBeat = this.fromBar * chart.beats, endBeat = this.endBar * chart.beats;
    const inRange = chart.events.filter(e => e.beat >= fromBeat - 1e-6 && e.beat < endBeat - 1e-6);
    const bpm = chart.bpm * (opts.tempo / 100);
    const pattern = buildPattern(chart);
    this.running = true; this.paused = false;
    if (mode === 'practice') {
      // the same chord twice in a row is one thing to find in practice
      this.list = [];
      for (const e of inRange) {
        if (e.rest) continue;
        const last = this.list[this.list.length - 1];
        if (last && last.label === e.label && last.full === e.full) last.len += e.len;
        else this.list.push({ ...e, done: false });
      }
      if (!this.list.length) { this.running = false; return false; }
      let acc = 0;
      this.list.forEach(e => { e.tb = acc; e.tl = Math.min(4, Math.max(1.5, e.len)); acc += e.tl; });
      this.trackEvents = this.list;
      this.idx = 0; this.laps = 0; this.stats = []; this.skipped = 0;
      this.trackBeat = this.list[0].tb;
      Groove.start({ mode: 'loop', bpm, sub: chart.sub, swing: chart.swing ? 1 : (chart.song.style === 'hiphop' ? 0.4 : 0), pattern, click: Settings.click || pattern.none, countIn: 0,
        bassAt: () => this.bassFor(this.cur()) });
      this.enterChord(AudioEngine.now());
    } else {
      this.list = inRange.filter(e => !e.rest).map(e => ({ ...e, timing: null, final: false, heard: new Set(), missed: new Set(), earN: 0, earOk: 0, wrongN: 0, wrongLast: [], result: null }));
      if (!this.list.length) { this.running = false; return false; }
      this.trackEvents = this.list.map(e => Object.assign(e, { tb: e.beat, tl: e.len }));
      this.chordStart = 0; this.fbKey = null;
      this.score = opts.keepScore ? this.score : 0;
      if (!opts.keepScore) { this.combo = 0; this.maxCombo = 0; this.counts = { perfect: 0, great: 0, good: 0, ok: 0, miss: 0 }; this.accSum = 0; this.judgedN = 0; this.chordStats = {}; }
      const countIn = chart.beats <= 2 ? chart.beats * 2 : chart.beats;
      Groove.start({ mode: 'song', bpm, sub: chart.sub, swing: chart.swing ? 1 : (chart.song.style === 'hiphop' ? 0.4 : 0), pattern, click: Settings.click || pattern.none,
        countIn, firstBar: this.fromBar, endBar: this.endBar,
        sectionStarts: new Set(chart.sections.map(s => s.startBar)),
        fillBars: new Set(chart.sections.map(s => s.startBar + s.bars - 1).filter(b => b < this.endBar - 1)),
        // the player's own instrument drops out of the band: no bass line in Bass, no kit in Drums
        bassAt: opts.inst === 'bass' ? null : k => { const beat = k / chart.sub; let e = null; for (const x of chart.events) { if (x.beat <= beat + 1e-6) e = x; else break; } return e && !e.rest ? this.bassFor(e) : null; },
        noKit: opts.inst === 'drums', onEnd: () => {} });
      const cfg = Groove.cfg;
      this.list.forEach((e, i) => {
        e.t = cfg.startTime + e.beat * cfg.beatDur;
        const next = this.list[i + 1];
        const dur = (next ? next.beat - e.beat : e.len) * cfg.beatDur;
        e.noteWin = Math.max(0.35, Math.min(1.1, dur - 0.08));
        e.earWin = Math.max(0.9, Math.min(1.6, dur + 0.3));      // chord frames need ~0.7 s of sound
      });
      this.lastSeq = Mic.anSeq;
      this.lead = Math.min(0.7, Math.max(0.35, cfg.beatDur));
      this.shownEv = null;
      // another instrument: Parts judges it (the band, hype and fail state stay here)
      if (opts.inst && opts.inst !== 'guitar') {
        if (!Parts.begin(this, chart, opts, cfg)) { this.stop(); this.running = false; return false; }
        this.tapMode = false; UI.hudUpdate(); return true;
      }
      this.showStageChord(AudioEngine.now());
    }
    Mic.onsetListeners.clear();
    Mic.onsetListeners.add(t => this.onStrum(t - Settings.latency / 1000, 'mic'));
    UI.hudUpdate();
    return true;
  },
  stop(){ this.running = false; Groove.stop(); Mic.onsetListeners.clear(); if (Parts.active) Parts.end(); },
  bassFor(ev){
    if (!ev || !ev.shape) return null;
    const cap = this.chart.capo;
    const rootPc = mod12((ev.shape.bass != null ? ev.shape.bass : ev.shape.root) + cap);
    const iv = QUALITIES[ev.shape.quality] || [0, 4, 7];
    const fifth = iv.includes(7) ? 7 : iv.includes(6) ? 6 : iv.includes(8) ? 8 : 7;
    return { root: 28 + mod12(rootPc - 4), fifth };
  },
  /* ---------- hype: how quickly and cleanly you play drives the band and crowd ---------- */
  addHype(d){
    this.hype = Math.max(0, Math.min(1, this.hype + d));
    const up = [0.18, 0.4, 0.62, 0.85], L = this.level;
    let n = L;
    if (L < 4 && this.hype >= up[L]) n = L + 1;
    else if (L > 0 && this.hype < up[L - 1] - 0.08) n = L - 1;
    if (n !== L) this.setLevel(n);
  },
  /* ---------- danger: playing badly in Stage mode turns the room against you, then ends the show ---------- */
  addDanger(d){
    if (this.mode !== 'stage' || !this.running || this.failed) return;
    // gentler with the relaxed note check (easy Story levels) and in tap mode; no fail in the first few chords
    const rate = d > 0 ? (this.relaxed() ? 0.7 : 1) * (this.tapMode ? 0.8 : 1) : 1;
    this.danger = Math.max(0, Math.min(1, this.danger + d * rate));
    if (this.judgedN < 6) this.danger = Math.min(this.danger, 0.9);
    if (this.danger >= 1) this.fail();
  },
  fail(){
    if (this.failed) return;
    this.failed = true; this.running = false;
    Groove.stop(); Mic.onsetListeners.clear();
    Stage.failAt = performance.now() / 1000; Stage.shake = 16;
    Sfx.fail && Sfx.fail(); Sfx.boo && Sfx.boo();
    const chart = this.chart, acc = this.judgedN ? this.accSum / (100 * this.judgedN) : 0;
    const done = this.list.filter(e => e.final).length;
    const progress = Parts.active ? Parts.progress() : this.list.length ? done / this.list.length : 0, inst = Parts.active ? Parts.inst : undefined;
    // the stage falls apart for a moment, then the results
    setTimeout(() => UI.showResults({ mode: 'stage', failed: true, chart, score: this.score, acc, grade: 'F', title: 'Booed Off!', counts: this.counts,
      maxCombo: this.maxCombo, noteAcc: 0, tough: [], tap: this.tapMode, tempo: this.opts.tempo, topLevel: this.topLevel,
      progress, newBest: false, inst }), 2200);
    if (Parts.active) setTimeout(() => Parts.end(), 2150);
  },
  setLevel(n){
    const up = n > this.level;
    this.level = n; Groove.level = n; this.topLevel = Math.max(this.topLevel, n);
    if (up) {
      const extra = n === 2 ? (Groove.pitchedOk() ? 'BASS JOINS IN · ' : 'MORE DRUMS · ') : n === 3 ? 'MORE DRUMS · ' : '';
      Stage.bannerShow(extra + LEVEL_NAMES[n].toUpperCase() + '!', [COL.paper, COL.mint, COL.teal, COL.amber, COL.coral][n]);
      Stage.burst(null, null, 26 + n * 10); Sfx.levelUp(n);
    }
    UI.hudUpdate();
  },

  /* ---------- practice ---------- */
  cur(){ return this.list[this.idx]; },
  enterChord(now){
    const ev = this.cur(); if (!ev) return;
    const prev = this.list[this.idx - 1] || (this.idx === 0 && this.laps ? this.list[this.list.length - 1] : null);
    this.chordStart = now + 0.08;
    this.heardAt = [-9,-9,-9,-9,-9,-9]; this.missAt = [-9,-9,-9,-9,-9,-9]; this.missRun = [0,0,0,0,0,0]; this.wrongSeen = {};
    this.okFrames = []; this.okRun = 0; this.lastEvalAt = -9; this.lastR = null; this.hintAt = 0; this.fbKey = '';
    this.needFresh = !!(prev && prev.label === ev.label);          // same chord again: wait for a new strum
    this.lastSeq = Mic.anSeq;
    this.sectionIndex = ev.sec;
    Fretboard.render(ev, this.chart.capo, Settings.lefty);
    UI.sideUpdate(ev, this.list[this.idx + 1] || (this.opts.loop ? this.list[0] : null));
    UI.hint(this.tapMode ? 'Tap the stage or press Space when you have the chord.' : 'Strum the chord. Strings turn green when I hear them and red when they’re missing.');
  },
  practiceSuccess(now, how){
    const ev = this.cur(); if (!ev) return;
    const took = Math.max(0, now - this.chordStart);
    this.stats.push({ label: ev.label, time: took, how });
    ev.done = true;
    if (how === 'skip') { this.streak = 0; this.addHype(-0.2); }
    else {
      const beats = took / (Groove.cfg ? Groove.cfg.beatDur : 0.5);
      if (how !== 'tap' && (this.fastest == null || took < this.fastest.time)) this.fastest = { label: ev.label, time: took };
      this.lastGoodAt = now;
      if (beats <= 4) {
        this.streak++;
        this.addHype(0.18 + Math.min(0.12, this.streak * 0.012));
        const words = this.streak >= 8 ? ['BLAZING!', 'UNREAL!', 'ON FIRE!'] : this.streak >= 4 ? ['SPEEDY!', 'SNAPPY!', 'SLICK!'] : ['QUICK!', 'NICE!', 'CLEAN!'];
        Stage.popup(words[Math.floor(Math.random() * words.length)] + (this.streak >= 3 ? ' ×' + this.streak : ''), this.streak >= 8 ? COL.coral : COL.mint, true);
        Stage.burst(null, null, 14 + Math.min(30, this.streak * 3)); Sfx.gotIt(this.streak);
        if (this.streak >= 3) Sfx.cheer(Math.min(1, this.streak / 10));
      } else if (beats <= 8) {
        this.streak++;
        this.addHype(0.09);
        Stage.popup(PRAISE[Math.floor(Math.random() * PRAISE.length)] + (this.streak >= 3 ? ' ×' + this.streak : ''), COL.mint, true);
        Stage.burst(null, null, 12); Sfx.gotIt(1);
      } else {
        this.streak = 0;
        this.addHype(0.03);
        Stage.popup('GOT IT', COL.paper, true); Sfx.gotIt(0);
      }
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    }
    this.idx++;
    if (this.idx >= this.list.length) {
      if (this.opts.loop) { this.laps++; this.idx = 0; this.list.forEach(e => e.done = false); this.trackBeat = this.list[0].tb - 3; Stage.popup('LAP ' + (this.laps + 1), COL.sun, true); Sfx.combo(); }
      else { this.finish(); return; }
    }
    this.enterChord(now);
    UI.hudUpdate();
  },
  updatePractice(now, dt){
    const ev = this.cur(); if (!ev) return;
    this.trackBeat += (ev.tb - this.trackBeat) * Math.min(1, dt * 9);
    if (this.tapMode || !Mic.on) return;
    if (Listen.ready) {
      if (this.practiceListen(ev)) return;
      this.showFeedback(ev, now); this.practiceHint(ev, now);
      return;
    }
    if (Mic.anSeq !== this.lastSeq && Mic.an) {
      this.lastSeq = Mic.anSeq;
      if (this.practiceFrame(ev, Mic.an, Mic.anTime)) return;       // got it: moved on
    }
    this.showFeedback(ev, now);
    this.practiceHint(ev, now);
  },
  // the neural listener: judge the latest strum once the model has heard ~0.35 s of it
  practiceListen(ev){
    let ts = null; for (const t of Listen.strums) if (t > this.chordStart - 0.25 && t >= Mic.deafUntil) ts = t;
    if (ts == null) return false;
    const upto = Math.min(ts + 0.8, Listen.reliableT);
    if (upto < ts + 0.3 || Listen.lastT < ts + 0.52 || (this.judgedUpto && this.judgedStrum === ts && upto - this.judgedUpto < 0.05)) return false;
    const midis = ev.notes.map(n => n.midi);
    if (this.judgedStrum !== ts) { this.judgedStrum = ts; this.strumFresh = Listen.freshness(ts, midis); }
    this.judgedUpto = upto;
    const r = Listen.judge(Listen.heard(ts + 0.04, upto), midis, G.strictMode());
    // the model says WHICH notes; the spectrum says they're NEW at this strum
    const fr = this.strumFresh; r.freshDsp = fr;
    if (fr && !fr.ok) r.ok = false;
    const isNew = m => !fr || fr.roseSet.has(m) || fr.rose(m);          // only notes that started at your strum are shown
    this.lastR = r; this.lastEvalAt = AudioEngine.now();
    for (const n of ev.notes) {
      const st = r.noteState[n.midi];
      if (st === 'heard' && isNew(n.midi)) this.heardAt[n.string] = this.lastEvalAt;
      else if (st === 'missing' && r.attempt && (!fr || fr.ok)) this.missAt[n.string] = this.lastEvalAt;   // red only when you were actually going for the chord
    }
    // a wrong note has to show up in two looks in a row before it's drawn
    for (const m of r.wrongNotes) if (isNew(m)) (this.wrongSeen[m] = (this.wrongSeen[m] || []).filter(t => this.lastEvalAt - t < 2)).push(this.lastEvalAt);
    if (r.ok) {
      const all = ['', '', '', '', '', '']; ev.notes.forEach(n => all[n.string] = 'heard');
      Fretboard.feedback(all, []); UI.stepsHeard(all);
      this.practiceSuccess(AudioEngine.now(), 'mic');
      return true;
    }
    return false;
  },
  // one chord frame (~0.7 s of sound). Counts only when it holds a fresh strum, or the chord has rung on its own.
  practiceFrame(ev, an, ta){
    const ws = ta - Ear.N / Mic.sr;
    if (ws < Mic.deafUntil || ta < this.chordStart + 0.1) return false;
    // only a real strum counts: the frame must follow an onset, and the chord must be NEW compared with just before it
    let strumT = null; for (const o of Mic.onsets) if (o > this.chordStart - 0.3 && ta - o >= 0.36 && ta - o <= 1.6) strumT = o;
    const strum = strumT != null, settled = false;
    if (!strum) return false;
    if (an.quiet || !an.total) { this.okRun = 0; return false; }
    const midis = ev.notes.map(n => n.midi);
    const base = Mic.frameBefore(strumT - 0.03) || { R0: null };
    // judge the whole sound, and failing that just what the strum added on top of the background
    let r = Ear.matchTarget(an, { midis }, G.strictMode());
    if (!r.ok) { const rd = Ear.matchTarget(Ear.delta(an, base), { midis }, G.strictMode()); if (rd.ok) r = rd; }
    const fr = Ear.fresh(an, base, midis);
    r.fresh = fr; if (!fr.ok) { r.ok = false; r.stale = true; }
    this.lastR = r; this.lastEvalAt = ta;
    // only light strings green when the sound is mostly this chord (noise or a different chord can brush a string's note)
    for (const n of ev.notes) {
      const st = r.noteState[n.midi];
      // steadier lights: a string only turns red after two missing frames in a row, and green wins while it's fresh
      if (st === 'heard' && r.fit >= 0.75 && fr.ok) { this.heardAt[n.string] = ta; this.missRun[n.string] = 0; }
      else if (st === 'missing') { if (++this.missRun[n.string] >= 2 && ta - this.heardAt[n.string] > 0.5) this.missAt[n.string] = ta; }
    }
    for (const m of r.wrongNotes) (this.wrongSeen[m] = (this.wrongSeen[m] || []).filter(t => ta - t < 1.2)).push(ta);
    if (r.ok) { this.okFrames.push(ta); this.okRun++; } else this.okRun = 0;
    this.okFrames = this.okFrames.filter(t => ta - t < 1.3);
    if ((strum && this.okFrames.length >= 3) || (settled && this.okRun >= 6)) {
      const all = ['', '', '', '', '', '']; ev.notes.forEach(n => all[n.string] = 'heard');
      Fretboard.feedback(all, []); UI.stepsHeard(all);
      this.practiceSuccess(AudioEngine.now(), 'mic');
      return true;
    }
    return false;
  },
  // where a stray note most likely comes from: a string that should be silent, or a finger on the wrong fret
  placeWrong(m, ev, states){
    const capo = this.chart.capo, v = ev.v;
    const fr = v.frets.map(f => f > 0 ? f + capo : f === 0 ? capo : -1);
    const held = fr.filter(f => f > capo);
    const lo = held.length ? Math.min(...held) : capo + 1, hi = held.length ? Math.max(...held) : capo + 3;
    let best = null;
    for (let s = 0; s < 6; s++) {
      const a = m - OPEN_MIDI[s] - (this.chart.tuning || 0);
      if (a < capo || a > 22) continue;
      let cost = fr[s] < 0 ? (a === capo ? 0.2 : 1) : 0.7 * Math.abs(a - fr[s]) + (states[s] === 'heard' ? 3 : 0.3);
      if (a !== capo) cost += Math.max(0, lo - 1 - a, a - hi - 1) * 1.5;
      if (!best || cost < best.cost) best = { string: s, fret: a, midi: m, open: a === capo, cost, silent: fr[s] < 0 };
    }
    return best;
  },
  feedbackState(ev, now, heardAt, missAt, wrongSeen){
    const states = ['', '', '', '', '', ''];
    for (const n of ev.notes) {
      const h = heardAt[n.string], m = missAt[n.string];
      const keep = Listen.ready ? 2.2 : 1.4;
      if (h > this.chordStart && now - h < keep && h >= m) states[n.string] = 'heard';
      else if (m > this.chordStart && now - m < keep) states[n.string] = 'miss';
    }
    // the two most persistent wrong notes, drawn where they most likely come from
    const cand = [];
    for (const k in wrongSeen) { const n = wrongSeen[k].filter(t => now - t < (Listen.ready ? 2 : 1.2)).length; if (n >= 2) cand.push({ m: +k, n }); }
    cand.sort((a, b) => b.n - a.n);
    const wrong = [];
    for (const c of cand.slice(0, 2)) { const p = this.placeWrong(c.m, ev, states); if (p) wrong.push(p); }
    return { states, wrong };
  },
  showFeedback(ev, now){
    const f = this.feedbackState(ev, now, this.heardAt, this.missAt, this.wrongSeen);
    const key = f.states.join() + '|' + f.wrong.map(w => w.string + ':' + w.fret).join();
    if (key === this.fbKey) return;
    this.fbKey = key; this.fb = f;
    Fretboard.feedback(f.states, f.wrong); UI.stepsHeard(f.states);
  },
  practiceHint(ev, now){
    if (now - this.hintAt < 0.9) return;
    const f = this.fb; if (!f) return;
    const capo = this.chart.capo, flat = ev.shape && ev.shape.flat;
    const recent = now - this.lastEvalAt < 1.2;
    const where = (s, fret) => fret > capo ? `fret ${fret}` : 'open';
    let t = '';
    const r = this.lastR;
    if (recent && r && r.fit < 0.5) {
      t = `That doesn’t sound like ${ev.label} yet. Match the dots above and strum only the strings that have a note.`;
    } else if (recent && f.wrong.length) {
      const w = f.wrong[0], nm = noteName(w.midi, flat);
      t = w.silent ? `I hear ${nm} from the ${stringWord(w.string)} string. Don't strum that one: start from the ${stringWord(ev.v.frets.findIndex(x => x >= 0))} string.`
        : `I hear a stray ${nm} (${stringWord(w.string)} string, ${where(w.string, w.fret)}). Check the finger on that string.`;
    } else if (recent && f.states.includes('miss')) {
      const miss = ev.notes.filter(n => f.states[n.string] === 'miss').map(n => { const fr = ev.v.frets[n.string]; return `${stringWord(n.string)} (${noteName(n.midi, flat)}, ${fr > 0 ? 'fret ' + (fr + capo) : 'open'})`; });
      t = `Not ringing yet: ${miss.join(' · ')}. Press just behind the fret and keep other fingers off ${miss.length > 1 ? 'those strings' : 'that string'}.`;
    } else if (!recent && now - this.chordStart > 4) t = 'Strum all the strings shown when your fingers are in place.';
    else return;
    this.hintAt = now;
    UI.hint(t);
  },

  /* ---------- stage ---------- */
  showStageChord(now){
    let i = this.list.findIndex(e => e.t - this.lead > now);
    if (i < 0) i = this.list.length;
    const ev = this.list[Math.max(0, i - 1)];
    if (ev && ev !== this.shownEv) {
      this.shownEv = ev;
      Fretboard.render(ev, this.chart.capo, Settings.lefty);
      UI.sideUpdate(ev, this.list[this.list.indexOf(ev) + 1] || null);
    }
    return ev;
  },
  updateStage(now){
    const cfg = Groove.cfg; if (!cfg) return;
    this.beatNow = Groove.beatAt(now); this.trackBeat = this.beatNow;
    const fromBeat = cfg.fromBeat;
    if (this.beatNow < fromBeat) this.countText = String(Math.ceil(fromBeat - this.beatNow));
    else if (this.beatNow < fromBeat + 0.6) this.countText = 'GO!';
    else this.countText = '';
    const bar = Math.max(0, Math.floor(this.beatNow / this.chart.beats));
    const sIdx = this.chart.sections.findIndex(s => bar >= s.startBar && bar < s.startBar + s.bars);
    if (sIdx >= 0) this.sectionIndex = sIdx;
    const listening = !this.tapMode && Mic.on;
    // chord frames: judge every chord whose listening window covers this frame
    if (listening && Listen.ready) {
      for (let i = 0; i < this.list.length; i++) {
        const ev = this.list[i]; if (ev.final || ev.listened) continue;
        if (ev.t > Listen.reliableT) break;
        const next = this.list[i + 1], t0 = (ev.onsetT != null ? ev.onsetT : ev.t) + 0.04;
        const t1 = Math.min(t0 + 0.55, next ? Math.max(t0 + 0.25, next.t - 0.02) : t0 + 0.55);
        if (Listen.reliableT < t1) continue;
        if (Listen.lastT < t0 + 0.5) continue;
        ev.listened = true;
        const midisS = ev.notes.map(n => n.midi);
        const r = Listen.judge(Listen.heard(t0, t1), midisS, G.strictMode());
        const frS = Listen.freshness(t0 - 0.04, midisS); if (frS && !frS.ok) { r.ok = false; r.attempt = false; r.wrongNotes = []; }
        ev.earN = 1; ev.earOk = r.ok ? 2 : 0;
        ev.heardAtS = ev.heardAtS || [-9,-9,-9,-9,-9,-9]; ev.missAtS = ev.missAtS || [-9,-9,-9,-9,-9,-9]; ev.wrongSeenS = ev.wrongSeenS || {};
        for (const n of ev.notes) { const st = r.noteState[n.midi]; if (st === 'heard') { ev.heard.add(n.string); ev.heardAtS[n.string] = now; } else if (st === 'missing' && r.attempt) { ev.missed.add(n.string); ev.missAtS[n.string] = now; } }
        if (r.wrongNotes.length) { ev.wrongN = 2; for (const m of r.wrongNotes) ev.wrongSeenS[m] = [now, now]; }
        if (ev.timing && ev.timing !== 'miss' && !ev.final) this.finalize(ev);
      }
    } else if (listening && Mic.anSeq !== this.lastSeq && Mic.an) {
      this.lastSeq = Mic.anSeq;
      const an = Mic.an, ta = Mic.anTime;
      if (ta - Ear.N / Mic.sr >= Mic.deafUntil) {
        for (let i = 0; i < this.list.length; i++) {
          const ev = this.list[i]; if (ev.final) continue;
          if (ev.t > ta) break;
          const d = ta - ev.t; if (d >= 0.36 && d <= ev.earWin) this.stageFrame(ev, i, an, ta);
        }
      }
    }
    for (const ev of this.list) {
      if (ev.final) continue;
      if (now < ev.t - 0.35) break;
      if (!ev.timing && now > ev.t + 0.3 + (listening && Listen.ready ? Math.max(0.3, now - Listen.reliableT) + 0.1 : 0)) { ev.timing = 'miss'; this.counts.miss++; Stage.popup('MISS', COL.bad); this.lastMissAt = now; Stage.shake = 5; Sfx.miss(); this.addHype(-0.22); }
      if (ev.timing && now > ev.t + (listening ? ev.earWin + 0.05 : ev.noteWin)) this.finalize(ev);
    }
    const shown = this.showStageChord(now);
    if (shown) {
      if (listening && shown.t <= now) {
        const f = this.feedbackState(shown, now, shown.heardAtS || [], shown.missAtS || [], shown.wrongSeenS || {});
        const key = f.states.join() + '|' + f.wrong.map(w => w.string + ':' + w.fret).join();
        if (key !== this.fbKey) { this.fbKey = key; Fretboard.feedback(f.states, f.wrong); UI.stepsHeard(f.states); }
      } else if (this.fbKey !== '') { this.fbKey = ''; Fretboard.feedback(['', '', '', '', '', ''], []); UI.stepsHeard(['', '', '', '', '', '']); }
    }
    this.addHype(-0.012 / 60);
    if (this.danger > 0 && now - this.lastMissAt > 2) this.danger = Math.max(0, this.danger - 0.012 / 60);
    const last = this.list[this.list.length - 1];
    if (last.final && !Groove.running) this.finish();
    else if (last.final && now > last.t + last.earWin + 1.2) this.finish();
  },
  stageFrame(ev, i, an, ta){
    const P = Ear.TMODES[G.strictMode()] || Ear.TMODES.normal;
    const tgt = ev.notes.map(n => n.midi);
    // the chord has to be new since just before this beat (or the player's strum), not background that was already there
    const base = Mic.frameBefore((ev.onsetT != null ? ev.onsetT : ev.t) - 0.05) || { R0: null };
    let r = Ear.matchTarget(an, { midis: tgt }, G.strictMode());
    if (!r.ok) { const rd = Ear.matchTarget(Ear.delta(an, base), { midis: tgt }, G.strictMode()); if (rd.ok) r = rd; }
    const fr = Ear.fresh(an, base, tgt);
    if (!fr.ok) r.ok = false;
    let ok = r.ok;
    // short chords share the listening window with their neighbours: their notes aren't "wrong"
    if (!ok && fr.ok && !r.missing.length && r.fit >= P.fit - 0.25) {
      const nb = [this.list[i - 1], this.list[i + 1]].filter(Boolean).flatMap(e => e.notes.map(n => n.midi));
      if (nb.length) { const r2 = Ear.matchTarget(an, { midis: [...new Set(tgt.concat(nb))] }, G.strictMode()); ok = !r2.wrong.length && r2.fit >= P.fit; }
    }
    ev.earN++; if (ok) ev.earOk++;
    ev.heardAtS = ev.heardAtS || [-9,-9,-9,-9,-9,-9]; ev.missAtS = ev.missAtS || [-9,-9,-9,-9,-9,-9]; ev.wrongSeenS = ev.wrongSeenS || {};
    for (const n of ev.notes) {
      const st = r.noteState[n.midi];
      if (st === 'heard' && fr.ok && (ok || r.fit >= 0.75)) { ev.heard.add(n.string); ev.heardAtS[n.string] = ta; }
      else if (st === 'missing') { ev.missed.add(n.string); ev.missAtS[n.string] = ta; }
    }
    if (!ok && r.wrongNotes.length) {
      ev.wrongN++;
      for (const m of r.wrongNotes) (ev.wrongSeenS[m] = ev.wrongSeenS[m] || []).push(ta);
    }
    // verified: judge right away so the praise lands while the chord still rings
    if (ev.timing && ev.timing !== 'miss' && ev.earOk >= 2 && !ev.final) this.finalize(ev);
  },
  finalize(ev){
    ev.final = true; ev.done = true;
    let frac;
    if (this.tapMode || !Mic.on) frac = 1;
    else if (ev.earOk >= 2) frac = 1;                               // the whole chord, cleanly, in at least two frames
    else {
      // partial credit: strings that rang, less if wrong notes kept ringing too
      frac = ev.heard.size / Math.max(1, ev.notes.length);
      if (ev.wrongN >= 2) frac *= 0.6;
      frac = Math.min(0.8, frac);
    }
    const tp = { perfect: 100, great: 80, good: 55, ok: 30, miss: 0 }[ev.timing];
    // with the mic on, a sound only counts once the ear has confirmed the chord itself; any strum-like noise is not enough
    const verified = this.tapMode || !Mic.on || ev.earOk >= 2 || (ev.earOk >= 1 && ev.earN <= 3);
    const hit = ev.timing !== 'miss' && verified;
    const pts = hit ? Math.round(tp * (0.35 + 0.65 * frac)) : Math.round(tp * 0.25 * frac);
    if (!this.tapMode && Mic.on && ev.timing !== 'miss') this.counts[hit ? ev.timing : 'miss']++;
    if (hit && !this.tapMode && Mic.on) this.praise(ev.timing, ev.side);
    this.combo = hit ? this.combo + 1 : 0;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.streak = this.combo; this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (!hit && ev.timing !== 'miss') this.addHype(-0.08);
    this.addDanger(ev.timing === 'miss' ? 0.13 : !hit ? 0.08 : -({ perfect: 0.11, great: 0.08, good: 0.05 }[ev.timing] || 0.02));
    const mult = 1 + Math.min(3, Math.floor(this.combo / 8));
    this.score += pts * mult;
    this.accSum += pts; this.judgedN++;
    ev.result = hit ? 'hit' : 'miss';
    const cs = this.chordStats[ev.label] || (this.chordStats[ev.label] = { n: 0, frac: 0, pts: 0 });
    cs.n++; cs.frac += frac; cs.pts += pts;
    if (!this.tapMode && ev.timing !== 'miss' && !hit) { Stage.popup(ev.earN && frac >= 0.34 ? 'CHECK NOTES' : 'WRONG CHORD', ev.earN && frac >= 0.34 ? COL.amber : COL.bad); this.lastMissAt = AudioEngine.now(); Sfx.oops(); this.addHype(-0.06); }
    if (this.combo && this.combo % 10 === 0) { Stage.popup(this.combo + ' COMBO!', COL.grape, true); Sfx.combo(); Sfx.cheer(Math.min(1, this.combo / 30)); Stage.burst(null, null, 40); }
    UI.hudUpdate();
  },

  /* ---------- input ---------- */
  onStrum(t, src){
    if (!this.running || this.paused) return;
    const now = AudioEngine.now();
    this.lastStrumAt = now;
    if (this.mode === 'practice') {
      if (src === 'tap' && this.tapMode) {
        Fretboard.feedback(['heard', 'heard', 'heard', 'heard', 'heard', 'heard'], []);
        this.practiceSuccess(now, 'tap');
      }
      return;
    }
    if (src === 'tap' && !this.tapMode) return;
    let best = null, bd = 9;
    for (const ev of this.list) {
      if (ev.timing) continue;
      const d = t - ev.t;
      if (d < -0.3) break;
      if (Math.abs(d) <= 0.3 && Math.abs(d) < bd) { best = ev; bd = Math.abs(d); }
    }
    if (!best) return;
    const d = t - best.t, a = Math.abs(d);
    const g = a <= 0.07 ? 'perfect' : a <= 0.13 ? 'great' : a <= 0.22 ? 'good' : 'ok';
    best.timing = g; if (this.tapMode || !Mic.on) this.counts[g]++;
    const side = d < 0 ? 'EARLY' : 'LATE';
    best.side = side; best.onsetT = t;
    if (this.tapMode) this.praise(g, side);
  },
  praise(g, side){
    const now = AudioEngine.now();
    if (g === 'perfect') { Stage.popup('PERFECT!', COL.sun, true); this.lastGoodAt = now; Sfx.perfect(); Stage.burst(null, null, 22); Stage.ring(); this.addHype(0.13); }
    else if (g === 'great') { Stage.popup('GREAT!', COL.mint); this.lastGoodAt = now; Sfx.great(); Stage.burst(null, null, 12); Stage.ring(); this.addHype(0.09); }
    else if (g === 'good') { Stage.popup('GOOD · ' + side, COL.paper); Sfx.good(); this.addHype(0.05); }
    else { Stage.popup(side + '!', COL.coral); Sfx.good(); this.addHype(0.015); }
  },
  skip(){
    if (!this.running || this.mode !== 'practice') return;
    this.skipped++;
    this.practiceSuccess(AudioEngine.now(), 'skip');
  },
  pause(){
    if (!this.running || this.paused) return;
    this.paused = true;
    this.pausedBeat = Groove.beatAt(AudioEngine.now());
    Groove.stop();
  },
  resume(){
    if (!this.paused) return;
    this.paused = false;
    const chart = this.chart, opts = this.opts;
    if (this.mode === 'practice') {
      const pattern = buildPattern(chart);
      Groove.start({ mode: 'loop', bpm: chart.bpm * opts.tempo / 100, sub: chart.sub, swing: chart.swing ? 1 : 0, pattern, click: Settings.click || pattern.none, countIn: 0 });
      this.chordStart = AudioEngine.now(); this.okFrames = []; this.okRun = 0; this.lastSeq = Mic.anSeq;
      return;
    }
    // stage: restart from the bar we paused in, keeping earlier results
    const bar = Math.max(this.fromBar, Math.floor(this.pausedBeat / chart.beats));
    if (Parts.active) { Groove.start({ ...Groove.cfg, firstBar: bar, countIn: chart.beats <= 2 ? chart.beats * 2 : chart.beats, startTime: undefined }); Parts.resumeAt(this, bar * chart.beats, Groove.cfg); return; }
    const keep = this.list.filter(e => e.final);
    const section = chart.sections.findIndex(s => bar >= s.startBar && bar < s.startBar + s.bars);
    const o2 = { ...opts, keepScore: true };
    const savedCounts = this.counts, savedStats = this.chordStats, acc = this.accSum, n = this.judgedN, combo = this.combo, mc = this.maxCombo;
    this.start(chart, 'stage', { ...o2, section: Math.max(0, section) });
    // trim to events from the paused bar on, and restore earlier results
    const fromBeat = bar * chart.beats;
    Groove.stop();
    Groove.start({ ...Groove.cfg, firstBar: bar, countIn: chart.beats <= 2 ? chart.beats * 2 : chart.beats, startTime: undefined });
    const cfg = Groove.cfg;
    this.list = this.list.filter(e => e.beat >= fromBeat - 1e-6 && !keep.some(k => k.beat === e.beat));
    this.list.forEach(e => e.t = cfg.startTime + e.beat * cfg.beatDur);
    this.trackEvents = keep.concat(this.list);
    this.counts = savedCounts; this.chordStats = savedStats; this.accSum = acc; this.judgedN = n; this.combo = combo; this.maxCombo = mc;
    if (!this.list.length) this.finish();
  },
  finish(){
    if (!this.running) return;
    const chart = this.chart;
    this.stop();
    if (this.mode === 'practice') {
      const times = {};
      this.stats.filter(s => s.how !== 'skip').forEach(s => { (times[s.label] = times[s.label] || []).push(s.time); });
      const avg = Object.entries(times).map(([l, a]) => ({ label: l, avg: a.reduce((x, y) => x + y, 0) / a.length }));
      avg.sort((a, b) => b.avg - a.avg);
      const played = this.stats.filter(s => s.how !== 'skip');
      UI.showResults({ mode: 'practice', chart, played: played.length, skipped: this.skipped, total: this.stats.length,
        avg: played.length ? played.reduce((x, s) => x + s.time, 0) / played.length : 0, tough: avg.slice(0, 3), tap: this.tapMode,
        bestStreak: this.bestStreak, topLevel: this.topLevel, fastest: this.fastest });
    } else {
      const acc = this.judgedN ? this.accSum / (100 * this.judgedN) : 0;
      const grade = acc >= 0.92 ? ['S', 'Legendary!'] : acc >= 0.8 ? ['A', 'Rock Solid!'] : acc >= 0.65 ? ['B', 'Nice Groove!'] : acc >= 0.45 ? ['C', 'Getting There'] : ['D', 'Keep Jamming'];
      const noteAcc = Object.values(this.chordStats).reduce((a, c) => a + c.frac, 0) / Math.max(1, Object.values(this.chordStats).reduce((a, c) => a + c.n, 0));
      const tough = Object.entries(this.chordStats).map(([l, c]) => ({ label: l, frac: c.frac / c.n })).filter(x => x.frac < 0.85).sort((a, b) => a.frac - b.frac).slice(0, 3);
      const res = { mode: 'stage', chart, score: this.score, acc, grade: grade[0], title: grade[1], counts: this.counts, maxCombo: this.maxCombo,
        noteAcc, tough, tap: this.tapMode, tempo: this.opts.tempo, topLevel: this.topLevel };
      const best = Store.get('best', {});
      const k = chart.song.id + (this.tapMode ? ':tap' : '');
      res.newBest = !best[k] || this.score > best[k].score;
      if (res.newBest) { best[k] = { score: this.score, grade: grade[0] }; Store.set('best', best); }
      UI.showResults(res);
    }
  },
  frame(now){
    const dt = Math.min(0.1, now - (this.lastFrame || now)); this.lastFrame = now;
    if (!this.running || this.paused) return;
    if (this.mode === 'practice') {
      this.beatNow = Groove.running ? Groove.beatAt(now) : this.beatNow; this.updatePractice(now, dt);
      const waited = (now - this.chordStart) / (Groove.cfg ? Groove.cfg.beatDur : 0.5);
      this.addHype(-dt * (waited > 8 ? 0.07 : waited > 4 ? 0.035 : 0.01));
      if (waited > 8 && this.streak) { this.streak = 0; UI.hudUpdate(); }
    }
    else if (Parts.active) Parts.frame(this, now);
    else this.updateStage(now);
  },
};
