/* =====================================================================
   Audio engine: one AudioContext, the mix bus, the plucked-guitar model.

   Signal path
     band voices -> AudioEngine.out(name) -> channel strip (pan, sends, sidechain duck)
        drums  -> drum glue compressor \
        others ------------------------> band bus (Settings.drumVol) -> sweep filter -> duckBus
     room + plate reverbs (generated impulse responses) return to duckBus
     playerBus (what the player makes) -> duckBus          clickBus, sfxBus -> master
     master -> glue compressor -> limiter -> soft clip (ceiling 0.92) -> destination

   API others use
     AudioEngine.ensure() -> ctx           AudioEngine.now() / smoothNow() / outputLatency()
     AudioEngine.kit.kick|snare|hat|...(t, v)        the drum voices (31-voices.js) on the band's strips
     AudioEngine.out(name) -> AudioNode    where a voice called `name` (see CH) should connect
     AudioEngine.onPlayerBus(fn)           run voice calls so they sound on the player's bus
     AudioEngine.strum(notes, t, gap, vel) the game's acoustic guitar (chord preview; deafens the mic while it rings)
     AudioEngine.playerStrum(notes, {t, up, vel, mute, gap})   the PLAYER's guitar (tap mode): sounds the chord on
                                           playerBus; notes null/empty = a dead (muted) strum
     AudioEngine.leakMode() -> 'full' | 'safe' | 'drums'   how much pitched band the mic can take right now
     AudioEngine.offline(seconds, fn) -> Promise<AudioBuffer>   render what fn schedules, for tests
   ===================================================================== */
