/* =====================================================================
   Menu music: an original '80s dance-funk groove (D minor / F major, 112 BPM).
   Four-on-the-floor kick, gated snare, choppy funk guitar, octave bass,
   brassy synth stabs, and a lead line in the second half. All synthesized.
   ===================================================================== */
const Music = (() => {
  const BPM = 112, SPB = 16, STEP = 60 / BPM / 4, LOOP = 16;
  let bus = null, verbSend = null, echoIn = null, playing = false, timer = null, t0 = 0, k = 0, interacted = false, pendingFanfare = false;
  const hits = [];
  // Original theme in D minor / F major. Close voicings chosen for smooth voice leading.
  // r = bass root, v = keys/brass voicing, f5 = fifth above the root, b7 = has a flat seventh
  const CH = {
    'Dm9':   { r: 38, v: [65, 69, 72, 76], f5: 7, b7: 1 },
    'G13':   { r: 43, v: [65, 69, 71, 76], f5: 7, b7: 1 },
    'Cmaj9': { r: 36, v: [64, 67, 71, 74], f5: 7, b7: 0 },
    'Fmaj7': { r: 41, v: [64, 69, 72, 76], f5: 7, b7: 0 },
    'Bbmaj7':{ r: 34, v: [65, 69, 70, 74], f5: 7, b7: 0 },
    'Em7b5': { r: 40, v: [64, 67, 70, 74], f5: 6, b7: 1 },
    'A7b9':  { r: 45, v: [64, 67, 70, 73], f5: 7, b7: 1 },
    'A7sus4':{ r: 45, v: [62, 64, 67, 69], f5: 7, b7: 1 },
    'A7':    { r: 45, v: [61, 64, 67, 69], f5: 7, b7: 1 },
    'Bbmaj9':{ r: 34, v: [62, 65, 69, 72], f5: 7, b7: 0 },
    'C/Bb':  { r: 34, v: [64, 67, 72, 74], f5: 8, b7: 0 },
    'Am7':   { r: 45, v: [64, 67, 69, 72], f5: 7, b7: 1 },
    'Gm9':   { r: 43, v: [65, 69, 70, 74], f5: 7, b7: 1 },
    'C13':   { r: 36, v: [64, 69, 70, 74], f5: 7, b7: 1 },
    'Fmaj9': { r: 41, v: [64, 67, 69, 72], f5: 7, b7: 0 },
    'A7#9':  { r: 45, v: [61, 67, 72, 76], f5: 7, b7: 1 },
  };
  // bars: [[chord, startStep], ...]  A = ii-V-I then a turn to D minor; B = a lifting run back home
  const PROG = [
    [['Dm9', 0]], [['G13', 0]], [['Cmaj9', 0]], [['Fmaj7', 0]], [['Bbmaj7', 0]], [['Em7b5', 0], ['A7b9', 8]], [['Dm9', 0]], [['A7sus4', 0], ['A7', 8]],
    [['Bbmaj9', 0]], [['C/Bb', 0]], [['Am7', 0]], [['Dm9', 0]], [['Gm9', 0]], [['C13', 0]], [['Fmaj9', 0]], [['A7#9', 0]],
  ];
  const chordAt = (bar, i) => { const b = PROG[bar]; let c = b[0]; for (const x of b) if (x[1] <= i) c = x; return c; };
  const GTR_A = [2, 6, 10, 13], GTR_B = [2, 6, 9, 10, 14];
  // lead: a hook over bars 5-8, then the full melody over bars 9-16  [bar, step, midi, length]
  const LEAD = [
    [4,2,77,2],[4,4,81,2],[4,6,77,1],[4,7,74,3],[4,12,72,2],[4,14,74,2],
    [5,0,70,3],[5,3,74,1],[5,4,79,4],[5,8,73,2],[5,10,76,2],[5,12,79,2],[5,14,82,2],
    [6,0,81,6],[6,6,77,2],[6,8,76,4],[6,12,74,4],
    [7,0,74,4],[7,4,76,4],[7,8,73,6],
    [8,0,74,3],[8,3,72,1],[8,4,74,2],[8,6,77,4],[8,10,76,2],[8,12,74,4],
    [9,0,76,4],[9,4,79,2],[9,6,76,2],[9,8,74,2],[9,10,72,2],[9,12,74,4],
    [10,0,72,3],[10,3,76,3],[10,6,79,2],[10,8,81,6],[10,14,79,2],
    [11,0,77,4],[11,4,76,2],[11,6,74,2],[11,8,69,4],[11,12,72,2],[11,14,74,2],
    [12,0,70,2],[12,2,74,2],[12,4,77,4],[12,8,81,4],[12,12,79,2],[12,14,77,2],
    [13,0,76,4],[13,4,79,2],[13,6,82,2],[13,8,81,4],[13,12,79,4],
    [14,0,81,6],[14,6,79,2],[14,8,76,2],[14,10,77,2],[14,12,72,4],
    [15,0,73,2],[15,2,76,2],[15,4,79,2],[15,6,84,4],[15,10,81,2],[15,12,79,2],[15,14,76,2],
  ];
  const vol = () => Settings.musicOn ? Settings.musicVol : 0;
  function setup(){
    const ctx = AudioEngine.ensure();
    if (bus) return ctx;
    bus = ctx.createGain(); bus.gain.value = 0; bus.connect(AudioEngine.duckBus);
    // small room reverb
    const len = Math.round(ctx.sampleRate * 1.3), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    verbSend = ctx.createGain(); verbSend.gain.value = 0.3; verbSend.connect(conv).connect(bus);
    // dotted-eighth echo for the lead
    const dl = ctx.createDelay(1); dl.delayTime.value = 60 / BPM * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.28; const wet = ctx.createGain(); wet.gain.value = 0.22;
    echoIn = ctx.createGain(); echoIn.connect(dl); dl.connect(fb).connect(dl); dl.connect(wet).connect(bus);
    return ctx;
  }
  const hz = midiToHz;
  function envGain(ctx, t, peak, a, hold, r){
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
    return g;
  }
  const V = {
    kick(ctx, t){ AudioEngine.tone(t, 'sine', 150, 46, 0.85, 0.28, bus); hits.push({ t, kind: 'kick' }); },
    snare(ctx, t){
      AudioEngine.noise(t, 0.4, 0.1, 'highpass', 1100, 0, bus); AudioEngine.tone(t, 'triangle', 196, 170, 0.3, 0.07, bus);
      // gated tail: loud, then chopped off
      const src = ctx.createBufferSource(); src.buffer = AudioEngine.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.6;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.005); g.gain.setValueAtTime(0.26, t + 0.17); g.gain.linearRampToValueAtTime(0.0001, t + 0.2);
      src.connect(f).connect(g); g.connect(bus); g.connect(verbSend);
      src.start(t, Math.random()); src.stop(t + 0.25);
      hits.push({ t, kind: 'snare' });
    },
    hat(ctx, t, v, open){ AudioEngine.noise(t, 0.1 * v, open ? 0.16 : 0.03, 'highpass', 8200, 0, bus); if (v > 0.7) hits.push({ t, kind: 'hat' }); },
    tom(ctx, t, f){ AudioEngine.tone(t, 'sine', f, f * 0.6, 0.55, 0.22, bus); hits.push({ t, kind: 'tom' }); },
    crash(ctx, t){ AudioEngine.noise(t, 0.16, 1.1, 'highpass', 5000, 0, bus); },
    bass(ctx, t, m, len){
      const d = len * STEP;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz(m);
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = hz(m);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4;
      f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(380, t + 0.12);
      const g = envGain(ctx, t, 0.16, 0.004, Math.max(0.02, d - 0.05), 0.05);
      const gs = envGain(ctx, t, 0.22, 0.004, Math.max(0.02, d - 0.05), 0.05);
      o.connect(f).connect(g).connect(bus); sub.connect(gs).connect(bus);
      o.start(t); sub.start(t); o.stop(t + d + 0.1); sub.stop(t + d + 0.1);
    },
    gtr(ctx, t, notes, len, up){
      hits.push({ t, kind: 'gtr' });
      const order = up ? notes.slice().reverse() : notes;
      order.forEach((m, i) => {
        const src = ctx.createBufferSource(); src.buffer = AudioEngine.pluckBuffer(m);
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
        const g = ctx.createGain(); const ts = t + i * 0.006;
        g.gain.setValueAtTime(0.13, ts); g.gain.setTargetAtTime(0.0001, ts + len * STEP * 0.8, 0.015);
        src.connect(hp).connect(g).connect(bus); src.start(ts); src.stop(ts + len * STEP + 0.2);
      });
    },
    brass(ctx, t, notes, len, peak){
      const d = len * STEP;
      notes.forEach(m => {
        for (const det of [-7, 7]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det;
          const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.5;
          f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(3200, t + 0.04); f.frequency.exponentialRampToValueAtTime(1400, t + 0.25);
          const g = envGain(ctx, t, (peak || 0.035), 0.018, Math.max(0.01, d - 0.08), 0.09);
          o.connect(f).connect(g); g.connect(bus); g.connect(verbSend);
          o.start(t); o.stop(t + d + 0.2);
        }
      });
    },
    pad(ctx, t, notes, len){
      const d = len * STEP;
      notes.forEach(m => {
        for (const det of [-9, 9]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det;
          const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 0.6;
          const g = envGain(ctx, t, 0.012, 0.12, Math.max(0.05, d - 0.2), 0.35);
          o.connect(f).connect(g); g.connect(bus); g.connect(verbSend);
          o.start(t); o.stop(t + d + 0.5);
        }
      });
    },
    lead(ctx, t, m, len){
      const d = len * STEP;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz(m);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(d > 0.3 ? 7 : 0, t + Math.min(d, 0.35));
      lfo.connect(lg).connect(o.detune);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
      const g = envGain(ctx, t, 0.055, 0.01, Math.max(0.01, d - 0.06), 0.08);
      o.connect(f).connect(g); g.connect(bus); g.connect(echoIn);
      o.start(t); lfo.start(t); o.stop(t + d + 0.2); lfo.stop(t + d + 0.2);
    },
  };
  function playStep(ctx, k, t){
    const bar = Math.floor(k / SPB) % LOOP, i = k % SPB;
    const [name, start] = chordAt(bar, i), C = CH[name];
    const fillBar = bar === 7 || bar === 15;
    // drums
    if (i === 0 && (bar === 0 || bar === 8)) V.crash(ctx, t);
    if (fillBar && i >= 12) { V.tom(ctx, t, [240, 200, 160, 125][i - 12]); if (i === 12) V.kick(ctx, t); }
    else {
      if (i % 4 === 0) V.kick(ctx, t);
      if (i === 4 || i === 12) V.snare(ctx, t);
      V.hat(ctx, t, i % 4 === 2 ? 1 : 0.45, i === 14 && bar % 2 === 1);
    }
    // pad holds each chord
    if (i === start) { const next = PROG[bar].find(x => x[1] > start); V.pad(ctx, t, C.v, (next ? next[1] : SPB) - start); }
    // bass: syncopated octaves, fifths and sevenths, with a chromatic step into the next chord
    const span = PROG[bar].length > 1 ? 8 : 16, j = (i - start + 16) % 16;
    const nextBarChord = CH[(PROG[(bar + 1) % LOOP])[0][0]];
    const nextRoot = span === 8 && start === 0 ? CH[PROG[bar][1][0]].r : nextBarChord.r;
    const seventh = C.b7 ? 10 : 12;
    const pat = span === 16
      ? { 0: [0, 3], 3: [12, 1], 6: [0, 1], 7: [C.f5, 1], 8: [0, 2], 10: [12, 1], 11: [seventh, 1], 12: [C.f5, 2], 14: [0, 1], 15: ['app', 1] }
      : { 0: [0, 2], 3: [12, 1], 4: [0, 1], 6: [C.f5, 1], 7: ['app', 1] };
    const hit = pat[j];
    if (hit) {
      let m = hit[0] === 'app' ? nextRoot - 1 : C.r + hit[0];
      if (hit[0] === 'app') { while (m < C.r - 6) m += 12; while (m > C.r + 8) m -= 12; }
      V.bass(ctx, t, m, hit[1]);
    }
    // funk guitar chops, voiced up an octave
    const g = bar % 2 ? GTR_B : GTR_A;
    if (g.includes(i)) V.gtr(ctx, t, C.v.slice(1).map(x => x + 12), 1, i % 4 === 2);
    // brass stabs answer on odd bars of the first half; big hits on the last bar
    if (bar < 8 && bar % 2 === 1) { if (i === 10) V.brass(ctx, t, C.v, 1); if (i === 12) V.brass(ctx, t, C.v, 3); }
    if (bar === 15 && (i === 0 || i === 3 || i === 6)) V.brass(ctx, t, C.v, i === 6 ? 4 : 2, 0.03);
    for (const n of LEAD) if (n[0] === bar && n[1] === i) V.lead(ctx, t, n[2], n[3]);
  }
  function fanfare(ctx, t){
    const q = 60 / BPM / 2;
    V.brass(ctx, t, [62, 65, 70, 74], 2, 0.04); V.bass(ctx, t, 34, 2); V.kick(ctx, t); V.crash(ctx, t);
    V.brass(ctx, t + q, [64, 67, 72, 76], 2, 0.04); V.bass(ctx, t + q, 36, 2); V.snare(ctx, t + q);
    V.brass(ctx, t + 3 * q, [65, 69, 72, 77, 81], 12, 0.045); V.pad(ctx, t + 3 * q, [65, 69, 72, 76], 14); V.bass(ctx, t + 3 * q, 41, 8);
    V.kick(ctx, t + 3 * q); V.crash(ctx, t + 3 * q); V.snare(ctx, t + 3 * q);
    return 4 * q + 1.2;
  }
  function tick(){
    const ctx = AudioEngine.ctx; if (!playing || !ctx) return;
    const horizon = ctx.currentTime + 0.12;
    while (t0 + k * STEP < horizon) {
      const i = k % 2, swing = i ? STEP * 0.08 : 0;          // a touch of 16th swing
      const t = t0 + k * STEP + swing;
      if (t >= ctx.currentTime - 0.02) playStep(ctx, k, t);
      k++;
    }
    if (hits.length > 48) hits.splice(0, hits.length - 48);
  }
  function start(){
    const ctx = setup();
    playing = true; k = 0;
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.linearRampToValueAtTime(vol() * 0.9, now + 0.6);
    t0 = now + 0.12;
    if (pendingFanfare) { pendingFanfare = false; t0 += fanfare(ctx, t0); }
    tick(); timer = setInterval(tick, 25);
  }
  function stop(){
    playing = false; if (timer) clearInterval(timer); timer = null;
    const ctx = AudioEngine.ctx; if (!ctx || !bus) return;
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.linearRampToValueAtTime(0, now + 0.3);
  }
  return {
    hits,
    get playing(){ return playing; },
    get interacted(){ return interacted; },
    markInteracted(){ interacted = true; },
    fanfareNext(){ pendingFanfare = true; },
    beat(){ const ctx = AudioEngine.ctx; return ctx ? (ctx.currentTime - t0) * BPM / 60 : 0; },
    setVolume(){ const ctx = AudioEngine.ctx; if (bus && ctx && playing) { bus.gain.cancelScheduledValues(ctx.currentTime); bus.gain.setTargetAtTime(vol() * 0.9, ctx.currentTime, 0.05); } },
    // start or stop to match what's on screen
    update(want){ want = want && interacted && vol() > 0; if (want && !playing) start(); else if (!want && playing) stop(); },
  };
})();
