/* =====================================================================
   Story mode: pick an artist, play through their career.
   1. The discography comes from data: MusicBrainz for the studio albums
      and their first release dates, Apple for the tracklists.
   2. Claude (with web search when there's an API key) groups the albums
      into up to 3 eras, designs a stage for each from the Scenes
      vocabulary, and suggests guitar-friendly songs from those albums.
   3. Every song is found in the tracklists (so its album and year are
      real) and checked against the chord data the charts use; songs with
      no chart, or a one-chord chart, are replaced by the next pick. The
      3 per era are ordered easy -> hard; the rest can be swapped in.
   4. Level names, album chips and years are worked out from the songs a
      level ends up with. Clear every song in an era to unlock the next.
   ===================================================================== */
const STORY_TIERS = [
  { name: 'Easy',   easy: true,  strict: 'relaxed', tempo: 85,  pass: 'C', rules: 'Easy chord shapes · relaxed note check · 85% tempo · pass with a C' },
  { name: 'Medium', easy: true,  strict: 'normal',  tempo: 100, pass: 'B', rules: 'Easy chord shapes · normal note check · full tempo · pass with a B' },
  { name: 'Hard',   easy: false, strict: 'normal',  tempo: 100, pass: 'A', rules: 'The real chord shapes · normal note check · full tempo · pass with an A' },
];
const GRADE_RANK = { S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 };

const qt = x => String(x == null ? '' : x).replace(/"/g, "'");
// the discography as Claude sees it: every album, its first release date and its tracklist
function discographyText(disc){
  return disc.albums.map(a => `${a.id} · "${qt(a.title)}" · ${a.date || a.year}${a.mixtape ? ' · mixtape' : ''} · ` +
    (a.tracks.length ? 'tracks: ' + a.tracks.map(t => qt(Career.cleanTitle(t.title))).join(' | ') : 'not on Apple Music, so no songs can come from it')).join('\n');
}
const CAREER_SONG_RULES = `Choose songs for PLAYABILITY FIRST, then fame:
- The song's hook or backbone is a clear chord progression (at least 2–4 distinct chords) that sounds like the song when strummed or picked on guitar: a guitar riff, or a piano or sampled chord loop that translates to guitar.
- It's well known for its era, a song fans would expect to play, and ideally commonly covered or charted on guitar.
- Leave out songs whose harmony is basically one chord, a drone, a chant or mostly percussion, or where a chord chart would just repeat one chord. Being famous, or having a guitar somewhere in it, isn't enough.
  Example: from Kanye West's The College Dropout, "All Falls Down" (a hit built on a memorable acoustic guitar loop) belongs well before "Jesus Walks" (mostly a chant and drums, with very little to strum).
- "title" is copied exactly from the tracklist above, and "album" is the id of the album it's on. Never a song from another album, a single that isn't on these albums, or a song by someone else.
- "why": one short line, max 60 characters, on why it's a good guitar pick, like "Famous acoustic guitar loop" or "Four-chord piano ballad". No lyrics, no quotes from the song.
- "bpm": the recording's tempo. "changes": about how many chord changes per bar (0.5, 1, 2…). "chords": about how many distinct chords it uses.`;

// how Claude designs an era's stage (the Scenes vocabulary)
function sceneRules(){
  return `- "scene" designs the level's stage. Work like a production designer for this one era: first picture the real places of that period (the neighbourhood, the rooms they recorded in, the venues they toured, the look of the records and videos), then build a set that says it. Places and things only, never people, logos or album art. Make the three levels look clearly different from each other (setting, time of day, palette).
  - "stage": one sentence, max 110 characters, describing the set, like "A South Side dorm-room studio at night, CD stacks by the window".
  - "setting": one of ${Scenes.SETTINGS.join(', ')}.
  - "time": day, dusk or night. "weather": one of ${Scenes.WEATHER.join(', ')}.
  - "palette": 3 hex colours that capture the era's visual aesthetic (main, accent, glow), taken from how that era actually looked.
  - "props": 3 to 5 of ${Scenes.PROPS.join(', ')}.
  - "motif": a shape painted big on the back wall that stands for the era: one of ${Scenes.MOTIFS.join(', ')}.
  - "sign": 1 to 3 words, max 16 characters, shown on a sign, banner or screen: a place or venue name that fits the era. Not a lyric and not a brand.
  - "posters": 2 or 3 flyers on the wall, each max 14 characters: real places, venues, tour stops or the year from that era (like "CHICAGO 2003", "HOUSE OF BLUES"). Not lyrics and not brands.
  Example thinking: an early hustle on the streets → street with cd-table and boombox; a college-themed debut → campus; small clubs → club; arena tours → arena with lasers and pyro; a lavish era → mansion or theater; a stark experimental era → artspace; a gospel era → church; a quiet rural era → countryside or mountains.`;
}
function careerPrompt(artist, disc, web){
  return `You are the career planner for STORY MODE in "Strum Jam", a game that teaches people to play real songs on guitar. The player picked the artist: "${qt(artist).slice(0, 80)}".

This is the artist's verified discography from MusicBrainz and Apple Music: studio albums (and mixtapes), oldest first, with first release dates and tracklists. It is the only source for albums, years and which album a song is on:
${discographyText(disc)}

${web ? 'Use web search for context: the phases of their career, their stylistic shifts, which songs defined each period, and which of their songs guitarists actually play (chord sites, lessons, covers). ' : ''}Map the career into levels in chronological order: 3 levels when there are 3 or more albums with tracks, otherwise one level per album. Level 1 is where they started, then the breakthrough or peak, then the later or latest work. Reply with JSON only, in exactly this shape:
{"found":true,"artist":"Official Name","tagline":"One line about the arc of their career","few":false,"levels":[{"albums":["A1"],"name":"The College Dropout","period":"Chicago Come-Up","blurb":"One or two plain sentences.","scene":{"stage":"A South Side dorm-room studio at night, CD stacks by the window","setting":"campus","time":"night","weather":"none","palette":["#4B3F7A","#FF5E7E","#FFCE3A"],"props":["cd-table","boombox","books"],"motif":"crown","sign":"SOUTH SIDE","posters":["CHICAGO 2003","OPEN MIC"]},"songs":[{"title":"All Falls Down","album":"A1","why":"Famous acoustic guitar loop","bpm":91,"changes":1,"chords":4}]}]}

ERAS
- "albums": the ids of a run of consecutive albums from the list. Levels never share an album and never overlap in time. You may leave albums out.
- "name": max 28 characters. A level with one album may be named after it (its exact title). A level with several albums gets a name for that period of their career, like "Chicago Come-Up" or "Stadium Years", never one album's title.
- "period": always also a period name (max 28 characters) that is not any album's title. It is used if the songs end up spanning several albums.
- "blurb": one or two plain factual sentences, max 200 characters, about their sound and where their life was at in that period: the places, venues and lifestyle. No lyrics, no quotes, no gossip.
- "tagline": max 90 characters, plain and factual.
${sceneRules()}

SONGS (this matters most)
For each level list 7 candidate songs from that level's albums, best pick first. Every one is checked against real chord charts; the first ones that pass are played, the rest can be swapped in.
${CAREER_SONG_RULES}
- If this artist has few guitar-friendly songs, still list their most playable ones and set "few": true.

NO LYRICS anywhere. If you don't know this artist, or the discography above clearly belongs to someone else, reply {"found":false,"suggestions":["Artist","Artist","Artist"]}.
Reply with the JSON only.`;
}
// more candidates for levels that came up short after the chord check
function careerMorePrompt(artist, disc, asks, web){
  return `You are picking songs for STORY MODE in "Strum Jam", a game that teaches people to play real songs on guitar. The artist is "${qt(artist).slice(0, 80)}".

Verified discography (the only source for albums and tracklists):
${discographyText(disc)}

${web ? 'Use web search to see which of their songs guitarists actually play (chord sites, lessons, covers). ' : ''}Some levels need more songs. The songs already tried there failed the chord check (no chord chart, or the chart is basically one chord), so don't list them again.
${asks.map(a => `Level ${a.level} (albums ${a.albums.join(', ')}): already tried ${a.tried.length ? a.tried.map(t => '"' + qt(t) + '"').join(', ') : 'nothing'}.`).join('\n')}

For each of these levels list up to 6 more candidate songs from that level's albums only, best first.
${CAREER_SONG_RULES}
Reply with JSON only: {"levels":[{"level":1,"songs":[{"title":"Song","album":"A1","why":"Short reason","bpm":100,"changes":1,"chords":4}]}]}`;
}

// themes for a career the player built: blurbs and stages for their levels
function careerThemePrompt(c){
  return `You are the art director for STORY MODE in "Strum Jam", a guitar game. The player built their own career for "${qt(c.artist).slice(0, 80)}" with these levels:
${c.levels.map((L, i) => `Level ${i + 1} "${qt(L.name)}" (${L.years}): albums ${L.albums.map(a => '"' + qt(a) + '"').join(', ')}; songs ${L.songs.map(s => '"' + qt(s.title) + '"').join(', ')}.`).join('\n')}

For each level write a blurb and design its stage. Reply with JSON only: {"tagline":"One line about the arc of their career","levels":[{"blurb":"One or two plain sentences.","scene":{"stage":"…","setting":"…","time":"…","weather":"…","palette":["#…","#…","#…"],"props":["…"],"motif":"…","sign":"…","posters":["…"]}}]}
- "tagline": max 90 characters, plain and factual. "blurb": max 200 characters about their sound and where their life was at in that period: the places, venues and lifestyle. No lyrics, no quotes, no gossip.
${sceneRules()}
NO LYRICS anywhere. Reply with the JSON only.`;
}

// a ready-made career as a plan in Claude's shape, its album titles turned into this discography's ids
function curatedPlan(cur, disc){
  const idOf = t => { const a = disc.albums.find(x => Lookup.albumKey(x.title) === Lookup.albumKey(t)); return a ? a.id : ''; };
  return { found: true, artist: cur.artist, tagline: cur.tagline, levels: cur.levels.map(L => ({ albums: L.albums.map(idOf).filter(Boolean), name: L.name, period: L.period, blurb: L.blurb, scene: L.scene,
    songs: L.songs.map(([title, album, why, bpm, changes]) => ({ title, album: idOf(album), why, bpm, changes })) })) };
}
/* ---------- career codes: a career as text (gzip + base64url), without anyone's progress ---------- */
const b64u = { enc: bytes => { let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b)); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: str => { let b = str.replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '='; return Uint8Array.from(atob(b), c => c.charCodeAt(0)); } };
async function gz(bytes, dir){ const s = new Blob([bytes]).stream().pipeThrough(dir === 'in' ? new CompressionStream('gzip') : new DecompressionStream('gzip')); return new Uint8Array(await new Response(s).arrayBuffer()); }
async function careerToCode(c){
  const o = { artist: c.artist, tagline: c.tagline, few: !!c.few, custom: !!c.custom, disc: c.disc, levels: c.levels.map(L => ({ name: L.name, claim: L.claim, period: L.period, blurb: L.blurb, scene: L.scene, pool: L.pool, songs: L.songs, alts: L.alts || [] })) };
  return 'SJC1.' + b64u.enc(await gz(new TextEncoder().encode(JSON.stringify(o)), 'in'));
}
// everything in a code is checked like anything else from outside: shapes, lengths, the era rules
async function careerFromCode(code){
  const m = /SJC1\.([A-Za-z0-9_\-]+)/.exec(String(code).replace(/\s+/g, ''));
  if (!m) throw new Error('That doesn’t look like a Strum Jam career code. Codes start with SJC1.');
  let o;
  try { o = JSON.parse(new TextDecoder().decode(await gz(b64u.dec(m[1]), 'out'))); } catch (e) { throw new Error('The career code is incomplete. Copy the whole thing and try again.'); }
  const albums = (o.disc && Array.isArray(o.disc.albums) ? o.disc.albums : []).slice(0, 60).map(a => ({ id: cleanStr(a && a.id, 8), title: cleanStr(a && a.title, 90), year: Math.round(clampNum(a && a.year, 1900, 2100, 0)) })).filter(a => a.id && a.title);
  const url = v => /^https:\/\//.test(v || '') ? String(v).slice(0, 400) : '';
  const tr = t => t && typeof t === 'object' && +t.trackId ? { trackId: +t.trackId, title: cleanStr(t.title, 120), artist: cleanStr(t.artist, 90), artistId: +t.artistId || 0, album: cleanStr(t.album, 120), year: Math.round(clampNum(t.year, 1900, 2100, 0)),
    durationMs: Math.round(clampNum(t.durationMs, 0, 3600000, 0)), previewUrl: url(t.previewUrl), genre: cleanStr(t.genre, 40), art: url(t.art), url: url(t.url) } : null;
  const song = s => s && typeof s === 'object' && cleanStr(s.title, 90) ? { title: cleanStr(s.title, 90), album: cleanStr(s.album, 90), albumId: cleanStr(s.albumId, 8), year: Math.round(clampNum(s.year, 1900, 2100, 0)) || '',
    why: cleanStr(s.why, 70), score: clampNum(s.score, 0, 50, 0), src: cleanStr(s.src, 12),
    stats: s.stats && typeof s.stats === 'object' ? { distinct: clampNum(s.stats.distinct, 0, 40, 0), barre: clampNum(s.stats.barre, 0, 1, 0), cpb: clampNum(s.stats.cpb, 0, 8, 0), bpm: clampNum(s.stats.bpm, 0, 260, 0), capo: clampNum(s.stats.capo, 0, 9, 0) } : {}, track: tr(s.track) } : null;
  const levels = (Array.isArray(o.levels) ? o.levels : []).slice(0, 3).map(L => {
    L = L && typeof L === 'object' ? L : {};
    const songs = (Array.isArray(L.songs) ? L.songs : []).slice(0, 5).map(song).filter(Boolean);
    return songs.length ? { claim: cleanStr(L.claim || L.name, 32), period: cleanStr(L.period, 32), blurb: cleanStr(L.blurb, 240), scene: Scenes.validate(L.scene), pool: (Array.isArray(L.pool) ? L.pool : []).map(x => cleanStr(x, 8)).slice(0, 20),
      songs: songs.sort((a, b) => a.score - b.score), alts: (Array.isArray(L.alts) ? L.alts : []).slice(0, 6).map(song).filter(Boolean), few: 0 } : null;
  }).filter(Boolean).map((L, li) => Career.meta(L, albums, li));
  if (!levels.length) throw new Error('That career code has no songs in it.');
  const artist = cleanStr(o.artist, 60) || 'Artist';
  const c = { v: 2, shared: true, custom: !!o.custom, artist, tagline: cleanStr(o.tagline, 110), few: !!o.few, charts: {}, progress: {}, created: Date.now(), disc: { source: 'shared', albums }, levels };
  c.id = 'c-' + slug(artist) + '-' + Lookup.fnv(m[1]).toString(36).slice(0, 6);
  Story.save(c);
  return c;
}

