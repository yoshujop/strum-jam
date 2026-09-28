/* =====================================================================
   Sound effects (all synthesized). In-game effects briefly mute strum
   detection so the mic doesn't mistake them for your guitar.
   ===================================================================== */
const Sfx = (() => {
  let bus = null, shaper = null;
  const PENT = [64, 67, 69, 71, 74, 76, 79, 81, 83, 86];   // E minor pentatonic, for hover plucks
  function ready(){
    if (!Settings.sfxOn || !Music.interacted) return null;
    const ctx = AudioEngine.ensure();
    if (!bus) {
      bus = ctx.createGain(); bus.connect(AudioEngine.master);
      shaper = ctx.createWaveShaper();
      const n = 1024, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 4.5); }
      shaper.curve = curve; const sg = ctx.createGain(); sg.gain.value = 0.35; shaper.connect(sg).connect(bus);
    }
    bus.gain.value = Settings.sfxVol;
    return ctx;
  }
  const T = (t, type, f0, f1, peak, dur) => AudioEngine.tone(t, type, f0, f1, peak, dur, bus);
  const N = (t, peak, dur, type, f, q) => AudioEngine.noise(t, peak, dur, type, f, q, bus);
  function pluck(ctx, t, m, gain, len, dest){
    const src = ctx.createBufferSource(); src.buffer = AudioEngine.pluckBuffer(m);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.setTargetAtTime(0.0001, t + len, 0.05);
    src.connect(g).connect(dest || bus); src.start(t); src.stop(t + len + 0.4);
  }
  function inGame(){ const ctx = AudioEngine.ctx; if (ctx) Mic.muteUntil = ctx.currentTime + 0.2; }
  return {
    click(){ const c = ready(); if (!c) return; const t = c.currentTime; T(t, 'sine', 880, 560, 0.16, 0.06); },
    back(){ const c = ready(); if (!c) return; const t = c.currentTime; T(t, 'sine', 560, 330, 0.16, 0.08); },
    toggle(){ const c = ready(); if (!c) return; const t = c.currentTime; T(t, 'square', 1320, 1320, 0.05, 0.03); T(t + 0.05, 'square', 1760, 1760, 0.05, 0.03); },
    hover(i){ const c = ready(); if (!c) return; pluck(c, c.currentTime, PENT[((i % PENT.length) + PENT.length) % PENT.length], 0.1, 0.25); },
    open(){
      const c = ready(); if (!c) return; const t = c.currentTime;
      [52, 59, 64, 67, 71, 76].forEach((m, i) => pluck(c, t + i * 0.022, m, 0.12, 0.7));
      const src = c.createBufferSource(); src.buffer = AudioEngine.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3500, t + 0.28);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      src.connect(f).connect(g).connect(bus); src.start(t); src.stop(t + 0.35);
    },
    modalOpen(){ const c = ready(); if (!c) return; const t = c.currentTime; T(t, 'sine', 520, 1040, 0.1, 0.09); },
    modalClose(){ const c = ready(); if (!c) return; const t = c.currentTime; T(t, 'sine', 1040, 520, 0.1, 0.09); },
    searchStart(){ const c = ready(); if (!c) return; const t = c.currentTime; [64, 67, 71, 76].forEach((m, i) => T(t + i * 0.06, 'square', midiToHz(m), midiToHz(m), 0.045, 0.06)); },
    found(){
      const c = ready(); if (!c) return; const t = c.currentTime;
      [52, 56, 59, 64, 68, 71].forEach((m, i) => pluck(c, t + i * 0.02, m, 0.13, 1.2));
      [88, 92, 95].forEach((m, i) => T(t + 0.15 + i * 0.07, 'sine', midiToHz(m), midiToHz(m), 0.08, 0.25));
    },
    // the crowd boos you off: a low, wavering murmur sliding down, and a sad trombone
    boo(){ const c = ready(); if (!c) return; const t = c.currentTime;
      for (let i = 0; i < 6; i++) T(t + i * 0.05, 'sawtooth', 150 + i * 9, 95 + i * 5, 0.05, 1.3);
      N(t, 0.12, 1.4, 'bandpass', 420, 0.8);
      [392, 370, 349, 311].forEach((f, i) => T(t + 0.5 + i * 0.32, 'triangle', f, i === 3 ? f * 0.93 : f, 0.14, i === 3 ? 0.8 : 0.3)); },
    fail(){ const c = ready(); if (!c) return; const t = c.currentTime; T(t, 'square', 330, 330, 0.06, 0.1); T(t + 0.14, 'square', 247, 247, 0.06, 0.18); },
    whoosh(){
      const c = ready(); if (!c) return; const t = c.currentTime;
      const src = c.createBufferSource(); src.buffer = AudioEngine.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2800, t + 0.3); f.frequency.exponentialRampToValueAtTime(600, t + 0.6);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
      src.connect(f).connect(g).connect(bus); src.start(t, Math.random()); src.stop(t + 0.7);
    },
    tick(){ const c = ready(); if (!c) return; T(c.currentTime, 'square', 2600, 2600, 0.03, 0.015); },
    // ---- in game ----
    perfect(){ const c = ready(); if (!c) return; inGame(); const t = c.currentTime; [2637, 3136, 3951].forEach((f, i) => T(t + i * 0.045, 'sine', f, f, 0.07, 0.14)); },
    great(){ const c = ready(); if (!c) return; inGame(); const t = c.currentTime; T(t, 'sine', 2349, 2349, 0.06, 0.12); T(t + 0.05, 'sine', 2960, 2960, 0.05, 0.12); },
    good(){ const c = ready(); if (!c) return; inGame(); T(c.currentTime, 'sine', 2217, 2217, 0.045, 0.08); },
    miss(){ const c = ready(); if (!c) return; inGame(); const t = c.currentTime; if (Mic.on && !Settings.headphones) { N(t, 0.2, 0.14, 'lowpass', 300); return; } T(t, 'sine', 140, 60, 0.22, 0.16); N(t, 0.05, 0.08, 'lowpass', 700); },
    oops(){ const c = ready(); if (!c) return; inGame(); const t = c.currentTime; T(t, 'triangle', 2100, 1500, 0.04, 0.12); },
    gotIt(streak){
      const c = ready(); if (!c) return; inGame(); const t = c.currentTime;
      const steps = [0, 2, 4, 7, 9, 12, 14, 16], k = Math.min(steps.length - 1, streak || 0);
      const f = 2093 * Math.pow(2, steps[k] / 12);
      T(t, 'sine', f, f, 0.07, 0.16); T(t + 0.06, 'sine', f * 1.5, f * 1.5, 0.06, 0.22);
      if ((streak || 0) >= 4) T(t + 0.12, 'sine', f * 2, f * 2, 0.04, 0.2);
    },
    levelUp(n){
      const c = ready(); if (!c) return; inGame(); const t = c.currentTime;
      [0, 4, 7, 12, 16].slice(0, 2 + n).forEach((iv, i) => { const f = 1976 * Math.pow(2, iv / 12); T(t + i * 0.055, 'square', f, f, 0.03, 0.1); });
      N(t, 0.12 + n * 0.03, 0.9, 'highpass', 5000);
      this.cheer(0.3 + n * 0.15);
    },
    cheer(amount){
      const c = ready(); if (!c) return; const t = c.currentTime; const a = Math.max(0.1, Math.min(1, amount || 0.5));
      for (const [f, q, pk] of [[1100, 0.8, 0.09], [2500, 1, 0.05]]) {
        const src = c.createBufferSource(); src.buffer = AudioEngine.noiseBuf; src.loop = true;
        const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = f; flt.Q.value = q;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk * a, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6 + a * 0.8);
        const lfo = c.createOscillator(); lfo.frequency.value = 7 + Math.random() * 3; const lg = c.createGain(); lg.gain.value = pk * a * 0.4; lfo.connect(lg).connect(g.gain);
        src.connect(flt).connect(g).connect(bus); src.start(t, Math.random()); src.stop(t + 1.6); lfo.start(t); lfo.stop(t + 1.6);
      }
    },
    combo(){ const c = ready(); if (!c) return; inGame(); const t = c.currentTime; [2217, 2637, 3322, 4435].forEach((f, i) => T(t + i * 0.05, 'square', f, f, 0.025, 0.08)); },
    stamp(){
      const c = ready(); if (!c) return; const t = c.currentTime;
      T(t, 'sine', 120, 40, 0.5, 0.35); N(t, 0.22, 0.9, 'highpass', 4200); N(t, 0.2, 0.06, 'lowpass', 900);
    },
    // splash: a distorted power chord, cymbal and a cheering crowd
    powerOn(){
      const c = ready(); if (!c) return; const t = c.currentTime + 0.02;
      [40, 47, 52, 59, 64].forEach((m, i) => pluck(c, t + i * 0.012, m, 0.5, 1.6, shaper));
      N(t, 0.25, 1.5, 'highpass', 4500); T(t, 'sine', 140, 45, 0.6, 0.4);
      for (const [f, q, pk] of [[900, 0.7, 0.16], [2400, 0.9, 0.08]]) {
        const src = c.createBufferSource(); src.buffer = AudioEngine.noiseBuf; src.loop = true;
        const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = f; flt.Q.value = q;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + 0.45); g.gain.setValueAtTime(pk, t + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
        const lfo = c.createOscillator(); lfo.frequency.value = 6.5; const lg = c.createGain(); lg.gain.value = pk * 0.35; lfo.connect(lg).connect(g.gain);
        src.connect(flt).connect(g).connect(bus); src.start(t); src.stop(t + 2.7); lfo.start(t); lfo.stop(t + 2.7);
      }
      [[t + 0.5, 1900, 2700], [t + 0.9, 2100, 2900]].forEach(([tt, a, b]) => { T(tt, 'sine', a, b, 0.05, 0.3); });
    },
  };
})();
