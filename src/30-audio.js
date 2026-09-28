/* =====================================================================
   Audio: synthesized drum kit, groove scheduler, plucked-guitar preview
   ===================================================================== */
const AudioEngine = (() => {
  let ctx = null, smooth = { off: null }, master, duckBus, drumBus, clickBus, sfxBus, noiseBuf, chordTaps = { key: '', n: 0, at: 0 };
  const pluckCache = new Map();
  function ensure(){
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
      master = ctx.createGain(); master.gain.value = 0.9;
      master.connect(comp).connect(ctx.destination);
      // background music (band + menu theme) goes through duckBus so it can dip while a chord preview plays
      duckBus = ctx.createGain(); duckBus.gain.value = 1; duckBus.connect(master);
      drumBus = ctx.createGain(); drumBus.gain.value = Settings.drumVol; drumBus.connect(duckBus);
      // iOS pauses ("interrupts") the context when the mic opens or a call comes in: wake it on the next touch
      const wake = () => { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {}); };
      ['pointerdown', 'touchend', 'keydown'].forEach(e => window.addEventListener(e, wake, { passive: true }));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
      ctx.onstatechange = () => { if (ctx.state === 'interrupted') setTimeout(wake, 300); };
      clickBus = ctx.createGain(); clickBus.gain.value = 0.5; clickBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});
    return ctx;
  }
  const env = (g, t, peak, decay, attack = 0.002) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };
  function noise(t, peak, decay, type, freq, q, bus){
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = ctx.createGain(); env(g, t, peak, decay);
    src.connect(f).connect(g).connect(bus || drumBus);
    src.start(t, Math.random() * 1.5); src.stop(t + decay + 0.05);
  }
  function tone(t, type, f0, f1, peak, decay, bus){
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.6);
    const g = ctx.createGain(); env(g, t, peak, decay);
    o.connect(g).connect(bus || drumBus); o.start(t); o.stop(t + decay + 0.05);
  }
  // When the mic is on and the band plays through speakers, the drums must not contain guitar-range pitches,
  // or the note recogniser hears them as notes. Kick and snare then use a sub-bass thump and noise only.
  const leak = () => typeof Mic !== 'undefined' && Mic.on && !Settings.headphones;
  const kit = {
    kick(t, v){ if (leak()) { tone(t, 'sine', 48, 30, 0.9 * v, 0.14); noise(t, 0.9 * v, 0.09, 'lowpass', 110); noise(t, 0.12 * v, 0.01, 'highpass', 2600); return; }
      tone(t, 'sine', 165, 44, 1.1 * v, 0.38); noise(t, 0.18 * v, 0.012, 'highpass', 2600); },
    snare(t, v){ noise(t, 0.62 * v, 0.17, 'highpass', 1300); if (leak()) { noise(t, 0.3 * v, 0.07, 'bandpass', 900, 0.6); return; } tone(t, 'triangle', 200, 170, 0.45 * v, 0.08); },
    rim(t, v){ if (leak()) { noise(t, 0.3 * v, 0.03, 'bandpass', 1800, 2); return; } tone(t, 'triangle', 1750, 1700, 0.35 * v, 0.03); tone(t, 'square', 520, 500, 0.08 * v, 0.02); },
    brush(t, v){ noise(t, 0.28 * v, 0.09, 'bandpass', 3500, 0.7); },
    clap(t, v){ for (let i = 0; i < 3; i++) noise(t + i * 0.011, 0.45 * v, 0.012, 'bandpass', 1400, 0.9); noise(t + 0.033, 0.4 * v, 0.14, 'bandpass', 1300, 0.9); },
    tamb(t, v){ noise(t, 0.3 * v, 0.07, 'bandpass', 9000, 1.4); noise(t + 0.03, 0.18 * v, 0.1, 'bandpass', 8500, 1.4); },
    hat(t, v){ noise(t, 0.26 * v, 0.045, 'highpass', 7500); },
    ohat(t, v){ noise(t, 0.24 * v, 0.28, 'highpass', 7000); },
    ride(t, v){ noise(t, 0.16 * v, 0.35, 'highpass', 5200); tone(t, 'sine', 3100, 3050, 0.05 * v, 0.3); },
    crash(t, v){ noise(t, 0.42 * v, 1.3, 'highpass', 4200); noise(t, 0.2 * v, 0.8, 'bandpass', 7500, 0.6); },
    tom(t, v, f){ tone(t, 'sine', f, f * 0.62, 0.8 * v, 0.28); noise(t, 0.08 * v, 0.02, 'lowpass', 1800); },
    bass(t, midi, dur, v){
      const o = ctx.createOscillator(); o.type = 'sine';
      const f = midiToHz(midi); o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.018);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.62 * v, t + 0.006);
      g.gain.setValueAtTime(0.5 * v, t + Math.max(0.02, dur * 0.85)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
      o.connect(g).connect(drumBus); o.start(t); o.stop(t + dur + 0.1);
      noise(t, 0.05 * v, 0.012, 'lowpass', 600);
    },
    click(t, accent){ tone(t, 'sine', accent ? 2637 : 1976, 0, accent ? 0.5 : 0.32, 0.035, clickBus); },   // above the guitar's range
    sticks(t){ tone(t, 'triangle', 2500, 2400, 0.4, 0.04, clickBus); tone(t, 'sine', 1250, 1200, 0.2, 0.03, clickBus); },
  };
  /* ---- acoustic guitar: one physically modelled string per note (extended Karplus-Strong: tuned with an
     all-pass fractional delay, plucked about an eighth of the way from the bridge, wound strings darker and
     longer-ringing), then a steel-string guitar body (the air resonance near 100 Hz and the top-plate modes)
     and a small room. A strum rolls across the strings of the exact shape on screen, low to high. ---- */
  let gtrIn = null;
  function guitarBus(){
    if (gtrIn) return gtrIn;
    const sr = ctx.sampleRate, len = Math.round(sr * 1.1), ir = ctx.createBuffer(2, len, sr);
    const modes = [[98, 1.0, 0.07], [118, 0.45, 0.05], [196, 0.8, 0.05], [245, 0.35, 0.04], [290, 0.45, 0.035], [405, 0.55, 0.03], [520, 0.35, 0.025],
      [690, 0.3, 0.02], [880, 0.22, 0.016], [1150, 0.2, 0.012], [1600, 0.14, 0.009], [2400, 0.1, 0.006]];
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      d[0] = 1.2;
      for (const [f, a, tau] of modes) { const ff = f * (ch ? 1.012 : 0.994), w = 2 * Math.PI * ff / sr, ph = Math.random() * 0.4; for (let i = 0; i < Math.min(len, sr * tau * 7); i++) d[i] += a * 0.09 * Math.exp(-i / (sr * tau)) * Math.sin(w * i + ph); }
      // wood texture + a short, soft room
      let lp = 0; for (let i = 0; i < len; i++) { const r = Math.random() * 2 - 1; lp = lp * 0.72 + r * 0.28; d[i] += lp * (0.05 * Math.exp(-i / (sr * 0.012)) + 0.018 * Math.exp(-i / (sr * 0.32)) * Math.min(1, i / (sr * 0.01))); }
    }
    const conv = ctx.createConvolver(); conv.normalize = true; conv.buffer = ir;
    const dry = ctx.createGain(); dry.gain.value = 0.55;
    const wet = ctx.createGain(); wet.gain.value = 0.9;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 7200; tone.Q.value = 0.5;
    const out = ctx.createGain(); out.gain.value = 1;
    gtrIn = ctx.createGain(); gtrIn.gain.value = 1;
    gtrIn.connect(dry).connect(tone); gtrIn.connect(conv).connect(wet).connect(tone);
    tone.connect(out).connect(sfxBus);
    return gtrIn;
  }
  function pluckBuffer(midi, string, vel){
    string = string == null ? (midi < 50 ? 0 : midi < 55 ? 1 : midi < 59 ? 2 : midi < 64 ? 3 : midi < 69 ? 4 : 5) : string;
    vel = vel == null ? 0.8 : vel;
    const key = midi + '|' + string + '|' + Math.round(vel * 4);
    if (pluckCache.has(key)) return pluckCache.get(key);
    const sr = ctx.sampleRate, f = midiToHz(midi), wound = string <= 2;
    const t60 = (wound ? 5.2 : 3.4) * Math.pow(110 / f, 0.35);          // lower notes ring longer
    const len = Math.round(sr * Math.min(4.5, t60 * 0.9 + 0.4));
    const buf = ctx.createBuffer(1, len, sr), out = buf.getChannelData(0);
    // loop delay: N whole samples + an all-pass for the fraction (+ 0.5 for the averaging filter) = exactly sr / f
    const L = sr / f, N = Math.max(2, Math.floor(L - 0.5 - 0.1)), dfrac = L - 0.5 - N, C = (1 - dfrac) / (1 + dfrac);
    const rho = Math.pow(10, -3 / (t60 * f));                           // loss per trip round the string
    const S = wound ? 0.5 : 0.5;
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
      out[i] = x;
      idx = idx + 1 === N ? 0 : idx + 1;
    }
    // a little attack click from the pick, and a fade at the end
    for (let i = 0; i < Math.min(len, 64); i++) out[i] += (Math.random() * 2 - 1) * 0.05 * vel * (1 - i / 64);
    const fade = Math.round(sr * 0.08); for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
    pluckCache.set(key, buf);
    return buf;
  }
  // notes: midis low -> high, or [{midi, string}] from the shape on screen
  function strum(midis, t, gap = 0.016, vel = 0.85){
    ensure();
    t = t || ctx.currentTime + 0.03;
    const notes = midis.map((m, i) => typeof m === 'object' ? m : { midi: m, string: null });
    // the game's own guitar mustn't count as the player's: ignore it while it rings
    if (typeof Mic !== 'undefined') { Mic.muteUntil = Math.max(Mic.muteUntil, t + notes.length * gap + 0.2); Mic.deafUntil = Math.max(Mic.deafUntil, t + (Settings.headphones ? 0.4 : 2.45)); }
    const bus = guitarBus();
    notes.forEach((n, i) => {
      const v = Math.max(0.35, vel * (1 - i * 0.035) * (0.92 + Math.random() * 0.12));
      const src = ctx.createBufferSource(); src.buffer = pluckBuffer(n.midi, n.string, v);
      const g = ctx.createGain(); g.gain.value = 0.42;
      src.connect(g).connect(bus); src.start(t + i * gap * (0.85 + Math.random() * 0.3));
    });
  }
  // quick dip of the background music while a chord preview rings, then back up
  function duck(sec){
    ensure(); const t = ctx.currentTime, g = duckBus.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.12, t + 0.06); g.setValueAtTime(0.12, t + 0.06 + sec); g.linearRampToValueAtTime(1, t + 0.06 + sec + 0.35);
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
    if (good) { tone(t, 'sine', 880, 880, 0.18, 0.08, sfxBus); tone(t + 0.07, 'sine', 1320, 1320, 0.16, 0.12, sfxBus); }
    else tone(t, 'triangle', 220, 150, 0.2, 0.15, sfxBus);
  }
  return {
    ensure, kit, strum, blip, tone, noise, pluckBuffer, playChord, arpeggio, duck,
    get duckBus(){ ensure(); return duckBus; },
    get ctx(){ return ctx; },
    get master(){ return master; },
    get noiseBuf(){ return noiseBuf; },
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
    setDrumVol(v){ if (drumBus) drumBus.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
    outputLatency(){ return ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0.03; },
  };
})();