// Claude's plan, cleaned: nothing in it is trusted until it's checked against the discography and the chord data
function planSong(s){
  return s && typeof s === 'object' && cleanStr(s.title, 90) ? { title: cleanStr(s.title, 90), album: cleanStr(s.album, 8), why: cleanStr(s.why, 70),
    bpm: clampNum(s.bpm, 40, 240, 0), changes: clampNum(s.changes, 0.1, 8, 0), chords: Math.round(clampNum(s.chords, 1, 30, 0)) } : null;
}
function validatePlan(o, query){
  if (!o || typeof o !== 'object') throw new Error('The career came back empty.');
  const levels = (Array.isArray(o.levels) ? o.levels : []).slice(0, 4).map(L => {
    L = L && typeof L === 'object' ? L : {};
    return { albums: (Array.isArray(L.albums) ? L.albums : []).map(a => cleanStr(a, 8)).filter(Boolean), name: cleanStr(L.name, 32), period: cleanStr(L.period, 32),
      blurb: cleanStr(L.blurb, 240), scene: Scenes.validate(L.scene), songs: (Array.isArray(L.songs) ? L.songs : []).slice(0, 12).map(planSong).filter(Boolean) };
  }).filter(L => L.albums.length);
  if (!levels.length) throw new Error('Claude couldn’t split that career into eras. Try building it again.');
  return { artist: cleanStr(o.artist || query, 60), tagline: cleanStr(o.tagline, 110), few: !!o.few, levels };
}

