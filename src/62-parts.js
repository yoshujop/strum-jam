/* =====================================================================
   Parts: the instruments other than guitar, played on Stage with the band.
   G (60-game.js) still runs the song, the band, the hype and the fail
   state; when G.opts.inst isn't guitar it hands each frame to Parts,
   which judges the player's part and draws its lane on the rail.
   Vocals: the melody (or, without it, the chord's notes) on an octave-free
   pitch lane, the lyrics line by line in the panel under the stage.
   ===================================================================== */
const INST_NAMES = { guitar: 'Guitar', vocals: 'Vocals', bass: 'Bass', piano: 'Piano', drums: 'Drums' };
const Parts = {
  active: false, inst: 'guitar', targets: [], lines: [], trail: [], guide: false, endT: 0, lastVoice: null, frameN: 0,
  RESULT_PTS: { perfect: 100, great: 80, good: 50, ok: 20, miss: 0 },
  // how the vocal rail should look (Stage asks while drawing)
  tallRail(){ return this.active && this.inst === 'vocals'; },

  /* ---------- building the part (in chart beats) ---------- */
  // vox: {lines: [{t0, t1, text}] in recording seconds, map (Lyrics map), melody: [{t0, t1, m}] or null}
  vocalTargets(chart, vox, fromBeat, endBeat){
    const B = t => Lyrics.mapBeat(vox.map, t);
    const lines = vox.lines.map(l => ({ b0: B(l.t0), b1: B(l.t1), text: l.text })).filter(l => l.b1 > fromBeat && l.b0 < endBeat);
    // a line ends where its singing ends, not where the next one starts: trim long gaps to 2 bars
    lines.forEach(l => { l.b1 = Math.min(l.b1, l.b0 + chart.beats * 2 + Math.max(2, l.text.length / 5)); });
    const pcsAt = b => { let e = null; for (const x of chart.events) { if (x.beat <= b + 1e-6) e = x; else break; } const ch = e && !e.rest && parseChord(e.sounds); return ch ? chordPcs(ch) : null; };
    let targets = [];
    if (vox.melody && vox.melody.length) {
      targets = vox.melody.map(n => ({ b0: B(n.t0), b1: B(n.t1), m: n.m })).filter(n => n.b1 > fromBeat && n.b0 < endBeat && n.b1 - n.b0 > 0.12);
    } else {
      // no melody: while a line is sung, any note of the chord under it scores (the melody mostly sits on them)
      for (const l of lines) {
        for (const e of chart.events) {
          if (e.rest) continue;
          const a = Math.max(l.b0, e.beat), b = Math.min(l.b1, e.beat + e.len); if (b - a < 0.5) continue;
          const ch = parseChord(e.sounds); if (ch) targets.push({ b0: a, b1: b, pcs: chordPcs(ch), label: e.sounds });
        }
      }
    }
    targets.forEach(t => { if (!t.pcs && t.m == null) t.pcs = pcsAt(t.b0); });
    return { lines, targets };
  },

  begin(g, chart, opts, cfg){
    this.active = true; this.inst = opts.inst; this.trail = []; this.frameN = 0; this.lastVoice = null;
    const fromBeat = g.fromBar * chart.beats, endBeat = g.endBar * chart.beats;
    const T = b => cfg.startTime + b * cfg.beatDur;
    if (this.inst === 'vocals') {
      const v = this.vocalTargets(chart, opts.vox, fromBeat, endBeat);
      this.guide = !(opts.vox.melody && opts.vox.melody.length);
      this.lines = v.lines.map(l => ({ ...l, t0: T(l.b0), t1: T(l.b1) }));
      this.targets = v.targets.map(t => ({ ...t, t0: T(t.b0), t1: T(t.b1), n: 0, hit: 0, voiced: 0, result: null }));
    }
    g.trackEvents = []; g.list = [];
    this.endT = T(endBeat);
    this.lineIdx = 0; this.panelKey = '';
    this.comp = { next: fromBeat, cfg, chart, endBeat };
    UI.partPanel(this.inst);
    return this.targets.length > 0;
  },
  // after a pause: the band starts again from the bar we stopped in, so everything not yet judged moves to the new clock
  resumeAt(g, fromBeat, cfg){
    const T = b => cfg.startTime + b * cfg.beatDur;
    for (const t of this.targets) { if (t.result) continue; if (t.b0 < fromBeat) { t.result = 'skip'; continue; } t.t0 = T(t.b0); t.t1 = T(t.b1); t.n = t.hit = t.voiced = 0; }
    this.lines.forEach(l => { l.t0 = T(l.b0); l.t1 = T(l.b1); });
    this.endT = T(this.comp.endBeat); this.comp.cfg = cfg; this.comp.next = fromBeat; this.trail = []; this.panelKey = '';
  },
  // how wide the singer's mouth is: the voice's loudness while it's being heard
  mouthOpen(now){ const v = this.lastVoice; return v ? Math.min(1, 0.35 + v.rms * 9) : 0; },
  progress(){ const n = this.targets.length; return n ? this.targets.filter(t => t.result).length / n : 0; },
  end(){ this.active = false; this.targets = []; this.lines = []; UI.partPanel(null); },

  /* ---------- the voice: McLeod pitch on the small analyser (2048 samples), 75..1000 Hz ---------- */
  voice(){
    if (!Mic.on || !Mic.anSmall) return null;
    const x = Mic.timeBuf; Mic.anSmall.getFloatTimeDomainData(x);
    const N = x.length, sr = Mic.sr;
    let e = 0; for (let i = 0; i < N; i++) e += x[i] * x[i];
    const rms = Math.sqrt(e / N); if (rms < Math.max(0.006, Mic.gate() * 2)) return null;
    const minLag = Math.floor(sr / 1000), maxLag = Math.min(Math.floor(sr / 75), N >> 1);
    const nsdf = this._nsdf || (this._nsdf = new Float32Array(2048));
    for (let tau = minLag; tau <= maxLag + 1; tau++) {
      let ac = 0, m = 0; const L = N - tau;
      for (let i = 0; i < L; i++) { const a = x[i], b = x[i + tau]; ac += a * b; m += a * a + b * b; }
      nsdf[tau] = m ? 2 * ac / m : 0;
    }
    let gmax = 0; for (let t = minLag; t <= maxLag; t++) if (nsdf[t] > gmax) gmax = nsdf[t];
    if (gmax < 0.55) return null;
    let best = -1;
    for (let t = minLag + 1; t <= maxLag; t++) if (nsdf[t] > nsdf[t - 1] && nsdf[t] >= nsdf[t + 1] && nsdf[t] >= 0.86 * gmax) { best = t; break; }
    if (best < 0) return null;
    const a = nsdf[best - 1], b = nsdf[best], c = nsdf[best + 1], sh = (a - c) / (2 * (a - 2 * b + c) || 1);
    const f = sr / (best + (Number.isFinite(sh) ? sh : 0));
    return f >= 75 && f <= 1000 ? { m: 69 + 12 * Math.log2(f / 440), clarity: b, rms } : null;
  },
  // cents between a sung pitch and a target, ignoring octaves
  pcCents(m, target){ const d = ((m - target) % 12 + 18) % 12 - 6; return Math.abs(d) * 100; },
  targetCents(m, t){ return t.m != null ? this.pcCents(m, t.m) : Math.min(...t.pcs.map(p => this.pcCents(m, p))); },

  /* ---------- each frame ---------- */
  frame(g, now){
    this.frameN++;
    g.beatNow = Groove.beatAt(now); g.trackBeat = g.beatNow;
    { const c = g.chart; let k = 0; for (let i = 0; i < c.sections.length; i++) if (g.beatNow >= c.sections[i].startBeat) k = i; if (k !== g.sectionIndex) g.sectionIndex = k; }
    this.compFrame(now);
    const tJ = now - (Settings.latency || 0) / 1000 - 0.03;       // the sound we're hearing now was sung a moment ago
    const v = (this.frameN & 1) ? this.lastVoice : (this.lastVoice = this.voice());
    if (v) { this.trail.push({ t: tJ, m: v.m }); }
    while (this.trail.length && this.trail[0].t < tJ - 3) this.trail.shift();
    for (const t of this.targets) {
      if (t.result || tJ < t.t0) continue;
      if (tJ <= t.t1) {
        t.n++;
        if (v) { t.voiced++; const c = this.targetCents(v.m, t); if (c <= 80) t.hit += c <= 35 ? 1 : c <= 55 ? 0.8 : 0.55; t.live = c <= 80; } else t.live = false;
        continue;
      }
      this.judge(g, t, now);
    }
    this.lyricsFrame(now);
    if (tJ > this.endT + 0.4) this.finish(g);
  },
  judge(g, t, now){
    const frac = t.n ? t.hit / t.n : 0, dur = t.t1 - t.t0;
    // short notes are hard to hit dead on (and the melody's timing is approximate): easier bars for them
    const k = dur < 0.3 ? 0.7 : 1;
    t.result = frac >= 0.7 * k ? 'perfect' : frac >= 0.5 * k ? 'great' : frac >= 0.3 * k ? 'good' : frac >= 0.12 * k ? 'ok' : 'miss';
    t.frac = frac;
    const pts = this.RESULT_PTS[t.result], w = Math.max(0.5, Math.min(2, dur / 0.5));
    g.counts[t.result]++; g.accSum += pts; g.judgedN++;
    if (t.result === 'miss') {
      g.combo = 0; g.lastMissAt = now;
      // silence during a guide bar only counts a little: the words don't fill every beat
      g.addDanger(t.voiced / Math.max(1, t.n) < 0.1 && this.guide ? 0.03 : 0.07); g.addHype(-0.04);
    } else {
      g.combo++; g.maxCombo = Math.max(g.maxCombo, g.combo);
      const mult = 1 + Math.min(3, Math.floor(g.combo / 8));
      g.score += Math.round(pts * w * mult); g.lastGoodAt = now;
      g.addHype(t.result === 'perfect' ? 0.05 : t.result === 'great' ? 0.035 : 0.015); g.addDanger(-0.03);
      if (t.result === 'perfect' || t.result === 'great') { const p = Stage.hitPt || { x: 100, y: 60 }; Stage.burst(p.x, p.y, t.result === 'perfect' ? 10 : 6); }
    }
    Stage.popup(t.result === 'miss' ? 'MISS' : t.result.toUpperCase() + '!', t.result === 'miss' ? COL.coral : t.result === 'perfect' ? COL.sun : COL.mint);
    UI.hudUpdate();
  },
  // the band's chords under the singer (headphones only: from a speaker they'd leak into the mic)
  compFrame(now){
    const c = this.comp; if (!c || !Groove.pitchedOk()) return;
    const ahead = Groove.beatAt(now + 0.25);
    while (c.next <= ahead && c.next < c.endBeat) {
      const b = c.next, e = c.chart.events.find(x => x.beat === b);
      if (e && !e.rest && e.notes && b >= Groove.beatAt(now) - 0.1) AudioEngine.strum(e.notes.map(m => m), c.cfg.startTime + b * c.cfg.beatDur, 0.012, 0.42);
      const nx = c.chart.events.find(x => x.beat > b + 1e-6); c.next = nx ? nx.beat : c.endBeat;
    }
  },
  lyricsFrame(now){
    const box = UI.voxBox; if (!box) return;
    const tJ = now - (Settings.latency || 0) / 1000;
    let i = this.lines.findIndex(l => tJ < l.t1);
    if (i < 0) i = this.lines.length;
    const cur = this.lines[i], nxt = this.lines[i + 1];
    const key = i + '|' + (cur && tJ >= cur.t0 - 0.05 ? 1 : 0);
    if (key !== this.panelKey) {
      this.panelKey = key;
      // one span per word, each lit when the singing reaches its first letter
      box.cur.innerHTML = cur ? cur.text.split(/\s+/).map(w => `<span>${esc(w)}</span>`).join(' ') : '';
      this.words = cur ? cur.text.split(/\s+/).reduce((a, w) => { a.at.push(a.n); a.n += w.length + 1; return a; }, { at: [], n: 0 }) : null;
      this.lit = -1;
      box.next.textContent = nxt ? nxt.text : '';
      box.cur.classList.toggle('on', !!cur && tJ >= cur.t0 - 0.05);
    }
    // the words light up across the line as it's sung (the line's letters spread over its time)
    const p = cur && tJ >= cur.t0 ? Math.min(1, (tJ - cur.t0) / Math.max(0.3, (cur.t1 - cur.t0) * 0.9)) : 0;
    if (this.words) {
      const pos = p * this.words.n; let k = -1; this.words.at.forEach((a, i) => { if (p > 0 && a <= pos) k = i; });
      if (k !== this.lit) { this.lit = k; [...box.cur.children].forEach((sp, i) => sp.classList.toggle('sung', i <= k)); }
    }
    // a countdown dot row before a line after a long gap
    const wait = cur ? cur.t0 - tJ : 0;
    box.count.textContent = wait > 0.3 && wait < 3.2 && (i === 0 || this.lines[i - 1].t1 < cur.t0 - 2.5) ? '●'.repeat(Math.ceil(wait)) : '';
  },
  finish(g){
    if (!g.running) return;
    g.running = false; Groove.stop(); Mic.onsetListeners.clear();
    const acc = g.judgedN ? g.accSum / (100 * g.judgedN) : 0;
    const grade = acc >= 0.9 ? ['S', 'Superstar!'] : acc >= 0.75 ? ['A', 'What a Voice!'] : acc >= 0.6 ? ['B', 'Nice Pipes!'] : acc >= 0.4 ? ['C', 'Getting There'] : ['D', 'Keep Singing'];
    const inTune = this.targets.reduce((a, t) => a + t.hit, 0) / Math.max(1, this.targets.reduce((a, t) => a + t.n, 0));
    // the toughest lines: where the most bars were missed
    const byLine = this.lines.map(l => { const ts = this.targets.filter(t => t.t0 >= l.t0 - 0.05 && t.t0 < l.t1); return { label: l.text.length > 34 ? l.text.slice(0, 32) + '…' : l.text, frac: ts.length ? ts.reduce((a, t) => a + (t.frac || 0), 0) / ts.length : 1, n: ts.length }; });
    const tough = byLine.filter(x => x.n && x.frac < 0.35).sort((a, b) => a.frac - b.frac).slice(0, 3);
    const res = { mode: 'stage', inst: this.inst, chart: g.chart, score: g.score, acc, grade: grade[0], title: grade[1], counts: g.counts, maxCombo: g.maxCombo,
      noteAcc: inTune, tough, tap: false, tempo: g.opts.tempo, topLevel: g.topLevel, guide: this.guide };
    const best = Store.get('best', {}), k = g.chart.song.id + ':' + this.inst;
    res.newBest = !best[k] || g.score > best[k].score;
    if (res.newBest) { best[k] = { score: g.score, grade: grade[0] }; Store.set('best', best); }
    this.end();
    UI.showResults(res);
  },

  /* ---------- the lane on the rail ---------- */
  // octave-free: 12 rows, C at the bottom. Notes scroll right to left past the hit line like the chord cards.
  drawRail(c, o){
    const { W, railY, railH, hitX, ppb, curB, now } = o;
    const top = railY + 8, h = railH - 16, rowH = h / 12, y = pc => top + h - ((pc % 12) + 0.5) * rowH;
    // rows: the chord's notes lit faintly (a guide even when there's a melody)
    c.fillStyle = 'rgba(30,27,46,.06)'; for (let r = 0; r < 12; r += 2) c.fillRect(0, top + h - (r + 1) * rowH, W, rowH);
    const spb = Groove.cfg ? Groove.cfg.beatDur : 0.5, bx = t => hitX + ((t - Groove.cfg.startTime) / spb - curB) * ppb;
    for (const t of this.targets) {
      const x0 = bx(t.t0), x1 = bx(t.t1); if (x1 < -10 || x0 > W + 10) continue;
      const col = t.result === 'skip' ? 'rgba(255,255,255,.35)' : t.result ? (t.result === 'miss' ? 'rgba(229,72,77,.55)' : COL.mint) : t.live ? COL.sun : t.m != null ? '#9BE7DF' : '#FFFFFF';
      const pcs = t.m != null ? [t.m] : t.pcs;
      for (const p of pcs) {
        const yy = y(p), hh = Math.max(5, rowH * (t.m != null ? 0.9 : 0.7));
        c.fillStyle = col; rr(c, x0, yy - hh / 2, Math.max(6, x1 - x0 - 2), hh, hh / 2); c.fill();
        c.lineWidth = 2.5; c.strokeStyle = COL.ink; c.stroke();
      }
      if (t.label && x1 - x0 > 40 && this.guide) { c.font = `800 ${Math.max(10, Math.round(rowH * 1.1))}px ${UI_FONT}`; c.fillStyle = COL.ink; c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillText(t.label, x0 + 4, top + 12); }
    }
    // the singer's own pitch: a trail behind the hit line
    const nowJ = now - (Settings.latency || 0) / 1000 - 0.03;
    c.lineWidth = 4; c.lineCap = 'round'; c.strokeStyle = COL.coral;
    let prev = null;
    for (const p of this.trail) {
      const x = hitX - (nowJ - p.t) / spb * ppb, yy = y(((p.m % 12) + 12) % 12);
      if (prev && p.t - prev.t < 0.12 && Math.abs(yy - prev.y) < h * 0.4) { c.beginPath(); c.moveTo(prev.x, prev.y); c.lineTo(x, yy); c.stroke(); }
      prev = { x, y: yy, t: p.t };
    }
    const last = this.trail[this.trail.length - 1];
    if (last && nowJ - last.t < 0.15) {
      const yy = y(((last.m % 12) + 12) % 12);
      c.fillStyle = COL.coral; c.beginPath(); c.arc(hitX, yy, Math.max(5, rowH * 0.7), 0, Math.PI * 2); c.fill(); c.lineWidth = 2.5; c.strokeStyle = COL.ink; c.stroke();
    }
  },
};
