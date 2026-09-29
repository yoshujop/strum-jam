// Story intros: the backstage scene before a level's song, typing a speech (a mocked Claude answer, then the built-in
// script), at desktop and phone size. Needs /tmp/career.json (OUT=/tmp/career.json node test/storytest.js).
// node test/introshot.js [outdir]
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '/tmp/intro'; fs.mkdirSync(out, { recursive: true });
const career = JSON.parse(fs.readFileSync(process.env.CAREER || '/tmp/career.json', 'utf8'));
const SPEECH = 'This is it. They spent years calling me just a producer and tuning me out when I rapped in those label offices, but tonight everything changes. I am not here to brag. I am here to hold up a mirror, and I am starting with myself.';
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [], log = [];
  for (const [name, W, H, ai] of [['desk', 1280, 800, true], ['phone', 390, 844, true], ['desk-script', 1280, 800, false]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } }); p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(c => { try { localStorage.setItem('strumjam.careers', JSON.stringify([c])); } catch (e) {} }, career);
    await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(800);
    await p.click('#btn-start', { force: true }); await p.waitForTimeout(600);
    await p.evaluate(({ ai, SPEECH }) => {
      if (ai) { Settings.apiKey = 'test'; UI.askClaude = async () => { await new Promise(r => setTimeout(r, 400)); return { speech: SPEECH }; }; } else Settings.apiKey = '';
      const c = Story.get('c-kanye-west'); UI.storyCtx = { careerId: c.id, li: 0, si: 0 };
      window.__done = false; Intro.show(UI.storyCtx).then(() => { window.__done = true; });
    }, { ai, SPEECH });
    await p.waitForTimeout(3200); await p.screenshot({ path: `${out}/${name}-typing.png` });
    await p.click('#btn-intro-go'); await p.waitForTimeout(300);                 // first press: the rest of the line at once
    await p.screenshot({ path: `${out}/${name}-full.png` });
    const text = await p.textContent('#intro-text');
    await p.click('#btn-intro-go'); await p.waitForTimeout(300);                 // second: on stage
    log.push(`${name}: done=${await p.evaluate(() => window.__done)} | ${text.slice(0, 110)}…`);
    await p.close();
  }
  // the real flow: a Story song's "Take the stage" plays the intro first, then the run starts
  { const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(c => { try { localStorage.setItem('strumjam.careers', JSON.stringify([c])); } catch (e) {} }, career);
    await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(800);
    await p.click('#btn-start', { force: true }); await p.waitForTimeout(600);
    await p.evaluate(() => { Settings.tuneFirst = false; Settings.apiKey = ''; const c = Story.get('c-kanye-west'); const s = c.levels[0].songs[0];
      UI.openSong(validateSong({ title: s.title, artist: c.artist, bpm: 90, time: '4/4', sections: [{ name: 'Verse', bars: ['G', 'C', 'D', 'G'] }] }, 'library'), { careerId: c.id, li: 0, si: 0 }); });
    await p.waitForTimeout(800); await p.click('#btn-gig-stage', { force: true }); await p.waitForTimeout(1500);
    const shown = await p.evaluate(() => !$('m-intro').hidden && UI.screen);
    await p.click('#btn-intro-go'); await p.waitForTimeout(200); await p.click('#btn-intro-go'); await p.waitForTimeout(2500);
    log.push(`flow: intro shown on ${shown}, then screen=${await p.evaluate(() => UI.screen)} running=${await p.evaluate(() => G.running)}`); await p.close(); }
  console.log(log.join('\n')); console.log(errs.join(';') || 'no page errors'); await b.close();
})();
