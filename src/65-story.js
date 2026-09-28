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

function careerPrompt(artist, disc, web){
  return `You are the career planner for STORY MODE in "Strum Jam", a game that teaches people to play real songs on guitar. The player picked the artist: "${qt(artist).slice(0, 80)}".

This is the artist's verified discography from MusicBrainz and Apple Music: studio albums (and mixtapes), oldest first, with first release dates and tracklists. It is the only source for albums, years and which album a song is on:
${discographyText(disc)}

${web ? 'Use web search for context: the phases of their career, their stylistic shifts, which songs defined each period, and which of their songs guitarists actually play (chord sites, lessons, covers). ' : ''}Map the career into levels in chronological order: 3 levels when there are 3 or more albums with tracks, otherwise one level per album. Level 1 is where they started, then the breakthrough or peak, then the later or latest work. Reply with JSON only, in exactly this shape:
{"found":true,"artist":"Official Name","tagline":"One line about the arc of their career","few":false,"levels":[{"albums":["A1"],"name":"The College Dropout","period":"Chicago Come-Up","blurb":"One or two plain sentences.","scene":{"setting":"street","time":"night","weather":"none","palette":["#4B3F7A","#FF5E7E","#FFCE3A"],"props":["cd-table","boombox"],"sign":"SOUTH SIDE"},"songs":[{"title":"All Falls Down","album":"A1","why":"Famous acoustic guitar loop","bpm":91,"changes":1,"chords":4}]}]}

ERAS
- "albums": the ids of a run of consecutive albums from the list. Levels never share an album and never overlap in time. You may leave albums out.
- "name": max 28 characters. A level with one album may be named after it (its exact title). A level with several albums gets a name for that period of their career, like "Chicago Come-Up" or "Stadium Years", never one album's title.
- "period": always also a period name (max 28 characters) that is not any album's title. It is used if the songs end up spanning several albums.
- "blurb": one or two plain factual sentences, max 200 characters, about their sound and where their life was at in that period: the places, venues and lifestyle. No lyrics, no quotes, no gossip.
- "tagline": max 90 characters, plain and factual.
- "scene" designs the level's stage background so it tells the story of that era: where they came from, the venues they played, how they lived, the look of the records. Places and things only, never people.
  - "setting": one of ${Scenes.SETTINGS.join(', ')}.
  - "time": day, dusk or night. "weather": one of ${Scenes.WEATHER.join(', ')}.
  - "palette": 3 hex colours that capture the era's visual aesthetic (main, accent, glow).
  - "props": up to 3 of ${Scenes.PROPS.join(', ')}.
  - "sign": 1 to 3 words, max 16 characters, shown on a sign, banner or screen in the scene: a place or venue name that fits the era. Not a lyric and not a brand.
  Example thinking: an early hustle on the streets → street with cd-table; a college-themed debut → campus; small clubs → club; arena tours → arena with lasers and pyro; a lavish era → mansion or theater; a stark experimental era → artspace; a gospel era → church; a quiet rural era → countryside or mountains.

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
    $('btn-story').onclick = () => { Sfx.open(); this.openPick(); };
    $('btn-story-home').onclick = () => { this.stopBuild(); UI.show('title'); UI.renderLists(); };
    $('btn-story-new').onclick = () => { this.stopBuild(); this.openPick(); };
    $('story-form').addEventListener('submit', e => { e.preventDefault(); this.build($('story-input').value); });
    $('btn-story-remake').onclick = () => { if (this.cur) { $('story-input').value = this.cur.artist; this.openPick(); this.build(this.cur.artist, true); } };
    $('sw-list').addEventListener('click', e => { const b = e.target.closest('[data-alt]'); if (b) this.swap(+b.dataset.alt); });
    // the promo art: three eras, from the street to the arena
    const demo = [{ setting: 'street', props: ['cd-table'] }, { setting: 'campus', props: ['pennants'] }, { setting: 'arena', props: ['lasers'] }];
    demo.forEach((d, i) => { $('sp-a' + (i + 1)).src = Scenes.dataUrl(Scenes.validate(d), 240, 200, { floorY: 170 }); });
    this.renderChips();
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
  async build(q, rebuild){
    q = String(q || '').trim(); if (!q) { $('story-input').focus(); return; }
    if (!UI.aiAvailable()) { this.envNotice(); Sfx.fail(); return; }
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
      const data = await ask(careerPrompt(disc.artist, disc, web));
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
        askMore: asks => ask(careerMorePrompt(disc.artist, disc, asks, web)),
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
      const el = target >= 0 && document.querySelectorAll('#story-levels .lvl')[target];
      if (el) setTimeout(() => { el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); Sfx.found(); }, 250);
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
    c.levels.forEach((L, li) => {
      const tier = STORY_TIERS[li], open = this.levelOpen(c, li), done = this.levelDone(c, li);
      const el = document.createElement('section'); el.className = 'lvl' + (open ? '' : ' locked') + (this.fresh === li ? ' fresh' : '');
      el.setAttribute('aria-label', `Level ${li + 1}: ${L.name}${open ? '' : ', locked'}`);
      el.innerHTML = `<div class="art"><img alt="" src="${Scenes.dataUrl(L.scene, 1000, 312, { floorY: 262 })}"><div class="ov">
          <div class="tagrow"><span class="ltag t${li + 1}">LEVEL ${li + 1} · ${tier.name.toUpperCase()}</span>${done ? '<span class="ltag done">CLEARED ✓</span>' : this.fresh === li ? '<span class="ltag done">UNLOCKED!</span>' : ''}</div>
          <div><div class="yrs">${esc(L.years)}</div><h2 class="nm">${esc(L.name)}</h2></div></div>
          ${open ? '' : `<div class="lock">🔒 Clear Level ${li} to unlock</div>`}</div>
        <div class="info">${L.albums.length ? `<div class="albums">${L.albums.map(a => `<span class="chip">${esc(a)}</span>`).join('')}</div>` : ''}${L.blurb ? `<p class="blurb">${esc(L.blurb)}</p>` : ''}${L.few ? `<p class="few">Only ${L.few} song${L.few === 1 ? '' : 's'} from this era passed the chord check, so this level is shorter.</p>` : ''}<div class="rules">${esc(tier.rules)}</div></div>
        <div class="songs"></div>`;
      const songs = el.querySelector('.songs');
      L.songs.forEach((s, si) => songs.appendChild(this.tile(c, li, si, open)));
      box.appendChild(el);
    });
    this.fresh = -1;
  },
  tile(c, li, si, open){
    const L = c.levels[li], s = L.songs[si], k = this.key(li, si), p = c.progress[k], passed = this.passed(c, li, si);
    const w = document.createElement('div'); w.className = 'stile-w';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'stile' + (passed ? ' passed' : '');
    const busy = this.charting[c.id + k], working = busy === 'busy' || !!(busy && busy.step);
    let state;
    if (!open) state = '🔒 Locked';
    else if (working) state = '<span class="eq"><i></i><i></i><i></i><i></i></span> ' + esc(busy && busy.step || 'Looking up the chords…');
    else if (busy && busy.err) state = busy.err;
    else if (passed) state = `<span class="stars">${this.starStr(this.stars(c, li, si))}</span> · best ${esc(p.grade)}`;
    else if (p) state = `Best ${esc(p.grade)} · need ${STORY_TIERS[li].pass}`;
    else state = c.charts[k] ? '▶ Ready to play' : '▶ Play';
    if (working) b.classList.add('busy'); if (busy && busy.err) b.classList.add('err');
    b.innerHTML = `<span class="n">${si + 1}</span><span><div class="t">${esc(s.title)}</div><div class="a">${esc([s.album, s.year].filter(Boolean).join(' · '))}</div>${s.why ? `<div class="why">${esc(s.why)}</div>` : ''}<div class="st">${state}</div></span>`;
    b.setAttribute('aria-label', `${s.title}. ${s.why ? s.why + '. ' : ''}${b.querySelector('.st').textContent}`);
    w.appendChild(b);
    if (Career.options(L).length) {
      w.classList.add('can-swap');
      const x = document.createElement('button'); x.type = 'button'; x.className = 'swap'; x.textContent = '⇄ Swap';
      x.setAttribute('aria-label', `Swap ${s.title} for another song from this era`);
      x.disabled = working;
      x.onclick = () => { Sfx.open(); this.openSwap(c.id, li, si); };
      w.appendChild(x);
    }
    if (!open) { b.setAttribute('aria-disabled', 'true'); b.onclick = () => Sfx.fail(); return w; }
    b.onclick = () => this.playSong(c.id, li, si);
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') Sfx.hover(li * 3 + si); });
    return w;
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
    const L = c.levels[x.li], out = L.songs[x.si];
    const id = s => s.track ? 'it' + s.track.trackId : s.title;
    // progress and charts follow their songs when the level re-sorts easy -> hard
    const prog = new Map(), charts = new Map();
    L.songs.forEach((s, k) => { const kk = this.key(x.li, k); if (s !== out) { if (c.progress[kk]) prog.set(id(s), c.progress[kk]); if (c.charts[kk]) charts.set(id(s), c.charts[kk]); } delete c.progress[kk]; delete c.charts[kk]; });
    const songs = L.songs.slice(); songs[x.si] = o;
    L.alts = [out, ...(L.alts || []).filter(a => id(a) !== id(o))];     // the song swapped out comes first, to swap back
    L.songs = songs.sort((a, b) => (a.score || 0) - (b.score || 0));
    L.songs.forEach((s, k) => { const kk = this.key(x.li, k); if (prog.has(id(s))) c.progress[kk] = prog.get(id(s)); if (charts.has(id(s))) c.charts[kk] = charts.get(id(s)); });
    Object.keys(this.charting).filter(k => k.startsWith(c.id + x.li + '-')).forEach(k => delete this.charting[k]);
    if (c.v === 2) Career.meta(L, (c.disc && c.disc.albums) || [], x.li);
    this.save(c); this.swapping = null;
    UI.closeModal(); Sfx.found();
    this.cur = c; this.renderCareer();
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
  songStrip(){
    const x = UI.storyCtx, c = x && this.get(x.careerId), el = $('song-story');
    $('scr-song').classList.toggle('in-story', !!c);
    if (!c) { el.hidden = true; $('btn-song-back').textContent = '← Songs'; return; }
    const L = c.levels[x.li], t = STORY_TIERS[x.li];
    el.hidden = false; $('btn-song-back').textContent = '← Career';
    el.innerHTML = `<img alt="" src="${Scenes.dataUrl(L.scene, 360, 150, { floorY: 126 })}"><div><b>${esc(c.artist)} · Level ${x.li + 1}: ${esc(L.name)}</b><p>Song ${x.si + 1} of ${L.songs.length}. Stage mode counts toward your career. ${esc(t.rules)}.</p></div>`;
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
