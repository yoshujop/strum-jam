/* =====================================================================
   Capture: the mic's samples, every one of them, with exact timestamps.
   An AudioWorklet (inline Blob module) counts sample frames on the audio
   thread, so nothing is lost however busy the page is, and a sample's time
   is its frame number / sample rate on the AudioContext clock (never "now").
   The worklet also runs HearCore's onset detector, so a strum or a hit is
   reported a few tens of ms after the sound, and it sends the audio straight
   to the note model's worker over its own MessagePort (the page's main
   thread is not in that path).
   Fallback where AudioWorklet is missing: a ScriptProcessor feeding the same
   code on the main thread, with dropped buffers detected and counted.
   ===================================================================== */
const CAPTURE_WORKLET_SRC = HearCoreFactory.toString() + `
const HC = HearCoreFactory(), ZERO = new Float32Array(128);
class SJCapture extends AudioWorkletProcessor {
  constructor(){
    super();
    this.det = new HC.OnsetDetector(sampleRate, { onOnset: e => this.port.postMessage({ on: e, at: this.f }) });
    this.mb = new Float32Array(2048); this.mn = 0; this.mf = 0;      // batches for the page (43 ms)
    this.wb = new Float32Array(1024); this.wn = 0; this.wf = 0;      // batches for the model worker (21 ms)
    this.wp = null; this.f = -1; this.held = null; this.heldOff = 0; this.hb = new Float32Array(128); this.glitches = 0; this.lastGap = null; this.gaps = 0; this.gapFrames = 0; this.blocks = 0; this.dead = false;
    this.port.onmessage = e => { const d = e.data; if (d.port !== undefined) this.wp = d.port; if (d.sens) this.det.sens = d.sens; if (d.stop) this.dead = true; };
  }
  // The frame counter is our own (this.f). The context's currentFrame is only its reference: Chrome now and then hands a
  // block a stale currentFrame and catches up on the next one (no audio is missing), so a block whose label disagrees is
  // held for one quantum; only a disagreement that is still there on the next block is a real jump (audio skipped).
  process(inputs){
    if (this.dead) return false;
    const ch = inputs[0] && inputs[0][0], x = ch && ch.length ? ch : ZERO, cf = currentFrame;
    if (this.f < 0) this.f = cf;
    if (this.held) {
      const h = this.held; this.held = null;
      if (cf - h.length - this.f === this.heldOff) { this.gaps++; this.gapFrames += this.heldOff; this.lastGap = [this.f, this.f + this.heldOff]; this.flush(); this.f += this.heldOff; }
      else this.glitches++;
      this.take(h);
    }
    if (cf !== this.f) { this.heldOff = cf - this.f; (this.held = this.hb.subarray(0, x.length)).set(x); return true; }
    this.take(x);
    return true;
  }
  take(x){
    const n = x.length, f0 = this.f;
    this.f += n; this.blocks++;
    this.det.push(x, f0);
    if (!this.mn) this.mf = f0; this.mb.set(x, this.mn); this.mn += n;
    if (!this.wn) this.wf = f0; this.wb.set(x, this.wn); this.wn += n;
    if (this.wn + 128 > this.wb.length) this.sendW();
    if (this.mn + 128 > this.mb.length) this.sendM();
  }
  sendW(){ if (this.wn && this.wp) { const a = this.wb.slice(0, this.wn); this.wp.postMessage({ f0: this.wf, x: a }, [a.buffer]); } this.wn = 0; }
  sendM(){ if (!this.mn) return; const a = this.mb.slice(0, this.mn); this.port.postMessage({ f0: this.mf, x: a, st: Object.assign(this.det.stats(), { gaps: this.gaps, gapFrames: this.gapFrames, blocks: this.blocks, lastGap: this.lastGap, glitches: this.glitches }) }, [a.buffer]); this.mn = 0; }
  // what was collected before a gap is whole: send it on, the next batch starts after the gap
  flush(){ this.sendW(); this.sendM(); }
}
registerProcessor('sj-capture', SJCapture);`;

