/* =====================================================================
   Listen: note recognition with a trained neural network.
   Spotify's Basic Pitch model (Apache-2.0) listens to the last 2 seconds of
   the mic and says, for every piano key and every ~12 ms, how likely it is
   that a note is sounding and that it just started. It was trained on real
   instruments, so noise, speech, claps and knocks come out as silence, and a
   single note comes out as that one note.
   The model runs in a background worker (TensorFlow.js, WebAssembly) so the
   game never stutters. Everything is embedded in the page; nothing is fetched.
   ===================================================================== */
const Listen = {
  ready: false, loading: false, failed: '', backend: '', ms: 0,
  SR: 22050, NS: 43844, FPS: 22050 / 256,
  // audio ring buffer at the context's rate
  ring: null, ringPos: 0, ringFilled: 0, lastT: 0, sr: 48000,
  node: null, worker: null, busy: false, runId: 0, want: false,
  // timeline of model output keyed by absolute frame index (time * FPS)
  tl: new Map(), newestT: 0, reliableT: 0,
  strums: [], lastStrumT: -9, strumListeners: new Set(),
  async init(){
    if (this.ready || this.loading || typeof LISTEN_ASSETS === 'undefined' || typeof Worker === 'undefined') { if (typeof LISTEN_ASSETS === 'undefined') this.failed = 'no model'; return; }
    this.loading = true;
    try {
      const A = LISTEN_ASSETS;
      const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
      const urlOf = (parts, type) => URL.createObjectURL(new Blob(parts, { type }));
      // one self-contained worker: the TensorFlow.js scripts are pasted in, and the .wasm files are handed over as bytes
      // (works from a local file too, where a worker can't load other blob: URLs)
      const wasm = b64(A.wasm), wasmSimd = b64(A.wasmSimd);
      const worker = new Worker(urlOf([A.scripts.join('\n;\n'), '\n;\n', LISTEN_WORKER_SRC], 'text/javascript'));
      this.worker = worker;
      const weights = b64(A.weights);
      await new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('timeout')), 30000);
        worker.onmessage = e => {
          const d = e.data;
          if (d.type === 'ready') { clearTimeout(to); this.backend = d.backend; this.ms = d.ms; resolve(); }
          else if (d.type === 'error') { clearTimeout(to); reject(new Error(d.msg)); }
        };
        worker.postMessage({ type: 'init', wasm: wasm.buffer, wasmSimd: wasmSimd.buffer, model: A.model, weights: weights.buffer }, [weights.buffer, wasm.buffer, wasmSimd.buffer]);
      });
      worker.onmessage = e => this.onResult(e.data);
      this.ready = true;
    } catch (e) { this.failed = String(e && e.message || e); console.warn('Listen: model unavailable, using the built-in ear', e); }
    this.loading = false;
    if (typeof UI !== 'undefined' && UI.refreshMic) UI.refreshMic();
  },
  // connect to the mic's source node: keep the last 3 s of raw audio
  attach(ctx, src){
    this.sr = ctx.sampleRate; this.ring = new Float32Array(Math.ceil(this.sr * 3)); this.ringPos = 0; this.ringFilled = 0;
    this.tl.clear(); this.strums = []; this.newestT = this.reliableT = 0;
    const push = (buf, tEnd) => {
      const r = this.ring, n = buf.length;
      for (let i = 0; i < n; i++) { r[this.ringPos] = buf[i]; this.ringPos = (this.ringPos + 1) % r.length; }
      this.ringFilled = Math.min(r.length, this.ringFilled + n); this.lastT = tEnd;
    };
    try { if (this.node) this.node.disconnect(); } catch (e) {}
    const sp = ctx.createScriptProcessor(2048, 1, 1);
    sp.onaudioprocess = e => { const x = e.inputBuffer.getChannelData(0); push(x, ctx.currentTime); };
    const sink = ctx.createGain(); sink.gain.value = 0;
    src.connect(sp); sp.connect(sink); sink.connect(ctx.destination);
    this.node = sp;
  },
  detach(){ try { this.node && this.node.disconnect(); } catch (e) {} this.node = null; this.ringFilled = 0; },
  // called every animation frame: start the next analysis when the worker is free
  tick(want){
    this.want = want;
    if (!this.ready || !want || this.busy || !this.node || this.ringFilled < this.sr * 0.5) return;
    const need = Math.ceil(this.NS * this.sr / this.SR) + 64, r = this.ring, L = r.length;
    const raw = new Float32Array(need);
    const avail = Math.min(this.ringFilled, need);
    for (let i = 0; i < avail; i++) raw[need - avail + i] = r[(this.ringPos - avail + i + L) % L];
    const x = this.resample(raw, this.sr, this.SR, this.NS);
    this.busy = true; this.runT = performance.now();
    this.worker.postMessage({ type: 'run', id: ++this.runId, audio: x, tEnd: this.lastT }, [x.buffer]);
  },
  // band-limited resampling to 22.05 kHz; returns exactly n samples ending at the newest sample
  resample(x, srIn, srOut, n){
    const ratio = srIn / srOut, y = new Float32Array(n), fc = Math.min(0.5, 0.45 / ratio), H = 8, last = x.length - 1;
    const win = []; for (let k = -H + 1; k <= H; k++) win.push(k);
    for (let i = 0; i < n; i++) {
      const c = last - (n - 1 - i) * ratio, c0 = Math.floor(c); let acc = 0, ws = 0;
      for (let k = c0 - H + 1; k <= c0 + H; k++) {
        if (k < 0 || k > last) continue;
        const d = c - k, w = 0.5 + 0.5 * Math.cos(Math.PI * d / H), s = d === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d);
        acc += x[k] * s * w; ws += s * w;
      }
      y[i] = ws ? acc / ws : 0;
    }
    return y;
  },
  // run the model over a whole clip (a song preview): overlapping 2 s windows, keep each window's middle
  pend: new Map(),
  async batch(x, onProgress){
    if (!this.ready) { if (!this.loading) this.init(); for (let i = 0; i < 400 && !this.ready && !this.failed; i++) await new Promise(r => setTimeout(r, 100)); }
    if (!this.ready) throw Object.assign(new Error('The note model isn’t available here.'), { code: 'no_model' });
    const NS = this.NS, H = 256, pad = 30 * H, hop = NS - 2 * pad, F = Math.ceil(x.length / H);
    const note = new Float32Array(F * 88), onset = new Float32Array(F * 88);
    const nWin = Math.ceil((x.length + pad) / hop); let k = 0;
    for (let pos = -pad; pos < x.length; pos += hop) {
      const w = new Float32Array(NS);
      for (let i = 0; i < NS; i++) { const j = pos + i; if (j >= 0 && j < x.length) w[i] = x[j]; }
      const d = await new Promise((res, rej) => {
        const id = ++this.runId; this.pend.set(id, res);
        this.worker.postMessage({ type: 'run', id, audio: w, tEnd: 0 }, [w.buffer]);
        setTimeout(() => { if (this.pend.has(id)) { this.pend.delete(id); rej(new Error('The note model timed out.')); } }, 30000);
      });
      const nf = d.f.length / 88, first = pos <= -pad, last = pos + hop >= x.length;
      for (let i = 0; i < nf; i++) {
        const g = Math.round((pos + i * H) / H); if (g < 0 || g >= F) continue;
        const edge = Math.min(i, nf - 1 - i);
        if (edge < 30 && !(first && i < 30) && !(last && i > nf - 31)) continue;
        note.set(d.f.subarray(i * 88, i * 88 + 88), g * 88); onset.set(d.o.subarray(i * 88, i * 88 + 88), g * 88);
      }
      if (onProgress) onProgress(++k / nWin);
    }
    return { note, onset, F };
  },
  onResult(d){
    if (d.type === 'out' && this.pend.has(d.id)) { const r = this.pend.get(d.id); this.pend.delete(d.id); r(d); return; }
    this.busy = false;
    if (d.type !== 'out') return;
    this.ms = this.ms * 0.8 + d.ms * 0.2;
    const F = d.f.length / 88, tStart = d.tEnd - this.NS / this.SR;
    for (let i = 0; i < F; i++) {
      const t = tStart + (i + 0.5) * 256 / this.SR, k = Math.round(t * this.FPS);
      // keep the value computed with the most context around it (away from the window's edges)
      const edge = Math.min(i, F - 1 - i), prev = this.tl.get(k);
      if (prev && prev.edge > edge && prev.edge >= 15) continue;
      this.tl.set(k, { t, edge, note: d.f.subarray(i * 88, i * 88 + 88), onset: d.o.subarray(i * 88, i * 88 + 88) });
    }
    this.newestT = tStart + F * 256 / this.SR; this.reliableT = this.newestT - 15 * 256 / this.SR;
    const old = Math.round((this.newestT - 5) * this.FPS); for (const k of this.tl.keys()) if (k < old) this.tl.delete(k);
    this.findStrums();
  },
  frames(t0, t1){ const out = [], a = Math.round(t0 * this.FPS), b = Math.round(t1 * this.FPS); for (let k = a; k <= b; k++) { const f = this.tl.get(k); if (f) out.push(f); } return out; },
  // strums = moments where several pitches start together (or one clearly): the model's onset output peaks
  findStrums(){
    const from = Math.max(this.lastStrumT + 0.12, this.reliableT - 1.2), fr = this.frames(from, this.reliableT);
    const str = f => { const o = Array.from(f.onset.subarray(38 - 21, 89 - 21)).sort((a, b) => b - a); return o[0] + o[1] + o[2]; };
    const hist = this.frames(from - 1.0, this.reliableT).map(str).sort((a, b) => a - b), base = hist.length ? hist[Math.floor(hist.length * 0.5)] : 0;
    for (let i = 1; i < fr.length - 1; i++) {
      const s = str(fr[i]), mx = Math.max(...fr[i].onset.subarray(38 - 21, 89 - 21));
      if (mx < 0.45 || s < base + 0.6 || s < str(fr[i - 1]) || s < str(fr[i + 1])) continue;
      if (fr[i].t - this.lastStrumT < 0.12) continue;
      if (typeof Mic !== 'undefined' && fr[i].t < Mic.deafUntil) continue;          // the game's own guitar
      this.lastStrumT = fr[i].t;
      this.strums.push(fr[i].t); if (this.strums.length > 40) this.strums.shift();
      this.strumListeners.forEach(fn => fn(fr[i].t));
    }
  },
  // raw mic audio between t0 and t1 (null if it's no longer, or not yet, in the buffer)
  audio(t0, t1){
    const r = this.ring, L = r.length, n = Math.round((t1 - t0) * this.sr), back = Math.round((this.lastT - t1) * this.sr);
    if (back < 0 || back + n > this.ringFilled) return null;
    const out = new Float32Array(n), start = this.ringPos - back - n;
    for (let i = 0; i < n; i++) out[i] = r[((start + i) % L + L) % L];
    return out;
  },
  // did the chord's notes actually get louder at this strum? (compares the spectrum just before with just after;
  // steady background such as music, a TV or a droning pad is there both times and fails this)
  freshness(ts, midis){
    const N = Ear.N, d = N / this.sr;
    const b = this.audio(ts - 0.03 - d, ts - 0.03), a = this.audio(ts + 0.5 - d, ts + 0.5);
    if (!a || !b) return null;
    const nz = Mic.noiseReady ? Mic.noise : null;
    const anB = Ear.analyze(b, this.sr, nz), anA = Ear.analyze(a, this.sr, nz);
    const f = Ear.fresh(anA, anB, midis);
    f.rose = m => Ear.fresh(anA, anB, [m]).roseSet.has(m);           // did this one note start at the strum?
    return f;
  },
  // what was sounding between t0 and t1: mean note probability per MIDI note, plus the strongest onset per note just before
  heard(t0, t1){
    const fr = this.frames(t0, t1), note = new Float32Array(128), onset = new Float32Array(128);
    if (!fr.length) return null;
    for (const f of fr) for (let p = 0; p < 88; p++) note[p + 21] += f.note[p] / fr.length;
    for (const f of this.frames(t0 - 0.15, t0 + 0.12)) for (let p = 0; p < 88; p++) onset[p + 21] = Math.max(onset[p + 21], f.onset[p]);
    // what was already ringing just before: a note that was sounding then and didn't restart isn't part of this strum
    const before = new Float32Array(128), pre = this.frames(t0 - 0.4, t0 - 0.1);
    for (const f of pre) for (let p = 0; p < 88; p++) before[p + 21] += f.note[p] / pre.length;
    return { note, onset, before, n: fr.length };
  },
  // judge one chord from a heard() result. Every target note must be there; notes from outside the chord must not.
  // Measured on real guitars: a chord note that's the only one of its letter scores 0.38+ when played and at most
  // 0.13 when not, so it's clear-cut. A note whose letter is also on another string (G2 + G3 + G4 in G) can't be told
  // apart from that string's overtone (a "ghost" up to 0.49), so those strings only light up when they're very clear.
  judge(h, midis, mode){
    const P = { relaxed: { hear: 0.2, dup: 0.5, wrong: 0.55 }, normal: { hear: 0.25, dup: 0.55, wrong: 0.45 }, strict: { hear: 0.3, dup: 0.6, wrong: 0.38 } }[mode] || { hear: 0.25, dup: 0.55, wrong: 0.45 };
    const exp = [...new Set(midis)], pcs = new Set(exp.map(m => m % 12));
    const pcCount = {}; for (const m of exp) pcCount[m % 12] = (pcCount[m % 12] || 0) + 1;
    const res = { ok: false, fit: 0, missing: [], wrong: [], wrongNotes: [], noteState: {}, heardCount: 0, attempt: false, level: 0 };
    if (!h) { exp.forEach(m => res.noteState[m] = 'unsure'); return res; }
    let inE = 0, allE = 0;
    for (let m = 38; m <= 88; m++) { allE += h.note[m]; if (pcs.has(m % 12)) inE += h.note[m]; }   // guitar range only (drop-D to the 24th fret)
    res.fit = allE ? inE / allE : 0; res.level = allE;
    let allThere = true;
    for (const pc of Object.keys(pcCount).map(Number)) {
      const mine = exp.filter(m => m % 12 === pc);
      if (mine.length === 1) {
        const m = mine[0], st = h.note[m] >= P.hear ? 'heard' : 'missing';
        res.noteState[m] = st; if (st === 'heard') res.heardCount++; else { allThere = false; res.missing.push(pc); }
      } else {
        const best = Math.max(...mine.map(m => h.note[m]));
        if (best < P.hear) { allThere = false; res.missing.push(pc); mine.forEach(m => res.noteState[m] = 'missing'); continue; }
        res.heardCount++;
        for (const m of mine) res.noteState[m] = h.note[m] >= P.dup ? 'heard' : 'unsure';
        if (!mine.some(m => res.noteState[m] === 'heard')) res.noteState[mine.reduce((a, b) => h.note[a] >= h.note[b] ? a : b)] = 'heard';
      }
    }
    for (let m = 38; m <= 88; m++) if (!pcs.has(m % 12) && h.note[m] >= P.wrong) { res.wrongNotes.push(m); if (!res.wrong.includes(m % 12)) res.wrong.push(m % 12); }
    // only an attempt at the chord if at least two of its letters came through
    res.attempt = res.heardCount >= 2 || (res.heardCount >= 1 && Object.keys(pcCount).length <= 2);
    res.ok = allThere && res.wrong.length === 0;
    res.purity = res.fit;
    return res;
  },
  // the notes clearly sounding right now (for the mic check chips)
  now(){ const h = this.heard(this.reliableT - 0.35, this.reliableT); if (!h) return []; const out = []; for (let m = 38; m <= 88; m++) if (h.note[m] >= 0.4) out.push({ m, s: h.note[m] }); return out.sort((a, b) => b.s - a.s).slice(0, 6); },
};