/* ---------- checking the plan against real data ---------- */
const Career = {
  PICKS: 3, ALTS: 3,
  cleanTitle(t){ return String(t || '').replace(/\s*[(\[](feat|ft|featuring|with)\b[^)\]]*[)\]]/gi, '').trim(); },
  // an album whose title appears word for word in this name
  albumIn(name, albums){
    const n = ' ' + Lookup.albumKey(name) + ' ';
    return albums.find(a => { const k = Lookup.albumKey(a.title); return k && n.includes(' ' + k + ' '); }) || null;
  },
  // a title in the tracklists: on the album Claude named, else the earliest album that has it
  locate(title, claimed, disc){
    const tv = Lookup.normTitle(title); if (!tv.length) return null;
    const hit = a => a.tracks.find(t => Lookup.normTitle(t.title).some(x => tv.includes(x)));
    const own = disc.albums.find(a => a.id === claimed), t0 = own && hit(own);
    if (t0) return { album: own, track: t0 };
    for (const a of disc.albums) { const t = hit(a); if (t) return { album: a, track: t }; }
    return null;
  },
  // which albums each level owns: in time order, no album in two levels, no level reaching back into an earlier one
  eras(plan, disc){
    const idx = new Map(disc.albums.map((a, i) => [a.id, i]));
    const lv = plan.levels.map(L => ({ plan: L, ids: [...new Set(L.albums)].filter(id => idx.has(id)) })).filter(x => x.ids.length);
    const first = x => Math.min(...x.ids.map(id => idx.get(id)));
    lv.sort((a, b) => first(a) - first(b));
    const owner = new Map();
    lv.forEach((x, li) => x.ids.forEach(id => { if (!owner.has(id)) owner.set(id, li); }));
    let run = 0;
    disc.albums.forEach(a => { if (!owner.has(a.id)) return; run = Math.max(run, owner.get(a.id)); owner.set(a.id, run); });
    return lv.map((x, li) => ({ plan: x.plan, ids: disc.albums.filter(a => owner.get(a.id) === li && a.tracks.length).map(a => a.id) })).filter(x => x.ids.length).slice(0, 3);
  },
  // Claude's songs, each found in the tracklists and filed under the level that owns its album
  // (a song Claude put in the wrong era goes to its real one, after that level's own picks)
  // lists[li]: the songs Claude listed for level li (li -1: a level that was dropped)
  queue(eras, lists, disc, seen, rejected){
    const out = eras.map(() => []);
    lists.forEach(([li, songs]) => (songs || []).forEach((s, rank) => {
      const at = this.locate(s.title, s.album, disc);
      if (!at) { rejected.push({ title: s.title, why: 'not on any of the albums' }); return; }
      const k = at.track.trackId; if (seen.has(k)) return;
      const home = eras.findIndex(e => e.ids.includes(at.album.id));
      if (home < 0) { rejected.push({ title: at.track.title, why: 'its album is outside every level' }); return; }
      seen.add(k);
      out[home].push({ hint: s, album: at.album, track: at.track, order: (home === li ? 0 : 100) + rank });
    }));
    out.forEach(q => q.sort((a, b) => a.order - b.order));
    return out;
  },
  // how hard a chart is to play: distinct chords, the shapes (with the best capo), barre chords, changes per bar, tempo
  stats(secs, hint){
    hint = hint || {};
    const seq = []; (secs || []).forEach(s => (s.chords || []).forEach((c, i) => { if (parseChord(c)) seq.push({ c, b: s.beats && s.beats[i] }); }));
    const ids = seq.map(x => Chart.cid(x.c)).filter(v => v >= 0), cnt = new Map();
    ids.forEach(v => cnt.set(v, (cnt.get(v) || 0) + 1));
    const distinct = cnt.size, top = ids.length ? Math.max(...cnt.values()) / ids.length : 1;
    const names = [...new Set(seq.map(x => x.c))];
    let best = { d: 0, barre: 0, capo: 0, s: 1e9 };
    for (let t = 0; t <= 7; t++) {
      const vs = names.map(n => parseChord(transposeName(n, (12 - t) % 12))).filter(Boolean).map(ch => voicingFor(ch, false));
      if (!vs.length) break;
      const d = vs.reduce((a, v) => a + v.diff, 0) / vs.length, barre = vs.filter(v => v.barre).length / vs.length, s = d + barre * 2 + (t ? 0.15 : 0);
      if (s < best.s) best = { d, barre, capo: t, s };
    }
    const timed = seq.filter(x => x.b > 0);
    const cpb = timed.length > 3 && timed.length >= seq.length * 0.8 ? timed.length / (timed.reduce((a, x) => a + x.b, 0) / 4) : clampNum(hint.changes, 0.25, 4, 1);
    const bpm = clampNum(hint.bpm, 40, 220, 100);
    const score = distinct * 0.45 + best.d * 0.9 + best.barre * 2 + cpb * 1.2 + Math.max(0, bpm - 80) / 40;
    return { distinct, top: +top.toFixed(2), shape: +best.d.toFixed(2), barre: +best.barre.toFixed(2), capo: best.capo, cpb: +cpb.toFixed(2), bpm: Math.round(bpm), score: +score.toFixed(2) };
  },
  playable(st){ return st.distinct >= 2 && st.top <= 0.8; },
  song(c, r){
    const a = c.album, ty = c.track.year, year = ty && ty <= a.year && ty >= a.year - 1 ? ty : a.year;   // a lead single can come out the year before its album
    const t = c.track;
    return { title: this.cleanTitle(t.title) || t.title, album: a.title, albumId: a.id, year, why: c.hint.why || '', score: r.stats.score, src: r.src,
      stats: { distinct: r.stats.distinct, barre: r.stats.barre, cpb: r.stats.cpb, bpm: r.stats.bpm, capo: r.stats.capo },
      track: { trackId: t.trackId, title: t.title, artist: t.artist, artistId: t.artistId, album: t.album, year: t.year, durationMs: t.durationMs, previewUrl: t.previewUrl, genre: t.genre, art: t.art, url: t.url } };
  },
  // name, album chips and years, from the songs the level actually has
  meta(L, albums, li){
    const used = albums.filter(a => L.songs.some(s => s.albumId === a.id));
    const one = used.length === 1 ? used[0] : null, named = this.albumIn(L.claim, albums);
    let name = '';
    if (named) { if (one && one.id === named.id) name = Lookup.albumKey(L.claim) === Lookup.albumKey(named.title) ? named.title : L.claim; }
    else name = L.claim;
    const ys = [...used.map(a => a.year), ...L.songs.map(s => s.year)].filter(Boolean), y1 = Math.min(...ys), y2 = Math.max(...ys);
    L.years = ys.length ? (y1 === y2 ? String(y1) : y1 + '–' + y2) : '';
    if (!name) name = [L.period].find(n => n && !this.albumIn(n, albums)) || (L.years ? 'The ' + L.years + ' Era' : 'Level ' + (li + 1));
    L.name = name;
    L.albumId = named && one && named.id === one.id ? one.id : '';     // named after an album: only that album's songs, swaps included
    L.albums = used.map(a => a.title);
    return L;
  },
  options(L){ return (L.alts || []).filter(s => (!L.albumId || s.albumId === L.albumId) && !L.songs.some(x => x.track && s.track && x.track.trackId === s.track.trackId)).slice(0, 3); },

  // plan -> levels of checked songs. env: {probe(track, hint) -> {ok, src, stats, reason}, askMore(asks) -> plan-like JSON, onStep(text)}
  async verify(plan, disc, env){
    const eras = this.eras(plan, disc);
    if (!eras.length) throw Object.assign(new Error('None of the eras matched the albums.'), { code: 'story_eras' });
    const seen = new Set(), rejected = [];
    // songs Claude put under a level that was dropped still count, in the level that owns their album
    const queues = this.queue(eras, [...eras.map((e, li) => [li, e.plan.songs]), ...plan.levels.filter(L => !eras.some(e => e.plan === L)).map(L => [-1, L.songs])], disc, seen, rejected);
    const ok = eras.map(() => []), tried = eras.map(() => []), pos = eras.map(() => 0);
    let checked = 0;
    const run = async li => {
      const q = queues[li];
      while (pos[li] < q.length && ok[li].length < this.PICKS + this.ALTS) {
        const batch = q.slice(pos[li], pos[li] + 3); pos[li] += batch.length;
        const rs = await Promise.all(batch.map(c => env.probe(c.track, c.hint)));
        batch.forEach((c, j) => {
          checked++; tried[li].push(c.track.title);
          if (rs[j] && rs[j].ok) ok[li].push(this.song(c, rs[j])); else rejected.push({ title: c.track.title, why: rs[j] && rs[j].reason || 'no chart' });
        });
        env.onStep && env.onStep(`Checking the chords: ${checked} song${checked === 1 ? '' : 's'} so far`);
      }
    };
    for (let li = 0; li < eras.length; li++) await run(li);
    // levels still short of three: one more round of candidates
    const short = eras.map((e, li) => li).filter(li => ok[li].length < this.PICKS);
    if (short.length && env.askMore) {
      let more = null;
      try { more = await env.askMore(short.map(li => ({ level: li + 1, albums: eras[li].ids, tried: tried[li] }))); } catch (e) { if (e && e.name === 'AbortError') throw e; more = null; }
      const lists = [];
      for (const x of (more && Array.isArray(more.levels) ? more.levels : [])) {
        const li = Math.round(Number(x && x.level)) - 1;
        if (short.includes(li)) lists.push([li, (Array.isArray(x.songs) ? x.songs : []).slice(0, 8).map(planSong).filter(Boolean)]);
      }
      this.queue(eras, lists, disc, seen, rejected).forEach((q, li) => queues[li].push(...q));
      for (const li of short) await run(li);
    }
    const levels = [];
    eras.forEach((e, li) => {
      if (!ok[li].length) return;
      const L = { claim: e.plan.name || e.plan.period, period: e.plan.period, blurb: e.plan.blurb, scene: e.plan.scene, pool: e.ids,
        songs: ok[li].slice(0, this.PICKS).sort((a, b) => a.score - b.score), alts: ok[li].slice(this.PICKS, this.PICKS + this.ALTS) };
      L.few = L.songs.length < this.PICKS ? L.songs.length : 0;
      levels.push(this.meta(L, disc.albums, levels.length));
    });
    return { levels, rejected, checked };
  },
};

