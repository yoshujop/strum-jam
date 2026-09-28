/* =====================================================================
   Analyze: check a chart against the recording's 30-second preview.
   The preview is decoded at 22.05 kHz; the same Basic Pitch model the game
   uses for the mic turns it into notes. From the audio we get the tempo and
   the beats (onset strength + dynamic-programming beat tracking), a 12-note
   chroma per beat, the key, and then we slide the chart's own chord sequence
   along the beats (in all 12 transpositions) to find where the preview sits
   in the song, how far the chart's shapes are from the recording's pitch
   (capo or tuning), how long each chord lasts, and whether any chord of the
   chart clearly doesn't fit what's playing. It never invents chords.
   ===================================================================== */
const Analyze = {
  SR: 22050, HOP: 256, get FPS(){ return this.SR / this.HOP; },
  // how the three pitch checks are combined when choosing the transposition (fitted on songs with known keys)
  W_HIST: 0, W_BASS: 0,

  /* ---------- decode (browser) ---------- */
  async fetchPcm(url, signal){
    const r = await fetch(url, { signal });
    if (!r.ok) throw Object.assign(new Error('preview HTTP ' + r.status), { code: 'preview_http' });
    const buf = await r.arrayBuffer();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OAC(1, this.SR * 2, this.SR);
    const ab = await new Promise((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
    const n = ab.length, x = new Float32Array(n);
    for (let c = 0; c < ab.numberOfChannels; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i] / ab.numberOfChannels; }
    return ab.sampleRate === this.SR ? x : this.resampleLinear(x, ab.sampleRate, this.SR);
  },
  resampleLinear(x, a, b){ const n = Math.floor(x.length * b / a), y = new Float32Array(n), r = a / b; for (let i = 0; i < n; i++) { const p = i * r, k = Math.floor(p), f = p - k; y[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f; } return y; },

  /* ---------- small FFT ---------- */
  fft(re, im){
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  },
  // log-magnitude spectrogram frames (for onsets, and a fallback chroma)
  spectro(x){
    const N = 2048, H = this.HOP, F = Math.max(0, Math.floor((x.length - N) / H) + 1), B = N / 2;
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const re = new Float32Array(N), im = new Float32Array(N), mags = new Array(F);
    for (let f = 0; f < F; f++) {
      for (let i = 0; i < N; i++) { re[i] = x[f * H + i] * win[i]; im[i] = 0; }
      this.fft(re, im);
      const m = new Float32Array(B); for (let k = 0; k < B; k++) m[k] = Math.hypot(re[k], im[k]);
      mags[f] = m;
    }
    return { mags, N, B, F, offset: N / 2 / H };   // frame f is centred at (f + offset) hops
  },
  onsetEnv(sp){
    const { mags, F, B } = sp, env = new Float32Array(F);
    let prev = null;
    for (let f = 0; f < F; f++) {
      const m = mags[f], lg = new Float32Array(B);
      for (let k = 1; k < B; k++) lg[k] = Math.log1p(20 * m[k]);
      if (prev) { let s = 0; for (let k = 1; k < 800; k++) { const d = lg[k] - prev[k]; if (d > 0) s += d; } env[f] = s; }
      prev = lg;
    }
    // remove the slow trend, keep the peaks, normalise
    const out = new Float32Array(F), W = Math.round(this.FPS * 0.4);
    let acc = 0; const q = [];
    for (let f = 0; f < F; f++) { q.push(env[f]); acc += env[f]; if (q.length > 2 * W) acc -= q.shift(); out[f] = Math.max(0, env[f] - acc / q.length); }
    let s2 = 0; for (let f = 0; f < F; f++) s2 += out[f] * out[f];
    const sd = Math.sqrt(s2 / Math.max(1, F)) || 1; for (let f = 0; f < F; f++) out[f] /= sd;
    // pad to line up with frame centres
    const pad = Math.round(sp.offset), full = new Float32Array(F + pad); full.set(out, pad);
    return full;
  },
  autocorr(env, maxL){ const n = env.length, ac = new Float32Array(maxL + 1); for (let L = 1; L <= maxL; L++) { let s = 0; for (let i = 0; i + L < n; i++) s += env[i] * env[i + L]; ac[L] = s / (n - L); } return ac; },
  // tempo candidates: comb-filtered autocorrelation with a gentle prior around `mu` BPM
  tempo(env, mu){
    const fps = this.FPS, maxL = Math.ceil(fps * 60 / 40) * 3, ac = this.autocorr(env, Math.min(maxL, env.length - 2));
    const at = L => { const a = Math.floor(L), f = L - a; return a + 1 < ac.length ? ac[a] * (1 - f) + ac[a + 1] * f : 0; };
    const cand = [];
    for (let bpm = 50; bpm <= 210; bpm += 0.5) {
      const L = fps * 60 / bpm;
      const s = at(L) + 0.5 * at(2 * L) + 0.25 * at(4 * L) + 0.35 * at(L / 2);
      cand.push({ bpm, s, w: s * Math.exp(-0.5 * Math.pow(Math.log2(bpm / (mu || 110)) / 0.9, 2)) });
    }
    cand.sort((a, b) => b.w - a.w);
    return { bpm: cand[0].bpm, cand, ac, at };
  },
  // Ellis-style dynamic programming beat tracker
  beats(env, bpm){
    const P = this.FPS * 60 / bpm, n = env.length, score = new Float32Array(n), back = new Int32Array(n).fill(-1), tight = 100;
    for (let t = 0; t < n; t++) {
      let best = 0, bi = -1;
      const lo = Math.max(0, Math.floor(t - 2 * P)), hi = Math.floor(t - P / 2);
      for (let p = lo; p <= hi; p++) { const v = score[p] - tight * Math.pow(Math.log((t - p) / P), 2); if (v > best || bi < 0) { best = v; bi = p; } }
      score[t] = env[t] + (bi >= 0 ? Math.max(0, best) : 0); back[t] = bi >= 0 && best > 0 ? bi : -1;
    }
    let t = 0, bv = -Infinity; for (let i = Math.max(0, Math.floor(n - P)); i < n; i++) if (score[i] > bv) { bv = score[i]; t = i; }
    const out = []; while (t >= 0) { out.push(t); t = back[t]; }
    out.reverse();
    // fill gaps at the start with the period
    while (out.length && out[0] - P > 0) out.unshift(Math.round(out[0] - P));
    return out;
  },

  /* ---------- notes -> chroma per beat ---------- */
  // frames: {note: Float32Array(F*88), F} from Basic Pitch (MIDI 21..108), or null to use the spectrogram
  beatChroma(beats, frames, sp){
    const out = [];
    for (let k = 0; k + 1 < beats.length; k++) {
      const a = beats[k], b = beats[k + 1], c = new Float32Array(12), bass = new Float32Array(12);
      let e = 0, n = 0;
      if (frames) {
        for (let f = a; f < b && f < frames.F; f++) {
          n++;
          for (let p = 7; p < 76; p++) {            // MIDI 28..96
            let v = frames.note[f * 88 + p]; if (v < 0.2) continue; v -= 0.15;
            const midi = p + 21, pc = midi % 12;
            c[pc] += v; e += v;
            if (midi <= 52) bass[pc] += v * (midi <= 45 ? 1.2 : 0.8);
          }
        }
      } else if (sp) {
        // no note model on this device: a whitened spectrogram folded onto the 12 notes (peaks only)
        const off = Math.round(sp.offset);
        for (let f = a - off; f < b - off; f++) {
          if (f < 0 || f >= sp.F) continue; n++;
          const m = sp.mags[f], lg = new Float32Array(420);
          for (let k2 = 1; k2 < 420; k2++) lg[k2] = Math.log1p(20 * m[k2]);
          for (let k2 = 4; k2 < 410; k2++) {
            const hz = k2 * this.SR / sp.N, midi = 69 + 12 * Math.log2(hz / 440); if (midi < 36 || midi > 90) continue;
            let loc = 0; for (let j = -6; j <= 6; j++) loc += lg[k2 + j]; loc /= 13;
            const v = lg[k2] - loc; if (v <= 0 || lg[k2] < lg[k2 - 1] || lg[k2] < lg[k2 + 1]) continue;
            const r = Math.round(midi), w = Math.max(0, 1 - 2 * Math.abs(midi - r)), pc = ((r % 12) + 12) % 12;
            c[pc] += v * w; e += v * w; if (midi <= 52) bass[pc] += v * w;
          }
        }
      }
      const norm = Math.hypot(...c) || 1, bn = Math.hypot(...bass) || 1;
      out.push({ t0: a, t1: b, c: c.map(x => x / norm), cz: this.zn(c), bass: bass.map(x => x / bn), e: n ? e / n : 0, bassE: n ? bn / n : 0 });
    }
    // quiet beats (breaks, fades) carry little evidence
    const es = out.map(x => x.e).sort((p, q) => p - q), med = es[Math.floor(es.length / 2)] || 1;
    out.forEach(x => { x.w = Math.min(1, x.e / (0.35 * med + 1e-9)); });
    return out;
  },
  // chord template (12) + the note that should be in the bass
  template(ch, t){
    const iv = QUALITIES[ch.quality] || QUALITIES[''], v = new Float32Array(12);
    iv.forEach((x, i) => { v[(ch.root + t + x) % 12] += i === 0 ? 1 : i === 1 ? 0.9 : i === 2 ? 0.75 : 0.55; });
    if (ch.bass != null) v[(ch.bass + t) % 12] += 0.4;
    const n = Math.hypot(...v) || 1;
    return { v: v.map(x => x / n), vz: this.zn(v), bass: ((ch.bass != null ? ch.bass : ch.root) + t) % 12 };
  },
  // mean-centred, unit length: template matching by correlation, so a busy mix's even spread of notes doesn't count
  zn(v){ const m = v.reduce((a, b) => a + b, 0) / v.length; const z = Array.from(v, x => x - m); const n = Math.hypot(...z) || 1; return z.map(x => x / n); },
  emit(beat, tpl){
    let s = 0; for (let i = 0; i < 12; i++) s += beat.cz[i] * tpl.vz[i];
    let bs = 0;
    if (beat.bassE > 0.02) { const mx = Math.max(...beat.bass); bs = mx > 0 ? beat.bass[tpl.bass] / mx * 2 - 1 : 0; }
    return 0.8 * s + 0.2 * bs;
  },
  keyOfChroma(bc){
    const tot = new Float32Array(12); bc.forEach(b => { for (let i = 0; i < 12; i++) tot[i] += b.c[i] * b.w + b.bass[i] * b.w * 0.3; });
    const sc = [];
    for (let t = 0; t < 12; t++) for (const minor of [false, true]) {
      const prof = (minor ? Lookup.KK_MIN : Lookup.KK_MAJ).map((_, i, a) => a[(i - t + 12) % 12]);
      sc.push({ tonic: t, minor, s: Lookup.corr(Array.from(tot), prof) });
    }
    sc.sort((a, b) => b.s - a.s);
    return { tonic: sc[0].tonic, minor: sc[0].minor, margin: sc[0].s - sc[1].s, scores: sc, tot };
  },

  /* ---------- slide the chart along the beats ---------- */
  // Explicit-duration alignment: each chart chord lasts one of DUR beats (2, 4 and 8 are the usual ones);
  // free start and end (the preview is a slice of the song); a section may repeat without being written twice.
  // toks: [{name, sec}] for the whole chart in order; secStart: index of each section's first token
  DUR: [1, 2, 3, 4, 6, 8, 12, 16],
  durPrior(d, triple){ const p = triple ? { 1: -0.35, 2: -0.2, 3: 0, 4: -0.2, 6: 0, 8: -0.3, 12: 0, 16: -0.4 } : { 1: -0.35, 2: 0, 3: -0.3, 4: 0, 6: -0.25, 8: 0, 12: -0.3, 16: -0.15 }; return p[d]; },
  align(bc, toks, secStart, t, triple){
    const B = bc.length, N = toks.length;
    if (!B || !N) return null;
    const tpls = toks.map(x => this.template(parseChord(x.name), t));
    // per token, prefix sums of the evidence over beats
    const cum = new Array(N);
    for (let i = 0; i < N; i++) { const c = new Float32Array(B + 1); for (let b = 0; b < B; b++) c[b + 1] = c[b] + this.emit(bc[b], tpls[i]) * bc[b].w; cum[i] = c; }
    const CHANGE = 0.05, REPEAT = 0.25, D = this.DUR, maxD = D[D.length - 1];
    // a line can be played again without being written twice: from any chord of a section back to an earlier chord of it
    const secEnd = new Int32Array(N); secStart.forEach((s, k) => { const e = (secStart[k + 1] || N) - 1; for (let i = s; i <= e; i++) secEnd[i] = e; });
    const sufMax = new Float32Array(N), sufArg = new Int32Array(N);
    const buildSuf = s => { for (let i = N - 1; i >= 0; i--) { const v = F[s * N + i]; if (i === N - 1 || secEnd[i] !== secEnd[i + 1] || v >= sufMax[i + 1]) { sufMax[i] = v; sufArg[i] = i; } else { sufMax[i] = sufMax[i + 1]; sufArg[i] = sufArg[i + 1]; } } };
    const sufCache = new Map();
    const back = (s, i) => { let c = sufCache.get(s); if (!c) { buildSuf(s); c = { m: sufMax.slice(), a: sufArg.slice() }; sufCache.set(s, c); } return c; };
    // F[b*N+i]: best score with token i ending exactly at beat b
    const F = new Float32Array((B + 1) * N).fill(-1e9), bpI = new Int32Array((B + 1) * N).fill(-1), bpS = new Int32Array((B + 1) * N).fill(-1);
    for (let b = 1; b <= B; b++) {
      for (let i = 0; i < N; i++) {
        let best = -1e9, bi = -1, bs = -1;
        // first segment: may be cut by the start of the preview (any length, no prior)
        if (b <= maxD) { const v = cum[i][b] - cum[i][0]; if (v > best) { best = v; bi = -2; bs = 0; } }
        for (const d of D) {
          const s = b - d; if (s < 1) break;
          const seg = cum[i][b] - cum[i][s] + (b === B ? 0 : this.durPrior(d, triple) * 0.6);
          let pv = i > 0 ? F[s * N + i - 1] - CHANGE : -1e9, pi = i - 1;
          const c = back(s, i); if (c.m[i] - REPEAT > pv) { pv = c.m[i] - REPEAT; pi = c.a[i]; }
          if (pv + seg > best) { best = pv + seg; bi = pi; bs = s; }
        }
        // last segment: may be cut by the end of the preview
        if (b === B) for (let s = Math.max(1, B - maxD); s < B; s++) {
          const seg = cum[i][B] - cum[i][s];
          let pv = i > 0 ? F[s * N + i - 1] - CHANGE : -1e9, pi = i - 1;
          const c = back(s, i); if (c.m[i] - REPEAT > pv) { pv = c.m[i] - REPEAT; pi = c.a[i]; }
          if (pv + seg > best) { best = pv + seg; bi = pi; bs = s; }
        }
        F[b * N + i] = best; bpI[b * N + i] = bi; bpS[b * N + i] = bs;
      }
    }
    let end = 0; for (let i = 1; i < N; i++) if (F[B * N + i] > F[B * N + end]) end = i;
    const segs = []; let b = B, i = end;
    while (b > 0 && i >= 0) { const s = bpS[b * N + i], pi = bpI[b * N + i]; segs.push({ i, s, e: b }); if (pi === -2) break; b = s; i = pi; }
    segs.reverse();
    const path = new Int32Array(B); for (const g of segs) for (let k = g.s; k < g.e; k++) path[k] = g.i;
    let raw = 0, wsum = 0; for (let k = 0; k < B; k++) { raw += this.emit(bc[k], tpls[path[k]]) * bc[k].w; wsum += bc[k].w; }
    return { t, score: F[B * N + end] / B, fit: wsum ? raw / wsum : 0, path, segs };
  },
  // what an unconstrained chord guesser would get (major/minor/7 triads, any root): the ceiling for "fit"
  freeFit(bc){
    const tpls = []; for (let r = 0; r < 12; r++) for (const q of ['', 'm', '7', 'm7', '5']) tpls.push(this.template({ root: r, quality: q, bass: null }, 0));
    let s = 0, w = 0; for (const b of bc) { let m = 0; for (const tp of tpls) m = Math.max(m, this.emit(b, tp)); s += m * b.w; w += b.w; }
    return w ? s / w : 0;
  },

  /* ---------- the whole check ---------- */
  // pcm: mono Float32Array at 22.05 kHz. frames: Basic Pitch output or null. chart: {secs:[{name, chords:[]}]}
  run(pcm, frames, chart, hint){
    hint = hint || {};
    const sp = this.spectro(pcm), env = this.onsetEnv(sp);
    const tp = this.tempo(env, hint.bpm || 110);
    // prefer a tempo in the usual chart range
    let bpm = tp.bpm;
    if (hint.bpm && Math.abs(Math.log2(bpm / hint.bpm)) > 0.6) { const alt = [bpm / 2, bpm * 2, bpm * 2 / 3, bpm * 3 / 2].find(x => Math.abs(Math.log2(x / hint.bpm)) < 0.15); if (alt) bpm = alt; }
    while (bpm > 165) bpm /= 2; while (bpm < 58) bpm *= 2;
    const beats = this.beats(env, bpm);
    const bc = this.beatChroma(beats, frames, frames ? null : sp);
    const period = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : this.FPS * 60 / bpm;
    const out = { bpm: Math.round(this.FPS * 60 / period * 10) / 10, beats: beats.length, key: this.keyOfChroma(bc), usedModel: !!frames };
    // subdivision: triplets (6/8, 12/8, shuffle) or straight
    const at = tp.at, P = period;
    out.triplet = (at(P / 3) + at(2 * P / 3)) / 2 > 1.15 * Math.max(1e-6, at(P / 2));
    if (!chart || !chart.secs || !chart.secs.length) return out;
    const toks = [], secStart = [];
    chart.secs.forEach((s, k) => { secStart.push(toks.length); s.chords.forEach((c, i) => toks.push({ name: c, sec: k, i })); });
    // a second, alignment-free opinion: the chart's overall note profile against the preview's, in all 12 transpositions
    const prof = new Float32Array(12); toks.forEach(x => { const ch = parseChord(x.name); if (ch) chordPcs(ch).forEach((p, i) => { prof[p] += i === 0 ? 1.3 : 1; }); });
    const aud = new Float32Array(12), bassP = new Float32Array(12); bc.forEach(b => { for (let i = 0; i < 12; i++) { aud[i] += b.c[i] * b.w; bassP[i] += b.bass[i] * b.w; } });
    const rot = (v, t) => Array.from(v, (_, i) => v[(i - t + 12) % 12]);
    out.hist = []; out.histBass = [];
    const rootProf = new Float32Array(12); toks.forEach(x => { const ch = parseChord(x.name); if (ch) rootProf[ch.bass != null ? ch.bass : ch.root] += 1; });
    for (let t = 0; t < 12; t++) { out.hist.push(+Lookup.corr(rot(prof, t), Array.from(aud)).toFixed(4)); out.histBass.push(+Lookup.corr(rot(rootProf, t), Array.from(bassP)).toFixed(4)); }
    const res = [];
    // metre guess from the accents, used by the duration prior
    const at0 = tp.at, P0 = period, tripleGuess = at0(3 * P0) > at0(4 * P0) * 1.15 && at0(3 * P0) > at0(2 * P0) * 0.9;
    for (let t = 0; t < 12; t++) { const r = this.align(bc, toks, secStart, t, tripleGuess); r.alignScore = r.score; r.score = r.score + this.W_HIST * out.hist[t] + this.W_BASS * out.histBass[t]; res.push(r); }
    res.sort((a, b) => b.score - a.score);
    const best = res[0];
    out.offset = best.t; out.fit = best.fit; out.free = this.freeFit(bc);
    out.margin = best.score - res[1].score; out.offsets = res.map(r => ({ t: r.t, score: +r.score.toFixed(4) }));
    // where in the chart the preview sits, and how many beats each chord lasted there
    out.visits = best.segs.map((g, k) => ({ i: g.i, name: toks[g.i].name, sec: toks[g.i].sec, beats: g.e - g.s, cut: k === 0 || k === best.segs.length - 1 }));
    out.toks = toks.map(x => ({ name: x.name, sec: x.sec }));
    if (typeof window !== 'undefined' && window.SJ_DEBUG) {
      const names = [...new Set(toks.map(x => x.name))], tp2 = names.map(n => [n, this.template(parseChord(n), best.t)]);
      out.beatTop = bc.map((b, k) => { const sc = tp2.map(([n, tp]) => [n, this.emit(b, tp)]).sort((x, y) => y[1] - x[1]); return toks[best.path[k]].name + '>' + sc[0][0] + ':' + sc[0][1].toFixed(2) + (b.w < 0.5 ? '(q)' : '') + ' ' + Array.from(b.cz).map(v => Math.max(0, Math.round(v * 9))).join(''); });
    }
    // does each chord of the chart fit? compare with close alternatives on the beats it covers
    const byChord = {};
    for (let b = 0; b < bc.length; b++) {
      const name = toks[best.path[b]].name, ch = parseChord(name); if (!ch || bc[b].w < 0.5) continue;
      const own = this.emit(bc[b], this.template(ch, best.t));
      const alts = [];
      const q = ch.quality, minor = /^m(?!aj)/.test(q);
      alts.push({ ...ch, quality: minor ? '' : 'm', bass: null });
      alts.push({ ...ch, root: (ch.root + 1) % 12 }, { ...ch, root: (ch.root + 11) % 12 });
      let bestAlt = null, ba = -1;
      for (const a of alts) { const s = this.emit(bc[b], this.template(a, best.t)); if (s > ba) { ba = s; bestAlt = a; } }
      const o = byChord[name] || (byChord[name] = { name, beats: 0, own: 0, alt: 0, altName: '' , altVotes: {} });
      o.beats++; o.own += own; o.alt += ba;
      const an = chordLabel(bestAlt.root, bestAlt.quality, null, ch.flat); o.altVotes[an] = (o.altVotes[an] || 0) + 1;
    }
    out.chordFit = Object.values(byChord).map(o => {
      const alt = Object.entries(o.altVotes).sort((a, b) => b[1] - a[1])[0][0];
      return { name: o.name, beats: o.beats, own: o.own / o.beats, alt: o.alt / o.beats, altName: alt };
    });
    // metre from how long the chords lasted (complete ones only) and the accent pattern
    const d = out.visits.filter(v => !v.cut).map(v => v.beats);
    const m3 = d.filter(x => x % 3 === 0 && x % 2).length, m2 = d.filter(x => x % 2 === 0).length;
    const acc3 = at(3 * P), acc4 = at(4 * P);
    out.triple = d.length >= 3 && m3 > m2 && acc3 > acc4 * 0.9;
    out.durations = d;
    return out;
  },
};