const LISTEN_WORKER_SRC = `
let model = null, backend = '';
self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === 'init') {
    try {
      // serve the embedded .wasm files to the backend's loader
      const bins = { 'tfjs-backend-wasm.wasm': d.wasm, 'tfjs-backend-wasm-simd.wasm': d.wasmSimd, 'tfjs-backend-wasm-threaded-simd.wasm': d.wasmSimd };
      const realFetch = self.fetch ? self.fetch.bind(self) : null;
      self.fetch = (u, o) => { const k = Object.keys(bins).find(n => String(u).endsWith(n)); return k ? Promise.resolve(new Response(bins[k], { headers: { 'Content-Type': 'application/wasm' } })) : realFetch(u, o); };
      try { tf.wasm.setWasmPaths('https://embedded.invalid/'); } catch (err) {}
      let ok = false;
      try { ok = await tf.setBackend('wasm'); } catch (err) { ok = false; }
      if (!ok) await tf.setBackend('cpu');
      await tf.ready(); backend = tf.getBackend();
      const j = d.model;
      model = await tf.loadGraphModel(tf.io.fromMemory({ modelTopology: j.modelTopology, weightSpecs: j.weightsManifest[0].weights, weightData: d.weights }));
      const t0 = performance.now();
      const x = tf.zeros([1, 43844, 1]); const r = model.execute(x, ['Identity_1', 'Identity_2']); r[0].dataSync(); tf.dispose([x, ...r]);
      self.postMessage({ type: 'ready', backend, ms: performance.now() - t0 });
    } catch (err) { self.postMessage({ type: 'error', msg: String(err && err.message || err) }); }
  } else if (d.type === 'run' && model) {
    const t0 = performance.now();
    const x = tf.tensor3d(d.audio, [1, 43844, 1]);
    const r = model.execute(x, ['Identity_1', 'Identity_2']);
    const f = r[0].dataSync().slice(), o = r[1].dataSync().slice();
    tf.dispose([x, ...r]);
    self.postMessage({ type: 'out', id: d.id, tEnd: d.tEnd, f, o, ms: performance.now() - t0 }, [f.buffer, o.buffer]);
  }
};`;