const AudioEngine = (() => {
  let ctx = null, g = null, smooth = { off: null }, chordTaps = { key: '', n: 0, at: 0 }, route = null, forcedLeak = null, isOffline = false;
  const pluckCache = new Map(), irCache = new Map();
  let noiseBuf = null, bodyBuf = null;
  // channel strips: [group d=drums i=instruments, pan, gain, room send, plate send, wide]
  const CH = {
    kick: ['d', 0, 1, 0.03, 0], snare: ['d', 0.06, 1, 0.2, 0.1], hat: ['d', 0.34, 1, 0.05, 0], ride: ['d', -0.4, 1, 0.1, 0.04], crash: ['d', -0.24, 1, 0.12, 0.16],
    tomH: ['d', 0.36, 1, 0.2, 0.07], tomM: ['d', 0.05, 1, 0.2, 0.07], tomL: ['d', -0.38, 1, 0.2, 0.07], perc: ['d', -0.46, 1, 0.16, 0.05], clap: ['d', 0.2, 1, 0.25, 0.14],
    bass: ['i', 0, 1, 0.02, 0], keys: ['i', -0.3, 1.2, 0.1, 0.16], organ: ['i', 0.36, 1, 0.1, 0.14], pad: ['i', 0, 1, 0.04, 0.3, 1],
    gtrE: ['i', 0.44, 1.3, 0.14, 0.08], gtrD: ['i', 0.3, 1, 0.1, 0.07, 1], gtrA: ['i', 0.4, 1, 0.1, 0.12], lead: ['i', -0.14, 1, 0.08, 0.28],
    crowd: ['i', 0, 1, 0.2, 0.2, 1], fx: ['i', 0, 1, 0, 0.3, 1],
  };
  function noiseBuffer(sr){
    if (!noiseBuf) { noiseBuf = new AudioBuffer({ length: sr * 2, sampleRate: sr, numberOfChannels: 1 }); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    return noiseBuf;
  }
  // a room made from scratch: a few early reflections, then noise that decays and darkens with time (highs die first)
  function makeIR(sr, sec, bright, pre){
    const key = [sr, sec, bright].join('|'); if (irCache.has(key)) return irCache.get(key);
    const len = Math.round(sr * sec), ir = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: 2 });
    let seed = 1234567 + Math.round(sec * 1000);
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch), p0 = Math.round(sr * pre);
      for (let n = 0; n < 9; n++) { const at = p0 + Math.round(sr * (0.004 + rnd() * 0.055 * Math.min(1, sec))); d[at] += (rnd() < 0.5 ? -1 : 1) * 0.5 * Math.pow(0.82, n); }
      let lp = 0, e = 0;
      for (let i = p0; i < len; i++) {
        const x = (i - p0) / sr, a = Math.exp(-6.9 * x / sec), k = Math.max(0.04, bright * Math.exp(-2.2 * x / sec));
        lp += k * ((rnd() * 2 - 1) - lp); d[i] += lp * a * Math.min(1, x / 0.012) * 0.6;
      }
      for (let i = 0; i < len; i++) e += d[i] * d[i];
      const nk = 1 / Math.sqrt(e || 1); for (let i = 0; i < len; i++) d[i] *= nk;
    }
    irCache.set(key, ir); return ir;
  }
  function softClip(c){
    const n = 2049, curve = new Float32Array(n), k = 0.7, r = 0.28;
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1, a = Math.abs(x); curve[i] = Math.sign(x) * (a <= k ? a : k + r * Math.tanh((a - k) / r)); }
    const s = c.createWaveShaper(); s.curve = curve; return s;
  }
  function driveCurve(amount, n = 1025){ const cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(x * amount) / Math.tanh(amount); } return cv; }
  // one channel strip: tone shaping for a few instruments, a sidechain duck gain, pan (or a widener), two reverb sends
  function strip(c, G, name, out){
    const [, pan, gain, room, plate, wide] = CH[name];
    const inp = c.createGain(); inp.gain.value = gain;
    let last = inp;
    const add = n => { last.connect(n); last = n; return n; };
    const filt = (type, f, q, gn) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (gn != null) b.gain.value = gn; return add(b); };
    if (name === 'bass') {            // a little overdrive puts harmonics where small speakers can play them
      const pre = c.createGain(); pre.gain.value = 1.5; add(pre);
      const sh = c.createWaveShaper(); sh.curve = driveCurve(1.6); add(sh);
      filt('peaking', 750, 0.8, 3); filt('lowpass', 3800, 0.5);
      const lvl = c.createGain(); lvl.gain.value = 0.36; add(lvl);
    } else if (name === 'gtrD') {     // amp: drive, then a speaker cabinet
      filt('highpass', 110, 0.7);
      const pre = c.createGain(); pre.gain.value = 9; add(pre);
      const sh = c.createWaveShaper(); sh.curve = driveCurve(3.2); sh.oversample = '2x'; add(sh);
      filt('peaking', 1500, 0.8, 3); filt('peaking', 320, 0.8, 3); filt('lowpass', 3700, 0.8); filt('highpass', 90, 0.7);
      const lvl = c.createGain(); lvl.gain.value = 0.13; add(lvl);
    } else if (name === 'gtrE') { filt('highpass', 190, 0.7); filt('peaking', 2300, 0.9, 4); filt('lowpass', 6500, 0.6); }
    else if (name === 'gtrA') {
      const conv = c.createConvolver(); conv.normalize = true; conv.buffer = bodyIR(c.sampleRate);
      const dry = c.createGain(), wet = c.createGain(), sum = c.createGain(); dry.gain.value = 0.5; wet.gain.value = 0.8;
      last.connect(dry).connect(sum); last.connect(conv).connect(wet).connect(sum); last = sum; filt('highpass', 95, 0.7);
    }
    const duck = c.createGain(); add(duck);
    let lfo = null;
    if (wide) {                        // Haas widener: the right side a few ms late and a touch duller
      const m = c.createChannelMerger(2), d = c.createDelay(0.05), lp = c.createBiquadFilter(); d.delayTime.value = 0.013; lp.type = 'lowpass'; lp.frequency.value = 7000;
      const mono = c.createGain(); mono.channelCount = 1; mono.channelCountMode = 'explicit'; add(mono);
      const dg = c.createGain(), sg = c.createGain(); dg.gain.value = 0.6; sg.gain.value = 0.4;          // partly correlated, so a mono phone speaker doesn't comb-filter it
      mono.connect(m, 0, 0); mono.connect(d).connect(lp).connect(dg).connect(m, 0, 1); mono.connect(sg).connect(m, 0, 1); m.connect(out);
      const s1 = c.createGain(), s2 = c.createGain(); s1.gain.value = room; s2.gain.value = plate; m.connect(s1).connect(G.room); m.connect(s2).connect(G.plate);
    } else {
      const p = c.createStereoPanner(); p.pan.value = pan; add(p); p.connect(out);
      if (name === 'keys' || name === 'organ') {   // tremolo / rotary: a slow sway across the stereo field
        lfo = c.createOscillator(); lfo.frequency.value = name === 'keys' ? 1.3 : 5.6; const lg = c.createGain(); lg.gain.value = name === 'keys' ? 0.28 : 0.2; lfo.connect(lg).connect(p.pan); lfo.start();
      }
      const s1 = c.createGain(), s2 = c.createGain(); s1.gain.value = room; s2.gain.value = plate; p.connect(s1).connect(G.room); p.connect(s2).connect(G.plate);
    }
    return { in: inp, duck, lfo };
  }
  // a full set of strips feeding `out` (drums through `drumOut`): the band has one, the menu music another
  // ownVerb: the set gets its own two reverbs returning into `out`, so fading `out` also ends the tails (the menu theme
  // must be gone when a song starts with the mic open)
  function makeStrips(out, drumOut, ownVerb){
    ensure(); const set = {}; let G = g;
    if (ownVerb) {
      G = { room: ctx.createConvolver(), plate: ctx.createConvolver() }; G.room.buffer = g.room.buffer; G.plate.buffer = g.plate.buffer;
      const rr = ctx.createGain(), pr = ctx.createGain(); rr.gain.value = 1.6; pr.gain.value = 1.5; G.room.connect(rr).connect(out); G.plate.connect(pr).connect(out);
    }
    for (const name in CH) set[name] = strip(ctx, G, name, CH[name][0] === 'd' ? (drumOut || out) : out);
    return set;
  }
  function build(c){
    const G = { run: {} };
    G.master = c.createGain(); G.master.gain.value = 0.9;
    const glue = c.createDynamicsCompressor(); glue.threshold.value = -16; glue.knee.value = 10; glue.ratio.value = 2; glue.attack.value = 0.02; glue.release.value = 0.25;
    const lim = c.createDynamicsCompressor(); lim.threshold.value = -5; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.09;
    G.trim = c.createGain(); G.trim.gain.value = 0.75;      // takes back the compressors' automatic make-up gain
    G.master.connect(glue).connect(lim).connect(G.trim).connect(softClip(c)).connect(c.destination);
    // background music (band + menu theme) goes through duckBus so it can dip while a chord preview plays
    G.duckBus = c.createGain(); G.duckBus.connect(G.master);
    G.sweep = c.createBiquadFilter(); G.sweep.type = 'lowpass'; G.sweep.frequency.value = 20000; G.sweep.Q.value = 0.7; G.sweep.connect(G.duckBus);
    G.drumBus = c.createGain(); G.drumBus.gain.value = Settings.drumVol; G.drumBus.connect(G.sweep);         // the whole band's level
    const dc = c.createDynamicsCompressor(); dc.threshold.value = -16; dc.knee.value = 8; dc.ratio.value = 3.5; dc.attack.value = 0.012; dc.release.value = 0.14;
    G.drumSub = c.createGain(); G.drumSub.gain.value = 1.4; G.drumSub.connect(dc).connect(G.drumBus);
    G.room = c.createConvolver(); G.room.buffer = makeIR(c.sampleRate, 0.45, 0.55, 0.004);
    G.plate = c.createConvolver(); G.plate.buffer = makeIR(c.sampleRate, 1.7, 0.4, 0.018);
    const rr = c.createGain(), pr = c.createGain(); rr.gain.value = 1.6; pr.gain.value = 1.5;
    G.room.connect(rr).connect(G.duckBus); G.plate.connect(pr).connect(G.duckBus);
    // what the player makes (pads, MIDI kit, MIDI keys, tap-mode strums), apart from the band, so an Online take can record just that
    G.playerBus = c.createGain(); G.playerBus.gain.value = 0.9; G.playerBus.connect(G.duckBus);
    const ps = c.createGain(); ps.gain.value = 0.1; G.playerBus.connect(ps).connect(G.room);
    G.clickBus = c.createGain(); G.clickBus.gain.value = 0.5; G.clickBus.connect(G.master);
    G.sfxBus = c.createGain(); G.sfxBus.gain.value = 0.8; G.sfxBus.connect(G.master);
    const ss = c.createGain(); ss.gain.value = 0.12; G.sfxBus.connect(ss).connect(G.plate);
    G.band = {}; for (const name in CH) G.band[name] = strip(c, G, name, CH[name][0] === 'd' ? G.drumSub : G.drumBus);
    return G;
  }
  function ensure(){
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      g = build(ctx);
      // iOS pauses ("interrupts") the context when the mic opens or a call comes in: wake it on the next touch
      const live = ctx, wake = () => { if (live.state !== 'running' && live.state !== 'closed') live.resume().catch(() => {}); };
      ['pointerdown', 'touchend', 'keydown'].forEach(e => window.addEventListener(e, wake, { passive: true }));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
      live.onstatechange = () => { if (live.state === 'interrupted') setTimeout(wake, 300); };
    }
    if (!isOffline && (ctx.state === 'suspended' || ctx.state === 'interrupted')) ctx.resume().catch(() => {});
    return ctx;
  }
  // where a band voice connects: the current run's input to that strip (a run can be cut off in one go, see cutRun)
  function out(name){
    if (route) return route(name);
    let r = g.run[name];
    if (!r) { r = g.run[name] = ctx.createGain(); r.connect(g.band[name].in); }
    return r;
  }
  // silence everything the band has already scheduled (pause, restart): the look-ahead means notes are queued ~0.4 s ahead
  // names: only those strips (e.g. the pitched ones when the chord changes under a practice loop)
  function cutRun(names){
    if (!ctx || !g || isOffline) return;
    const old = g.run, t = ctx.currentTime; g.run = {};
    for (const k in old) {
      const n = old[k];
      if (names && !names.includes(k)) { g.run[k] = n; continue; }
      n.gain.setValueAtTime(1, t); n.gain.linearRampToValueAtTime(0, t + 0.04); setTimeout(() => { try { n.disconnect(); } catch (e) {} }, 2500);
    }
    if (!names) { g.sweep.frequency.cancelScheduledValues(t); g.sweep.frequency.setValueAtTime(20000, t); }
  }
  // kick -> bass (and pads) sidechain: a quick dip so the low end doesn't pile up
  function pump(t, depth, names){
    if (route) return;
    for (const n of names || ['bass']) { const d = g.band[n].duck.gain; d.setTargetAtTime(1 - depth, t, 0.004); d.setTargetAtTime(1, t + 0.05, 0.07); }
  }
  // the whole band through a closing or opening filter (losing hype, a drop, a build)
  function bandSweep(t, f0, f1, dur){
    const p = g.sweep.frequency; p.cancelScheduledValues(t); p.setValueAtTime(f0, t); p.exponentialRampToValueAtTime(f1, t + dur);
    if (f1 < 19000) p.setValueAtTime(20000, t + dur + 0.01);
  }
  const env = (gn, t, peak, decay, attack = 0.002) => {
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };
  function noise(t, peak, decay, type, freq, q, bus, attack){
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx.sampleRate);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const gn = ctx.createGain(); env(gn, t, peak, decay, attack || 0.002);
    src.connect(f).connect(gn).connect(bus || out('perc'));
    src.start(t, Math.random() * 1.5); src.stop(t + decay + (attack || 0) + 0.05);
  }
  function tone(t, type, f0, f1, peak, decay, bus, attack, ramp){
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + (ramp || decay * 0.6));
    const gn = ctx.createGain(); env(gn, t, peak, decay, attack || 0.002);
    o.connect(gn).connect(bus || out('perc')); o.start(t); o.stop(t + decay + (attack || 0) + 0.05);
  }
  // 'full': mic off or headphones on: the whole band.   'safe': mic on, speakers: unpitched drums, a bass that keeps to
  // the chord's root and fifth, one soft pad on the chord's own notes (see Arranger).   'drums': no pitched part at all.
  function leakMode(){
    if (forcedLeak) return forcedLeak;
    const leaks = typeof Mic !== 'undefined' && Mic.on && !Settings.headphones;
    return leaks ? (Settings.leakBand === 'drums' ? 'drums' : 'safe') : 'full';
  }
  const kit = {};
  ['kick', 'snare', 'rim', 'brush', 'clap', 'tamb', 'hat', 'ohat', 'ride', 'crash', 'tom', 'bass', 'click', 'sticks', 'shaker', 'cowbell'].forEach(k => { kit[k] = (...a) => Voices[k](...a); });
  /* ---- acoustic guitar: one physically modelled string per note (extended Karplus-Strong: tuned with an
     all-pass fractional delay, plucked about an eighth of the way from the bridge, wound strings darker and
     longer-ringing), then a steel-string guitar body (the air resonance near 100 Hz and the top-plate modes)
     and a small room. A strum rolls across the strings of the exact shape on screen, low to high. ---- */
  function bodyIR(sr){
    if (bodyBuf) return bodyBuf;
    const len = Math.round(sr * 1.1), ir = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: 2 });
    const modes = [[98, 1.0, 0.07], [118, 0.45, 0.05], [196, 0.8, 0.05], [245, 0.35, 0.04], [290, 0.45, 0.035], [405, 0.55, 0.03], [520, 0.35, 0.025],
      [690, 0.3, 0.02], [880, 0.22, 0.016], [1150, 0.2, 0.012], [1600, 0.14, 0.009], [2400, 0.1, 0.006]];
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      d[0] = 1.2;
      for (const [f, a, tau] of modes) { const ff = f * (ch ? 1.012 : 0.994), w = 2 * Math.PI * ff / sr, ph = Math.random() * 0.4; for (let i = 0; i < Math.min(len, sr * tau * 7); i++) d[i] += a * 0.09 * Math.exp(-i / (sr * tau)) * Math.sin(w * i + ph); }
      // wood texture + a short, soft room
      let lp = 0; for (let i = 0; i < len; i++) { const r = Math.random() * 2 - 1; lp = lp * 0.72 + r * 0.28; d[i] += lp * (0.05 * Math.exp(-i / (sr * 0.012)) + 0.018 * Math.exp(-i / (sr * 0.32)) * Math.min(1, i / (sr * 0.01))); }
    }
    return bodyBuf = ir;
  }
  function guitarBus(dest){
    const key = dest ? 'gtrPlayer' : 'gtrIn';
    if (g[key]) return g[key];
    const conv = ctx.createConvolver(); conv.normalize = true; conv.buffer = bodyIR(ctx.sampleRate);
    const dry = ctx.createGain(); dry.gain.value = 0.55;
    const wet = ctx.createGain(); wet.gain.value = 0.9;
    const tn = ctx.createBiquadFilter(); tn.type = 'lowpass'; tn.frequency.value = 7200; tn.Q.value = 0.5;
    const o = ctx.createGain(); o.gain.value = 1;
    const inp = g[key] = ctx.createGain();
    inp.connect(dry).connect(tn); inp.connect(conv).connect(wet).connect(tn);
    tn.connect(o).connect(dest || g.sfxBus);
    return inp;
  }
  // short = true: a buffer of at most 1.5 s for the band's comping (the previews keep the full ring)
  function pluckBuffer(midi, string, vel, short){
    string = string == null ? (midi < 50 ? 0 : midi < 55 ? 1 : midi < 59 ? 2 : midi < 64 ? 3 : midi < 69 ? 4 : 5) : string;
    vel = vel == null ? 0.8 : vel;
    const key = midi + '|' + string + '|' + Math.round(vel * 4) + (short ? 's' : '');
    if (pluckCache.has(key)) return pluckCache.get(key);
    const sr = ctx.sampleRate, f = midiToHz(midi), wound = string <= 2;
    const t60 = (wound ? 5.2 : 3.4) * Math.pow(110 / f, 0.35);          // lower notes ring longer
    const len = Math.round(sr * Math.min(short ? 1.5 : 4.5, t60 * 0.9 + 0.4));
    const buf = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: 1 }), o = buf.getChannelData(0);
    // loop delay: N whole samples + an all-pass for the fraction (+ 0.5 for the averaging filter) = exactly sr / f
    const L = sr / f, N = Math.max(2, Math.floor(L - 0.5 - 0.1)), dfrac = L - 0.5 - N, C = (1 - dfrac) / (1 + dfrac);
    const rho = Math.pow(10, -3 / (t60 * f));                           // loss per trip round the string
    const S = 0.5;
    // excitation: a pick's noise burst, brighter when played harder, with the comb of the pluck point
    const line = new Float32Array(N), bright = 0.35 + 0.5 * vel - (wound ? 0.12 : 0);
    let lp = 0; for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; lp = lp + bright * (r - lp); line[i] = lp; }
    const pp = Math.max(1, Math.round(N * 0.13)), ex = new Float32Array(N);
    for (let i = 0; i < N; i++) ex[i] = line[i] - (i >= pp ? line[i - pp] : 0);
    let mean = 0; for (let i = 0; i < N; i++) mean += ex[i]; mean /= N;
    for (let i = 0; i < N; i++) line[i] = (ex[i] - mean) * vel;
    let idx = 0, prev = 0, apx = 0, apy = 0;
    for (let i = 0; i < len; i++) {
      const x = line[idx];
      const avg = (1 - S) * x + S * prev; prev = x;              // string losses (highs die first)
      const y = C * (avg - apy) + apx; apx = avg; apy = y;      // fractional delay, tunes the string exactly
      line[idx] = y * rho;
      o[i] = x;
      idx = idx + 1 === N ? 0 : idx + 1;
    }
    // a little attack click from the pick, and a fade at the end
    for (let i = 0; i < Math.min(len, 64); i++) o[i] += (Math.random() * 2 - 1) * 0.05 * vel * (1 - i / 64);
    const fade = Math.round(sr * 0.08); for (let i = 0; i < fade; i++) o[len - 1 - i] *= i / fade;
    pluckCache.set(key, buf);
    return buf;
  }
  function roll(notes, t, gap, vel, bus, lvl, mute){
    notes.forEach((n, i) => {
      const v = Math.max(0.35, vel * (1 - i * 0.035) * (0.92 + Math.random() * 0.12));
      const src = ctx.createBufferSource(); src.buffer = pluckBuffer(n.midi, n.string, v);
      const gn = ctx.createGain(), ts = t + i * gap * (0.85 + Math.random() * 0.3); gn.gain.setValueAtTime(lvl, ts);
      src.connect(gn).connect(bus); src.start(ts);
      if (mute) { gn.gain.setTargetAtTime(0, ts + mute, 0.012); src.stop(ts + mute + 0.15); }
    });
  }
  const asNotes = midis => midis.map(m => typeof m === 'object' ? m : { midi: m, string: null });
  // notes: midis low -> high, or [{midi, string}] from the shape on screen
  function strum(midis, t, gap = 0.016, vel = 0.85){
    ensure();
    t = t || ctx.currentTime + 0.03;
    const notes = asNotes(midis);
    // the game's own guitar mustn't count as the player's: ignore it while it rings
    if (typeof Mic !== 'undefined') { Mic.muteUntil = Math.max(Mic.muteUntil, t + notes.length * gap + 0.2); Mic.deafUntil = Math.max(Mic.deafUntil, t + (Settings.headphones ? 0.4 : 2.45)); }
    roll(notes, t, gap, vel, guitarBus(), 0.42);
  }
  // The player's own strum (tap mode): sounds the chord on the player's bus. With the mic open on speakers it would be
  // heard as the player's guitar and pass the note check, so there it stays silent and returns false.
  function playerStrum(midis, o){
    ensure(); o = o || {};
    if (leakMode() !== 'full') return false;
    const t = o.t || ctx.currentTime + 0.004, vel = o.vel == null ? 0.85 : o.vel;
    if (!midis || !midis.length) {            // dead strum: muted strings
      for (let i = 0; i < 4; i++) noise(t + i * 0.006, 0.16 * vel, 0.035, 'bandpass', 900 + i * 500, 1.2, g.playerBus);
      return true;
    }
    let notes = asNotes(midis); if (o.up) notes = notes.slice().reverse().slice(0, 4);
    roll(notes, t, o.gap == null ? 0.011 : o.gap, vel, guitarBus(g.playerBus), 0.5, o.mute);
    return true;
  }
  // quick dip of the background music while a chord preview rings, then back up
  function duck(sec){
    ensure(); const t = ctx.currentTime, gn = g.duckBus.gain;
    gn.cancelScheduledValues(t); gn.setValueAtTime(gn.value, t);
    gn.linearRampToValueAtTime(0.12, t + 0.06); gn.setValueAtTime(0.12, t + 0.06 + sec); gn.linearRampToValueAtTime(1, t + 0.06 + sec + 0.35);
  }
  function arpeggio(midis, t, step = 0.2){
    ensure(); t = t || ctx.currentTime + 0.03;
    const order = midis.concat(midis.slice(1, -1).reverse());
    order.forEach((m, i) => strum([m], t + i * step, 0, 0.7));
    return order.length * step;
  }
  // tap a chord: strum; tap the same chord again: arpeggio; keeps alternating
  function playChord(midis, key){
    ensure(); if (!midis || !midis.length) return;
    key = key || midis.map(m => typeof m === 'object' ? m.midi : m).join(',');
    const now = ctx.currentTime;
    if (chordTaps.key === key && now - chordTaps.at < 30) chordTaps.n++; else chordTaps = { key, n: 0, at: now };
    chordTaps.at = now;
    const arp = chordTaps.n % 2 === 1;
    const len = arp ? arpeggio(midis) : (strum(midis), 1.4);
    duck(Math.min(4, len + 0.2));
    return arp ? 'arpeggio' : 'strum';
  }
  function blip(good){
    ensure(); const t = ctx.currentTime + 0.01;
    if (good) { tone(t, 'sine', 880, 880, 0.18, 0.08, g.sfxBus); tone(t + 0.07, 'sine', 1320, 1320, 0.16, 0.12, g.sfxBus); }
    else tone(t, 'triangle', 220, 150, 0.2, 0.15, g.sfxBus);
  }
  // run voice calls so they sound on the player's bus instead of the band's strips
  function onPlayerBus(fn){ ensure(); const r = route; route = () => g.playerBus; try { fn(); } finally { route = r; } }
  function withStrips(set, fn){ const r = route; route = n => (set[n] || set.perc).in; try { fn(); } finally { route = r; } }
  // the player's MIDI keys: the band's electric piano, on the player's bus
  function keyNote(midi, t, vel){ ensure(); onPlayerBus(() => Voices.ep(t || ctx.currentTime, midi, 1.4, (vel == null ? 0.7 : vel) * 1.3)); }
  // Render what fn schedules into a buffer instead of the speakers (tests): fn(ctx) runs with the engine pointed at an
  // OfflineAudioContext. Inside it: Groove.start(cfg); return t => Groove.pump(t + 0.5);   (queue as the render goes)
  async function offline(seconds, fn, sampleRate){
    const live = { ctx, g }, sr = sampleRate || 44100;
    const oc = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
    ctx = oc; g = build(oc); isOffline = true;
    let buf;
    try {
      const tick = await fn(oc);          // fn may return tick(t): called every quarter second of rendered time, like the live scheduler
      if (typeof tick === 'function') for (let t = 0.25; t < seconds - 0.01; t += 0.25) oc.suspend(t).then(() => { try { tick(t); } finally { oc.resume(); } });
      buf = await oc.startRendering();
    }
    finally { ctx = live.ctx; g = live.g; isOffline = false; forcedLeak = null; }
    return buf;
  }
  return {
    ensure, kit, onPlayerBus, withStrips, makeStrips, keyNote, strum, playerStrum, blip, tone, noise, env, pluckBuffer, playChord, arpeggio, duck,
    out, cutRun, pump, bandSweep, leakMode, offline, CH,
    forceLeak(m){ forcedLeak = m === true ? 'safe' : m === false ? 'full' : (m || null); },
    get playerBus(){ ensure(); return g.playerBus; },
    get duckBus(){ ensure(); return g.duckBus; },
    get sfxBus(){ ensure(); return g.sfxBus; },
    get clickBus(){ ensure(); return g.clickBus; },
    get plate(){ ensure(); return g.plate; },
    get isOffline(){ return isOffline; },
    get ctx(){ return ctx; },
    get master(){ return g && g.master; },
    get noiseBuf(){ return ctx ? noiseBuffer(ctx.sampleRate) : null; },
    now(){ return ctx ? ctx.currentTime : 0; },
    // the audio clock for animation: currentTime moves in audio-block steps (a few ms at a time, unevenly),
    // so it's followed from the frame clock, which keeps drawn motion even. Scoring keeps now().
    smoothNow(){
      if (!ctx) return 0;
      const p = performance.now() / 1000, raw = ctx.currentTime;
      if (smooth.off == null || Math.abs(raw - (p + smooth.off)) > 0.08 || ctx.state !== 'running') smooth.off = raw - p;
      else smooth.off += (raw - (p + smooth.off)) * 0.04;
      return p + smooth.off;
    },
    setDrumVol(v){ if (g) g.drumBus.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
    outputLatency(){ return ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0.03; },
  };
})();

