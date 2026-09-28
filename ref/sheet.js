// render drummer frames to PNG: node sheet.js out.png level t0 dt n [cols]
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = 'sheet.png', lvl = '2', t0 = '2.0', dts = '0.0333', n = '12', cols = '6', miss = '9'] = process.argv;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const src = fs.readFileSync('/home/claude/strumjam/src/52-drummer.js', 'utf8');
  await p.setContent('<canvas id=c></canvas>');
  p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => console.log('LOG', m.text()));
  const url = await p.evaluate(({ src, lvl, t0, dts, n, cols, miss, CW, CLK, FC }) => {
    window.reduceMotion = false; window.CLICK = CLK; window.FACE = FC; (0, eval)(src + ';window.FunkDrummer=FunkDrummer;');
    const spb = 0.5, ev = [];
    for (let bt = 0; bt < 64; bt++) { const t = bt * spb; if (window.CLICK && bt < 8) { ev.push({ t, kind: 'stick' }); continue; } if (bt % 2 === 0) ev.push({ t, kind: 'kick' }); else ev.push({ t, kind: 'snare' });
      if (bt % 8 === 0) ev.push({ t, kind: 'crash' }); ev.push({ t, kind: 'hat' }); if (lvl >= 1) ev.push({ t: t + spb / 2, kind: 'hat' });
      if (bt % 8 === 7) { ev.push({ t: t + spb / 4, kind: 'tom' }); ev.push({ t: t + spb / 2, kind: 'tom' }); ev.push({ t: t + 3 * spb / 4, kind: 'tom' }); } }
    ev.sort((a, b) => a.t - b.t);
    const process_cw = CW; const C = document.getElementById('c'), cw = +(process_cw||260), ch = Math.round(cw*1.3), N = +n, CO = +cols, R = Math.ceil(N / CO);
    C.width = cw * CO; C.height = ch * R; const c = C.getContext('2d'); c.fillStyle = '#6c7a99'; c.fillRect(0, 0, C.width, C.height);
    const st = FunkDrummer.create(); if (window.FACE) st.forceFace = window.FACE;
    for (let i = 0; i < N; i++) {
      const now = +t0 + i * +dts;
      // warm the springs
      // run the springs forward at 60 fps up to this frame, off-screen
      { const sc = document.createElement('canvas').getContext('2d'); let t = window.__simT == null ? now - 1.5 : window.__simT; if (st.prevL == 0) st.prevL = +lvl;
        for (; t < now - 1e-6; t += 1 / 60) FunkDrummer.draw(sc, st, { x: 0, floorY: 0, h: 100, now: t, real: t, beat: t / spb, spb, level: +lvl, events: ev.filter(e => Math.abs(e.t - t) < 2), playing: true, missAgo: (+miss - (now - t)) < 0 ? 9 : +miss - (now - t) });
        window.__simT = now; }
      c.save(); c.beginPath(); c.rect((i % CO) * cw, Math.floor(i / CO) * ch, cw, ch); c.clip();
      FunkDrummer.draw(c, st, { x: (i % CO) * cw + cw / 2, floorY: Math.floor(i / CO) * ch + ch - 8, h: ch * 0.98, now, beat: now / spb, spb, level: +lvl, events: ev.filter(e => Math.abs(e.t - now) < 2), playing: true, missAgo: +miss, real: now });
      c.restore(); c.fillStyle = '#fff'; c.font = '14px sans-serif'; c.fillText(now.toFixed(3) + ' b' + (now / spb).toFixed(2), (i % CO) * cw + 4, Math.floor(i / CO) * ch + 16);
    }
    return C.toDataURL();
  }, { src, lvl: +lvl, t0, dts, n, cols, miss, CW: +(process.env.CW||260), CLK: !!process.env.CLICK, FC: process.env.FACE ? JSON.parse(process.env.FACE) : null });
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); await b.close();
})();
