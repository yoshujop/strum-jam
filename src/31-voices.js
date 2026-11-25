/* =====================================================================
   The band's instruments, synthesized (no samples). Every voice is a function (t, ...) that schedules
   Web Audio nodes at audio time t and connects them to its channel strip via AudioEngine.out(name).

   Drums    Voices.kick|snare|rim|brush|clap|tamb|shaker|cowbell|hat|ohat|ride|crash(t, v)   Voices.tom(t, v, hz)
   Bass     Voices.bass(t, midi, dur, v, kind)      kind: finger | pick | synth | sub | upright | safe
   Chords   Voices.ep(t, midi, dur, v)              FM electric piano
            Voices.organ(t, midi, dur, v)           drawbar organ
            Voices.pad(t, midi, dur, v, kind)       kind: pad | strings | saw | safe
            Voices.gtr(t, notes, o)                 Karplus-Strong guitar; o = {kind: 'E' clean | 'D' drive | 'A' acoustic,
                                                    v, len (seconds before the hand mutes; 0 = ring), up, gap, chk (dead strum)}
   Lead     Voices.lead(t, midi, dur, v, kind, dest)  kind: brass | mallet | bell | pluck | kazoo | whistle | saw
   Crowd    Voices.cclap(t, v)   Voices.whoa(t, midi, dur, v)   Voices.cheer(t, amount, dur, dest)   Voices.riser(t, dur, v)
   Voices.setKit({k, kd, s, sd, click})             per-style drum tuning (kick pitch/decay, snare pitch/decay)

   With the mic open on speakers (AudioEngine.leakMode() !== 'full') the drums have no pitched part: the kick stays
   under the guitar's lowest note, the snare, rim and toms are noise only.
   ===================================================================== */
