// Shared Playwright helpers for the hearing tests: the built game in headless Chromium, sound injected into the mic chain.
const { chromium } = require('playwright');
// HEAR_PAGE=/path/to/another/build.html runs the same tests against that build (e.g. the build before this work)
const DIST = 'file://' + (process.env.HEAR_PAGE || require('path').join(__dirname, '../../dist/strum-jam.html'));
async function open(o = {}){
  const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
  if (o.wav) args.push('--use-file-for-fake-audio-capture=' + o.wav);
  const browser = await chromium.launch({ args });
  const page = await browser.newPage({ viewport: o.viewport || { width: 1280, height: 665 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  if (o.init) await page.addInitScript(o.init);
  const cdp = await page.context().newCDPSession(page);
  if (o.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: o.throttle });
  await page.goto(DIST);
  if (!o.noWait) for (let i = 0; i < 600; i++) { if (await page.evaluate(() => Listen.ready || !!Listen.failed)) break; await page.waitForTimeout(100); }
  await page.evaluate(() => {
    const A = window.A = {};
    A.dec = b64 => { const bin = atob(b64), n = bin.length >> 1, x = new Float32Array(n); for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v & 0x8000) v -= 0x10000; x[i] = v / 32767; } return x; };
    // run the model over a 48 kHz clip offline and load the result into Listen's own timeline + ring buffer,
    // so the game's own functions (findStrums / heard / judge / freshness) can be called on it
    A.load = async (b64) => {
      const pcm = A.dec(b64), n22 = Math.floor(pcm.length * 22050 / 48000);
      const x22 = Listen.resample(pcm, 48000, 22050, n22);
      const fr = await Listen.batch(x22);
      Listen.tl = new Map(); Listen.strums = []; Listen.lastStrumT = -9; Mic.deafUntil = 0; Listen.cal = null;
      Listen.sr = 48000; Listen.ring = pcm; Listen.ringPos = 0; Listen.ringFilled = pcm.length; Listen.lastT = pcm.length / 48000;
      // the fast onset detector over the same clip, the way the capture worklet runs it (128-sample blocks)
      if (typeof HearCore !== 'undefined') { Hear.fast = []; Listen.strumInfo = []; const det = new HearCore.OnsetDetector(48000, { onOnset: e => Hear.fast.push({ t: e.f / 48000, strength: e.strength, kind: e.kind, feat: e.feat, lag: 0 }) }); for (let i = 0; i < pcm.length; i += 128) det.push(pcm.subarray(i, Math.min(pcm.length, i + 128)), i); }
      for (let i = 0; i < fr.F; i++) { const t = (i + 0.5) * 256 / 22050, k = Math.round(t * Listen.FPS); Listen.tl.set(k, { t, edge: 99, note: fr.note.subarray(i * 88, i * 88 + 88), onset: fr.onset.subarray(i * 88, i * 88 + 88) }); }
      const dur = pcm.length / 48000;
      for (let T = 0.2; T <= dur - 0.05; T += 0.06) { Listen.newestT = T + 0.174; Listen.reliableT = T; Listen.findStrums(); }
      Listen.reliableT = dur; Listen.newestT = dur; Listen.findStrums();
      return { dur, strums: Listen.strums.slice(), fast: typeof Hear !== 'undefined' ? Hear.fast.map(o => ({ t: o.t, kind: o.kind, s: o.strength })) : null };
    };
    // judge one strum (true time `at`) against targets {name: midis}, the way Practice and Stage do
    A.judgeAt = (at, targets, modes, o) => {
      o = o || {};
      let ts = null, bd = o.tol || 0.2; for (const t of Listen.strums) if (Math.abs(t - at) < bd) { bd = Math.abs(t - at); ts = t; }
      const out = { ts, tgt: {} };
      for (const name in targets) {
        const midis = targets[name], res = {};
        for (const mode of modes) {
          const r = { };
          if (ts != null) {
            // Practice: 60-game.js practiceListen
            const fr = Listen.freshness(ts, midis); let first = null, last = null;
            for (let u = 0.3; u <= 0.8001; u += 0.1) { const j = Listen.judge(Listen.heard(ts + 0.04, Math.min(ts + u, Listen.reliableT)), midis, mode); last = j; if (j.ok && (!fr || fr.ok) && first == null) first = +u.toFixed(1); }
            r.p = first != null; r.pAt = first; r.pFresh = fr ? fr.ok : null; r.pMiss = last.missing; r.pWrong = last.wrongNotes; r.pModelOk = last.ok;
          } else { r.p = false; r.noStrum = true; }
          // Stage: 60-game.js updateStage (onsetT = strum - Settings.latency, or the beat when no strum was matched)
          const lat = o.latency == null ? 0.08 : o.latency;
          const onsetT = ts != null ? ts - lat : (o.beatT != null ? o.beatT : at);
          const t0 = onsetT + 0.04, t1 = Math.min(t0 + 0.55, o.nextT != null ? Math.max(t0 + 0.25, o.nextT - 0.02) : t0 + 0.55);
          const j = Listen.judge(Listen.heard(t0, t1), midis, mode), fs = Listen.freshness(t0 - 0.04, midis);
          r.s = j.ok && (!fs || fs.ok); r.sModelOk = j.ok; r.sFresh = fs ? fs.ok : null; r.sMiss = j.missing; r.sWrong = j.wrongNotes;
          if (o.detail) { const h = Listen.heard(t0, t1); r.probs = midis.map(m => +h.note[m].toFixed(2)); const top = []; for (let m = 38; m <= 88; m++) if (h.note[m] >= 0.2) top.push(m + ':' + h.note[m].toFixed(2)); r.top = top.join(' '); r.rise = fs ? +fs.rise.toFixed(2) : null; r.rose = fs ? (fs.nRose != null ? fs.nRose : '?') + '/' + fs.need : null; }
          res[mode] = r;
        }
        out.tgt[name] = res;
      }
      return out;
    };
    // live injection: replace the mic with a gain node we can schedule clips into
    A.inject = (gain) => {
      const ctx = AudioEngine.ctx; try { Mic.src.disconnect(); } catch (e) {}
      const inj = A.inj = ctx.createGain(); inj.gain.value = gain == null ? 1 : gain; inj.connect(Mic.anLong); inj.connect(Mic.anSmall); if (Listen.node) inj.connect(Listen.node);
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * 0.003;
      const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true; ns.connect(inj); ns.start();
      A.clips = {};
    };
    A.addClip = (name, b64) => { const d = A.dec(b64), buf = AudioEngine.ctx.createBuffer(1, d.length, 48000); buf.getChannelData(0).set(d); A.clips[name] = buf; };
    A.play = (name, when, gain, dur) => { const ctx = AudioEngine.ctx, s = ctx.createBufferSource(); s.buffer = A.clips[name]; let dst = A.inj; if (gain != null && gain !== 1) { const g = ctx.createGain(); g.gain.value = gain; g.connect(A.inj); dst = g; } s.connect(dst); const t = Math.max(ctx.currentTime + 0.005, when); if (dur) { s.start(t, 0, dur); } else s.start(t); return t; };
    // the game's own output leaking from the speaker into the mic (gain = how loud relative to the game's master, plus a short room delay)
    A.leak = (gain, delay) => { const ctx = AudioEngine.ctx, g = ctx.createGain(); g.gain.value = gain; AudioEngine.master.connect(g); const d = ctx.createDelay(0.2); d.delayTime.value = delay == null ? 0.02 : delay; g.connect(d); d.connect(A.inj); A.leakGain = g; };
    A.log = []; A.hookPopups = () => { const p = Stage.popup.bind(Stage); Stage.popup = (t, ...a) => { A.log.push({ t: AudioEngine.now(), pop: t }); return p(t, ...a); }; };
  });
  return { browser, page, errs, cdp };
}
// go from the splash to a library song's screen (song object may be patched first)
async function toSong(page, title = 'Chord Drill: G, C, D', patch){
  await page.click('#btn-start', { force: true }); await page.waitForTimeout(1200);
  if (patch) await page.evaluate(patch);
  await page.click('#btn-play', { force: true }).catch(() => {}); await page.waitForTimeout(700);
  await page.click('text=' + title); await page.waitForTimeout(500);
  await page.evaluate(() => { Settings.tuneFirst = false; });
}
module.exports = { open, toSong, DIST };
