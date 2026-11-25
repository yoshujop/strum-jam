// Capture under load, in the real game (Practice running, optional CPU throttle):
//   1. a known ramp through the mic chain: is every sample there, in order? (dropped / repeated chunks)
//   2. strums at known times: how long from the sound to the game hearing an onset, and how exact is its time?
// usage: node test/hear/capture.js [throttle=4] [secs=20] [n=40]     (HEAR_PAGE=old.html for the build before)
// exit code 1 if audio was lost, or the onset latency budget (p90 < 60 ms unthrottled) is broken
const S = require('./synth.js'), L = require('./lib.js');
const o = {}; for (const a of process.argv.slice(2)) { const [k, v] = a.split('='); o[k] = v; }
const q = (a, f) => { const z = a.slice().sort((x, y) => x - y); return z.length ? z[Math.min(z.length - 1, Math.floor(z.length * f))] : NaN; };
(async () => {
  const throttle = +(o.throttle || 1), secs = +(o.secs || 20), n = +(o.n || 40);
  const { browser, page, errs } = await L.open({ throttle });
  await L.toSong(page);
  await page.click('#btn-practice'); await page.waitForTimeout(900);
  const isNew = await page.evaluate(() => typeof Capture !== 'undefined');
  // ---- 1. ramp continuity ----
  const ramp = await page.evaluate(async ([secs, isNew]) => {
    const ctx = AudioEngine.ctx, sr = ctx.sampleRate; try { Mic.src.disconnect(); } catch (e) {}
    const N = Math.round(sr * (secs + 2)), P = 1 << 20, buf = ctx.createBuffer(1, N, sr), d = buf.getChannelData(0); for (let i = 0; i < N; i++) d[i] = ((i % P) + 1) / P;
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(Listen.node); s.connect(Mic.anSmall); s.connect(Mic.anLong);
    const ev = { chunks: 0, breaks: 0, lost: 0, mode: isNew ? Capture.mode : 'ScriptProcessor (old)' }; let prev = 0;
    // every chunk the page's ring is given must continue exactly where the last one stopped
    const see = x => { const n = x.length, first = Math.round(x[0] * P), last = Math.round(x[n - 1] * P); if (first > 0 && last > 0) { ev.chunks++; if (prev && first !== prev + 1) { ev.breaks++; ev.lost += first - prev - 1; } for (let i = 1; i < n; i++) if (Math.round(x[i] * P) !== Math.round(x[i - 1] * P) + 1) { ev.breaks++; break; } prev = last; } };
    if (isNew) { const cb = Capture.cb, a0 = cb.audio; cb.audio = (x, f0) => { see(x); a0(x, f0); }; }
    else { const sp = Listen.node, orig = sp.onaudioprocess; sp.onaudioprocess = e => { see(e.inputBuffer.getChannelData(0)); orig(e); }; }
    const g0 = isNew ? Hear.latency.capture.gaps : 0, looks0 = Listen.looks || 0;
    s.start(ctx.currentTime + 0.1);
    await new Promise(r => setTimeout(r, secs * 1000));
    try { s.stop(); } catch (e) {}
    ev.gaps = isNew ? Hear.latency.capture.gaps - g0 : null; ev.looks = (Listen.looks || 0) - looks0; ev.modelMs = Math.round(Listen.ms); ev.ready = Listen.ready;
    return ev;
  }, [secs, isNew]);
  // ---- 2. onset latency ----
  S.setSeed(5); const names = ['G', 'C', 'D', 'Em'];
  for (const nm of names) await page.evaluate(([nm, b]) => { A.pre = A.pre || {}; A.pre[nm] = b; }, [nm, S.pcm16b64(S.norm(S.MICS.laptop(S.room(S.strum(S.CH[nm], 0.45), 0.25)), 0.3))]);
  const lat = await page.evaluate(async ([n, names, isNew]) => {
    const ctx = AudioEngine.ctx; A.inject(1); for (const k in A.pre) A.addClip(k, A.pre[k]);
    const got = [], fast = []; Mic.muteUntil = 0;
    Mic.onsetListeners.add(t => got.push({ t, at: ctx.currentTime, wall: performance.now() }));
    if (isNew) Hear.onOnset(e => fast.push({ t: e.t, at: ctx.currentTime, lag: e.lag, kind: e.kind }));
    const truth = []; await new Promise(r => setTimeout(r, 600));
    const t0 = ctx.currentTime + 0.3; for (let i = 0; i < n; i++) truth.push(A.play(names[i % names.length], t0 + i * 0.5 + (i % 3) * 0.037));
    await new Promise(r => setTimeout(r, (n * 0.5 + 2.5) * 1000));
    const match = list => { const lagMs = [], errMs = []; let hit = 0; for (const ts of truth) { const e = list.find(e => Math.abs(e.t - ts) < 0.12); if (e) { hit++; lagMs.push((e.at - ts) * 1000); errMs.push((e.t - ts) * 1000); } } return { hit, n: truth.length, extra: list.length - hit, lagMs, errMs }; };
    return { game: match(got), fast: isNew ? match(fast) : null, hear: isNew ? Hear.latency : null };
  }, [n, names, isNew]);
  await browser.close();
  const d = (r, k) => `median ${q(r[k], 0.5).toFixed(0)}  p90 ${q(r[k], 0.9).toFixed(0)}  max ${q(r[k], 1).toFixed(0)}`;
  console.log(`CAPTURE ${isNew ? 'this build' : 'old build'}  throttle x${throttle}  capture: ${ramp.mode}  model ready ${ramp.ready} (${ramp.modelMs} ms/look, ${ramp.looks} looks in ${secs} s)`);
  console.log(`  ramp ${secs} s: chunks ${ramp.chunks}, breaks ${ramp.breaks}, samples lost ${ramp.lost}` + (ramp.gaps != null ? `, gaps counted by Capture + the model worker ${ramp.gaps}` : ''));
  if (lat.fast) console.log(`  Hear.onOnset:          heard ${lat.fast.hit}/${lat.fast.n} (+${lat.fast.extra} extra)  sound -> callback ms: ${d(lat.fast, 'lagMs')}   time error ms: ${d(lat.fast, 'errMs')}`);
  console.log(`  Mic.onsetListeners:    heard ${lat.game.hit}/${lat.game.n} (+${lat.game.extra} extra)  sound -> callback ms: ${lat.game.hit ? d(lat.game, 'lagMs') : '-'}   time error ms: ${lat.game.hit ? d(lat.game, 'errMs') : '-'}`);
  if (lat.hear) console.log('  Hear.latency ' + JSON.stringify(lat.hear));
  if (errs.length) console.log('  PAGE ERRORS ' + errs.slice(0, 4).join(' | '));
  const bad = [];
  if (isNew) { if (ramp.breaks || ramp.gaps) bad.push('audio lost'); if (lat.fast.hit < lat.fast.n * 0.95) bad.push('onsets missed'); if (throttle <= 1 && q(lat.fast.lagMs, 0.9) > 60) bad.push('onset latency p90 > 60 ms'); if (errs.length) bad.push('page errors'); }
  console.log(bad.length ? '  FAIL: ' + bad.join(', ') : '  ok');
  process.exit(bad.length ? 1 : 0);
})();
