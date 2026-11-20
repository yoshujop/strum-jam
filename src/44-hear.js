/* =====================================================================
   Hear: the one place gameplay asks "what did the player just play?".
   Two speeds, by design:
     now    Hear.onOnset(cb)      a strum / hit, a few tens of ms after the sound
                                  (timing, flashes, the feel of the game)
     later  Hear.chordVerdict()   which notes that strum really was, once the
                                  note model has heard it (lock-in, coaching)
   Everything is plain data on the AudioContext clock (seconds), so a caller
   needs no DOM and no Web Audio: an engine port re-implements Capture and the
   model runner and keeps this contract.

   Hear.onOnset(cb) -> off()      cb({ t, strength, kind, feat, lag })
        t         when the sound started (s, AudioContext clock; sample-exact)
        own       true when the game said it made a sound then (Hear.ownSound)
        strength  1 = just over the detector's threshold; typical strums 2-9
        kind      'tonal' | 'mixed' | 'noise'  (a guess at the attack: strings
                  and keys are tonal/mixed, snares, claps and most speech noise)
        feat      { cen (Hz), low (share < 150 Hz), hi (share > 4 kHz), flat, rise (dB), rms }
        lag       s from the sound to this callback
   Hear.onStrum(cb) -> off()      cb({ t, fast, notes })  a strum the note model
        confirmed (pitched onsets in the guitar range); arrives 0.3-0.7 s later,
        t is the fast onset's time when one matches (fast: true)
   Hear.chordVerdict(t0, t1, midis, strictness) -> null while the model has
        not yet heard up to t1 (ask again next frame), else
        { ok, notesOk, fresh, frac, heard[], missing[], wrong[], attempt, detune, noteState }
   Hear.spanVerdict(tA, tB, midis, strictness, { at, end }) -> null | verdict + { t }
        the same, tried on every strum the model found between tA and tB
   Hear.covered(t)                has the model heard up to t?
   Hear.ownSound(t, span)         the game is about to make a sound the mic will hear at t (onsets there get own: true)
   Hear.timed(t0, early, late, test, now) -> null | { ok, t }   a timed chord:
        timing from the fast onset, pitch classes from the model after the fact
   Hear.tuning() -> { cents, state: 'ok'|'flat'|'sharp'|'unknown', n, corrected }
   Hear.latency  -> { onset: { n, median, p90, max } (ms), model: { lag, look } (ms),
                      capture: { mode, gaps, gapFrames, blocks }, clipping }
   ===================================================================== */
