/* =====================================================================
   Story mode: pick an artist, play through their career.
   Claude maps the career into 3 eras x 3 songs (easy -> hard) and designs
   a stage for each era from the Scenes vocabulary. Each song is charted
   the first time it is opened. Clear every song in an era to unlock the
   next; clear all three eras to master the artist.
   ===================================================================== */
const STORY_TIERS = [
  { name: 'Easy',   easy: true,  strict: 'relaxed', tempo: 85,  pass: 'C', rules: 'Easy chord shapes · relaxed note check · 85% tempo · pass with a C' },
  { name: 'Medium', easy: true,  strict: 'normal',  tempo: 100, pass: 'B', rules: 'Easy chord shapes · normal note check · full tempo · pass with a B' },
  { name: 'Hard',   easy: false, strict: 'normal',  tempo: 100, pass: 'A', rules: 'The real chord shapes · normal note check · full tempo · pass with an A' },
];
const GRADE_RANK = { S: 5, A: 4, B: 3, C: 2, D: 1 };

function careerPrompt(artist){
  return `You are the career planner for STORY MODE in "Strum Jam", a game that teaches people to play real songs on guitar. The player picked the artist: "${String(artist).replace(/"/g, "'").slice(0, 80)}".

Map this artist's real career into exactly 3 levels in chronological order: level 1 is where they started (early days, first records), level 2 their breakthrough or peak, level 3 their later or latest work. For each level pick 3 real, well-known songs released in that era that a guitarist can strum along to. Reply with JSON only, in exactly this shape:
{"found":true,"artist":"Official Name","tagline":"One line about the arc of their career","levels":[{"name":"Short level title","years":"2003–2005","albums":["Album","Album"],"blurb":"One or two plain sentences.","scene":{"setting":"street","time":"night","weather":"none","palette":["#4B3F7A","#FF5E7E","#FFCE3A"],"props":["cd-table","boombox"],"sign":"SOUTH SIDE"},"songs":[{"title":"Song","album":"Album","year":2004},{"title":"Song","album":"Album","year":2004},{"title":"Song","album":"Album","year":2005}]}]}

Rules:
- Difficulty climbs through the story: level 1 songs are the easiest to play from that era (few chords, steady medium tempo), level 3 the hardest (more chords, faster or trickier changes). Inside each level, order the songs from easiest to hardest.
- Only real songs by this artist, released in that level's era. No song twice.
- "name": a punchy title for that chapter of their life and career, max 28 characters. "years" is the span, like "2004–2007". "albums": up to 3 main releases of the era.
- "blurb": one or two plain factual sentences, max 200 characters, about their sound and where their life was at: the places, venues and lifestyle of that era. No lyrics, no quotes, no gossip.
- "tagline": max 90 characters, plain and factual.
- "scene" designs the level's stage background so it tells the story of that era: where they came from, the venues they played, how they lived, the look of the records. Places and things only, never people.
  - "setting": one of ${Scenes.SETTINGS.join(', ')}.
  - "time": day, dusk or night. "weather": one of ${Scenes.WEATHER.join(', ')}.
  - "palette": 3 hex colours that capture the era's visual aesthetic (main, accent, glow).
  - "props": up to 3 of ${Scenes.PROPS.join(', ')}.
  - "sign": 1 to 3 words, max 16 characters, shown on a sign, banner or screen in the scene: a place or venue name that fits the era. Not a lyric and not a brand.
  Example thinking: an early hustle on the streets → street with cd-table; a college-themed debut → campus; small clubs → club; arena tours → arena with lasers and pyro; a lavish era → mansion or theater; a stark experimental era → artspace; a gospel era → church; a quiet rural era → countryside or mountains.
- NO LYRICS anywhere.
- If you don't know this artist, or they have fewer than 9 well-known songs, reply {"found":false,"suggestions":["Artist","Artist","Artist"]}.
Reply with the JSON only.`;
}

