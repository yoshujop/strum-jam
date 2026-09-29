/* =====================================================================
   Bass, Piano and Drums parts (see Parts in 62-parts.js).
   - Bass: a line built from the chart's chords and the song's style (roots,
     fifths, octaves), shown as tab on four strings; the player's pitch
     (McLeod on a downsampled long window, down to low E) is matched
     octave-free, and timing is when the right note first sounds.
   - Piano: the chords as block voicings with a keyboard diagram; heard by
     the note model (any octave) or read from a MIDI keyboard.
   - Drums: the band's own groove (kick, snare, hats) on three lanes; hit
     it on a MIDI kit, the keyboard, the on-screen pads, or with any drum
     into the mic (timing only). The band's drummer plays what you play.
   ===================================================================== */
const BASS_OPEN = [28, 33, 38, 43];           // E1 A1 D2 G2
const DRUM_LANES = ['hat', 'snare', 'kick'];
const DRUM_KEYS = { ' ': 'kick', f: 'kick', b: 'kick', j: 'snare', n: 'snare', k: 'hat', d: 'hat' };
const DRUM_MIDI = { 35: 'kick', 36: 'kick', 37: 'snare', 38: 'snare', 39: 'snare', 40: 'snare', 42: 'hat', 44: 'hat', 46: 'hat', 49: 'hat', 51: 'hat', 52: 'hat', 53: 'hat', 55: 'hat', 57: 'hat', 59: 'hat' };
const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

