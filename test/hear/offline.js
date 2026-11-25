// Offline accuracy matrix: synthetic chords through the game's own Listen.findStrums / heard / judge / freshness
// (and the fast onset detector), one clip at a time, no real-time pressure.
// usage: node test/hear/offline.js [quick|e1|e2|e3] [out.json]
//   quick  26 chords x laptop + phone mics, each judged against all 26 chords, plus non-guitar sounds (about 4 min)
//   e2     the audit's full matrix (26 chords x 3 mics x 2 takes + near-miss fingerings, about 10 min)
//   e1     robustness conditions (6 chords each)        e3  non-guitar sounds
const S = require('./synth.js'), L = require('./lib.js'), fs = require('fs');
const which = process.argv[2] || 'quick', outFile = process.argv[3] || '';
const SR = S.SR, LEAD = 1.0, DUR = 2.7;
function clip(sig, o = {}){
  // sig: Float32Array starting at the strum. lead-in of silence, room, mic, level, noise
  const x = new Float32Array(Math.round(DUR * SR)); S.mix(x, sig, Math.round(LEAD * SR));
  let y = o.room === 0 ? x : S.room(x, o.room == null ? 0.25 : o.room);
  y = S.MICS[o.mic || 'clean'](y);
  y = S.norm(y, o.level == null ? 0.3 : o.level);
  if (o.mic === 'clipped') y = S.MICS.clipped(y);
  return S.addNoise(y, o.noise == null ? 0.002 : o.noise);
}
const CH = S.CH, names = Object.keys(CH);
const cases = [];
if (which === 'e1') {
  const chords = (process.env.CHORDS || 'G,C,D,Em,Am,F').split(',');
  const conds = {
    clean: {}, ks: { s: { synth: 'ks' } }, nylon: { s: { nylon: true } },
    laptop: { c: { mic: 'laptop', noise: 0.003 } }, phone: { c: { mic: 'phone', noise: 0.006 } }, bluetooth: { c: { mic: 'bluetooth', noise: 0.004 } },
    quiet_p02: { c: { level: 0.02, noise: 0.002, mic: 'laptop' } }, quiet_p006: { c: { level: 0.006, noise: 0.002, mic: 'laptop' } },
    loud_clip: { c: { mic: 'clipped', level: 0.9 } }, noisy_room: { c: { mic: 'laptop', noise: 0.02, level: 0.2 } },
    flat20: { s: { cents: -20 } }, sharp20: { s: { cents: 20 } }, flat35: { s: { cents: -35 } }, sharp35: { s: { cents: 35 } }, flat50: { s: { cents: -50 } },
    onestring_flat30: { s: { stringCents: [0, 0, -30, 0, 0, 0] } },
    slow40: { s: { spread: 0.04 } }, slow90: { s: { spread: 0.09 } }, slow180: { s: { spread: 0.18 } },
    upstroke_top4: { s: { up: true }, top: 4 }, top3only: { top: 3 }, no_bass_string: { dropLow: 1 },
    one_muted_mid: { s: { mute: [2] } }, one_muted_top: { s: { mute: ['last'] } },
    soft_pick: { s: { vel: 0.08 }, c: { level: 0.06, mic: 'laptop' } },
    capo2: { shift: 2 }, capo5: { shift: 5 }, halfstep_down: { shift: -1 },
  };
  for (const cn in conds) for (const ch of chords) for (let rep = 0; rep < 1; rep++) cases.push({ group: cn, played: ch, rep, cond: conds[cn], targets: [ch] });
} else if (which === 'e2') {
  for (const mic of [['clean', 0.002], ['laptop', 0.003], ['phone', 0.006]]) for (const ch of names) for (let rep = 0; rep < 2; rep++) cases.push({ group: mic[0], played: ch, rep, cond: { c: { mic: mic[0], noise: mic[1] } }, targets: names });
  // near-miss fingerings of the three drill chords
  const near = { 'G_string5_fret+1': ['G', [43, 48, 50, 55, 59, 67]], 'G_open_all': ['G', [40, 45, 50, 55, 59, 64]], 'G_single_note': ['G', [55]], 'G_two_notes': ['G', [59, 67]], 'G_low3': ['G', [43, 47, 50]], 'G_whole_step_up': ['G', CH.G.map(m => m + 2)],
    'C_with_lowE': ['C', [40, 48, 52, 55, 60, 64]], 'C_finger_off_B': ['C', [48, 52, 55, 59, 64]], 'D_with_lowA_E': ['D', [40, 45, 50, 57, 62, 66]], 'D_with_open_A': ['D', [45, 50, 57, 62, 66]], 'Am_with_lowE': ['Am', [40, 45, 52, 57, 60, 64]],
    'F_easy_open_e': ['F', [53, 57, 60, 64]], 'A_one_fret_low': ['A', [45, 52, 56, 60, 64]], 'Em_one_finger': ['Em', [40, 47, 50, 55, 59, 64]] };
  for (const k in near) for (let rep = 0; rep < 2; rep++) cases.push({ group: 'near', id: k, played: near[k][1], rep, cond: { c: { mic: 'laptop', noise: 0.003 } }, targets: [near[k][0]] });
}
if (which === 'quick') for (const mic of [['laptop', 0.003], ['phone', 0.006]]) for (const ch of names) cases.push({ group: mic[0], played: ch, rep: 0, cond: { c: { mic: mic[0], noise: mic[1] } }, targets: names });
if (which === 'e3' || which === 'quick') {
  const sounds = {
    silence: () => new Float32Array(10), speech: () => S.speech(1.6), claps: () => { const x = new Float32Array(SR * 1.5); for (let k = 0; k < 3; k++) S.mix(x, S.drum.clap(), Math.round(k * 0.4 * SR)); return x; },
    chk_muted_strum: () => S.chk(0.5), body_knock: () => S.drum.kick(), snare: () => S.drum.snare(), hat: () => S.drum.hat(),
    sung_G3: () => S.voice(55, 1.5), sung_D4: () => S.voice(62, 1.5), hum_G2: () => S.voice(43, 1.5, { formants: [[300, 3, 10]] }), whistle_G5: () => { const n = SR * 1.5, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(2 * Math.PI * 784 * i / SR) * Math.min(1, i / 2000); return x; },
    piano_G_chord: () => S.pianoChord([55, 59, 62], 1.6), single_G3: () => S.strum([55], 1.6), open_strings: () => S.strum([40, 45, 50, 55, 59, 64], 1.6),
  };
  for (const k in sounds) for (let rep = 0; rep < (which === 'quick' ? 1 : 3); rep++) cases.push({ group: 'sound', id: k, sig: sounds[k], rep, cond: { c: { mic: 'laptop', noise: 0.003 } }, targets: ['G', 'C', 'D', 'Em', 'Am'] });
}
(async () => {
  const { browser, page, errs } = await L.open();
  const T = {}; for (const n of names) T[n] = CH[n];
  const out = []; let k = 0; const t0 = Date.now();
  for (const c of cases) {
    S.setSeed(1000 + 37 * k++);
    let midis = typeof c.played === 'string' ? CH[c.played].slice() : c.played, tg = {};
    const cond = c.cond || {}, so = Object.assign({}, cond.s || {});
    let tmid = c.targets.map(n => [n, CH[n].slice()]);
    if (cond.shift) { midis = midis.map(m => m + cond.shift); tmid = tmid.map(([n, ms]) => [n, ms.map(m => m + cond.shift)]); }
    if (so.mute && so.mute[0] === 'last') so.mute = [midis.length - 1];
    let pm = midis; if (cond.top) pm = midis.slice(-cond.top); if (cond.dropLow) pm = midis.slice(cond.dropLow);
    const sig = c.sig ? c.sig() : S.strum(pm, 1.65, so);
    const b64 = S.pcm16b64(clip(sig, cond.c || {}));
    tmid.forEach(([n, ms]) => tg[n] = ms);
    const r = await page.evaluate(async ([b64, tg, at]) => { const l = await A.load(b64); const j = A.judgeAt(at, tg, ['relaxed', 'normal', 'strict'], { detail: Object.keys(tg).length === 1 }); return { strums: l.strums, j }; }, [b64, tg, LEAD]);
    out.push({ group: c.group, id: c.id || c.played, rep: c.rep, played: c.played, strums: r.strums.map(t => +t.toFixed(3)), ts: r.j.ts, tgt: r.j.tgt });
    if (k % 20 === 0) console.error(k + '/' + cases.length, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out));
  await browser.close();
  // ---- summary (normal strictness): p = the Practice rule, s = the Stage rule ----
  const chordRows = out.filter(c => typeof c.played === 'string' && Object.keys(c.tgt).length > 1);
  if (chordRows.length) {
    let one = 0, none = 0, multi = 0; const errT = [];
    for (const c of chordRows) { const near = c.strums.filter(t => Math.abs(t - LEAD) < 0.25); if (!near.length) none++; else if (c.strums.filter(t => t > 0.8).length > 1) multi++; else one++; if (near.length) errT.push((near[0] - LEAD) * 1000); }
    errT.sort((a, b) => a - b);
    console.log(`strums over ${chordRows.length} clips: exactly one ${one}, none ${none}, extra ${multi}; strum time error ms: min ${errT[0].toFixed(0)} median ${errT[errT.length >> 1].toFixed(0)} max ${errT[errT.length - 1].toFixed(0)}`);
    for (const grp of [...new Set(chordRows.map(c => c.group))]) for (const rule of ['p', 's']) {
      let tp = 0, tpn = 0, fp = 0, fpn = 0; const fps = [], miss = [];
      for (const c of chordRows.filter(c => c.group === grp)) for (const t in c.tgt) { const r = c.tgt[t].normal; if (t === c.id) { tpn++; if (r[rule]) tp++; else miss.push(c.id + (r.noStrum ? '(no strum)' : `(miss[${r[rule + 'Miss']}] wrong[${r[rule + 'Wrong']}] fresh ${r[rule + 'Fresh']})`)); } else { fpn++; if (r[rule]) { fp++; fps.push(t + '<-' + c.id); } } }
      console.log(`[${grp}] ${rule === 'p' ? 'Practice rule' : 'Stage rule   '}: right chord accepted ${tp}/${tpn} (${(100 * tp / tpn).toFixed(0)}%), wrong chord accepted ${fp}/${fpn} (${(100 * fp / fpn).toFixed(2)}%)` + (miss.length ? '  rejected right: ' + miss.join(' ') : '') + (fps.length ? '  false accepts (target<-played): ' + fps.join(' ') : ''));
    }
  }
  const snd = out.filter(c => c.group === 'sound');
  if (snd.length) { const m = {}; for (const c of snd) { const e = m[c.id] = m[c.id] || { n: 0, strum: 0, acc: 0 }; e.n++; if (c.strums.some(t => t > 0.8)) e.strum++; if (Object.values(c.tgt).some(t => t.normal.p || t.normal.s)) e.acc++; }
    console.log('non-guitar sounds, clips with a strum reported / accepted as a chord: ' + Object.entries(m).map(([k, e]) => `${k} ${e.strum}/${e.n} acc ${e.acc}`).join(', ')); }
  const cond = out.filter(c => c.group !== 'sound' && c.group !== 'near' && Object.keys(c.tgt).length === 1);
  if (cond.length) { const m = {}; for (const c of cond) { const e = m[c.group] = m[c.group] || { n: 0, p: 0, s: 0 }; const r = Object.values(c.tgt)[0].normal; e.n++; if (r.p) e.p++; if (r.s) e.s++; }
    console.log('conditions (practice/stage of n): ' + Object.entries(m).map(([k, e]) => `${k} ${e.p}/${e.s}/${e.n}`).join(', ')); }
  const near = out.filter(c => c.group === 'near');
  if (near.length) { const m = {}; for (const c of near) (m[c.id] = m[c.id] || []).push(Object.values(c.tgt)[0].normal.p ? 'ACCEPT' : 'reject'); console.log('near-miss fingerings: ' + JSON.stringify(m)); }
  console.log('done', cases.length, 'page errors:', errs.join('|') || 'none');
})();
