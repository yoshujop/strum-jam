/* =====================================================================
   Mic: live listening on any microphone.
   - Strum onsets from spectral flux, gated against the mic's own noise floor.
   - Chord listening via Ear (long FFT + note estimation), every 3rd frame.
   - Learns each mic's background noise (hum, fans, hiss) and saves it per device.
   - McLeod pitch tracker for the tuner.
   ===================================================================== */
const Mic = {
  on: false, failed: '', warn: '', label: '', deviceId: '', stream: null, src: null, anLong: null, anSmall: null, sink: null,
  smallDb: null, prevDb: null, timeBuf: null, longBuf: null, sr: 48000, level: 0, rms: 0,
  fluxHist: [], lastOnset: -1, onsets: [], onsetListeners: new Set(), muteUntil: 0, deafUntil: 0,
  noiseRms: 0.002, rmsHist: [], noise: new Float32Array(128), noiseReady: false, lastLoud: -9, quietFrames: 0,
  an: null, anTime: 0, anSeq: 0, frame: 0, calibrating: false,
  available(){ return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
  async start(){
    if (this.on) return true;
    this.failed = ''; this.warn = '';
    if (!this.available()) { this.failed = 'blocked'; return false; }
    const ctx = AudioEngine.ensure();
    try { if (ctx.state === 'suspended') await ctx.resume(); } catch (e) {}
    const want = id => {
      // raw sound: no voice processing, which would squash sustained guitar notes
      const audio = { echoCancellation: !!Settings.echo, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } };
      if (id) audio.deviceId = { exact: id };
      return { audio };
    };
    // iOS 17+: say up front that we play and record, so Safari keeps our sound on the speaker instead of muting it
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) {}
    try {
      try { this.stream = await navigator.mediaDevices.getUserMedia(want(Settings.deviceId)); }
      catch (e) {
        // the saved mic was unplugged: fall back to the default one
        if (Settings.deviceId && e && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError' || e.name === 'NotReadableError')) {
          Settings.deviceId = ''; saveSettings();
          this.stream = await navigator.mediaDevices.getUserMedia(want(''));
        } else throw e;
      }
    } catch (e) {
      this.failed = (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) ? 'blocked' : (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) ? 'nodevice' : (e && e.name === 'NotReadableError') ? 'busy' : 'error';
      return false;
    }
    try { if (ctx.state !== 'running') await ctx.resume(); } catch (e) {}
    this.src = ctx.createMediaStreamSource(this.stream);
    this.anLong = ctx.createAnalyser(); this.anLong.fftSize = Ear.N; this.anLong.smoothingTimeConstant = 0;
    this.anSmall = ctx.createAnalyser(); this.anSmall.fftSize = 2048; this.anSmall.smoothingTimeConstant = 0;
    this.sink = ctx.createGain(); this.sink.gain.value = 0;
    this.src.connect(this.anLong); this.src.connect(this.anSmall);
    Listen.attach(ctx, this.src);
    this.anSmall.connect(this.sink); this.anLong.connect(this.sink); this.sink.connect(ctx.destination);
    this.sr = ctx.sampleRate;
    this.smallDb = new Float32Array(this.anSmall.frequencyBinCount);
    this.prevDb = new Float32Array(this.anSmall.frequencyBinCount).fill(-120);
    this.timeBuf = new Float32Array(this.anSmall.fftSize);
    this.longBuf = new Float32Array(this.anLong.fftSize);
    const tr = this.stream.getAudioTracks()[0];
    const st = (tr && tr.getSettings) ? tr.getSettings() : {};
    this.label = (tr && tr.label) || '';
    this.deviceId = st.deviceId || Settings.deviceId || 'default';
    // Bluetooth headsets drop to a phone-call mode with muffled 8-16 kHz audio when the mic is on
    if (/hands-?free|headset|airpods|bluetooth|\bbt\b|buds|hfp|wh-1000|bose|beats/i.test(this.label) || (st.sampleRate && st.sampleRate <= 16000)) this.warn = 'bluetooth';
    this.rmsHist = []; this.fluxHist = []; this.an = null; this.lastLoud = -9; this.quietFrames = 0;
    this.loadProfile();
    this.on = true;
    if (tr) tr.addEventListener('ended', () => { this.stop(); this.failed = 'ended'; if (typeof UI !== 'undefined') UI.refreshMic(); });
    if (!this._dc && navigator.mediaDevices.addEventListener) {
      this._dc = true;
      navigator.mediaDevices.addEventListener('devicechange', () => { if (typeof UI !== 'undefined' && UI.openModal === 'm-mic') UI.fillDevices(); });
    }
    return true;
  },
  stop(){
    try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch (e) {}
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    try { this.src && this.src.disconnect(); this.sink && this.sink.disconnect(); } catch (e) {}
    Listen.detach();
    this.on = false; this.stream = null; this.an = null;
  },
  async devices(){
    try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch (e) { return []; }
  },
  loadProfile(){
    const p = (Settings.micProfiles || {})[this.deviceId];
    this.noise.fill(0); this.noiseReady = false; this.noiseRms = 0.002;
    if (p && Array.isArray(p.noise)) { p.noise.forEach((v, i) => { this.noise[36 + i] = +v || 0; }); this.noiseReady = true; this.noiseRms = Math.max(0.0002, +p.rms || 0.002); }
  },
  saveProfile(){
    const all = Settings.micProfiles || (Settings.micProfiles = {});
    all[this.deviceId] = { noise: Array.from(this.noise.subarray(36, 101), v => +v.toPrecision(3)), rms: +this.noiseRms.toPrecision(3), at: Date.now() };
    const keys = Object.keys(all); if (keys.length > 8) delete all[keys.sort((a, b) => all[a].at - all[b].at)[0]];
    saveSettings();
  },
  // anything quieter than this is the room, not the guitar
  gate(){ return Math.max(0.0012, this.noiseRms * 2.6); },
  // Called once per animation frame. wantEar: run chord listening too.
  analyze(wantEar){
    if (!this.on) return;
    const ctx = AudioEngine.ctx; const now = ctx.currentTime;
    this.frame++;
    // --- level + learned noise floor ---
    this.anSmall.getFloatTimeDomainData(this.timeBuf);
    let s = 0; for (let i = 0; i < this.timeBuf.length; i++) s += this.timeBuf[i] * this.timeBuf[i];
    this.rms = Math.sqrt(s / this.timeBuf.length);
    this.level = Math.max(this.rms, this.level * 0.92);
    const rh = this.rmsHist; rh.push(this.rms); if (rh.length > 360) rh.shift();
    if (this.frame % 20 === 0 && rh.length > 60 && !this.calibrating) {
      const sorted = rh.slice().sort((a, b) => a - b), p10 = sorted[Math.floor(sorted.length * 0.1)];
      // follow the floor down quickly; up only very slowly and never while someone is strumming,
      // so ringing chords don't get mistaken for room noise
      if (p10 < this.noiseRms) this.noiseRms = this.noiseRms * 0.5 + p10 * 0.5;
      else if (now - this.lastOnset > 2.5) this.noiseRms = this.noiseRms * 0.985 + p10 * 0.015;
      this.noiseRms = Math.max(0.0002, this.noiseRms);
    }
    const gate = this.gate();
    // --- strum onsets from the small window ---
    this.anSmall.getFloatFrequencyData(this.smallDb);
    const kb = this.sr / this.anSmall.fftSize;
    const lo = Math.floor(80 / kb), hi = Math.min(this.smallDb.length - 1, Math.floor(5000 / kb));
    let flux = 0;
    for (let k = lo; k <= hi; k++) {
      const d = this.smallDb[k]; const p = this.prevDb[k];
      if (d > -95) { const inc = d - Math.max(p, -95); if (inc > 0) flux += inc; }
      this.prevDb[k] = d;
    }
    const fh = this.fluxHist; fh.push(flux); if (fh.length > 40) fh.shift();
    const sorted = fh.slice().sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)] || 0;
    const sens = Settings.sens;
    const thr = Math.max(med * 2.2, 260 + (10 - sens) * 40);
    const loudEnough = this.rms > gate * (1.9 - sens * 0.09);
    if (this.rms > gate * 1.25) this.lastLoud = now;
    if (flux > thr && loudEnough && now - this.lastOnset > 0.11 && now > this.muteUntil) {
      this.lastOnset = now;
      const t = now - 0.012;
      if (Listen.ready) { /* the neural listener reports strums itself; raw loudness jumps are ignored */ } else {
      this.onsets.push(t); if (this.onsets.length > 40) this.onsets.shift();
      this.onsetListeners.forEach(fn => fn(t));
      }
    }
    Listen.tick(wantEar);
    // --- chord listening (and noise learning when the room is quiet) ---
    if (this.frame % 3 !== 0) return;
    const quiet = now - this.lastLoud > 1.5 && now - this.lastOnset > 1.5;
    if (quiet) {
      this.quietFrames++;
      this.an = { T: null, R0: new Float32Array(128), notes: [], total: 0, chroma: new Float32Array(12), quiet: true };
      this.anTime = now; this.anSeq++; this.remember(now, this.an);
      // re-learn the background every ~0.5 s of silence
      if (this.quietFrames % 10 === 0 && !this.calibrating) {
        this.anLong.getFloatTimeDomainData(this.longBuf);
        const T = Ear.analyze(this.longBuf, this.sr, null).T;
        const k = this.noiseReady ? 0.15 : 0.5;
        for (let m = 36; m <= 100; m++) this.noise[m] += (T[m] - this.noise[m]) * k;
        this.noiseReady = true;
        if (this.quietFrames % 200 === 0) this.saveProfile();
      }
      return;
    }
    this.quietFrames = 0;
    if (!wantEar || Listen.ready) return;
    this.anLong.getFloatTimeDomainData(this.longBuf);
    this.an = Ear.analyze(this.longBuf, this.sr, this.noiseReady ? this.noise : null);
    this.anTime = now; this.anSeq++; this.remember(now, this.an);
  },
  // a short history of frames, so a strum can be compared with what was already sounding before it
  hist: [],
  remember(t, an){ this.hist.push({ t, R0: Float32Array.from(an.R0), T: an.T ? Float32Array.from(an.T) : null }); if (this.hist.length > 80) this.hist.shift(); },
  // the last frame that ended before time t (null when there isn't one yet)
  frameBefore(t){ for (let i = this.hist.length - 1; i >= 0; i--) if (this.hist[i].t <= t) return this.hist[i]; return null; },
  // the audio a chord frame is made of: [start, end] in AudioContext time
  frameStart(){ return this.anTime - Ear.N / this.sr; },
  deaf(sec){ const ctx = AudioEngine.ctx; if (ctx) this.deafUntil = Math.max(this.deafUntil, ctx.currentTime + sec); },
  // notes the Ear is sure about right now (for the mic check)
  heardNotes(){
    if (Listen.ready) return Listen.now();
    if (!this.an || !this.an.notes) return [];
    const ns = this.an.notes.filter(n => !n.ex), mx = Math.max(0, ...ns.map(n => n.s));
    // only notes that stand well clear of the background hiss count as heard
    const T = this.an.T, fl = this.an.floor || 0;
    return ns.filter(n => n.s >= mx * 0.18 && (!T || !fl || T[n.m] >= 12 * fl || T[n.m + 12] >= 12 * fl)).map(n => ({ m: n.m, s: n.s })).slice(0, 6);
  },
  // quiet for 2 s, then strum: learns this mic's noise and checks its level
  async calibrate(onStep){
    if (!this.on) return { ok: false };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    this.calibrating = true;
    try {
      onStep && onStep('quiet');
      await sleep(750);                         // let the button click leave the long window
      const frames = [], levels = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 2000) {
        await sleep(100);
        this.anLong.getFloatTimeDomainData(this.longBuf);
        frames.push(Float32Array.from(Ear.analyze(this.longBuf, this.sr, null).T));
        levels.push(this.rms);
      }
      const noise = new Float32Array(128);
      for (let m = 36; m <= 100; m++) { const v = frames.map(f => f[m]).sort((a, b) => a - b); noise[m] = v[Math.floor(v.length * 0.9)] || 0; }
      levels.sort((a, b) => a - b);
      const floor = Math.max(0.0002, levels[Math.floor(levels.length / 2)] || 0.002);
      this.noise.set(noise); this.noiseReady = true; this.noiseRms = floor;
      this.saveProfile();
      onStep && onStep('strum');
      let peak = 0; const t1 = performance.now();
      while (performance.now() - t1 < 3000) { await sleep(40); peak = Math.max(peak, this.rms); }
      const snr = peak / floor;
      return { ok: true, snr, peak, floor };
    } finally { this.calibrating = false; }
  },
  // McLeod pitch method on the most recent ~3k samples (tuner)
  pitch(){
    if (!this.on) return null;
    this.anLong.getFloatTimeDomainData(this.longBuf);
    const N = 3072, x = this.longBuf.subarray(this.longBuf.length - N);
    let e = 0; for (let i = 0; i < N; i++) e += x[i] * x[i];
    if (Math.sqrt(e / N) < Math.max(0.004, this.gate() * 1.4)) return null;
    const minLag = Math.floor(this.sr / 1100), maxLag = Math.min(Math.floor(this.sr / 62), N - 600);
    const nsdf = new Float32Array(maxLag + 2);
    for (let tau = minLag; tau <= maxLag + 1; tau++) {
      let ac = 0, m = 0;
      for (let i = 0; i < N - tau; i++) { ac += x[i] * x[i + tau]; m += x[i] * x[i] + x[i + tau] * x[i + tau]; }
      nsdf[tau] = m ? 2 * ac / m : 0;
    }
    let gmax = 0; for (let t = minLag; t <= maxLag; t++) if (nsdf[t] > gmax) gmax = nsdf[t];
    if (gmax < 0.6) return null;
    let best = -1;
    for (let t = minLag + 1; t <= maxLag; t++) if (nsdf[t] > nsdf[t - 1] && nsdf[t] >= nsdf[t + 1] && nsdf[t] >= 0.88 * gmax) { best = t; break; }
    if (best < 0) return null;
    const a = nsdf[best - 1], b = nsdf[best], c = nsdf[best + 1];
    const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
    const f = this.sr / (best + (Number.isFinite(shift) ? shift : 0));
    if (f < 60 || f > 1100) return null;
    return { f, clarity: b };
  },
};
