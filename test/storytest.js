// Story mode career builder, offline: the discography lookup (Apple + MusicBrainz, mocked) and the era/song checks.
// node test/storytest.js
const fs = require('fs');
const src = ['10-theory.js', '20-songs.js', '25-lookup.js', '26-chart.js', '48-scenes.js', '65-story.js'].map(f => fs.readFileSync(__dirname + '/../src/' + f, 'utf8')).join('\n');
let fails = 0;
const ok = (cond, msg) => { if (!cond) fails++; console.log((cond ? 'ok   ' : 'FAIL ') + msg); };

/* ---------- mocked services ---------- */
const MB_DOWN = { on: false };
const albums = [
  // Apple: the reissue date on Late Registration is wrong on purpose (MusicBrainz has the real one)
  { collectionId: 101, collectionName: 'The College Dropout', releaseDate: '2004-02-10T08:00:00Z', trackCount: 21, collectionExplicitness: 'explicit' },
  { collectionId: 102, collectionName: 'Late Registration', releaseDate: '2011-08-30T07:00:00Z', trackCount: 21, collectionExplicitness: 'explicit' },
  { collectionId: 112, collectionName: 'Late Registration (Deluxe Edition)', releaseDate: '2011-08-30T07:00:00Z', trackCount: 24, collectionExplicitness: 'explicit' },
  { collectionId: 103, collectionName: 'Graduation', releaseDate: '2007-09-11T07:00:00Z', trackCount: 14, collectionExplicitness: 'explicit' },
  { collectionId: 104, collectionName: '808s & Heartbreak', releaseDate: '2008-11-24T08:00:00Z', trackCount: 12, collectionExplicitness: 'explicit' },
  { collectionId: 105, collectionName: 'My Beautiful Dark Twisted Fantasy', releaseDate: '2010-11-22T08:00:00Z', trackCount: 13, collectionExplicitness: 'explicit' },
  { collectionId: 190, collectionName: 'Stronger - Single', releaseDate: '2007-07-31T07:00:00Z', trackCount: 1, collectionExplicitness: 'explicit' },
  { collectionId: 191, collectionName: 'Late Orchestration (Live at Abbey Road Studios)', releaseDate: '2006-04-10T07:00:00Z', trackCount: 13, collectionExplicitness: 'explicit' },
];
const tracks = {
  101: ['Intro', 'We Don\'t Care', 'Graduation Day', 'All Falls Down (feat. Syleena Johnson)', 'Spaceship (feat. GLC & Consequence)', 'Jesus Walks', 'Never Let Me Down', 'Slow Jamz', 'Breathe In Breathe Out', 'Through the Wire', 'Family Business', 'Last Call'],
  102: ['Wake Up Mr. West', 'Heard \'Em Say (feat. Adam Levine)', 'Touch the Sky', 'Gold Digger (feat. Jamie Foxx)', 'Drive Slow', 'Crack Music', 'Roses', 'Bring Me Down', 'Addiction', 'Diamonds from Sierra Leone (Remix)', 'We Major', 'Hey Mama', 'Celebration', 'Gone', 'Late'],
  112: ['Wake Up Mr. West', 'Heard \'Em Say (feat. Adam Levine)', 'Gold Digger (feat. Jamie Foxx)', 'Hey Mama', 'Back to Basics'],
  103: ['Good Morning', 'Champion', 'Stronger', 'I Wonder', 'Good Life (feat. T-Pain)', 'Can\'t Tell Me Nothing', 'Barry Bonds', 'Drunk and Hot Girls', 'Flashing Lights (feat. Dwele)', 'Everything I Am', 'The Glory', 'Homecoming (feat. Chris Martin)', 'Big Brother'],
  104: ['Say You Will', 'Welcome to Heartbreak', 'Heartless', 'Amazing', 'Love Lockdown', 'Paranoid', 'RoboCop', 'Street Lights', 'Bad News', 'See You In My Nightmares', 'Coldest Winter', 'Pinocchio Story'],
  105: ['Dark Fantasy', 'Gorgeous', 'POWER', 'All of the Lights (Interlude)', 'All of the Lights', 'Monster', 'So Appalled', 'Devil In a New Dress', 'Runaway', 'Hell of a Life', 'Blame Game', 'Lost In the World', 'Who Will Survive In America'],
};
const rgs = [
  { title: 'The College Dropout', 'primary-type': 'Album', 'secondary-types': [], 'first-release-date': '2004-02-10' },
  { title: 'Late Registration', 'primary-type': 'Album', 'secondary-types': [], 'first-release-date': '2005-08-30' },
  { title: 'Late Orchestration', 'primary-type': 'Album', 'secondary-types': ['Live'], 'first-release-date': '2006-04-10' },
  { title: 'Graduation', 'primary-type': 'Album', 'secondary-types': [], 'first-release-date': '2007-09-11' },
  { title: '808s & Heartbreak', 'primary-type': 'Album', 'secondary-types': [], 'first-release-date': '2008-11-24' },
  { title: 'My Beautiful Dark Twisted Fantasy', 'primary-type': 'Album', 'secondary-types': [], 'first-release-date': '2010-11-22' },
  { title: 'Can\'t Tell Me Nothing', 'primary-type': 'Album', 'secondary-types': ['Mixtape/Street'], 'first-release-date': '2007-05-01' },
];
let trackId = 5000;
const trackRows = {};
for (const [cid, list] of Object.entries(tracks)) {
  const a = albums.find(x => x.collectionId === +cid);
  trackRows[cid] = list.map((t, i) => ({ wrapperType: 'track', kind: 'song', trackId: cid === '112' && i < 4 ? trackRows[102] && trackRows[102][[0, 1, 3, 11][i]].trackId : ++trackId, trackName: t, artistName: 'Kanye West', artistId: 2715720,
    collectionId: +cid, collectionName: a.collectionName, releaseDate: a.releaseDate, trackNumber: i + 1, discNumber: 1, previewUrl: 'https://x/p.m4a', trackTimeMillis: 200000 }));
}
// Through the Wire came out as a single the year before the album
trackRows[101].find(t => t.trackName === 'Through the Wire').releaseDate = '2003-09-30T07:00:00Z';
const calls = [];
global.fetch = async url => {
  calls.push(url);
  const json = o => ({ ok: true, status: 200, json: async () => o });
  const u = new URL(url);
  if (u.host === 'musicbrainz.org') {
    if (MB_DOWN.on) throw new TypeError('Failed to fetch');
    if (u.pathname.endsWith('/artist')) return json({ artists: [{ id: 'mb-kanye', name: 'Kanye West', score: 100 }] });
    if (u.pathname.endsWith('/release-group')) return json({ 'release-groups': rgs, 'release-group-count': rgs.length });
  }
  if (u.host === 'itunes.apple.com') {
    if (u.pathname === '/search' && u.searchParams.get('entity') === 'musicArtist') return json({ results: [{ wrapperType: 'artist', artistName: 'Kanye West', artistId: 2715720 }, { wrapperType: 'artist', artistName: 'Kanye West & Jay-Z', artistId: 1 }] });
    if (u.pathname === '/lookup' && u.searchParams.get('entity') === 'album') return json({ results: [{ wrapperType: 'artist', artistId: 2715720 }, ...albums.map(a => ({ wrapperType: 'collection', artistName: 'Kanye West', artistId: 2715720, ...a }))] });
    if (u.pathname === '/lookup' && u.searchParams.get('entity') === 'song') {
      const ids = u.searchParams.get('id').split(',');
      return json({ results: ids.flatMap(id => [{ wrapperType: 'collection', collectionId: +id }, ...(trackRows[id] || [])]) });
    }
  }
  throw new Error('unexpected fetch ' + url);
};
global.document = undefined;