const Voices = (() => {
  const A = AudioEngine, hz = midiToHz;
  const metal = new Map(), waves = new WeakMap();
  let K = { k: 1, kd: 1, s: 1, sd: 1, click: 1 }, openHat = null;
  const c = () => A.ctx, O = n => A.out(n), leaky = () => A.leakMode() !== 'full';
  // six detuned square waves (the 808 cymbal recipe) plus a little noise: the raw metal for hats, ride and crash
  function metalBuf(){
    const sr = c().sampleRate; if (metal.has(sr)) return metal.get(sr);
    const len = Math.round(sr * 1.5), b = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: 1 }), d = b.getChannelData(0);
    const fs = [205.3, 304.4, 369.6, 522.7, 540, 800].map(f => f * 2 * 2 / sr);
    for (let i = 0; i < len; i++) { let s = 0; for (const f of fs) s += ((i * f) % 2) < 1 ? 1 : -1; d[i] = s / 6 * 0.8 + (Math.random() * 2 - 1) * 0.25; }
    metal.set(sr, b); return b;
  }
  function gEnv(t, peak, dec, att){
    const g = c().createGain(), a = att || 0.002;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    return g;
  }
  // filtered noise (or metal) burst
  function nz(t, peak, dec, type, f, q, dest, att, buf, rate){
    const x = c(), src = x.createBufferSource(); src.buffer = buf || A.noiseBuf; if (rate) src.playbackRate.value = rate;
    const fl = x.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q;
    const g = gEnv(t, peak, dec, att);
    src.connect(fl).connect(g).connect(dest);
    src.start(t, Math.random() * 1.2); src.stop(t + dec + (att || 0) + 0.05);
    return g;
  }
  function os(t, type, f0, f1, ramp, peak, dec, dest, att){
    const x = c(), o = x.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + ramp);
    const g = gEnv(t, peak, dec, att);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dec + (att || 0) + 0.05);
    return o;
  }
  // held-note envelope: quick attack, a decay towards `sus`, release at the end. Returns the gain node.
  function held(t, dur, peak, att, decT, sus, rel){
    const g = c().createGain(), p = g.gain;
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + att); p.setTargetAtTime(peak * sus, t + att, decT);
    p.setTargetAtTime(0, t + Math.max(att + 0.01, dur), rel);
    return g;
  }
  const endOf = (t, dur, rel) => t + dur + rel * 6 + 0.05;

  /* ---------------- drums ---------------- */
  function kick(t, v){
    const d = O('kick');
    if (leaky()) { os(t, 'sine', 48, 30, 0.084, 0.9 * v, 0.14, d); nz(t, 0.9 * v, 0.09, 'lowpass', 110, 0, d); nz(t, 0.3 * v * K.click, 0.01, 'highpass', 2600, 0, d); }      // the recipe the note check was tuned against
    else {
      os(t, 'sine', 150 * K.k, 50 * K.k, 0.05, 0.68 * v, 0.3 * K.kd, d);                      // the body: a fast sweep down, then the thud
      os(t, 'triangle', 230 * K.k, 105 * K.k, 0.03, 0.45 * v, 0.055, d);                     // the knock small speakers can play
      nz(t, 0.42 * v * K.click, 0.007, 'highpass', 2800, 0, d);                              // beater click
    }
    A.pump(t, 0.35 * v);
  }
  function snare(t, v){
    const d = O('snare'), ghost = v < 0.42, tail = (ghost ? 0.07 : 0.16) * K.sd;
    if (leaky()) { nz(t, 0.9 * v, tail + 0.01, 'highpass', 1300, 0, d); nz(t, 0.45 * v, 0.07, 'bandpass', 900, 0.6, d); return; }
    nz(t, 0.95 * v, tail, 'bandpass', 4300, 0.45, d);                                         // the wires
    nz(t, 0.7 * v, 0.022, 'highpass', 5200, 0, d);                                           // the stick's snap
    os(t, 'triangle', 196 * K.s, 168 * K.s, 0.05, 0.7 * v, 0.085, d);                        // two drum-head tones
    os(t, 'sine', 331 * K.s, 300 * K.s, 0.04, 0.36 * v, 0.055, d);
  }
  function rim(t, v){
    const d = O('snare');
    if (leaky()) { nz(t, 0.6 * v, 0.03, 'bandpass', 1800, 2, d); return; }
    nz(t, 0.6 * v, 0.014, 'bandpass', 2400, 2, d);
    os(t, 'triangle', 1750, 1690, 0.02, 0.6 * v, 0.03, d); os(t, 'square', 480, 470, 0.02, 0.18 * v, 0.022, d);
  }
  function brush(t, v){ nz(t, 0.6 * v, 0.1, 'bandpass', 3400, 0.7, O('snare'), 0.025); }
  function clap(t, v){ const d = O('clap'); if (leaky()) { for (let i = 0; i < 3; i++) nz(t + i * 0.011, 0.6 * v, 0.012, 'bandpass', 1400, 0.9, d); nz(t + 0.033, 0.55 * v, 0.14, 'bandpass', 1300, 0.9, d); return; } for (let i = 0; i < 3; i++) nz(t + i * 0.011 + Math.random() * 0.003, 0.7 * v, 0.012, 'bandpass', 1500, 1.1, d); nz(t + 0.034, 0.65 * v, 0.15, 'bandpass', 1350, 0.9, d); }
  function tamb(t, v){ const d = O('perc'), m = leaky() ? null : metalBuf(); nz(t, 0.55 * v, 0.06, 'highpass', 8200, 0, d, 0.002, m, 1.3); nz(t + 0.028, 0.3 * v, 0.09, 'highpass', 7800, 0, d, 0.002, m, 1.25); }
  function shaker(t, v){ nz(t, 0.42 * v, 0.045, 'highpass', 6200, 0, O('perc'), 0.012); }
  function cowbell(t, v){
    const d = O('perc');
    if (leaky()) { nz(t, 0.25 * v, 0.05, 'highpass', 4000, 0, d); return; }
    const x = c(), f = x.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2640; f.Q.value = 1.2; f.connect(d);
    os(t, 'square', 540, 540, 0.1, 0.16 * v, 0.16, f); os(t, 'square', 800, 800, 0.1, 0.16 * v, 0.16, f);
  }
  function choke(t){ if (openHat && openHat.until > t) { openHat.g.gain.cancelScheduledValues(t); openHat.g.gain.setTargetAtTime(0, t, 0.008); } openHat = null; }
  function hat(t, v){
    choke(t);
    nz(t, 0.62 * v, 0.03 + 0.03 * v, 'highpass', leaky() ? 7500 : 7200, 0, O('hat'), 0.001, leaky() ? null : metalBuf(), 1);
  }
  function ohat(t, v){
    choke(t);
    const g = nz(t, 0.5 * v, 0.34, 'highpass', leaky() ? 7000 : 6600, 0, O('hat'), 0.001, leaky() ? null : metalBuf(), 1);
    openHat = { g, until: t + 0.36 };
  }
  function ride(t, v){
    const d = O('ride');
    if (leaky()) { nz(t, 0.36 * v, 0.35, 'highpass', 5200, 0, d); os(t, 'sine', 3100, 3050, 0.1, 0.06 * v, 0.3, d); return; }
    nz(t, 0.42 * v, 0.6, 'bandpass', 5600, 0.7, d, 0.001, metalBuf(), 0.63);
    nz(t, 0.3 * v, 0.03, 'highpass', 8000, 0, d);
    os(t, 'sine', 3120, 3120, 0.1, 0.06 * v, 0.28, d); os(t, 'sine', 4680, 4680, 0.1, 0.035 * v, 0.2, d);     // the bell's ping (above the guitar's range)
  }
  function crash(t, v){
    const d = O('crash'), m = metalBuf();
    if (leaky()) { nz(t, 0.8 * v, 1.3, 'highpass', 4200, 0, d); nz(t, 0.4 * v, 0.8, 'bandpass', 7500, 0.6, d); return; }
    nz(t, 0.8 * v, 1.5, 'highpass', 3000, 0, d, 0.002, m, 0.8);
    nz(t, 0.4 * v, 0.9, 'bandpass', 7600, 0.6, d);
    nz(t, 0.6 * v, 0.05, 'highpass', 2000, 0, d);
  }
  function tom(t, v, f){
    f = f || 150;
    const d = O(f > 200 ? 'tomH' : f > 125 ? 'tomM' : 'tomL');
    if (leaky()) { nz(t, 0.8 * v, 0.15, 'highpass', 1300, 0, d); nz(t, 0.5 * v, 0.07, 'bandpass', 500 + f * 2, 0.6, d); return; }       // a tom's pitch could pass for a note: a snare-like hit instead, brighter for the high toms
    nz(t, 0.22 * v, 0.02, 'lowpass', 2600, 0, d);
    os(t, 'sine', f * 1.25, f * 0.86, 0.07, 0.9 * v, 0.3, d);
    os(t, 'triangle', f * 1.9, f * 1.3, 0.04, 0.2 * v, 0.07, d);
  }
  function click(t, accent){ A.tone(t, 'sine', accent ? 2637 : 1976, 0, accent ? 0.5 : 0.32, 0.035, A.clickBus); }   // above the guitar's range
  function sticks(t){ A.tone(t, 'triangle', 2500, 2400, 0.4, 0.04, A.clickBus); A.tone(t, 'sine', 1250, 1200, 0.2, 0.03, A.clickBus); A.noise(t, 0.12, 0.012, 'highpass', 5000, 0, A.clickBus); }

  /* ---------------- bass ---------------- */
  function bass(t, midi, dur, v, kind){
    const x = c(), d = O('bass'), f = hz(midi);
    v = v == null ? 0.9 : v;
    kind = leaky() ? 'safe' : (kind || 'finger');
    dur = Math.max(0.06, dur);
    const P = { finger: [0.5, 0.3, 950, 330, 0.16, 0.75, 0.05], pick: [0.42, 0.42, 2400, 650, 0.12, 0.7, 0.04], synth: [0.3, 0.5, 2200, 300, 0.1, 0.8, 0.03],
      sub: [0.6, 0.3, 900, 300, 0.25, 0.85, 0.09], upright: [0.55, 0.26, 800, 260, 0.1, 0.35, 0.07], safe: [0.55, 0.45, 650, 330, 0.25, 0.7, 0.06] }[kind] || [0.5, 0.3, 950, 330, 0.16, 0.75, 0.05];
    const [aBody, aEdge, fc0, fc1, fcT, sus, rel] = P;
    const amp = held(t, dur, 0.5 * v, 0.005, kind === 'upright' ? 0.22 : 0.5, sus, rel); amp.connect(d);
    const end = endOf(t, dur, rel);
    // the body: the fundamental, with a little 'thup' of pitch at the start
    const o1 = x.createOscillator(); o1.type = kind === 'sub' ? 'sine' : 'triangle';
    o1.frequency.setValueAtTime(f * (kind === 'sub' ? 1.8 : 1.12), t); o1.frequency.exponentialRampToValueAtTime(f, t + (kind === 'sub' ? 0.035 : 0.014));
    const g1 = x.createGain(); g1.gain.value = aBody; o1.connect(g1).connect(amp); o1.start(t); o1.stop(end);
    // the edge: harmonics through a filter that closes as the note rings (what a phone speaker actually plays)
    const lp = x.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = kind === 'synth' ? 5 : 1.2;
    lp.frequency.setValueAtTime(fc0 * (0.6 + 0.5 * v), t); lp.frequency.setTargetAtTime(fc1, t, fcT);
    const g2 = x.createGain(); g2.gain.value = aEdge; lp.connect(g2).connect(amp);
    const o2 = x.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f; o2.connect(lp); o2.start(t); o2.stop(end);
    if (kind === 'synth' || kind === 'pick') { const o3 = x.createOscillator(); o3.type = 'square'; o3.frequency.value = f; o3.detune.value = kind === 'synth' ? 9 : 0; const g3 = x.createGain(); g3.gain.value = 0.5; o3.connect(g3).connect(lp); o3.start(t); o3.stop(end); }
    if (kind !== 'safe' && kind !== 'sub') nz(t, (kind === 'pick' ? 0.2 : 0.1) * v, 0.012, 'bandpass', kind === 'pick' ? 1800 : 900, 0.8, d);   // finger / pick noise
  }

  /* ---------------- chord instruments ---------------- */
  // FM electric piano: a 1:1 pair for the body (the modulation dies away, so the tone mellows as it rings) and a 14:1 'tine'
  function ep(t, midi, dur, v, dest){
    const x = c(), f = hz(midi); v = v == null ? 0.7 : v;
    const dec = 0.5 * Math.pow(262 / f, 0.4);
    const amp = held(t, dur, 0.17 * v, 0.004, dec, 0.22, 0.07); amp.connect(dest || O('keys'));
    const end = endOf(t, dur, 0.07);
    const car = x.createOscillator(); car.frequency.value = f;
    const mod = x.createOscillator(); mod.frequency.value = f; const mg = x.createGain();
    mg.gain.setValueAtTime(f * (0.5 + 1.5 * v), t); mg.gain.setTargetAtTime(f * 0.18, t, 0.22);
    mod.connect(mg).connect(car.frequency); car.connect(amp);
    const tc = x.createOscillator(); tc.frequency.value = f * 2; const tm = x.createOscillator(); tm.frequency.value = Math.min(f * 14, 9000); const tmg = x.createGain(), tg = x.createGain();
    tmg.gain.setValueAtTime(f * 2.2 * v, t); tmg.gain.setTargetAtTime(0, t, 0.045);
    tg.gain.setValueAtTime(0.22 * v, t); tg.gain.setTargetAtTime(0.04, t, 0.09);
    tm.connect(tmg).connect(tc.frequency); tc.connect(tg).connect(amp);
    for (const o of [car, mod, tc, tm]) { o.start(t); o.stop(end); }
  }
  function organWave(){
    const x = c(); let w = waves.get(x);
    if (!w) { const re = new Float32Array(10), im = new Float32Array(10); [0, 1, 0.75, 0.55, 0.28, 0, 0.2, 0, 0.14, 0].forEach((a, i) => im[i] = a); w = x.createPeriodicWave(re, im); waves.set(x, w); }
    return w;
  }
  function organ(t, midi, dur, v, dest){
    const x = c(), f = hz(midi), d = dest || O('organ'); v = v == null ? 0.7 : v;
    const amp = held(t, dur, 0.085 * v, 0.006, 0.3, 0.9, 0.025); amp.connect(d);
    const end = endOf(t, dur, 0.025);
    const o = x.createOscillator(); o.setPeriodicWave(organWave()); o.frequency.value = f; o.connect(amp); o.start(t); o.stop(end);
    const sub = x.createOscillator(); sub.frequency.value = f / 2; const sg = x.createGain(); sg.gain.value = 0.5; sub.connect(sg).connect(amp); sub.start(t); sub.stop(end);
    nz(t, 0.05 * v, 0.008, 'bandpass', 2200, 1, d);                                        // key click
  }
  function pad(t, midi, dur, v, kind, dest){
    const x = c(), f = hz(midi), d = dest || O('pad'); v = v == null ? 0.6 : v;
    const safe = kind === 'safe' || leaky();
    if (safe) dur = Math.max(0.15, dur - 0.16);            // out of the way before the next chord is judged
    const [att, rel, fc, pk] = safe ? [0.3, 0.25, 900, 0.12] : kind === 'strings' ? [0.16, 0.3, 2600, 0.034] : kind === 'saw' ? [0.02, 0.12, 3600, 0.06] : [0.12, 0.3, 1300, 0.042];
    const amp = held(t, dur, pk * v, att, 0.6, 0.85, rel / 3);
    const lp = x.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = fc; lp.Q.value = 0.6; lp.connect(amp).connect(d);
    const end = endOf(t, dur, rel / 3);
    if (safe) {       // soft and slow, nothing for an onset detector to grab
      const o = x.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(end);
      return;
    }
    for (const det of kind === 'saw' ? [-12, 0, 12] : [-8, 8]) { const o = x.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(t); o.stop(end); }
  }
  function gtr(t, notes, o){
    const x = c(); o = o || {};
    const d = o.dest || O(o.kind === 'D' ? 'gtrD' : o.kind === 'A' ? 'gtrA' : 'gtrE'), v = o.v == null ? 0.8 : o.v;
    if (o.chk) {       // the left hand lifts: a pitchless 'chk'
      for (let i = 0; i < 3; i++) nz(t + i * 0.004, 0.16 * v, 0.022, 'bandpass', 1100 + i * 700, 1.4, d);
      return;
    }
    const order = o.up ? notes.slice().reverse() : notes, gap = o.gap == null ? 0.009 : o.gap, len = o.len || 0;
    const bv = v > 0.66 ? 0.85 : 0.5;                                                       // two cached brightnesses
    order.forEach((m, i) => {
      const src = x.createBufferSource(); src.buffer = A.pluckBuffer(m, null, bv, true);
      const g = x.createGain(), ts = t + i * gap, lv = (o.kind === 'D' ? 0.3 : 0.44) * v / bv * (1 - i * 0.03);
      g.gain.setValueAtTime(lv, ts);
      src.connect(g).connect(d); src.start(ts);
      if (len) { g.gain.setTargetAtTime(0, ts + len, 0.014); src.stop(ts + len + 0.12); }
      else g.gain.setTargetAtTime(0, ts + 1.1, 0.12);
    });
  }

  /* ---------------- leads and stingers ---------------- */
  function lead(t, midi, dur, v, kind, dest){
    const x = c(), f = hz(midi), d = dest || O('lead'); v = v == null ? 0.7 : v;
    if (kind === 'mallet') {
      os(t, 'sine', f, f, 0.1, 0.2 * v, 0.32 + 0.2 * Math.min(1, dur), d); os(t, 'sine', f * 4, f * 4, 0.1, 0.07 * v, 0.07, d); os(t, 'sine', f * 9.2, f * 9.2, 0.1, 0.03 * v, 0.018, d);
      return;
    }
    if (kind === 'bell') {
      const amp = gEnv(t, 0.14 * v, 0.7 + dur * 0.5); amp.connect(d);
      const car = x.createOscillator(); car.frequency.value = f; const mod = x.createOscillator(); mod.frequency.value = f * 3.5; const mg = x.createGain();
      mg.gain.setValueAtTime(f * 1.6 * v, t); mg.gain.setTargetAtTime(f * 0.1, t, 0.18);
      mod.connect(mg).connect(car.frequency); car.connect(amp); const e = t + 1 + dur * 0.5; car.start(t); mod.start(t); car.stop(e); mod.stop(e);
      return;
    }
    if (kind === 'whistle') {
      const amp = held(t, dur, 0.09 * v, 0.03, 0.3, 0.9, 0.03); amp.connect(d);
      const o = x.createOscillator(); o.frequency.setValueAtTime(f * 0.97, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      const l = x.createOscillator(); l.frequency.value = 5.6; const lg = x.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.008, t + 0.25); l.connect(lg).connect(o.frequency);
      o.connect(amp); const e = endOf(t, dur, 0.03); o.start(t); l.start(t); o.stop(e); l.stop(e);
      nz(t, 0.012 * v, dur, 'bandpass', f * 2, 2, d, 0.03);
      return;
    }
    const cfg = { brass: ['sawtooth', 0.05, 0.018, 700, 3000, 1500, 0.2, 1.5], pluck: ['sawtooth', 0.09, 0.003, 3400, 3400, 500, 0.12, 2.5], saw: ['sawtooth', 0.055, 0.01, 2600, 3200, 2200, 0.3, 1],
      kazoo: ['sawtooth', 0.11, 0.015, 1150, 1150, 1150, 0.3, 5] }[kind] || ['square', 0.05, 0.01, 2600, 2600, 2600, 0.3, 1];
    const [type, pk, att, f0, f1, f2, ft, q] = cfg;
    const amp = held(t, dur, pk * v, att, kind === 'pluck' ? 0.12 : 0.4, kind === 'pluck' ? 0.1 : 0.85, 0.03);
    const lp = x.createBiquadFilter(); lp.type = kind === 'kazoo' ? 'bandpass' : 'lowpass'; lp.Q.value = q;
    lp.frequency.setValueAtTime(f0, t); lp.frequency.linearRampToValueAtTime(f1, t + 0.035); lp.frequency.setTargetAtTime(f2, t + 0.035, ft);
    lp.connect(amp).connect(d);
    const e = endOf(t, dur, 0.03);
    for (const det of kind === 'pluck' || kind === 'kazoo' ? [0] : [-7, 7]) { const o = x.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      if (kind === 'kazoo' || kind === 'saw') { const l = x.createOscillator(); l.frequency.value = 5.8; const lg = x.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + 0.2); l.connect(lg).connect(o.frequency); l.start(t); l.stop(e); }
      o.connect(lp); o.start(t); o.stop(e); }
  }
  // the crowd: hand claps on the beat, a sung 'whoa', a cheer
  function cclap(t, v){
    const d = O('crowd'), up = leaky() ? 1700 : 0;                                          // on speakers with the mic on: above the notes the check listens for
    for (let i = 0; i < 6; i++) nz(t + Math.random() * 0.028 - 0.006, 0.16 * v * (0.6 + Math.random() * 0.6), 0.02 + Math.random() * 0.03, 'bandpass', 1000 + up + Math.random() * 1400, 1.3, d);
    nz(t + 0.02, 0.06 * v, 0.12, 'bandpass', 1500 + up, 0.8, d);
  }
  function whoa(t, midi, dur, v){
    const x = c(), d = O('crowd'), f = hz(midi);
    const amp = held(t, dur, 0.05 * (v || 0.7), 0.14, 0.5, 0.85, 0.09); amp.connect(d);
    const f1 = x.createBiquadFilter(), f2 = x.createBiquadFilter(); f1.type = f2.type = 'bandpass'; f1.frequency.value = 520; f1.Q.value = 3.5; f2.frequency.value = 940; f2.Q.value = 4;
    const g2 = x.createGain(); g2.gain.value = 0.6; f1.connect(amp); f2.connect(g2).connect(amp);
    const e = endOf(t, dur, 0.09);
    for (const det of [-14, 5, 17]) { const o = x.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12); o.detune.value = det; o.connect(f1); o.connect(f2); o.start(t); o.stop(e); }
  }
  function cheer(t, amount, dur, dest){
    const x = c(), d = dest || O('crowd'), a = Math.max(0.1, Math.min(1, amount || 0.5)); dur = dur || 0.6 + a * 0.9;
    for (const [f, q, pk] of [[1000, 0.8, 0.1], [2400, 1, 0.055]]) {
      const src = x.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true;
      const fl = x.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
      const g = x.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk * a, t + 0.18); g.gain.setValueAtTime(pk * a, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const l = x.createOscillator(); l.frequency.value = 6 + Math.random() * 4; const lg = x.createGain(); lg.gain.value = pk * a * 0.4; l.connect(lg).connect(g.gain);
      src.connect(fl).connect(g).connect(d); src.start(t, Math.random()); src.stop(t + dur + 0.05); l.start(t); l.stop(t + dur + 0.05);
    }
  }
  function riser(t, dur, v, dest){
    const x = c(), src = x.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true;
    const f = x.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = x.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14 * (v || 1), t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    src.connect(f).connect(g).connect(dest || O('fx')); src.start(t); src.stop(t + dur + 0.06);
  }
  return { kick, snare, rim, brush, clap, tamb, shaker, cowbell, hat, ohat, ride, crash, tom, click, sticks, bass, ep, organ, pad, gtr, lead, cclap, whoa, cheer, riser,
    setKit(k){ K = Object.assign({ k: 1, kd: 1, s: 1, sd: 1, click: 1 }, k || {}); openHat = null; } };
})();
