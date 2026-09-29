/* =====================================================================
   UI: screens, search (Claude charts any song), song menu, modals, loop
   ===================================================================== */
const HOSTED_URL = '__HOSTED_URL__';
const SHARED_URL = '';     // the shared lookup service (worker/): Joshua's key, answers shared by everyone
const STYLE_NAMES = { rock:'Rock', pop:'Pop', ballad:'Ballad', halftime:'Half-time', funk:'Funk', disco:'Disco', shuffle:'Shuffle', country:'Country', reggae:'Reggae',
  punk:'Punk', hiphop:'Hip-hop', metal:'Metal', folk:'Folk', bossa:'Bossa nova', edm:'Dance', waltz:'Waltz', none:'No drums (click)' };
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

const UI = {
  screen: 'title', song: null, chart: null, sample: null, downloads: null,
  inViewer: !!(window.claude && typeof window.claude.use === 'function'),
  searchCtl: null, openModal: null, frameN: 0, taps: [], importGroove: null,

  init(){
    Stage.init($('stage'));
    // the neural listener loads in the background; its strums drive the game once it's ready
    Listen.strumListeners.add(t => { Mic.onsets.push(t); if (Mic.onsets.length > 40) Mic.onsets.shift(); Mic.lastOnset = Math.max(Mic.lastOnset, t); Mic.onsetListeners.forEach(fn => fn(t)); });
    setTimeout(() => Listen.init(), 300);
    Fretboard.init($('fretboard'));
    TitleArt.init($('title-canvas'));
    Fx.init($('fx'));
    Splash.init();
    this.letters = [...document.querySelectorAll('#logo .lt')];
    this.bind();
    Story.init();
    Suggest.init();
    MenuBG.apply();
    ModeIcons.init();
    this.renderLists();
    this.refreshEnv();
    this.refreshMic();
    if (this.inViewer) {
      window.claude.use('sample').then(s => { this.sample = s; this.refreshEnv(); }).catch(() => {});
      window.claude.use('downloads').then(d => { this.downloads = d; this.refreshEnv(); }).catch(() => {});
    }
    requestAnimationFrame(() => this.loop());
    if (location.hash) this.openShared();
  },

  /* ---------- helpers ---------- */
  show(name, instant){
    const swap = () => {
      this.screen = name;
      for (const s of ['title', 'play', 'battle', 'online', 'song', 'game', 'results', 'story']) $('scr-' + s).hidden = s !== name;
      if (name === 'title') Story.renderChips();
      if (name === 'game') requestAnimationFrame(() => Stage.resize());
      if (name === 'title') TitleArt.resize();
      $('scr-' + name).scrollTop = 0; window.scrollTo(0, 0);
      this.enter($('scr-' + name));
    };
    if (instant || reduceMotion || this.screen === name) { swap(); return Promise.resolve(); }
    return new Promise(res => {
      const w = $('wipe');
      w.classList.remove('out'); void w.offsetWidth; w.classList.add('in');
      Sfx.whoosh();
      setTimeout(() => {
        swap(); res();
        w.classList.remove('in'); w.classList.add('out');
        setTimeout(() => w.classList.remove('out'), 450);
      }, 360);
    });
  },
  // staggered entrance for the main pieces of a screen
  enter(root){
    if (reduceMotion || !root) return;
    const els = root.querySelectorAll('.topbar, .hero, .search, .story-promo, .story-hero, .career-head, .lvl, .story-strip, .song-head, .modes > *, .opts, .card, .cbox, .map .row, .stat, .stamp, .res h2, .res-story, .res .row, .sec-h');
    let i = 0;
    els.forEach(el => {
      if (el.offsetParent === null && !el.closest('.game')) return;
      const d = Math.min(i++, 14) * 32;
      el.style.animation = `rise .5s cubic-bezier(.2,1.3,.4,1) ${d}ms both`;
      setTimeout(() => { el.style.animation = ''; }, 520 + d);
    });
  },
  // Claude is available through the claude.ai preview, the player's own API key, or the shared lookup service
  sharedOn(){ return !this.inViewer && /^https:\/\//.test(SHARED_URL); },
  aiAvailable(){ return !!this.sample || (!this.inViewer && (!!Settings.apiKey || this.sharedOn())); },
  canWeb(){ return !this.inViewer && (!!Settings.apiKey || this.sharedOn()); },   // the web backup needs web search
  refreshEnv(){
    $('setup-card').hidden = true;   // song lookup works without a key now; the key is asked for only when a song needs it
    $('hosted-card').hidden = !this.inViewer;
    $('btn-download').hidden = !this.downloads;
    $('api-box').hidden = this.inViewer;
    $('btn-imp-ai').hidden = !this.aiAvailable();
  },
  refreshMic(){
    const dot = $('mic-dot'), txt = $('mic-chip-text');
    dot.className = 'dot' + (Mic.on ? ' live' : Mic.failed ? ' off' : '');
    txt.textContent = Mic.on ? 'Listening' : Mic.failed === 'blocked' ? 'Mic blocked' : Mic.failed === 'nodevice' ? 'No mic found' : 'Mic off';
    $('hud-mic-dot').className = 'dot' + (Mic.on ? ' live' : ' off');
    $('hud-mic-text').textContent = Mic.on ? 'Listening' : 'Tap mode';
    $('btn-mic-on').textContent = Mic.on ? 'Turn off mic' : 'Turn on mic';
    let msg;
    if (Mic.on) msg = `Listening${Mic.label ? ' with ' + Mic.label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '') : ''}. Strum a chord and watch its notes show up below.`;
    else if (Mic.failed === 'blocked') msg = this.inViewer ? 'Pages on claude.ai can’t use the microphone. Download the game file and open it in Chrome to play with your guitar.' : 'The microphone is blocked. Allow it for this page in your browser’s site settings (the icon left of the address bar), then press Turn on mic.';
    else if (Mic.failed === 'nodevice') msg = 'No microphone was found. Plug one in or check your sound settings, then try again.';
    else if (Mic.failed === 'ended') msg = 'The microphone disconnected. Press Turn on mic to reconnect.';
    else if (Mic.failed === 'busy') msg = 'Another app is using the microphone. Close it (video calls, recorders), then press Turn on mic.';
    else msg = 'Turn on the mic so the game can hear your guitar.';
    if (Mic.on) msg += Listen.ready ? ` Note recognition: neural network (${Math.round(Listen.ms)} ms per look).` : Listen.loading ? ' Loading the note recogniser…' : Listen.failed ? ' Using the basic note recogniser.' : '';
    $('mic-msg').textContent = msg;
    const chip = $('hud-mic'); if (chip) chip.title = Listen.ready ? 'Neural note recognition on' : 'Basic note recognition';
    const w = $('mic-warn');
    if (Mic.on && Mic.warn === 'bluetooth') { w.hidden = false; w.textContent = 'This looks like a Bluetooth headset mic. Bluetooth mics switch to low-quality call audio and blur chords. Pick your computer’s built-in mic or a USB mic in the list above, and keep the headphones for listening.'; }
    else w.hidden = true;
  },
  mine(){
    const raw = Store.get('mine', []);
    return (Array.isArray(raw) ? raw : []).map(o => { try { return validateSong(o, o.source || 'claude'); } catch (e) { return null; } }).filter(Boolean);
  },
  saveMine(song){
    const list = (Store.get('mine', []) || []).filter(s => s && s.id !== song.id);
    list.unshift(song);
    Store.set('mine', list.slice(0, 40));
  },
  songChords(song){
    const seen = []; for (const s of song.sections) for (const b of s.bars) for (const t of b.split(/\s+/)) { const c = parseChord(t); if (c && !seen.includes(c.name)) seen.push(c.name); }
    return seen;
  },
  difficulty(song){
    this._diff = this._diff || {};
    if (this._diff[song.id] != null) return this._diff[song.id];
    let d = 1;
    try {
      const ch = compileSong(song, { shapes: 'standard' });
      const avg = ch.unique.reduce((a, u) => a + u.v.diff, 0) / Math.max(1, ch.unique.length);
      const hard = ch.unique.some(u => u.v.barre && u.v.barre.to - u.v.barre.from >= 2);
      d = avg > 2.6 || hard ? 3 : avg > 1.3 || ch.unique.length > 5 || song.bpm > 130 ? 2 : 1;
    } catch (e) {}
    return (this._diff[song.id] = d);
  },
  card(song, onDelete){
    const b = document.createElement('div');
    b.className = 'card'; b.tabIndex = 0; b.setAttribute('role', 'button'); b.setAttribute('aria-label', `${song.title}${song.artist ? ' by ' + song.artist : ''}`);
    const chords = this.songChords(song);
    const best = Store.get('best', {})[song.id];
    const lvl = ['', 'Easy', 'Medium', 'Hard'][this.difficulty(song)];
    const pr = song.prov, srcTag = pr && pr.src === 'dataset' ? 'Dataset' : pr && pr.src === 'web' ? 'Web sources' : song.source === 'library' ? '' : song.source === 'paste' ? 'Pasted' : song.source === 'code' ? 'Song code' : 'Old chart';
    const needs = pr && pr.issues && pr.issues.length && pr.status !== 'confirmed';
    b.innerHTML = `<div class="stub">${song.bpm}<small>BPM</small></div><div class="body"><div class="t">${esc(song.title)}</div><div class="a">${esc(song.artist || '')}${song.artist ? ' · ' : ''}${lvl}${best ? ' · best ' + esc(best.grade) : ''}${srcTag ? ' · ' + esc(needs ? 'Needs confirming' : srcTag) : ''}</div><div class="cs">${chords.slice(0, 6).map(c => `<span>${esc(c)}</span>`).join('')}${chords.length > 6 ? `<span>+${chords.length - 6}</span>` : ''}</div></div>`;
    b.querySelector('.stub').style.background = cardColor(chords[0] || 'C');
    const open = () => { Sfx.open(); this.openSong(song); };
    const note = (this._cardN = (this._cardN || 0) + 1);
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') Sfx.hover(note); });
    b.addEventListener('click', e => { if (!e.target.closest('.del')) open(); });
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    if (onDelete) {
      const x = document.createElement('button'); x.className = 'del'; x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Remove ' + song.title);
      x.addEventListener('click', e => { e.stopPropagation(); onDelete(); });
      b.appendChild(x);
    }
    return b;
  },
  renderLists(){
    Challenge.render();
    const lib = $('library'); lib.textContent = '';
    LIBRARY.forEach(s => lib.appendChild(this.card(validateSong(s, 'library'))));
    const mine = this.mine(), box = $('my-songs'); box.textContent = '';
    if (!mine.length) box.innerHTML = '<div class="empty">Songs you search for land here, ready to play again.</div>';
    mine.forEach(s => box.appendChild(this.card(s, () => { Store.set('mine', (Store.get('mine', []) || []).filter(x => x.id !== s.id)); this.renderLists(); })));
  },
  links(title, artist){
    const q = encodeURIComponent((title + ' ' + (artist || '')).trim());
    if (!q) return '';
    return `<span>Compare with community charts:</span><a href="https://www.ultimate-guitar.com/search.php?search_type=title&value=${q}" target="_blank" rel="noopener">Ultimate Guitar ↗</a><a href="https://www.songsterr.com/?pattern=${q}" target="_blank" rel="noopener">Songsterr ↗</a>`;
  },

  /* ---------- search: pick the exact recording, then look its chords up ---------- */
  async doSearch(q){
    q = q.trim(); if (!q) { $('search-input').focus(); return; }
    const words = q.toLowerCase().split(/\s+/);
    const pool = [...this.mine(), ...LIBRARY.map(s => validateSong(s, 'library'))];
    const local = pool.filter(s => words.every(w => (s.title + ' ' + s.artist).toLowerCase().includes(w))).slice(0, 6);
    const res = $('search-results'); res.textContent = '';
    local.forEach(s => res.appendChild(this.card(s)));
    $('search-notice').textContent = ''; $('lookup').hidden = true;
    if (this.searchCtl) this.searchCtl.abort();
    const ctl = this.searchCtl = new AbortController();
    const st = $('search-status'), box = $('rec-results');
    box.textContent = '';
    st.innerHTML = `<span class="thinking"><span class="eq"><i></i><i></i><i></i><i></i></span> Finding recordings of “${esc(q)}”…</span>`;
    Sfx.searchStart();
    try {
      const recs = await Lookup.itunes(q, { signal: ctl.signal, limit: 15 });
      if (ctl.signal.aborted) return;
      if (!recs.length) { st.textContent = local.length ? 'No recordings found in Apple’s catalogue, but these are in your songs.' : `No recordings found for “${q}”. Check the spelling, or add the artist’s name.`; Sfx.fail(); return; }
      st.textContent = 'Pick the exact recording:';
      const cached = new Set(Object.keys(Store.get('charts', {}) || {}));
      recs.slice(0, 12).forEach((r, i) => box.appendChild(this.recCard(r, cached.has(Chart.cacheKey(r)), i)));
      st.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
      Sfx.found();
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.code === 'cancelled')) return;
      st.textContent = this.lookupErr(e, 'search'); Sfx.fail();
    } finally { if (this.searchCtl === ctl) this.searchCtl = null; }
  },
  recCard(r, ready, i){
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rec';
    const len = r.durationMs ? `${Math.floor(r.durationMs / 60000)}:${String(Math.round(r.durationMs / 1000) % 60).padStart(2, '0')}` : '';
    b.innerHTML = `${r.art ? `<img alt="" loading="lazy" src="${esc(r.art)}">` : '<span class="noart"></span>'}<span class="rt"><b>${esc(r.title)}</b><span>${esc(r.artist)}</span><small>${esc([r.album, r.year || '', len].filter(Boolean).join(' · '))}</small></span><span class="rgo${ready ? ' ready' : ''}">${ready ? 'Ready' : 'Pick'}</span>`;
    b.setAttribute('aria-label', `${r.title} by ${r.artist}, ${r.album}${r.year ? ', ' + r.year : ''}`);
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') Sfx.hover(i); });
    b.onclick = () => { Sfx.open(); this.pickRecording(r); };
    return b;
  },
  // the lookup pipeline for one recording, with a step-by-step panel
  async pickRecording(track, opts){
    opts = opts || {};
    const cached = Chart.cached(track);
    if (cached && !opts.fresh) { this.saveMine(cached); this.renderLists(); this.openSong(cached, opts.storyCtx); return cached; }
    if (this.searchCtl) this.searchCtl.abort();
    const ctl = this.searchCtl = new AbortController();
    const panel = opts.panel || $('lookup');
    const steps = [['find', 'Chord data'], ['web', 'Web sources'], ['listen', 'Check with the recording'], ['timing', 'Tempo & bars'], ['build', 'Chart']];
    panel.hidden = false;
    panel.innerHTML = `<div class="lk-head">${track.art ? `<img alt="" src="${esc(track.art)}">` : '<span></span>'}<span><b>${esc(track.title)}</b><small>${esc(track.artist)} · ${esc([track.album, track.year].filter(Boolean).join(' · '))}</small></span><button class="btn btn-sm" type="button" data-stop>Stop</button></div>
      <div class="lk-steps">${steps.map(([k, l]) => `<span data-k="${k}">${l}</span>`).join('')}</div><div class="lk-msg" aria-live="polite"></div>`;
    panel.querySelector('[data-stop]').onclick = () => ctl.abort();
    if (!opts.panel) panel.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    const msg = panel.querySelector('.lk-msg');
    let cur = null;
    const onStep = (k, text) => {
      const order = steps.map(x => x[0]);
      if (k !== cur) { panel.querySelectorAll('.lk-steps span').forEach(el => { const i = order.indexOf(el.dataset.k), j = order.indexOf(k); el.classList.toggle('on', el.dataset.k === k); if (i < j && !el.classList.contains('skip')) el.classList.add('done'); }); if (k === 'listen' && cur === 'find') panel.querySelector('[data-k="web"]').classList.add('skip'); cur = k; }
      msg.textContent = text;
    };
    Sfx.searchStart();
    try {
      const ai = this.aiAvailable();
      const o = await Chart.make(track, { signal: ctl.signal, onStep, ai, web: this.canWeb(), forceWeb: !!opts.forceWeb,
        askClaude: (p, sig, extra) => this.askClaude(p, sig, 'default', extra) });
      if (ctl.signal.aborted) return null;
      panel.querySelectorAll('.lk-steps span').forEach(el => { if (!el.classList.contains('skip')) { el.classList.remove('on'); el.classList.add('done'); } });
      msg.textContent = o.prov.issues.length ? 'Almost there: a couple of things to confirm.' : 'Charted.';
      Sfx.found();
      const song = o.prov.issues.length ? await this.confirmChart(o, track) : o;
      if (!song) { msg.textContent = 'Cancelled. Pick the recording again to redo it.'; return null; }
      const v = validateSong(song, song.prov && song.prov.src === 'web' ? 'web' : 'dataset');
      Chart.remember(track, v);
      if (!opts.storyCtx) { this.saveMine(v); this.renderLists(); }
      panel.hidden = !!opts.keepPanel ? false : true;
      if (opts.onDone) opts.onDone(v); else this.openSong(v, opts.storyCtx);
      return v;
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.code === 'cancelled')) { msg.textContent = 'Stopped.'; return null; }
      console.warn(e);
      const needKey = e && e.code === 'not_in_dataset' && !this.inViewer && !Settings.apiKey;
      msg.innerHTML = esc(this.lookupErr(e, 'chart')) + (needKey ? ' <button class="btn btn-sm btn-teal" type="button" data-key>Add API key</button>' : '') + (['not_in_dataset', 'web_nf', 'no_web', 'web_search_off', 'filtered'].includes(e && e.code) || /^shared_/.test(e && e.code || '') ? ' <button class="btn btn-sm" type="button" data-paste>Paste a chord sheet</button>' : '');
      const pb = msg.querySelector('[data-paste]'); if (pb) pb.onclick = () => this.openImport({ title: track.title, artist: track.artist });
      const kb = msg.querySelector('[data-key]'); if (kb) kb.onclick = () => { $('btn-settings').click(); setTimeout(() => $('api-key').focus(), 50); };
      Sfx.fail();
      if (opts.onError) opts.onError(e);
      return null;
    } finally {
      if (this.searchCtl === ctl) this.searchCtl = null;
      const sb = panel.querySelector('[data-stop]'); if (sb) { sb.textContent = 'Close'; sb.onclick = () => { panel.hidden = true; }; }
    }
  },
  lookupErr(e, where){
    const c = e && e.code;
    if (c === 'not_in_dataset') return this.inViewer ? 'This song isn’t in the chord dataset. Reading chord sites on the web needs the phone/desktop version with your API key (this preview can’t search the web).' : 'This song isn’t in the chord dataset. Add your Anthropic API key in Settings so Claude can read chord sources on the web for it, or paste a chord sheet.';
    if (c === 'no_index') return 'The chord index didn’t load in this page. Reload and try again.';
    if (c === 'web_nf') return 'Claude couldn’t find two chord sources for this recording.';
    if (c === 'shared_daily_limit') return 'Today’s free song lookups are used up. Try again tomorrow, or add your own Anthropic API key in Settings.';
    if (c === 'shared_ip_limit') return 'You’ve used today’s free song lookups. Try again tomorrow, or add your own Anthropic API key in Settings.';
    if (c === 'shared_busy') return 'This song is being looked up right now. Try again in a minute.';
    if (c === 'shared_filtered') return 'Anthropic’s content filter stopped the answer (chord pages carry lyrics, and that sometimes trips it). Try again later, or paste a chord sheet.';
    if (c && /^shared_/.test(c)) return 'The shared song-lookup service isn’t available right now. Try again later, or add your own Anthropic API key in Settings.';
    if (c === 'filtered') return 'Anthropic’s content filter stopped Claude’s answer (chord pages carry lyrics, and that sometimes trips it). Try again in a moment, or paste a chord sheet.';
    if (c === 'web_search_off') return 'Web search is switched off for your Anthropic organization. Turn it on in the Claude Console (Settings → Privacy → Web search), then try again.';
    if (c === 'no_web') return 'This song isn’t in the chord dataset, and this preview can’t search the web. Use the phone/desktop version with your API key.';
    if (e && e.status === 403 || e && e.status === 429) return 'Apple’s song search is busy right now. Wait a minute and try again.';
    if (e instanceof TypeError || /network|Failed to fetch|Load failed/i.test(String(e && e.message))) return this.inViewer ? 'This preview can’t reach the music databases. Use the phone/desktop version to look songs up.' : 'Couldn’t reach the music databases. Check your internet connection and try again.';
    return this.errCopy(e);
  },
  // the confirm screen: one question per thing the checks couldn't settle; resolves with the chosen chart or null
  confirmChart(o, track){
    return new Promise(resolve => {
      this.open('m-confirm');
      const pr = o.prov;
      $('cf-rec').innerHTML = `${o.art ? `<img alt="" src="${esc(o.art)}">` : '<span></span>'}<span><b>${esc(o.title)}</b><br><small>${esc(o.artist)} · ${esc([o.album, o.year].filter(Boolean).join(' · '))}</small></span>`;
      $('cf-intro').innerHTML = pr.src === 'web'
        ? `This song isn’t in the chord dataset, so Claude read ${pr.sources.length || 'several'} chord source${pr.sources.length === 1 ? '' : 's'} on the web and reconciled them. Check the parts below.`
        : pr.src === 'hooktheory' ? `The chords come from Hooktheory’s transcription of this recording (parts of the song). ${pr.checked ? 'I compared them with the recording’s preview and found this:' : 'Check this:'}`
        : `The chords come from the Chordonomicon dataset. ${pr.checked ? 'I compared them with the recording’s preview and found this:' : 'Check this:'}`;
      const box = $('cf-qs'); box.textContent = '';
      const choices = {};
      for (const is of pr.issues) {
        const fs = document.createElement('fieldset'); fs.className = 'cf-q';
        let legend = '', text = '', opts = [];
        const rec = Chart.recommend(is);
        if (is.kind === 'pitch') {
          const up = is.t, dn = 12 - is.t;
          legend = 'Key';
          const lower = up >= 10;
          text = `The chart’s shapes are in <b>${esc(is.shapesKey)}</b>, but ${is.from === 'hooktheory' ? 'Hooktheory’s transcription of this recording is' : 'the recording sounds'} <b>${!lower ? up + ' fret' + (up > 1 ? 's' : '') + ' higher' : dn + ' fret' + (dn > 1 ? 's' : '') + ' lower'}</b>, in <b>${esc(is.soundKey)}</b>.`;
          const tot = ((is.capo || 0) + up) % 12, tdn = 12 - tot;   // from open shapes to the recording
          if (tot <= 9) opts.push(['capo', `${tot ? 'Capo ' + tot : 'No capo'}, same shapes (sounds in ${esc(is.soundKey)})`]);
          if (tot >= 10) opts.push(['tune', `Tune down ${tdn === 1 ? 'a half step' : 'a whole step'}, same shapes${is.capo ? ', no capo' : ''} (sounds in ${esc(is.soundKey)})`]);
          opts.push(['transpose', `Change the chords to ${esc(is.soundKey)}, no capo`]);
          opts.push(['keep', `Keep it as written (sounds in ${esc(is.shapesKey)}, not like the record)`]);
        } else if (is.kind === 'chord') {
          legend = 'Chord ' + is.name;
          text = `Where the chart plays <b>${esc(is.name)}</b>, the recording sounds more like <b>${esc(is.alt)}</b>.`;
          opts = [['keep', `Keep ${esc(is.name)}`], ['swap', `Use ${esc(is.alt)} instead`]];
        } else if (is.kind === 'fit') {
          legend = 'Match';
          text = `The chords only partly match what plays in the preview (${Math.round((is.ratio || 0) * 100)}%). It could be a different version of the song, or a weak chart.`;
          opts = [['keep', 'Use it anyway']];
          if (this.canWeb() && pr.src !== 'web' && !pr.auto) opts.push(['web', 'Look it up on the web instead (Claude reads two or more chord sources)']);
        } else if (is.kind === 'section') {
          legend = is.name;
          text = is.conf === 'low' ? 'The web sources disagree about this part (or only one source had it).' : 'The web sources mostly agree about this part.';
          opts = [['keep', 'Keep it (marked “unsure” in the song map)']];
        }
        fs.innerHTML = `<legend>${esc(legend)}</legend><p>${text}</p>` + opts.map(([v, l]) => `<label><input type="radio" name="cf-${esc(is.id)}" value="${v}"${v === rec ? ' checked' : ''}><span>${l}${v === rec ? '<em>suggested</em>' : ''}</span></label>`).join('');
        fs.querySelectorAll('input').forEach(inp => inp.onchange = () => { choices[is.id] = inp.value; });
        choices[is.id] = rec;
        box.appendChild(fs);
      }
      const done = v => { $('btn-cf-ok').onclick = $('btn-cf-paste').onclick = null; this._cfResolve = null; resolve(v); };
      this._cfResolve = () => done(null);
      $('btn-cf-ok').onclick = () => {
        $('m-confirm').hidden = true; this.openModal = null;
        if (Object.values(choices).includes('web') && track) { done(null); this.pickRecording(track, { fresh: true, forceWeb: true }); return; }
        done(Chart.applyChoices(o, choices));
      };
      $('btn-cf-paste').onclick = () => { $('m-confirm').hidden = true; this.openModal = null; done(null); this.openImport({ title: o.title, artist: o.artist }); };
    });
  },
  errCopy(e){
    const c = e && e.code;
    if (c === 'not_granted' || c === 'sampling_disabled' || c === 'capability_disabled') return 'Claude isn’t allowed on this page, so song search is off. The song library still works.';
    if (c === 'rate_limited') return 'Too many searches at once. Wait a minute and try again.';
    if (c === 'bad_key') return 'Your API key was rejected. Check it in Settings.';
    if (c === 'bad_model') return 'That model name wasn’t found. Check the model in Settings.';
    if (c === 'invalid_json') return 'The chart came back garbled. Search again to get a fresh one.';
    if (c === 'refused') return 'Claude couldn’t chart that one. Try another song.';
    if (c === 'session_expired') return 'Your claude.ai session ended. Sign in again, then search.';
    if (e instanceof TypeError) return 'Couldn’t reach Claude. Check your internet connection and try again.';
    return (e && e.message) ? 'Search failed: ' + e.message : 'Search failed. Try again.';
  },
  // extra: { webSearch, kind: 'web' | 'career' | 'groove', body } — kind/body let the shared service build the same
  // prompt itself (it never takes prompt text from the page). A player's own key goes first (their own account).
  async askClaude(prompt, signal, tier, extra){
    if (extra && extra.webSearch) {
      if (!this.inViewer && Settings.apiKey) return this.askClaudeWeb(prompt, signal);
      if (this.sharedOn() && extra.kind) return this.askShared(extra.kind, extra.body, signal);
      throw Object.assign(new Error('Web search needs your API key.'), { code: 'no_web' });
    }
    if (!this.sample && !(!this.inViewer && Settings.apiKey) && this.sharedOn() && extra && extra.kind) return this.askShared(extra.kind, extra.body, signal);
    if (this.sample) return await this.sample.json(prompt, { modelTier: tier || 'default', signal });
    if (!this.inViewer && Settings.apiKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', 'x-api-key': Settings.apiKey.trim(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: (Settings.apiModel || 'claude-sonnet-5').trim(), max_tokens: 8000, messages: [{ role: 'user', content: prompt }] })
      });
      if (!res.ok) {
        let msg = ''; try { const j = await res.json(); msg = j && j.error && j.error.message; } catch (x) {}
        const err = new Error(msg || ('HTTP ' + res.status));
        err.code = res.status === 401 || res.status === 403 ? 'bad_key' : res.status === 429 ? 'rate_limited' : res.status === 404 ? 'bad_model' : 'upstream_error';
        throw err;
      }
      const j = await res.json();
      return parseJsonLoose((j.content || []).map(c => c.text || '').join(''));
    }
    throw Object.assign(new Error('Song search is not set up.'), { code: 'unavailable' });
  },

  // the shared lookup service: answers are remembered for everyone, so each song / artist is only paid for once
  async askShared(kind, body, signal){
    const url = SHARED_URL.replace(/\/+$/, '') + '/v1/' + kind;
    for (let tries = 0; tries < 8; tries++) {
      const res = await fetch(url, { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
      let j = null; try { j = await res.json(); } catch (e) {}
      if (res.ok && j && j.ok) return j.data;
      const code = j && j.code || (res.status === 429 ? 'daily_limit' : 'upstream');
      // someone else is looking this one up right now: their answer will be shared, so wait for it
      if (code === 'busy') { await new Promise((ok, no) => { const t = setTimeout(ok, 12000); if (signal) signal.addEventListener('abort', () => { clearTimeout(t); no(Object.assign(new Error('Stopped'), { name: 'AbortError' })); }, { once: true }); }); continue; }
      throw Object.assign(new Error('Shared service: ' + code), { code: 'shared_' + code });
    }
    throw Object.assign(new Error('Shared service: busy'), { code: 'shared_busy' });
  },
  // Claude with the web search tool (API key only): reads chord sources, returns the JSON it was asked for
  async askClaudeWeb(prompt, signal){
    const headers = { 'content-type': 'application/json', 'x-api-key': Settings.apiKey.trim(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    let messages = [{ role: 'user', content: prompt }];
    for (let turn = 0; turn < 5; turn++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal, headers,
        // no extended thinking: while reading chord pages, thinking out loud can quote the words on them, and the
        // API then blocks the whole answer ("Output blocked by content filtering policy")
        body: JSON.stringify({ model: (Settings.apiModel || 'claude-sonnet-5').trim(), max_tokens: 8000, messages, thinking: { type: 'disabled' }, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }] }) });
      if (!res.ok) {
        let msg = ''; try { const j = await res.json(); msg = j && j.error && j.error.message || ''; } catch (x) {}
        const err = new Error(msg || ('HTTP ' + res.status));
        err.code = /web.?search/i.test(msg) ? 'web_search_off' : /content filtering/i.test(msg) ? 'filtered' : res.status === 401 || res.status === 403 ? 'bad_key' : res.status === 429 ? 'rate_limited' : res.status === 404 ? 'bad_model' : 'upstream_error';
        throw err;
      }
      const j = await res.json(), content = j.content || [];
      const results = content.filter(b => b.type === 'web_search_tool_result');
      if (results.length && results.every(b => b.content && !Array.isArray(b.content) && b.content.type === 'web_search_tool_result_error')) {
        const ec = results[0].content.error_code;
        if (ec === 'unavailable' || ec === 'invalid_tool_input') throw Object.assign(new Error('Web search is unavailable: ' + ec), { code: 'web_search_off' });
      }
      if (j.stop_reason === 'pause_turn') { messages = [...messages, { role: 'assistant', content }]; continue; }
      // the answer is the text after the last search (earlier text is Claude's notes between searches)
      let last = -1; content.forEach((b, i) => { if (b.type !== 'text') last = i; });
      const tail = content.slice(last + 1).filter(b => b.type === 'text').map(b => b.text).join('');
      try { return parseJsonLoose(tail); } catch (e) { return parseJsonLoose(content.filter(b => b.type === 'text').map(b => b.text).join('')); }
    }
    throw Object.assign(new Error('The web search took too long.'), { code: 'web_nf' });
  },

  // a mode button's click: the card squashes and throws its own particles (notes, stars, flames), then the screen changes
  modeBurst(card, kind, go){
    Sfx.open();
    if (reduceMotion) { go(); return; }
    card.classList.add('pressed'); setTimeout(() => card.classList.remove('pressed'), 160);
    ModeIcons.kick(kind);
    setTimeout(go, 200);
  },
  /* ---------- song menu ---------- */
  openSong(song, storyCtx){
    this.song = song;
    this.storyCtx = storyCtx || null;
    Story.songStrip();
    this.recompile();
    this.renderSong();
    this.show('song');
  },
  recompile(){ const t = Story.tier(); this.chart = compileSong(this.song, { shapes: t ? (t.easy ? 'easy' : 'standard') : Settings.shapes }); },
  renderSong(){
    const s = this.song, ch = this.chart;
    $('song-title').textContent = s.title;
    $('song-artist').textContent = s.artist || '';
    const pr = s.prov || null;
    const src = pr && pr.src === 'dataset' ? ['Dataset' + (pr.checked ? ' ✓ checked' : ''), 'src-data'] : pr && pr.src === 'hooktheory' ? ['Dataset (parts only)' + (pr.checked ? ' ✓ checked' : ''), 'src-data'] : pr && pr.src === 'web' ? ['Web sources', 'src-web'] : [{ library: 'Library', claude: 'Charted by Claude (old)', code: 'From a song code', paste: 'Pasted chord sheet' }[s.source] || '', ''];
    const needs = pr && pr.issues && pr.issues.length && pr.status !== 'confirmed' ? ['Needs confirming', 'src-confirm'] : null;
    const d = this.difficulty(s);
    const pills = [[`${s.bpm} BPM`], [ch.timeLabel], [s.key && 'Key ' + s.key], [STYLE_NAMES[s.style] || s.style], [s.feel === 'swing' && 'Swing feel'], [ch.capo ? 'Capo ' + ch.capo : 'No capo'],
      [s.tuning ? `Tuned down ${s.tuning === -1 ? '½ step' : s.tuning === -2 ? '1 step' : -s.tuning / 2 + ' steps'}` : ''], [['', 'Easy', 'Medium', 'Hard'][d]], src, needs || []].filter(p => p && p[0]);
    $('song-pills').innerHTML = pills.map(([p, c]) => `<span class="chip ${c || ''}">${esc(p)}</span>`).join('');
    $('song-artist').textContent = [s.artist, s.album, s.year || ''].filter(Boolean).join(' · ');
    $('song-links').innerHTML = this.links(s.title, s.artist) + ' <button class="btn btn-sm" type="button" id="btn-fix-chart">Chart looks wrong? Paste a chord sheet</button>' + (pr && pr.issues && pr.issues.length ? ' <button class="btn btn-sm" type="button" id="btn-review">Review the checks</button>' : '');
    $('btn-fix-chart').onclick = () => this.openImport({ title: s.title, artist: s.artist });
    if ($('btn-review')) $('btn-review').onclick = () => this.reviewChart(s);
    let srcLine = '';
    const htLink = `<a href="${Lookup.HT_URL}" target="_blank" rel="noopener">Hooktheory</a> TheoryTab data (Donahue et al., 2022), CC BY-NC-SA 3.0`;
    const htNote = pr && pr.ht ? ` · key${pr.htFix && pr.htFix.fixed ? ', ' + pr.htFix.fixed + ' chord' + (pr.htFix.fixed > 1 ? 's' : '') : ''} and timing cross-checked with ${htLink}` : '';
    const checkNote = pr && pr.checked ? (pr.pitchFrom === 'hooktheory' ? ' · pitch checked against Hooktheory’s transcription of this recording' : ` · checked against the recording’s preview${pr.offset ? '' : ' (same key)'}`) : pr && pr.audioErr ? ` · not checked against the recording: ${esc(pr.audioErr)}` : '';
    if (pr && pr.src === 'dataset') srcLine = `Chords: <a href="${Lookup.CREDIT_URL}" target="_blank" rel="noopener">Chordonomicon</a> dataset (Kantarelis et al., 2024), CC BY-NC 4.0` + checkNote + htNote + ` · timing from ${esc(pr.bpmFrom || 'defaults')}.`;
    else if (pr && pr.src === 'hooktheory') srcLine = `Chords: ${htLink}, a transcription of this recording. It has only parts of the song (${pr.ht ? pr.ht.clips : 'a few'} passage${pr.ht && pr.ht.clips === 1 ? '' : 's'}), so the chart is shorter than the record` + checkNote + '.' + (pr.webErr ? ` The web backup didn’t work: ${esc(this.lookupErr({ code: pr.webErr }))}` : this.inViewer || !Settings.apiKey ? ' Add your API key in Settings to get the whole song from web sources.' : '');
    else if (pr && pr.src === 'web') srcLine = (pr.auto ? `The dataset chart only matched ${Math.round((pr.auto.fit || 0) * 100)}% of the recording, so ` : '') + `Chords read from web sources by Claude: ${pr.sources.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(this.host(u) || 'source ' + (i + 1))}</a>`).join(', ') || 'sources not listed'}.` + (pr.checked ? ' Checked against the recording’s preview.' : '') + (pr.ht ? ` Key${pr.htFix && pr.htFix.fixed ? ', ' + pr.htFix.fixed + ' chord' + (pr.htFix.fixed > 1 ? 's' : '') : ''} and timing cross-checked with ${htLink}.` : '');
    $('song-src').innerHTML = srcLine;
    $('song-note').hidden = !s.note; $('song-note').textContent = s.note || '';
    this.setSeg('seg-easy', Settings.shapes);
    const simp = ch.events.filter(e => e.v && e.v.simplified).map(e => e.full);
    let en = ch.mode === 'easy' ? (ch.capoChanged ? `Capo ${ch.capo}: easier shapes for the same chords.` : 'Easier shapes for the same chords.') : ch.mode === 'neck' ? 'Shapes all over the neck, each one close to the last.' : 'Familiar shapes, including barre chords, close to each other.';
    $('easy-note').textContent = en;
    $('tempo').value = Settings.tempo; this.tempoLabel();
    this.setSeg('seg-strict', Settings.strict);
    this.setSeg('seg-hand', Settings.lefty ? '1' : '0');
    this.setSeg('seg-view', Settings.fbView === 'tab' ? 'tab' : 'down');
    $('view-note').textContent = Settings.fbView === 'tab' ? 'Like guitar tab: thinnest string on top.' : 'Like looking down at your own guitar: thickest string on top.';
    this.strictLabel();
    const sel = $('sel-section'); sel.textContent = '';
    ch.sections.forEach((sec, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${sec.name} (bar ${sec.startBar + 1})`; sel.appendChild(o); });
    $('chk-loop').checked = false;
    const cl = $('chord-list'); cl.textContent = '';
    ch.unique.forEach(u => {
      const d = document.createElement('div'); d.className = 'cbox';
      d.innerHTML = `<b>${esc(u.label)}</b>${miniDiagram(u.v, ch.capo)}<small>${[u.where, ch.capo ? 'sounds ' + esc(u.sounds) : 'tap to hear'].filter(Boolean).join(' · ')}</small>`;
      d.title = 'Hear ' + u.label; d.style.cursor = 'pointer';
      d.addEventListener('click', () => AudioEngine.playChord(soundingNotes(u.v, ch.capo), u.label + '|' + u.v.frets.join(',')));
      cl.appendChild(d);
    });
    $('chord-count').textContent = `${ch.unique.length} chord${ch.unique.length === 1 ? '' : 's'} · tap: strum · tap again: arpeggio`;
    const map = $('song-map'); map.textContent = '';
    ch.sections.forEach((sec, si) => {
      const row = document.createElement('div'); row.className = 'row';
      const evs = ch.events.filter(e => e.sec === si);
      const conf = s.sections[si] && s.sections[si].conf;
      row.innerHTML = `<b>${esc(sec.name)}${conf && conf !== 'high' ? `<small>${conf === 'low' ? 'unsure' : 'mostly sure'}</small>` : ''}</b><div class="bars">${evs.map(e => `<span class="bar" title="${esc(e.rest ? 'Rest' : e.label)} · ${e.len} beats" style="background:${e.rest ? '#fff' : cardColor(e.label)};color:${e.rest ? COL.ink : textOn(cardColor(e.label))}">${e.rest ? '·' : esc(e.label)}</span>`).join('')}</div>`;
      map.appendChild(row);
    });
    if (this.renderInst) this.renderInst();
    const best = Store.get('best', {})[s.id + (this.inst() !== 'guitar' ? ':' + this.inst() : '')];
    $('best-score').textContent = best ? `Best: ${best.score.toLocaleString()} (${best.grade})` : '';
  },
  host(u){ try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } },
  // reopen the confirm screen for a saved chart (answers can be changed)
  async reviewChart(s){
    const v = await this.confirmChart(s, null);
    if (!v) return;
    const song = validateSong(v, v.prov && v.prov.src === 'web' ? 'web' : 'dataset');
    if (song.trackId) Chart.remember({ trackId: song.trackId }, song);
    this.saveMine(song); this.renderLists(); this.openSong(song, this.storyCtx);
  },
  setSeg(id, v){ const e = $(id); if (e.tagName === 'SELECT') { e.value = String(v); return; } e.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); },
  tempoLabel(){ $('tempo-val').textContent = Settings.tempo + '%'; $('tempo-bpm').textContent = this.song ? `${Math.round(this.song.bpm * Settings.tempo / 100)} BPM` : ''; },
  strictLabel(){ $('strict-note').textContent = { relaxed: 'Right notes in any octave count.', normal: 'Each string’s note has to ring.', strict: 'Each string rings, and no wrong notes.' }[Settings.strict]; },

  async startGame(mode, skipTune){
    AudioEngine.ensure();
    if (!this.partReady(mode)) return;
    await this.storyIntro(mode);                  // Story: the backstage scene before the first Stage run of a song
    if (!skipTune && Settings.tuneFirst && !this.tunedThisSession) { this.openTune(mode); return; }
    if (!Mic.on && Mic.available() && Mic.failed !== 'blocked') await Mic.start();
    this.refreshMic();
    await this.show('game');
    await new Promise(r => requestAnimationFrame(r));
    Stage.resize();
    // Story levels fix the rules and paint the era's stage
    const t = Story.tier(), L = Story.level();
    Stage.scene = t && L ? L.scene : null;
    const o = t && mode === 'stage' ? { section: 0, loop: false, tempo: t.tempo, strict: t.strict }
      : t ? { section: +$('sel-section').value || 0, loop: $('chk-loop').checked, tempo: Settings.tempo, strict: t.strict }
      : mode === 'stage' && this.battleOpts ? { ...this.battleOpts }
      : { section: +$('sel-section').value || 0, loop: $('chk-loop').checked, tempo: Settings.tempo };
    // another instrument (Stage only): its part comes along
    const inst = o.inst || (t ? 'guitar' : this.inst());
    if (mode === 'stage' && inst !== 'guitar') { o.inst = inst; if (inst === 'vocals') o.vox = this.vox; }
    const ok = G.start(this.chart, mode, o);
    if (!ok) { this.show('song'); if (Online.rec) Online.cancel(); return; }
    if (Online.rec && mode === 'stage') Online.beginRecording();
  },
  hudUpdate(){
    $('hud-title').textContent = this.song ? this.song.title : '';
    const tp = G.opts && G.opts.tempo || Settings.tempo, tempo = tp !== 100 ? ` · ${tp}% tempo` : '';
    const where = this.storyCtx ? `Story · Level ${this.storyCtx.li + 1}` : '';
    if (G.mode === 'practice') {
      $('hud-sub').textContent = (where ? where + ' · practice' : 'Practice') + tempo + (G.opts && G.opts.loop ? ' · looping' : '');
      $('hud-score').textContent = `${Math.min(G.idx + 1, G.list.length)}/${G.list.length}`;
      $('hud-score-l').textContent = (G.streak >= 2 ? `streak ${G.streak}` : 'chord') + (G.laps ? ` · lap ${G.laps + 1}` : '');
      $('btn-skip').hidden = false;
    } else {
      $('hud-sub').textContent = (where ? where + ' · need ' + (Story.tier() || {}).pass : 'Stage') + tempo;
      const sc = $('hud-score'), txt = G.score.toLocaleString();
      if (sc.textContent !== txt) { sc.textContent = txt; sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump'); }
      const mult = 1 + Math.min(3, Math.floor(G.combo / 8));
      $('hud-score-l').textContent = G.combo > 1 ? `combo ${G.combo}${mult > 1 ? ' · ×' + mult : ''}` : 'score';
      $('btn-skip').hidden = true;
    }
    $('hype-label').textContent = LEVEL_NAMES[G.level || 0];
    document.querySelector('.hype').classList.toggle('l4', (G.level || 0) >= 4);
    this.refreshMic();
  },
  sideUpdate(ev, next){
    const capo = this.chart.capo;
    const nn = $('now-name');
    if (nn.textContent !== ev.label) { nn.textContent = ev.label; nn.classList.remove('pop'); void nn.offsetWidth; nn.classList.add('pop'); }
    const st = chordSteps(ev, capo), ol = $('steps');
    ol.innerHTML = st.steps.map((x, k) => `<li data-s="${x.strings.join(',')}" style="animation-delay:${k * 90}ms"><i style="background:${FINGER_COL[x.fin]};${x.fin === 4 ? 'color:#fff' : ''}">${x.fin === 5 ? 'T' : x.fin}</i><span>${x.html}</span></li>`).join('') +
      `<li class="strum" style="animation-delay:${st.steps.length * 90}ms">${esc(st.strum)}</li>`;
    const bits = [];
    if (ev.v.simplified) bits.push('easy version of ' + ev.full);
    if (capo) bits.push(`capo ${capo} · sounds like ${ev.sounds}`);
    $('now-sub').textContent = bits.join(' · ');
    if (next) { $('next-svg').innerHTML = miniDiagram(next.v, 0); $('next-name').textContent = next.label; $('next-box').hidden = false; }
    else { $('next-svg').innerHTML = ''; $('next-name').textContent = 'End'; }
    // one chip per string: which ones this chord uses, lit green/red as I hear them
    const used = ev.v.frets.map(f => f >= 0), order = Settings.lefty ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5];
    $('str-chips').innerHTML = order.map(i => `<span data-i="${i}" class="${used[i] ? '' : 'off'}" title="${used[i] ? 'play' : "don't play"} the ${STRING_NAMES[i]} string">${STRING_NAMES[i]}</span>`).join('');
    const bd = $('board'); if (bd) bd.dataset.root = (ev.label || '').charAt(0).toUpperCase();
    this.fbStatus([]);
  },
  fbStatus(states){
    const el = $('fb-status'); if (!el) return;
    const names = ['low E', 'A', 'D', 'G', 'B', 'high e'];
    const miss = [], heard = []; (states || []).forEach((x, i) => { if (x === 'miss') miss.push(names[i]); else if (x === 'heard') heard.push(i); });
    const need = document.querySelectorAll('#str-chips span:not(.off)').length;
    const all = heard.length && heard.length >= need;
    const txt = miss.length ? `${miss.join(' + ')}: not ringing!` : all ? 'All ringing!' : heard.length ? `${heard.length} of ${need} ringing` : '';
    el.className = 'fb-sticker ' + (miss.length ? 'bad' : all ? 'good' : '');
    if (el.textContent !== txt) { el.textContent = txt; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
  },
  hint(t){ $('hint').textContent = t || ''; },
  stepsHeard(states){
    const st = i => states[i] === 1 || states[i] === true ? 'heard' : states[i];
    document.querySelectorAll('#str-chips span').forEach(sp => { const k = st(+sp.dataset.i); sp.classList.toggle('heard', k === 'heard'); sp.classList.toggle('miss', k === 'miss'); });
    this.fbStatus([0, 1, 2, 3, 4, 5].map(st));
    document.querySelectorAll('#steps li[data-s]').forEach(li => {
      const ss = li.dataset.s.split(',').filter(Boolean).map(Number);
      const ok = ss.length > 0 && ss.every(i => st(i) === 'heard'), bad = ss.some(i => st(i) === 'miss');
      if (li.classList.contains('ok') !== ok) li.classList.toggle('ok', ok);
      if (li.classList.contains('bad') !== bad) li.classList.toggle('bad', bad);
    });
  },
  showResults(r){
    const ch = r.chart;
    if (r.mode === 'stage') {
      $('res-grade').textContent = r.grade; $('res-grade').classList.toggle('fail', !!r.failed);
      $('res-title').textContent = r.title;
      $('res-sub').textContent = `${ch.song.title} · ${this.storyCtx ? 'Story level ' + (this.storyCtx.li + 1) : 'Stage'}${r.inst && r.inst !== 'guitar' ? ' · ' + INST_NAMES[r.inst] + (r.guide ? ' (chord guide)' : '') : ''}${r.tempo !== 100 ? ' at ' + r.tempo + '% tempo' : ''}${r.tap ? ' · tap mode (timing only)' : ''}${r.newBest ? ' · New best!' : ''}`;
      const c = r.counts;
      const stats = [['Score', r.score], ['Accuracy', Math.round(r.acc * 100) + '%'], ...(r.tap ? [] : [[r.inst === 'vocals' ? 'In tune' : 'Notes heard', Math.round(r.noteAcc * 100) + '%']]),
        ['Best combo', r.maxCombo], ['Top hype', LEVEL_NAMES[r.topLevel || 0]], ['Perfect', c.perfect], ['Great', c.great], ['Good', c.good + c.ok], ['Missed', c.miss]];
      $('res-stats').innerHTML = stats.map(([l, v]) => `<div class="stat"><b class="${/^[\d,.%]+$/.test(String(v)) ? '' : 'txt'}">${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
      if (r.failed) $('res-sub').textContent = `${ch.song.title} · the crowd walked out ${Math.round((r.progress || 0) * 100)}% of the way through`;
      $('res-tough').innerHTML = r.failed && r.inst === 'vocals' ? `<div class="tip"><b>Too many misses in a row.</b> Slow the tempo down, sing along with the song a few times, and wear headphones so the band doesn’t drown you out.</div>` : r.failed ? `<div class="tip"><b>Too many misses in a row.</b> Learn the tough changes in Practice (it waits for every chord), or slow the tempo down, then take the stage again.</div>` : r.tough.length && r.inst === 'vocals' ? `<div class="tip"><b>Tough lines:</b> ${r.tough.map(t => `“${esc(t.label)}”`).join(' · ')}. Hum them with the song a few times, then try again${r.guide ? '. Adding the song file gives you the real melody to follow' : ''}.</div>`
        : r.tough.length ? `<div class="tip"><b>Work on:</b> ${r.tough.map(t => `${esc(t.label)} (${Math.round(t.frac * 100)}% of notes heard)`).join(' · ')}. Try them in Practice.</div>` : '';
    } else {
      $('res-grade').textContent = r.skipped ? 'OK!' : 'YES!'; $('res-grade').classList.remove('fail');
      $('res-title').textContent = 'Practice complete';
      $('res-sub').textContent = `${ch.song.title}${r.tap ? ' · tap mode' : ''}`;
      const stats = [['Chords played', r.played], ['Avg. time to get each', r.avg ? r.avg.toFixed(1) + 's' : '–'], ['Best streak', r.bestStreak || 0],
        ['Top hype', LEVEL_NAMES[r.topLevel || 0]], ...(r.fastest ? [['Fastest change', `${r.fastest.label} · ${r.fastest.time.toFixed(1)}s`]] : []), ['Skipped', r.skipped]];
      $('res-stats').innerHTML = stats.map(([l, v]) => `<div class="stat"><b class="${/^[\d,.%]+$/.test(String(v)) ? '' : 'txt'}">${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
      $('res-tough').innerHTML = r.tough.length && !r.tap ? `<div class="tip"><b>Slowest changes:</b> ${r.tough.map(t => `${esc(t.label)} (${t.avg.toFixed(1)}s)`).join(' · ')}. Speed comes with repetition, so loop the section that has them.</div>` : '';
    }
    // story mode: record the run, say what it means for the career
    const so = this.storyCtx ? Story.record(r) : null, rs = $('res-story');
    this.resStory = so;
    const or = Online.record(r), br = or ? null : Battle.record(r), cr = !this.storyCtx && !br && !or ? Challenge.record(r) : null;
    const sr = so ? Story.resultsHtml(so) : this.storyCtx && r.mode === 'practice' ? { html: '<span>Practice doesn’t count toward the career. Take the Stage to clear this song.</span>' } : or || br || cr;
    rs.hidden = !sr; rs.className = 'res-story' + (sr && sr.big ? ' big' : ''); rs.innerHTML = sr ? sr.html : '';
    rs.querySelectorAll('[data-bt]').forEach(b => b.onclick = () => Battle.after());
    rs.querySelectorAll('[data-online]').forEach(b => b.onclick = () => Online.after());
    $('btn-res-home').hidden = !!this.storyCtx; $('btn-res-career').hidden = !this.storyCtx;
    Music.fanfareNext();
    this.show('results').then(() => {
      if ((so && (so.levelClear || so.mastered)) || (cr && cr.won) || (br && br.won)) setTimeout(() => { Fx.confetti(320); Sfx.stamp(); }, 900);
      setTimeout(() => { Sfx.stamp(); }, 380);
      const good = r.mode === 'practice' || ['S', 'A', 'B'].includes(r.grade);
      if (good) setTimeout(() => Fx.confetti(r.grade === 'S' ? 260 : 150), 420);
      // count the numbers up
      document.querySelectorAll('#res-stats .stat b').forEach((b, i) => {
        const m = /^(\d[\d,]*)(%?)$/.exec(b.textContent); if (!m || reduceMotion) return;
        const target = +m[1].replace(/,/g, ''), suffix = m[2];
        const t0 = performance.now() + 250 + i * 60, dur = 900;
        const step = () => {
          const k = Math.min(1, Math.max(0, (performance.now() - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
          b.textContent = Math.round(target * e).toLocaleString() + suffix;
          if (k < 1) { if (i === 0 && Math.random() < 0.35) Sfx.tick(); requestAnimationFrame(step); }
        };
        b.textContent = '0' + suffix; requestAnimationFrame(step);
      });
    });
  },

  /* ---------- modals ---------- */
  open(id){ this.closeModal(true); const m = $(id); if (id === 'm-pause') $('btn-resume').textContent = Online.rec ? 'Restart take' : 'Resume'; m.hidden = false; this.openModal = id; Sfx.modalOpen(); const sh = m.querySelector('.sheet'); if (sh && !reduceMotion) sh.style.animation = 'rise .38s cubic-bezier(.2,1.4,.4,1) both'; const f = m.querySelector('button,input,textarea,select'); f && f.focus(); },
  closeModal(quiet){
    if (!this.openModal) return;
    if (!quiet) Sfx.modalClose();
    const id = this.openModal; $(id).hidden = true; this.openModal = null;
    if (id === 'm-confirm' && this._cfResolve) this._cfResolve();
    if (id === 'm-pause' && G.paused && Online.rec) { G.stop(); Online.restart(); }
    else if (id === 'm-pause' && G.paused) G.resume();
    if (id === 'm-mic' && this.screen === 'game' && G.paused) this.open('m-pause');
  },
  openMic(){
    this.open('m-mic');
    this.refreshMic();
    this.fillDevices();
    $('sens').value = Settings.sens; $('lat').value = Settings.latency; $('lat-val').textContent = Settings.latency;
    $('chk-echo').checked = !!Settings.echo; $('chk-phones').checked = !!Settings.headphones;
    const tc = $('test-chord');
    if (!tc.options.length) ['G', 'C', 'D', 'Em', 'Am', 'E', 'A', 'Dm', 'F', 'G7', 'D7', 'Cadd9'].forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; tc.appendChild(o); });
    const p = (Settings.micProfiles || {})[Mic.deviceId];
    $('mic-cal-msg').textContent = p ? 'This mic is set up. Run it again if you move somewhere noisier.' : 'Teaches the game what your room sounds like, so it only listens to your guitar.';
  },
  async fillDevices(){
    const sel = $('sel-device');
    if (!Mic.on) { sel.hidden = true; return; }
    const ds = await Mic.devices();
    sel.textContent = '';
    ds.forEach((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || 'Microphone ' + (i + 1); sel.appendChild(o); });
    const cur = Mic.stream && Mic.stream.getAudioTracks()[0] && Mic.stream.getAudioTracks()[0].getSettings().deviceId;
    if (cur) sel.value = cur;
    sel.hidden = ds.length < 1;
  },
  openMicMsg(){ const p = (Settings.micProfiles || {})[Mic.deviceId]; $('mic-cal-msg').textContent = p ? 'This mic is set up.' : 'New mic: press “Set up this mic” so I learn how your room sounds.'; },
  micFrame(){
    $('meter').style.width = Math.min(100, Math.sqrt(Mic.level) * 260) + '%';
    if (!Mic.on) return;
    if (this.frameN % 4 === 0) this.tuneReadout({ note: 'tune-note', needle: 'tune-needle', text: 'tune-text' }, null);
    if (this.frameN % 6 === 0) {
      const top = Mic.heardNotes();
      $('heard').innerHTML = top.length ? top.map(o => `<span class="chip">${midiName(o.m)}</span>`).join('') : '<span class="small muted">Nothing yet. Strum away.</span>';
    }
    // chord test: the same check the game uses
    if (Mic.anSeq !== this.testSeq && Mic.an) {
      this.testSeq = Mic.anSeq;
      const name = $('test-chord').value, ch = parseChord(name); if (!ch) return;
      const v = voicingFor(ch, false), midis = soundingNotes(v, 0).map(n => n.midi);
      const res = $('test-res');
      if (Mic.an.quiet || !Mic.an.total) { if (performance.now() - (this.testOkAt || 0) > 2500) res.textContent = 'Strum it and I’ll check every note.'; return; }
      if (Mic.anTime - Ear.N / Mic.sr < Mic.deafUntil) return;
      const r = Ear.matchTarget(Mic.an, { midis }, Settings.strict);
      if (r.ok) { res.textContent = `✓ That’s ${name}. Every note rings.`; res.style.color = COL.good; this.testOkAt = performance.now(); }
      else if (performance.now() - (this.testOkAt || 0) > 1200) {
        const bits = [];
        if (r.missing.length) bits.push('missing ' + r.missing.map(pc => noteName(pc)).join(', '));
        if (r.wrongNotes.length) bits.push('extra ' + [...new Set(r.wrongNotes.map(m => noteName(m)))].join(', '));
        res.textContent = bits.length ? `Not ${name} yet: ${bits.join(' · ')}` : `Not a clean ${name} yet. Let it ring.`;
        res.style.color = COL.bad;
      }
    }
  },
  async micSetup(){
    const msg = $('mic-cal-msg'), btn = $('btn-mic-cal');
    if (!Mic.on && !(await Mic.start())) { this.refreshMic(); msg.textContent = 'Turn on the mic first.'; return; }
    this.refreshMic(); this.fillDevices();
    btn.disabled = true;
    try {
      const r = await Mic.calibrate(step => { msg.textContent = step === 'quiet' ? 'Step 1 of 2: stay quiet for 3 seconds…' : 'Step 2 of 2: now strum a chord and let it ring!'; });
      if (!r.ok) { msg.textContent = 'Couldn’t set up the mic. Try again.'; return; }
      const snr = r.snr;
      msg.textContent = snr >= 8 ? 'All set. Your guitar comes through loud and clear.'
        : snr >= 3 ? 'Set up. The guitar is a little quiet: move the mic closer or play a bit harder.'
        : 'I barely heard the guitar over the room. Move closer to the mic, or pick a different mic in the list.';
      Sfx.found();
    } finally { btn.disabled = false; }
  },
  async calibrate(){
    const msg = $('calib-msg');
    if (!Mic.on && !(await Mic.start())) { this.refreshMic(); msg.textContent = 'Turn on the mic first.'; return; }
    this.refreshMic();
    const ctx = AudioEngine.ensure(), beat = 60 / 90, t0 = ctx.currentTime + 1.2, clicks = [];
    for (let i = 0; i < 8; i++) { const t = t0 + i * beat; clicks.push(t); AudioEngine.kit.click(t, i % 4 === 0); }
    const heard = []; const fn = t => heard.push(t);
    Mic.onsetListeners.add(fn);
    $('btn-calib').disabled = true;
    msg.textContent = 'Strum muted strings exactly on each of the 8 clicks…';
    await new Promise(r => setTimeout(r, (t0 + 8 * beat + 0.6 - ctx.currentTime) * 1000));
    Mic.onsetListeners.delete(fn);
    $('btn-calib').disabled = false;
    const offs = [];
    for (const c of clicks) { let best = null; for (const h of heard) { const d = h - c; if (d > -0.12 && d < 0.45 && (best == null || Math.abs(d) < Math.abs(best))) best = d; } if (best != null) offs.push(best); }
    if (offs.length < 4) { msg.textContent = `I only heard ${offs.length} of 8 strums. Move closer to the mic or raise the sensitivity, then try again.`; return; }
    offs.sort((a, b) => a - b);
    const med = offs[Math.floor(offs.length / 2)];
    Settings.latency = Math.max(0, Math.min(300, Math.round(med * 1000 / 5) * 5)); saveSettings();
    $('lat').value = Settings.latency; $('lat-val').textContent = Settings.latency;
    msg.textContent = `Done. Timing offset set to ${Settings.latency} ms (from ${offs.length} strums).`;
  },
  tuneReadout(ids, lockString){
    const p = Mic.pitch();
    if (!p) return null;
    const m = hzToMidi(p.f), n = Math.round(m), cents = Math.round((m - n) * 100);
    $(ids.note).textContent = noteName(n);
    let si = -1, bd = 99;
    const OM = this.tuneTargets();
    if (lockString != null) { si = lockString; bd = Math.abs(OM[si] - m); }
    else OM.forEach((o, i) => { if (Math.abs(o - m) < bd) { bd = Math.abs(o - m); si = i; } });
    const label = i => STRING_NAMES[i] === 'e' ? 'High e' : i === 0 ? 'Low E' : STRING_NAMES[i];
    if (si >= 0 && bd <= 1.5) {
      const c = Math.round((m - OM[si]) * 100);
      $(ids.needle).style.left = (50 + Math.max(-50, Math.min(50, c))) + '%';
      $(ids.text).textContent = `${label(si)} string: ` + (Math.abs(c) <= 5 ? 'in tune ✓' : c > 0 ? `${c} cents sharp. Loosen it a little.` : `${-c} cents flat. Tighten it a little.`);
      return { string: si, cents: c };
    }
    if (si >= 0 && lockString != null) {
      $(ids.needle).style.left = (m > OM[si] ? 100 : 0) + '%';
      $(ids.text).textContent = `${label(si)} string is way ${m > OM[si] ? 'too high. Loosen it' : 'too low. Tighten it'} until it sounds like ${midiName(OM[si], this.song && this.song.tuning)}.`;
      return null;
    }
    $(ids.needle).style.left = (50 + cents) + '%';
    $(ids.text).textContent = `${midiName(n)} · ${cents >= 0 ? '+' : ''}${cents} cents`;
    return null;
  },
  async openTune(pendingMode){
    this.pendingMode = pendingMode || null;
    this.open('m-tune');
    this.tuneOk = this.tuneOk || [false, false, false, false, false, false];
    this.tuneLock = null; this.tuneHold = { s: -1, t: 0 };
    $('chk-tune-first').checked = Settings.tuneFirst;
    $('btn-tune-go').textContent = pendingMode ? 'Start playing' : 'Done';
    $('btn-tune-skip').hidden = !pendingMode;
    this.renderTuneStrings();
    if (!Mic.on && Mic.available() && Mic.failed !== 'blocked') await Mic.start();
    this.refreshMic();
    $('tune2-msg').textContent = Mic.on
      ? 'Pluck one string at a time and let it ring. Each string turns green once it’s in tune. Tap a string to hear its target note.'
      : (this.inViewer ? 'This page can’t use the microphone, so tune by ear: tap a string below to hear its note, then match your guitar to it.' : 'The mic is off, so tune by ear: tap a string to hear its note and match your guitar to it. Turn on the mic for the needle tuner.');
  },
  // standard tuning, or the open song's (tuned down a half or whole step)
  tuneTargets(){ const t = this.screen !== 'title' && this.song && this.song.tuning || 0; return OPEN_MIDI.map(m => m + t); },
  renderTuneStrings(){
    const box = $('tune2-strings'); box.textContent = '';
    this.tuneTargets().forEach((midi, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'sbtn' + (this.tuneOk[i] ? ' ok' : '') + (this.tuneLock === i ? ' active' : '');
      b.innerHTML = `<b>${STRING_NAMES[i]}</b><small>${midiName(midi, midi !== OPEN_MIDI[i])}${this.tuneOk[i] ? ' ✓' : ''}</small>`;
      b.setAttribute('aria-label', `${midiName(midi)} string${this.tuneOk[i] ? ', in tune' : ''}. Play reference note`);
      b.onclick = () => { AudioEngine.strum([midi]); this.tuneLock = this.tuneLock === i ? null : i; this.renderTuneStrings(); };
      box.appendChild(b);
    });
  },
  tuneFrame(){
    if (!Mic.on || this.frameN % 3) return;
    const r = this.tuneReadout({ note: 'tune2-note', needle: 'tune2-needle', text: 'tune2-text' }, this.tuneLock);
    const now = performance.now();
    if (r && Math.abs(r.cents) <= 6) {
      if (this.tuneHold.s !== r.string) this.tuneHold = { s: r.string, t: now };
      else if (now - this.tuneHold.t > 450 && !this.tuneOk[r.string]) {
        this.tuneOk[r.string] = true; this.renderTuneStrings();
        if (this.tuneOk.every(Boolean)) $('tune2-text').textContent = 'All six strings are in tune. Ready to play!';
      }
    } else if (r && Math.abs(r.cents) > 12 && this.tuneOk[r.string]) { this.tuneOk[r.string] = false; this.renderTuneStrings(); this.tuneHold = { s: -1, t: 0 }; }
    else if (!r) this.tuneHold = { s: -1, t: 0 };
  },
  tuneDone(start){
    this.tunedThisSession = true;
    const mode = this.pendingMode; this.pendingMode = null;
    $('m-tune').hidden = true; this.openModal = null;
    if (start && mode) this.startGame(mode, true);
  },
  setLefty(on){
    Settings.lefty = !!on; saveSettings();
    this.setSeg('seg-hand', on ? '1' : '0'); $('chk-lefty').checked = !!on;
    if (this.song && this.screen === 'song') this.renderSong();
    if (G.running) { const ev = G.mode === 'practice' ? G.cur() : G.shownEv; if (ev) { Fretboard.render(ev, this.chart.capo, Settings.lefty); const i = G.list.indexOf(ev); this.sideUpdate(ev, G.list[i + 1] || null); } }
  },
  musicBtn(){ const b = $('btn-music'); b.setAttribute('aria-pressed', String(Settings.musicOn)); b.textContent = Settings.musicOn ? '♪ Music on' : '♪ Music off'; },
  // song and career codes: text anyone can paste, or a link that opens straight into the game
  async openCode(mode){
    this.open('m-code');
    this.codeMode = mode;
    $('code-msg').textContent = ''; $('btn-code-link').hidden = true;
    const show = mode === 'show' || mode === 'career-show', career = mode.startsWith('career');
    $('m-code-h').textContent = show ? (career ? 'Share this career' : 'Song code') : (career ? 'Paste a career code' : 'Paste a song code');
    if (show) {
      $('code-help').textContent = career ? 'Send this code (or the link) to a friend: they get the same eras and songs, with their own progress.'
        : this.inViewer ? 'Copy this code, then paste it into the Strum Jam game file on your computer (Paste a song code) to play with your guitar.' : 'Share this code or the link, or paste it into another copy of Strum Jam.';
      $('code-text').value = career ? await careerToCode(Story.cur) : songToCode(this.song); $('code-text').readOnly = true;
      $('btn-code-act').textContent = 'Copy code'; $('btn-code-link').hidden = this.inViewer;
      $('code-text').select();
    } else {
      $('code-help').textContent = career ? 'Paste a code that starts with SJC1. from a friend.' : 'Paste a code that starts with SJ1. (from the claude.ai version or a friend).';
      $('code-text').value = ''; $('code-text').readOnly = false;
      $('btn-code-act').textContent = career ? 'Add career' : 'Load song';
      $('code-text').focus();
    }
  },
  async codeAction(link){
    const ta = $('code-text');
    if (this.codeMode === 'show' || this.codeMode === 'career-show') {
      const text = link ? location.href.split('#')[0] + '#' + (this.codeMode === 'show' ? 'song=' : 'career=') + ta.value : ta.value;
      try { await navigator.clipboard.writeText(text); $('code-msg').textContent = link ? 'Link copied.' : 'Copied.'; }
      catch (e) { ta.select(); $('code-msg').textContent = 'Press Ctrl+C (or ⌘C) to copy.'; }
      return;
    }
    try {
      if (this.codeMode === 'career-paste') { const c = await careerFromCode(ta.value); this.closeModal(); Story.openCareer(c.id); return; }
      const song = songFromCode(ta.value);
      this.saveMine(song); this.renderLists(); this.closeModal(); this.openSong(song);
    } catch (e) { $('code-msg').textContent = e.message; }
  },
  // a shared link: #song=SJ1… or #career=SJC1…
  async openShared(){
    const m = /^#(song|career|jam)=(.+)$/.exec(location.hash || ''); if (!m) return;
    history.replaceState(null, '', location.href.split('#')[0]);
    try {
      const code = decodeURIComponent(m[2]);
      if (m[1] === 'jam') Online.open().then(() => Online.openJam(code));
      else if (m[1] === 'career') { const c = await careerFromCode(code); Story.openCareer(c.id); }
      else { const song = songFromCode(code); this.saveMine(song); this.renderLists(); this.openSong(song); }
    } catch (e) { alert(e.message || 'That shared link didn’t work.'); }
  },
  openImport(pre){
    this.open('m-import');
    this.importGroove = null;
    if (pre) { $('imp-title').value = pre.title || ''; $('imp-artist').value = pre.artist || ''; }
    const st = $('imp-style'); if (!st.options.length) STYLES.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = STYLE_NAMES[k]; st.appendChild(o); });
    if (pre && this.song && pre.title === this.song.title) { $('imp-bpm').value = this.song.bpm; st.value = this.song.style; $('imp-time').value = this.song.time; }
    this.importLinks(); this.importPreview();
    $('imp-ai-msg').textContent = ''; $('imp-msg').textContent = '';
    $('imp-text').focus();
  },
  importLinks(){ $('imp-links').innerHTML = this.links($('imp-title').value, $('imp-artist').value); },
  importPreview(){
    const txt = $('imp-text').value;
    if (!txt.trim()) { $('imp-found').textContent = ''; return; }
    const o = parseChordSheet(txt, { perBar: +$('imp-per').value });
    const bars = o.sections.reduce((a, s) => a + s.bars.length, 0);
    const chords = []; o.sections.forEach(s => s.bars.forEach(b => b.split(/\s+/).forEach(c => { if (c && !chords.includes(c)) chords.push(c); })));
    if (o.title && !$('imp-title').value) $('imp-title').value = o.title;
    if (o.artist && !$('imp-artist').value) $('imp-artist').value = o.artist;
    if (o.bpm) $('imp-bpm').value = o.bpm;
    if (o.time && TIMES.includes(o.time)) $('imp-time').value = o.time;
    $('imp-found').innerHTML = bars ? `Found <b>${o.sections.length}</b> section${o.sections.length === 1 ? '' : 's'} and <b>${bars}</b> bars. Chords: ${chords.slice(0, 12).map(esc).join(' ')}${chords.length > 12 ? '…' : ''}${o.capo ? ` · Capo ${o.capo}` : ''}${o.tuning && !/E\s*A\s*D\s*G\s*B\s*E/i.test(o.tuning) ? ' · Note: this sheet uses a different tuning.' : ''}` : 'No chord lines found yet. Copy the chords view of the sheet (not the tab view).';
  },
  async importFillAI(){
    const title = $('imp-title').value.trim(); if (!title) { $('imp-ai-msg').textContent = 'Add the song title first.'; return; }
    const ctl = new AbortController();
    $('imp-ai-msg').textContent = 'Asking Claude for the tempo and groove…'; $('btn-imp-ai').disabled = true;
    try {
      const d = await this.askClaude(grooveFillPrompt(title, $('imp-artist').value.trim()), ctl.signal, 'default', { kind: 'groove', body: { title, artist: $('imp-artist').value.trim() } });
      if (d && d.bpm) $('imp-bpm').value = Math.round(clampNum(d.bpm, 40, 240, 100));
      if (d && TIMES.includes(d.time)) $('imp-time').value = d.time;
      if (d && STYLES.includes(d.style)) $('imp-style').value = d.style;
      this.importGroove = d || null;
      $('imp-ai-msg').textContent = 'Filled in. Adjust anything that sounds off.';
    } catch (e) { $('imp-ai-msg').textContent = this.errCopy(e); }
    finally { $('btn-imp-ai').disabled = false; }
  },
  importBuild(){
    const o = parseChordSheet($('imp-text').value, { perBar: +$('imp-per').value });
    const g = this.importGroove || {};
    try {
      const song = validateSong({ title: $('imp-title').value || o.title || 'Pasted song', artist: $('imp-artist').value || o.artist, bpm: +$('imp-bpm').value || 100,
        time: $('imp-time').value, style: $('imp-style').value, capo: o.capo, sections: o.sections,
        feel: g.feel, strum: g.strum, drums: g.time === $('imp-time').value ? g.drums : null }, 'paste');
      this.saveMine(song); this.renderLists(); this.closeModal(); this.openSong(song);
    } catch (e) { $('imp-msg').textContent = e.message; }
  },
  tapTempo(){
    const t = performance.now();
    if (this.taps.length && t - this.taps[this.taps.length - 1] > 2000) this.taps = [];
    this.taps.push(t); if (this.taps.length > 8) this.taps.shift();
    if (this.taps.length >= 3) { const iv = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1); $('imp-bpm').value = Math.round(60000 / iv); }
  },
  async downloadGame(){
    const m = $('dl-msg');
    try {
      const r = await fetch('strum-jam.html'); if (!r.ok) throw new Error('missing');
      const html = await r.text();
      await this.downloads.save({ filename: 'strum-jam.html', data: html });
      m.textContent = 'Saved. Open it in Chrome to play with your guitar.';
    } catch (e) { m.textContent = e && e.code === 'declined' ? '' : 'The download didn’t work here. Ask Claude for the game file in chat.'; }
  },

  /* ---------- events ---------- */
  bind(){
    $('search-form').addEventListener('submit', e => { e.preventDefault(); this.doSearch($('search-input').value); });
    $('setup-form').addEventListener('submit', e => {
      e.preventDefault(); const k = $('setup-key').value.trim();
      if (!/^sk-/.test(k)) { $('setup-msg').textContent = 'That doesn’t look like an Anthropic API key. Keys start with sk-.'; return; }
      Settings.apiKey = k; saveSettings(); $('api-key').value = k; this.refreshEnv();
      $('search-status').textContent = 'Song search is on. Type any song above.';
      $('search-input').focus();
    });
    $('btn-download').onclick = () => this.downloadGame();
    $('btn-mic-setup').onclick = $('btn-mic-setup2').onclick = () => this.openMic();
    $('btn-mic-setup3').onclick = () => { $('m-pause').hidden = true; this.openModal = null; this.openMic(); };
    $('mic-chip').style.cursor = 'pointer'; $('mic-chip').onclick = () => this.openMic();
    $('btn-settings').onclick = () => { this.open('m-settings'); $('chk-intros').checked = Settings.storyIntros !== false; $('chk-music').checked = Settings.musicOn; $('vol-music').value = Math.round(Settings.musicVol * 100); $('chk-sfx').checked = Settings.sfxOn; $('chk-notes').checked = Settings.showNotes; $('vol-drums').value = Math.round(Settings.drumVol * 100); $('chk-click').checked = Settings.click; $('chk-lefty').checked = Settings.lefty; $('api-key').value = Settings.apiKey; $('api-model').value = Settings.apiModel; };
    $('btn-paste').onclick = () => this.openCode('paste');
    $('btn-code-link').onclick = () => this.codeAction(true);
    $('btn-career-share').onclick = () => { if (Story.cur) this.openCode('career-show'); };
    $('btn-career-import').onclick = () => this.openCode('career-paste');
    $('btn-import').onclick = () => this.openImport(null);
    $('btn-song-back').onclick = () => { if (this.storyCtx) Story.openCareer(this.storyCtx.careerId); else this.show('play'); };
    $('btn-song-code').onclick = () => this.openCode('show');
    $('btn-practice').onclick = () => this.startGame('practice');
    $('btn-stage').onclick = () => this.startGame('stage');
    $('seg-easy').addEventListener('change', e => { Settings.shapes = e.target.value; Settings.easy = e.target.value === 'easy'; saveSettings(); this.recompile(); this.renderSong(); });
    $('seg-view').addEventListener('change', e => { Settings.fbView = e.target.value; saveSettings(); this.renderSong(); });
    $('chk-notes').onchange = e => { Settings.showNotes = e.target.checked; saveSettings(); if (G.running) { const ev = G.mode === 'practice' ? G.cur() : G.shownEv; if (ev) Fretboard.render(ev, this.chart.capo, Settings.lefty); } };
    $('btn-tune-title').onclick = () => this.openTune(null);
    $('chk-phones').onchange = e => { Settings.headphones = e.target.checked; saveSettings(); };
    $('btn-mic-cal').onclick = () => this.micSetup();
    $('test-chord').onchange = () => { $('test-res').textContent = 'Strum it and I’ll check every note.'; $('test-res').style.color = ''; this.testOkAt = 0; };
    $('mic-chip').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openMic(); } });
    $('seg-hand').addEventListener('change', e => this.setLefty(e.target.value === '1'));
    $('seg-strict').addEventListener('change', e => { Settings.strict = e.target.value; saveSettings(); this.setSeg('seg-strict', Settings.strict); this.strictLabel(); });
    $('tempo').addEventListener('change', e => { Settings.tempo = +e.target.value; saveSettings(); this.tempoLabel(); });
    $('btn-pause').onclick = () => { G.pause(); this.open('m-pause'); };
    $('btn-resume').onclick = () => this.closeModal();
    $('btn-restart').onclick = () => { $('m-pause').hidden = true; this.openModal = null; G.paused = false; G.stop(); if (Online.rec) { Online.restart(); return; } this.startGame(G.mode, true); };
    $('btn-quit').onclick = () => { $('m-pause').hidden = true; this.openModal = null; G.paused = false; G.stop(); if (Online.rec) { Online.cancel(); Online.after(); return; } if (Battle.active()) { Battle.st.playing = false; this.battleOpts = null; Battle.renderTurn(); return; } this.show('song'); this.renderSong(); };
    $('btn-hear').onclick = () => { const ev = G.mode === 'practice' ? G.cur() : G.shownEv; if (ev && ev.notes) { const how = AudioEngine.playChord(ev.notes, 'now:' + ev.label + '|' + ev.v.frets.join(',')); const b = $('btn-hear'); b.dataset.next = how === 'strum' ? 'arpeggio' : 'strum'; b.querySelector('small') && (b.querySelector('small').textContent = how === 'strum' ? 'tap again: arpeggio' : 'tap again: strum'); } };
    $('btn-skip').onclick = () => G.skip();
    // redraw the fretboard when the layout switches between phone and wide (e.g. rotating the phone)
    let fbCompact = null, rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => {
      const c = (innerWidth < 560 ? 'n' : '') + Fretboard.fretsToShow();
      if (c === fbCompact) return; fbCompact = c;
      if (G.running) { const ev = G.mode === 'practice' ? G.cur() : G.shownEv; if (ev) { Fretboard.render(ev, this.chart.capo, Settings.lefty); G.fbKey = null; } }
    }, 150); });

    $('btn-again').onclick = () => this.startGame(G.mode, true);
    $('btn-res-song').onclick = () => { this.show('song'); this.renderSong(); };
    $('btn-res-home').onclick = () => this.show('play');
    $('btn-play').onclick = () => this.modeBurst($('btn-play'), 'play', () => this.show('play').then(() => $('search-input').focus()));
    $('btn-play-home').onclick = () => this.show('title');
    $('btn-online-home').onclick = () => { Online.stopPlayback(); this.show('title'); };
    $('btn-battle-home').onclick = () => { Battle.st = null; this.show('title'); };
    $('btn-tune-play').onclick = () => $('btn-tune-title').click();
    $('btn-mic-play').onclick = () => $('btn-mic-setup').click();
    $('btn-battle').onclick = () => this.modeBurst($('btn-battle'), 'online', () => Online.open());
    $('btn-res-career').onclick = () => { const x = this.storyCtx; if (!x) { this.show('title'); return; } const so = this.resStory; Story.openCareer(x.careerId, so && so.levelClear && x.li + 1 < ((Story.get(x.careerId) || {}).levels || []).length ? x.li + 1 : -1); };
    // stage taps (no mic)
    $('stage').addEventListener('pointerdown', e => { e.preventDefault(); if (G.running && G.tapMode) G.onStrum(AudioEngine.now() - AudioEngine.outputLatency(), 'tap'); });
    // modals
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => this.closeModal()));
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) this.closeModal(); }));
    // mic modal
    $('btn-mic-on').onclick = async () => {
      if (Mic.on) { Mic.stop(); Mic.failed = ''; }
      else { Mic.failed = ''; await Mic.start(); }
      this.refreshMic(); this.fillDevices();
      if (G.running) G.tapMode = !Mic.on;
    };
    $('sel-device').onchange = async e => { Settings.deviceId = e.target.value; saveSettings(); Mic.stop(); await Mic.start(); this.refreshMic(); this.openMicMsg(); };
    $('sel-chan').value = String(Mic.chan());
    $('sel-chan').onchange = async e => { Settings.inChannel = +e.target.value; saveSettings(); if (Mic.on) { Mic.stop(); await Mic.start(); } this.refreshMic(); this.openMicMsg(); };
    $('sens').oninput = e => { Settings.sens = +e.target.value; saveSettings(); };
    $('lat').oninput = e => { Settings.latency = +e.target.value; $('lat-val').textContent = Settings.latency; saveSettings(); };
    $('btn-calib').onclick = () => this.calibrate();
    $('btn-mic-ears').onclick = () => this.openCalib(this.inst ? this.inst() : 'guitar');
    $('btn-tune-song').onclick = () => this.openTune(null);
    $('btn-tune-go').onclick = () => this.tuneDone(true);
    $('btn-tune-skip').onclick = () => this.tuneDone(true);
    $('chk-tune-first').onchange = e => { Settings.tuneFirst = e.target.checked; saveSettings(); };
    $('chk-echo').onchange = async e => { Settings.echo = e.target.checked; saveSettings(); if (Mic.on) { Mic.stop(); await Mic.start(); this.refreshMic(); } };
    // settings
    $('vol-drums').oninput = e => { Settings.drumVol = +e.target.value / 100; saveSettings(); AudioEngine.setDrumVol(Settings.drumVol); };
    $('chk-click').onchange = e => { Settings.click = e.target.checked; saveSettings(); };
    $('chk-lefty').onchange = e => this.setLefty(e.target.checked);
    $('chk-music').onchange = e => { Settings.musicOn = e.target.checked; saveSettings(); this.musicBtn(); Music.setVolume(); };
    $('vol-music').oninput = e => { Settings.musicVol = +e.target.value / 100; saveSettings(); Music.setVolume(); };
    $('chk-sfx').onchange = e => { Settings.sfxOn = e.target.checked; saveSettings(); };
    $('chk-intros').onchange = e => { Settings.storyIntros = e.target.checked; saveSettings(); };
    $('btn-music').onclick = () => { Settings.musicOn = !Settings.musicOn; saveSettings(); this.musicBtn(); Music.setVolume(); };
    this.musicBtn();
    // a click sound for every button (cards and closers have their own)
    document.addEventListener('pointerdown', e => {
      const el = e.target.closest('button, .chip[role=button]'); if (!el || el.disabled) return;
      if (el.closest('.card') || el.dataset.sfx === 'none' || (this.screen === 'game' && G.running && !this.openModal)) return;
      if (el.dataset.sfx === 'back') Sfx.back(); else if (el.closest('.seg')) Sfx.toggle(); else Sfx.click();
    }, true);
    $('api-key').onchange = e => { Settings.apiKey = e.target.value.trim(); saveSettings(); this.refreshEnv(); };
    $('api-model').onchange = e => { Settings.apiModel = e.target.value.trim() || 'claude-sonnet-5'; saveSettings(); };
    $('btn-clear-mine').onclick = () => { Store.set('mine', []); this.renderLists(); $('btn-clear-mine').textContent = 'Cleared'; };
    $('btn-clear-charts').onclick = () => { Store.set('charts', {}); $('btn-clear-charts').textContent = 'Forgotten: songs will be looked up again'; };
    // code + import
    $('btn-code-act').onclick = () => this.codeAction();
    let t = 0;
    $('imp-text').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => this.importPreview(), 250); });
    $('imp-per').onchange = () => this.importPreview();
    $('imp-title').oninput = $('imp-artist').oninput = () => this.importLinks();
    $('btn-tap').onclick = () => this.tapTempo();
    $('btn-imp-ai').onclick = () => this.importFillAI();
    $('btn-imp-build').onclick = () => this.importBuild();
    // keyboard
    document.addEventListener('keydown', e => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
      if (e.key === 'Escape') { if (this.openModal) { this.closeModal(); e.preventDefault(); } else if (this.screen === 'game' && G.running) { G.pause(); this.open('m-pause'); } return; }
      if (typing || this.openModal || this.screen !== 'game') return;
      if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (G.running && G.tapMode) G.onStrum(AudioEngine.now() - AudioEngine.outputLatency(), 'tap'); }
      else if (e.key === 'h' || e.key === 'H') $('btn-hear').click();
      else if ((e.key === 's' || e.key === 'S') && G.mode === 'practice') G.skip();
      else if (e.key === 'p' || e.key === 'P') { G.pause(); this.open('m-pause'); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.running && !G.paused && G.mode === 'stage') { G.pause(); this.open('m-pause'); } });
  },

  loop(){
    this.frameN++;
    try {
      Music.update(!Splash.on && ['title', 'play', 'battle', 'online', 'song', 'results', 'story'].includes(this.screen) && !['m-mic', 'm-tune'].includes(this.openModal));
      if (Splash.on) Splash.frame();
      Fx.frame();
      if (this.screen === 'title') this.titleFrame();
      if (this.screen === 'game') { const f = $('hype-fill'), w = Math.round((G.hype || 0) * 100) + '%'; if (f.style.height !== w) f.style.height = w; }
      Mic.analyze((this.screen === 'game' && G.running && !G.paused && !G.tapMode) || this.openModal === 'm-mic');
      const now = AudioEngine.ctx ? AudioEngine.ctx.currentTime : performance.now() / 1000;
      if (this.screen === 'game') { G.frame(now); Stage.draw(G, now); }
      else if (this.screen === 'title') { TitleArt.draw(performance.now() / 1000); ModeIcons.draw(performance.now() / 1000); }
      if (this.openModal === 'm-mic') this.micFrame();
      if (this.openModal === 'm-cal') { Mic.analyze(true); const m = $('cal-meter'); if (m) m.style.width = Math.min(100, Math.sqrt(Mic.level) * 260) + '%'; }
      if (this.openModal === 'm-tune') this.tuneFrame();
      if (this.frameN % 30 === 0 && this.screen !== 'game') this.refreshMic();
    } catch (err) { if (this.frameN % 120 === 0) console.error(err); }
    requestAnimationFrame(() => this.loop());
  },
};

