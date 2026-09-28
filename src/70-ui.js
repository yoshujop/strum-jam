/* =====================================================================
   UI: screens, search (Claude charts any song), song menu, modals, loop
   ===================================================================== */
const HOSTED_URL = '__HOSTED_URL__';
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
    this.renderLists();
    this.refreshEnv();
    this.refreshMic();
    if (this.inViewer) {
      window.claude.use('sample').then(s => { this.sample = s; this.refreshEnv(); }).catch(() => {});
      window.claude.use('downloads').then(d => { this.downloads = d; this.refreshEnv(); }).catch(() => {});
    }
    requestAnimationFrame(() => this.loop());
  },

  /* ---------- helpers ---------- */
  show(name, instant){
    const swap = () => {
      this.screen = name;
      for (const s of ['title', 'song', 'game', 'results']) $('scr-' + s).hidden = s !== name;
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
    const els = root.querySelectorAll('.topbar, .hero, .search, .song-head, .modes > *, .opts, .card, .cbox, .map .row, .stat, .stamp, .res h2, .res .row, .sec-h');
    let i = 0;
    els.forEach(el => {
      if (el.offsetParent === null && !el.closest('.game')) return;
      const d = Math.min(i++, 14) * 32;
      el.style.animation = `rise .5s cubic-bezier(.2,1.3,.4,1) ${d}ms both`;
      setTimeout(() => { el.style.animation = ''; }, 520 + d);
    });
  },
  aiAvailable(){ return !!this.sample || (!this.inViewer && !!Settings.apiKey); },
  refreshEnv(){
    $('setup-card').hidden = this.inViewer || !!Settings.apiKey;
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
      const ch = compileSong(song, { easy: false });
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
    b.innerHTML = `<div class="stub">${song.bpm}<small>BPM</small></div><div class="body"><div class="t">${esc(song.title)}</div><div class="a">${esc(song.artist || '')}${song.artist ? ' · ' : ''}${lvl}${best ? ' · best ' + esc(best.grade) : ''}</div><div class="cs">${chords.slice(0, 6).map(c => `<span>${esc(c)}</span>`).join('')}${chords.length > 6 ? `<span>+${chords.length - 6}</span>` : ''}</div></div>`;
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

  /* ---------- search ---------- */
  async doSearch(q){
    q = q.trim(); if (!q) { $('search-input').focus(); return; }
    const words = q.toLowerCase().split(/\s+/);
    const pool = [...this.mine(), ...LIBRARY.map(s => validateSong(s, 'library'))];
    const local = pool.filter(s => words.every(w => (s.title + ' ' + s.artist).toLowerCase().includes(w))).slice(0, 6);
    const res = $('search-results'); res.textContent = '';
    local.forEach(s => res.appendChild(this.card(s)));
    $('search-notice').textContent = '';
    if (this.aiAvailable()) { Sfx.searchStart(); return this.aiSearch(q, local.length); }
    const st = $('search-status');
    st.textContent = local.length ? 'Found in your songs and the library.' : '';
    const n = document.createElement('div'); n.className = 'notice';
    n.innerHTML = this.inViewer
      ? '<b>Song search is starting up.</b> Give it a few seconds and search again.'
      : `<b>Automatic song search needs your API key.</b> Add it in the box above (or in Settings) and every search charts the song for you. ${HOSTED_URL.startsWith('http') ? `Or search on the <a href="${HOSTED_URL}" target="_blank" rel="noopener">claude.ai version</a>, which needs no key, and paste the song code here.` : ''}`;
    $('search-notice').appendChild(n);
  },
  async aiSearch(q, haveLocal){
    if (this.searchCtl) this.searchCtl.abort();
    const ctl = this.searchCtl = new AbortController();
    const st = $('search-status');
    st.innerHTML = `<span class="thinking"><span class="eq"><i></i><i></i><i></i><i></i></span> Charting “${esc(q)}”: finding the title, tempo, chords and groove… <button class="btn btn-sm" type="button" id="btn-stop-search">Stop</button></span>`;
    $('btn-stop-search').onclick = () => ctl.abort();
    try {
      const data = await this.askClaude(chartPrompt(q), ctl.signal, 'default');
      if (ctl.signal.aborted) return;
      if (!data || data.found === false) {
        Sfx.fail();
        st.innerHTML = `I couldn’t find “${esc(q)}”. Did you mean one of these?`;
        const box = document.createElement('div'); box.className = 'sugg';
        (Array.isArray(data && data.suggestions) ? data.suggestions : []).slice(0, 6).forEach(sg => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = String(sg).slice(0, 80);
          b.onclick = () => { $('search-input').value = b.textContent; this.doSearch(b.textContent); };
          box.appendChild(b);
        });
        st.appendChild(box);
        return;
      }
      const song = validateSong(data, 'claude');
      this.saveMine(song); this.renderLists();
      st.textContent = `Charted ${song.title}${song.artist ? ' by ' + song.artist : ''}.`;
      Sfx.found();
      this.openSong(song);
    } catch (e) {
      if (e && e.code === 'cancelled' || (e && e.name === 'AbortError')) { st.textContent = 'Search stopped.'; return; }
      st.textContent = this.errCopy(e); Sfx.fail();
      if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled')) { this.sample = null; this.refreshEnv(); }
    } finally { if (this.searchCtl === ctl) this.searchCtl = null; }
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
  async askClaude(prompt, signal, tier){
    if (this.sample) return await this.sample.json(prompt, { modelTier: tier || 'default', signal });
    if (!this.inViewer && Settings.apiKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', 'x-api-key': Settings.apiKey.trim(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: (Settings.apiModel || 'claude-sonnet-4-5').trim(), max_tokens: 8000, messages: [{ role: 'user', content: prompt }] })
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

  /* ---------- song menu ---------- */
  openSong(song){
    this.song = song;
    this.recompile();
    this.renderSong();
    this.show('song');
  },
  recompile(){ this.chart = compileSong(this.song, { easy: Settings.easy }); },
  renderSong(){
    const s = this.song, ch = this.chart;
    $('song-title').textContent = s.title;
    $('song-artist').textContent = s.artist || '';
    const src = { library: 'Library', claude: 'Charted by Claude', code: 'From a song code', paste: 'Pasted chord sheet' }[s.source] || '';
    const d = this.difficulty(s);
    const pills = [`${s.bpm} BPM`, ch.timeLabel, s.key && 'Key ' + s.key, STYLE_NAMES[s.style] || s.style, s.feel === 'swing' && 'Swing feel', ch.capo ? 'Capo ' + ch.capo : 'No capo', ['', 'Easy', 'Medium', 'Hard'][d], src].filter(Boolean);
    $('song-pills').innerHTML = pills.map(p => `<span class="chip">${esc(p)}</span>`).join('');
    $('song-links').innerHTML = this.links(s.title, s.artist) + ' <button class="btn btn-sm" type="button" id="btn-fix-chart">Chart looks wrong? Paste a chord sheet</button>';
    $('btn-fix-chart').onclick = () => this.openImport({ title: s.title, artist: s.artist });
    $('song-note').hidden = !s.note; $('song-note').textContent = s.note || '';
    this.setSeg('seg-easy', Settings.easy ? '1' : '0');
    const simp = ch.events.filter(e => e.v && e.v.simplified).map(e => e.full);
    let en = Settings.easy ? (ch.capoChanged ? `Capo ${ch.capo} lets you use easier shapes.` : 'Easier shapes where they help.') : 'The song’s real chord shapes.';
    if (Settings.easy && simp.length) en += ` Simplified: ${[...new Set(simp)].slice(0, 4).join(', ')}.`;
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
      d.innerHTML = `<b>${esc(u.label)}</b>${miniDiagram(u.v, ch.capo)}<small>${ch.capo ? 'sounds ' + esc(u.sounds) : u.v.simplified ? 'easy version' : 'tap to hear'}</small>`;
      d.title = 'Hear ' + u.label; d.style.cursor = 'pointer';
      d.addEventListener('click', () => AudioEngine.playChord(soundingNotes(u.v, ch.capo).map(n => n.midi), u.label || d.textContent));
      cl.appendChild(d);
    });
    $('chord-count').textContent = `${ch.unique.length} chord${ch.unique.length === 1 ? '' : 's'} · tap: strum · tap again: arpeggio`;
    const map = $('song-map'); map.textContent = '';
    ch.sections.forEach((sec, si) => {
      const row = document.createElement('div'); row.className = 'row';
      const evs = ch.events.filter(e => e.sec === si);
      row.innerHTML = `<b>${esc(sec.name)}</b><div class="bars">${evs.map(e => `<span class="bar" title="${esc(e.rest ? 'Rest' : e.label)} · ${e.len} beats" style="background:${e.rest ? '#fff' : cardColor(e.label)};color:${e.rest ? COL.ink : textOn(cardColor(e.label))}">${e.rest ? '·' : esc(e.label)}</span>`).join('')}</div>`;
      map.appendChild(row);
    });
    const best = Store.get('best', {})[s.id];
    $('best-score').textContent = best ? `Best: ${best.score.toLocaleString()} (${best.grade})` : '';
  },
  setSeg(id, v){ const e = $(id); if (e.tagName === 'SELECT') { e.value = String(v); return; } e.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); },
  tempoLabel(){ $('tempo-val').textContent = Settings.tempo + '%'; $('tempo-bpm').textContent = this.song ? `${Math.round(this.song.bpm * Settings.tempo / 100)} BPM` : ''; },
  strictLabel(){ $('strict-note').textContent = { relaxed: 'Right notes in any octave count.', normal: 'Each string’s note has to ring.', strict: 'Each string rings, and no wrong notes.' }[Settings.strict]; },

  async startGame(mode, skipTune){
    AudioEngine.ensure();
    if (!skipTune && Settings.tuneFirst && !this.tunedThisSession) { this.openTune(mode); return; }
    if (!Mic.on && Mic.available() && Mic.failed !== 'blocked') await Mic.start();
    this.refreshMic();
    await this.show('game');
    await new Promise(r => requestAnimationFrame(r));
    Stage.resize();
    const ok = G.start(this.chart, mode, { section: +$('sel-section').value || 0, loop: $('chk-loop').checked, tempo: Settings.tempo });
    if (!ok) { this.show('song'); }
  },
  hudUpdate(){
    $('hud-title').textContent = this.song ? this.song.title : '';
    const tempo = Settings.tempo !== 100 ? ` · ${Settings.tempo}% tempo` : '';
    if (G.mode === 'practice') {
      $('hud-sub').textContent = 'Practice' + tempo + (G.opts && G.opts.loop ? ' · looping' : '');
      $('hud-score').textContent = `${Math.min(G.idx + 1, G.list.length)}/${G.list.length}`;
      $('hud-score-l').textContent = (G.streak >= 2 ? `streak ${G.streak}` : 'chord') + (G.laps ? ` · lap ${G.laps + 1}` : '');
      $('btn-skip').hidden = false;
    } else {
      $('hud-sub').textContent = 'Stage' + tempo;
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
      $('res-grade').textContent = r.grade;
      $('res-title').textContent = r.title;
      $('res-sub').textContent = `${ch.song.title} · Stage${r.tempo !== 100 ? ' at ' + r.tempo + '% tempo' : ''}${r.tap ? ' · tap mode (timing only)' : ''}${r.newBest ? ' · New best!' : ''}`;
      const c = r.counts;
      const stats = [['Score', r.score], ['Accuracy', Math.round(r.acc * 100) + '%'], ...(r.tap ? [] : [['Notes heard', Math.round(r.noteAcc * 100) + '%']]),
        ['Best combo', r.maxCombo], ['Top hype', LEVEL_NAMES[r.topLevel || 0]], ['Perfect', c.perfect], ['Great', c.great], ['Good', c.good + c.ok], ['Missed', c.miss]];
      $('res-stats').innerHTML = stats.map(([l, v]) => `<div class="stat"><b class="${/^[\d,.%]+$/.test(String(v)) ? '' : 'txt'}">${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
      $('res-tough').innerHTML = r.tough.length ? `<div class="tip"><b>Work on:</b> ${r.tough.map(t => `${esc(t.label)} (${Math.round(t.frac * 100)}% of notes heard)`).join(' · ')}. Try them in Practice.</div>` : '';
    } else {
      $('res-grade').textContent = r.skipped ? 'OK!' : 'YES!';
      $('res-title').textContent = 'Practice complete';
      $('res-sub').textContent = `${ch.song.title}${r.tap ? ' · tap mode' : ''}`;
      const stats = [['Chords played', r.played], ['Avg. time to get each', r.avg ? r.avg.toFixed(1) + 's' : '–'], ['Best streak', r.bestStreak || 0],
        ['Top hype', LEVEL_NAMES[r.topLevel || 0]], ...(r.fastest ? [['Fastest change', `${r.fastest.label} · ${r.fastest.time.toFixed(1)}s`]] : []), ['Skipped', r.skipped]];
      $('res-stats').innerHTML = stats.map(([l, v]) => `<div class="stat"><b class="${/^[\d,.%]+$/.test(String(v)) ? '' : 'txt'}">${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
      $('res-tough').innerHTML = r.tough.length && !r.tap ? `<div class="tip"><b>Slowest changes:</b> ${r.tough.map(t => `${esc(t.label)} (${t.avg.toFixed(1)}s)`).join(' · ')}. Speed comes with repetition, so loop the section that has them.</div>` : '';
    }
    Music.fanfareNext();
    this.show('results').then(() => {
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
  open(id){ this.closeModal(true); const m = $(id); m.hidden = false; this.openModal = id; Sfx.modalOpen(); const sh = m.querySelector('.sheet'); if (sh && !reduceMotion) sh.style.animation = 'rise .38s cubic-bezier(.2,1.4,.4,1) both'; const f = m.querySelector('button,input,textarea,select'); f && f.focus(); },
  closeModal(quiet){
    if (!this.openModal) return;
    if (!quiet) Sfx.modalClose();
    const id = this.openModal; $(id).hidden = true; this.openModal = null;
    if (id === 'm-pause' && G.paused) G.resume();
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
    if (lockString != null) { si = lockString; bd = Math.abs(OPEN_MIDI[si] - m); }
    else OPEN_MIDI.forEach((o, i) => { if (Math.abs(o - m) < bd) { bd = Math.abs(o - m); si = i; } });
    const label = i => STRING_NAMES[i] === 'e' ? 'High e' : i === 0 ? 'Low E' : STRING_NAMES[i];
    if (si >= 0 && bd <= 1.5) {
      const c = Math.round((m - OPEN_MIDI[si]) * 100);
      $(ids.needle).style.left = (50 + Math.max(-50, Math.min(50, c))) + '%';
      $(ids.text).textContent = `${label(si)} string: ` + (Math.abs(c) <= 5 ? 'in tune ✓' : c > 0 ? `${c} cents sharp. Loosen it a little.` : `${-c} cents flat. Tighten it a little.`);
      return { string: si, cents: c };
    }
    if (si >= 0 && lockString != null) {
      $(ids.needle).style.left = (m > OPEN_MIDI[si] ? 100 : 0) + '%';
      $(ids.text).textContent = `${label(si)} string is way ${m > OPEN_MIDI[si] ? 'too high. Loosen it' : 'too low. Tighten it'} until it sounds like ${midiName(OPEN_MIDI[si])}.`;
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
  renderTuneStrings(){
    const box = $('tune2-strings'); box.textContent = '';
    OPEN_MIDI.forEach((midi, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'sbtn' + (this.tuneOk[i] ? ' ok' : '') + (this.tuneLock === i ? ' active' : '');
      b.innerHTML = `<b>${STRING_NAMES[i]}</b><small>${midiName(midi)}${this.tuneOk[i] ? ' ✓' : ''}</small>`;
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
  openCode(mode){
    this.open('m-code');
    this.codeMode = mode;
    $('code-msg').textContent = '';
    if (mode === 'show') {
      $('m-code-h').textContent = 'Song code';
      $('code-help').textContent = this.inViewer ? 'Copy this code, then paste it into the Strum Jam game file on your computer (Paste a song code) to play with your guitar.' : 'Share this code, or paste it into another copy of Strum Jam.';
      $('code-text').value = songToCode(this.song); $('code-text').readOnly = true;
      $('btn-code-act').textContent = 'Copy';
      $('code-text').select();
    } else {
      $('m-code-h').textContent = 'Paste a song code';
      $('code-help').textContent = 'Paste a code that starts with SJ1. (from the claude.ai version or a friend).';
      $('code-text').value = ''; $('code-text').readOnly = false;
      $('btn-code-act').textContent = 'Load song';
      $('code-text').focus();
    }
  },
  async codeAction(){
    const ta = $('code-text');
    if (this.codeMode === 'show') {
      try { await navigator.clipboard.writeText(ta.value); $('code-msg').textContent = 'Copied.'; }
      catch (e) { ta.select(); $('code-msg').textContent = 'Press Ctrl+C (or ⌘C) to copy.'; }
      return;
    }
    try {
      const song = songFromCode(ta.value);
      this.saveMine(song); this.renderLists(); this.closeModal(); this.openSong(song);
    } catch (e) { $('code-msg').textContent = e.message; }
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
      const d = await this.askClaude(grooveFillPrompt(title, $('imp-artist').value.trim()), ctl.signal, 'default');
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
    $('btn-settings').onclick = () => { this.open('m-settings'); $('chk-music').checked = Settings.musicOn; $('vol-music').value = Math.round(Settings.musicVol * 100); $('chk-sfx').checked = Settings.sfxOn; $('chk-notes').checked = Settings.showNotes; $('vol-drums').value = Math.round(Settings.drumVol * 100); $('chk-click').checked = Settings.click; $('chk-lefty').checked = Settings.lefty; $('api-key').value = Settings.apiKey; $('api-model').value = Settings.apiModel; };
    $('btn-paste').onclick = () => this.openCode('paste');
    $('btn-import').onclick = () => this.openImport(null);
    $('btn-song-back').onclick = () => { this.show('title'); };
    $('btn-song-code').onclick = () => this.openCode('show');
    $('btn-practice').onclick = () => this.startGame('practice');
    $('btn-stage').onclick = () => this.startGame('stage');
    $('seg-easy').addEventListener('change', e => { Settings.easy = e.target.value === '1'; saveSettings(); this.recompile(); this.renderSong(); });
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
    $('btn-restart').onclick = () => { $('m-pause').hidden = true; this.openModal = null; G.paused = false; G.stop(); this.startGame(G.mode, true); };
    $('btn-quit').onclick = () => { $('m-pause').hidden = true; this.openModal = null; G.paused = false; G.stop(); this.show('song'); this.renderSong(); };
    $('btn-hear').onclick = () => { const ev = G.mode === 'practice' ? G.cur() : G.shownEv; if (ev && ev.notes) { const how = AudioEngine.playChord(ev.notes.map(n => n.midi), 'now:' + ev.label); const b = $('btn-hear'); b.dataset.next = how === 'strum' ? 'arpeggio' : 'strum'; b.querySelector('small') && (b.querySelector('small').textContent = how === 'strum' ? 'tap again: arpeggio' : 'tap again: strum'); } };
    $('btn-skip').onclick = () => G.skip();
    // redraw the fretboard when the layout switches between phone and wide (e.g. rotating the phone)
    let fbCompact = null, rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => {
      const c = innerWidth < 560 || ($('fretboard').getBoundingClientRect().width || 1000) < 560;
      if (c === fbCompact) return; fbCompact = c;
      if (G.running) { const ev = G.mode === 'practice' ? G.cur() : G.shownEv; if (ev) { Fretboard.render(ev, this.chart.capo, Settings.lefty); G.fbKey = null; } }
    }, 150); });

    $('btn-again').onclick = () => this.startGame(G.mode, true);
    $('btn-res-song').onclick = () => { this.show('song'); this.renderSong(); };
    $('btn-res-home').onclick = () => this.show('title');
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
    $('sens').oninput = e => { Settings.sens = +e.target.value; saveSettings(); };
    $('lat').oninput = e => { Settings.latency = +e.target.value; $('lat-val').textContent = Settings.latency; saveSettings(); };
    $('btn-calib').onclick = () => this.calibrate();
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
    $('btn-music').onclick = () => { Settings.musicOn = !Settings.musicOn; saveSettings(); this.musicBtn(); Music.setVolume(); };
    this.musicBtn();
    // a click sound for every button (cards and closers have their own)
    document.addEventListener('pointerdown', e => {
      const el = e.target.closest('button, .chip[role=button]'); if (!el || el.disabled) return;
      if (el.closest('.card') || el.dataset.sfx === 'none' || (this.screen === 'game' && G.running && !this.openModal)) return;
      if (el.dataset.sfx === 'back') Sfx.back(); else if (el.closest('.seg')) Sfx.toggle(); else Sfx.click();
    }, true);
    $('api-key').onchange = e => { Settings.apiKey = e.target.value.trim(); saveSettings(); this.refreshEnv(); };
    $('api-model').onchange = e => { Settings.apiModel = e.target.value.trim() || 'claude-sonnet-4-5'; saveSettings(); };
    $('btn-clear-mine').onclick = () => { Store.set('mine', []); this.renderLists(); $('btn-clear-mine').textContent = 'Cleared'; };
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
      Music.update(!Splash.on && ['title', 'song', 'results'].includes(this.screen) && !['m-mic', 'm-tune'].includes(this.openModal));
      if (Splash.on) Splash.frame();
      Fx.frame();
      if (this.screen === 'title') this.titleFrame();
      if (this.screen === 'game') { const f = $('hype-fill'), w = Math.round((G.hype || 0) * 100) + '%'; if (f.style.height !== w) f.style.height = w; }
      Mic.analyze((this.screen === 'game' && G.running && !G.paused && !G.tapMode) || this.openModal === 'm-mic');
      const now = AudioEngine.ctx ? AudioEngine.ctx.currentTime : performance.now() / 1000;
      if (this.screen === 'game') { G.frame(now); Stage.draw(G, now); }
      else if (this.screen === 'title') TitleArt.draw(performance.now() / 1000);
      if (this.openModal === 'm-mic') this.micFrame();
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
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
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
    // spotlight + stage
    // a record spinning on the turntable behind the band (33 1/3 rpm)
    drawVinyl(c, W * 0.5, H * 0.46, W * 0.44, H * 0.42, reduceMotion ? 0.4 : t * Math.PI * 2 * 0.555);
    const floorY = H * 0.83;
    c.fillStyle = COL.coral; rr(c, W * 0.08, floorY - 4, W * 0.84, H * 0.1, 14); c.fill(); c.stroke();
    // floating chord cards
    ['G', 'C', 'D', 'Em'].forEach((name, i) => {
      const x = W * (0.2 + i * 0.2), y = H * 0.17 + (reduceMotion ? 0 : Math.sin(t * 2 + i) * 6);
      const col = cardColor(name); c.save(); c.translate(x, y); c.rotate((i - 1.5) * 0.08);
      c.fillStyle = col; rr(c, -26, -18, 52, 36, 10); c.fill(); c.lineWidth = 3; c.stroke();
      c.fillStyle = textOn(col); c.font = `22px ${DISPLAY_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, 0, 2); c.restore();
    });
    const s = Math.min(H * 0.42, W * 0.3);
    let hits = Music.hits;
    if (!playing) { hits = []; for (let n = 0; n < 2; n++) { const bb = Math.floor(beat) - n; hits.push({ t: bb * 60 / bpm, kind: bb % 2 ? 'snare' : 'kick' }); hits.push({ t: (bb + 0.5) * 60 / bpm, kind: 'hat' }); } }
    let strum = 0;
    if (playing) { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (h.kind === 'gtr' && h.t <= now) { const d = now - h.t; strum = d < 0.2 ? Math.sin(d / 0.2 * Math.PI) : 0; break; } } }
    else strum = ph < 0.25 ? Math.sin(ph / 0.25 * Math.PI) : 0;
    drawPip(c, W * 0.34, floorY, s, { bounce: Math.abs(Math.sin(ph * Math.PI)), squash: Math.cos(ph * Math.PI * 2) * 0.5, strum, mood: Math.floor(beat) % 8 === 7 ? 'great' : 'idle', lookX: 0.6, lefty: Settings.lefty });
    c.save(); c.beginPath(); c.ellipse(W * 0.5, H * 0.46, W * 0.44, H * 0.42, 0, 0, Math.PI * 2); c.rect(0, H * 0.84, W, H); c.clip();
    c.translate(0, H * 0.02); c.scale(1, 0.8); drawCrowd(c, W, H * 1.25, ph, playing ? 0.8 : 0.4, now, playing ? 3 : 0); c.restore();
    // the funk drummer, grooving to a simple beat (locked to the menu music when it plays)
    if (typeof FunkDrummer !== 'undefined') {
      const spb = 60 / bpm, tb = beat * spb, ev = [], b0 = Math.floor(beat);
      for (let bb = b0 - 3; bb <= b0 + 3; bb++) { const t = bb * spb;
        ev.push({ t, kind: 'hat' }, { t: t + spb / 2, kind: 'hat' }, { t, kind: ((bb % 2) + 2) % 2 ? 'snare' : 'kick' });
        if (((bb % 16) + 16) % 16 === 0) ev.push({ t, kind: 'crash' });
        if (((bb % 8) + 8) % 8 === 7) ev.push({ t: t + spb / 2, kind: 'tom' }, { t: t + spb * 0.75, kind: 'tom' }); }
      ev.sort((a, b) => a.t - b.t);
      const h = s * 2.1;
      FunkDrummer.draw(c, this.dSt || (this.dSt = FunkDrummer.create()), { x: Settings.lefty ? W * 0.28 : W * 0.72, floorY: floorY + h * 0.012, h, now: tb, beat, spb, level: playing ? 2 : 1, events: ev, playing: true, missAgo: 9 });
    }
  },
};

let __booted = false;
const __boot = () => { if (__booted) return; __booted = true; UI.init(); };
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', __boot); else __boot();