/* A timer that keeps ticking when the tab is in the background (a Worker's setInterval is not throttled the way the
   page's is), with the page timer as a fallback. Ticker.add(fn) / Ticker.remove(fn). */
const Ticker = (() => {
  const fns = new Set(); let w = null, iv = null;
  const run = () => { for (const f of Array.from(fns)) { try { f(); } catch (e) { console.error(e); } } };
  function on(){
    if (!w && typeof Worker !== 'undefined') {
      try { w = new Worker(URL.createObjectURL(new Blob(['let t=null;onmessage=e=>{clearInterval(t);t=e.data?setInterval(()=>postMessage(0),e.data):null}'], { type: 'text/javascript' }))); w.onmessage = run; w.onerror = () => { w = null; clearInterval(iv); iv = setInterval(run, 25); }; }
      catch (e) { w = null; }
    }
    if (w) w.postMessage(25);
    if (!iv) iv = setInterval(run, w ? 150 : 25);
  }
  function off(){ if (w) w.postMessage(0); clearInterval(iv); iv = null; }
  return { add(f){ fns.add(f); on(); }, remove(f){ fns.delete(f); if (!fns.size) off(); } };
})();

/* ---------------- drum patterns (the verse groove of each style; the Arranger builds the rest from it) ---------------- */
const P44 = {
  rock:    { k:'x.......x.x.....', s:'....x.......x...', h:'x.x.x.x.x.x.x.x.' },
  pop:     { k:'x.....x.x.......', s:'....x.......x...', h:'x.x.x.x.x.x.x.x.' },
  ballad:  { k:'x.......x..x....', s:'....x.......x...', h:'x...x...x...x...', sv:'rim' },
  halftime:{ k:'x.....x...x.....', s:'........x.......', h:'x.x.x.x.x.x.x.x.' },
  funk:    { k:'x..x..x...x..x..', s:'....x..g.g..x..g', h:'Xxxxxxxxxxxxxxxx' },
  disco:   { k:'x...x...x...x...', s:'....x.......x...', h:'x.o.x.o.x.o.x.o.', sv:'clap' },
  shuffle: { k:'x.......x.......', s:'....x.......x...', h:'x.x.x.x.x.x.x.x.' },
  country: { k:'x.......x.......', s:'g.x.X.x.g.x.X.x.', h:'................', sv:'brush' },
  reggae:  { k:'........x.......', s:'........x.......', h:'..x...x...x...x.', sv:'rim' },
  punk:    { k:'x.x...x.x.x...x.', s:'....x.......x...', h:'x.x.x.x.x.x.x.x.' },
  hiphop:  { k:'x......x..x.....', s:'....x.......x...', h:'x.x.x.x.x.x.x.x.' },
  metal:   { k:'xxxxxxxxxxxxxxxx', s:'....X.......X...', h:'x...x...x...x...', hv:'ride' },
  folk:    { k:'x.......x.......', s:'....x.......x...', h:'..x...x...x...x.', sv:'tamb' },
  bossa:   { k:'x..xx..xx..xx..x', s:'x..x..x...x..x..', h:'xxxxxxxxxxxxxxxx', sv:'rim' },
  edm:     { k:'x...x...x...x...', s:'....x.......x...', h:'..o...o...o...o.', sv:'clap' },
  waltz:   { k:'x.......x.......', s:'....x.......x...', h:'x.x.x.x.x.x.x.x.', sv:'rim' },
};
function lane(str, n){
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { const c = str ? str[i % str.length] : '.'; out[i] = c === 'X' ? 1 : c === 'x' ? 0.8 : c === 'g' ? 0.3 : c === 'o' ? -0.8 : 0; }
  return out;
}
function buildPattern(chart, styleOverride){
  const style = styleOverride || chart.song.style;
  const { beats, sub } = chart; const n = beats * sub;
  let base;
  if (style === 'none') return { n, k: lane('', n), s: lane('', n), h: lane('', n), sv: 'snare', hv: 'hat', none: true, style };
  if (sub === 4 && beats === 4) base = P44[style] || P44.rock;
  else if (sub === 4 && beats === 3) base = { k:'x...........', s:'....x...x...', h:'x.x.x.x.x.x.', sv: ['ballad','waltz','folk'].includes(style) ? 'rim' : 'snare' };
  else if (sub === 4 && beats === 2) base = { k:'x...x...', s:'..x...x.', h:'x.x.x.x.' };
  else if (sub === 3 && beats === 2) base = { k:'x.....', s:'...x..', h:'xxxxxx', sv: style === 'ballad' ? 'rim' : 'snare' };
  else if (sub === 3 && beats === 4) base = { k:'x.....x.....', s:'...x.....x..', h:'xxxxxxxxxxxx' };
  else { const k = 'x' + '.'.repeat(n - 1); const s = '.'.repeat(Math.floor(n / 2)) + 'x' + '.'.repeat(n - Math.floor(n / 2) - 1); base = { k, s, h: 'x.'.repeat(Math.ceil(n / 2)).slice(0, n) }; }
  const d = chart.song.drums;
  const src = d ? { k: d.kick, s: d.snare, h: d.hat, sv: base.sv, hv: base.hv } : base;
  return { n, k: lane(src.k, n), s: lane(src.s, n), h: lane(src.h, n), sv: src.sv || 'snare', hv: src.hv || 'hat', style };
}