function parseJsonLoose(text){
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) {} }
  const b = t.lastIndexOf('}');
  // the answer is the last complete JSON object (notes written before it may contain braces of their own)
  for (let a = t.indexOf('{'); a >= 0 && a < b; a = t.indexOf('{', a + 1)) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  throw Object.assign(new Error('Unreadable chart'), { code: 'invalid_json' });
}

/* ---------- title screen art: the band warming up ---------- */
UI.titleFrame = function(){
  const ctx = AudioEngine.ctx, now = ctx ? ctx.currentTime : 0;
  const beat = Music.playing ? Music.beat() : performance.now() / 1000 * 112 / 60;
  let kick = 0, snare = false;
  if (Music.playing) for (let i = Music.hits.length - 1; i >= 0; i--) { const h = Music.hits[i]; if (h.t > now) continue; const d = now - h.t; if (h.kind === 'kick' && !kick) kick = Math.max(0, 1 - d * 6); if (h.kind === 'snare' && d < 0.1) snare = true; if (d > 0.3) break; }
  $('scr-title').style.setProperty('--kick', kick.toFixed(2));
  const logo = $('logo'); if (logo.classList.contains('flash') !== snare) logo.classList.toggle('flash', snare);
  if (reduceMotion) return;
  this.letters.forEach((el, i) => {
    const ph = (((beat - i * 0.08) % 1) + 1) % 1, e = Math.pow(1 - ph, 2.2);
    el.style.transform = `translateY(${(-e * 12).toFixed(1)}px) rotate(${((i % 2 ? 1 : -1) * e * 7).toFixed(1)}deg) scale(${(1 + e * 0.06).toFixed(3)})`;
  });
};

