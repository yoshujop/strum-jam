// "Build it yourself" and the song picker, with the services stubbed: node test/customshot.js [outdir]
// (needs /tmp/career.json from: OUT=/tmp/career.json node test/storytest.js)
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '/tmp/custom'; fs.mkdirSync(out, { recursive: true });
const career = JSON.parse(fs.readFileSync(process.env.CAREER || '/tmp/career.json', 'utf8'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('strumjam.settings', JSON.stringify({ apiKey: 'sk-test' })); } catch (e) {} });
  await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(800);
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(800);
  await p.evaluate(c => {
    const songs = c.levels.flatMap(l => l.songs.concat(l.alts));
    const extra = [{ trackId: 9001, title: 'Jesus Walks', albumId: 'A1' }, { trackId: 9002, title: 'Intro', albumId: 'A1' }];
    const disc = { artist: 'Kanye West', artistId: 1, source: 'musicbrainz', albums: c.disc.albums.map(a => ({ ...a, date: a.year + '-01-01',
      tracks: songs.filter(s => s.albumId === a.id).map(s => s.track).concat(extra.filter(x => x.albumId === a.id).map(x => ({ ...x, artist: 'Kanye West', album: a.title, year: a.year }))) })) };
    Lookup.discography = async () => disc;
    Lookup.findRows = async t => /Intro/.test(t.title) ? { rows: [] } : { rows: [{ sections: [{ chords: /Jesus/.test(t.title) ? ['Ebm'] : ['C', 'G', 'Am', 'F', 'Dm'] }] }] };
    Lookup.findHT = async () => null;
    UI.askClaude = async () => ({ tagline: 'From Chicago beats to stadium anthems', levels: [
      { blurb: 'Soul samples, backpacks and a Chicago dorm-room studio.', scene: { stage: 'A South Side dorm-room studio at night, CD stacks by the window', setting: 'campus', time: 'night', palette: ['#3B2F63', '#FFB020', '#FF5E7E'], props: ['cd-table', 'boombox', 'books', 'turntables'], motif: 'crown', sign: 'SOUTH SIDE', posters: ['CHICAGO 2003', 'OPEN MIC', 'ROC-A-FELLA'] } },
      { blurb: 'Strings, horns and the first arena tours.', scene: { stage: 'An arena stage with a giant LED sky and lasers', setting: 'arena', time: 'night', palette: ['#1A1633', '#FF4FA0', '#4FE3FF'], props: ['lasers', 'pyro', 'speakers'], motif: 'bolt', sign: 'SOLD OUT', posters: ['TOUCH THE SKY TOUR', '2007'] } } ] });
  }, career);
  await p.evaluate(() => Story.openPick()); await p.waitForTimeout(900);
  await p.fill('#story-input', 'Kanye West'); await p.click('#btn-story-custom'); await p.waitForTimeout(800);
  // two levels: College Dropout, then Late Registration + Graduation; the rest left out
  const seg = async (t, l) => p.click(`.cb-alb:has-text("${t}") .cb-seg button:nth-child(${l + 1})`);
  await seg('The College Dropout', 1); await seg('Late Registration', 2); await seg('Graduation', 2); await seg('808s', 0); await seg('My Beautiful', 0);
  await p.waitForTimeout(300);
  for (const t of ['All Falls Down', 'Jesus Walks', 'Intro', 'Through the Wire']) { await p.click(`.cb-song:has-text("${t}") input`).catch(() => {}); await p.waitForTimeout(400); }
  for (const t of ['Touch the Sky', 'Homecoming']) { await p.click(`.cb-song:has-text("${t}") input`); await p.waitForTimeout(400); }
  await p.fill('[data-name="2"]', 'Graduation');   // an album title on a level that spans two albums: the rules rename it
  await p.setViewportSize({ width: 1100, height: 2600 }); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/builder.png` });
  await p.setViewportSize({ width: 1100, height: 900 });
  await p.click('#btn-cb-save'); await p.waitForTimeout(2500);
  const c = await p.evaluate(() => { const c = Story.get('c-kanye-west-mine'); return c && c.levels.map(L => ({ name: L.name, years: L.years, albums: L.albums, songs: L.songs.map(s => s.title), stage: L.scene.stage })); });
  console.log(JSON.stringify(c));
  await p.setViewportSize({ width: 1100, height: 2200 }); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/career.png` });
  await p.setViewportSize({ width: 1100, height: 900 }); await p.waitForTimeout(300);
  await p.locator('.stop-lbl').first().locator('.swap', { hasText: 'Pick' }).click(); await p.waitForTimeout(800);
  await p.click('.pk-row:has-text("Jesus Walks") button'); await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/picker.png` });
  await p.click('.pk-row:has-text("Spaceship") button'); await p.waitForTimeout(800);
  console.log('after pick', JSON.stringify(await p.evaluate(() => Story.get('c-kanye-west-mine').levels[0].songs.map(s => s.title))));
  console.log(errs.length ? 'ERR ' + errs.join('; ') : 'no page errors'); await b.close();
})();
