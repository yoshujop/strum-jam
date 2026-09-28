/* =====================================================================
   Ear: chord listening that has to earn a "correct".
   1. A long Blackman-windowed FFT (≈0.7 s) resolves semitones cleanly.
   2. Each semitone gets a "tonal" energy: its peak minus the valley between
      neighbouring semitones, minus the mic's learned noise.
   3. Notes are pulled out one at a time by harmonic summation; each found
      note's overtones are cancelled (spectral smoothness), so an E3 doesn't
      also "prove" a B4 or an E4 that nobody played.
   4. A chord only counts when every one of its notes is present at the same
      time, the chord's notes carry most of the energy, and no strong wrong
      note is ringing. Works on any mic because every test is relative.
   ===================================================================== */
const Ear = (() => {
  const N = 32768;
  let rev = null, cosT = null, sinT = null, hann = null, re = null, im = null;
  function init(){
    if (rev) return;
    rev = new Uint32Array(N); const bits = Math.log2(N);
    for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    cosT = new Float32Array(N / 2); sinT = new Float32Array(N / 2);
    for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos(-2 * Math.PI * i / N); sinT[i] = Math.sin(-2 * Math.PI * i / N); }
    hann = new Float32Array(N); for (let i = 0; i < N; i++) { const a = 2 * Math.PI * i / (N - 1); hann[i] = 0.42 - 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a); }   // Blackman: low sidelobes
    re = new Float32Array(N); im = new Float32Array(N);
  }
  function fft(){
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let i = 0; i < N; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const tr = re[b] * cosT[k] - im[b] * sinT[k], ti = re[b] * sinT[k] + im[b] * cosT[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  }
  const mag = new Float32Array(N / 2);
  // samples: the most recent N samples (Float32Array)
  function spectrum(samples){
    init();
    const off = samples.length - N;
    for (let i = 0; i < N; i++) { re[i] = (samples[off + i] || 0) * hann[i]; im[i] = 0; }
    fft();
    for (let k = 0; k < N / 2; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * (4.76 / N);
    return mag;
  }
  // broadband floor: the median magnitude from 80 Hz to 3 kHz (noise, breath, room), used to demand a clear tonal chord
  const fl = new Float32Array(4096);
  function floorOf(mg, binHz){
    const a = Math.ceil(80 / binHz), b = Math.floor(3000 / binHz), step = Math.max(1, Math.floor((b - a) / 4096));
    let n = 0; for (let k = a; k < b && n < fl.length; k += step) fl[n++] = mg[k];
    const v = fl.subarray(0, n).sort(); return v[n >> 1] || 0;
  }
  const LO = 36, HI = 100;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  // tonal energy per semitone (raw, before noise removal)
  function semitones(mg, binHz, out){
    out = out || new Float32Array(128);
    out.fill(0);
    const at = x => { const i = Math.floor(x), f = x - i; return (mg[i] || 0) * (1 - f) + (mg[i + 1] || 0) * f; };
    for (let m = LO; m <= HI; m++) {
      const b = hz(m) / binHz; if (b < 3 || b >= mg.length - 4) continue;
      // a real spectral peak must sit within ±20 cents of the note (a neighbour's skirt doesn't count)
      const lo = Math.max(2, Math.floor(b * 0.9885)), hi = Math.min(mg.length - 2, Math.ceil(b * 1.0116));
      let pk = 0; for (let k = lo; k <= hi; k++) if (mg[k] > pk && mg[k] >= mg[k - 1] && mg[k] >= mg[k + 1]) pk = mg[k];
      const valley = Math.min(at(b * 0.9675), at(b * 1.0336));
      const t = pk - 1.25 * valley;
      out[m] = t > 0 ? t : 0;
    }
    return out;
  }
  // harmonic offsets in semitones for partials 1..16, and weights for the first 8
  const HO = [0, 12, 19, 24, 28, 31, 34, 36, 38, 40, 42, 43, 44, 46, 47, 48];
  const HW = [1, 0.9, 0.75, 0.62, 0.5, 0.42, 0.3, 0.32];
  // where overtones of a lower note land, and how strong a real note there must be to count on its own
  const EXPLAIN = { 19: 0.35, 31: 0.35, 36: 0.35, 28: 1.0, 34: 1.0, 38: 1.0, 40: 1.0, 42: 1.0, 43: 0.6, 44: 1.0 };
  let CFG = { stop: 0.17, fund: 0.25, cancel: 0.55, near: 1.25 };
  // pull notes out one at a time
  function estimate(T, noise){
    const R = new Float32Array(128);
    let total = 0;
    for (let m = LO; m <= HI; m++) { let v = T[m] - (noise ? 1.8 * noise[m] : 0); v = v > 0 ? Math.pow(v, 0.6) : 0; R[m] = v; total += v; }
    const notes = [];
    const R0 = Float32Array.from(R);
    if (total <= 0) return { notes, total: 0, R, R0 };
    let first = 0;
    for (let it = 0; it < 8; it++) {
      let best = -1, bs = 0;
      for (let m = 40; m <= 88; m++) {
        let s = 0, sup = 0;
        for (let h = 0; h < 8; h++) { const x = m + HO[h]; if (x > HI) break; s += HW[h] * R[x]; if (R[x] > 0) sup++; }
        if (sup < 3) continue;
        if (R[m] + R[m + 12] < CFG.fund * s) continue;          // a real note shows its fundamental or octave
        if (s > bs) { bs = s; best = m; }
      }
      if (best < 0) break;
      if (it === 0) first = bs;
      if (bs < first * CFG.stop) break;
      notes.push({ m: best, s: bs, f: R[best] });
      // cancel this note's partials, keeping what rises clearly above a smooth harmonic envelope
      const amp = HO.map(o => best + o <= HI ? R[best + o] : 0);
      for (let h = 0; h < HO.length; h++) {
        const x = best + HO[h]; if (x > HI) break;
        if (h === 0) { R[x] = 0; continue; }
        const nb = h === HO.length - 1 ? amp[h - 1] : (amp[h - 1] + amp[h + 1]) / 2;
        const est = Math.min(amp[h], Math.max(nb * CFG.near, amp[h] * CFG.cancel));
        R[x] = Math.max(0, R[x] - est);
      }
    }
    return { notes, total, R, R0 };
  }
  // notes that are probably just overtones of a stronger, lower note
  function markExplained(notes){
    for (const n of notes) {
      n.ex = notes.some(o => o !== n && o.m < n.m && EXPLAIN[n.m - o.m] && n.s < EXPLAIN[n.m - o.m] * o.s);
    }
    return notes;
  }
  function chroma(notes){
    const c = new Float32Array(12);
    for (const n of notes) if (!n.ex) c[n.m % 12] += n.s;
    return c;
  }
  const MODES = { relaxed: { purity: 0.66, cover: 0.1, wrong: 0.45 }, normal: { purity: 0.74, cover: 0.13, wrong: 0.3 }, strict: { purity: 0.82, cover: 0.18, wrong: 0.22 } };
  // target = { midis:[...] }  -> result with per-note detail
  function match(an, target, mode){
    const P = MODES[mode] || MODES.normal;
    const req = [...new Set(target.midis.map(m => m % 12))];
    const notes = an.notes.filter(n => !n.ex);
    let tot = 0, inE = 0, mx = 0;
    for (const n of notes) { tot += n.s; if (req.includes(n.m % 12)) inE += n.s; if (n.s > mx) mx = n.s; }
    const res = { ok: false, purity: tot ? inE / tot : 0, heardPcs: new Set(), missing: [], wrong: [], wrongNotes: [], level: tot };
    if (!tot) { res.missing = req.slice(); return res; }
    const pcS = new Float32Array(12); for (const n of notes) pcS[n.m % 12] = Math.max(pcS[n.m % 12], n.s);
    for (const pc of req) { if (pcS[pc] >= P.cover * mx) res.heardPcs.add(pc); else res.missing.push(pc); }
    for (const n of notes) if (!req.includes(n.m % 12) && n.s >= P.wrong * mx) { res.wrongNotes.push(n.m); if (!res.wrong.includes(n.m % 12)) res.wrong.push(n.m % 12); }
    res.ok = res.purity >= P.purity && res.missing.length === 0 && res.wrong.length === 0;
    return res;
  }
  /* Target-aware check: does the sound fit THIS chord's notes and their overtones,
     is each chord tone actually there, and is anything strong left over?          */
  const TMODES = { relaxed: { fit: 0.8, cover: 0.1, wrong: 0.55 }, normal: { fit: 0.87, cover: 0.14, wrong: 0.3 }, strict: { fit: 0.92, cover: 0.2, wrong: 0.22 } };
  let CLEAR = 15;
  function partialsOf(m, nH){ const out = []; for (let h = 0; h < nH; h++) { const x = m + HO[h]; if (x <= HI) out.push(x); } return out; }
  function greedy(R, maxN, top){
    const notes = [];
    const Rw = Float32Array.from(R);
    let first = 0;
    for (let it = 0; it < (maxN || 4); it++) {
      let best = -1, bs = 0;
      for (let m = 40; m <= (top || 88); m++) {
        let s2 = 0, sup = 0;
        for (let h = 0; h < 8; h++) { const x = m + HO[h]; if (x > HI) break; s2 += HW[h] * Rw[x]; if (Rw[x] > 0) sup++; }
        if (sup < 2 || Rw[m] + Rw[m + 12] < 0.3 * s2) continue;
        if (s2 > bs) { bs = s2; best = m; }
      }
      if (best < 0) break;
      if (!it) first = bs; else if (bs < 0.3 * first) break;
      notes.push({ m: best, s: bs });
      for (const x of partialsOf(best, 16)) Rw[x] *= 0.2;
    }
    return notes;
  }
  function matchTarget(an, target, mode){
    const P = TMODES[mode] || TMODES.normal;
    const R = an.R0;
    const exp = [...new Set(target.midis)].sort((a, b) => a - b);
    const isP = new Uint8Array(128);
    for (const m of exp) for (const x of partialsOf(m, 12)) isP[x] = 1;
    let tot = 0, fit = 0;
    for (let m = 40; m <= 88; m++) { tot += R[m]; if (isP[m]) fit += R[m]; }
    const res = { ok: false, fit: tot ? fit / tot : 0, purity: 0, heardPcs: new Set(), missing: [], wrong: [], wrongNotes: [], noteState: {}, level: tot, clear: 0 };
    res.purity = res.fit;
    // the chord's partials must stand far above the broadband floor; near-silence or noise only "fits" by luck
    let pk = 0; for (const m of exp) for (const x of partialsOf(m, 3)) pk = Math.max(pk, an.T[x]);
    res.clear = an.floor > 0 ? pk / an.floor : (pk > 0 ? 999 : 0);
    if (!tot || res.clear < CLEAR) { res.missing = [...new Set(exp.map(m => m % 12))]; exp.forEach(m => res.noteState[m] = 'missing'); return res; }
    // how strong the chord itself is
    let ref = 0, refS = 0;
    for (const m of exp) {
      let s2 = 0; for (let h = 0; h < 8; h++) { const x = m + HO[h]; if (x <= HI) s2 += HW[h] * R[x]; }
      refS = Math.max(refS, s2);
      for (const x of partialsOf(m, 4)) ref = Math.max(ref, R[x]);
    }
    // each expected note: look at partials no other chord note can explain
    const pcState = {};
    for (const m of exp) {
      const others = new Uint8Array(128);
      for (const o of exp) if (o !== m) for (const x of partialsOf(o, 16)) others[x] = 1;
      const own = partialsOf(m, 4).filter(x => !others[x]);
      let state;
      const usable = own.filter(x => !(x === m && Ear.hz(m) < 170));
      if (!usable.length) state = 'unsure';
      else state = Math.max(...usable.map(x => R[x])) >= P.cover * ref ? 'heard' : 'missing';
      res.noteState[m] = state;
      const pc = m % 12;
      if (state === 'heard' || !pcState[pc]) pcState[pc] = state === 'heard' ? 'heard' : (pcState[pc] === 'heard' ? 'heard' : state);
    }
    // a pitch class we couldn't verify string-by-string still needs energy at one of its notes or their octaves
    for (const pc in pcState) if (pcState[pc] === 'unsure') {
      const ev = Math.max(...exp.filter(m => m % 12 === +pc).map(m => Math.max(R[m], R[m + 12] || 0)));
      pcState[pc] = ev >= P.cover * ref ? 'heard' : 'missing';
      exp.filter(m => m % 12 === +pc && res.noteState[m] === 'unsure').forEach(m => res.noteState[m] = pcState[pc]);
    }
    for (const pc in pcState) { if (pcState[pc] === 'missing') res.missing.push(+pc); else res.heardPcs.add(+pc); }
    // leftovers: strong notes built from energy the chord can't explain
    const U = new Float32Array(128);
    for (let m = 36; m <= HI; m++) U[m] = isP[m] ? 0 : R[m];
    const peaks = exp.map(m => Math.max(...partialsOf(m, 3).map(x => R[x]))).sort((a, b) => a - b);
    const refNote = peaks[Math.floor(peaks.length / 2)] || ref;
    // wrong notes: a guitar note (up to C6) whose own fundamental rings clearly
    for (const n of greedy(U, 3, 84)) {
      const own = partialsOf(n.m, 3).filter(x => x <= 84).map(x => U[x]);
      const pk = Math.max(...own);
      if (U[n.m] < 0.5 * pk) continue;               // must ring at its own fundamental
      if (pk >= P.wrong * refNote) { res.wrongNotes.push(n.m); if (!res.wrong.includes(n.m % 12)) res.wrong.push(n.m % 12); }
    }
    res.ok = res.fit >= P.fit && res.missing.length === 0 && res.wrong.length === 0;
    return res;
  }
  /* Is this chord NEW? Compare with a frame from just before the strum: a real strum makes the chord's
     own partials jump up. Background that was already there (music, a TV, hum, the band through the
     speakers) is present before AND after, so it can't pass however well it happens to fit.            */
  function fresh(an, base, midis){
    const exp = [...new Set(midis)];
    const lv = (R, m) => { if (!R) return 0; let v = 0; for (const x of partialsOf(m, 3)) v = Math.max(v, R[x] || 0); return v; };
    let nowS = 0, baseS = 0, rose = 0;
    const R = an.R0, B = base && base.R0;
    let mx = 0; for (const m of exp) mx = Math.max(mx, lv(R, m));
    const roseSet = new Set();
    for (const m of exp) {
      const a = lv(R, m), b = lv(B, m);
      nowS += a; baseS += b;
      if (a >= 1.45 * b + 0.08 * mx) { rose++; roseSet.add(m); }
    }
    const need = Math.max(2, Math.ceil(exp.length * 0.6));
    const rise = baseS > 0 ? nowS / baseS : 99;
    return { ok: rose >= Math.min(need, exp.length) && rise >= 1.4, rose, need, rise, roseSet };
  }
  // the part of this frame that is new since \`base\`: steady background (music, TV, hum) cancels out
  function delta(an, base){
    if (!base || !base.R0) return an;
    const R0 = new Float32Array(128), T = new Float32Array(128);
    for (let m = 0; m < 128; m++) { R0[m] = Math.max(0, an.R0[m] - 0.7 * (base.R0[m] || 0)); T[m] = Math.max(0, (an.T ? an.T[m] : 0) - 0.7 * (base.T ? base.T[m] : 0)); }
    let total = 0; for (let m = 36; m <= 100; m++) total += R0[m];
    return { R0, T, floor: an.floor, total, notes: an.notes };
  }
  // full analysis of one frame of samples
  const Tbuf = new Float32Array(128);
  function analyze(samples, sr, noise){
    const mg = spectrum(samples);
    const T = semitones(mg, sr / N, Tbuf);
    const est = estimate(T, noise);
    markExplained(est.notes);
    return { T: Float32Array.from(T), R0: est.R0, notes: est.notes, total: est.total, chroma: chroma(est.notes), floor: floorOf(mg, sr / N) };
  }
  return { N, analyze, match, matchTarget, fresh, delta, TMODES, semitones, spectrum, estimate, chroma, hz, setCfg(o){ Object.assign(CFG, o); if (o.clear) CLEAR = o.clear; }, setModes(o){ Object.assign(MODES, o); }, MODES };
})();
if (typeof module !== 'undefined') module.exports = { Ear };
