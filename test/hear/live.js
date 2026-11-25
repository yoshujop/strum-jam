// Live end-to-end runs: the real game, sound injected into the mic chain on the audio clock.
// usage: node live.js practice|stage [key=val ...]
//   common: throttle=4 nomodel=1 leak=0.5 mic=laptop level=0.3 tempo=100 strict=normal cents=-35 (the whole guitar flat)
//   stage:  play=right|wrong|none|pattern offset=0.08 (s after the beat) pattern=D.D.D.DU cut=1 song="Chord Drill: G, C, D"
const S = require('./synth.js'), L = require('./lib.js');
const mode = process.argv[2] || 'practice', o = {};
for (const a of process.argv.slice(3)) { const [k, v] = a.split('='); o[k] = v; }
const num = (k, d) => o[k] == null ? d : +o[k];
const WRONG = { G: 'Em', C: 'Am', D: 'Dsus4', Em: 'G', Am: 'C' };
function clipOf(name, opt = {}){
  const sig = S.strum(S.CH[name], 1.9, Object.assign({ cents: num('cents', 0) }, opt));
  let y = S.room(sig, 0.25); y = S.MICS[o.mic || 'laptop'](y); return S.norm(y, num('level', 0.3));
}
(async () => {
  const init = o.nomodel ? () => { delete window.Worker; Object.defineProperty(window, 'Worker', { value: undefined, configurable: true }); } : undefined;
  const { browser, page, errs } = await L.open({ throttle: num('throttle', 1), init, noWait: !!o.nomodel });
  if (o.nomodel) await page.waitForTimeout(1500);
  const song = o.song || 'Chord Drill: G, C, D';
  await L.toSong(page, song);
  await page.evaluate(([tempo, strict, phones]) => { Settings.tempo = tempo; Settings.strict = strict; Settings.headphones = !!phones; A.hookPopups(); }, [num('tempo', 100), o.strict || 'normal', num('phones', 0)]);
  // clips are uploaded before the run starts, so nothing is scheduled late
  const labels = await page.evaluate(() => [...new Set(UI.chart.events.filter(e => !e.rest).map(e => e.label))]);
  await page.evaluate(() => { A.pre = {}; });
  const up = (n, x) => page.evaluate(([n, b]) => { A.pre[n] = b; }, [n, S.pcm16b64(x)]);
  for (const n of labels) { S.setSeed(77 + n.length * 13 + n.charCodeAt(0)); for (let k = 0; k < 3; k++) await up(n + k, clipOf(n));
    const w = WRONG[n]; if (w) await up('wrong_' + n, clipOf(w));
    await up(n + '_up', clipOf(n, { up: true, vel: 0.18 })); }
  await page.click(mode === 'practice' ? '#btn-practice' : '#btn-stage'); await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({ ready: Listen.ready, failed: Listen.failed, mic: Mic.on, tap: G.tapMode, sr: AudioEngine.ctx.sampleRate, running: G.running, mode: G.mode }));
  console.log('STATE', JSON.stringify(st));
  await page.evaluate(() => { A.inject(1); for (const k in A.pre) A.addClip(k, A.pre[k]); });
  if (o.leak) await page.evaluate(g => A.leak(g), +o.leak);
  await page.evaluate(() => { A.fr = []; A.jd = [];
    const fo = Listen.freshness.bind(Listen); Listen.freshness = (ts, m) => { const f = fo(ts, m); A.fr.push({ ts: +ts.toFixed(2), ok: f ? f.ok : null, rose: f && (f.nRose != null ? f.nRose : undefined), need: f && f.need, rise: f && +f.rise.toFixed(2) }); return f; };
    const jo = Listen.judge.bind(Listen); Listen.judge = (h, m, mode) => { const r = jo(h, m, mode); A.jd.push({ ok: r.ok, miss: r.missing.join(','), wrong: r.wrongNotes.join(',') }); return r; }; });

  if (mode === 'practice') {
    const n = num('n', 12), play = o.play || 'right';
    const res = await page.evaluate(async ([n, play]) => {
      const ctx = AudioEngine.ctx, out = [], sleep = ms => new Promise(r => setTimeout(r, ms));
      const frame = () => new Promise(r => requestAnimationFrame(r));
      await sleep(1500);
      for (let i = 0; i < n; i++) {
        const ev = G.cur(); if (!ev || !G.running) break;
        const key = G.idx + '|' + G.laps, name = play === 'wrong' ? 'wrong_' + ev.label : ev.label + (i % 3);
        const ts = A.play(name, ctx.currentTime + 0.25);
        let got = null, firstGreen = null; const t0 = performance.now();
        while (performance.now() - t0 < 4000) { await frame(); const now = ctx.currentTime;
          if (firstGreen == null && G.fb && G.fb.states.includes('heard')) firstGreen = now - ts;
          if (G.idx + '|' + G.laps !== key || !G.running) { got = now - ts; break; } }
        const lr = G.lastR; out.push({ dbg: got == null ? { strums: Listen.strums.filter(t => t > ts - 0.3).map(t => +(t - ts).toFixed(2)), deaf: +(Mic.deafUntil - ts).toFixed(2), cs: +(G.chordStart - ts).toFixed(2), lr: lr && { ok: lr.ok, miss: lr.missing, wrong: lr.wrongNotes, fr: lr.freshDsp && { ok: lr.freshDsp.ok, rose: lr.freshDsp.rose, need: lr.freshDsp.need, rise: +lr.freshDsp.rise.toFixed(2) } } } : undefined, label: ev.label, lat: got == null ? null : +got.toFixed(3), green: firstGreen == null ? null : +firstGreen.toFixed(3), ms: Math.round(Listen.ms), lag: +(ctx.currentTime - Listen.reliableT).toFixed(3) });
        await sleep(play === 'wrong' ? 300 : 2300);       // let the chord die away before the next one
      }
      return out;
    }, [n, play]);
    const lats = res.filter(r => r.lat != null).map(r => r.lat).sort((a, b) => a - b);
    console.log('PRACTICE', play, 'accepted', lats.length + '/' + res.length, 'latency s median', lats[lats.length >> 1], 'min', lats[0], 'max', lats[lats.length - 1]);
    console.log(JSON.stringify(res));
    if (o.cents) console.log('TUNING played', o.cents, 'cents; Hear.tuning()', JSON.stringify(await page.evaluate(() => typeof Hear !== 'undefined' ? Hear.tuning() : null)));
  } else {
    const play = o.play || 'right', off = num('offset', 0.08);
    const info = await page.evaluate(() => ({ lead: G.list[0].t - AudioEngine.ctx.currentTime, list: G.list.map(e => ({ label: e.label, t: e.t, beat: e.beat })), beatDur: Groove.cfg.beatDur, start: Groove.cfg.startTime, now: AudioEngine.ctx.currentTime, beats: G.chart.beats, strum: G.chart.song.strum || '' }));
    const sched = []; if (info.lead < 0.4) console.log('WARNING: first event only', info.lead.toFixed(2), 's away when scheduling');
    info.list.forEach((e, i) => {
      const next = info.list[i + 1], gap = next ? next.t - e.t : info.beats * info.beatDur;
      if (play === 'none') return;
      if (play === 'pattern') {
        const pat = (o.pattern || info.strum || 'D.D.D.DU').split(''), step = info.beats * info.beatDur / pat.length, nb = Math.max(1, Math.round(gap / (info.beats * info.beatDur)));
        for (let b = 0; b < nb; b++) pat.forEach((c, k) => { if (c === '.') return; let nx = step; for (let j = k + 1; j < pat.length && pat[j] === '.'; j++) nx += step;
          sched.push({ name: c === 'U' ? e.label + '_up' : e.label + (k % 3), t: e.t + b * info.beats * info.beatDur + k * step + off, dur: o.cut === '0' ? 0 : nx + 0.02, gain: k === 0 ? 1 : 0.8 }); });
      } else sched.push({ name: play === 'wrong' ? 'wrong_' + e.label : e.label + (i % 3), t: e.t + off, dur: 0, gain: 1 });
    });
    await page.evaluate(sched => { for (const s of sched) A.play(s.name, s.t, s.gain, s.dur); A.t0 = performance.now(); A.frames = 0; A.maxGap = 0; let last = performance.now(); const f = () => { const n = performance.now(); A.frames++; A.maxGap = Math.max(A.maxGap, n - last); if (n - last > 50) A.jank = (A.jank || 0) + 1; last = n; requestAnimationFrame(f); }; requestAnimationFrame(f);
      A.lagS = []; setInterval(() => { if (Listen.ready) A.lagS.push(AudioEngine.ctx.currentTime - Listen.reliableT); }, 250); }, sched);
    const dur = info.list[info.list.length - 1].t - info.now + 3.5;
    for (let w = 0; w < dur; w += 1) { await page.waitForTimeout(1000); if (await page.evaluate(() => G.failed || !G.running && G.list.every(e => e.final))) { await page.waitForTimeout(600); break; } }
    const res = await page.evaluate(() => ({ list: G.list.map(e => ({ l: e.label, t: +e.t.toFixed(3), timing: e.timing, r: e.result || null, ok: e.earOk, n: e.earN, dOn: e.onsetT != null ? +(e.onsetT - e.t).toFixed(3) : null, heard: e.heard ? e.heard.size + '/' + e.notes.length : '' })),
      counts: G.counts, score: G.score, failed: G.failed, strums: Listen.strums.length, pops: A.log, ms: Math.round(Listen.ms), fps: Math.round(A.frames / ((performance.now() - A.t0) / 1000)), maxGap: Math.round(A.maxGap), jank: A.jank || 0,
      lag: A.lagS.length ? { med: +A.lagS.slice().sort((a, b) => a - b)[A.lagS.length >> 1].toFixed(3), max: +Math.max(...A.lagS).toFixed(3) } : null, ready: Listen.ready }));
    const judged = res.list.filter(e => e.r), hits = judged.filter(e => e.r === 'hit');
    // feedback delay: first judgement popup after each event's beat
    const fb = []; for (const e of res.list) { const p = res.pops.find(p => p.t > e.t - 0.2 && p.t < e.t + 3 && /PERFECT|GREAT|GOOD|EARLY|LATE|MISS|WRONG|CHECK/.test(p.pop)); if (p) fb.push(+(p.t - e.t - off).toFixed(2)); }
    fb.sort((a, b) => a - b);
    console.log('STAGE', JSON.stringify(o), 'events', res.list.length, 'judged', judged.length, 'HIT', hits.length, 'counts', JSON.stringify(res.counts), 'score', res.score, 'failed', res.failed, 'strumsDetected', res.strums, 'scheduled', sched.length);
    console.log('  model ms/look', res.ms, 'reliableT lag', JSON.stringify(res.lag), 'fps', res.fps, 'maxFrameGap ms', res.maxGap, 'frames>50ms', res.jank);
    console.log('  feedback delay after the strum (s): median', fb[fb.length >> 1], 'min', fb[0], 'max', fb[fb.length - 1]);
    console.log('  ' + res.list.map(e => `${e.l}:${e.r || '-'}/${e.timing || '-'}/ok${e.ok}/${e.n}${e.dOn != null ? '/d' + e.dOn : ''}/${e.heard}`).join(' '));
    if (o.dbg) console.log('  DBG', JSON.stringify(await page.evaluate(() => A.fr.map((f, i) => Object.assign({}, f, A.jd[i])))));
    const pc = {}; res.pops.forEach(p => pc[p.pop] = (pc[p.pop] || 0) + 1); console.log('  popups', JSON.stringify(pc));
  }
  if (errs.length) console.log('ERR', errs.slice(0, 5).join(' | '));
  await browser.close();
})();