const Capture = {
  mode: '', node: null, ctx: null, sr: 48000, sink: null, det: null, cb: null, gen: 0,
  // gaps = places where audio went missing (worklet: skipped render quanta; fallback: buffers the main thread never got)
  // glitches = blocks the browser mislabelled (no audio missing; counted for the record)
  stats: { gaps: 0, gapFrames: 0, blocks: 0, rms: 0, peak: 0, clip: 0, noise: 0 },
  // cb: { audio(x, frame0), onset(ev, deliveredAtFrame), stats(s) }
  async attach(ctx, src, cb){
    this.detach();
    const gen = ++this.gen; this.ctx = ctx; this.sr = ctx.sampleRate; this.cb = cb || {};
    this.stats = { gaps: 0, gapFrames: 0, blocks: 0, rms: 0, peak: 0, clip: 0, noise: 0 };
    this.sink = ctx.createGain(); this.sink.gain.value = 0; this.sink.connect(ctx.destination);
    let node = null;
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined' && !Capture.forceFallback) {
      try {
        if (!ctx._sjCapture) {
          // a Blob module; where the page has no origin of its own (opened from a file, a sandboxed frame) a blob: module
          // is refused, and a data: URL loads instead
          const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET_SRC], { type: 'text/javascript' }));
          try { await ctx.audioWorklet.addModule(url); }
          catch (e1) { await ctx.audioWorklet.addModule('data:text/javascript;charset=utf-8,' + encodeURIComponent(CAPTURE_WORKLET_SRC)); }
          URL.revokeObjectURL(url); ctx._sjCapture = true;
        }
        if (gen !== this.gen) return false;
        node = new AudioWorkletNode(ctx, 'sj-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'discrete' });
        node.port.onmessage = e => {
          if (gen !== this.gen) return;
          const d = e.data;
          if (d.on) { if (this.cb.onset) this.cb.onset(d.on, d.at); return; }
          if (d.st) { Object.assign(this.stats, d.st); if (d.st.clip) this.stats.clipAt = performance.now(); if (this.cb.stats) this.cb.stats(this.stats); }
          if (d.x && this.cb.audio) this.cb.audio(d.x, d.f0);
        };
        this.mode = 'worklet';
      } catch (e) { console.warn('Capture: AudioWorklet unavailable, using the fallback', e); node = null; }
    }
    if (gen !== this.gen) return false;
    if (!node) {
      // fallback: same detector, on the main thread; frames are counted, and a jump in the clock counts as lost audio
      const sp = ctx.createScriptProcessor(1024, 1, 1), sr = this.sr; let end = -1;
      this.det = new HearCore.OnsetDetector(sr, { onOnset: e => { if (this.cb.onset) this.cb.onset(e, Math.round(ctx.currentTime * sr)); } });
      sp.onaudioprocess = e => {
        if (gen !== this.gen) return;
        const x = e.inputBuffer.getChannelData(0), n = x.length, nowF = Math.round(ctx.currentTime * sr);
        if (end < 0) end = nowF - n; else if (nowF - (end + n) > n * 1.5) { this.stats.gaps++; this.stats.gapFrames += nowF - n - end; end = nowF - n; }
        const f0 = end; end += n; this.stats.blocks++;
        this.det.push(x, f0);
        if ((this.stats.blocks & 15) === 0) { Object.assign(this.stats, this.det.stats()); if (this.stats.clip) this.stats.clipAt = performance.now(); if (this.cb.stats) this.cb.stats(this.stats); }
        const a = Float32Array.from(x); if (this.cb.audio) this.cb.audio(a, f0);
        if (this.cb.toWorker) this.cb.toWorker(a, f0);
      };
      node = sp; this.mode = 'script';
    }
    this.node = node;
    src.connect(node); node.connect(this.sink);
    return true;
  },
  // hand the worklet a MessagePort that leads to the model worker (null to stop)
  workerPort(port){ if (this.mode === 'worklet' && this.node) this.node.port.postMessage({ port }, port ? [port] : []); },
  sens(v){ if (this.mode === 'worklet' && this.node) this.node.port.postMessage({ sens: v }); else if (this.det) this.det.sens = v; },
  detach(){
    this.gen++;
    try { if (this.node) { if (this.mode === 'worklet') this.node.port.postMessage({ stop: true }); else this.node.onaudioprocess = null; this.node.disconnect(); } if (this.sink) this.sink.disconnect(); } catch (e) {}
    this.node = null; this.sink = null; this.det = null; this.mode = '';
  },
};