/* ---------- splash: curtains, marquee bulbs, power chord ---------- */
const Splash = {
  on: true, bulbs: [],
  init(){
    const sign = $('sign'), box = $('bulbs');
    const place = () => {
      box.textContent = ''; this.bulbs = [];
      const w = sign.offsetWidth, h = sign.offsetHeight, gap = 30;
      const per = 2 * (w + h), n = Math.max(20, Math.round(per / gap));
      for (let i = 0; i < n; i++) {
        let d = i / n * per, x, y;
        if (d < w) { x = d; y = 12; } else if ((d -= w) < h) { x = w - 12; y = d; } else if ((d -= h) < w) { x = w - d; y = h - 12; } else { d -= w; x = 12; y = h - d; }
        const b = document.createElement('i'); b.className = 'bulb'; b.style.left = Math.max(12, Math.min(w - 12, x)) + 'px'; b.style.top = Math.max(12, Math.min(h - 12, y)) + 'px';
        box.appendChild(b); this.bulbs.push(b);
      }
    };
    setTimeout(place, 60); window.addEventListener('resize', () => this.on && place());
    const go = () => this.start();
    $('btn-start').addEventListener('click', go);
    $('scr-splash').addEventListener('pointerdown', e => { if (e.target === $('scr-splash') || e.target.classList.contains('curtain')) go(); });
    this.keyH = e => { if (this.on && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(); } };
    document.addEventListener('keydown', this.keyH);
  },
  frame(){
    const k = Math.floor(performance.now() / 110);
    this.bulbs.forEach((b, i) => { const on = (i + k) % 3 === 0; if (b.classList.contains('on') !== on) b.classList.toggle('on', on); });
  },
  start(){
    if (!this.on || this.starting) return; this.starting = true;
    Music.markInteracted(); AudioEngine.ensure();
    Sfx.powerOn();
    document.removeEventListener('keydown', this.keyH);
    const sp = $('scr-splash');
    this.bulbs.forEach(b => b.classList.add('on'));
    setTimeout(() => { sp.classList.add('opening'); Fx.confetti(120); }, reduceMotion ? 0 : 280);
    setTimeout(() => { sp.hidden = true; this.on = false; UI.enter($('scr-title')); }, reduceMotion ? 50 : 1350);
  },
};

