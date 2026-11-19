// HearCore under Node (no browser): the fast onset detector, the resampler and the tuning estimate on synthetic audio.
// usage: node test/hear/core.js          (prints a table; exit code 1 if a budget is broken)
const path = require('path'), S = require('./synth.js');
const { HearCore } = require(path.join(__dirname, '../../src/42-hearcore.js'));
const SR = 48000, q = (a, f) => { const z = a.slice().sort((x, y) => x - y); return z.length ? z[Math.min(z.length - 1, Math.floor(z.length * f))] : NaN; };
const fin = (sig, mic = 'laptop', level = 0.3, noise = 0.003) => S.addNoise(S.norm(S.MICS[mic](S.room(sig, 0.25)), level), noise);
const place = (sigs, dur) => { const x = new Float32Array(Math.round(dur * SR)); for (const [t, s, g] of sigs) S.mix(x, s, Math.round(t * SR), g || 1); return x; };
// run the detector the way the worklet does: 128-sample blocks; `emit` = the frame at which the event came out
function detect(x, o){ const ev = []; let cur = 0; const d = new HearCore.OnsetDetector(SR, Object.assign({ onOnset: e => ev.push(Object.assign({ emit: cur }, e)) }, o || {})); for (let i = 0; i < x.length; i += 128) { cur = i + 128; d.push(x.subarray(i, Math.min(x.length, i + 128)), i); } return ev; }
// score events against true onset times: hits within tol, timing error, extras
function score(ev, truth, tol = 0.05){
  const used = new Set(), err = [], lat = []; let hit = 0;
  for (const t of truth) { let b = -1, bd = tol; ev.forEach((e, i) => { const d = Math.abs(e.f / SR - t); if (!used.has(i) && d < bd) { bd = d; b = i; } }); if (b >= 0) { used.add(b); hit++; err.push((ev[b].f / SR - t) * 1000); lat.push((ev[b].emit / SR - t) * 1000); } }
  return { hit, n: truth.length, extra: ev.length - used.size, err, lat };
}
const rows = [], fails = [];
const row = (name, val, budget, ok) => { rows.push([name, val, budget || '']); if (ok === false) fails.push(name); };

