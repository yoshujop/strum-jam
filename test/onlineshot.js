// Online mode end to end against a mocked Supabase (in-memory tables + audio bucket), with Chromium's fake mic:
// start a jam, record two takes (each Stage run ended early), play them together, post the performance.
// node test/onlineshot.js [outdir]   (phone-size shots too)
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/online'; require('fs').mkdirSync(out, { recursive: true });
const SB = 'https://test.supabase.co';
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const db = { jams: [], takes: [], performances: [] }, files = {}; let n = 0;
  const route = async rt => {
    const req = rt.request(), u = new URL(req.url()), m = req.method();
    if (u.pathname.startsWith('/storage/v1/object/')) {
      const key = u.pathname.replace(/^\/storage\/v1\/object\/(public\/)?takes\//, '');
      if (m === 'POST') { files[key] = req.postDataBuffer(); return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: key }) }); }
      return files[key] ? rt.fulfill({ status: 200, contentType: 'audio/webm', body: files[key] }) : rt.fulfill({ status: 404, body: '' });
    }
    const table = u.pathname.split('/').pop(), rows = db[table];
    if (m === 'POST') { const row = { id: table === 'jams' ? undefined : 'id' + (++n), created_at: new Date(Date.now() + n).toISOString(), ...JSON.parse(req.postData()) }; rows.push(row); return rt.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([row]) }); }
    let res = rows.slice();
    for (const [k, v] of u.searchParams) {
      if (k === 'select' || k === 'limit') continue;
      if (k === 'order') { const [f, d] = v.split('.'); res.sort((a, c) => (a[f] > c[f] ? 1 : -1) * (d === 'desc' ? -1 : 1)); continue; }
      if (v.startsWith('eq.')) res = res.filter(r => String(r[k]) === v.slice(3));
      if (v.startsWith('in.(')) { const ids = v.slice(4, -1).split(','); res = res.filter(r => ids.includes(r[k])); }
    }
    return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  };
  const errs = [];
  const page = async vp => {
    const p = await b.newPage({ viewport: vp }); p.on('pageerror', e => errs.push(e.message)); await p.route(SB + '/**', route);
    await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(700);
    await p.click('#btn-start', { force: true }); await p.waitForTimeout(800);
    await p.evaluate(sb => { Settings.tuneFirst = false; Sb.url = sb; Sb.key = 'x'.repeat(40); }, SB);
    return p;
  };
  const p = await page({ width: 1100, height: 820 });
  await p.click('#btn-battle', { force: true }); await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/home-empty.png` });
  await p.click('#btn-on-new', { force: true }); await p.waitForTimeout(300);
  await p.fill('#on-name', 'Josh'); await p.screenshot({ path: `${out}/new.png` });
  await p.click('#btn-on-create', { force: true }); await p.waitForTimeout(800);
  const code = db.jams[0] && db.jams[0].id;
  for (const [who, score] of [['Josh', 4200], ['Sam', 5100]]) {
    await p.click('#btn-on-rec', { force: true }); await p.waitForTimeout(300);
    await p.fill('#on-name', who); await p.click('#btn-on-go', { force: true }); await p.waitForTimeout(4500);
    if (who === 'Josh') await p.screenshot({ path: `${out}/recording.png` });
    const rec = await p.evaluate(() => !!(Online.rec && Online.rec.mr && Online.rec.mr.state === 'recording'));
    await p.evaluate(sc => { G.score = sc; G.judgedN = 4; G.accSum = 300; G.finish(); }, score); await p.waitForTimeout(2500);
    console.log(who, 'recording:', rec, '| results:', await p.evaluate(() => $('on-up') && $('on-up').textContent));
    if (who === 'Josh') await p.screenshot({ path: `${out}/results.png` });
    await p.click('[data-online="jam"]', { force: true }); await p.waitForTimeout(900);
  }
  await p.screenshot({ path: `${out}/jam.png` });
  await p.click('#btn-on-play', { force: true }); await p.waitForTimeout(1500);
  console.log('play button:', await p.textContent('#btn-on-play'), '| sources:', await p.evaluate(() => Online.player ? Online.player.srcs.length : 0));
  p.once('dialog', d => d.accept('Our first jam'));
  await p.click('#btn-on-post', { force: true }); await p.waitForTimeout(800);
  await p.click('#btn-on-home', { force: true }); await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/home.png` });
  const q = await page({ width: 390, height: 844 });
  await q.click('#btn-battle', { force: true }); await q.waitForTimeout(900);
  await q.screenshot({ path: `${out}/phone-home.png`, fullPage: true });
  await q.evaluate(c => Online.openJam(c), code); await q.waitForTimeout(900);
  await q.screenshot({ path: `${out}/phone-jam.png`, fullPage: true });
  console.log('jam', code, '| takes', db.takes.map(t => `${t.player_name} ${t.score} ${t.grade} offset ${t.offset_ms}ms`).join(', '), '| posted', db.performances.map(x => x.title + ' ' + x.total_score).join(', '));
  console.log(errs.join(';') || 'no page errors'); await b.close();
})();
