// ready-made careers (built with no API key, services stubbed) and career codes / links:
// node test/curatedshot.js [outdir]   (needs /tmp/career.json from: OUT=/tmp/career.json node test/storytest.js)
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '/tmp/curated'; fs.mkdirSync(out, { recursive: true });
const career = JSON.parse(fs.readFileSync(process.env.CAREER || '/tmp/career.json', 'utf8'));
const stub = c => {
  const songs = c.levels.flatMap(l => l.songs.concat(l.alts));
  const more = { A1: ['Spaceship', 'Never Let Me Down', 'Jesus Walks'], A2: ["Heard 'Em Say", 'Hey Mama'], A4: ['Good Life', 'Everything I Am', 'Flashing Lights'], A5: ['Heartless', 'Love Lockdown', 'Coldest Winter'], A6: ['Runaway', 'Lost in the World'] };
  let id = 7000;
  const disc = { artist: 'Kanye West', artistId: 1, source: 'musicbrainz', albums: c.disc.albums.map(a => ({ ...a, date: a.year + '-01-01',
    tracks: songs.filter(s => s.albumId === a.id).map(s => s.track).concat((more[a.id] || []).filter(t => !songs.some(s => s.title === t)).map(t => ({ trackId: ++id, title: t, artist: 'Kanye West', album: a.title, year: a.year }))) })) };
  Lookup.discography = async () => disc;
  Lookup.findRows = async t => ({ rows: [{ sections: [{ chords: /Jesus/.test(t.title) ? ['Ebm'] : ['C', 'G', 'Am', 'F', 'Dm'] }] }] });
  Lookup.findHT = async () => null;
  UI.askClaude = async () => { throw new Error('Claude should not be called for a ready-made career'); };
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/../dist/strum-jam.html'); await p.waitForTimeout(700);
  await p.click('#btn-start', { force: true }); await p.waitForTimeout(800);
  await p.evaluate(stub, career);
  await p.evaluate(() => Story.openPick()); await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/pick.png`, fullPage: false });
  await p.click('.cur-card:has-text("Kanye West")'); await p.waitForTimeout(3000);
  const built = await p.evaluate(() => { const c = Story.get('c-kanye-west'); return c && c.levels.map(L => `${L.name} [${L.albums}] ${L.songs.map(s => s.title).join(', ')}`); });
  console.log('built without a key:', JSON.stringify(built));
  const code = await p.evaluate(async () => careerToCode(Story.get('c-kanye-west')));
  console.log('code length', code.length);
  // open the share link in a fresh page: it lands in the career
  const p2 = await b.newPage({ viewport: { width: 1100, height: 900 } }); p2.on('pageerror', e => errs.push(e.message));
  await p2.goto('file://' + __dirname + '/../dist/strum-jam.html#career=' + code); await p2.waitForTimeout(1500);
  const got = await p2.evaluate(() => ({ screen: UI.screen, artist: Story.cur && Story.cur.artist, levels: Story.cur && Story.cur.levels.map(L => L.name + ':' + L.songs.length), hash: location.hash }));
  console.log('link import:', JSON.stringify(got));
  console.log(errs.length ? 'ERR ' + errs.join('; ') : 'no page errors'); await b.close();
})();