const Story = {
  cur: null, ctx: null, buildCtl: null, charting: {}, fresh: -1, swapping: null,

  /* ---------- storage ---------- */
  all(){
    const raw = Store.get('careers', []);
    return (Array.isArray(raw) ? raw : []).filter(c => c && c.id && Array.isArray(c.levels) && c.levels.length >= 1 && c.levels.length <= 3 && c.levels.every(L => L && Array.isArray(L.songs) && L.songs.length))
      .map(c => { c.progress = c.progress || {}; c.charts = c.charts || {}; c.levels.forEach(L => { L.scene = Scenes.validate(L.scene); L.albums = Array.isArray(L.albums) ? L.albums : []; }); return c; });
  },
  save(c){ const list = this.all().filter(x => x.id !== c.id); list.unshift(c); Store.set('careers', list.slice(0, 12)); },
  remove(id){ Store.set('careers', this.all().filter(x => x.id !== id)); },
  get(id){ return this.all().find(c => c.id === id) || null; },

  /* ---------- progress ---------- */
  key: (li, si) => li + '-' + si,
  grade(c, li, si){ const p = c.progress[this.key(li, si)]; return p ? p.grade : ''; },
  passed(c, li, si){ const g = this.grade(c, li, si); return !!g && GRADE_RANK[g] >= GRADE_RANK[STORY_TIERS[li].pass]; },
  stars(c, li, si){ const g = this.grade(c, li, si); if (!this.passed(c, li, si)) return 0; return g === 'S' ? 3 : GRADE_RANK[g] >= GRADE_RANK.A ? 2 : 1; },
  levelDone(c, li){ return c.levels[li].songs.every((s, si) => this.passed(c, li, si)); },
  levelOpen(c, li){ return li === 0 || this.levelDone(c, li - 1); },
  mastered(c){ return c.levels.every((L, li) => this.levelDone(c, li)); },
  slots(c){ const out = []; c.levels.forEach((L, li) => L.songs.forEach((s, si) => out.push([li, si]))); return out; },
  totalStars(c){ return this.slots(c).reduce((n, [li, si]) => n + this.stars(c, li, si), 0); },
  cleared(c){ return this.slots(c).filter(([li, si]) => this.passed(c, li, si)).length; },
  currentLevel(c){ for (let li = 0; li < c.levels.length; li++) if (!this.levelDone(c, li)) return li; return c.levels.length - 1; },
  starStr(n){ return '★'.repeat(n) + '<i>' + '★'.repeat(3 - n) + '</i>'; },

  /* ---------- screens ---------- */
  init(){
    $('btn-story').onclick = () => UI.modeBurst($('btn-story'), 'story', () => this.openPick());
    $('btn-story-home').onclick = () => { this.stopBuild(); UI.show('title'); UI.renderLists(); };
    $('btn-story-new').onclick = () => { this.stopBuild(); this.openPick(); };
    $('story-form').addEventListener('submit', e => { e.preventDefault(); this.build($('story-input').value); });
    $('btn-story-remake').onclick = () => { if (this.cur) { $('story-input').value = this.cur.artist; this.openPick(); this.build(this.cur.artist, true); } };
    $('sw-list').addEventListener('click', e => { const b = e.target.closest('[data-alt]'); if (b) this.swap(+b.dataset.alt); });
    $('btn-story-custom').onclick = () => { Sfx.open(); this.openCustom(); };
    // the promo art: three eras, from the street to the arena
    const demo = [{ setting: 'street', props: ['cd-table'] }, { setting: 'campus', props: ['pennants'] }, { setting: 'arena', props: ['lasers'] }];
    demo.forEach((d, i) => { $('sp-a' + (i + 1)).src = Scenes.dataUrl(Scenes.validate(d), 240, 200, { floorY: 170 }); });
    this.renderChips();
    this.renderCurated();
  },
  renderCurated(){
    const box = $('story-curated'); if (!box) return;
    box.innerHTML = CURATED.map((x, i) => `<button type="button" class="cur-card" data-cur="${i}"><img alt="" src="${Scenes.dataUrl(Scenes.validate(x.levels[1] ? x.levels[1].scene : x.levels[0].scene), 240, 120, { floorY: 104 })}"><b>${esc(x.artist)}</b><small>${x.levels.map(L => esc(L.name)).join(' → ')}</small></button>`).join('');
    box.querySelectorAll('[data-cur]').forEach(b => b.onclick = () => { const x = CURATED[+b.dataset.cur]; Sfx.open(); $('story-input').value = x.artist; this.build(x.artist, false, x); });
  },
  chip(c, onRemove){
    const b = document.createElement('div'); b.className = 'cchip'; b.tabIndex = 0; b.setAttribute('role', 'button');
    const li = this.currentLevel(c), done = this.mastered(c);
    b.setAttribute('aria-label', `${c.artist} career, ${done ? 'mastered' : 'level ' + (li + 1)}`);
    b.innerHTML = `<img alt="" src="${Scenes.dataUrl(c.levels[li].scene, 160, 90, { floorY: 76 })}"><span>${esc(c.artist)} <small>${done ? '· Mastered ★' + this.totalStars(c) : '· Level ' + (li + 1) + ' · ' + this.totalStars(c) + '★'}</small></span>`;
    const go = () => { Sfx.open(); this.openCareer(c.id); };
    b.addEventListener('click', e => { if (!e.target.closest('.x')) go(); });
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    if (onRemove) { const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '✕'; x.setAttribute('aria-label', 'Delete the ' + c.artist + ' career'); x.addEventListener('click', e => { e.stopPropagation(); onRemove(); }); b.appendChild(x); }
    return b;
  },
  renderChips(){
    const list = this.all();
    const t = $('careers-title'); t.textContent = '';
    list.slice(0, 6).forEach(c => t.appendChild(this.chip(c)));
    const box = $('story-saved'); box.textContent = '';
    list.forEach(c => box.appendChild(this.chip(c, () => { if (confirm(`Delete your ${c.artist} career and its progress?`)) { this.remove(c.id); this.renderChips(); } })));
    $('story-saved-h').hidden = !list.length;
  },
  openPick(){
    this.cur = null; UI.storyCtx = null;
    $('story-pick').hidden = false; $('story-career').hidden = true; $('btn-story-new').hidden = true;
    this.renderChips(); this.envNotice();
    UI.show('story').then(() => { if (!UI.aiAvailable() && !$('story-input').value) return; $('story-input').focus(); });
  },
  envNotice(){
    const n = $('story-notice'); n.textContent = '';
    if (UI.aiAvailable()) return;
    const d = document.createElement('div'); d.className = 'notice';
    d.innerHTML = UI.inViewer ? '<b>Story mode is starting up.</b> Give it a few seconds, then build a career.' : '<b>Story mode needs your Anthropic API key</b>, the same one song search uses. Add it on the home screen or in Settings, then come back.';
    n.appendChild(d);
  },
  stopBuild(){ if (this.buildCtl) { this.buildCtl.abort(); this.buildCtl = null; } },
  // cur: a ready-made career (CURATED): its plan replaces Claude's, the checks stay the same
  async build(q, rebuild, cur){
    q = String(q || '').trim(); if (!q) { $('story-input').focus(); return; }
    if (!cur) cur = CURATED.find(x => Lookup.normArtist(x.artist) === Lookup.normArtist(q)) || null;
    if (!cur && !UI.aiAvailable()) { this.envNotice(); Sfx.fail(); return; }
    const existing = this.all().find(c => c.artist.toLowerCase() === q.toLowerCase() || c.id === 'c-' + slug(q));
    if (existing && !rebuild) { this.openCareer(existing.id); return; }
    this.stopBuild();
    const ctl = this.buildCtl = new AbortController(), signal = ctl.signal;
    const st = $('story-status');
    const steps = ['Reading the discography', 'Mapping the eras', 'Checking every song’s chords', 'Ordering easy to hard'];
    st.innerHTML = `<div class="story-load"><span class="thinking"><span class="eq"><i></i><i></i><i></i><i></i></span> <span id="story-step">Building the ${esc(q.replace(/(^|\s)\S/g, m => m.toUpperCase()))} career…</span> <button class="btn btn-sm" type="button" id="btn-stop-story">Stop</button></span><div class="sl-steps">${steps.map(s => `<span>${s}</span>`).join('')}</div></div>`;
    $('btn-stop-story').onclick = () => ctl.abort();
    const spans = st.querySelectorAll('.sl-steps span');
    const step = (k, text) => { spans.forEach((x, i) => x.classList.toggle('on', i <= k)); if (text && $('story-step')) $('story-step').textContent = text; };
    step(0, `Looking up ${q}’s albums…`);
    Sfx.searchStart();
    try {
      // 1. the real discography: studio albums, first release dates, tracklists
      const disc = await Lookup.discography(q, { signal });
      if (signal.aborted) return;
      if (!disc || !disc.albums.some(a => a.tracks.length)) { Sfx.fail(); st.textContent = `I couldn’t find studio albums for “${q}” in Apple’s catalogue. Check the spelling, or try another artist.`; return; }
      // 2. Claude maps the eras and suggests songs, from that discography only
      step(1, `Mapping ${disc.artist}’s career into eras…`);
      const web = UI.canWeb(), ask = p => UI.askClaude(p, signal, 'default', web ? { webSearch: true } : undefined);
      const data = cur ? curatedPlan(cur, disc) : await ask(careerPrompt(disc.artist, disc, web));
      if (signal.aborted) return;
      if (!data || data.found === false) {
        Sfx.fail(); st.innerHTML = `I couldn’t build a career for “${esc(q)}”. Try one of these?`;
        const box = document.createElement('div'); box.className = 'sugg';
        (Array.isArray(data && data.suggestions) ? data.suggestions : []).slice(0, 6).forEach(sg => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = String(sg).slice(0, 60); b.onclick = () => { $('story-input').value = b.textContent; this.build(b.textContent); }; box.appendChild(b); });
        st.appendChild(box); return;
      }
      const plan = validatePlan(data, disc.artist);
      // 3. every song is checked against real chord charts; failures are replaced by the next playable song
      step(2, 'Checking the chords…');
      const probeCtx = { signal, web, webLeft: web ? 3 : 0 };
      const res = await Career.verify(plan, disc, {
        probe: (track, hint) => this.probe(track, hint, probeCtx),
        askMore: UI.aiAvailable() ? asks => ask(careerMorePrompt(disc.artist, disc, asks, web)) : null,
        onStep: text => step(2, text + '…'),
      });
      if (signal.aborted) return;
      const count = res.levels.reduce((n, L) => n + L.songs.length, 0);
      if (count < 3) { Sfx.fail(); st.textContent = `Only ${count} of ${disc.artist}’s songs passed the chord check, so there isn’t a career to play yet. Try another artist.`; return; }
      step(3, 'Ordering the songs easy to hard…');
      const c = { v: 2, artist: disc.artist || plan.artist, tagline: plan.tagline, charts: {}, progress: {}, created: Date.now(),
        few: plan.few || res.levels.some(L => L.few) || res.levels.length < Math.min(3, disc.albums.filter(a => a.tracks.length).length),
        disc: { source: disc.source, albums: disc.albums.map(a => ({ id: a.id, title: a.title, year: a.year })) }, levels: res.levels };
      c.id = 'c-' + slug(c.artist);
      const old = this.get(c.id);
      if (old && rebuild) Object.assign(c, { created: old.created });
      this.save(c); st.textContent = ''; Sfx.found();
      this.openCareer(c.id);
    } catch (e) {
      if (signal.aborted || (e && e.code === 'cancelled')) { st.textContent = 'Stopped.'; return; }
      // our own messages as they are; lookups and Claude through the usual copy
      st.textContent = e && e.name === 'AbortError' ? 'The music databases took too long to answer. Try again.'
        : e && e.message && !e.code && !e.status && !(e instanceof TypeError) ? e.message : UI.lookupErr(e, 'story');
      Sfx.fail();
      if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled')) { UI.sample = null; UI.refreshEnv(); }
    } finally { if (this.buildCtl === ctl) this.buildCtl = null; }
  },
  // is there a real chord chart for this recording, and is it more than one chord? The same sources the chart itself uses:
  // Chordonomicon, then Hooktheory, then (with an API key, a few per career) chord sites on the web
  async probe(track, hint, ctx){
    let secs = null, src = '';
    try {
      const f = await Lookup.findRows(track, { signal: ctx.signal });
      if (f.rows.length) { const n = r => r.sections.reduce((a, x) => a + x.chords.length, 0); secs = f.rows.slice().sort((a, b) => n(b) - n(a))[0].sections; src = 'dataset'; }
    } catch (e) { if (e && e.name === 'AbortError') throw e; }
    if (!secs) { try { const ht = await Lookup.findHT(track); if (ht) { secs = Chart.htSections(ht); src = 'hooktheory'; } } catch (e) {} }
    if (!secs && ctx.web && ctx.webLeft > 0) {
      ctx.webLeft--;
      try {
        const w = await Chart.webChart(track, { signal: ctx.signal, keep: true, askClaude: (p, sig, extra) => UI.askClaude(p, sig, 'default', extra) });
        secs = w.sections; src = 'web'; if (w.bpm) hint = { ...hint, bpm: w.bpm };
      } catch (e) { if (e && e.name === 'AbortError') throw e; if (e && ['web_search_off', 'bad_key', 'no_web', 'bad_model'].includes(e.code)) ctx.webLeft = 0; }
    }
    if (!secs) return { ok: false, reason: 'no chord chart found' };
    const stats = Career.stats(secs, hint);
    return Career.playable(stats) ? { ok: true, src, stats } : { ok: false, reason: 'the chart is basically one chord', stats };
  },
  openCareer(id, fresh){
    const c = this.get(id); if (!c) { this.openPick(); return; }
    this.cur = c; UI.storyCtx = null; this.fresh = fresh == null ? -1 : fresh;
    $('story-pick').hidden = true; $('story-career').hidden = false; $('btn-story-new').hidden = false;
    const target = this.fresh;
    this.renderCareer();
    UI.show('story').then(() => {
      const el = target >= 0 ? document.querySelectorAll('#story-levels .era')[target] : document.querySelector('#story-levels .stop.next');
      if (el) setTimeout(() => { el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: target >= 0 ? 'start' : 'center' }); if (target >= 0) Sfx.found(); }, 250);
    });
  },
  renderCareer(){
    const c = this.cur; if (!c) return;
    $('career-artist').textContent = c.artist;
    $('career-tag').textContent = c.tagline || '';
    const stars = this.totalStars(c), n = this.cleared(c);
    const total = this.slots(c).length;
    $('career-stars').textContent = `${stars} / ${total * 3} ★`;
    $('career-fill').style.width = Math.round(n / total * 100) + '%';
    $('career-state').textContent = this.mastered(c) ? `Career mastered! Chase ★★★ on every song.` : `${n} of ${total} songs cleared · Level ${this.currentLevel(c) + 1} of ${c.levels.length}`;
    const note = $('career-note');
    note.hidden = !(c.few || c.v !== 2);
    note.textContent = c.v !== 2 ? 'This career was built before songs were checked against real chord charts and discographies. Rebuild it (below) for checked eras and guitar-friendly picks.'
      : `${c.artist} doesn’t have many guitar-friendly songs, so these are the most playable ones that passed the chord check.`;
    const box = $('story-levels'); box.textContent = '';
    // the roadmap: one region per era (its stage as the backdrop), a road winding through the songs,
    // a gate between eras, the trophy at the end
    const next = this.nextStop(c);
    let g = 0;
    c.levels.forEach((L, li) => {
      const tier = STORY_TIERS[li], open = this.levelOpen(c, li), done = this.levelDone(c, li);
      const el = document.createElement('section'); el.className = 'era' + (open ? '' : ' locked') + (done ? ' done' : '') + (this.fresh === li ? ' fresh' : '');
      el.setAttribute('aria-label', `Level ${li + 1}: ${L.name}${open ? '' : ', locked'}`);
      const pal = L.scene.palette || ['#2E3A5C', '#FFCE3A', '#FF5E7E'];
      el.style.setProperty('--era-a', pal[1]); el.style.setProperty('--era-b', pal[2]);
      const STEP = window.innerWidth < 560 ? 208 : 168, top = 30, h = top + L.songs.length * STEP + 10;
      const xs = L.songs.map((s, si) => ((g + si) % 2 ? 76 : 24));
      el.innerHTML = `<div class="era-bg" style="background-image:url('${Scenes.dataUrl(L.scene, 1000, 760, { floorY: 640 })}')"></div>
        <header class="era-card">
          <div class="tagrow"><span class="ltag t${li + 1}">LEVEL ${li + 1} · ${tier.name.toUpperCase()}</span>${done ? '<span class="ltag done">CLEARED ✓</span>' : this.fresh === li ? '<span class="ltag done">UNLOCKED!</span>' : ''}<span class="need">Clear with a ${tier.pass} or better</span></div>
          <div class="yrs">${esc(L.years)}</div><h2 class="nm">${esc(L.name)}</h2>
          ${L.albums.length ? `<div class="albums">${L.albums.map(a => `<span class="chip">${esc(a)}</span>`).join('')}</div>` : ''}
          ${L.blurb ? `<p class="blurb">${esc(L.blurb)}</p>` : ''}${L.scene.stage ? `<p class="set">🎨 ${esc(L.scene.stage)}</p>` : ''}${L.few ? `<p class="few">Only ${L.few} song${L.few === 1 ? '' : 's'} from this era passed the chord check, so this level is shorter.</p>` : ''}
          <div class="rules">${esc(tier.rules)}</div>
        </header>
        <div class="road" style="height:${h}px">
          <svg class="road-svg" viewBox="0 0 1000 ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="road-edge" d=""/><path class="road-top" d=""/><path class="road-line" d=""/></svg>
        </div>`;
      const road = el.querySelector('.road');
      const pts = xs.map((x, si) => [x * 10, top + si * STEP + 42]);
      // the road comes in from the top of the region, snakes through each stop and leaves at the bottom
      const d = [`M ${pts[0][0]} 0`, `L ${pts[0][0]} ${pts[0][1]}`];
      for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], my = (y0 + y1) / 2; d.push(`C ${x0} ${my}, ${x1} ${my}, ${x1} ${y1}`); }
      d.push(`L ${pts[pts.length - 1][0]} ${h}`);
      el.querySelectorAll('.road-svg path').forEach(p => p.setAttribute('d', d.join(' ')));
      L.songs.forEach((s, si) => road.append(...this.stop(c, li, si, open, xs[si], top + si * STEP, next)));
      g += L.songs.length;
      box.appendChild(el);
      // the gate to the next era
      if (li + 1 < c.levels.length) {
        const gt = document.createElement('div'); gt.className = 'gate' + (done ? ' open' : '');
        gt.innerHTML = done ? `<span>✓ Level ${li + 2} unlocked</span>` : `<span>🔒 Clear every song above to unlock Level ${li + 2}</span>`;
        box.appendChild(gt);
      }
    });
    const fin = document.createElement('div'); fin.className = 'finale' + (this.mastered(c) ? ' won' : '');
    fin.innerHTML = `<span class="trophy">🏆</span><b>${this.mastered(c) ? 'Career mastered!' : 'Master the career'}</b><small>${this.mastered(c) ? 'Now chase ★★★ on every song.' : `Clear all ${this.slots(c).length} songs`}</small>`;
    box.appendChild(fin);
    this.fresh = -1;
  },
  // the first song still to clear, in the furthest open level
  nextStop(c){ for (let li = 0; li < c.levels.length; li++) { if (!this.levelOpen(c, li)) break; const si = c.levels[li].songs.findIndex((s, k) => !this.passed(c, li, k)); if (si >= 0) return li + '-' + si; } return ''; },
  stop(c, li, si, open, x, y, next){
    const L = c.levels[li], s = L.songs[si], k = this.key(li, si), p = c.progress[k], passed = this.passed(c, li, si);
    const busy = this.charting[c.id + k], working = busy === 'busy' || !!(busy && busy.step), isNext = next === k;
    const w = document.createElement('div');
    w.className = 'stop ' + (x < 50 ? 'l' : 'r') + (passed ? ' passed' : p ? ' tried' : '') + (!open ? ' locked' : '') + (isNext ? ' next' : '') + (working ? ' busy' : '') + (busy && busy.err ? ' err' : '');
    w.style.setProperty('--x', x + '%'); w.style.top = y + 'px';
    let state;
    if (!open) state = '🔒 Locked';
    else if (working) state = '<span class="eq"><i></i><i></i><i></i><i></i></span> ' + esc(busy && busy.step || 'Looking up the chords…');
    else if (busy && busy.err) state = esc(busy.err);
    else if (passed) state = `Cleared · best ${esc(p.grade)}`;
    else if (p) state = `Best ${esc(p.grade)} · need ${STORY_TIERS[li].pass}`;
    else state = isNext ? 'Up next' : 'Not played yet';
    const face = !open ? '🔒' : passed ? '✓' : String(si + 1);
    w.innerHTML = `${isNext ? '<span class="you">YOU ARE HERE</span>' : ''}
      <button type="button" class="node" aria-label="${esc(s.title)}. ${esc(state.replace(/<[^>]+>/g, ''))}"><span>${face}</span></button>
      ${passed ? `<span class="stars">${this.starStr(this.stars(c, li, si))}</span>` : ''}`;
    // the label takes the rest of the road's width beside the stop
    const lbl = document.createElement('div'); lbl.className = 'stop-lbl ' + (x < 50 ? 'l' : 'r') + (!open ? ' locked' : '');
    lbl.style.top = (y - 4) + 'px'; lbl.style.setProperty('--x', x + '%');
    lbl.innerHTML = `<b class="t">${esc(s.title)}</b><span class="a">${esc([s.album, s.year].filter(Boolean).join(' · '))}</span>${s.why ? `<i class="why">${esc(s.why)}</i>` : ''}<span class="st">${state}</span><span class="acts"></span>`;
    const node = w.querySelector('.node'), acts = lbl.querySelector('.acts');
    const addAct = (label, aria, fn, dis) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'swap'; b.textContent = label; b.setAttribute('aria-label', aria); b.disabled = !!dis; b.onclick = e => { e.stopPropagation(); Sfx.open(); fn(); }; acts.appendChild(b); };
    if (open) { addAct('▶ Play', `Play ${s.title}`, () => this.playSong(c.id, li, si), working); acts.lastChild.classList.add('play'); }
    if (Career.options(L).length) addAct('⇄ Swap', `Swap ${s.title} for another song from this era`, () => this.openSwap(c.id, li, si), working);
    if (c.v === 2) addAct('✎ Pick', `Pick any song from this era instead of ${s.title}`, () => this.openPicker(c.id, li, si), working);
    if (!open) { node.setAttribute('aria-disabled', 'true'); node.onclick = () => Sfx.fail(); return [w, lbl]; }
    node.onclick = () => this.playSong(c.id, li, si);
    node.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') Sfx.hover(li * 3 + si); });
    return [w, lbl];
  },
  /* ---------- swapping a song for another checked one from the same era ---------- */
  openSwap(id, li, si){
    const c = this.get(id); if (!c) return;
    const L = c.levels[li], s = L.songs[si], opts = Career.options(L);
    if (!opts.length) return;
    this.swapping = { id, li, si, opts };
    $('sw-intro').textContent = `Swap “${s.title}” for another song from ${L.albumId ? L.albums[0] : L.name}. Every option passed the chord check.` + (c.progress[this.key(li, si)] ? ` Your best grade on “${s.title}” will be cleared.` : '');
    $('sw-list').innerHTML = opts.map((o, i) => `<button type="button" class="sw-opt" data-alt="${i}"><span class="t">${esc(o.title)}</span><span class="a">${esc([o.album, o.year].filter(Boolean).join(' · '))}</span>${o.why ? `<span class="why">${esc(o.why)}</span>` : ''}</button>`).join('');
    UI.open('m-swap');
  },
  swap(i){
    const x = this.swapping; if (!x) return;
    const c = this.get(x.id), o = x.opts[i]; if (!c || !o) return;
    this.replaceSong(c, x.li, x.si, o, true);
    this.swapping = null; UI.closeModal(); Sfx.found();
  },
  // put a checked song into a slot: progress and charts follow their songs when the level re-sorts easy -> hard
  replaceSong(c, li, si, o, keepOut){
    const L = c.levels[li], out = L.songs[si];
    const id = s => s.track ? 'it' + s.track.trackId : s.title;
    const prog = new Map(), charts = new Map();
    L.songs.forEach((s, k) => { const kk = this.key(li, k); if (s !== out) { if (c.progress[kk]) prog.set(id(s), c.progress[kk]); if (c.charts[kk]) charts.set(id(s), c.charts[kk]); } delete c.progress[kk]; delete c.charts[kk]; });
    const songs = L.songs.slice(); songs[si] = o;
    L.alts = (L.alts || []).filter(a => id(a) !== id(o));
    if (keepOut && out.track) L.alts.unshift(out);     // the song swapped out comes first, to swap back
    L.songs = songs.sort((a, b) => (a.score || 0) - (b.score || 0));
    L.songs.forEach((s, k) => { const kk = this.key(li, k); if (prog.has(id(s))) c.progress[kk] = prog.get(id(s)); if (charts.has(id(s))) c.charts[kk] = charts.get(id(s)); });
    Object.keys(this.charting).filter(k => k.startsWith(c.id + li + '-')).forEach(k => delete this.charting[k]);
    if (c.v === 2) Career.meta(L, (c.disc && c.disc.albums) || [], li);
    this.save(c); this.cur = c; this.renderCareer();
  },

  /* ---------- picking any song from an era's albums ---------- */
  discCache: {},
  async loadDisc(artist, signal){
    const k = Lookup.normArtist(artist);
    if (!this.discCache[k]) this.discCache[k] = Lookup.discography(artist, { signal }).catch(e => { delete this.discCache[k]; throw e; });
    return this.discCache[k];
  },
  pctx(signal){ const w = this._web || (this._web = { left: 3 }); return { signal, web: UI.canWeb(), get webLeft(){ return w.left; }, set webLeft(v){ w.left = v; } }; },
  // the albums a level may draw from: its own album if it's named after one, else its run of albums
  levelAlbums(c, L, disc){
    const own = (c.disc && c.disc.albums) || [], keyOf = id => { const a = own.find(x => x.id === id); return a ? Lookup.albumKey(a.title) : ''; };
    const keys = new Set((L.albumId ? [L.albumId] : (L.pool || [])).map(keyOf).filter(Boolean));
    if (!keys.size) L.albums.forEach(t => keys.add(Lookup.albumKey(t)));
    return disc.albums.filter(a => keys.has(Lookup.albumKey(a.title)) && a.tracks.length);
  },
  async openPicker(id, li, si){
    const c = this.get(id); if (!c) return;
    const L = c.levels[li], s = L.songs[si];
    this.picking = { id, li, si };
    $('pk-intro').textContent = `Loading ${c.artist}’s albums…`; $('pk-list').innerHTML = '';
    UI.open('m-pick');
    let disc;
    try { disc = await this.loadDisc(c.artist); } catch (e) { $('pk-intro').textContent = UI.lookupErr(e, 'story'); return; }
    if (!this.picking || this.picking.id !== id) return;
    const albums = this.levelAlbums(c, L, disc), have = new Set(L.songs.map(x => x.track && x.track.trackId));
    const scope = L.albumId ? L.albums[0] : albums.length === 1 ? albums[0].title : `this era’s albums (${albums.map(a => a.title).join(', ')})`;
    $('pk-intro').textContent = `Any song from ${scope} can take the place of “${s.title}”. Each one is checked against real chord charts before it goes in.`;
    const box = $('pk-list'); box.innerHTML = '';
    for (const a of albums) {
      const sec = document.createElement('div'); sec.className = 'pk-alb';
      sec.innerHTML = `<h3>${esc(a.title)} <small>${a.year}</small></h3>`;
      for (const t of a.tracks) {
        if (have.has(t.trackId)) continue;
        const row = document.createElement('div'); row.className = 'pk-row';
        row.innerHTML = `<span class="t">${esc(Career.cleanTitle(t.title))}</span><span class="r"></span>`;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-sm'; b.textContent = 'Use this';
        b.onclick = async () => {
          b.disabled = true; row.querySelector('.r').innerHTML = '<span class="eq"><i></i><i></i><i></i><i></i></span> Checking the chords…';
          let r; try { r = await this.probe(t, { why: '' }, this.pctx()); } catch (e) { r = { ok: false, reason: UI.lookupErr(e, 'story') }; }
          if (!r.ok) { row.classList.add('bad'); row.querySelector('.r').textContent = r.reason === 'no chord chart found' ? 'No chord chart found' : r.reason === 'the chart is basically one chord' ? 'Basically one chord' : r.reason; Sfx.fail(); return; }
          const cc = this.get(id); if (!cc) return;
          const own = (cc.disc && cc.disc.albums || []).find(x => Lookup.albumKey(x.title) === Lookup.albumKey(a.title)) || a;
          this.replaceSong(cc, li, si, Career.song({ album: own, track: t, hint: { why: 'Your pick' } }, r), true);
          this.picking = null; UI.closeModal(); Sfx.found();
        };
        row.appendChild(b); sec.appendChild(row);
      }
      box.appendChild(sec);
    }
  },

  async theme(id){
    const c = this.get(id); if (!c) return;
    this.theming = id; if (this.cur && this.cur.id === id) this.renderCareer();
    try {
      const d = await UI.askClaude(careerThemePrompt(c), undefined, 'default');
      const cc = this.get(id); if (!cc || !d || !Array.isArray(d.levels)) return;
      if (d.tagline) cc.tagline = cleanStr(d.tagline, 110);
      cc.levels.forEach((L, i) => { const x = d.levels[i]; if (!x) return; if (x.blurb) L.blurb = cleanStr(x.blurb, 240); if (x.scene) L.scene = Scenes.validate(x.scene); });
      this.save(cc);
    } catch (e) { /* the default stages stay */ }
    finally { this.theming = null; const cc = this.get(id); if (cc && UI.screen === 'story' && this.cur && this.cur.id === id) { this.cur = cc; this.renderCareer(); } }
  },
  /* ---------- building a career yourself: your albums per level, your songs ---------- */
  async openCustom(){
    const q = $('story-input').value.trim(); if (!q) { $('story-input').focus(); return; }
    const box = $('story-custom'); box.hidden = false; $('story-status').textContent = '';
    box.innerHTML = `<div class="cb-card"><p><span class="eq"><i></i><i></i><i></i><i></i></span> Looking up ${esc(q)}’s albums…</p></div>`;
    let disc;
    try { disc = await this.loadDisc(q); } catch (e) { box.innerHTML = `<div class="cb-card"><p class="cb-err">${esc(UI.lookupErr(e, 'story'))}</p></div>`; return; }
    if (!disc || !disc.albums.some(a => a.tracks.length)) { box.innerHTML = `<div class="cb-card"><p class="cb-err">I couldn’t find studio albums for “${esc(q)}”.</p></div>`; return; }
    // a start: the albums split into up to three runs, oldest first
    const usable = disc.albums.filter(a => a.tracks.length), n = Math.min(3, usable.length), assign = {};
    usable.forEach((a, i) => { assign[a.id] = Math.min(n, Math.floor(i * n / usable.length) + 1); });
    this.cb = { disc, assign, picks: { 1: [], 2: [], 3: [] }, checks: {}, names: {} };
    this.renderCustom(); Sfx.found();
  },
  cbLevels(){
    const { disc, assign } = this.cb, used = [...new Set(Object.values(assign).filter(Boolean))].sort();
    let err = '';
    if (!used.length) err = 'Put at least one album in a level.';
    else if (used.some((l, i) => l !== i + 1)) err = 'Use the levels in order: Level 1 first, then 2, then 3.';
    else for (let k = 1; k < used.length; k++) {
      const idx = l => disc.albums.map((a, i) => assign[a.id] === l ? i : -1).filter(i => i >= 0);
      if (Math.max(...idx(k)) > Math.min(...idx(k + 1))) { err = `Level ${k + 1}’s albums have to come after Level ${k}’s. Levels run in time order and don’t overlap.`; break; }
    }
    return { used, err, albumsOf: l => disc.albums.filter(a => assign[a.id] === l) };
  },
  // a level named after an album may only hold that album's songs
  cbNameWarn(l, albums){
    const nm = (this.cb.names[l] || '').trim(), hit = nm && Career.albumIn(nm, this.cb.disc.albums);
    if (!hit) return '';
    const ids = new Set(this.cb.picks[l].map(id => albums.find(a => a.tracks.some(t => t.trackId === id))).filter(Boolean).map(a => a.id));
    if (albums.length === 1 && albums[0].id === hit.id) return '';
    return `<p class="cb-err small">“${esc(hit.title)}” is an album title. A level named after an album can only hold that album’s songs, so this one will get a period name instead${ids.size > 1 ? '' : ' unless it only has that album'}. Try a name for the period, like “The Stadium Years”.</p>`;
  },
  autoName(albums){ return albums.length === 1 ? albums[0].title : ''; },
  renderCustom(){
    const cb = this.cb, box = $('story-custom'); if (!cb) return;
    const { disc } = cb, lv = this.cbLevels();
    const albumRows = disc.albums.map(a => a.tracks.length
      ? `<div class="cb-alb"><span class="t">${esc(a.title)} <small>${a.year}</small></span><span class="cb-seg">${[0, 1, 2, 3].map(l => `<button type="button" data-alb="${a.id}" data-l="${l}" class="${(cb.assign[a.id] || 0) === l ? 'on' : ''} l${l}" aria-label="${l ? 'Level ' + l : 'Leave out'}">${l || '–'}</button>`).join('')}</span></div>`
      : `<div class="cb-alb"><span class="t">${esc(a.title)} <small>${a.year} · not on Apple Music</small></span></div>`).join('');
    let html = `<div class="cb-card"><h2>Your ${esc(disc.artist)} career</h2><p>Put albums into up to three levels, oldest first, then pick the songs you want to play in each.</p>${albumRows}${lv.err ? `<p class="cb-err">${esc(lv.err)}</p>` : ''}</div>`;
    if (!lv.err) for (const l of lv.used) {
      const albums = lv.albumsOf(l), picks = cb.picks[l] || (cb.picks[l] = []);
      const ids = new Set(albums.flatMap(a => a.tracks.map(t => t.trackId)));
      cb.picks[l] = picks.filter(id => ids.has(id));
      html += `<div class="cb-card cb-lvl"><h2>Level ${l} <small class="small">· ${STORY_TIERS[l - 1].name}</small></h2>
        <label class="small"><b>Name</b> <input type="text" data-name="${l}" maxlength="28" value="${esc(cb.names[l] || '')}" placeholder="${esc(this.autoName(albums) || 'A name for this chapter')}"></label>
        ${this.cbNameWarn(l, albums)}
        <p class="small">${cb.picks[l].length} of 5 picked. Songs are checked against real chord charts as you pick them.</p>
        <div class="cb-songs">${albums.map(a => a.tracks.map(t => { const ck = cb.checks[t.trackId] || {}, on = cb.picks[l].includes(t.trackId);
          const r = ck.state === 'busy' ? 'Checking…' : ck.state === 'bad' ? ck.reason : ck.state === 'ok' ? '✓ ' + ck.res.stats.distinct + ' chords' : '';
          return `<label class="cb-song${on ? ' on' : ''}${ck.state === 'bad' ? ' bad' : ''}"><input type="checkbox" data-song="${t.trackId}" data-lv="${l}" ${on ? 'checked' : ''} ${ck.state === 'bad' || ck.state === 'busy' ? 'disabled' : ''}><span class="t">${esc(Career.cleanTitle(t.title))} <small class="small">· ${esc(a.title)}</small></span><span class="r">${esc(r)}</span></label>`; }).join('')).join('')}</div></div>`;
    }
    const ready = !lv.err && lv.used.every(l => cb.picks[l].length) && !Object.values(cb.checks).some(x => x.state === 'busy');
    html += `<div class="cb-card"><p>${ready ? 'Ready. Songs in each level are ordered easy to hard for you.' : 'Pick at least one song in every level.'}</p><div><button class="btn btn-go" type="button" id="btn-cb-save" ${ready ? '' : 'disabled'}>Save my career</button> <button class="btn btn-sm" type="button" id="btn-cb-cancel">Cancel</button></div></div>`;
    box.innerHTML = html;
    box.querySelectorAll('[data-alb]').forEach(b => b.onclick = () => { cb.assign[b.dataset.alb] = +b.dataset.l; Sfx.click && Sfx.click(); this.renderCustom(); });
    box.querySelectorAll('[data-name]').forEach(inp => inp.oninput = () => {
      cb.names[inp.dataset.name] = inp.value;
      const card = inp.closest('.cb-lvl'), old = card.querySelector('.cb-err'), l = +inp.dataset.name, html = this.cbNameWarn(l, this.cbLevels().albumsOf(l));
      if (old) old.remove(); if (html) inp.closest('label').insertAdjacentHTML('afterend', html);
    });
    box.querySelectorAll('[data-song]').forEach(inp => inp.onchange = () => this.cbToggle(+inp.dataset.lv, +inp.dataset.song, inp.checked));
    $('btn-cb-save').onclick = () => this.cbSave();
    $('btn-cb-cancel').onclick = () => { this.cb = null; box.hidden = true; box.innerHTML = ''; };
  },
  async cbToggle(l, trackId, on){
    const cb = this.cb, picks = cb.picks[l];
    if (!on) { cb.picks[l] = picks.filter(x => x !== trackId); this.renderCustom(); return; }
    if (picks.length >= 5) { Sfx.fail(); this.renderCustom(); return; }
    const t = cb.disc.albums.flatMap(a => a.tracks).find(x => x.trackId === trackId); if (!t) return;
    if (!cb.checks[trackId]) {
      cb.checks[trackId] = { state: 'busy' }; this.renderCustom();
      let r; try { r = await this.probe(t, {}, this.pctx()); } catch (e) { r = { ok: false, reason: UI.lookupErr(e, 'story') }; }
      if (this.cb !== cb) return;
      cb.checks[trackId] = r.ok ? { state: 'ok', res: r } : { state: 'bad', reason: r.reason === 'no chord chart found' ? 'No chord chart found' : r.reason === 'the chart is basically one chord' ? 'Basically one chord' : r.reason };
      if (!r.ok) { Sfx.fail(); this.renderCustom(); return; }
    }
    if (cb.checks[trackId].state === 'ok' && !cb.picks[l].includes(trackId) && cb.picks[l].length < 5) cb.picks[l].push(trackId);
    this.renderCustom();
  },
  cbSave(){
    const cb = this.cb, { disc } = cb, lv = this.cbLevels(); if (lv.err) return;
    const DEF_SCENES = [{ setting: 'garage', props: ['amps'] }, { setting: 'club', props: ['disco-ball', 'speakers'] }, { setting: 'arena', props: ['lasers', 'pyro'] }];
    const levels = lv.used.map((l, li) => {
      const albums = lv.albumsOf(l), tracks = albums.flatMap(a => a.tracks.map(t => ({ a, t })));
      const songs = cb.picks[l].map(id => tracks.find(x => x.t.trackId === id)).filter(Boolean).map(({ a, t }) => Career.song({ album: a, track: t, hint: { why: '' } }, cb.checks[t.trackId].res));
      const L = { claim: (cb.names[l] || '').trim() || this.autoName(albums), period: '', blurb: '', scene: Scenes.validate(DEF_SCENES[li]), pool: albums.map(a => a.id),
        songs: songs.sort((a, b) => a.score - b.score), alts: [], few: 0 };
      return Career.meta(L, disc.albums, li);
    });
    const c = { v: 2, custom: true, artist: disc.artist, tagline: 'Your own setlist', charts: {}, progress: {}, created: Date.now(), few: false,
      disc: { source: disc.source, albums: disc.albums.map(a => ({ id: a.id, title: a.title, year: a.year })) }, levels };
    c.id = 'c-' + slug(c.artist) + '-mine';
    const old = this.get(c.id); if (old) c.created = old.created;
    this.save(c); this.cb = null; $('story-custom').hidden = true; $('story-custom').innerHTML = ''; Sfx.found();
    this.openCareer(c.id);
    if (UI.aiAvailable()) this.theme(c.id);
  },
  async playSong(id, li, si){
    const c = this.get(id); if (!c || !this.levelOpen(c, li)) return;
    const k = this.key(li, si), ck = c.id + k;
    if (this.charting[ck] && (this.charting[ck] === 'busy' || this.charting[ck].step)) return;
    let song = null;
    if (c.charts[k]) { try { song = validateSong(c.charts[k], c.charts[k].source || 'dataset'); } catch (e) { song = null; } }
    // charts from before the data lookup (written by Claude from memory) are looked up again
    if (song && !(song.prov && ['dataset', 'web'].includes(song.prov.src))) song = null;
    if (!song) {
      this.charting[ck] = { step: 'Finding the recording…' }; this.cur = c; this.renderCareer(); Sfx.searchStart();
      const s = c.levels[li].songs[si];
      const redraw = () => { if (UI.screen === 'story' && this.cur && this.cur.id === id) this.renderCareer(); };
      try {
        const track = s.track && s.track.trackId ? s.track : await Lookup.itunesBest(s.title, c.artist);
        if (!track) throw Object.assign(new Error('Couldn’t find this recording in Apple’s catalogue. Tap to try again.'), { code: 'story_nf' });
        const cachedSong = Chart.cached(track);
        let o = cachedSong;
        if (!o) {
          o = await Chart.make(track, { ai: UI.aiAvailable(), web: UI.canWeb(), askClaude: (p, sig, extra) => UI.askClaude(p, sig, 'default', extra),
            onStep: (key, text) => { this.charting[ck] = { step: text.replace(/…?\s*\d+%$/, '…') }; redraw(); } });
          if (o.prov.issues.length) { delete this.charting[ck]; redraw(); o = await UI.confirmChart(o, track); if (!o) { Sfx.fail(); return; } }
          o = validateSong(o, o.prov.src === 'web' ? 'web' : 'dataset');
          Chart.remember(track, o);
        }
        song = o;
        const fresh = this.get(id) || c; fresh.charts[k] = song; this.save(fresh);
        delete this.charting[ck]; Sfx.found();
      } catch (e) {
        this.charting[ck] = { err: e && e.code === 'story_nf' ? e.message : UI.lookupErr(e, 'chart') + ' Tap to retry.' };
        Sfx.fail(); if (UI.screen === 'story' && this.cur && this.cur.id === id) { this.cur = this.get(id); this.renderCareer(); }
        return;
      }
      // they may have left the career screen while it was charting
      if (UI.screen !== 'story' || !this.cur || this.cur.id !== id) { this.cur = this.get(id); if (UI.screen === 'story') this.renderCareer(); return; }
    }
    this.cur = this.get(id);
    UI.openSong(song, { careerId: id, li, si });
  },

  /* ---------- during and after a song ---------- */
  tier(){ const x = UI.storyCtx; return x ? STORY_TIERS[x.li] : null; },
  level(){ const x = UI.storyCtx, c = x && this.get(x.careerId); return c ? c.levels[x.li] : null; },
  // a Story song opens on its gig: the stage run that counts, what it takes to clear, and Practice beside it
  songStrip(){
    const x = UI.storyCtx, c = x && this.get(x.careerId), el = $('song-story');
    $('scr-song').classList.toggle('in-story', !!c);
    if (!c) { el.hidden = true; $('btn-song-back').textContent = '← Songs'; return; }
    const L = c.levels[x.li], t = STORY_TIERS[x.li], s = L.songs[x.si], p = c.progress[this.key(x.li, x.si)], passed = this.passed(c, x.li, x.si);
    el.hidden = false; $('btn-song-back').textContent = '← Career';
    const sub = [s.album, s.year].filter(Boolean).join(' · ');
    el.innerHTML = `<div class="gig-art" style="background-image:url('${Scenes.dataUrl(L.scene, 1000, 420, { floorY: 360 })}')"></div>
      <div class="gig-in">
        <div class="gig-top"><span class="ltag t${x.li + 1}">LEVEL ${x.li + 1} · ${esc(L.name)}</span><span class="gig-n">Song ${x.si + 1} of ${L.songs.length}</span></div>
        <h1 class="gig-title">${esc(UI.song ? UI.song.title : s.title)}</h1>
        <div class="gig-by">${esc(c.artist)}${sub ? ' · ' + esc(sub) : ''}</div>
        <div class="gig-goal">
          <div class="need"><small>To clear</small><b>${t.pass}</b><span>or better</span></div>
          <div class="best"><small>Your best</small><b>${p ? esc(p.grade) : '–'}</b><span class="stars">${this.starStr(this.stars(c, x.li, x.si))}</span></div>
          <div class="rules">${esc(t.rules)}.${passed ? ' Cleared! Play again for more stars.' : ''}</div>
        </div>
        <div class="gig-go">
          <button class="btn btn-go btn-big" type="button" id="btn-gig-stage">🎤 Take the stage</button>
          <button class="btn" type="button" id="btn-gig-practice">Practice first <small>(doesn’t count)</small></button>
        </div>
      </div>`;
    $('btn-gig-stage').onclick = () => UI.startGame('stage');
    $('btn-gig-practice').onclick = () => UI.startGame('practice');
  },
  // called with a finished Stage run while a story song is open
  record(r){
    const x = UI.storyCtx; if (!x || r.mode !== 'stage') return null;
    const c = this.get(x.careerId); if (!c) return null;
    if (r.failed) return { c, li: x.li, si: x.si, failed: true, need: STORY_TIERS[x.li].pass };
    const k = this.key(x.li, x.si), before = { passed: this.passed(c, x.li, x.si), level: this.levelDone(c, x.li), master: this.mastered(c), stars: this.stars(c, x.li, x.si) };
    const old = c.progress[k];
    if (!old || GRADE_RANK[r.grade] > GRADE_RANK[old.grade] || (r.grade === old.grade && r.score > old.score)) c.progress[k] = { grade: r.grade, score: r.score, tap: !!r.tap };
    this.save(c);
    const out = { c, li: x.li, si: x.si, need: STORY_TIERS[x.li].pass, passedNow: GRADE_RANK[r.grade] >= GRADE_RANK[STORY_TIERS[x.li].pass], stars: this.stars(c, x.li, x.si),
      newPass: !before.passed && this.passed(c, x.li, x.si), levelClear: !before.level && this.levelDone(c, x.li), mastered: !before.master && this.mastered(c), moreStars: this.stars(c, x.li, x.si) > before.stars };
    return out;
  },
  resultsHtml(o){
    if (!o) return '';
    const { c, li, si } = o, L = c.levels[li];
    if (o.failed) return { html: `<b>Booed off stage</b><span>The crowd walked out. Run the song in Practice, then come back and get a ${o.need} or better.</span>` };
    if (o.mastered) return { big: true, html: `<b>Career mastered!</b><span>${c.levels.length > 1 ? `You played ${esc(c.artist)} from ${esc(c.levels[0].name)} to ${esc(c.levels[c.levels.length - 1].name)}.` : `You played all of ${esc(c.levels[0].name)}.`}</span><span class="stars">${this.starStr(o.stars)}</span>` };
    if (o.levelClear && c.levels[li + 1]) return { big: true, html: `<b>Level ${li + 1} cleared!</b><span>${esc(L.name)} is done. Level ${li + 2} unlocked: ${esc(c.levels[li + 1].name)}.</span><span class="stars">${this.starStr(o.stars)}</span>` };
    if (o.passedNow) return { html: `<b>${o.newPass ? 'Song cleared!' : o.moreStars ? 'New stars!' : 'Passed'}</b><span class="stars">${this.starStr(o.stars)}</span><span>${this.levelDone(c, li) ? 'This level is cleared. Chase more stars, or head back to the career.' : `${L.songs.filter((s, k) => !this.passed(c, li, k)).length} more in ${esc(L.name)} to ${li + 1 < c.levels.length ? 'unlock the next level' : 'master the career'}.`}</span>` };
    return { html: `<b>Not quite: this level needs a ${o.need}</b><span>Try Practice to learn the tough changes, then take the stage again.</span>` };
  },
};
