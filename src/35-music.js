/* =====================================================================
   Menu music: an original '80s dance-funk groove (D minor / F major, 112 BPM).
   Four-on-the-floor kick, gated snare, choppy funk guitar, octave bass, electric piano and pad,
   brassy synth stabs, and a lead line in the second half. Played by the band's voices (31-voices.js)
   through its own set of channel strips, so it has the same stereo stage, reverbs and loudness as a song.

   Music.update(want, scene)   start / stop to match what's on screen. The mix follows the scene
       (default: UI.screen): title and results = everything; play / song / battle / online = the backing
       (no lead, no brass); story = laid back (rim instead of snare, no four-on-the-floor, the lead stays).
   It picks up at the next bar where it left off instead of starting again from bar 1.
   Music.hits (kick snare hat tom gtr, for the menu's beat visuals), Music.beat(), Music.playing, Music.fanfareNext()
   ===================================================================== */
const Music = (() => {
  const BPM = 112, SPB = 16, STEP = 60 / BPM / 4, LOOP = 16, TAIL = 0.4;
  let bus = null, strips = null, echoIn = null, playing = false, timer = null, t0 = 0, k = 0, interacted = false, pendingFanfare = false, scene = 'title';
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
  const LEVEL = 1.5;                       // menu loudness against the in-game band at the default sliders
  function setup(){
    const ctx = AudioEngine.ensure();
    if (bus) return ctx;
    bus = ctx.createGain(); bus.gain.value = 0; bus.connect(AudioEngine.duckBus);
    strips = AudioEngine.makeStrips(bus, null, true);
    // dotted-eighth echo for the lead
    const dl = ctx.createDelay(1); dl.delayTime.value = 60 / BPM * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.28; const wet = ctx.createGain(); wet.gain.value = 0.3;
    echoIn = ctx.createGain(); echoIn.connect(dl); dl.connect(fb).connect(dl); dl.connect(wet).connect(bus);
    strips.lead.duck.connect(echoIn);
    return ctx;
  }
  // which parts play on which screen
  const STEMS = {
    full:    { kick: 1, snare: 1, hat: 1, bass: 1, gtr: 1, keys: 1, brass: 1, lead: 1 },
    backing: { kick: 1, snare: 1, hat: 1, bass: 1, gtr: 1, keys: 1, brass: 0, lead: 0 },
    story:   { kick: 0, snare: 0, rim: 1, hat: 1, bass: 1, gtr: 0, keys: 1, brass: 0, lead: 1 },
  };
  const stems = () => STEMS[scene === 'story' ? 'story' : ['play', 'song', 'battle', 'online'].includes(scene) ? 'backing' : 'full'];
  const V = {
    kick(t){ Voices.kick(t, 0.9); hits.push({ t, kind: 'kick' }); },
    snare(t){ Voices.snare(t, 0.9); AudioEngine.noise(t, 0.2, 0.16, 'bandpass', 1900, 0.6, strips.clap.in); hits.push({ t, kind: 'snare' }); },   // with a gated-room tail
    rim(t){ Voices.rim(t, 0.8); hits.push({ t, kind: 'snare' }); },
    hat(t, v, open){ if (open) Voices.ohat(t, 0.6 * v); else Voices.hat(t, 0.62 * v); if (v > 0.7) hits.push({ t, kind: 'hat' }); },
    tom(t, f){ Voices.tom(t, 0.8, f); hits.push({ t, kind: 'tom' }); },
    crash(t){ Voices.crash(t, 0.55); },
    bass(t, m, len){ Voices.bass(t, m, len * STEP * 0.92, 0.95, 'synth'); },
    gtr(t, notes, len, up){ hits.push({ t, kind: 'gtr' }); Voices.gtr(t, notes, { kind: 'E', v: 0.8, len: len * STEP * 0.8, up, gap: 0.006 }); },
    brass(t, notes, len, v){ notes.forEach(m => Voices.lead(t, m, len * STEP, v || 0.75, 'brass')); },
    pad(t, notes, len){ notes.forEach(m => Voices.pad(t, m, len * STEP, 0.6, 'pad')); },
    keys(t, notes, len, v){ notes.forEach(m => Voices.ep(t, m - 12, len * STEP, v)); },
    lead(t, m, len){ Voices.lead(t, m, len * STEP, 1, 'saw'); },
  };
  function playStep(k, t){
    const bar = Math.floor(k / SPB) % LOOP, i = k % SPB, S = stems();
    const [name, start] = chordAt(bar, i), C = CH[name];
    const fillBar = bar === 7 || bar === 15;
    // drums
    if (i === 0 && (bar === 0 || bar === 8) && S.kick) V.crash(t);
    if (fillBar && i >= 12 && S.snare) { V.tom(t, [240, 200, 160, 125][i - 12]); if (i === 12) V.kick(t); }
    else {
      if (S.kick ? i % 4 === 0 : i === 0 || i === 10) V.kick(t);
      if (i === 4 || i === 12) { if (S.snare) V.snare(t); else if (S.rim) V.rim(t); }
      if (S.hat) V.hat(t, i % 4 === 2 ? 1 : 0.45, i === 14 && bar % 2 === 1);
    }
    // pad holds each chord; the electric piano answers it
    if (i === start && S.keys) { const next = PROG[bar].find(x => x[1] > start), len = (next ? next[1] : SPB) - start; V.pad(t, C.v, len); V.keys(t, C.v, len, 0.5); }
    if (S.keys && (i === 6 || i === 11) && start === 0 && PROG[bar].length === 1) V.keys(t, C.v, 1.5, 0.6);
    // bass: syncopated octaves, fifths and sevenths, with a chromatic step into the next chord
    const span = PROG[bar].length > 1 ? 8 : 16, j = (i - start + 16) % 16;
    const nextBarChord = CH[(PROG[(bar + 1) % LOOP])[0][0]];
    const nextRoot = span === 8 && start === 0 ? CH[PROG[bar][1][0]].r : nextBarChord.r;
    const seventh = C.b7 ? 10 : 12;
    const pat = span === 16
      ? { 0: [0, 3], 3: [12, 1], 6: [0, 1], 7: [C.f5, 1], 8: [0, 2], 10: [12, 1], 11: [seventh, 1], 12: [C.f5, 2], 14: [0, 1], 15: ['app', 1] }
      : { 0: [0, 2], 3: [12, 1], 4: [0, 1], 6: [C.f5, 1], 7: ['app', 1] };
    const hit = pat[j];
    if (hit && S.bass) {
      let m = hit[0] === 'app' ? nextRoot - 1 : C.r + hit[0];
      if (hit[0] === 'app') { while (m < C.r - 6) m += 12; while (m > C.r + 8) m -= 12; }
      V.bass(t, m, hit[1]);
    }
    // funk guitar chops, voiced up an octave
    const g = bar % 2 ? GTR_B : GTR_A;
    if (S.gtr && g.includes(i)) V.gtr(t, C.v.slice(1).map(x => x + 12), 1, i % 4 === 2);
    // brass stabs answer on odd bars of the first half; big hits on the last bar
    if (S.brass) {
      if (bar < 8 && bar % 2 === 1) { if (i === 10) V.brass(t, C.v, 1); if (i === 12) V.brass(t, C.v, 3); }
      if (bar === 15 && (i === 0 || i === 3 || i === 6)) V.brass(t, C.v, i === 6 ? 4 : 2, 0.65);
    }
    if (S.lead) for (const n of LEAD) if (n[0] === bar && n[1] === i) V.lead(t, n[2], n[3]);
  }
  function fanfare(t){
    const q = 60 / BPM / 2;
    V.brass(t, [62, 65, 70, 74], 2, 0.85); V.bass(t, 34, 2); V.kick(t); V.crash(t);
    V.brass(t + q, [64, 67, 72, 76], 2, 0.85); V.bass(t + q, 36, 2); V.snare(t + q);
    V.brass(t + 3 * q, [65, 69, 72, 77, 81], 12, 0.95); V.pad(t + 3 * q, [65, 69, 72, 76], 14); V.bass(t + 3 * q, 41, 8);
    V.kick(t + 3 * q); V.crash(t + 3 * q); V.snare(t + 3 * q);
    return 4 * q + 1.2;
  }
  function tick(){
    const ctx = AudioEngine.ctx; if (!playing || !ctx || AudioEngine.isOffline) return;
    const now = ctx.currentTime, horizon = now + (typeof document !== 'undefined' && document.hidden ? 1.5 : 0.35);
    AudioEngine.withStrips(strips, () => {
      while (t0 + k * STEP < horizon) {
        const i = k % 2, swing = i ? STEP * 0.08 : 0;          // a touch of 16th swing
        const t = t0 + k * STEP + swing;
        if (t >= now - 0.08) playStep(k, Math.max(t, now + 0.002));
        k++;
      }
    });
    if (hits.length > 64) hits.splice(0, hits.length - 64);
  }
  function start(){
    const ctx = setup();
    playing = true;
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.linearRampToValueAtTime(vol() * LEVEL, now + 0.6);
    k = Math.ceil(k / SPB) * SPB;                              // pick up at the next bar instead of starting over
    let first = now + 0.12;
    if (pendingFanfare) { pendingFanfare = false; k = 0; AudioEngine.withStrips(strips, () => { first += fanfare(first); }); }
    t0 = first - k * STEP;
    tick(); timer = tick; Ticker.add(timer);
  }
  function stop(){
    playing = false; if (timer) Ticker.remove(timer); timer = null;
    const ctx = AudioEngine.ctx; if (!ctx || !bus) return;
    const now = ctx.currentTime;
    // with the mic open on speakers the theme's last chord and its reverb tail would be heard as the player's notes:
    // cut it short and ignore the mic while the tail dies
    const leak = AudioEngine.leakMode() !== 'full';
    bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.linearRampToValueAtTime(0, now + (leak ? 0.08 : 0.3));
    if (leak && typeof Mic !== 'undefined' && Mic.deaf) Mic.deaf(TAIL);
  }
  return {
    hits,
    get playing(){ return playing; },
    get interacted(){ return interacted; },
    get scene(){ return scene; },
    markInteracted(){ interacted = true; },
    fanfareNext(){ pendingFanfare = true; },
    beat(){ const ctx = AudioEngine.ctx; return ctx ? (ctx.currentTime - t0) * BPM / 60 : 0; },
    setVolume(){ const ctx = AudioEngine.ctx; if (bus && ctx && playing) { bus.gain.cancelScheduledValues(ctx.currentTime); bus.gain.setTargetAtTime(vol() * LEVEL, ctx.currentTime, 0.05); } },
    // start or stop to match what's on screen
    update(want, sc){
      scene = sc || (typeof UI !== 'undefined' && UI.screen) || scene;
      want = want && interacted && vol() > 0; if (want && !playing) start(); else if (!want && playing) stop();
    },
  };
})();
