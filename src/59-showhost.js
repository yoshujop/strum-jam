/* =====================================================================
   ShowHost: how the Show core (58-show.js) plugs into this game's clock, mic and chord checker
   =====================================================================
   A host-side adapter for the new front end. It is NOT wired into the old UI (60-game.js keeps running the old game)
   and nothing here runs at load. Show knows nothing about audio or the DOM; this file is the only place that does.

     ShowHost.start(songOrChart, { inst, difficulty, mode, fail, autoEncore, onEvent, shapes, countIn })  -> track | null
         compiles the song, builds the Show track, starts Groove (the band + the clock), hooks the mic
     ShowHost.tap(dir, lane, t)    a key / touch / pad hit ('D' | 'U', drums: lane); t = when it happened on the audio
                                   clock if the host knows (an input event's timestamp), else now
     ShowHost.encore()             the player fires the Encore
     ShowHost.stop()               stops the loop, the band and the mic hook
     ShowHost.on(fn) / off(fn)     every Show event, as it happens: fn(event, state)
     ShowHost.state()              Show's HUD snapshot (score, combo, mult, hype, level, crowd, encore...)
     ShowHost.runMicro(id, opts)   one microgame over a looping groove (opts: bpm, chords, inst, onEvent)

   What plugs in where
     clock        Groove.beatAt(AudioEngine.now()) every animation frame -> run.tick(beat). Show's targets already carry
                  Groove's swing offsets, so the linear beat clock is the right one.
     timing       Mic.onsetListeners (the capture worklet's fast onsets via Hear -> Mic.fastOnset: sample-exact time on the
                  audio clock, the game's own sounds and the sensitivity setting already filtered)
                  -> run.onset(Groove.beatAt(t - Settings.latency)), judged at once: the 'hit' event is the instant feedback.
     chord        on each 'span' event the host remembers the span; Hear.spanVerdict (else Listen.judge once 0.5 s of it was
                  heard) decides -> run.chordResult(span, { ok, frac }) -> 'lock' / 'buzz' / 'wrong'. No model, or not a
                  guitar: { unsure }.
     band         'levelUp' / 'levelDown' -> Groove.level (the kit thickens); 'call' -> the band strums the bar the player
                  echoes; tap mode: every hit sounds the chord (the player's input is the guitar track).
   ===================================================================== */