Object.assign(Parts, {
  /* ---------- building ---------- */
  chordAt(e){ const ch = parseChord(e.sounds); return ch ? { pcs: chordPcs(ch), root: ch.bass != null ? ch.bass : ch.root, fifth: (chordPcs(ch).find(p => mod12(p - ch.root) === 7) != null ? 7 : chordPcs(ch).some(p => mod12(p - ch.root) === 6) ? 6 : 7) } : null; },
  // where to play a bass note: the lowest string that has it within the first 7 frets
  bassSpot(m){ for (let s = 0; s < 4; s++) { const f = m - BASS_OPEN[s]; if (f >= 0 && f <= 7) return { s, f }; } const s = 3; return { s, f: Math.max(0, m - BASS_OPEN[3]) }; },
  bassTargets(chart, fromBeat, endBeat){
    const style = chart.song.style, B = chart.beats, out = [];
    const pat = ['country', 'folk', 'bossa', 'waltz'].includes(style) ? 'alt' : ['funk', 'disco', 'hiphop', 'edm'].includes(style) ? 'funk' : ['ballad', 'halftime'].includes(style) ? 'long' : ['punk', 'metal'].includes(style) ? 'eighths' : 'half';
    for (const e of chart.events) {
      if (e.rest || e.beat + e.len <= fromBeat || e.beat >= endBeat) continue;
      const c = this.chordAt(e); if (!c) continue;
      const root = 28 + mod12(c.root - 4);                 // E1..D#2
      const steps = [];
      if (pat === 'long' || e.len < 2) steps.push([0, e.len, 0]);
      else for (let b = 0; b < e.len - 1e-6; b += pat === 'eighths' ? 1 : 2) {
        const len = Math.min(pat === 'eighths' ? 1 : 2, e.len - b), k = Math.round(b / (pat === 'eighths' ? 1 : 2));
        if (pat === 'alt') steps.push([b, len, k % 2 ? c.fifth : 0]);
        else if (pat === 'funk') { steps.push([b, Math.min(len, 1), 0]); if (len >= 2) steps.push([b + 1.5, 0.5, 12]); }
        else steps.push([b, len, 0]);
      }
      for (const [b, len, iv] of steps) {
        const m = root + iv, sp = this.bassSpot(m);
        out.push({ b0: e.beat + b, b1: e.beat + b + len, m, s: sp.s, f: sp.f, name: NOTE_NAMES[mod12(m)], chord: e.sounds });
      }
    }
    return out.filter(t => t.b0 >= fromBeat - 1e-6 && t.b0 < endBeat);
  },
  // piano: a close voicing around middle C (root at the bottom), struck when the chord changes and on every bar it lasts
  pianoVoicing(c){ const r = 48 + mod12(c.root - 0); const base = r < 53 ? r + 12 : r; return [...new Set(c.pcs)].map(p => { let m = base + mod12(p - c.root); return m; }).sort((a, b) => a - b); },
  pianoTargets(chart, fromBeat, endBeat){
    const out = [];
    for (const e of chart.events) {
      if (e.rest || e.beat + e.len <= fromBeat || e.beat >= endBeat) continue;
      const c = this.chordAt(e); if (!c) continue;
      const keys = this.pianoVoicing(c);
      const hits = []; for (let h = 0; h < e.len - 1e-6; h += chart.beats) hits.push(h);      // struck again every bar while it lasts
      for (const h of hits) if (h < e.len) out.push({ b0: e.beat + h, b1: e.beat + Math.min(e.len, h + chart.beats), pcs: [...new Set(c.pcs)], keys, label: e.sounds, root: c.root });
    }
    return out.filter(t => t.b0 >= fromBeat - 1e-6 && t.b0 < endBeat);
  },
  drumTargets(chart, fromBar, endBar){
    const P = buildPattern(chart), n = P.n, sub = chart.sub, out = [];
    if (P.none) return out;
    for (let bar = fromBar; bar < endBar; bar++) for (let i = 0; i < n; i++) {
      const k = bar * n + i, onBeat = i % sub === 0;
      if (P.k[i] > 0) out.push({ k, lane: 'kick' });
      if (P.s[i] > 0) out.push({ k, lane: 'snare' });
      if (P.h[i] && onBeat) out.push({ k, lane: 'hat' });           // hats on the beat only: playable on any kit
    }
    return out;
  },

  /* ---------- starting (called from Parts.begin) ---------- */
  beginBand(g, chart, cfg, fromBeat, endBeat){
    const T = b => cfg.startTime + b * cfg.beatDur;
    if (this.inst === 'bass') this.targets = this.bassTargets(chart, fromBeat, endBeat);
    else if (this.inst === 'piano') this.targets = this.pianoTargets(chart, fromBeat, endBeat);
    else if (this.inst === 'drums') this.targets = this.drumTargets(chart, g.fromBar, g.endBar);
    this.targets.forEach(t => this.timeTarget(t, cfg));
    this.targets.forEach(t => Object.assign(t, { result: null, firstOk: null, okN: 0 }));
    this.hits = []; this.pending = [];
    if (this.inst === 'drums') this.bindDrums(g);
    if (this.inst === 'piano' || this.inst === 'drums') Midi.init();
    // MIDI keys and basses make no sound of their own: voice them
    if (this.inst === 'piano' || this.inst === 'bass') { this._midiKeys = (note, vel, t) => { if (!this.active) return; const at = AudioEngine.ctx.currentTime + 0.003;
      if (this.inst === 'piano') AudioEngine.keyNote(note, at, vel / 127); else AudioEngine.onPlayerBus(() => AudioEngine.kit.bass(at, note, 0.6, 0.9)); }; Midi.listeners.add(this._midiKeys); }
  },
  timeTarget(t, cfg){
    if (t.k != null) { const c = cfg, beat = Math.floor(t.k / c.sub), i = t.k % c.sub; t.b0 = t.k / c.sub; t.t0 = c.startTime + beat * c.beatDur + i * c.stepDur + Groove.swingOff(i) * c.beatDur; t.t1 = t.t0 + 0.05; return; }
    t.t0 = cfg.startTime + t.b0 * cfg.beatDur; t.t1 = cfg.startTime + t.b1 * cfg.beatDur;
  },

  /* ---------- listening ---------- */
  // bass pitch: the long window, downsampled 4x (12 kHz), McLeod over 38..420 Hz
  bassPitch(raw){
    if (!Mic.on || !Mic.anLong) return null;
    const src = Mic.longBuf; Mic.anLong.getFloatTimeDomainData(src);
    const D = 4, N = Math.min(1400, Math.floor(src.length / D)), x = this._bx || (this._bx = new Float32Array(1400)), off = src.length - N * D;
    let e = 0; for (let i = 0; i < N; i++) { let v = 0; for (let j = 0; j < D; j++) v += src[off + i * D + j]; x[i] = v / D; e += x[i] * x[i]; }
    const E = Mic.ears.bass, rms = Math.sqrt(e / N); if (rms < (raw ? 0.0015 : E ? E.gate : Math.max(0.005, Mic.gate() * 1.6))) return null;
    const sr = Mic.sr / D, minLag = Math.floor(sr / 420), maxLag = Math.min(Math.floor(sr / 38), N - 200);
    const nsdf = this._bn || (this._bn = new Float32Array(1400));
    for (let tau = minLag; tau <= maxLag + 1; tau++) { let ac = 0, m = 0; for (let i = 0; i < N - tau; i++) { const a = x[i], b = x[i + tau]; ac += a * b; m += a * a + b * b; } nsdf[tau] = m ? 2 * ac / m : 0; }
    let gmax = 0; for (let t = minLag; t <= maxLag; t++) if (nsdf[t] > gmax) gmax = nsdf[t];
    if (gmax < 0.6) return null;
    let best = -1; for (let t = minLag + 1; t <= maxLag; t++) if (nsdf[t] > nsdf[t - 1] && nsdf[t] >= nsdf[t + 1] && nsdf[t] >= 0.86 * gmax) { best = t; break; }
    if (best < 0) return null;
    const a = nsdf[best - 1], b = nsdf[best], c = nsdf[best + 1], sh = (a - c) / (2 * (a - 2 * b + c) || 1);
    const f = sr / (best + (Number.isFinite(sh) ? sh : 0));
    return { m: 69 + 12 * Math.log2(f / 440), rms };
  },
  // the notes sounding now, as pitch classes: MIDI keys held, else the note model
  heardPcs(){
    const held = Midi.held(); if (held.length) return { pcs: new Set(held.map(mod12)), midi: true };
    const ns = Mic.on ? Mic.heardNotes() : []; return { pcs: new Set(ns.map(n => mod12(n.m))), midi: false };
  },

  /* ---------- each frame: bass and piano ---------- */
  noteFrame(g, now){
    const tJ = now - (Settings.latency || 0) / 1000 - 0.03;
    let ok = null;
    if (this.inst === 'bass') {
      const v = (this.frameN % 2) ? this.lastVoice : (this.lastVoice = Midi.held().length ? { m: Midi.held()[0], rms: 0.1 } : this.bassPitch());
      if (v) { this.trail.push({ t: tJ, m: v.m }); }
      while (this.trail.length && this.trail[0].t < tJ - 3) this.trail.shift();
      ok = t => v && this.pcCents(v.m, t.m) <= 60;
    } else {
      const h = this.heardPcs(); this.lastHeard = h;
      // a chord counts when its notes are there (all but one of four or more) and at most one stray note
      ok = t => { const need = t.pcs.length >= 4 ? t.pcs.length - 1 : t.pcs.length; let have = 0; t.pcs.forEach(p => { if (h.pcs.has(p)) have++; }); let stray = 0; h.pcs.forEach(p => { if (!t.pcs.includes(p)) stray++; }); return have >= need && stray <= 1; };
    }
    const late = this.inst === 'piano' ? 0.35 : 0.28;
    for (const t of this.targets) {
      if (t.result) continue;
      const win1 = t.t0 + Math.min(late, (t.t1 - t.t0) * 0.8);
      if (tJ < t.t0 - 0.15) break;
      if (ok(t)) { t.okN++; if (t.firstOk == null && t.okN >= 2) t.firstOk = tJ; }
      if (tJ > win1 || (t.firstOk != null && tJ > t.t0 + 0.05)) this.judgeTiming(g, t, t.firstOk == null ? null : Math.max(0, t.firstOk - t.t0 - 0.02), now);
    }
    if (tJ > this.endT + 0.4) this.finish(g);
  },
  // shared scoring for timed parts: dt = how late (s) the right sound came, null = never
  judgeTiming(g, t, dt, now){
    t.result = dt == null ? 'miss' : dt <= 0.07 ? 'perfect' : dt <= 0.13 ? 'great' : dt <= 0.2 ? 'good' : 'ok';
    t.frac = t.result === 'miss' ? 0 : 1;
    const pts = this.RESULT_PTS[t.result];
    g.counts[t.result]++; g.accSum += pts; g.judgedN++;
    if (t.result === 'miss') { g.combo = 0; g.lastMissAt = now; g.addDanger(this.inst === 'drums' ? 0.045 : 0.08); g.addHype(-0.04); }
    else {
      g.combo++; g.maxCombo = Math.max(g.maxCombo, g.combo); const mult = 1 + Math.min(3, Math.floor(g.combo / 8));
      g.score += Math.round(pts * mult * (this.inst === 'drums' ? 0.5 : 1)); g.lastGoodAt = now; g.lastStrumAt = now;
      g.addHype(t.result === 'perfect' ? 0.045 : t.result === 'great' ? 0.03 : 0.012); g.addDanger(-0.03);
      if (t.result === 'perfect') { const p = Stage.hitPt || { x: 100, y: 60 }; Stage.burst(p.x, p.y, 8); Stage.flash = 1; }
    }
    if (this.inst !== 'drums' || t.result !== 'miss' || Math.random() < 0.5) Stage.popup(t.result === 'miss' ? 'MISS' : t.result.toUpperCase() + '!', t.result === 'miss' ? COL.coral : t.result === 'perfect' ? COL.sun : COL.mint);
    UI.hudUpdate();
  },

  /* ---------- drums ---------- */
  bindDrums(g){
    this.drumSrc = '';
    Mic.onsetListeners.clear();
    Mic.onsetListeners.add(t => this.drumHit(Calib.classify(), t - (Settings.latency || 0) / 1000, 'mic'));   // trained: which drum; untrained: timing only
    this._midiDrum = (note, vel, t) => { const lane = DRUM_MIDI[note]; if (lane) this.drumHit(lane, t, 'midi'); };
    Midi.listeners.add(this._midiDrum);
  },
  unbindDrums(){ if (this._midiDrum) Midi.listeners.delete(this._midiDrum); if (this._midiKeys) Midi.listeners.delete(this._midiKeys); this._midiDrum = this._midiKeys = null; },
  // a hit from the keyboard, pads, MIDI (lane known) or the mic (lane unknown: timing only, nearest drum)
  drumHit(lane, t, src){
    if (!this.active || this.inst !== 'drums' || !G.running || G.paused) return;
    t = t == null ? AudioEngine.now() : t;
    if (src !== 'mic') { const kit = AudioEngine.kit, at = AudioEngine.ctx.currentTime + 0.005; AudioEngine.onPlayerBus(() => { if (lane === 'kick') kit.kick(at, 0.95); else if (lane === 'snare') kit.snare(at, 0.8); else kit.hat(at, 0.6); }); Mic.deaf && Mic.deaf(0.12); }
    this.drumSrc = src;
    this.hits.push({ t: t + (src === 'mic' ? 0 : 0), kind: lane || 'snare' }); if (this.hits.length > 40) this.hits.shift();
    let best = null, bd = 0.17;
    for (const tg of this.targets) { if (tg.result || (lane && tg.lane !== lane)) continue; const d = Math.abs(t - tg.t0); if (d < bd) { bd = d; best = tg; } if (tg.t0 > t + 0.2) break; }
    if (best) this.judgeTiming(G, best, Math.max(0, bd - 0.02), AudioEngine.now());
    UI.drumPad && UI.drumPad(lane);
  },
  drumFrame(g, now){
    const tJ = now - (Settings.latency || 0) / 1000;
    for (const t of this.targets) { if (t.result) continue; if (t.t0 > tJ - 0.17) break; this.judgeTiming(g, t, null, now); }
    if (tJ > this.endT + 0.4) this.finish(g);
  },
  // the band's drummer plays what the player plays
  drumEvents(now){ return this.hits.filter(h => h.t > now - 1.6 && h.t <= now + 0.02); },

  /* ---------- the rail ---------- */
  drawBandRail(c, o){
    const { W, railY, railH, hitX, ppb, curB, now } = o, spb = Groove.cfg.beatDur, st = Groove.cfg.startTime;
    const X = t => hitX + ((t - st) / spb - curB) * ppb, top = railY + 8, h = railH - 16;
    const col = t => t.result === 'skip' ? 'rgba(255,255,255,.4)' : t.result ? (t.result === 'miss' ? 'rgba(229,72,77,.6)' : COL.mint) : null;
    if (this.inst === 'bass') {
      // tab: G on top, E at the bottom
      const y = s => top + h * (0.14 + (3 - s) * 0.24);
      c.strokeStyle = 'rgba(30,27,46,.45)'; c.lineWidth = 2; for (let s = 0; s < 4; s++) { c.beginPath(); c.moveTo(0, y(s)); c.lineTo(W, y(s)); c.stroke(); }
      c.font = `800 ${Math.round(h * 0.13)}px ${UI_FONT}`; c.fillStyle = 'rgba(30,27,46,.5)'; c.textAlign = 'left'; c.textBaseline = 'middle'; ['E', 'A', 'D', 'G'].forEach((n, s) => c.fillText(n, 4, y(s)));
      for (const t of this.targets) {
        const x0 = X(t.t0), x1 = X(t.t1); if (x1 < -20 || x0 > W + 20) continue;
        const r = Math.max(9, h * 0.11), yy = y(t.s);
        c.fillStyle = col(t) || COL.grape; c.globalAlpha = t.result === 'skip' ? 0.5 : 1;
        rr(c, x0 - r, yy - r, Math.max(r * 2, x1 - x0 - 4 + r), r * 2, r); c.fill(); c.lineWidth = 2.5; c.strokeStyle = COL.ink; c.stroke();
        c.fillStyle = col(t) ? COL.ink : '#fff'; c.font = `${Math.round(r * 1.25)}px ${DISPLAY_FONT}`; c.textAlign = 'center'; c.fillText(String(t.f), x0, yy + 1); c.globalAlpha = 1;
      }
    } else if (this.inst === 'piano') {
      for (const t of this.targets) {
        const x0 = X(t.t0), x1 = X(t.t1); if (x1 < -20 || x0 > W + 20) continue;
        const w = Math.max(40, x1 - x0 - 6), cc = col(t) || cardColor(t.label);
        c.fillStyle = cc; rr(c, x0, top, w, h, 12); c.fill(); c.lineWidth = 3; c.strokeStyle = COL.ink; c.stroke();
        c.fillStyle = textOn(cc); c.font = `${Math.round(Math.min(h * 0.45, 30))}px ${DISPLAY_FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
        let lx = x0 + 10; if (x0 < hitX + 18 && x0 + w > hitX) lx = Math.max(x0 + 10, Math.min(hitX + 20, x0 + w - 60));
        c.fillText(t.label, lx, top + h * 0.4);
        c.font = `800 ${Math.round(Math.min(h * 0.2, 14))}px ${UI_FONT}`; c.fillText(t.keys.map(m => NOTE_NAMES[mod12(m)]).join(' '), lx, top + h * 0.78);
      }
    } else if (this.inst === 'drums') {
      const y = lane => top + h * (0.18 + DRUM_LANES.indexOf(lane) * 0.32), lc = { hat: COL.sun, snare: '#FFFFFF', kick: COL.coral };
      c.strokeStyle = 'rgba(30,27,46,.3)'; c.lineWidth = 2; DRUM_LANES.forEach(l => { c.beginPath(); c.moveTo(0, y(l)); c.lineTo(W, y(l)); c.stroke(); });
      c.font = `800 ${Math.round(h * 0.12)}px ${UI_FONT}`; c.fillStyle = 'rgba(30,27,46,.55)'; c.textAlign = 'left'; c.textBaseline = 'middle';
      DRUM_LANES.forEach(l => c.fillText(l === 'hat' ? 'HAT' : l === 'snare' ? 'SNARE' : 'KICK', 4, y(l) - h * 0.12));
      for (const t of this.targets) {
        const x = X(t.t0); if (x < -20 || x > W + 20) continue;
        const r = Math.max(8, h * (t.lane === 'kick' ? 0.12 : 0.1)), yy = y(t.lane);
        c.fillStyle = col(t) || lc[t.lane]; c.beginPath(); if (t.lane === 'hat') { c.moveTo(x, yy - r); c.lineTo(x + r, yy); c.lineTo(x, yy + r); c.lineTo(x - r, yy); c.closePath(); } else c.arc(x, yy, r, 0, Math.PI * 2);
        c.fill(); c.lineWidth = 2.5; c.strokeStyle = COL.ink; c.stroke();
      }
    }
    // bass: the player's pitch as a dot on the string it would be on
    if (this.inst === 'bass') { const last = this.trail[this.trail.length - 1], nowJ = now - (Settings.latency || 0) / 1000 - 0.03;
      if (last && nowJ - last.t < 0.15) { const sp = this.bassSpot(Math.round(last.m)); const yy = top + h * (0.14 + (3 - sp.s) * 0.24);
        c.fillStyle = COL.coral; c.beginPath(); c.arc(hitX, yy, Math.max(6, h * 0.08), 0, Math.PI * 2); c.fill(); c.lineWidth = 2.5; c.strokeStyle = COL.ink; c.stroke(); } }
  },

  /* ---------- the panel under the stage ---------- */
  bandPanelFrame(now){
    const box = UI.bandBox; if (!box) return;
    const tJ = now - (Settings.latency || 0) / 1000;
    const cur = this.targets.find(t => !t.result && t.t1 > tJ - 0.05), i = cur ? this.targets.indexOf(cur) : -1;
    const nxt = i >= 0 ? this.targets.slice(i + 1).find(t => this.inst !== 'drums' || t.lane) : null;
    const key = this.inst + i;
    if (key === this.panelKey) return;
    this.panelKey = key;
    if (this.inst === 'bass') {
      box.big.textContent = cur ? cur.name : '';
      box.sub.textContent = cur ? `${['E', 'A', 'D', 'G'][cur.s]} string, ${cur.f ? 'fret ' + cur.f : 'open'} · under ${cur.chord}` : '';
      box.next.textContent = nxt ? `Next: ${nxt.name}` : '';
      box.pic.innerHTML = cur ? bassNeckSvg(cur.s, cur.f) : '';
    } else if (this.inst === 'piano') {
      box.big.textContent = cur ? cur.label : '';
      box.sub.textContent = cur ? cur.keys.map(m => NOTE_NAMES[mod12(m)]).join(' · ') : '';
      box.next.textContent = nxt ? `Next: ${nxt.label}` : '';
      box.pic.innerHTML = cur ? keyboardSvg(cur.keys, cur.root) : '';
    } else {
      box.big.textContent = 'Drums';
      box.sub.textContent = Midi.name ? `MIDI kit: ${Midi.name}` : Mic.on ? (Mic.ears.drums ? 'Mic: your drums (trained) · keys F kick, J snare, K hat' : 'Mic: hit any drum in time · keys F kick, J snare, K hat') : 'Keys: F kick · J snare · K hat, or tap the pads';
      box.next.textContent = '';
    }
  },
});

/* ---------- small diagrams ---------- */
function bassNeckSvg(s, f){
  const W = 300, H = 74, fx = k => 22 + k * 34, sy = k => 12 + (3 - k) * 16;
  let g = `<svg viewBox="0 0 ${W} ${H}" class="neck" aria-hidden="true"><rect x="22" y="6" width="${W - 30}" height="${H - 12}" rx="6" fill="#C58B5B" stroke="#1E1B2E" stroke-width="3"/>`;
  g += `<rect x="18" y="6" width="7" height="${H - 12}" fill="#FFF7E6" stroke="#1E1B2E" stroke-width="2"/>`;
  for (let k = 1; k <= 8; k++) g += `<line x1="${fx(k)}" y1="6" x2="${fx(k)}" y2="${H - 6}" stroke="#E9D9C0" stroke-width="3"/>`;
  [3, 5, 7].forEach(k => { g += `<circle cx="${fx(k) - 17}" cy="${H / 2}" r="4" fill="#FFF7E6"/>`; });
  for (let k = 0; k < 4; k++) g += `<line x1="18" y1="${sy(k)}" x2="${W - 8}" y2="${sy(k)}" stroke="#1E1B2E" stroke-width="${3.4 - k * 0.5}"/><text x="4" y="${sy(k) + 4}" font-size="11" font-weight="800" fill="#1E1B2E">${'EADG'[k]}</text>`;
  const cx = f === 0 ? 12 : fx(f) - 17;
  g += `<circle cx="${cx}" cy="${sy(s)}" r="9" fill="#7B5CF0" stroke="#1E1B2E" stroke-width="3"/><text x="${cx}" y="${sy(s) + 4}" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">${f}</text></svg>`;
  return g;
}
function keyboardSvg(keys, root){
  const lo = 48, hi = 76, white = [], black = [], isB = m => [1, 3, 6, 8, 10].includes(mod12(m));
  for (let m = lo; m <= hi; m++) (isB(m) ? black : white).push(m);
  const kw = 20, W = white.length * kw + 4, H = 78;
  const xw = m => 2 + white.indexOf(m) * kw;
  let g = `<svg viewBox="0 0 ${W} ${H}" class="keys" aria-hidden="true">`;
  for (const m of white) { const on = keys.includes(m); g += `<rect x="${xw(m)}" y="2" width="${kw}" height="${H - 4}" rx="4" fill="${on ? (mod12(m) === mod12(root) ? '#FF5E7E' : '#FFCE3A') : '#FFFFFF'}" stroke="#1E1B2E" stroke-width="2.5"/>`; if (m % 12 === 0) g += `<text x="${xw(m) + kw / 2}" y="${H - 8}" text-anchor="middle" font-size="9" font-weight="800" fill="#1E1B2E">C${m / 12 - 1}</text>`; }
  for (const m of black) { const x = xw(m - 1) + kw * 0.66, on = keys.includes(m); g += `<rect x="${x}" y="2" width="${kw * 0.68}" height="${H * 0.58}" rx="3" fill="${on ? (mod12(m) === mod12(root) ? '#FF5E7E' : '#FFCE3A') : '#1E1B2E'}" stroke="#1E1B2E" stroke-width="2.5"/>`; }
  return g + '</svg>';
}