function validateCareer(o, query){
  if (!o || typeof o !== 'object') throw new Error('The career came back empty.');
  const levels = Array.isArray(o.levels) ? o.levels.slice(0, 3) : [];
  if (levels.length < 3) throw new Error('Claude couldn’t split that career into three eras. Try another artist.');
  const c = { v: 1, artist: cleanStr(o.artist || query, 60) || 'Artist', tagline: cleanStr(o.tagline, 110), charts: {}, progress: {}, created: Date.now() };
  c.id = 'c-' + slug(c.artist);
  const seen = new Set();
  c.levels = levels.map((L, li) => {
    L = L && typeof L === 'object' ? L : {};
    const songs = (Array.isArray(L.songs) ? L.songs : []).map(s => ({ title: cleanStr(s && s.title, 80), album: cleanStr(s && s.album, 60), year: Math.round(clampNum(s && s.year, 1900, 2100, 0)) || '' }))
      .filter(s => s.title && !seen.has(s.title.toLowerCase()) && seen.add(s.title.toLowerCase())).slice(0, 3);
    if (songs.length < 3) throw new Error('One of the eras came back with fewer than three songs. Try building it again.');
    return { name: cleanStr(L.name, 32) || 'Level ' + (li + 1), years: cleanStr(L.years, 20), albums: (Array.isArray(L.albums) ? L.albums : []).map(a => cleanStr(a, 60)).filter(Boolean).slice(0, 3),
      blurb: cleanStr(L.blurb, 240), scene: Scenes.validate(L.scene), songs };
  });
  return c;
}