// 1. single strums, 26 chords x 3 mics
{ const all = { hit: 0, n: 0, extra: 0, err: [], lat: [] }; let k = 0;
  for (const ch of Object.keys(S.CH)) { S.setSeed(100 + 13 * k++); const raw = place([[1, S.strum(S.CH[ch], 1.2)]], 2.4); for (const mic of ['clean', 'laptop', 'phone']) { const r = score(detect(fin(raw, mic)), [1]); all.hit += r.hit; all.n += r.n; all.extra += r.extra; all.err.push(...r.err); all.lat.push(...r.lat); } }
  row('single strum detected (26 chords x 3 mics)', `${all.hit}/${all.n}, extra ${all.extra}`, '>= 97%, extra <= 3', all.hit >= all.n * 0.97 && all.extra <= 3);
  row('  onset time error ms (median / p5 / p95)', `${q(all.err, 0.5).toFixed(1)} / ${q(all.err, 0.05).toFixed(1)} / ${q(all.err, 0.95).toFixed(1)}`, '|median| <= 8', Math.abs(q(all.err, 0.5)) <= 8);
  row('  sound -> event, algorithmic ms (median / max)', `${q(all.lat, 0.5).toFixed(1)} / ${q(all.lat, 1).toFixed(1)}`, 'max <= 40', q(all.lat, 1) <= 40);
}
// 2. hard single strums
{ const cases = { 'slow strum 180 ms': () => S.strum(S.CH.G, 1.5, { spread: 0.18 }), 'upstroke top 4': () => S.strum(S.CH.G.slice(-4), 1.5, { up: true, vel: 0.18 }), 'nylon': () => S.strum(S.CH.C, 1.5, { nylon: true }), 'karplus': () => S.strum(S.CH.D, 1.5, { synth: 'ks' }) };
  for (const n in cases) { let hit = 0, extra = 0; for (let k = 0; k < 6; k++) { S.setSeed(900 + k * 7); const r = score(detect(fin(place([[1, cases[n]()]], 2.8))), [1]); hit += r.hit; extra += r.extra; } row('single: ' + n, `${hit}/6, extra ${extra}`, '', undefined); }
  let hit = 0, extra = 0; for (let k = 0; k < 6; k++) { S.setSeed(950 + k * 7); const r = score(detect(fin(place([[1, S.strum(S.CH.G, 1.5)]], 2.8), 'laptop', 0.02, 0.002)), [1]); hit += r.hit; extra += r.extra; }
  row('single: quiet (peak 0.02, noise 0.002)', `${hit}/6, extra ${extra}`, '', undefined);
}
// 3. continuous strumming D-DU-UDU with chord changes, each strum cut by the next
const POOL = {};
function pooled(ch, up, k){ const key = ch + (up ? 'u' : 'd') + (k % 2); if (!POOL[key]) { S.setSeed(1234 + key.length * 7 + key.charCodeAt(0) * 31 + (k % 2) * 5 + (up ? 3 : 0)); POOL[key] = up ? S.strum(S.CH[ch].slice(-4), 1.0, { up: true, vel: 0.18 }) : S.strum(S.CH[ch], 1.0); } return POOL[key]; }
function pattern(bpm, bars = 6, mic = 'laptop'){
  const bd = 60 / bpm, pat = 'D.DU.UDU', sg = [], truth = [];
  for (let bar = 0; bar < bars; bar++) { const ch = ['G', 'C', 'D', 'Em', 'Am', 'G'][bar % 6];
    pat.split('').forEach((c, k) => { if (c === '.') return; const t = 1 + bar * 4 * bd + k * bd / 2; truth.push(t); let nx = 1; for (let j = k + 1; j < 8 && pat[j] === '.'; j++) nx++;
      const s = pooled(ch, c === 'U', k); sg.push([t, s.subarray(0, Math.round((nx * bd / 2 + 0.02) * SR)), k === 0 ? 1 : 0.8]); }); }
  return { x: fin(place(sg, 2.5 + bars * 4 * bd), mic), truth };
}
for (const bpm of [80, 100, 120, 140]) { const all = { hit: 0, n: 0, extra: 0, err: [] };
  for (const [i, mic] of ['clean', 'laptop', 'phone'].entries()) { S.setSeed(40 + bpm + i); const p = pattern(bpm, 6, mic), r = score(detect(p.x), p.truth); all.hit += r.hit; all.n += r.n; all.extra += r.extra; all.err.push(...r.err); }
  row(`D-DU-UDU at ${bpm} bpm, 3 mics: strums detected`, `${all.hit}/${all.n} (${(100 * all.hit / all.n).toFixed(0)}%), extra ${all.extra}, err median ${q(all.err, 0.5).toFixed(0)} ms p95 ${q(all.err, 0.95).toFixed(0)}`, '>= 90%', all.hit >= all.n * 0.9);
}
// 4. false alarms: room noise, hum, a chord left ringing
{ S.setSeed(7); const dur = 30;
  const noise = S.addNoise(new Float32Array(dur * SR), 0.003); row('false onsets in 30 s of room noise', String(detect(noise).length), '<= 1', detect(noise).length <= 1);
  const loud = S.addNoise(new Float32Array(dur * SR), 0.02); row('false onsets in 30 s of loud noise + hum', String(detect(loud).length), '<= 1', detect(loud).length <= 1);
  let n = 0; for (let k = 0; k < 6; k++) { S.setSeed(70 + k); const ev = detect(fin(place([[0.5, S.strum(S.CH[['G', 'C', 'D', 'Em', 'Am', 'E'][k]], 4.5)]], 5))); n += ev.filter(e => e.f / SR > 0.6).length; }
  row('false onsets while 6 chords ring out (27 s)', String(n), '<= 1', n <= 1);
}
// 5. drums: detection, timing, and the features at the hit telling kick / snare / hat apart (nearest centroid on cen+low, as Calib does)
{ const lanes = ['kick', 'snare', 'hat'], feats = { kick: [], snare: [], hat: [] }, all = { hit: 0, n: 0, extra: 0, err: [], lat: [] };
  const beat = 60 / 140 / 2, sg = [], truth = []; S.setSeed(3);
  for (let k = 0; k < 48; k++) { const l = lanes[k % 3 === 0 ? 0 : k % 3 === 1 ? 2 : 1], t = 1 + k * beat; sg.push([t, S.drum[l](), 0.6 + 0.4 * S.rnd()]); truth.push({ t, l }); }
  const ev = detect(S.addNoise(S.norm(S.room(place(sg, 2 + 48 * beat), 0.2), 0.4), 0.003));
  const r = score(ev, truth.map(x => x.t), 0.04); row('drum hits at 140 bpm 8ths (kick/hat/snare): detected', `${r.hit}/${r.n}, extra ${r.extra}, err median ${q(r.err, 0.5).toFixed(1)} ms, event after ${q(r.lat, 0.5).toFixed(0)} ms`, '>= 95%', r.hit >= r.n * 0.95);
  for (const tr of truth) { const e = ev.find(e => Math.abs(e.f / SR - tr.t) < 0.04); if (e) feats[tr.l].push(e.feat); }
  const med = l => ({ cen: q(feats[l].map(f => f.cen), 0.5), low: q(feats[l].map(f => f.low), 0.5) });
  const cal = { kick: med('kick'), snare: med('snare'), hat: med('hat') }; let ok = 0, n = 0;
  for (const l of lanes) for (const f of feats[l]) { let best = null, bd = 1e9; for (const c of lanes) { const d = Math.abs(Math.log2(f.cen / cal[c].cen)) + Math.abs(f.low - cal[c].low) * 3; if (d < bd) { bd = d; best = c; } } n++; if (best === l) ok++; }
  row('  drum class from the onset features', `${ok}/${n}`, '>= 95%', ok >= n * 0.95);
}
// 6. what kind of sound: guitar strums vs claps / snare / speech (best effort at the onset)
{ const kinds = (mk, n) => { const c = {}; for (let k = 0; k < n; k++) { S.setSeed(500 + 11 * k); for (const e of detect(fin(place([[1, mk(k)]], 3)))) c[e.kind] = (c[e.kind] || 0) + 1; } return JSON.stringify(c); };
  const names = Object.keys(S.CH);
  row('kind: guitar strums (26)', kinds(k => S.strum(S.CH[names[k]], 1.5), 26), 'informational');
  row('kind: claps', kinds(() => S.drum.clap(), 8), 'informational'); row('kind: snare', kinds(() => S.drum.snare(), 8), 'informational');
  row('kind: speech 1.6 s', kinds(() => S.speech(1.6), 6), 'informational'); row('kind: piano chord', kinds(() => S.pianoChord([60, 64, 67], 1.5), 8), 'informational');
}
// 7. resampler: a 440 Hz tone 48k -> 22.05k keeps its level and frequency; 9 kHz+ is suppressed
{ const rs = new HearCore.Resampler(), n = 20000, ratio = SR / 22050, x = new Float32Array(Math.ceil(n * ratio) + 64), y2 = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) { x[i] = Math.sin(2 * Math.PI * 440 * i / SR); y2[i] = Math.sin(2 * Math.PI * 15000 * i / SR); }
  const y = rs.run(x, ratio, n), a = rs.run(y2, ratio, n); let e = 0, ea = 0, zc = 0; for (let i = 1000; i < n; i++) { e += y[i] * y[i]; ea += a[i] * a[i]; if (y[i - 1] < 0 && y[i] >= 0) zc++; }
  const f = zc / ((n - 1000) / 22050);
  row('resampler 48k -> 22.05k: 440 Hz level / frequency', `${Math.sqrt(2 * e / (n - 1000)).toFixed(3)} / ${f.toFixed(1)} Hz`, '1.00 +- 0.03, 440 +- 2', Math.abs(Math.sqrt(2 * e / (n - 1000)) - 1) < 0.03 && Math.abs(f - 440) < 2);
  row('resampler: 15 kHz (above Nyquist) leaks at', `${(10 * Math.log10(ea / e)).toFixed(0)} dB`, 'informational');
}
// 8. tuning: the whole guitar flat or sharp
{ const rs = new HearCore.Resampler(), errs = []; let k = 0, bad = 0; const out = [];
  for (const cents of [-50, -35, -20, 0, 20, 35]) { const got = [];
    for (const ch of ['G', 'C', 'D', 'Em']) { S.setSeed(800 + 17 * k++); const x = fin(place([[0.3, S.strum(S.CH[ch], 1.6, { cents })]], 1.6));
      const n = 22050, y = rs.run(x.subarray(0, Math.round(1.3 * SR)), SR / 22050, n), t = HearCore.tuning(y, 22050); if (t && t.conf > 0.5) { got.push(t.cents); errs.push(Math.abs(t.cents - cents)); } else bad++; }
    out.push(`${cents}: ${got.length ? q(got, 0.5).toFixed(0) : '-'}`); }
  row('tuning estimate, cents played: median heard (4 chords each)', out.join('  '), 'error <= 8 cents', q(errs, 0.9) <= 8 && bad <= 3);
  row('  tuning error cents (median / p90), no confident reading', `${q(errs, 0.5).toFixed(1)} / ${q(errs, 0.9).toFixed(1)}, ${bad}/24`, '');
}
const w = Math.max(...rows.map(r => r[0].length));
for (const r of rows) console.log(r[0].padEnd(w + 2) + String(r[1]).padEnd(58) + (r[2] ? '  [' + r[2] + ']' : '') + (fails.includes(r[0]) ? '  FAIL' : ''));
console.log(fails.length ? `\nFAILED: ${fails.length}` : '\nall budgets met');
process.exit(fails.length ? 1 : 0);
