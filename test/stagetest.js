// Stage mode with sound injected exactly on the beat (real recorded guitar notes).
// usage: node test/stagetest.js right|wrongchord|speech|claps [mode]
const { chromium } = require('playwright');
const R = require('/home/claude/real/mkreal.js');
const kind = process.argv[2] || 'right', strict = process.argv[3] || 'normal';
const WRONG_FOR = { G: 'Em', C: 'Am', D: 'Bm' };
function clip(name){
  if (kind === 'right') return R.strum(R.CH[name], 'guitar-acoustic', 1.8);
  if (kind === 'wrongchord') return R.strum(R.CH[WRONG_FOR[name]], 'guitar-acoustic', 1.8);
  if (kind === 'speech') return R.clip('x_5703-47212-0', 0.3 + Math.random() * 3, 1.8, 3);
  if (kind === 'claps') { const x = new Float32Array(1.8 * R.SR); for (let i = 0; i < 0.03 * R.SR; i++) x[i] = (Math.random() * 2 - 1) * 0.6 * Math.exp(-i / 300); return x; }
}
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const popups = []; await page.exposeFunction('logPop', t => popups.push(t));
  await page.goto('file://' + __dirname + '/../dist/strum-jam.html');
  await page.waitForTimeout(800); await page.click("#btn-start", { force: true }); await page.waitForTimeout(1500); for (let w = 0; w < 30 && !(await page.evaluate(() => Listen.ready)); w++) await page.waitForTimeout(300);
  await page.click('text=Chord Drill: G, C, D'); await page.waitForTimeout(500);
  await page.evaluate(s => { Settings.tuneFirst = false; Settings.strict = s; const p = Stage.popup.bind(Stage); Stage.popup = (t, ...a) => { window.logPop(t); return p(t, ...a); }; }, strict);
  await page.click('#btn-stage'); await page.waitForTimeout(400);
  const clips = {}; for (const n of ['G', 'C', 'D']) { const all = []; for (let k = 0; k < 4; k++) all.push(Array.from(clip(n)).map(v => +v.toFixed(4))); clips[n] = all; }
  const n = await page.evaluate(clips => {
    const ctx = AudioEngine.ctx; try { Mic.src.disconnect(); } catch (e) {}
    const inj = ctx.createGain(); inj.gain.value = 0.35; inj.connect(Mic.anLong); inj.connect(Mic.anSmall);
    if (Mic.anOn) inj.connect(Mic.anOn); if (Listen.node) inj.connect(Listen.node);
    // faint room noise so the level meter and noise floor stay realistic
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * 0.004;
    const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true; ns.connect(inj); ns.start();
    let k = 0;
    for (const ev of G.list) {
      const arr = clips[ev.label]; if (!arr) continue; const data = arr[k++ % arr.length];
      const buf = ctx.createBuffer(1, data.length, 48000); buf.getChannelData(0).set(data);
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(inj); s.start(Math.max(ctx.currentTime, ev.t + 0.03));
    }
    return G.list.length;
  }, clips);
  const dur = await page.evaluate(() => G.list[G.list.length - 1].t - AudioEngine.now() + 3);
  await page.waitForTimeout(Math.min(60, dur) * 1000);
  const res = await page.evaluate(() => ({ list: G.list.filter(e => e.final).map(e => e.label + ':' + e.result + '/' + e.timing + '/ok' + e.earOk + 'of' + e.earN), counts: G.counts, score: G.score }));
  const hits = res.list.filter(x => x.includes(':hit')).length;
  console.log(kind, strict, 'events', n, 'judged', res.list.length, 'HITS', hits, JSON.stringify(res.counts), 'score', res.score);
  console.log(res.list.join(' '));
  console.log('popups:', [...new Set(popups)].map(p => p + '×' + popups.filter(q => q === p).length).join(', '));
  console.log('ERR', errs.join('; '));
  await b.close();
})();