const ShowHost = {
  run: null, track: null, chart: null, opts: null, raf: 0, spans: [], listeners: new Set(), micFn: null,

  on(fn){ this.listeners.add(fn); return fn; },
  off(fn){ this.listeners.delete(fn); },
  state(){ return this.run ? this.run.state() : null; },
  beat(t){ return Groove.beatAt(t != null ? t : AudioEngine.now()); },
  timeOf(beat){ const c = Groove.cfg; return c ? c.startTime + beat * c.beatDur : 0; },

  start(song, opts){
    opts = opts || {};
    this.stop();
    const chart = song && song.events ? song : compileSong(song, { shapes: opts.shapes || (typeof Settings !== 'undefined' && Settings.shapes) || 'standard' });
    const inst = opts.inst || 'guitar', pattern = buildPattern(chart);
    const swing = chart.swing ? 1 : (chart.song.style === 'hiphop' ? 0.4 : 0);
    const track = Show.build(chart, { inst, difficulty: opts.difficulty || 'normal', mods: opts.mods, swing, vocal: opts.vocal,
      drums: inst === 'drums' && !pattern.none ? { k: Array.from(pattern.k), s: Array.from(pattern.s), h: Array.from(pattern.h) } : undefined });
    if (!track.targets.length) return null;
    const mode = opts.mode || (typeof Mic !== 'undefined' && Mic.on ? 'mic' : 'tap');
    this.chart = chart; this.track = track; this.opts = opts; this.spans = [];
    this.run = Show.start(track, { mode, fail: opts.fail, autoEncore: opts.autoEncore, on: e => this.handle(e) });
    Groove.level = 0;
    Groove.start({ mode: 'song', bpm: track.bpm, sub: chart.sub, swing, pattern, click: (typeof Settings !== 'undefined' && Settings.click) || pattern.none,
      countIn: opts.countIn != null ? opts.countIn : (chart.beats <= 2 ? chart.beats * 2 : chart.beats), firstBar: 0, endBar: chart.totalBars,
      sectionStarts: new Set(chart.sections.map(s => s.startBar)), fillBars: new Set(chart.sections.map(s => s.startBar + s.bars - 1).filter(b => b < chart.totalBars - 1)),
      noKit: inst === 'drums', noBass: inst === 'bass', noComp: inst === 'piano', sections: chart.sections,
      // the chord under step k, so the band's bass and chord instruments play the song (see Groove.start in 30-audio.js)
      harmAt: k => { const beat = k / chart.sub; let e = null; for (const x of chart.events) { if (x.beat <= beat + 1e-6) e = x; else break; }
        if (!e || e.rest || !e.shape) return null;
        const cap = chart.capo || 0, iv = (typeof QUALITIES !== 'undefined' && QUALITIES[e.shape.quality]) || [0, 4, 7];
        return { root: 28 + mod12(mod12((e.shape.bass != null ? e.shape.bass : e.shape.root) + cap) - 4), fifth: iv.includes(7) ? 7 : iv.includes(6) ? 6 : iv.includes(8) ? 8 : 7, pcs: iv.map(i => mod12(e.shape.root + cap + i)) }; },
      onEnd: () => {} });
    this.hookMic(mode, inst);
    this.loop();
    return track;
  },
  // one microgame: a plain looping groove at the game's tempo, the track starts on the next bar line
  runMicro(id, opts){
    opts = opts || {};
    this.stop();
    const track = Show.micro(id, opts), mode = opts.mode || (typeof Mic !== 'undefined' && Mic.on ? 'mic' : 'tap');
    const fake = { beats: track.beatsPerBar, sub: 4, song: { style: opts.style || 'rock' } };
    this.chart = null; this.track = track; this.opts = opts; this.spans = [];
    this.run = Show.start(track, { mode, verify: false, on: e => this.handle(e) });
    Groove.level = 1;
    Groove.start({ mode: 'loop', bpm: track.bpm, sub: 4, swing: 0, pattern: buildPattern(fake), countIn: 0 });
    this.hookMic(mode, track.inst);
    this.loop();
    return track;
  },
  hookMic(mode, inst){
    if (typeof Mic === 'undefined') return;
    Mic.onsetListeners.clear();
    if (mode !== 'mic') return;
    const lat = () => ((typeof Settings !== 'undefined' && Settings.latency) || 0) / 1000;
    this.micFn = (t, o) => { if (this.run && !(o && o.own)) this.run.onset(this.beat(t - lat()), { src: 'mic', vel: o && o.strength, lane: inst === 'drums' && typeof Calib !== 'undefined' ? Calib.classify() || undefined : undefined }); };
    Mic.onsetListeners.add(this.micFn);
  },
  loop(){
    const frame = () => { if (!this.run) return; this.frame(); if (this.run) this.raf = requestAnimationFrame(frame); };
    this.raf = requestAnimationFrame(frame);
  },
  frame(){
    const now = AudioEngine.now();
    this.run.tick(this.beat(now));
    this.checkSpans(now);
  },
  stop(){
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.run) { Groove.stop(); if (typeof Mic !== 'undefined' && this.micFn) Mic.onsetListeners.delete(this.micFn); }
    this.run = null; this.micFn = null;
  },
  tap(dir, lane, t){
    if (!this.run) return null;
    return this.run.onset(this.beat(t), { src: 'tap', dir, lane });
  },
  encore(){ return this.run ? this.run.encore(this.beat()) : false; },

  // chord confirmation: Listen needs about half a second of the chord before it can say anything
  checkSpans(now){
    if (!this.spans.length) return;
    const ready = typeof Listen !== 'undefined' && Listen.ready && typeof Mic !== 'undefined' && Mic.on && this.track.inst === 'guitar' && this.chart;
    for (let i = this.spans.length - 1; i >= 0; i--) {
      const sp = this.spans[i], ev = this.chart ? this.chart.events[sp.ref] : null;
      if (!ready || !ev || !ev.notes) { if (now > sp.t1) { this.run.chordResult(sp.id, { unsure: true }); this.spans.splice(i, 1); } continue; }
      const strict = (typeof Settings !== 'undefined' && Settings.strict) || 'normal';
      if (typeof Hear !== 'undefined' && Hear.spanVerdict) {                                       // the recognition track's verdict: tried on each strum of the span
        if (now < sp.t1 && sp.hitT == null) continue;
        const mm = ev.notes.map(n => n.midi), v = now > sp.t1 + 1.5 ? { unsure: true } : Hear.spanVerdict(sp.t0 - 0.12, sp.t1, mm, strict, { at: sp.hitT != null ? sp.hitT : sp.t0, end: sp.t1 });
        if (!v) continue;
        this.run.chordResult(sp.id, v.unsure || (!v.attempt && !v.ok) ? { unsure: true } : { ok: !!v.ok, frac: v.frac != null ? v.frac : (v.ok ? 1 : 0) });
        this.spans.splice(i, 1); continue;
      }
      const t0 = (sp.hitT != null ? sp.hitT : sp.t0) + 0.04, t1 = Math.min(t0 + 0.55, Math.max(t0 + 0.25, sp.t1 - 0.02));
      if (Listen.reliableT < t1) continue;
      const midis = ev.notes.map(n => n.midi), h = Listen.heard(t0, t1);
      if (!h) { this.run.chordResult(sp.id, { unsure: true }); this.spans.splice(i, 1); continue; }
      const r = Listen.judge(h, midis, (typeof Settings !== 'undefined' && Settings.strict) || 'normal');
      const heard = midis.filter(m => r.noteState && r.noteState[m] === 'heard').length;
      if (!r.attempt && !r.ok) this.run.chordResult(sp.id, { unsure: true });                     // nothing clear enough to call it wrong
      else this.run.chordResult(sp.id, { ok: !!r.ok, frac: midis.length ? heard / midis.length : 0 });
      this.spans.splice(i, 1);
    }
  },

  handle(e){
    const run = this.run;
    if (e.type === 'span') this.spans.push({ id: e.span, ref: e.ref, t0: this.timeOf(e.at), t1: this.timeOf(e.at + e.len), hitT: null });
    else if (e.type === 'hit') {
      const sp = e.span != null && this.spans.find(s => s.id === e.span);
      if (sp && sp.hitT == null) sp.hitT = AudioEngine.now();
      // tap mode: the player's input is the guitar track
      if (run && run.mode === 'tap' && this.chart && this.track.inst === 'guitar' && e.kind !== 'rest') {
        const t = this.track.targets[e.target], s = t && t.span != null ? this.track.spans[t.span] : null, ev = s && this.chart.events[s.ref];
        if (ev && ev.notes) AudioEngine.strum(ev.notes.map(n => n.midi), undefined, e.dir === 'U' ? 0.008 : 0.016, e.kind === 'mute' ? 0.3 : 0.85);
      }
    }
    else if (e.type === 'levelUp' || e.type === 'levelDown') Groove.level = e.level;
    else if (e.type === 'call' && this.chart) {                                              // the band plays the bar the player will echo
      const ev = this.chart.events.find(x => !x.rest && x.beat <= e.call.beat + 1e-6 && e.call.beat < x.beat + x.len);
      const pitched = !(typeof Mic !== 'undefined' && Mic.on) || (typeof Settings !== 'undefined' && Settings.headphones);
      if (ev && ev.notes && pitched) for (const h of e.call.hits) AudioEngine.strum(ev.notes.map(n => n.midi), this.timeOf(h.beat), h.dir === 'U' ? 0.008 : 0.016, h.accent ? 0.85 : 0.6);
    }
    else if (e.type === 'finish') { const self = this; setTimeout(() => { if (self.run === run) self.stop(); }, 0); }
    const st = run ? run.state() : null;
    if (this.opts && this.opts.onEvent) this.opts.onEvent(e, st);
    this.listeners.forEach(fn => fn(e, st));
  },
};