/* ---------- full-screen confetti ---------- */
const Fx = {
  cv: null, c: null, parts: [], last: 0,
  init(cv){ this.cv = cv; this.c = cv.getContext('2d'); },
  confetti(n){
    if (reduceMotion || !this.c) return;
    const W = innerWidth;
    const cols = [COL.sun, COL.coral, COL.teal, COL.grape, COL.mint, COL.paper, COL.sky];
    for (let i = 0; i < n; i++) this.parts.push({ x: Math.random() * W, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 160, vy: 80 + Math.random() * 220,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, w: 7 + Math.random() * 7, h: 4 + Math.random() * 5, col: cols[i % cols.length], sw: Math.random() * 6 });
  },
  frame(){
    if (!this.parts.length) { if (this.dirty) { this.c.clearRect(0, 0, this.cv.width, this.cv.height); this.dirty = false; } return; }
    const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    if (this.cv.width !== Math.round(W * dpr) || this.cv.height !== Math.round(H * dpr)) { this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); }
    const t = performance.now(), dt = Math.min(0.05, (t - (this.last || t)) / 1000); this.last = t;
    const c = this.c; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    for (const p of this.parts) {
      p.vy += 160 * dt; p.x += (p.vx + Math.sin(t / 300 + p.sw) * 40) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(1, Math.cos(t / 180 + p.sw));
      c.fillStyle = p.col; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.strokeStyle = COL.ink; c.lineWidth = 1; c.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      c.restore();
    }
    this.parts = this.parts.filter(p => p.y < H + 30);
    this.dirty = true;
  },
};

