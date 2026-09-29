/* =====================================================================
   Ear calibration: a short guided check for the instrument you play,
   so the game adjusts to your mic (or interface input).
   - Guitar / Piano: single notes and a chord through the note model. A
     quiet or dull mic gets lower "heard" bars; a mic full of ghost notes
     gets a higher "wrong note" bar (Listen.cal). A mic that already reads
     cleanly keeps the defaults, so nothing changes for it.
   - Bass / Vocals: how loud your notes come in, which sets the level a
     note has to reach to count (and whether the pitch is read at all).
   - Drums: what your kick, snare and hats look like to the mic, so
     acoustic drums into the mic are told apart (not just timed).
   Learned per mic, next to its room noise (Mic profiles).
   ===================================================================== */
const Calib = {
  running: false,
  steps(inst){
    const q = { id: 'quiet', say: 'Stay quiet for a moment…', sec: 2.2 };
    if (inst === 'guitar') return [q, ...[['low E', 40], ['A', 45], ['D', 50], ['G', 55], ['B', 59], ['high E', 64]].map(([n, m]) => ({ id: 'note', m, say: `Pluck the ${n} string and let it ring`, sec: 2.6 })),
      { id: 'chord', ms: [43, 47, 50, 55, 59, 67], say: 'Strum a G chord and let it ring', sec: 3 }];
    if (inst === 'piano') return [q, ...[['middle C', 60], ['the E above it', 64], ['the G above that', 67]].map(([n, m]) => ({ id: 'note', m, say: `Play ${n} and hold it`, sec: 2.4 })),
      { id: 'chord', ms: [60, 64, 67], say: 'Play a C chord (C E G) and hold it', sec: 3 }, { id: 'chord', ms: [53, 57, 60], say: 'Now an F chord (F A C)', sec: 3 }];
    if (inst === 'bass') return [q, ...[['low E', 28], ['A', 33], ['D', 38], ['G', 43]].map(([n, m]) => ({ id: 'bass', m, say: `Pluck the open ${n} string`, sec: 2.6 }))];
    if (inst === 'vocals') return [q, { id: 'voice', say: 'Sing “ahh” on a comfortable note', sec: 3 }, { id: 'voice', say: 'Now a higher note, still comfortable', sec: 3 }];
    if (inst === 'drums') return [q, ...['kick', 'snare', 'hat'].map(l => ({ id: 'drum', lane: l, say: `Hit the ${l === 'hat' ? 'hi-hat' : l} 4 times, steady`, sec: 4.5 }))];
    return [q];
  },
  sleep(ms){ return new Promise(r => setTimeout(r, ms)); },
  // spectrum features of a hit: brightness (centroid, Hz) and how much sits below 150 Hz
  hitFeatures(){
    const db = Mic.smallDb; if (!db) return null;
    const binHz = Mic.sr / (2 * db.length); let tot = 0, cen = 0, low = 0;
    for (let i = 1; i < db.length; i++) { const p = Math.pow(10, db[i] / 10); tot += p; cen += p * i * binHz; if (i * binHz < 150) low += p; }
    return tot ? { cen: cen / tot, low: low / tot } : null;
  },
  async run(inst, onStep){
    if (!Mic.on && !(await Mic.start())) return { ok: false, why: 'mic' };
    this.running = true; Mic.calibrating = true;
    const steps = this.steps(inst), res = { played: [], ghosts: [], chordsOk: 0, chords: 0, rms: [], hits: { kick: [], snare: [], hat: [] }, seen: 0, want: 0 };
    let noise = [];
    try {
      for (let k = 0; k < steps.length; k++) {
        const st = steps[k]; onStep && onStep(st, k, steps.length);
        await this.sleep(st.id === 'quiet' ? 400 : 900);             // time to get ready
        const t0 = performance.now(), end = t0 + st.sec * 1000;
        let maxExp = 0, maxOther = 0, ok = 0, n = 0, got = 0, tries = 0; const lvls = [];
        const onHit = () => { const f = this.hitFeatures(); if (f && st.id === 'drum') res.hits[st.lane].push(f); };
        if (st.id === 'drum') Mic.onsetListeners.add(onHit);
        while (performance.now() < end) {
          await this.sleep(st.id === 'voice' || st.id === 'bass' ? 60 : 140);
          if (st.id === 'quiet') { noise.push(Mic.rms); continue; }
          if (st.id === 'note' || st.id === 'chord') {
            const h = Listen.ready ? Listen.heard(Listen.reliableT - 0.35, Listen.reliableT) : null; if (!h) continue;
            if (st.id === 'note') { maxExp = Math.max(maxExp, h.note[st.m]); for (let m = 38; m <= 88; m++) if (m % 12 !== st.m % 12) maxOther = Math.max(maxOther, h.note[m]); }
            else { n++; const saved = Listen.cal; Listen.cal = null; const j = Listen.judge(h, st.ms, 'normal'); Listen.cal = saved; if (j.ok) ok++; }
          } else if (st.id === 'voice' || st.id === 'bass') {
            tries++; const v = st.id === 'voice' ? Parts.voice(true) : Parts.bassPitch(true);
            if (v) { got++; lvls.push(v.rms); if (st.id === 'bass' && Parts.pcCents(v.m, st.m) <= 60) res.seen++; }
            else if (Mic.rms > 0.004) lvls.push(Mic.rms);
          }
        }
        if (st.id === 'drum') Mic.onsetListeners.delete(onHit);
        if (st.id === 'note') { res.played.push(maxExp); res.ghosts.push(maxOther); }
        if (st.id === 'chord') { res.chords++; if (n && ok / n > 0.2) res.chordsOk++; }
        if (st.id === 'voice' || st.id === 'bass') { res.rms.push(...lvls); res.want += tries; if (st.id === 'voice') res.seen += got; }
      }
    } finally { this.running = false; Mic.calibrating = false; }
    noise.sort((a, b) => a - b); const floor = noise[noise.length >> 1] || Mic.noiseRms;
    return this.learn(inst, res, floor);
  },
  q(a, f){ const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : 0; },
  // turn what was heard into settings for this mic, and a sentence for the player
  learn(inst, r, floor){
    const ears = Mic.ears || (Mic.ears = {}); let out = { ok: true };
    if (inst === 'guitar' || inst === 'piano') {
      const weak = this.q(r.played, 0.25), ghost = this.q(r.ghosts, 0.9), heardN = r.played.filter(v => v >= 0.2).length;
      const cal = { hearK: Math.max(0.6, Math.min(1, weak / 0.5)), wrongMin: ghost > 0.4 ? Math.min(0.7, ghost * 1.15) : 0 };
      ears[inst] = cal;
      out.msg = heardN < r.played.length - 1 ? `I only clearly heard ${heardN} of ${r.played.length} notes. Move the mic closer (or turn the interface input up), then run this again.`
        : cal.hearK < 1 || cal.wrongMin ? `Adjusted for this mic${cal.hearK < 1 ? ': it’s on the quiet side, so softer notes now count' : ''}${cal.wrongMin ? (cal.hearK < 1 ? ', and' : ':') + ' it picks up ringing overtones, so those no longer count as wrong notes' : ''}. Chords heard: ${r.chordsOk} of ${r.chords}.`
        : `This mic hears every note clearly. No changes needed. Chords heard: ${r.chordsOk} of ${r.chords}.`;
    } else if (inst === 'bass' || inst === 'vocals') {
      const lvl = this.q(r.rms, 0.3), rate = r.want ? r.seen / r.want : 0;
      ears[inst] = { gate: Math.max(0.0015, Math.min(0.02, Math.max(floor * 2.5, lvl * 0.35))) };
      out.msg = inst === 'bass' ? (r.seen ? `Got it: your bass reads clearly (${r.seen} good readings of the open strings). The note bar is set to your level.` : 'I couldn’t read the open strings. Try an audio interface input, or turn the bass up and move the mic closer to the amp.')
        : rate > 0.4 ? 'Got it: your voice comes through clearly. The level a note needs is set to your voice.' : 'Your voice was hard to read. Sing a bit louder or closer to the mic, and wear headphones.';
    } else if (inst === 'drums') {
      const cen = {}; let n = 0;
      for (const l of ['kick', 'snare', 'hat']) { const hs = r.hits[l]; if (hs.length >= 2) { cen[l] = { cen: this.q(hs.map(h => h.cen), 0.5), low: this.q(hs.map(h => h.low), 0.5) }; n++; } }
      ears.drums = n >= 2 ? { cen } : null;
      out.msg = n >= 2 ? `Learned ${n} drums. Hits into the mic now count for the right drum.` : 'I didn’t hear enough hits. Play each drum 4 times, a little harder, then try again.';
    }
    Mic.saveEars();
    Listen.cal = ears.guitar || null;
    return out;
  },
  // which drum a mic hit was, from what calibration learned (null = untrained: timing only)
  classify(){
    const e = Mic.ears && Mic.ears.drums; if (!e) return null;
    const f = this.hitFeatures(); if (!f) return null;
    let best = null, bd = 1e9;
    for (const [l, c] of Object.entries(e.cen)) { const d = Math.abs(Math.log2(f.cen / c.cen)) + Math.abs(f.low - c.low) * 3; if (d < bd) { bd = d; best = l; } }
    return best;
  },
};
Mic.saveEars = function(){
  const all = Settings.micProfiles || (Settings.micProfiles = {});
  all[this.deviceId] = { ...(all[this.deviceId] || {}), ears: this.ears, at: Date.now() }; saveSettings();
};

// the modal
Object.assign(UI, {
  openCalib(inst){
    inst = inst || this.inst();
    this.open('m-cal');
    $('cal-h').textContent = `Train my ears: ${INST_NAMES[inst]}`;
    $('cal-say').textContent = 'Press Start, then do what it says. It takes about 30 seconds.';
    $('cal-res').textContent = ''; $('cal-dots').innerHTML = Calib.steps(inst).map(() => '<i></i>').join('');
    const b = $('btn-cal-go'); b.disabled = false; b.textContent = 'Start';
    b.onclick = async () => {
      b.disabled = true; $('cal-res').textContent = '';
      const r = await Calib.run(inst, (st, k) => { $('cal-say').textContent = st.say; [...$('cal-dots').children].forEach((d, i) => d.className = i < k ? 'done' : i === k ? 'on' : ''); Sfx.blip && Sfx.blip(); });
      [...$('cal-dots').children].forEach(d => d.className = 'done');
      $('cal-say').textContent = r.ok ? 'Done!' : 'Turn on the mic first.';
      $('cal-res').textContent = r.msg || ''; b.disabled = false; b.textContent = 'Run again';
      if (r.ok) Sfx.found && Sfx.found();
      this.refreshMic();
    };
  },
});