eval(src + '\n;global.X = { Lookup, Career, Chart, validatePlan, careerPrompt, careerMorePrompt, planSong };');
const { Lookup, Career, validatePlan, careerPrompt } = X;

/* ---------- chord charts per song (what the probe would find) ---------- */
const CHARTS = {
  'Jesus Walks': ['Ebm', 'Ebm', 'Ebm', 'Ebm'],                         // a chant: one chord
  'All Falls Down': ['Bbm7', 'Ebm7', 'Ab', 'Db', 'Bbm7', 'Ebm7', 'Ab', 'Db'],
  'Through the Wire': ['C', 'G', 'Am', 'F', 'C', 'G'],
  'Slow Jamz': ['Bbmaj7', 'Am7', 'Gm7', 'C7', 'Fmaj7'],
  'Spaceship': ['Dm', 'C', 'Bb', 'A'],
  'Never Let Me Down': ['Em', 'C', 'G', 'D'],
  'Gold Digger': ['Bbm', 'Bbm', 'Bbm', 'Ab'],                           // mostly one chord (>80%)? no: 3/4 = 0.75 -> passes
  'Heard \'Em Say': ['G', 'D', 'Em', 'C'],
  'Touch the Sky': ['D', 'G', 'A', 'D'],
  'Roses': ['Am', 'F', 'C', 'G'],
  'Hey Mama': ['C', 'Am', 'F', 'G'],
  'Homecoming': ['Eb', 'Bb', 'Cm', 'Ab', 'Eb'],
  'Stronger': ['Bbm', 'Bbm', 'Bbm', 'Bbm', 'Bbm', 'Gb'],             // 5/6 one chord -> fails
  'Good Life': ['F#', 'C#', 'D#m', 'B'],
  'Flashing Lights': ['Cm', 'Ab', 'Eb', 'Bb'],
  'Everything I Am': ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
  'Street Lights': ['Am', 'F', 'C', 'G', 'Am'],
  'Runaway': ['E', 'E', 'C#m', 'A'],
  'Coldest Winter': ['Bm', 'G', 'D', 'A'],
  'Love Lockdown': ['C#m', 'C#m', 'A'],
  'Heartless': ['Bbm', 'Gb', 'Db', 'Ab'],
  'Lost In the World': ['Dm', 'Bb', 'F', 'C'],
};
const probe = async (track, hint) => {
  const secs = CHARTS[Career.cleanTitle(track.title)];
  if (!secs) return { ok: false, reason: 'no chord chart found' };
  const stats = Career.stats([{ chords: secs }], hint);
  return Career.playable(stats) ? { ok: true, src: 'dataset', stats } : { ok: false, reason: 'the chart is basically one chord', stats };
};