/* ---------------- drum patterns ---------------- */
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
  if (style === 'none') return { n, k: lane('', n), s: lane('', n), h: lane('', n), sv: 'snare', hv: 'hat', none: true };
  if (sub === 4 && beats === 4) base = P44[style] || P44.rock;
  else if (sub === 4 && beats === 3) base = { k:'x...........', s:'....x...x...', h:'x.x.x.x.x.x.', sv: ['ballad','waltz','folk'].includes(style) ? 'rim' : 'snare' };
  else if (sub === 4 && beats === 2) base = { k:'x...x...', s:'..x...x.', h:'x.x.x.x.' };
  else if (sub === 3 && beats === 2) base = { k:'x.....', s:'...x..', h:'xxxxxx', sv: style === 'ballad' ? 'rim' : 'snare' };
  else if (sub === 3 && beats === 4) base = { k:'x.....x.....', s:'...x.....x..', h:'xxxxxxxxxxxx' };
  else { const k = 'x' + '.'.repeat(n - 1); const s = '.'.repeat(Math.floor(n / 2)) + 'x' + '.'.repeat(n - Math.floor(n / 2) - 1); base = { k, s, h: 'x.'.repeat(Math.ceil(n / 2)).slice(0, n) }; }
  const d = chart.song.drums;
  const src = d ? { k: d.kick, s: d.snare, h: d.hat, sv: base.sv, hv: base.hv } : base;
  return { n, k: lane(src.k, n), s: lane(src.s, n), h: lane(src.h, n), sv: src.sv || 'snare', hv: src.hv || 'hat' };
}

