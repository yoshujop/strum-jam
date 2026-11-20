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
  // the last 3 s of mic audio at the context's rate (cap: a sample-exact ring), lastT = the time of its newest sample
  cap: null, ringFilled: 0, lastT: 0, sr: 48000,
  node: null, worker: null, linked: false, runId: 0, want: false,
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
      const worker = new Worker(urlOf([A.scripts.join('\n;\n'), '\n;\n', HearCoreFactory.toString(), '\n;\n', LISTEN_WORKER_SRC], 'text/javascript'));
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
      this.ready = true; this.link();
    } catch (e) { this.failed = String(e && e.message || e); console.warn('Listen: model unavailable, using the built-in ear', e); }
    this.loading = false;
    if (typeof UI !== 'undefined' && UI.refreshMic) UI.refreshMic();
  },
  // connect to the mic's source node. Capture (an AudioWorklet) counts every sample; the audio goes to the model's worker
  // over its own port and, in 43 ms batches, to a 3 s ring here (Listen.audio).
  attach(ctx, src){
    this.sr = ctx.sampleRate; this.cap = new HearCore.Ring(Math.ceil(this.sr * 3)); this.ringFilled = 0; this.lastT = 0;
    this.tl.clear(); this.strums = []; this.newestT = this.reliableT = 0; this.node = null; this.linked = false; this.gaps = 0;
    this.attaching = Capture.attach(ctx, src, {
      audio: (x, f0) => { const c = this.cap; c.write(f0, x); this.ringFilled = c.filled; this.lastT = c.end / this.sr; },
      onset: (e, at) => Hear.fastOnset(e, at),
      toWorker: (x, f0) => { if (this.linked && this.worker) this.worker.postMessage({ type: 'audio', f0, x }); },
    }).then(ok => { if (ok) { this.node = Capture.node; this.link(); } return ok; });
    return this.attaching;
  },
  // tell the worker where the live audio comes from (called when both the capture and the model are up)
  link(){
    if (!this.ready || !this.worker || !Capture.node) return;
    if (Capture.mode === 'worklet') { const ch = new MessageChannel(); this.worker.postMessage({ type: 'live', sr: this.sr, port: ch.port2 }, [ch.port2]); Capture.workerPort(ch.port1); }
    else this.worker.postMessage({ type: 'live', sr: this.sr });
    this.linked = true; this.wantSent = 0; this.setStretch(this.stretch || 1);
  },
  detach(){ Capture.detach(); if (this.worker && this.linked) this.worker.postMessage({ type: 'live', off: true }); this.linked = false; this.node = null; this.ringFilled = 0; },
  // called every animation frame. The worker looks again by itself as soon as it's free and there is new audio;
  // this only says whether anyone wants it to (a keep-alive, so a hidden or frozen page stops the model).
  tick(want){
    // parts that never read the note model don't run it (bass and voice use pitch tracking, drums the fast onsets)
    if (want && typeof Parts !== 'undefined' && Parts.active && Parts.inst !== 'piano' && !(typeof Calib !== 'undefined' && Calib.running)) want = false;
    this.want = want;
    if (!this.ready || !this.linked) return;
    const now = performance.now();
    if (want ? now - (this.wantSent || 0) > 400 : this.wantSent) { this.worker.postMessage({ type: 'want', ms: want ? 1500 : 0 }); this.wantSent = want ? now : 0; }
  },
  // the model's input can be played a little faster or slower, to bring a flat or sharp guitar back onto the notes it knows
  stretch: 1,
  setStretch(k){ this.stretch = k; if (this.worker && this.linked) this.worker.postMessage({ type: 'tune', stretch: k }); },
  // band-limited resampling to 22.05 kHz; returns exactly n samples ending at the newest sample (clips, tests: the live path resamples in the worker)
  resample(x, srIn, srOut, n){
    const pad = new Float32Array(x.length + 8); pad.set(x);
    return (this._rs || (this._rs = new HearCore.Resampler())).run(pad, srIn / srOut, n);
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
    if (d.type !== 'out' || !d.live) return;
    this.ms = this.ms * 0.8 + d.ms * 0.2; this.gaps = d.gaps || 0; this.looks = (this.looks || 0) + 1;
    // dtF: seconds of mic time per model frame (256 / 22050, times the tuning stretch)
    const F = d.f.length / 88, dtF = d.dtF || 256 / this.SR, tStart = d.tEnd - this.NS / 256 * dtF;
    for (let i = 0; i < F; i++) {
      const t = tStart + (i + 0.5) * dtF, k = Math.round(t * this.FPS);
      // keep the value computed with the most context around it (away from the window's edges)
      const edge = Math.min(i, F - 1 - i), prev = this.tl.get(k);
      if (prev && prev.edge > edge && prev.edge >= 15) continue;
      this.tl.set(k, { t, edge, note: d.f.subarray(i * 88, i * 88 + 88), onset: d.o.subarray(i * 88, i * 88 + 88) });
    }
    this.newestT = tStart + F * dtF; this.reliableT = this.newestT - 15 * dtF;
    const old = Math.round((this.newestT - 5) * this.FPS); for (const k of this.tl.keys()) if (k < old) this.tl.delete(k);
    this.findStrums();
    if (typeof Hear !== 'undefined') Hear.modelLook(d);
  },
  frames(t0, t1){ const out = [], a = Math.round(t0 * this.FPS), b = Math.round(t1 * this.FPS); for (let k = a; k <= b; k++) { const f = this.tl.get(k); if (f) out.push(f); } return out; },
  // strums = moments where several pitches start together (or one clearly): the model's onset output peaks
  findStrums(){
    const from = Math.max(this.lastStrumT + 0.12, this.reliableT - 1.2), fr = this.frames(from, this.reliableT);
    const str = f => { const o = Array.from(f.onset.subarray(38 - 21, 89 - 21)).sort((a, b) => b - a); return o[0] + o[1] + o[2]; };
    const hist = this.frames(from - 1.0, this.reliableT).map(str).sort((a, b) => a - b), base = hist.length ? hist[Math.floor(hist.length * 0.5)] : 0;
    for (let i = 1; i < fr.length - 1; i++) {
      if (fr[i].t > this.reliableT - 0.17) break;                                    // wait to hear whether notes ring on after it
      const s = str(fr[i]), mx = Math.max(...fr[i].onset.subarray(38 - 21, 89 - 21));
      if (mx < 0.45 || s < base + 0.6 || s < str(fr[i - 1]) || s < str(fr[i + 1])) continue;
      if (fr[i].t - this.lastStrumT < 0.12) continue;
      if (typeof Mic !== 'undefined' && fr[i].t < Mic.deafUntil) continue;          // the game's own guitar
      this.lastStrumT = fr[i].t;
      // how many strings started here (onset >= 0.3 within two frames)
      let n = 0; for (let p = 38 - 21; p < 89 - 21; p++) if (Math.max(fr[i].onset[p], fr[i - 1].onset[p], fr[i + 1].onset[p]) >= 0.3) n++;
      // the fast detector heard the same attack to the sample: use its time (the model's own is within about -80..+30 ms)
      const fo = typeof Hear !== 'undefined' ? Hear.nearFast(fr[i].t - 0.012, 0.05, 0.085) : null, t = fo ? fo.t : fr[i].t;
      // strings ring on: how many notes are sounding 40-160 ms after it. A clap, a knock, a snare or a consonant sets off
      // onsets all over the keyboard and then nothing; that is not a strum
      const after = this.frames(fr[i].t + 0.04, fr[i].t + 0.16); let sus = 0;
      if (after.length) for (let p = 38 - 21; p < 89 - 21; p++) { let a = 0; for (const f of after) a += f.note[p]; if (a / after.length >= 0.3) sus++; }
      if (this.strumFilter && (sus < 1 || (sus < 2 && (!fo || fo.kind !== 'tonal')))) { this.rejected.push({ t, n, sus, kind: fo ? fo.kind : '' }); if (this.rejected.length > 40) this.rejected.shift(); continue; }
      this.strums.push(t); if (this.strums.length > 40) this.strums.shift();
      this.strumInfo.push({ t, tm: fr[i].t, n, sus, kind: fo ? fo.kind : '' }); if (this.strumInfo.length > 40) this.strumInfo.shift();
      if (typeof Hear !== 'undefined') Hear.strumConfirmed(t, fo, n);
      // the game already got this strum from the fast detector, at the moment it happened (drums: only ever from there)
      if ((fo && fo.sent) || (typeof Mic !== 'undefined' && Mic.fastMode && Mic.fastMode())) continue;
      this.strumListeners.forEach(fn => fn(t));
    }
  },
  strumInfo: [], rejected: [], strumFilter: true,
  // raw mic audio between t0 and t1 (null if it's no longer, or not yet, in the buffer)
  audio(t0, t1){ return this.cap ? this.cap.read(Math.round(t1 * this.sr), Math.round((t1 - t0) * this.sr)) : null; },
  // Is this chord NEW at the strum at ts? Asked of the model itself: a string that was struck shows an onset there, or was
  // not sounding before and is now. (The old test compared 0.7 s of spectrum before and after, which a chord change over
  // a still-ringing chord, or a re-strum of the same chord, can never pass.) Steady background has no onsets and no change.
  freshness(ts, midis){
    if (!this.ready || !this.tl.size) return this.freshnessDsp(ts, midis);
    const win = this.frames(ts - 0.07, ts + 0.15); if (!win.length) return null;
    const on = new Float32Array(128), pre = new Float32Array(128), post = new Float32Array(128);
    for (const f of win) for (let p = 0; p < 88; p++) if (f.onset[p] > on[p + 21]) on[p + 21] = f.onset[p];
    const a = this.frames(ts - 0.4, ts - 0.1), b = this.frames(ts + 0.06, ts + 0.3);
    for (const f of a) for (let p = 0; p < 88; p++) pre[p + 21] += f.note[p] / a.length;
    for (const f of b) for (let p = 0; p < 88; p++) post[p + 21] += f.note[p] / b.length;
    const isNew = m => on[m] >= this.FRESH.on || (b.length > 0 && post[m] - pre[m] >= this.FRESH.jump);
    const exp = [...new Set(midis)], roseSet = new Set(exp.filter(isNew));
    // per pitch class too: the octave the model put the onset on doesn't matter
    const pcs = [...new Set(exp.map(m => m % 12))]; let rosePc = 0, sum = 0;
    for (const pc of pcs) { let best = 0, nw = false; for (let m = 38; m <= 88; m++) if (m % 12 === pc) { if (on[m] > best) best = on[m]; if (isNew(m)) nw = true; } sum += best; if (nw) rosePc++; }
    const need = Math.min(pcs.length, Math.max(1, Math.ceil(pcs.length * this.FRESH.share)));
    return { ok: rosePc >= need, nRose: rosePc, need, rise: sum, roseSet, rose: isNew, model: true };
  },
  FRESH: { on: 0.3, jump: 0.25, share: 0.5 },
  // the old spectrum test, kept for the fallback ear's logic and for comparison in tests
  freshnessDsp(ts, midis){
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
  // A mic trained in the ear calibration (Calib) may lower the "heard" bars (a quiet or dull mic) or raise the "wrong
  // note" bar (a mic that rings with ghosts); an untrained mic keeps the measured defaults.
  cal: null,
  judge(h, midis, mode){
    const P0 = { relaxed: { hear: 0.2, dup: 0.5, wrong: 0.55 }, normal: { hear: 0.25, dup: 0.55, wrong: 0.45 }, strict: { hear: 0.3, dup: 0.6, wrong: 0.38 } }[mode] || { hear: 0.25, dup: 0.55, wrong: 0.45 };
    const K = this.cal, P = K ? { hear: P0.hear * K.hearK, dup: P0.dup * K.hearK, wrong: Math.max(P0.wrong, K.wrongMin || 0) } : P0;
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
  now(){ const h = this.heard(this.reliableT - 0.35, this.reliableT); if (!h) return []; const out = []; const th = 0.4 * (this.cal ? this.cal.hearK : 1); for (let m = 38; m <= 88; m++) if (h.note[m] >= th) out.push({ m, s: h.note[m] }); return out.sort((a, b) => b.s - a.s).slice(0, 6); },
};

const LISTEN_WORKER_SRC = `
let model = null, backend = '';
// live listening: the capture worklet posts exact-frame audio here; resampling, the model and the tuning estimate all happen in this thread
const HC = HearCoreFactory(), rs = new HC.Resampler();
let ring = null, liveSr = 0, livePort = null, wantUntil = 0, looking = false, lastLook = -1, stretch = 1, raw = null;
function liveAudio(f0, x){ if (!ring) return; ring.write(f0, x); kick(); }
function kick(){ if (looking || !model || !ring || performance.now() > wantUntil || ring.end - lastLook < liveSr * 0.045) return; looking = true; setTimeout(look, 0); }
function look(){
  looking = false;
  if (!model || !ring || performance.now() > wantUntil || ring.filled < liveSr * 0.5) return;
  const ratio = liveSr / 22050 * stretch, need = Math.ceil(43844 * ratio) + 24, end = ring.end, have = Math.min(need, ring.filled);
  if (!raw || raw.length !== need) raw = new Float32Array(need); else raw.fill(0);
  ring.read(end, have, raw.subarray(need - have));
  const t0 = performance.now(), a = rs.run(raw, ratio, 43844);
  lastLook = end;
  const x = tf.tensor3d(a, [1, 43844, 1]);
  const r = model.execute(x, ['Identity_1', 'Identity_2']);
  const f = r[0].dataSync().slice(), o = r[1].dataSync().slice();
  tf.dispose([x, ...r]);
  const tune = HC.tuning(a, 22050);
  self.postMessage({ type: 'out', id: 0, live: true, tEnd: (end - rs.margin) / liveSr, dtF: 256 * ratio / liveSr, stretch, f, o, tune, gaps: ring.gaps, ms: performance.now() - t0 }, [f.buffer, o.buffer]);
  setTimeout(kick, 0);
}
self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === 'live') {
    if (livePort) { livePort.onmessage = null; try { livePort.close(); } catch (err) {} livePort = null; }
    if (d.off) { ring = null; return; }
    liveSr = d.sr; ring = new HC.Ring(Math.ceil(d.sr * 4)); lastLook = -1;
    if (d.port) { livePort = d.port; livePort.onmessage = m => liveAudio(m.data.f0, m.data.x); }
  } else if (d.type === 'audio') liveAudio(d.f0, d.x);
  else if (d.type === 'want') { wantUntil = d.ms ? performance.now() + d.ms : 0; kick(); }
  else if (d.type === 'tune') stretch = d.stretch || 1;
  else if (d.type === 'init') {
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