(async () => {
  /* ---------- discography ---------- */
  const disc = await Lookup.discography('kanye west');
  ok(disc && disc.source === 'musicbrainz', 'discography from MusicBrainz + Apple');
  ok(disc.albums.map(a => a.title).join(' / ') === 'The College Dropout / Late Registration / Can\'t Tell Me Nothing / Graduation / 808s & Heartbreak / My Beautiful Dark Twisted Fantasy',
    'studio albums + mixtape, oldest first, live album left out: ' + disc.albums.map(a => a.title).join(' / '));
  const lr = disc.albums.find(a => a.title === 'Late Registration');
  ok(lr.year === 2005, 'first release year from MusicBrainz, not Apple’s reissue date (' + lr.year + ')');
  ok(lr.collectionId === 102, 'standard edition picked over the deluxe');
  ok(disc.albums.find(a => a.title === 'Can\'t Tell Me Nothing').tracks.length === 0, 'an album Apple doesn’t have has no tracks to pick from');
  ok(!calls.some(u => /\/lookup\?id=[^&]*190/.test(u)), 'singles aren’t read as albums');

  MB_DOWN.on = true;
  const disc2 = await Lookup.discography('Kanye West');
  MB_DOWN.on = false;
  ok(disc2.source === 'itunes' && disc2.albums.map(a => a.title).join(' / ') === 'The College Dropout / Graduation / 808s & Heartbreak / My Beautiful Dark Twisted Fantasy / Late Registration',
    'without MusicBrainz: Apple’s albums, singles/live/deluxe filtered: ' + disc2.albums.map(a => a.title).join(' / '));

  ok(/All Falls Down/.test(careerPrompt('Kanye West', disc, true)) && !/feat\. Syleena/.test(careerPrompt('Kanye West', disc, true)), 'prompt carries the tracklists (without feature credits)');

  /* ---------- the plan Claude might send back, mistakes included ---------- */
  const id = t => disc.albums.find(a => a.title === t).id;
  const [CD, LR, GR, H8, MB] = ['The College Dropout', 'Late Registration', 'Graduation', '808s & Heartbreak', 'My Beautiful Dark Twisted Fantasy'].map(id);
  const plan = validatePlan({ found: true, artist: 'Kanye West', tagline: 'From Chicago producer to stadium star', levels: [
    { albums: [CD], name: 'The College Dropout', period: 'Chicago Come-Up', blurb: 'x', scene: { setting: 'campus' }, songs: [
      { title: 'Jesus Walks', album: CD, why: 'Anthem', bpm: 87 },
      { title: 'All Falls Down', album: CD, why: 'Famous acoustic guitar loop', bpm: 91, changes: 1 },
      { title: 'Gold Digger', album: CD, why: 'Huge hit', bpm: 93 },               // wrong era: it's on Late Registration
      { title: 'Through the Wire', album: CD, why: 'Sped-up soul loop', bpm: 83 },
      { title: 'Made Up Song', album: CD, why: '?' },                              // not on any album
      { title: 'Slow Jamz', album: CD, why: 'Smooth soul chords', bpm: 72, changes: 2 },
      { title: 'Spaceship', album: CD, why: 'Soul sample loop', bpm: 80 },
      { title: 'Never Let Me Down', album: CD, why: 'Minor loop', bpm: 80 } ] },
    // named after one album but spans two: must be renamed to the period
    { albums: [LR, GR], name: 'Graduation', period: 'Stadium Years', blurb: 'y', scene: { setting: 'arena' }, songs: [
      { title: 'Touch the Sky', album: LR, why: 'Horn loop', bpm: 100 },
      { title: 'Stronger', album: GR, why: 'Synth hit', bpm: 104 },                 // one chord -> replaced
      { title: 'Heard \'Em Say', album: LR, why: 'Piano ballad', bpm: 90 },
      { title: 'Homecoming', album: GR, why: 'Piano hook', bpm: 87 },
      { title: 'Flashing Lights', album: GR, why: 'String chords', bpm: 90 },
      { title: 'Everything I Am', album: GR, why: 'Piano loop', bpm: 80 } ] },
    { albums: [H8, MB], name: 'Heartbreak & Excess', period: 'Heartbreak & Excess', blurb: 'z', scene: { setting: 'artspace' }, songs: [
      { title: 'Street Lights', album: H8, why: 'Four-chord loop', bpm: 85 },
      { title: 'Runaway', album: MB, why: 'Piano hook', bpm: 85 },
      { title: 'Nope', album: MB, why: '?' } ] },
  ] }, 'kanye');
  let asked = null;
  const res = await Career.verify(plan, disc, { probe, askMore: async asks => { asked = asks; return { levels: asks.map(a => ({ level: a.level, songs: [{ title: 'Coldest Winter', album: H8, why: 'Minor piano chords', bpm: 80 }, { title: 'Heartless', album: H8, why: 'Pulsing four chords', bpm: 88 }] })) }; } });
  const [L1, L2, L3] = res.levels;
  const titles = L => L.songs.map(s => s.title);
  console.log(res.levels.map(L => `  ${L.name} (${L.years}) [${L.albums.join(', ')}]: ${L.songs.map(s => `${s.title} ${s.score}`).join(' | ')} || alts: ${L.alts.map(s => s.title).join(', ')}`).join('\n'));
  ok(res.levels.length === 3, 'three levels');
  ok(!titles(L1).includes('Jesus Walks') && titles(L1).includes('All Falls Down'), 'one-chord Jesus Walks replaced; All Falls Down in');
  ok(!L1.songs.concat(L1.alts).some(s => s.title === 'Gold Digger'), 'Gold Digger never in the College Dropout level');
  ok(L2.songs.concat(L2.alts).some(s => s.title === 'Gold Digger'), 'Gold Digger moved to the level that owns Late Registration');
  ok(L1.name === 'The College Dropout' && L1.albums.join() === 'The College Dropout' && L1.albumId === CD, 'album-named level holds only that album');
  ok(L1.years === '2003–2004', 'years cover the songs (a 2003 single) and the album: ' + L1.years);
  ok(L2.name === 'Stadium Years' && L2.albumId === '', 'a level spanning albums gets its period name, not an album title: ' + L2.name);
  ok(L2.albums.every(a => L2.songs.some(s => s.album === a)) && L2.songs.every(s => L2.albums.includes(s.album)), 'album chips are exactly the songs’ albums: ' + L2.albums.join(', '));
  ok(!titles(L2).includes('Stronger'), 'one-chord Stronger replaced');
  ok(res.levels.every(L => L.songs.every((s, i) => !i || L.songs[i - 1].score <= s.score)), 'each level easy -> hard');
  ok(asked && asked.length === 1 && asked[0].level === 3 && asked[0].tried.includes('Street Lights'), 'short level asked for more candidates');
  ok(L3.songs.length === 3 && !L3.few, 'refill filled level 3');
  const idx = t => disc.albums.findIndex(a => a.title === t);
  ok(res.levels.every((L, i) => !i || Math.max(...res.levels[i - 1].songs.map(s => idx(s.album))) < Math.min(...L.songs.map(s => idx(s.album)))), 'levels in time order, no overlap');
  ok(res.rejected.some(r => r.title === 'Made Up Song'), 'a song on none of the albums is rejected');
  ok(Career.options(L1).every(s => s.albumId === CD) && Career.options(L1).length >= 2, 'swap options for an album level come from that album');
  ok(L1.songs.concat(L1.alts).every(s => s.why && s.track && s.track.trackId), 'every pick carries its why line and the checked recording');

  // the built career, for test/storyshot.js
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ v: 2, id: 'c-kanye-west', artist: 'Kanye West', tagline: plan.tagline, few: false, charts: {}, progress: { '0-0': { grade: 'A', score: 91000 } }, created: 1,
    disc: { source: disc.source, albums: disc.albums.map(a => ({ id: a.id, title: a.title, year: a.year })) }, levels: res.levels }));

  /* ---------- an era whose albums Claude put out of order ---------- */
  const bad = validatePlan({ levels: [
    { albums: [CD, GR], name: 'Early', period: 'Early', songs: [{ title: 'All Falls Down', album: CD }, { title: 'Homecoming', album: GR }] },
    { albums: [LR], name: 'Late Registration', period: 'Middle', songs: [{ title: 'Roses', album: LR }, { title: 'Hey Mama', album: LR }] } ] });
  const eras = Career.eras(bad, disc);
  ok(eras.length === 2 && eras[0].ids.join() === CD && eras[1].ids.includes(LR) && eras[1].ids.includes(GR), 'an album listed out of order moves to the later level: ' + eras.map(e => e.ids.join('+')).join(' | '));

  /* ---------- few guitar-friendly songs ---------- */
  const thin = validatePlan({ few: true, levels: [{ albums: [H8], name: '808s & Heartbreak', period: 'Heartbreak', songs: [{ title: 'Street Lights', album: H8 }, { title: 'Paranoid', album: H8 }, { title: 'RoboCop', album: H8 }] }] });
  const r2 = await Career.verify(thin, disc, { probe, askMore: async () => ({ levels: [] }) });
  ok(r2.levels.length === 1 && r2.levels[0].few === 1 && r2.levels[0].songs.length === 1, 'never fills a slot with an unplayable song; marks the level short');

  /* ---------- difficulty ---------- */
  const easy = Career.stats([{ chords: ['G', 'C', 'D', 'G'] }], { bpm: 90, changes: 1 }), hard = Career.stats([{ chords: ['F#m7', 'Bm7', 'E7', 'Amaj7', 'C#7', 'F#m'] }], { bpm: 140, changes: 2 });
  ok(easy.score < hard.score, `open-chord song scores easier than a barre-heavy fast one (${easy.score} < ${hard.score})`);
  ok(Career.stats([{ chords: ['Eb', 'Bb', 'Cm', 'Ab'] }]).capo > 0, 'a capo is considered for flat keys');

  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