const TitleArt = {
  cv: null, c: null, W: 0, H: 0, dpr: 1,
  init(cv){ this.cv = cv; this.c = cv.getContext('2d'); this.resize(); if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(cv); else window.addEventListener('resize', () => this.resize()); },
  resize(){
    if (!this.cv) return;
    const r = this.cv.getBoundingClientRect(); this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(10, r.width); this.H = Math.max(10, r.height);
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
  },
  draw(t){
    const c = this.c; if (!c || !this.W) return;
    const W = this.W, H = this.H, playing = Music.playing, actx = AudioEngine.ctx;
    const bpm = 112, beat = playing ? Music.beat() : t * bpm / 60, ph = ((beat % 1) + 1) % 1;
    const now = playing && actx ? actx.currentTime : t;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, W, H);
    // a record spinning behind the band at 33⅓ rpm: a true circle
    // the record and the stage float gently, out of step with each other
    const fv = reduceMotion ? 0 : Math.sin(t * 1.25) * H * 0.012, fs = reduceMotion ? 0 : Math.sin(t * 1.05 + 1.3) * H * 0.008;
    const R = Math.min(W * 0.45, H * 0.4), vx = W * 0.5, vy = H * 0.42 + fv;
    drawVinyl(c, vx, vy, R, R, reduceMotion ? 0.4 : t * Math.PI * 2 * 0.555);

    // the band sized and spaced so Pip (guitar neck out to the left) and the kit never overlap
    const floorY = H * 0.64;
    let s = Math.min(H * 0.32, W * 0.3);
    const lay = s => { const h = s * 2.1, pipL = 0.8 * s, pipR = 0.5 * s, gap = 0.22 * s, dw = h * 0.72; return { h, total: pipL + pipR + gap + dw, pipL, pipR, gap, dw }; };
    let L = lay(s); if (L.total > W * 0.94) { s *= W * 0.94 / L.total; L = lay(s); }
    const x0 = W / 2 - L.total / 2, pipX0 = x0 + L.pipL, drumX0 = pipX0 + L.pipR + L.gap + L.dw / 2;
    const pipX = Settings.lefty ? W - pipX0 : pipX0, drumX = Settings.lefty ? W - drumX0 : drumX0;
    this.drawLights(c, W, H, floorY + fs, t, ph);
    c.save(); c.translate(0, fs);
    this.drawStage(c, W, H, floorY, beat, ph, playing);
    let hits = Music.hits;
    if (!playing) { hits = []; for (let n = 0; n < 2; n++) { const bb = Math.floor(beat) - n; hits.push({ t: bb * 60 / bpm, kind: bb % 2 ? 'snare' : 'kick' }); hits.push({ t: (bb + 0.5) * 60 / bpm, kind: 'hat' }); } }
    let strum = 0;
    if (playing) { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (h.kind === 'gtr' && h.t <= now) { const d = now - h.t; strum = d < 0.2 ? Math.sin(d / 0.2 * Math.PI) : 0; break; } } }
    else strum = ph < 0.25 ? Math.sin(ph / 0.25 * Math.PI) : 0;
    // the funk drummer, grooving to a simple beat (locked to the menu music when it plays)
    if (typeof FunkDrummer !== 'undefined') {
      const spb = 60 / bpm, tb = beat * spb, ev = [], b0 = Math.floor(beat);
      for (let bb = b0 - 3; bb <= b0 + 3; bb++) { const t = bb * spb;
        ev.push({ t, kind: 'hat' }, { t: t + spb / 2, kind: 'hat' }, { t, kind: ((bb % 2) + 2) % 2 ? 'snare' : 'kick' });
        if (((bb % 16) + 16) % 16 === 0) ev.push({ t, kind: 'crash' });
        if (((bb % 8) + 8) % 8 === 7) ev.push({ t: t + spb / 2, kind: 'tom' }, { t: t + spb * 0.75, kind: 'tom' }); }
      ev.sort((a, b) => a.t - b.t);
      FunkDrummer.draw(c, this.dSt || (this.dSt = FunkDrummer.create()), { x: drumX, floorY: floorY + L.h * 0.012, h: L.h, now: tb, beat, spb, level: playing ? 2 : 1, events: ev, playing: true, missAgo: 9 });
    }
    drawPip(c, pipX, floorY, s, { bounce: Math.abs(Math.sin(ph * Math.PI)), squash: Math.cos(ph * Math.PI * 2) * 0.5, strum, mood: Math.floor(beat) % 8 === 7 ? 'great' : 'idle', lookX: 0.6, lefty: Settings.lefty });
    c.restore();
    // floating chord cards: black-and-white sketches, like the backdrop's doodles, with real chord names (minor, flat, sharp, seventh)
    // (drawn in front of the band, so they float over it)
    ['Am', 'E♭', 'F♯m', 'B♭7'].forEach((name, i) => {
      const x = W * (0.18 + i * 0.15), y = H * 0.075 + (reduceMotion ? 0 : Math.sin(t * 2 + i) * 6), cw = name.length > 2 ? 62 : 54, ch = 38;
      c.save(); c.translate(x, y); c.rotate((i - 1.5) * 0.08);
      c.fillStyle = '#FFF4E6'; rr(c, -cw / 2, -ch / 2, cw, ch, 10); c.fill();
      c.strokeStyle = COL.ink; c.lineJoin = 'round'; c.lineCap = 'round';
      c.lineWidth = 3; rr(c, -cw / 2, -ch / 2, cw, ch, 10); c.stroke();
      c.lineWidth = 1.4; c.save(); c.translate(1.6, -1.2); c.rotate(0.02); rr(c, -cw / 2, -ch / 2, cw, ch, 10); c.stroke(); c.restore();     // a second, looser pencil line
      c.globalAlpha = 0.35; c.lineWidth = 1.2; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(-cw / 2 + 8 + k * 5, ch / 2 - 4); c.lineTo(-cw / 2 + 2 + k * 5, ch / 2 - 10); c.stroke(); } c.globalAlpha = 1;   // hatching in a corner
      // the letter in the title font; the flat / sharp drawn by hand (the font has no ♭ or ♯), then the rest a size down
      const root = name[0], acc = name[1] === '♭' || name[1] === '♯' ? name[1] : '', rest = name.slice(acc ? 2 : 1);
      c.fillStyle = COL.ink; c.textBaseline = 'middle'; c.textAlign = 'left';
      c.font = `22px ${DISPLAY_FONT}`; const rw = c.measureText(root).width; c.font = `16px ${DISPLAY_FONT}`; const sw = c.measureText(rest).width;
      const aw = acc ? 9 : 0, x0 = -(rw + aw + sw) / 2;
      c.font = `22px ${DISPLAY_FONT}`; c.fillText(root, x0, 2);
      if (acc) { const ax = x0 + rw + 4.5; c.lineWidth = 2; c.beginPath();
        if (acc === '♭') { c.moveTo(ax - 2, -9); c.lineTo(ax - 2, 3); c.stroke(); c.beginPath(); c.moveTo(ax - 2, 3); c.bezierCurveTo(ax + 5, 0, ax + 4, -5, ax - 2, -2); c.stroke(); }
        else { c.moveTo(ax - 1.5, -9); c.lineTo(ax - 1.5, 4); c.moveTo(ax + 1.5, -10); c.lineTo(ax + 1.5, 3); c.moveTo(ax - 4, -4); c.lineTo(ax + 4, -6); c.moveTo(ax - 4, 0); c.lineTo(ax + 4, -2); c.stroke(); } }
      c.font = `16px ${DISPLAY_FONT}`; c.fillText(rest, x0 + rw + aw, 4);
      c.restore();
    });
    // the crowd in front of the stage, whole: their round bodies sit above the bottom edge
    const crowdH = H * 0.17;
    c.save(); c.translate(0, H - crowdH * 1.02); const k = crowdH / 80; c.scale(k, k);
    drawCrowd(c, W / k, 80 - 16, ph, playing ? 0.8 : 0.4, now, playing ? 3 : 0); c.restore();
  },
  // two show lights hanging above the band, sweeping slowly and brightening on the beat
  drawLights(c, W, H, floorY, t, ph){
    const pulse = reduceMotion ? 0.5 : 0.55 + 0.45 * Math.pow(1 - ph, 2);
    for (const [k, col] of [[-1, '255,236,170'], [1, '255,190,220']]) {
      const lx = W * (0.5 + k * 0.42), ly = Math.max(38, H * 0.08), sw = reduceMotion ? 0 : Math.sin(t * 0.7 + (k > 0 ? 2 : 0)) * 0.16;
      const tx = W * 0.5 + k * W * 0.08 + Math.sin(sw) * H, ty = floorY, ang = Math.atan2(ty - ly, tx - lx), len = Math.hypot(tx - lx, ty - ly) * 1.05, spread = 0.2;
      c.save(); c.translate(lx, ly); c.rotate(ang);
      const g = c.createLinearGradient(0, 0, len, 0); g.addColorStop(0, `rgba(${col},${0.75 * pulse})`); g.addColorStop(0.7, `rgba(${col},${0.28 * pulse})`); g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g; c.beginPath(); c.moveTo(0, -6); c.lineTo(len, -len * spread); c.quadraticCurveTo(len * 1.04, 0, len, len * spread); c.lineTo(0, 6); c.closePath(); c.fill();
      c.restore();
      // the pool of light where it lands
      c.save(); c.translate(tx, ty); c.scale(1, 0.22); const pg = c.createRadialGradient(0, 0, 0, 0, 0, W * 0.12); pg.addColorStop(0, `rgba(${col},${0.5 * pulse})`); pg.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = pg; c.beginPath(); c.arc(0, 0, W * 0.12, 0, Math.PI * 2); c.fill(); c.restore();
      // the lamp: a black can on a yoke
      c.save(); c.translate(lx, ly); c.rotate(ang - Math.PI / 2); c.lineWidth = 3; c.strokeStyle = COL.ink; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-15, -2); c.lineTo(-15, -14); c.lineTo(15, -14); c.lineTo(15, -2); c.stroke();
      c.fillStyle = COL.ink; rr(c, -11, -18, 22, 22, 5); c.fill(); c.stroke();
      c.fillStyle = `rgba(${col},${0.7 + 0.3 * pulse})`; c.beginPath(); c.ellipse(0, 4, 10, 4, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.restore();
    }
  },
  // the stage: a wooden deck on a black riser with chase lights, a lip of light along the front
  drawStage(c, W, H, floorY, beat, ph, playing){
    const x0 = W * 0.04, x1 = W * 0.96, top = floorY - H * 0.02, deck = H * 0.045, face = H * 0.085;
    c.save(); c.lineJoin = 'round';
    // glow on the deck from the lights above
    // (a soft ellipse that fades out all round, so it has no edge of its own)
    c.save(); c.translate(W / 2, top); c.scale(1, 0.32); const g = c.createRadialGradient(0, 0, 0, 0, 0, W * 0.46); g.addColorStop(0, 'rgba(255,236,170,.5)'); g.addColorStop(1, 'rgba(255,236,170,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, W * 0.46, 0, Math.PI * 2); c.fill(); c.restore();
    // deck: the menu's own wave pattern (seigaiha), white on black, squashed into the deck's perspective
    const dx0 = x0 + W * 0.03, dx1 = x1 - W * 0.03;
    const deckPath = () => { c.beginPath(); c.moveTo(dx0, top); c.lineTo(dx1, top); c.lineTo(x1, top + deck); c.lineTo(x0, top + deck); c.closePath(); };
    deckPath(); c.fillStyle = '#1E1B2E'; c.fill();
    c.save(); deckPath(); c.clip();
    const wstep = Math.max(24, deck * 2), sq = 0.42;          // waves shrink toward the back of the stage
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.6;
    for (let row = 0, y = top + deck + wstep * sq; y > top - wstep * sq; row++, y -= wstep * sq * 0.5) {
      const v = Math.max(0, Math.min(1, (y - top) / deck)), k = 0.75 + 0.25 * v, r0 = wstep * 0.9 * k;
      for (let x = x0 - r0 * 2 + (row % 2) * r0; x < x1 + r0 * 2; x += r0 * 2) for (const f of [1, 0.66, 0.33]) {
        c.beginPath(); c.ellipse(x, y, r0 * f, r0 * f * sq, 0, Math.PI, 0); c.stroke(); }
    }
    c.restore();
    deckPath(); c.lineWidth = 3.5; c.strokeStyle = COL.ink; c.stroke();
    // riser front: black with a gold trim and chase-light bulbs that run on the beat
    const fy = top + deck;
    c.fillStyle = COL.ink; rr(c, x0, fy, x1 - x0, face, 10); c.fill(); c.lineWidth = 3.5; c.strokeStyle = COL.ink; c.stroke();
    c.fillStyle = '#2E2A40'; c.fillRect(x0 + 4, fy + face * 0.62, x1 - x0 - 8, face * 0.3);
    c.fillStyle = '#F7F4EC'; c.fillRect(x0 + 2, fy + 1, x1 - x0 - 4, 3);
    const n = Math.max(8, Math.round((x1 - x0) / 30)), step = Math.floor(beat * 2);
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * (x1 - x0) / n, y = fy + face * 0.34, on = reduceMotion ? i % 2 === 0 : (i + step) % 3 === 0;
      const r = Math.max(3, face * 0.13);
      if (on) { c.fillStyle = 'rgba(255,214,90,.35)'; c.beginPath(); c.arc(x, y, r * 2.2, 0, Math.PI * 2); c.fill(); }
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = on ? '#FFE37A' : '#4A4660'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = COL.ink; c.stroke();
    }
    c.restore();
  },
};