const Story = {
  cur: null, ctx: null, buildCtl: null, charting: {}, fresh: -1,

  /* ---------- storage ---------- */
  all(){ const raw = Store.get('careers', []); return (Array.isArray(raw) ? raw : []).filter(c => c && c.id && Array.isArray(c.levels) && c.levels.length === 3).map(c => { c.levels.forEach(L => { L.scene = Scenes.validate(L.scene); }); return c; }); },
  save(c){ const list = this.all().filter(x => x.id !== c.id); list.unshift(c); Store.set('careers', list.slice(0, 12)); },
  remove(id){ Store.set('careers', this.all().filter(x => x.id !== id)); },
  get(id){ return this.all().find(c => c.id === id) || null; },

  /* ---------- progress ---------- */
  key: (li, si) => li + '-' + si,
  grade(c, li, si){ const p = c.progress[this.key(li, si)]; return p ? p.grade : ''; },
  passed(c, li, si){ const g = this.grade(c, li, si); return !!g && GRADE_RANK[g] >= GRADE_RANK[STORY_TIERS[li].pass]; },
  stars(c, li, si){ const g = this.grade(c, li, si); if (!this.passed(c, li, si)) return 0; return g === 'S' ? 3 : GRADE_RANK[g] >= GRADE_RANK.A ? 2 : 1; },
  levelDone(c, li){ return [0, 1, 2].every(si => this.passed(c, li, si)); },
  levelOpen(c, li){ return li === 0 || this.levelDone(c, li - 1); },
  mastered(c){ return [0, 1, 2].every(li => this.levelDone(c, li)); },
  totalStars(c){ let n = 0; for (let li = 0; li < 3; li++) for (let si = 0; si < 3; si++) n += this.stars(c, li, si); return n; },
  cleared(c){ let n = 0; for (let li = 0; li < 3; li++) for (let si = 0; si < 3; si++) n += this.passed(c, li, si) ? 1 : 0; return n; },
  currentLevel(c){ for (let li = 0; li < 3; li++) if (!this.levelDone(c, li)) return li; return 2; },
  starStr(n){ return '★'.repeat(n) + '<i>' + '★'.repeat(3 - n) + '</i>'; },

  /* ---------- screens ---------- */
  init(){
    $('btn-story').onclick = () => { Sfx.open(); this.openPick(); };
    $('btn-story-home').onclick = () => { this.stopBuild(); UI.show('title'); UI.renderLists(); };
    $('btn-story-new').onclick = () => { this.stopBuild(); this.openPick(); };
    $('story-form').addEventListener('submit', e => { e.preventDefault(); this.build($('story-input').value); });
    $('btn-story-remake').onclick = () => { if (this.cur) { $('story-input').value = this.cur.artist; this.openPick(); this.build(this.cur.artist, true); } };
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
    const ctl = this.buildCtl = new AbortController();
    const st = $('story-status');
    const steps = ['Reading the discography', 'Splitting the career into eras', 'Picking songs, easy to hard', 'Designing the stages'];
    st.innerHTML = `<div class="story-load"><span class="thinking"><span class="eq"><i></i><i></i><i></i><i></i></span> Building the ${esc(q.replace(/(^|\s)\S/g, m => m.toUpperCase()))} career… <button class="btn btn-sm" type="button" id="btn-stop-story">Stop</button></span><div class="sl-steps">${steps.map(s => `<span>${s}</span>`).join('')}</div></div>`;
    $('btn-stop-story').onclick = () => ctl.abort();
    let k = 0; const spans = st.querySelectorAll('.sl-steps span'); spans[0].classList.add('on');
    const tick = setInterval(() => { k = Math.min(steps.length - 1, k + 1); spans[k].classList.add('on'); }, 3500);
    Sfx.searchStart();
    try {
      const data = await UI.askClaude(careerPrompt(q), ctl.signal, 'default', { kind: 'career', body: { artist: q } });
      if (ctl.signal.aborted) return;
      if (!data || data.found === false) {
        Sfx.fail(); st.innerHTML = `I couldn’t build a career for “${esc(q)}”. Try one of these?`;
        const box = document.createElement('div'); box.className = 'sugg';
        (Array.isArray(data && data.suggestions) ? data.suggestions : []).slice(0, 6).forEach(sg => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = String(sg).slice(0, 60); b.onclick = () => { $('story-input').value = b.textContent; this.build(b.textContent); }; box.appendChild(b); });
        st.appendChild(box); return;
      }
      const c = validateCareer(data, q);
      const old = this.get(c.id);
      if (old && rebuild) Object.assign(c, { created: old.created });
      this.save(c); st.textContent = ''; Sfx.found();
      this.openCareer(c.id);
    } catch (e) {
      if (e && (e.code === 'cancelled' || e.name === 'AbortError')) { st.textContent = 'Stopped.'; return; }
      st.textContent = e && e.message && !e.code ? e.message : UI.errCopy(e); Sfx.fail();
      if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled')) { UI.sample = null; UI.refreshEnv(); }
    } finally { clearInterval(tick); if (this.buildCtl === ctl) this.buildCtl = null; }
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
    $('career-stars').textContent = `${stars} / 27 ★`;
    $('career-fill').style.width = Math.round(n / 9 * 100) + '%';
    $('career-state').textContent = this.mastered(c) ? `Career mastered! Chase ★★★ on every song.` : `${n} of 9 songs cleared · Level ${this.currentLevel(c) + 1} of 3`;
    const box = $('story-levels'); box.textContent = '';
    c.levels.forEach((L, li) => {
      const tier = STORY_TIERS[li], open = this.levelOpen(c, li), done = this.levelDone(c, li);
      const el = document.createElement('section'); el.className = 'lvl' + (open ? '' : ' locked') + (this.fresh === li ? ' fresh' : '');
      el.setAttribute('aria-label', `Level ${li + 1}: ${L.name}${open ? '' : ', locked'}`);
      el.innerHTML = `<div class="art"><img alt="" src="${Scenes.dataUrl(L.scene, 1000, 312, { floorY: 262 })}"><div class="ov">
          <div class="tagrow"><span class="ltag t${li + 1}">LEVEL ${li + 1} · ${tier.name.toUpperCase()}</span>${done ? '<span class="ltag done">CLEARED ✓</span>' : this.fresh === li ? '<span class="ltag done">UNLOCKED!</span>' : ''}</div>
          <div><div class="yrs">${esc(L.years)}</div><h2 class="nm">${esc(L.name)}</h2></div></div>
          ${open ? '' : `<div class="lock">🔒 Clear Level ${li} to unlock</div>`}</div>
        <div class="info">${L.albums.length ? `<div class="albums">${L.albums.map(a => `<span class="chip">${esc(a)}</span>`).join('')}</div>` : ''}${L.blurb ? `<p class="blurb">${esc(L.blurb)}</p>` : ''}<div class="rules">${esc(tier.rules)}</div></div>
        <div class="songs"></div>`;
      const songs = el.querySelector('.songs');
      L.songs.forEach((s, si) => songs.appendChild(this.tile(c, li, si, open)));
      box.appendChild(el);
    });
    this.fresh = -1;
  },
  tile(c, li, si, open){
    const s = c.levels[li].songs[si], k = this.key(li, si), p = c.progress[k], passed = this.passed(c, li, si);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'stile' + (passed ? ' passed' : '');
    const busy = this.charting[c.id + k];
    let state;
    if (!open) state = '🔒 Locked';
    else if (busy === 'busy' || (busy && busy.step)) state = '<span class="eq"><i></i><i></i><i></i><i></i></span> ' + esc(busy && busy.step || 'Looking up the chords…');
    else if (busy && busy.err) state = busy.err;
    else if (passed) state = `<span class="stars">${this.starStr(this.stars(c, li, si))}</span> · best ${esc(p.grade)}`;
    else if (p) state = `Best ${esc(p.grade)} · need ${STORY_TIERS[li].pass}`;
    else state = c.charts[k] ? '▶ Ready to play' : '▶ Play';
    if (busy === 'busy' || (busy && busy.step)) b.classList.add('busy'); if (busy && busy.err) b.classList.add('err');
    b.innerHTML = `<span class="n">${si + 1}</span><span><div class="t">${esc(s.title)}</div><div class="a">${esc([s.album, s.year].filter(Boolean).join(' · '))}</div><div class="st">${state}</div></span>`;
    b.setAttribute('aria-label', `${s.title}. ${b.querySelector('.st').textContent}`);
    if (!open) { b.setAttribute('aria-disabled', 'true'); b.onclick = () => Sfx.fail(); return b; }
    b.onclick = () => this.playSong(c.id, li, si);
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') Sfx.hover(li * 3 + si); });
    return b;
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
        const track = await Lookup.itunesBest(s.title, c.artist);
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
    el.innerHTML = `<img alt="" src="${Scenes.dataUrl(L.scene, 360, 150, { floorY: 126 })}"><div><b>${esc(c.artist)} · Level ${x.li + 1}: ${esc(L.name)}</b><p>Song ${x.si + 1} of 3. Stage mode counts toward your career. ${esc(t.rules)}.</p></div>`;
  },
  // called with a finished Stage run while a story song is open
  record(r){
    const x = UI.storyCtx; if (!x || r.mode !== 'stage') return null;
    const c = this.get(x.careerId); if (!c) return null;
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
    if (o.mastered) return { big: true, html: `<b>Career mastered!</b><span>You played ${esc(c.artist)} from ${esc(c.levels[0].name)} to ${esc(c.levels[2].name)}.</span><span class="stars">${this.starStr(o.stars)}</span>` };
    if (o.levelClear) return { big: true, html: `<b>Level ${li + 1} cleared!</b><span>${esc(L.name)} is done. Level ${li + 2} unlocked: ${esc(c.levels[li + 1].name)}.</span><span class="stars">${this.starStr(o.stars)}</span>` };
    if (o.passedNow) return { html: `<b>${o.newPass ? 'Song cleared!' : o.moreStars ? 'New stars!' : 'Passed'}</b><span class="stars">${this.starStr(o.stars)}</span><span>${this.levelDone(c, li) ? 'This level is cleared. Chase more stars, or head back to the career.' : `${[0, 1, 2].filter(k => !this.passed(c, li, k)).length} more in ${esc(L.name)} to unlock the next level.`}</span>` };
    return { html: `<b>Not quite: this level needs a ${o.need}</b><span>Try Practice to learn the tough changes, then take the stage again.</span>` };
  },
};
