// frames of the drummer playing the real in-game groove (Groove's own events at a hype level), big enough to
// inspect: node test/drumsheet.js out.png [level] [t-offset s] [frames] [cols] [dt]
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/dsheet.png', LV = '3', OFF = '0', N = '24', COLS = '8', DT = '0.0333'] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(800);
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(800);
  await p.click('#btn-play', { force: true }); await p.waitForTimeout(900);
  await p.click('text=Chord Drill: G, C, D'); await p.waitForTimeout(400); await p.evaluate(() => Settings.tuneFirst = false);
  await p.click('#btn-stage'); await p.waitForTimeout(4000);
  await p.evaluate(L => { G.hype = 0.9; G.setLevel(L); }, +LV);
  // collect the groove the kit really plays for a few seconds
  const url = await p.evaluate(({ LV, OFF, N, COLS, DT }) => new Promise(res => {
    const seen = new Map(), t0 = AudioEngine.now();
    const iv = setInterval(() => { for (const e of Groove.events(AudioEngine.now())) seen.set(e.t.toFixed(4) + e.kind, e); }, 50);
    setTimeout(() => {
      clearInterval(iv); const ev = [...seen.values()].sort((a, b) => a.t - b.t);
      const spb = Groove.cfg.beatDur, C = document.createElement('canvas'), cw = 300, ch = 330, R = Math.ceil(N / COLS);
      C.width = cw * COLS; C.height = ch * R; const c = C.getContext('2d'); c.fillStyle = '#6c7a99'; c.fillRect(0, 0, C.width, C.height);
      const st = FunkDrummer.create(), start = t0 + 1.5 + OFF, opts = t => ({ now: t, real: t, beat: Groove.beatAt(t), spb, level: LV, events: ev.filter(e => Math.abs(e.t - t) < 2), playing: true, missAgo: 9 });
      const sc = document.createElement('canvas').getContext('2d');
      for (let t = start - 1; t < start; t += 1 / 60) FunkDrummer.draw(sc, st, { ...opts(t), x: 0, floorY: 0, h: 100 });
      for (let i = 0; i < N; i++) { const t = start + i * DT;
        for (let u = t - DT + 1 / 60; u < t - 1e-6; u += 1 / 60) FunkDrummer.draw(sc, st, { ...opts(u), x: 0, floorY: 0, h: 100 });
        c.save(); c.beginPath(); c.rect((i % COLS) * cw, Math.floor(i / COLS) * ch, cw, ch); c.clip();
        FunkDrummer.draw(c, st, { ...opts(t), x: (i % COLS) * cw + cw / 2, floorY: Math.floor(i / COLS) * ch + ch - 6, h: ch * 1.05 });
        c.restore(); c.fillStyle = '#fff'; c.font = '13px sans-serif'; c.fillText('b' + Groove.beatAt(t).toFixed(2), (i % COLS) * cw + 4, Math.floor(i / COLS) * ch + 14); }
      res(C.toDataURL());
    }, 4200);
  }), { LV: +LV, OFF: +OFF, N: +N, COLS: +COLS, DT: +DT });
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log(errs.length ? 'ERR ' + errs.join('; ') : 'ok'); await b.close();
})();