/* ---------------- the groove scheduler ----------------
   Step k (can be negative during the count-in) happens at startTime + time(k).
   mode 'song': plays the chart's bars once, with fills and crashes.
   mode 'loop': repeats the groove forever (practice).                     */
const LEVEL_NAMES = ['Warming up', 'Grooving', 'On a roll', 'On fire', 'LEGENDARY'];
const Groove = {
  running: false, timer: null, cfg: null, k: 0, hits: [], level: 0,
  start(cfg){
    this.stop();
    const ctx = AudioEngine.ensure();
    this.cfg = cfg;
    const P = cfg.pattern, beatsPerBar = P.n / cfg.sub;
    cfg.beatDur = 60 / cfg.bpm; cfg.stepDur = cfg.beatDur / cfg.sub;
    cfg.firstBar = cfg.firstBar || 0;
    cfg.firstStep = cfg.firstBar * P.n;
    cfg.fromBeat = cfg.firstBar * beatsPerBar;
    const t0 = ctx.currentTime + 0.2 + (cfg.countIn || 0) * cfg.beatDur;   // when the first real beat lands
    cfg.startTime = t0 - cfg.fromBeat * cfg.beatDur;                          // time of song beat 0
    this.k = cfg.firstStep - (cfg.countIn || 0) * cfg.sub;
    this.hits = [];
    this.running = true;
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
  },
  stop(){ this.running = false; if (this.timer) clearInterval(this.timer); this.timer = null; },
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
    const ctx = AudioEngine.ctx, horizon = ctx.currentTime + 0.12;
    while (this.running && this.timeOf(this.k) < horizon) { this.play(this.k, this.timeOf(this.k)); this.k++; }
  },
  // what the kit will play on step k, without playing it (mirrors play(), so the drummer can wind up early)
  plan(k){
    const c = this.cfg; if (!c) return [];
    const P = c.pattern, n = P.n;
    if (k < c.firstStep) return ((k % c.sub) + c.sub) % c.sub === 0 ? ['stick'] : [];
    const bar = Math.floor(k / n), i = k % n, out = [];
    if (c.mode === 'song' && bar >= c.endBar) return bar === c.endBar && i === 0 && !P.none ? ['crash', 'kick'] : [];
    if (P.none) return out;
    const secStart = c.mode === 'song' && c.sectionStarts && c.sectionStarts.has(bar) && i === 0;
    if (c.mode === 'song' && c.fillBars && c.fillBars.has(bar) && i >= n - c.sub) { out.push('tom'); if (i === n - c.sub) out.push('kick'); return out; }
    if (secStart && bar > c.firstBar) out.push('crash');
    const L = this.level, onBeat = i % c.sub === 0, kv = P.k[i], sv = P.s[i], hv = P.h[i];
    if (L === 0) { if (kv > 0 && onBeat) out.push('kick'); if (sv > 0 && onBeat) out.push('snare'); if (onBeat) out.push('hat'); return out; }
    if (kv > 0) out.push('kick'); if (sv > 0) out.push('snare'); if (hv) out.push('hat');
    if (L >= 3) { if (i === n - Math.ceil(c.sub / 2) && !hv) out.push('hat'); if (i === n - 1 && bar % 2 === 1 && kv === 0) out.push('kick'); }
    if (L >= 4 && i === 0 && bar % 2 === 0 && !secStart) out.push('crash');
    return out;
  },
  // hits already scheduled (recent past) plus the ones coming up
  events(now){
    const out = this.hits.filter(h => h.t > now - 1.6);
    if (this.running && this.cfg) for (let k = this.k, m = 0; m < 96 && this.timeOf(k) < now + 1.3; k++, m++) for (const kind of this.plan(k)) out.push({ t: this.timeOf(k), kind });
    return out;
  },
  // pitched backing (bass, toms) only when it can't leak into the mic
  pitchedOk(){ return !(typeof Mic !== 'undefined' && Mic.on) || !!Settings.headphones; },
  play(k, t){
    const c = this.cfg, P = c.pattern, kit = AudioEngine.kit;
    if (t < AudioEngine.ctx.currentTime - 0.01) return;
    if (k < c.firstStep) { if (((k % c.sub) + c.sub) % c.sub === 0) { kit.sticks(t); this.hits.push({ t, kind: 'stick' }); } return; }
    const stepsPerBar = P.n, bar = Math.floor(k / stepsPerBar), i = k % stepsPerBar;
    if (c.mode === 'song' && bar >= c.endBar) {
      if (bar === c.endBar && i === 0 && !P.none) { kit.crash(t, 1); kit.kick(t, 1); this.hits.push({ t, kind: 'crash' }, { t, kind: 'kick' }); }
      if (bar > c.endBar) { this.stop(); c.onEnd && c.onEnd(); }
      return;
    }
    if (c.click && i % c.sub === 0) kit.click(t, i === 0);
    if (P.none) { if (i % c.sub === 0) kit.click(t, i === 0); return; }
    // section start crash
    const secStart = c.mode === 'song' && c.sectionStarts && c.sectionStarts.has(bar) && i === 0;
    // fill in the last beat of a section's final bar
    const fillBar = c.mode === 'song' && c.fillBars && c.fillBars.has(bar);
    const fillFrom = stepsPerBar - c.sub;
    if (fillBar && i >= fillFrom) {
      const j = i - fillFrom;
      const f = [330, 262, 196, 147, 131, 110][Math.min(5, Math.floor(j * 4 / c.sub))];
      if (c.sub === 3 || j % 1 === 0) {
        if (this.pitchedOk()) kit.tom(t, 0.85, f); else kit.snare(t, 0.5 + j * 0.08);   // toms have a pitch the mic could mistake for a note
        this.hits.push({ t, kind: 'tom' });
      }
      if (j === 0) { kit.kick(t, 0.8); this.hits.push({ t, kind: 'kick' }); }
      return;
    }
    if (secStart && bar > c.firstBar) { kit.crash(t, 0.9); this.hits.push({ t, kind: 'crash' }); }
    const L = this.level, onBeat = i % c.sub === 0;
    const kv = P.k[i], sv = P.s[i], hv = P.h[i];
    if (L === 0) {
      // warming up: just the heartbeat of the groove
      if (kv > 0 && onBeat) { kit.kick(t, kv * 0.9); this.hits.push({ t, kind: 'kick' }); }
      if (sv > 0 && onBeat) { kit[P.sv](t, sv * 0.7); this.hits.push({ t, kind: 'snare' }); }
      if (onBeat) { kit.hat(t, 0.5); this.hits.push({ t, kind: 'hat' }); }
    } else {
      if (kv > 0) { kit.kick(t, kv); this.hits.push({ t, kind: 'kick' }); }
      if (sv > 0) { kit[P.sv](t, sv); this.hits.push({ t, kind: 'snare' }); }
      if (hv > 0) { kit[P.hv](t, hv); this.hits.push({ t, kind: 'hat' }); }
      else if (hv < 0) { kit.ohat(t, -hv); this.hits.push({ t, kind: 'hat' }); }
      if (L >= 3) {
        if (hv === 0 && c.sub === 4 && i % 2 === 1) kit.hat(t, 0.22);                 // 16th ghost hats
        if (i === stepsPerBar - Math.ceil(c.sub / 2)) { kit.ohat(t, 0.5); if (!hv) this.hits.push({ t, kind: 'hat' }); }   // open hat into the next bar
        if (i === stepsPerBar - 1 && bar % 2 === 1 && kv === 0) { kit.kick(t, 0.55); this.hits.push({ t, kind: 'kick' }); }    // pickup kick
      }
      if (L >= 4) {
        if (sv >= 0.5) { kit.clap(t, 0.55); }
        if (onBeat && sv === 0) kit.tamb(t, 0.45);
        if (i === 0 && bar % 2 === 0 && !secStart) { kit.crash(t, 0.4); this.hits.push({ t, kind: 'crash' }); }
      }
    }
    // bass line: simple roots first, then walking eighths, then funky octaves
    if (L >= 2 && c.bassAt && this.pitchedOk()) {
      const b = c.bassAt(k, t);
      if (b) {
        const half = Math.floor(stepsPerBar / 2) - (Math.floor(stepsPerBar / 2) % c.sub);
        let iv = null, len = 1;
        if (L === 2) { if (i === 0 || i === half) { iv = 0; len = half || stepsPerBar; } }
        else if (L === 3) {
          const eighth = c.sub === 4 ? 2 : 1;
          if (i % eighth === 0) { iv = [0, 0, b.fifth, 0, 12, 0, b.fifth, 0][(i / eighth) % 8]; len = eighth; }
        } else {
          const map = c.sub === 4 ? { 0: 0, 3: 12, 4: 0, 6: 12, 8: 0, 10: b.fifth, 11: 12, 13: 0, 14: b.fifth } : { 0: 0, 2: 12, 3: 0, 5: b.fifth };
          const j = i % (c.sub === 4 ? 16 : 6);
          if (map[j] !== undefined) { iv = map[j]; len = 1.5; }
        }
        if (iv !== null) kit.bass(t, b.root + iv, len * c.stepDur * 0.95, L >= 4 ? 1 : 0.9);
      }
    }
    if (this.hits.length > 64) this.hits.splice(0, this.hits.length - 64);
  },
};
