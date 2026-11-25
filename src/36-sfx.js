/* =====================================================================
   Sound effects and jingles (all synthesized, from the band's voices).

   In a song, hit confirmations are in key: they play notes of the chord the band is on (Groove.harmony()), on a
   mallet with a bell on top. In the menus they follow the menu theme's key (D minor).
     Sfx.perfect() great() good() miss() oops() gotIt(streak) combo() levelUp(n) cheer(amount) fail() boo()
     Sfx.click() back() toggle() hover(i) open() modalOpen() modalClose() searchStart() found() tick() whoosh() stamp() powerOn()
     Sfx.jingle(name, t)     short WarioWare-style jingles: start, win, lose, command, clear, speedup  (Sfx.JINGLES)
     Sfx.stinger(name, t)    any effect or jingle at audio time t; Groove.stinger(name, 'beat' | 'bar') puts it on the grid
   With the mic open on speakers the game's own sounds could be taken for the player's guitar, so there the hit sounds
   move above the range the note check listens to (above E6) and strum detection is muted only for their attack
   (about 70 ms plus the output latency, not the old blanket 200 ms). With headphones or in tap mode nothing is muted.
   ===================================================================== */
const Sfx = (() => {
  let bus = null, shaper = null, busCtx = null;
  const MENU = { pcs: [2, 5, 9], root: 62 };                 // D minor
  const PENT = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84];     // D minor pentatonic, for hover plucks
  function ready(){
    if (!Settings.sfxOn || !Music.interacted) return null;
    const ctx = AudioEngine.ensure();
    if (busCtx !== ctx) {
      busCtx = ctx;
      bus = ctx.createGain(); bus.connect(AudioEngine.sfxBus);
      shaper = ctx.createWaveShaper();
      const n = 1024, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 4.5); }
      shaper.curve = curve; const sg = ctx.createGain(); sg.gain.value = 0.35; shaper.connect(sg).connect(bus);
    }
    bus.gain.value = Settings.sfxVol * 1.25;
    return ctx;
  }
  const leaks = () => AudioEngine.leakMode() !== 'full';
  const T = (t, type, f0, f1, peak, dur) => AudioEngine.tone(t, type, f0, f1, peak, dur, bus);
  const N = (t, peak, dur, type, f, q, att) => AudioEngine.noise(t, peak, dur, type, f, q, bus, att);
  const L = (t, m, dur, v, kind) => Voices.lead(t, m, dur, v, kind, bus);
  function pluck(ctx, t, m, gain, len, dest){
    const src = ctx.createBufferSource(); src.buffer = AudioEngine.pluckBuffer(m);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.setTargetAtTime(0.0001, t + len, 0.05);
    src.connect(g).connect(dest || bus); src.start(t); src.stop(t + len + 0.4);
  }
  // the game's own sound must not count as a strum: mute onset detection for the attack only, and only if it can leak
  function inGame(t, sec){ if (typeof Mic !== 'undefined' && leaks()) Mic.muteUntil = Math.max(Mic.muteUntil, t + AudioEngine.outputLatency() + (sec || 0.07)); }
  // the chord the band is on (or the menu's key)
  function key(){ const h = typeof Groove !== 'undefined' && Groove.running ? Groove.harmony() : null; return h ? { pcs: h.pcs.slice(0, 3), root: h.pcs[0] } : MENU; }
  // n chord tones going up from midi `lo`
  function tones(n, lo){
    const pcs = key().pcs, out = [];
    for (let m = lo; out.length < n && m < lo + 40; m++) if (pcs.includes(m % 12)) out.push(m);
    return out;
  }
  const hitLo = () => leaks() ? 92 : 79;                      // on speakers with the mic on: above the note check's range
  function hit(c, t, n, v){
    inGame(t);
    tones(n, hitLo()).forEach((m, i) => { L(t + i * 0.05, m, 0.2, v * (0.8 + i * 0.1), 'mallet'); if (i === n - 1 && n > 1) L(t + i * 0.05, m + 12, 0.25, v * 0.35, 'bell'); });
  }
  const FX = {
    click(c, t){ L(t, 86, 0.08, 0.5, 'mallet'); },
    back(c, t){ L(t, 81, 0.08, 0.45, 'mallet'); L(t + 0.05, 74, 0.1, 0.4, 'mallet'); },
    toggle(c, t){ L(t, 86, 0.06, 0.4, 'mallet'); L(t + 0.06, 93, 0.08, 0.4, 'mallet'); },
    hover(c, t, i){ pluck(c, t, PENT[(((i | 0) % PENT.length) + PENT.length) % PENT.length], 0.16, 0.25); },
    open(c, t){
      [50, 57, 62, 65, 69, 76].forEach((m, i) => pluck(c, t + i * 0.022, m, 0.17, 0.7));
      const src = c.createBufferSource(); src.buffer = AudioEngine.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3500, t + 0.28);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      src.connect(f).connect(g).connect(bus); src.start(t); src.stop(t + 0.35);
    },
    modalOpen(c, t){ L(t, 74, 0.08, 0.4, 'mallet'); L(t + 0.06, 81, 0.12, 0.45, 'mallet'); },
    modalClose(c, t){ L(t, 81, 0.08, 0.4, 'mallet'); L(t + 0.06, 74, 0.12, 0.4, 'mallet'); },
    searchStart(c, t){ [74, 77, 81, 84].forEach((m, i) => L(t + i * 0.065, m, 0.1, 0.4, 'mallet')); },
    found(c, t){
      [53, 60, 65, 69, 72, 77].forEach((m, i) => pluck(c, t + i * 0.02, m, 0.18, 1.2));
      [89, 93, 96].forEach((m, i) => L(t + 0.15 + i * 0.07, m, 0.3, 0.4, 'bell'));
    },
    // the crowd boos you off: a low, wavering murmur sliding down, and a sad trombone
    boo(c, t){
      for (let i = 0; i < 6; i++) T(t + i * 0.05, 'sawtooth', 150 + i * 9, 95 + i * 5, 0.05, 1.3);
      N(t, 0.14, 1.4, 'bandpass', 420, 0.8);
      [67, 66, 65, 63].forEach((m, i) => L(t + 0.5 + i * 0.32, m, i === 3 ? 0.8 : 0.26, 0.9, 'kazoo'));
    },
    fail(c, t){ L(t, 64, 0.1, 1, 'pluck'); L(t + 0.14, 58, 0.25, 1, 'pluck'); L(t + 0.14, 46, 0.25, 0.8, 'pluck'); N(t + 0.14, 0.2, 0.1, 'lowpass', 300); },
    whoosh(c, t){
      const src = c.createBufferSource(); src.buffer = AudioEngine.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2800, t + 0.3); f.frequency.exponentialRampToValueAtTime(600, t + 0.6);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
      src.connect(f).connect(g).connect(bus); src.start(t, Math.random()); src.stop(t + 0.7);
    },
    tick(c, t){ L(t, 98, 0.03, 0.25, 'mallet'); },
    // ---- in game ----
    perfect(c, t){ hit(c, t, 3, 1); N(t + 0.1, 0.05, 0.25, 'highpass', 7000); },
    great(c, t){ hit(c, t, 2, 0.9); },
    good(c, t){ hit(c, t, 1, 0.75); },
    miss(c, t){ inGame(t); N(t, 0.3, 0.12, 'lowpass', 320); N(t, 0.14, 0.05, 'bandpass', 900, 1.2); if (!leaks()) T(t, 'sine', 130, 62, 0.3, 0.16); },
    oops(c, t){ inGame(t); const m = tones(1, hitLo() - 12)[0]; L(t, m + 1, 0.12, 0.6, 'mallet'); L(t + 0.07, m, 0.16, 0.55, 'mallet'); },
    gotIt(c, t, streak){
      inGame(t);
      const lad = tones(8, hitLo() - 7), k = Math.min(5, streak | 0);
      L(t, lad[k], 0.2, 0.9, 'mallet'); L(t + 0.07, lad[k + 1], 0.25, 0.9, 'mallet'); L(t + 0.07, lad[k + 1] + 12, 0.3, 0.3, 'bell');
      if ((streak | 0) >= 4) L(t + 0.14, lad[k + 2], 0.3, 0.9, 'mallet');
    },
    combo(c, t){ inGame(t); tones(4, hitLo()).forEach((m, i) => L(t + i * 0.045, m, 0.2, 0.5, 'bell')); N(t + 0.18, 0.08, 0.3, 'highpass', 6500); },
    levelUp(c, t, n){
      n = n | 0; inGame(t);
      if (leaks()) tones(2 + n, 92).forEach((m, i) => L(t + i * 0.055, m, 0.15, 0.7, 'mallet'));
      else { const ch = tones(3, 67); ch.forEach(m => L(t, m, 0.12, 0.8, 'brass')); ch.forEach(m => L(t + 0.16, m + (n >= 3 ? 12 : 0), 0.4, 0.9, 'brass')); tones(2 + n, 84).forEach((m, i) => L(t + 0.16 + i * 0.05, m, 0.2, 0.5, 'bell')); }
      N(t + 0.16, 0.12 + n * 0.03, 0.9, 'highpass', 5000);
      Voices.cheer(t + 0.1, 0.3 + n * 0.15, 0, bus);
    },
    cheer(c, t, amount){ Voices.cheer(t, amount, 0, bus); },
    stamp(c, t){ T(t, 'sine', 120, 40, 0.5, 0.35); N(t, 0.22, 0.9, 'highpass', 4200); N(t, 0.2, 0.06, 'lowpass', 900); },
    // splash: a distorted power chord, cymbal and a cheering crowd
    powerOn(c, t){
      t += 0.02;
      [38, 45, 50, 57, 62].forEach((m, i) => pluck(c, t + i * 0.012, m, 0.5, 1.6, shaper));
      N(t, 0.25, 1.5, 'highpass', 4500); T(t, 'sine', 140, 45, 0.6, 0.4);
      Voices.cheer(t + 0.1, 1, 2.5, bus);
      [[t + 0.5, 1900, 2700], [t + 0.9, 2100, 2900]].forEach(([tt, a, b]) => { T(tt, 'sine', a, b, 0.05, 0.3); });
    },
  };
  /* ---- jingles: one or two bars at 150 bpm, in the song's key when a song is on ---- */
  const JINGLES = ['start', 'win', 'lose', 'command', 'clear', 'speedup'];
  function jingle(name, t){
    const c = ready(); if (!c) return 0;
    t = t || c.currentTime + 0.02; inGame(t, 0.3);
    const s = 0.1, r = 60 + ((key().root - 60) % 12 + 12) % 12, maj = key().pcs.includes((r + 4) % 12), third = maj ? 4 : 3, leak = leaks();
    const up = leak ? 24 : 0;                                                // on speakers with the mic on: everything above the note check
    const kick = tt => { if (leak) N(tt, 0.4, 0.08, 'lowpass', 200); else T(tt, 'sine', 150, 48, 0.55, 0.25); }, snr = (tt, v) => N(tt, 0.3 * (v || 1), 0.12, 'bandpass', 3800, 0.5);
    const slap = (tt, m, d) => { if (!leak) L(tt, m - 24, d, 1, 'pluck'); };
    const stab = (tt, ms, d, v) => ms.forEach(m => L(tt, m + up, d, v || 0.9, leak ? 'mallet' : 'brass'));
    if (name === 'start') {             // da-da-da DAA: a pickup run into a hit
      [0, third, 7].forEach((iv, i) => { slap(t + i * s, r + iv, s * 0.8); L(t + i * s, r + 12 + iv + up, s, 0.8, 'mallet'); snr(t + i * s, 0.5); });
      kick(t + 3 * s); stab(t + 3 * s, [r + 7, r + 12, r + 12 + third], 0.5); N(t + 3 * s, 0.2, 0.9, 'highpass', 4500); slap(t + 3 * s, r, 0.5);
      return 4 * s + 0.6;
    }
    if (name === 'win') {               // a rising fanfare with a held chord and a cheer
      [0, third, 7, 12].forEach((iv, i) => { L(t + i * s, r + 12 + iv + up, s * 1.5, 0.9, 'mallet'); slap(t + i * s, r + (i % 2 ? 7 : 0), s * 0.8); });
      kick(t + 4 * s); stab(t + 4 * s, [r + 12, r + 12 + third, r + 19], 0.22); kick(t + 6.5 * s); snr(t + 6.5 * s);
      stab(t + 6.5 * s, [r + 12 + third, r + 19, r + 24], 0.8, 1); L(t + 6.5 * s, r + 36 + up - (leak ? 12 : 0), 0.8, 0.6, 'bell');
      N(t + 6.5 * s, 0.22, 1.2, 'highpass', 4500); Voices.cheer(t + 0.5, 0.9, 1.6, bus);
      return 6.5 * s + 1.1;
    }
    if (name === 'lose') {              // wah wah wah waaah
      [0, -1, -2, -3].forEach((iv, i) => L(t + i * 0.26, r + 7 + iv + up, i === 3 ? 0.7 : 0.2, 1, leak ? 'mallet' : 'kazoo'));
      [0, 1, 2].forEach(i => N(t + i * 0.26, 0.25, 0.1, 'lowpass', 260)); N(t + 0.78, 0.35, 0.3, 'lowpass', 200);
      return 1.6;
    }
    if (name === 'command') {           // ding-DING: look here
      snr(t, 0.6); snr(t + 0.03, 0.9); L(t, r + 19 + up, 0.12, 0.8, 'bell'); L(t + 1.5 * s, r + 24 + up, 0.4, 1, 'bell'); L(t + 1.5 * s, r + 12 + up, 0.3, 0.7, 'mallet'); kick(t + 1.5 * s);
      return 0.6;
    }
    if (name === 'clear') {             // section cleared: two stabs and a clap
      kick(t); stab(t, [r + 7, r + 12, r + 12 + third], 0.1); stab(t + 2 * s, [r + 12, r + 12 + third, r + 19], 0.4, 1); kick(t + 2 * s);
      for (let i = 0; i < 4; i++) N(t + 2 * s + i * 0.009, 0.3, 0.02, 'bandpass', 1500, 1.1); N(t + 2 * s, 0.16, 0.7, 'highpass', 5000);
      return 0.7;
    }
    if (name === 'speedup') {           // a run up two octaves into a hit
      const lad = []; for (let m = r + 12; lad.length < 8; m++) if (key().pcs.includes(m % 12)) lad.push(m);
      lad.forEach((m, i) => { L(t + i * s * 0.5, m + up, s * 0.6, 0.6 + i * 0.05, 'mallet'); if (i % 2 === 0) snr(t + i * s * 0.5, 0.3 + i * 0.08); });
      Voices.riser(t, 4 * s, 1, bus); kick(t + 4 * s); stab(t + 4 * s, [r + 12, r + 19, r + 24], 0.3, 1); N(t + 4 * s, 0.2, 0.8, 'highpass', 4500);
      return 4 * s + 0.5;
    }
    return 0;
  }
  const api = { JINGLES, jingle, key,
    // any effect or jingle at audio time t (see Groove.stinger)
    stinger(name, t, arg){ if (JINGLES.includes(name)) return jingle(name, t); const c = ready(); if (!c || !FX[name]) return; FX[name](c, t || c.currentTime, arg); },
  };
  for (const name in FX) api[name] = arg => { const c = ready(); if (!c) return; FX[name](c, c.currentTime + 0.001, arg); };
  // a level-up lands on the next beat of the song, so it sounds like part of the music
  api.levelUp = n => { const c = ready(); if (!c) return; const t = typeof Groove !== 'undefined' && Groove.running ? Math.min(Groove.nextTime(1), c.currentTime + 0.5) : c.currentTime + 0.001; FX.levelUp(c, t, n); };
  return api;
})();