/* ---------------- the groove scheduler ----------------
   Step k (can be negative during the count-in) happens at startTime + time(k).
   mode 'song': plays the chart's bars once, section by section, with fills, builds and an ending.
   mode 'loop': repeats the groove forever in 8-bar phrases (practice).

   Groove.start(cfg)   cfg = { mode, bpm, sub, swing, pattern (buildPattern), click, countIn, firstBar, endBar,
       bassAt(k) -> { root (midi 28-39), fifth, pcs? } | null    the chord under step k (pcs = its pitch classes, root first)
       harmAt(k)        same, when bassAt is null because the player is the bassist
       sections: [{ name, startBar, bars }]   (or the older sectionStarts / fillBars sets)
       style            defaults to pattern.style
       noKit, noBass, noComp     the player's own instrument drops out of the band
       leakSafe         true = 'safe', false = 'full', 'drums', undefined = decide from the mic and the headphones setting
       seed             fixes the variations (tests);  levelScript: { bar: level }  (tests)
       onEnd }
   Groove.stop()        stops and cuts what is already queued
   Groove.level         0-4, set by the game at any time; the band follows at the next bar line (with a fill and a crash
                        on the way up, a filter dip on the way down)
   Groove.beatAt(t) / timeOf(k) / swingOff(i)      the grid
   Groove.plan(k) / events(now)                    what the drummer plays (kinds: stick kick snare hat tom crash)
   Groove.harmony(t) -> { root, pcs, fifth } | null     the chord sounding at t (for in-key effects)
   Groove.nextTime(div)   audio time of the next beat (div = 1), half beat (0.5), 'bar'
   Groove.stinger(name, div)   Sfx.stinger(name) on the next beat / bar
   Groove.sectionAt(t) -> { name, kind, index, bar, barIn, bars }
   Groove.layerName(level) -> what joins at that hype level, for the banner
   Groove.dropped / Groove.late     steps skipped (more than 100 ms late) / played late since start
   Scheduling: a 25 ms ticker (a Worker, so a background tab keeps time) queues everything up to 0.4 s ahead; after a
   stall the look-ahead grows (up to 1.2 s) so the next stall is covered; a step up to 100 ms late still plays. */
