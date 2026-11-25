// ShowHost (src/59-showhost.js) in the real build: Show driven by Groove's audio clock in Chromium, tap input from an
// in-page bot that hits each target on the first frame after its beat. Checks the adapter end to end, no page errors.
//   python3 build.py && NODE_PATH=$(npm root -g) node test/showhost.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 665 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(800);
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(1500);
  let fails = 0; const check = (ok, msg, d) => { if (!ok) fails++; console.log((ok ? '  ok    ' : '  FAIL  ') + msg + (d ? '  [' + d + ']' : '')); };
  const bot = `(T => { let i = 0; window.__ev = []; ShowHost.on(e => window.__ev.push(e)); const f = () => { if (!ShowHost.run) return; const b = ShowHost.beat(); while (i < T.targets.length && T.targets[i].beat <= b) { const t = T.targets[i++]; if (t.kind !== 'rest') ShowHost.tap(t.dir === 'U' ? 'U' : 'D', T.lanes.length > 1 ? t.lane : undefined); } requestAnimationFrame(f); }; f(); return { judged: T.judged, apm: T.apm, bpm: T.bpm }; })`;
  // a song, Normal, tap mode
  const info = await p.evaluate(bot + `(ShowHost.start(LIBRARY.find(s => s.id === 'lib-susanna'), { mode: 'tap', difficulty: 'normal' }))`);
  await p.waitForTimeout(16000);
  const a = await p.evaluate(() => { const ev = window.__ev, hits = ev.filter(e => e.type === 'hit'), g = {}; hits.forEach(h => g[h.grade] = (g[h.grade] || 0) + 1);
    return { hits: hits.length, grades: g, miss: ev.filter(e => e.type === 'miss').length, ghosts: ev.filter(e => e.type === 'ghost').length, ms: hits.map(h => h.ms).filter(x => x != null), types: [...new Set(ev.map(e => e.type))], st: ShowHost.state(), gl: Groove.level, running: Groove.running }; });
  const mean = a.ms.reduce((x, y) => x + y, 0) / (a.ms.length || 1);
  console.log('Oh! Susanna, Normal, tap, 16 s of ' + info.judged + ' targets at ' + info.apm + '/min:', JSON.stringify(a.grades), 'misses', a.miss, 'score', a.st.score, 'combo', a.st.combo, 'x' + a.st.mult, 'level', a.st.level);
  check(a.hits >= 25 && a.miss === 0 && a.ghosts === 0, 'the in-page bot hits every target through the real audio clock', a.hits + ' hits, mean offset ' + mean.toFixed(0) + ' ms, max ' + Math.max(...a.ms.map(Math.abs)) + ' ms');
  check((a.grades.perfect || 0) + (a.grades.great || 0) >= 0.9 * a.hits, 'taps one frame after the beat grade perfect/great', JSON.stringify(a.grades));
  check(a.st.combo >= 25 && a.st.mult >= 3 && a.st.level >= 1 && a.gl === a.st.level && a.running, 'combo, multiplier and hype move, and the hype level drives Groove.level', 'combo ' + a.st.combo + ', x' + a.st.mult + ', level ' + a.st.level + ', Groove.level ' + a.gl);
  check(['start', 'sectionStart', 'command', 'call', 'hit', 'combo', 'mult', 'levelUp'].every(t => a.types.includes(t)), 'events reach the listener', a.types.join(' '));
  await p.evaluate(() => ShowHost.stop());
  // drums on the band's own groove
  await p.evaluate(bot + `(ShowHost.start(LIBRARY.find(s => s.id === 'lib-drill-gcd'), { mode: 'tap', inst: 'drums', difficulty: 'normal' }))`);
  await p.waitForTimeout(8000);
  const d = await p.evaluate(() => { const ev = window.__ev; const r = { hits: ev.filter(e => e.type === 'hit').length, miss: ev.filter(e => e.type === 'miss').length, lanes: [...new Set(ev.filter(e => e.type === 'hit').map(e => e.lane))], st: ShowHost.state() }; ShowHost.stop(); return r; });
  check(d.hits >= 8 && d.miss === 0 && d.lanes.length === 3, 'drums: kick, snare and hat targets come from the band groove (buildPattern) and are hit in time', d.hits + ' hits on ' + d.lanes.join('/'));
  // a microgame to its result
  await p.evaluate(bot + `(ShowHost.runMicro('switch', { bpm: 120, mode: 'tap', chords: ['G', 'C'] }))`);
  await p.waitForTimeout(5000);
  const m = await p.evaluate(() => { const f = window.__ev.find(e => e.type === 'finish'); return { cmd: (window.__ev.find(e => e.type === 'command') || {}).word, r: f && f.result, run: !!ShowHost.run, groove: Groove.running }; });
  check(m.cmd === 'SWITCH!' && m.r && m.r.passed && m.r.medal === 'perfect' && !m.run && !m.groove, 'microgame SWITCH!: command, 4 targets, pass, and the host stops itself at the finish', m.r ? m.r.score + ' ' + m.r.medal : 'no result');
  check(!errs.length, 'no page errors', errs.join('; '));
  await b.close();
  process.exit(fails ? 1 : 0);
})();