const Hear = {
  fast: [], last: null, lags: [], onsetCbs: new Set(), strumCbs: new Set(),
  tune: { cents: 0, n: 0, applied: 0, last: null },
  get ready(){ return Listen.ready && Listen.linked; },
  onOnset(cb){ this.onsetCbs.add(cb); return () => this.onsetCbs.delete(cb); },
  onStrum(cb){ this.strumCbs.add(cb); return () => this.strumCbs.delete(cb); },
  now(){ const c = Capture.ctx; return c ? c.currentTime : 0; },
  // from Capture: one detected attack (e.f = sample frame), delivered at frame `at`
  fastOnset(e, at){
    const sr = Capture.sr, o = { t: e.f / sr, strength: e.strength, kind: e.kind, feat: e.feat, lag: 0 };
    o.lag = Math.max(at / sr, this.now()) - o.t;
    if (this.own.length && this.isOwn(o.t)) o.own = true;
    this.fast.push(o); if (this.fast.length > 96) this.fast.shift();
    this.lags.push(o.lag); if (this.lags.length > 240) this.lags.shift();
    this.last = o;
    this.onsetCbs.forEach(cb => { try { cb(o); } catch (err) { console.error(err); } });
    if (!o.own && typeof Mic !== 'undefined' && Mic.fastOnset) Mic.fastOnset(o);
  },
  // the fast onset closest to time t within [t - before, t + after]
  nearFast(t, before, after){ let best = null, bd = 9; for (let i = this.fast.length - 1; i >= 0; i--) { const o = this.fast[i]; if (o.t < t - before - 1) break; if (o.t >= t - before && o.t <= t + after && Math.abs(o.t - t) < bd) { bd = Math.abs(o.t - t); best = o; } } return best; },
  // from Listen: the model confirmed a strum at time t
  strumConfirmed(t, fastOne, notes){ const s = { t, fast: !!fastOne, notes: notes || 0 }; this.strumCbs.forEach(cb => { try { cb(s); } catch (err) { console.error(err); } }); },
  // from Listen, after every look of the model: follow the instrument's tuning from looks that hold a fresh strum
  modelLook(d){
    const tu = d.tune; if (!tu || tu.conf < 0.6 || tu.n < 3) return;
    const st = Listen.strums; let ok = false; for (let i = st.length - 1; i >= 0 && st[i] > d.tEnd - 1.2; i--) if (st[i] < d.tEnd - 0.3) { ok = true; break; }
    if (!ok) return;
    const applied = -1200 * Math.log2(d.stretch || 1), total = applied + tu.cents, T = this.tune;
    T.last = { cents: total, conf: tu.conf, t: d.tEnd };
    T.cents = T.n ? T.cents + (total - T.cents) * 0.3 : total; T.n++;
    // more than ~12 cents off, steadily: play the model's input back onto the notes it knows
    if (T.n >= 3) {
      const want = Math.abs(T.cents) < 10 ? 0 : Math.max(-60, Math.min(60, Math.round(T.cents / 5) * 5));
      if (want !== T.applied && (want === 0 || Math.abs(want - T.applied) >= 10 || (T.applied === 0 && Math.abs(want) >= 15))) { T.applied = want; Listen.setStretch(Math.pow(2, -want / 1200)); }
    }
  },
  tuning(){ const T = this.tune; return { cents: T.n ? T.cents : 0, state: T.n < 2 ? 'unknown' : Math.abs(T.cents) < 15 ? 'ok' : T.cents < 0 ? 'flat' : 'sharp', n: T.n, corrected: T.applied }; },
  resetTuning(){ this.tune = { cents: 0, n: 0, applied: 0, last: null }; if (Listen.stretch !== 1) Listen.setStretch(1); },
  covered(t){ return Listen.ready && Listen.reliableT >= t; },
  // Which notes sounded between t0 and t1 (start it ~0.04 s after the onset), judged against a chord.
  //   ok       every pitch class of the chord is there, nothing strong from outside it, and it began at this strum
  //   frac     share of the chord's pitch classes heard;  heard / wrong: MIDI notes;  missing: pitch classes (0-11)
  //   detune   cents the instrument sits off concert pitch (0 until known)
  chordVerdict(t0, t1, midis, strictness){
    if (!Listen.ready || Listen.reliableT < t1) return null;
    const exp = [...new Set(midis)], nPc = new Set(exp.map(m => m % 12)).size, det = this.tune.n ? this.tune.cents : 0;
    const h = Listen.heard(t0, t1);
    if (!h) return { ok: false, notesOk: false, fresh: false, frac: 0, heard: [], missing: [...new Set(exp.map(m => m % 12))], wrong: [], attempt: false, detune: det, noteState: {} };
    const r = Listen.judge(h, exp, strictness || 'normal'), fr = Listen.freshness(t0 - 0.04, exp), fresh = !fr || fr.ok;
    return { ok: r.ok && fresh, notesOk: r.ok, fresh, frac: nPc ? r.heardCount / nPc : 0, heard: exp.filter(m => r.noteState[m] === 'heard'), missing: r.missing, wrong: r.wrongNotes, attempt: r.attempt, detune: det, noteState: r.noteState, freshInfo: fr };
  },
  // pitch classes clearly sounding between t0 and t1 (any octave, piano range)
  pcsBetween(t0, t1){
    const h = Listen.heard(t0, t1), pcs = new Set(); if (!h) return pcs;
    const th = 0.4 * (Listen.cal ? Listen.cal.hearK : 1); for (let m = 33; m <= 96; m++) if (h.note[m] >= th) pcs.add(m % 12);
    return pcs;
  },
  // A chord judged against EVERY strum between tA and tB (the first that passes wins), so a re-strum, a phantom or the
  // last up-stroke of the chord before can't cancel a good one. o.at: an onset time to try as well (e.g. the fast onset the
  // game timed), o.end: when the next chord starts (the listening window stops there).
  // -> null while undecided (ask again next frame), else a chordVerdict() with .t = the strum it was judged on (or null)
  spanVerdict(tA, tB, midis, strictness, o){
    if (!Listen.ready) return null;
    o = o || {};
    const cands = Listen.strums.filter(t => t >= tA && t <= tB);
    if (o.at != null && !cands.some(t => Math.abs(t - o.at) < 0.06)) cands.push(o.at);
    cands.sort((x, y) => x - y);
    let best = null, pending = false;
    for (const c of cands) {
      const t0 = c + 0.04, t1 = Math.min(t0 + 0.55, o.end != null ? Math.max(t0 + 0.25, o.end - 0.02) : t0 + 0.55);
      const v = this.chordVerdict(t0, t1, midis, strictness);
      if (!v) { pending = true; continue; }
      v.t = c;
      if (v.ok) return v;
      if (!best || (v.fresh && !best.fresh) || (v.fresh === best.fresh && v.frac > best.frac)) best = v;
    }
    if (pending || Listen.reliableT < tB + 0.12) return null;         // a later strum may still show up
    if (best) return best;
    const exp = [...new Set(midis)], ns = {}; exp.forEach(m => ns[m] = 'unsure');
    return { ok: false, notesOk: false, fresh: false, frac: 0, heard: [], missing: [...new Set(exp.map(m => m % 12))], wrong: [], attempt: false, detune: this.tune.n ? this.tune.cents : 0, noteState: ns, t: null };
  },
  // A chord that has to land on a beat (piano, or any polyphonic part through the mic). t0: when it should sound (mic
  // clock). An onset between t0 - early and t0 + late gives the timing; test(pcs) says whether the notes that followed it
  // are right, asked of the model once it has heard them. null = not decided yet. An onset is used for one chord only.
  // No onset but the right notes sounding (a soft or held chord): ok, timed as `late / 2`.
  timed(t0, early, late, test, now){
    if (!Listen.ready) return null;
    let pending = false;
    for (const o of this.fast) {
      if (o.t < t0 - early || o.t > t0 + late || o.used) continue;
      const t1 = o.t + 0.3;
      if (Listen.reliableT < t1) { pending = true; break; }            // earlier onsets are judged first
      if (test(this.pcsBetween(o.t + 0.03, t1))) { o.used = true; return { ok: true, t: o.t, onset: o }; }
    }
    if (pending || (now != null ? now : this.now()) < t0 + late + 0.08 || Listen.reliableT < t0 + late + 0.1) return null;
    if (test(this.pcsBetween(t0 + 0.02, t0 + late + 0.1))) return { ok: true, t: t0 + late / 2, onset: null };
    return { ok: false, t: null, onset: null };
  },
  // The game's own sounds that the mic will pick up through the speakers (a click, the band's drums): tell Hear when they
  // play and onsets at those moments are marked o.own = true (and not passed on as the player's).
  own: [],
  ownSound(t, span){ this.own.push([t - 0.03, t + (span || 0.09)]); if (this.own.length > 64) this.own.shift(); },
  isOwn(t){ for (let i = this.own.length - 1; i >= 0; i--) if (t >= this.own[i][0] && t <= this.own[i][1]) return true; return false; },
  get latency(){
    const z = this.lags.slice().sort((a, b) => a - b), q = f => z.length ? Math.round(z[Math.min(z.length - 1, Math.floor(z.length * f))] * 1000) : null;
    const s = Capture.stats;
    return { onset: { n: z.length, median: q(0.5), p90: q(0.9), max: q(1) },
      model: { lag: Listen.ready && Listen.reliableT ? Math.round((this.now() - Listen.reliableT) * 1000) : null, look: Math.round(Listen.ms) },
      capture: { mode: Capture.mode, gaps: s.gaps + (Listen.gaps || 0), gapFrames: s.gapFrames, blocks: s.blocks }, clipping: s.clip > 0 };
  },
};