const LEVEL_NAMES = ['Warming up', 'Grooving', 'On a roll', 'On fire', 'LEGENDARY'];
const Groove = {
  running: false, timer: null, cfg: null, k: 0, hits: [], level: 0, dropped: 0, late: 0, LOOK: 0.4, run: null,
  start(cfg){
    this.stop();
    const ctx = AudioEngine.ensure();
    this.cfg = cfg;
    const P = cfg.pattern, beatsPerBar = P.n / cfg.sub;
    cfg.beatDur = 60 / cfg.bpm; cfg.stepDur = cfg.beatDur / cfg.sub;
    cfg.firstBar = cfg.firstBar || 0;
    cfg.firstStep = cfg.firstBar * P.n;
    cfg.fromBeat = cfg.firstBar * beatsPerBar;
    cfg.style = cfg.style || P.style || 'rock';
    const t0 = ctx.currentTime + 0.2 + (cfg.countIn || 0) * cfg.beatDur;   // when the first real beat lands
    cfg.startTime = t0 - cfg.fromBeat * cfg.beatDur;                          // time of song beat 0
    this.k = cfg.firstStep - (cfg.countIn || 0) * cfg.sub;
    this.hits = []; this.dropped = 0; this.late = 0;
    AudioEngine.forceLeak(cfg.leakSafe === undefined ? null : cfg.leakSafe);
    Voices.setKit(Arranger.pack(cfg.style).kit);
    this.run = { seed: cfg.seed != null ? cfg.seed : Math.floor(Math.random() * 1e9), bars: new Map(), lvl: new Map(), up: new Set(), secs: this.sectionList(cfg), look: this.LOOK, lastTick: 0 };
    this.running = true;
    this.tick();
    if (!AudioEngine.isOffline) { this.timer = () => this.tick(); Ticker.add(this.timer); }
  },
  // keep = true: let what is queued ring out (the end of the song)
  stop(keep){
    const was = this.running;
    this.running = false; if (this.timer) Ticker.remove(this.timer); this.timer = null;
    if (was && !keep) AudioEngine.cutRun();
  },
  swingOff(i){
    const c = this.cfg; if (!c.swing || c.sub !== 4) return 0;
    return [0, 0.0833, 0.1667, 0.0833][i % 4] * c.swing;
  },
  timeOf(k){
    const c = this.cfg; const beat = Math.floor(k / c.sub), i = ((k % c.sub) + c.sub) % c.sub;
    return c.startTime + beat * c.beatDur + i * c.stepDur + this.swingOff(i) * c.beatDur;
  },
  beatAt(t){ const c = this.cfg; return c ? (t - c.startTime) / c.beatDur : 0; },
  tick(){
    if (!this.running) return;
    const now = AudioEngine.ctx.currentTime, r = this.run;
    // a late tick means the main thread stalled: look further ahead for a while, so the next stall is already covered
    const gap = r.lastTick ? now - r.lastTick : 0; r.lastTick = now;
    if (gap > 0.12) r.look = Math.min(1.2, Math.max(r.look, gap * 2 + 0.2)); else r.look = Math.max(this.LOOK, r.look - 0.002);
    this.pump(now + (typeof document !== 'undefined' && document.hidden ? 1.5 : r.look));
  },
  // queue every step before audio time `until` (the ticker calls this; offline renders call it once)
  pump(until){ while (this.running && this.timeOf(this.k) < until) { this.play(this.k, this.timeOf(this.k)); this.k++; } },
  sectionList(cfg){
    let secs = cfg.sections;
    if (!secs && cfg.mode === 'song' && typeof G !== 'undefined' && G.chart && G.chart.sections) secs = G.chart.sections;     // older callers
    if (!secs && cfg.sectionStarts) { const st = Array.from(cfg.sectionStarts).sort((a, b) => a - b); secs = st.map((b, i) => ({ name: '', startBar: b, bars: (st[i + 1] != null ? st[i + 1] : (cfg.endBar || b + 8)) - b })); }
    return (secs || []).map((s, i) => ({ name: s.name || '', kind: Arranger.kindOf(s.name, i), startBar: s.startBar, bars: s.bars, index: i }));
  },
  barInfo(bar){
    const c = this.cfg, secs = this.run.secs;
    if (c.mode === 'song' && secs.length) {
      const s = secs.find(x => bar >= x.startBar && bar < x.startBar + x.bars) || secs[secs.length - 1], nx = secs[s.index + 1];
      const isLast = bar === c.endBar - 1;
      return { kind: s.kind, name: s.name, index: s.index, barIn: bar - s.startBar, secBars: s.bars, lastOfSec: bar === s.startBar + s.bars - 1 && !isLast, nextKind: nx ? nx.kind : null, isLast, first: bar === c.firstBar };
    }
    // no sections (practice loops): 8-bar phrases, verse then chorus, so the groove still goes somewhere
    const b = bar - c.firstBar, isLast = c.mode === 'song' && bar === c.endBar - 1, ph = Math.floor(b / 8);
    return { kind: ph % 2 ? 'chorus' : 'verse', name: '', index: ph, barIn: b % 8, secBars: 8, lastOfSec: b % 8 === 7 && !isLast, nextKind: ph % 2 ? 'verse' : 'chorus', isLast, first: b === 0 };
  },
  // the chord under step k, normalised: { root (bass note), pcs (chord root first), fifth, third, slash }
  chord(k){
    const c = this.cfg, f = c.harmAt || c.bassAt; if (!f) return null;
    let b = null; try { b = f(k, this.timeOf(k)); } catch (e) {}
    if (!b || b.root == null) return null;
    const pcs = b.pcs && b.pcs.length ? b.pcs.map(mod12) : [mod12(b.root), mod12(b.root + (b.fifth || 7))];
    const cr = pcs[0], has = iv => pcs.includes(mod12(cr + iv)), slash = mod12(b.root) !== cr;
    return { root: b.root, pcs, fifth: slash ? 0 : (b.fifth || 7), third: slash ? 0 : has(4) ? 4 : has(3) ? 3 : 0, slash };
  },
  query(bar, L, up){
    const c = this.cfg, r = this.run, P = c.pattern, n = P.n, memo = {};
    const chordAt = i => (i in memo) ? memo[i] : (memo[i] = this.chord(bar * n + i));
    const prev = r.lvl.get(bar - 1);
    return Object.assign({ style: c.style, beats: n / c.sub, sub: c.sub, n, P, seed: r.seed, bar, level: L, levelUp: prev != null && L > prev, upFill: !!up,
      leak: AudioEngine.leakMode(), noKit: !!c.noKit, noBass: !!c.noBass || (!c.harmAt && !c.bassAt), noComp: !!c.noComp, chordAt,
      nextChord: c.mode === 'song' && bar + 1 >= c.endBar ? null : this.chord((bar + 1) * n) }, this.barInfo(bar));
  },
  // the bar's events, grouped by step
  barEv(bar, L, up){
    const r = this.run, n = this.cfg.pattern.n, key = bar + '|' + L + (up ? 'u' : '') + AudioEngine.leakMode()[0];
    let ev = r.bars.get(key); if (ev) return ev;
    ev = Array.from({ length: n }, () => []);
    for (const e of Arranger.bar(this.query(bar, L, up))) ev[Math.min(n - 1, Math.max(0, Math.floor(e.i)))].push(e);
    r.bars.set(key, ev); if (r.bars.size > 24) r.bars.delete(r.bars.keys().next().value);
    return ev;
  },
  // what the kit will play on step k, without playing it (so the drummer can wind up early)
  plan(k){
    const c = this.cfg; if (!c || !this.run) return [];
    const P = c.pattern, n = P.n;
    if (k < c.firstStep) return ((k % c.sub) + c.sub) % c.sub === 0 ? ['stick'] : [];
    const bar = Math.floor(k / n), i = k % n, r = this.run;
    if (c.mode === 'song' && bar >= c.endBar) return bar === c.endBar && i === 0 && !P.none && !c.noKit ? ['crash', 'kick'] : [];
    const L = r.lvl.has(bar) ? r.lvl.get(bar) : this.level, out = [];
    for (const e of this.barEv(bar, L, r.up.has(bar))[i]) if (e.kind) out.push(e.kind);
    return out;
  },
  // hits already scheduled (recent past and the look-ahead) plus the ones coming up
  events(now){
    if (this.cfg && this.cfg.noKit && typeof Parts !== 'undefined' && Parts.active) return Parts.drumEvents(now);   // Drums: the drummer plays the player's hits
    const out = this.hits.filter(h => h.t > now - 1.6);
    if (this.running && this.cfg) for (let k = this.k, m = 0; m < 96 && this.timeOf(k) < now + 1.3; k++, m++) for (const kind of this.plan(k)) out.push({ t: this.timeOf(k), kind });
    return out;
  },
  leakMode(){ return AudioEngine.leakMode(); },
  // the full band (the mic can't hear it): the game uses this for the bass player's animation and its hints
  pitchedOk(){ return AudioEngine.leakMode() === 'full'; },
  layerName(level){ return Arranger.layerName(this.cfg ? this.cfg.style : 'rock', level, AudioEngine.leakMode()); },
  harmony(t){
    const c = this.cfg; if (!c) return null;
    const k = Math.max(c.firstStep, Math.floor(this.beatAt(t == null ? AudioEngine.now() : t) * c.sub + 1e-6));
    return this.chord(k);
  },
  nextTime(div){
    const c = this.cfg, now = AudioEngine.now();
    if (!c || !this.running) return now + 0.02;
    const beats = div === 'bar' ? c.pattern.n / c.sub : (div || 1);
    return c.startTime + Math.ceil(this.beatAt(now + 0.03) / beats) * beats * c.beatDur;
  },
  stinger(name, div){ const t = this.nextTime(div); if (typeof Sfx !== 'undefined' && Sfx.stinger) Sfx.stinger(name, t); return t; },
  sectionAt(t){
    const c = this.cfg; if (!c || !this.run) return null;
    const bar = Math.max(c.firstBar, Math.floor(this.beatAt(t == null ? AudioEngine.now() : t) * c.sub / c.pattern.n)), inf = this.barInfo(bar);
    return { name: inf.name, kind: inf.kind, index: inf.index, bar, barIn: inf.barIn, bars: inf.secBars };
  },
  play(k, t){
    const c = this.cfg, P = c.pattern, r = this.run, now = AudioEngine.ctx.currentTime;
    const lateBy = now - t, skip = lateBy > 0.1;                       // more than 100 ms late: not worth playing any more
    if (lateBy > 0.012) { if (skip) this.dropped++; else this.late++; }
    const at = Math.max(t, now + 0.002);
    if (k < c.firstStep) { if (((k % c.sub) + c.sub) % c.sub === 0) { if (!skip) Voices.sticks(at); this.hits.push({ t, kind: 'stick' }); } return; }
    const n = P.n, bar = Math.floor(k / n), i = k % n;
    if (c.levelScript && i === 0 && c.levelScript[bar] != null) this.level = c.levelScript[bar];
    if (c.mode === 'song' && bar >= c.endBar) {
      if (bar === c.endBar && i === 0) for (const e of Arranger.ending(this.query(bar, r.lvl.has(bar - 1) ? r.lvl.get(bar - 1) : this.level))) this.fire(e, at, skip, t);
      if (bar > c.endBar) { this.stop(true); c.onEnd && c.onEnd(); }
      return;
    }
    if ((c.click || P.none) && i % c.sub === 0 && !skip) Voices.click(at, i === 0);
    if (!r.lvl.has(bar)) {                                              // the hype level is fixed per bar, at its first step
      const prev = r.lvl.get(bar - 1);
      r.lvl.set(bar, this.level);
      if (prev != null && this.level < prev && !skip) AudioEngine.bandSweep(at, 450, 20000, c.beatDur * 2);   // losing hype: the band dips under a filter and comes back thinner
      if (r.lvl.size > 64) r.lvl.delete(r.lvl.keys().next().value);
    }
    const L = r.lvl.get(bar);
    if (c.mode === 'loop') {          // practice: the chord changes when the player finds it, not on the grid: drop what is queued on the old chord
      const ch = this.chord(k), sig = ch ? ch.root + ':' + ch.pcs.join() : '';
      if (r.sig != null && sig !== r.sig) {
        AudioEngine.cutRun(['bass', 'keys', 'organ', 'pad', 'gtrE', 'gtrD', 'gtrA', 'lead', 'crowd']); r.bars.clear();
        const ev = this.barEv(bar, L, r.up.has(bar));
        for (let j = 0; j < i; j++) for (const e of ev[j]) if (e.inst === 'pad' && e.len > i - j + 1) this.fire(Object.assign({}, e, { len: e.len - (i - j) }), at, skip, t);    // the held chord comes back in on the new one
      }
      r.sig = sig;
    }
    if (i === n - c.sub && this.level > L) r.up.add(bar);               // hype rose during this bar: a one-beat fill announces the new layer
    for (const e of this.barEv(bar, L, r.up.has(bar))[i]) this.fire(e, at, skip, t);
    if (this.hits.length > 200) this.hits.splice(0, this.hits.length - 200);
  },
  fire(e, at, skip, gridT){
    const c = this.cfg, sd = c.stepDur, V = Voices;
    if (e.kind) this.hits.push({ t: gridT + (e.f || 0) * sd, kind: e.kind });
    if (skip) return;
    const t = Math.max(at + (e.f || 0) * sd + (e.dt || 0), AudioEngine.ctx.currentTime), v = e.v, len = (e.len || 1) * sd;
    switch (e.inst) {
      case 'kick': { V.kick(t, v); const pm = Arranger.pack(c.style).pump; if (pm) AudioEngine.pump(t, pm, ['pad', 'keys']); break; }
      case 'tom': V.tom(t, v, e.o); break;
      case 'bass': V.bass(t, e.midi, len, v, e.o); break;
      case 'ep': V.ep(t, e.midi, len, v); break;
      case 'organ': V.organ(t, e.midi, len, v); break;
      case 'pluck': V.lead(t, e.midi, len, v * 1.1, 'pluck', AudioEngine.out('keys')); break;
      case 'pad': V.pad(t, e.midi, len, v, e.o); break;
      case 'gtr': { const o = e.o || {}; V.gtr(t, e.notes, { kind: o.kind, v, len: o.mute || (e.len ? Math.min(len * 0.97, 1.4) : 0), up: o.up, gap: o.gap, chk: o.chk }); break; }
      case 'lead': V.lead(t, e.midi, len, v, e.o); break;
      case 'whoa': V.whoa(t, e.midi, len, v); break;
      case 'riser': V.riser(t, len, v); break;
      default: if (V[e.inst]) V[e.inst](t, v);
    }
  },
};