/* ---------- suggestions while typing (songs on the search box, artists on the Story box) ---------- */
const Suggest = {
  attach(input, o){
    const box = document.createElement('div'); box.className = 'sugg-list'; box.id = input.id + '-sugg'; box.setAttribute('role', 'listbox'); box.hidden = true;
    input.parentNode.style.position = 'relative'; input.parentNode.appendChild(box);
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', box.id); input.setAttribute('aria-expanded', 'false');
    const st = { items: [], hi: -1, t: 0, ctl: null, q: '' };
    const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); st.hi = -1; };
    const paint = () => {
      box.innerHTML = st.items.map((it, i) => `<div class="sg${i === st.hi ? ' hi' : ''}" role="option" id="${box.id}-${i}" aria-selected="${i === st.hi}" data-i="${i}">${o.render(it)}</div>`).join('');
      box.hidden = !st.items.length; input.setAttribute('aria-expanded', String(!box.hidden));
      if (st.hi >= 0) input.setAttribute('aria-activedescendant', box.id + '-' + st.hi); else input.removeAttribute('aria-activedescendant');
    };
    const pick = i => { const it = st.items[i]; if (!it) return; close(); st.items = []; o.pick(it); };
    input.addEventListener('input', () => {
      clearTimeout(st.t); const q = input.value.trim();
      if (q.length < 2) { st.items = []; close(); return; }
      st.t = setTimeout(async () => {
        if (st.ctl) st.ctl.abort(); const ctl = st.ctl = new AbortController(); st.q = q;
        try { const items = await o.fetch(q, ctl.signal); if (ctl.signal.aborted || input.value.trim() !== q || document.activeElement !== input) return; st.items = items.slice(0, 8); st.hi = -1; paint(); }
        catch (e) { /* suggestions are a nicety: the full search still works */ }
      }, 260);
    });
    input.addEventListener('keydown', e => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown') { st.hi = (st.hi + 1) % st.items.length; paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { st.hi = (st.hi - 1 + st.items.length) % st.items.length; paint(); e.preventDefault(); }
      else if (e.key === 'Enter' && st.hi >= 0) { e.preventDefault(); e.stopPropagation(); pick(st.hi); }
      else if (e.key === 'Escape') { close(); e.stopPropagation(); }
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
    input.form && input.form.addEventListener('submit', () => { clearTimeout(st.t); if (st.ctl) st.ctl.abort(); close(); });
    box.addEventListener('pointerdown', e => { const d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); pick(+d.dataset.i); } });
  },
  // a recording that's in the chord dataset (a quick local check on the embedded index)
  inData(r){ const tv = Lookup.normTitle(r.title), av = Lookup.artistVariants(r.artist); return tv.some(t => av.some(a => Lookup.findKey(t + '|' + a).length)); },
  init(){
    Suggest.attach($('search-input'), {
      fetch: async (q, signal) => {
        const words = q.toLowerCase().split(/\s+/);
        const local = [...UI.mine(), ...LIBRARY.map(s => validateSong(s, 'library'))].filter(s => words.every(w => (s.title + ' ' + s.artist).toLowerCase().includes(w))).slice(0, 3).map(song => ({ song }));
        let recs = [];
        try { recs = await Lookup.itunes(q, { signal, limit: 12 }); } catch (e) { if (e.name === 'AbortError') throw e; }
        // originals first (no live cuts, covers or karaoke), the ones with chord data ahead of the rest
        const seen = new Set(), out = [];
        for (const r of recs) { const k = Lookup.normTitle(r.title)[0] + '|' + Lookup.normArtist(r.artist); if (seen.has(k) || (Lookup.isVersion(r) && !Lookup.VER.test(q))) continue; seen.add(k); out.push({ rec: r, data: Suggest.inData(r) }); }
        out.sort((a, b) => b.data - a.data);
        return [...local, ...out.slice(0, 8 - local.length)];
      },
      render: it => it.song ? `<span class="noart lib">♪</span><span class="st"><b>${esc(it.song.title)}</b><small>${esc(it.song.artist || '')} · ${it.song.source === 'library' ? 'Strum Jam library' : 'your songs'}</small></span>`
        : `${it.rec.art ? `<img alt="" src="${esc(it.rec.art)}">` : '<span class="noart"></span>'}<span class="st"><b>${esc(it.rec.title)}</b><small>${esc(it.rec.artist)}${it.rec.year ? ' · ' + it.rec.year : ''}</small></span>${it.data ? '<em>in chord data</em>' : ''}`,
      pick: it => { if (it.song) { $('search-input').value = ''; UI.openSong(it.song); } else { $('search-input').value = it.rec.title + ' ' + it.rec.artist; UI.pickRecording(it.rec); } },
    });
    Suggest.attach($('story-input'), {
      fetch: async (q, signal) => {
        const j = await Lookup.getJson(Lookup.ITUNES + '?media=music&entity=musicArtist&limit=8&country=US&term=' + encodeURIComponent(q), { signal });
        const seen = new Set();
        return (j.results || []).filter(r => r.artistName && !seen.has(r.artistName.toLowerCase()) && seen.add(r.artistName.toLowerCase())).map(r => ({ name: r.artistName, genre: r.primaryGenreName || '' }));
      },
      render: it => `<span class="noart lib">★</span><span class="st"><b>${esc(it.name)}</b><small>${esc(it.genre)}</small></span>`,
      pick: it => { $('story-input').value = it.name; $('story-input').focus(); },
    });
  },
};

let __booted = false;
const __boot = () => { if (__booted) return; __booted = true; UI.init(); };
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', __boot); else __boot();
