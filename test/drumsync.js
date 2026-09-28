// Does each stick land on its drum hit (and the kick foot on the kick)? Measures, per heard hit, when the hand is at its contact pose.
const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});const p=await b.newPage({viewport:{width:1280,height:760}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+__dirname+'/../dist/strum-jam.html');await p.waitForTimeout(800);await p.click('#btn-start',{force:true});await p.waitForTimeout(1500);
await p.click('text=Chord Drill: G, C, D');await p.waitForTimeout(400);await p.evaluate(()=>Settings.tuneFirst=false);await p.click('#btn-stage');await p.waitForTimeout(2500);
for (const L of [0, 2, 4]) {
  await p.evaluate(L => { G.hype = [0.05,0.45,0.5,0.7,0.95][L]; G.setLevel(L); window.__rec = []; window.__hits = [];
    const f = () => { const s = Stage.drumSt && Stage.drumSt.last; if (s) { const H = FunkDrummer.HIT, d = (h, k) => Math.hypot(h.x - H[k].x, h.y - H[k].y) + Math.abs(h.a - H[k].a) * 40;
      window.__rec.push([s.now, d(s.hA, 'snare'), d(s.hB, 'hat'), d(s.hB, 'crash'), d(s.hA, 'tom'), s.dK]); }
      for (const h of Groove.hits) if (!window.__hits.some(x => x.t === h.t && x.kind === h.kind)) window.__hits.push(h);
      if (window.__rec.length < 420) requestAnimationFrame(f); }; requestAnimationFrame(f); }, L);
  await p.waitForTimeout(7500);
  const out = await p.evaluate(() => { const rec = window.__rec, hits = window.__hits; const t0 = rec[0][0], t1 = rec[rec.length - 1][0];
    const col = { snare: 1, hat: 2, crash: 3, tom: 4 }, res = {};
    for (const kind of ['snare', 'hat', 'crash', 'kick']) { const offs = [];
      for (const h of hits) { if (h.kind !== kind || h.t < t0 + 0.2 || h.t > t1 - 0.2) continue;
        if (kind === 'kick') { const r = rec.find(r => r[0] >= h.t && r[5] < 0.02); offs.push(r ? Math.round((r[0] - h.t) * 1000) : 'x'); continue; }
        // first frame at (or within 3 units of) the contact pose, near the hit
        let best = null; for (const r of rec) if (Math.abs(r[0] - h.t) < 0.2 && r[col[kind]] < 3) { best = r[0]; break; }
        offs.push(best == null ? 'x' : Math.round((best - h.t) * 1000)); }
      res[kind] = offs.length + ' hits, ms: ' + offs.slice(0, 12).join(','); }
    let gap = 0; for (let i = 1; i < rec.length; i++) gap = Math.max(gap, rec[i][0] - rec[i - 1][0]); res.maxFrameGapMs = Math.round(gap * 1000); return res; });
  console.log('level', L, JSON.stringify(out));
}
console.log('ERR', errs.join(';')); await b.close();})();
