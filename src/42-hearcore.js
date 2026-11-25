/* =====================================================================
   HearCore: the engine-agnostic part of the game's hearing. Plain maths on
   Float32Arrays: no DOM, no Web Audio, no globals. The same source runs in
   the capture AudioWorklet (fast onsets), in the model worker (resampling,
   tuning) and under Node (tests); a port to another engine keeps this file.
   - OnsetDetector: strum / hit onsets a few tens of ms after the sound, from
     log-band spectral flux with an adaptive threshold, with the spectrum's
     shape captured at the onset itself (which drum, pluck or noise).
   - Resampler: band-limited resampling with a precomputed phase table.
   - tuning(): how many cents the whole instrument sits off concert pitch.
   - Ring: a sample-exact ring buffer addressed by absolute frame number.
   HearCoreFactory.toString() is pasted into the worklet and the worker.
   ===================================================================== */
function HearCoreFactory(){
  function FFT(n){
    const bits = Math.round(Math.log2(n)), rev = new Uint32Array(n), cs = new Float32Array(n / 2), sn = new Float32Array(n / 2);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos(-2 * Math.PI * i / n); sn[i] = Math.sin(-2 * Math.PI * i / n); }
    this.n = n;
    this.run = (re, im) => {
      for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half, tr = re[b] * cs[k] - im[b] * sn[k], ti = re[b] * sn[k] + im[b] * cs[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    };
  }

  /* ---- sample-exact ring: write(frame0, samples) fills gaps with silence and counts them; read(frameEnd, n) ---- */
  function Ring(len){
    this.buf = new Float32Array(len); this.end = -1; this.filled = 0; this.gaps = 0; this.gapFrames = 0;
  }
  Ring.prototype.write = function(f0, x){
    const b = this.buf, L = b.length;
    if (this.end < 0) this.end = f0;
    if (f0 > this.end) { const g = Math.min(L, f0 - this.end); this.gaps++; this.gapFrames += f0 - this.end; for (let i = 0; i < g; i++) b[(f0 - g + i) % L] = 0; this.filled = Math.min(L, this.filled + g); this.end = f0; }
    let s = 0; if (f0 < this.end) s = this.end - f0;                 // overlap (a block delivered twice): keep what we have
    for (let i = s; i < x.length; i++) b[(f0 + i) % L] = x[i];
    if (x.length > s) { this.filled = Math.min(L, this.filled + x.length - s); this.end = f0 + x.length; }
  };
  // n samples ending just before frame `fEnd` (null when they are not in the buffer)
  Ring.prototype.read = function(fEnd, n, out){
    const b = this.buf, L = b.length;
    if (this.end < 0 || fEnd > this.end || this.end - fEnd + n > this.filled) return null;
    out = out || new Float32Array(n);
    let p = ((fEnd - n) % L + L) % L;
    for (let i = 0; i < n; i++) { out[i] = b[p]; if (++p === L) p = 0; }
    return out;
  };

  /* ---- onsets ----
     push(x, frame0) takes any block size and calls onOnset({ f, strength, kind, feat }) with
     f = the sample frame the sound started at (same numbering as frame0).               */
  function OnsetDetector(sr, o){
    o = o || {};
    const N = this.N = o.N || (sr >= 30000 ? 1024 : 512), H = this.H = N >> 2, nb = N >> 1;
    this.sr = sr; this.onOnset = o.onOnset || null;
    this.sens = o.sens == null ? 1 : o.sens;          // > 1 hears softer hits
    this.refractory = o.refractory == null ? 0.07 : o.refractory;
    const fft = new FFT(N), win = new Float32Array(N), re = new Float32Array(N), im = new Float32Array(N), pw = new Float32Array(nb);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const buf = new Float32Array(N); let fill = 0, sinceHop = 0, endFrame = 0, started = false;
    // log-spaced bands, 60 Hz .. 10 kHz
    const NB = 18, fLo = 80, fHi = Math.min(10000, sr * 0.45), edges = new Int32Array(NB + 1), binHz = sr / N;
    for (let b = 0; b <= NB; b++) edges[b] = Math.max(1, Math.min(nb - 1, Math.round(fLo * Math.pow(fHi / fLo, b / NB) / binHz)));
    for (let b = 1; b <= NB; b++) if (edges[b] < edges[b - 1] + 2) edges[b] = edges[b - 1] + 2;
    // wide (high) bands barely flicker in steady noise, narrow (low) ones do: weigh a band's rise by how much it can be trusted
    const wB = new Float32Array(NB); for (let b = 0; b < NB; b++) wB[b] = Math.min(3, Math.sqrt((edges[b + 1] - edges[b]) / 2));
    const lb = new Float32Array(NB), p1 = new Float32Array(NB).fill(-12), p2 = new Float32Array(NB).fill(-12), nf = new Float32Array(NB).fill(-12);
    const HIST = 64, fh = new Float32Array(HIST), srt = new Float32Array(HIST); let fhN = 0, fhI = 0;
    let fPrev = 0, fPrev2 = 0, frameNo = 0, lastOn = -1e9, boost = 0, ePrev = [1e-12, 1e-12, 1e-12, 1e-12], pend = null;
    let noiseE = 1e-9, clipN = 0, sumSq = 0, sumN = 0, peak = 0;
    const kLo = Math.round(150 / binHz), kMid0 = Math.round(300 / binHz), kMid1 = Math.min(nb - 1, Math.round(6000 / binHz)), kHi = Math.round(4000 / binHz);
    this.stats = () => { const s = { rms: sumN ? Math.sqrt(sumSq / sumN) : 0, peak, clip: clipN, noise: Math.sqrt(noiseE) }; clipN = 0; sumSq = 0; sumN = 0; peak = 0; return s; };
    const features = () => {
      // shape of the spectrum in the frame that holds the attack
      let tot = 0, cen = 0, low = 0, hi = 0, gm = 0, am = 0, n = 0;
      for (let k = 1; k < nb; k++) { const p = pw[k]; tot += p; cen += p * k; if (k < kLo) low += p; if (k >= kHi) hi += p; if (k >= kMid0 && k <= kMid1) { gm += Math.log(p + 1e-20); am += p; n++; } }
      if (!(tot > 0)) return null;
      return { cen: cen / tot * binHz, low: low / tot, hi: hi / tot, flat: n && am > 0 ? Math.exp(gm / n) / (am / n) : 0, e: tot };
    };
    const frame = () => {
      // window ends at endFrame
      let e = 0;
      for (let i = 0; i < N; i++) { const v = buf[(fill + i) % N]; re[i] = v * win[i]; im[i] = 0; }
      fft.run(re, im);
      for (let k = 0; k < nb; k++) { const p = re[k] * re[k] + im[k] * im[k]; pw[k] = p; if (k > 1) e += p; }
      e /= N * N;
      let flux = 0, nUp = 0;
      for (let b = 0; b < NB; b++) {
        let s = 0; for (let k = edges[b]; k < edges[b + 1]; k++) s += pw[k];
        const l = Math.log10(s / (N * N) + 1e-12);
        // each band's own floor: down fast, up slowly, so a steady hum or hiss stops counting
        if (l < nf[b]) nf[b] += (l - nf[b]) * 0.3; else nf[b] += 0.0015;
        const ref = Math.max(p1[b], p2[b], nf[b] + 0.5), inc = l - ref;
        if (inc > 0) { flux += (inc > 2 ? 2 : inc) * wB[b]; if (inc > 0.25) nUp++; }
        p2[b] = p1[b]; p1[b] = l; lb[b] = l;
      }
      // room level: follows the quiet moments
      if (e < noiseE) noiseE += (e - noiseE) * 0.2; else noiseE *= 1.002;
      if (noiseE < 1e-12) noiseE = 1e-12;
      // adaptive threshold: the recent median of the flux, a floor, and a bump right after an onset (the rest of a slow strum)
      let n = fhN; for (let i = 0; i < n; i++) srt[i] = fh[i];
      const part = srt.subarray(0, n); part.sort(); const med = n ? part[n >> 1] : 0;
      const thr = (Math.max(3.75, med * 3.1 + 1.9) + boost) / this.sens;
      boost *= 0.95;
      if (nUp < 3) flux = Math.min(flux, 1);             // one or two bands jumping is noise flickering, not an attack
      frameNo++; if (this.dbg) this.dbg(endFrame, flux, thr, e, noiseE);
      const tNow = endFrame;
      // a pending onset collects the attack's spectrum from the frame after the peak, then goes out
      if (pend) {
        const f = features(); pend.n++;
        if (f && (!pend.feat || f.e > pend.feat.e)) pend.feat = f;
        if (pend.n >= 2) {
          const ft = pend.feat || { cen: 0, low: 0, hi: 0, flat: 0, e: 0 };
          const rise = 10 * Math.log10((ft.e / (N * N) + 1e-12) / (pend.pre + 1e-12));
          ft.rise = rise; ft.rms = Math.sqrt(ft.e) / N * 2; delete ft.e;
          const kind = ft.flat > 0.32 ? 'noise' : ft.flat > 0.12 ? 'mixed' : 'tonal';
          const ev = { f: pend.f, strength: pend.strength, kind, feat: ft };
          pend = null;
          // a barely-over-the-line peak that adds no energy is the room's noise flickering, not an attack
          if (this.onOnset && !(ev.strength < 1.4 && rise < 1.5)) this.onOnset(ev);
        }
      }
      // peak picking one hop late: the previous frame was a local maximum above the threshold
      const loud = e > 2e-9;
      if (!pend && frameNo > 12 && fPrev > thr && fPrev >= flux && fPrev > fPrev2 && loud && (tNow - lastOn) > this.refractory * sr) {
        // the attack sits about 3/4 of the way through the window of the peak frame (Hann weighting)
        const f = tNow - H - Math.round(N * 0.3);
        lastOn = tNow; boost = Math.max(boost, fPrev * 0.6);
        pend = { f, strength: fPrev / thr, n: 0, feat: null, pre: ePrev[0] };
        const f0 = features(); if (f0) pend.feat = f0;
      }
      fh[fhI] = flux; fhI = (fhI + 1) % HIST; if (fhN < HIST) fhN++;
      fPrev2 = fPrev; fPrev = flux;
      ePrev[0] = ePrev[1]; ePrev[1] = ePrev[2]; ePrev[2] = ePrev[3]; ePrev[3] = e;
    };
    this.dbg = null;
    this.push = (x, frame0) => {
      if (!started || frame0 !== endFrame) { if (started) { fill = 0; buf.fill(0); sinceHop = 0; } started = true; endFrame = frame0; }
      for (let i = 0; i < x.length; i++) {
        const v = x[i]; buf[fill] = v; fill = fill + 1 === N ? 0 : fill + 1; endFrame++;
        const a = v < 0 ? -v : v; if (a > peak) peak = a; if (a > 0.985) clipN++; sumSq += v * v; sumN++;
        if (++sinceHop === H) { sinceHop = 0; frame(); }
      }
    };
  }

  /* ---- resampling: y[i] = x at (anchor - (n-1-i) * ratio), 16-tap Hann-windowed sinc, phases precomputed ---- */
  function Resampler(){
    const H = 8, P = 512; let tab = null, tabRatio = 0;
    const build = ratio => {
      const fc = Math.min(0.5, 0.45 / ratio); tab = new Float32Array((P + 1) * 2 * H); tabRatio = ratio;
      for (let p = 0; p <= P; p++) {
        const fr = p / P; let ws = 0;
        for (let j = 0; j < 2 * H; j++) { const d = fr - (j - H + 1), w = 0.5 + 0.5 * Math.cos(Math.PI * d / H), s = d === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d); tab[p * 2 * H + j] = s * w; ws += s * w; }
        for (let j = 0; j < 2 * H; j++) tab[p * 2 * H + j] /= ws;
      }
    };
    this.margin = H;
    // x: input; returns n samples whose last one sits at x[x.length - 1 - H] (so every tap exists)
    this.run = (x, ratio, n, y) => {
      if (!tab || tabRatio !== ratio) build(ratio);
      y = y || new Float32Array(n);
      const last = x.length - 1 - H, T = 2 * H;
      for (let i = 0; i < n; i++) {
        const c = last - (n - 1 - i) * ratio, c0 = Math.floor(c);
        if (c0 - H + 1 < 0) { y[i] = 0; continue; }
        const row = Math.round((c - c0) * P) * T, k0 = c0 - H + 1; let acc = 0;
        for (let j = 0; j < T; j++) acc += x[k0 + j] * tab[row + j];
        y[i] = acc;
      }
      return y;
    };
  }

  /* ---- tuning: cents the instrument sits off A440, from the spectral peaks of the last ~0.74 s at 22.05 kHz ---- */
  let tf = null, tre = null, tim = null, twin = null;
  function tuning(x, sr){
    const N = 16384; if (x.length < N) return null;
    if (!tf) { tf = new FFT(N); tre = new Float32Array(N); tim = new Float32Array(N); twin = new Float32Array(N); for (let i = 0; i < N; i++) twin[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)); }
    const off = x.length - N; let e = 0;
    for (let i = 0; i < N; i++) { const v = x[off + i]; tre[i] = v * twin[i]; tim[i] = 0; e += v * v; }
    const rms = Math.sqrt(e / N); if (rms < 0.002) return null;
    tf.run(tre, tim);
    const binHz = sr / N, k0 = Math.floor(78 / binHz), k1 = Math.ceil(1000 / binHz), mg = tre;       // reuse tre for magnitudes
    let mx = 0; for (let k = k0 - 1; k <= k1 + 1; k++) { mg[k] = Math.sqrt(tre[k] * tre[k] + tim[k] * tim[k]); if (mg[k] > mx) mx = mg[k]; }
    let C = 0, S = 0, W = 0, n = 0;
    for (let k = k0; k <= k1; k++) {
      const m = mg[k]; if (m < 0.12 * mx || m < mg[k - 1] || m <= mg[k + 1]) continue;
      // parabolic fit on the log magnitudes for the peak's true frequency
      const a = Math.log(mg[k - 1] + 1e-12), b = Math.log(m), c = Math.log(mg[k + 1] + 1e-12), d = (a - c) / (2 * (a - 2 * b + c) || 1);
      const f = (k + (d > -1 && d < 1 ? d : 0)) * binHz, st = 12 * Math.log2(f / 440), dev = st - Math.round(st);
      const w = m / mx; C += w * Math.cos(2 * Math.PI * dev); S += w * Math.sin(2 * Math.PI * dev); W += w; n++;
    }
    if (n < 2 || !W) return null;
    return { cents: Math.atan2(S, C) / (2 * Math.PI) * 100, conf: Math.sqrt(C * C + S * S) / W, n, rms };
  }

  return { FFT, Ring, OnsetDetector, Resampler, tuning };
}
const HearCore = HearCoreFactory();
if (typeof module !== 'undefined') module.exports = { HearCoreFactory, HearCore };
