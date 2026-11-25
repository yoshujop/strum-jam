// Bass / Piano / Drums / Vocals through real (synthetic) audio into the mic chain, on the audio clock.
// usage: node parts.js inst=piano|bass|drums|vocals play=right|wrong|none|flat|octave|speech|mono [offset=0.08] [leak=0.5] [mic=clean] [nomodel=1] [guide=1] [throttle=N] [tempo=100]
const S = require('./synth.js'), L = require('./lib.js');
const o = {}; for (const a of process.argv.slice(2)) { const [k, v] = a.split('='); o[k] = v; }
const inst = o.inst || 'piano', play = o.play || 'right', off = o.offset == null ? 0.08 : +o.offset;
const fin = x => S.norm(S.MICS[o.mic || 'clean'](S.room(x, 0.2)), +(o.level || 0.3));
(async () => {
  const init = o.nomodel ? () => { Object.defineProperty(window, 'Worker', { value: undefined, configurable: true }); } : undefined;
  const { browser, page, errs } = await L.open({ throttle: +(o.throttle || 1), init, noWait: !!o.nomodel });
  await page.click('#btn-start', { force: true }); await page.waitForTimeout(1200);
  await page.evaluate(([inst, tempo]) => { Settings.inst = inst; Settings.tuneFirst = false; Settings.tempo = tempo; A.hookPopups(); }, [inst, +(o.tempo || 100)]);
  await page.click('#btn-play', { force: true }).catch(() => {}); await page.waitForTimeout(700);
  await page.click('text=Chord Drill: G, C, D'); await page.waitForTimeout(1500);
  if (inst === 'vocals') await page.evaluate(guide => {
    const ch = UI.chart, spb = 60 / ch.bpm, lines = [], mel = [];
    for (const e of ch.events) { if (e.rest) continue; const pcs = chordPcs(parseChord(e.sounds));
      lines.push({ t0: e.beat * spb, t1: (e.beat + e.len) * spb - 0.1, text: 'la la la la la la' });
      const n = Math.max(1, Math.round(e.len / 2)); for (let k = 0; k < n; k++) mel.push({ t0: (e.beat + k * 2) * spb, t1: (e.beat + k * 2 + 1.6) * spb, m: 60 + pcs[k % pcs.length] }); }
    UI.vox = { lines, map: { pts: [[0, 0]], spb, nudge: 0 }, melody: guide ? null : mel };
  }, !!o.guide);
  // the part's targets, built ahead of the run so every clip is uploaded before the count-in starts
  const pre = await page.evaluate(inst => { const ch = UI.chart, tb = ch.totalBeats; A.inject0 = 1;
    const ts = inst === 'piano' ? Parts.pianoTargets(ch, 0, tb) : inst === 'bass' ? Parts.bassTargets(ch, 0, tb) : inst === 'drums' ? Parts.drumTargets(ch, 0, ch.totalBars) : Parts.vocalTargets(ch, UI.vox, 0, tb).targets;
    return { bpm: ch.bpm, ts: ts.map(t => ({ m: t.m, keys: t.keys, pcs: t.pcs, lane: t.lane, len: t.b1 != null ? t.b1 - t.b0 : 0 })) }; }, inst);
  const spb = 60 / (pre.bpm * (+(o.tempo || 100)) / 100);
  const keyOf = t => inst === 'piano' ? 'p' + t.keys.join('_') : inst === 'bass' ? 'b' + t.m + '_' + t.len : inst === 'drums' ? 'd' + t.lane : 'v' + (t.m != null ? t.m : t.pcs[0]) + '_' + t.len;
  const made = new Set(); let k = 0;
  for (const t of pre.ts) {
    const key = keyOf(t); if (made.has(key) || play === 'none') continue; made.add(key);
    S.setSeed(300 + 7 * k++);
    const dur = Math.min(1.6, Math.max(0.25, t.len * spb - 0.05));
    let sig = null;
    if (inst === 'piano') sig = S.pianoChord((t.keys || []).map(m => m + (play === 'wrong' ? 2 : play === 'octave' ? 12 : 0)), Math.max(dur, 1.0));
    else if (inst === 'bass') sig = S.bass(t.m + (play === 'wrong' ? 3 : play === 'octave' ? 12 : 0), dur, 0.4);
    else if (inst === 'drums') sig = S.drum[t.lane]();
    else if (inst === 'vocals') {
      if (play === 'speech') sig = S.speech(dur);
      else if (play === 'mono') sig = S.voice(57, dur);
      else { const m = t.m != null ? t.m : 60 + t.pcs[0]; sig = S.voice(m + (play === 'flat' ? -1 : play === 'octave' ? -12 : play === 'tritone' ? 6 : 0), dur); }
    }
    await page.evaluate(([n, b]) => { A.pre = A.pre || {}; A.pre[n] = b; }, [key, S.pcm16b64(fin(sig))]);
  }
  await page.click('#btn-stage', { force: true }); await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({ ready: Listen.ready, mic: Mic.on, parts: Parts.active, inst: Parts.inst, n: Parts.targets.length, running: G.running, guide: Parts.guide }));
  console.log('STATE', JSON.stringify(st));
  if (!st.parts) { console.log('part did not start', errs.join('|')); await browser.close(); return; }
  const info = await page.evaluate(([leak, off, play]) => { A.inject(1); if (leak) A.leak(leak);
    const keyOf = t => Parts.inst === 'piano' ? 'p' + t.keys.join('_') : Parts.inst === 'bass' ? 'b' + t.m + '_' + (t.b1 - t.b0) : Parts.inst === 'drums' ? 'd' + t.lane : 'v' + (t.m != null ? t.m : t.pcs[0]) + '_' + (t.b1 - t.b0);
    let n = 0, missing = 0; for (const k in (A.pre || {})) A.addClip(k, A.pre[k]);
    if (play !== 'none') for (const t of Parts.targets) { const k = keyOf(t); if (!A.clips[k]) { missing++; continue; } A.play(k, t.t0 + off); n++; }
    return { n, missing, lead: Parts.targets[0].t0 - AudioEngine.ctx.currentTime, now0: AudioEngine.ctx.currentTime, tg: Parts.targets.map(t => ({ t0: t.t0, t1: t.t1 })) }; }, [+(o.leak || 0), off, play]);
  if (info.lead < 0.3 || info.missing) console.log('WARNING lead', info.lead.toFixed(2), 'missing clips', info.missing);
  const tg = info.tg, now0 = info.now0, sched = { length: info.n };
  const end = tg[tg.length - 1].t1 - now0 + 2.5;
  await page.evaluate(() => { A.lagS = []; setInterval(() => { if (Listen.ready) A.lagS.push(AudioEngine.ctx.currentTime - Listen.reliableT); }, 250); });
  for (let w = 0; w < end; w += 1) { await page.waitForTimeout(1000); if (await page.evaluate(() => G.failed || UI.screen === 'results')) break; }
  await page.waitForTimeout(500);
  const res = await page.evaluate(() => ({ counts: G.counts, score: G.score, failed: G.failed, screen: UI.screen, grade: (document.getElementById('res-grade') || {}).textContent, ms: Math.round(Listen.ms), strums: Listen.strums.length, micOnsets: Mic.onsets.length,
    lag: A.lagS && A.lagS.length ? +A.lagS.slice().sort((a, b) => a - b)[A.lagS.length >> 1].toFixed(2) : null, pops: A.log.map(p => p.pop) }));
  const pc = {}; res.pops.forEach(p => pc[p] = (pc[p] || 0) + 1);
  console.log('PARTS', JSON.stringify(o), 'targets', tg.length, 'played', sched.length, 'counts', JSON.stringify(res.counts), 'score', res.score, 'failed', res.failed, 'grade', res.grade, '| model ms', res.ms, 'reliableT lag', res.lag, 'Listen strums', res.strums, 'Mic onsets', res.micOnsets);
  console.log('  popups', JSON.stringify(pc));
  if (errs.length) console.log('ERR', errs.slice(0, 4).join('|'));
  await browser.close();
})();
