/* =====================================================================
   Online mode: jam with anyone, one take at a time.
   Someone starts a jam on a song and gets a join code. Everyone who joins
   picks an instrument and plays the song on Stage while the game records
   their mic; the take (audio + score) is uploaded to the jam. The jam page
   plays every take back together, lined up on the song's first beat, and
   any set of takes can be posted as a performance with its total score.
   Storage: Supabase (tables jams / takes / performances and a public
   "takes" audio bucket; see supabase/setup.sql). The anon key is meant to
   be public: row-level security only allows reading and adding.
   ===================================================================== */
const SUPABASE_URL = 'https://mlkpttzklcdlupwldjii.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_r9u0XWsis6x68biG9MtKVQ_kueS07Ks';   // the project's publishable (public) key
const INSTRUMENTS = [
  { id: 'guitar', name: 'Guitar', icon: '🎸', ready: true },
  { id: 'vocals', name: 'Vocals', icon: '🎤', ready: true },
  { id: 'bass', name: 'Bass', icon: '🎸', ready: true },
  { id: 'piano', name: 'Piano', icon: '🎹', ready: true },
  { id: 'drums', name: 'Drums', icon: '🥁', ready: true },
];

const Sb = {
  url: SUPABASE_URL, key: SUPABASE_ANON_KEY,
  on(){ return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(this.url) && this.key.length > 20; },
  // publishable keys (sb_publishable_…) go in apikey only; the older anon JWT keys also go in Authorization
  head(extra){ return { apikey: this.key, ...(this.key.startsWith('eyJ') ? { Authorization: 'Bearer ' + this.key } : {}), ...(extra || {}) }; },
  async req(path, opts){
    opts = opts || {};
    const r = await fetch(this.url + path, { method: opts.method || 'GET', headers: this.head(opts.headers), body: opts.body, signal: opts.signal });
    if (!r.ok) { let m = ''; try { const j = await r.json(); m = j.message || j.error || ''; } catch (e) {} throw Object.assign(new Error(m || 'HTTP ' + r.status), { status: r.status }); }
    return r.status === 204 ? null : r.json();
  },
  select(table, qs, signal){ return this.req('/rest/v1/' + table + '?' + qs, { signal }); },
  insert(table, row){ return this.req('/rest/v1/' + table, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(row) }).then(r => r[0]); },
  upload(path, blob, type){ return this.req('/storage/v1/object/takes/' + path, { method: 'POST', headers: { 'Content-Type': type, 'x-upsert': 'false' }, body: blob }); },
  audioUrl(path){ return this.url + '/storage/v1/object/public/takes/' + path.split('/').map(encodeURIComponent).join('/'); },
};

const Online = {
  jam: null, takes: [], rec: null, player: null, tab: 'top',
  code(){ const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; const r = crypto.getRandomValues(new Uint8Array(6)); r.forEach(b => s += A[b % A.length]); return s; },
  name(){ return (Store.get('onlineName', '') || '').slice(0, 24); },
  inst(id){ return INSTRUMENTS.find(i => i.id === id) || INSTRUMENTS[0]; },
  pool(){ const seen = new Set(); return [...UI.mine(), ...LIBRARY.map(s => validateSong(s, 'library'))].filter(s => !seen.has(s.id) && seen.add(s.id)); },
  body(html){ $('online-body').innerHTML = html; },
  err(e){ return e && e.status === 404 ? 'That jam wasn’t found. Check the code.' : e instanceof TypeError ? 'Couldn’t reach the online service. Check your connection.' : 'Something went wrong online: ' + (e && e.message || e); },

  /* ---------- home: start, join, and the posted performances ---------- */
  async open(){
    this.stopPlayback();
    UI.show('online');
    if (!Sb.on()) {
      this.body(`<div class="on-card"><h2>Online is almost ready</h2><p>Jamming online needs the game’s online service switched on. Until then you can still battle friends on this device.</p>
        <div class="row"><button class="btn btn-go" type="button" id="btn-on-local">⚔️ Battle on this device</button></div></div>`);
      $('btn-on-local').onclick = () => Battle.open(); return;
    }
    this.body(`<div class="on-grid">
        <div class="on-card"><h2>Start a jam</h2><p>Pick a song and your instrument. You get a code to send your friends; everyone records their part and the game layers the takes into one performance.</p><button class="btn btn-go" type="button" id="btn-on-new">🎤 Start a jam</button></div>
        <div class="on-card"><h2>Join a jam</h2><form class="row" id="on-join"><input type="text" id="on-code" maxlength="6" placeholder="Code" autocomplete="off" aria-label="Jam code"><button class="btn btn-go" type="submit">Join</button></form><p class="small" id="on-join-msg"></p></div>
      </div>
      <div class="on-card"><div class="on-tabs"><h2>Performances</h2><button type="button" data-tab="top" class="${this.tab === 'top' ? 'on' : ''}">Top scores</button><button type="button" data-tab="new" class="${this.tab === 'new' ? 'on' : ''}">Newest</button></div><div id="on-feed" class="on-feed"><p class="small">Loading…</p></div></div>
      <p class="small muted on-foot"><button class="btn btn-sm" type="button" id="btn-on-local">⚔️ Battle on this device instead</button></p>`);
    $('btn-on-new').onclick = () => this.newJam();
    $('btn-on-local').onclick = () => Battle.open();
    $('on-join').onsubmit = e => { e.preventDefault(); this.openJam($('on-code').value); };
    $('online-body').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.open(); });
    this.feed();
  },
  async feed(){
    const box = $('on-feed'); if (!box) return;
    try {
      const rows = await Sb.select('performances', 'select=*&limit=20&order=' + (this.tab === 'top' ? 'total_score.desc' : 'created_at.desc'));
      if (!rows.length) { box.innerHTML = '<p class="small">No performances posted yet. Start a jam and be the first!</p>'; return; }
      const ids = [...new Set(rows.flatMap(r => r.take_ids))];
      const takes = ids.length ? await Sb.select('takes', 'select=*&id=in.(' + ids.join(',') + ')') : [];
      box.innerHTML = rows.map((r, i) => { const ts = r.take_ids.map(id => takes.find(t => t.id === id)).filter(Boolean);
        return `<div class="on-perf"><span class="rk">${this.tab === 'top' ? i + 1 : '♪'}</span><span class="pt"><b>${esc(r.title)}</b><small>${esc(r.song_title)}${r.song_artist ? ' · ' + esc(r.song_artist) : ''} · by ${esc(r.posted_by)}</small>
          <small>${ts.map(t => `${this.inst(t.instrument).icon} ${esc(t.player_name)} ${t.grade}`).join(' · ')}</small></span><span class="sc">${r.total_score.toLocaleString()}</span>
          <button class="btn btn-sm" type="button" data-play="${i}">▶ Play</button><button class="btn btn-sm" type="button" data-jam="${esc(r.jam_id)}">Jam</button></div>`; }).join('');
      box.querySelectorAll('[data-play]').forEach(b => b.onclick = () => { const r = rows[+b.dataset.play]; this.playTogether(r.take_ids.map(id => takes.find(t => t.id === id)).filter(Boolean), b); });
      box.querySelectorAll('[data-jam]').forEach(b => b.onclick = () => this.openJam(b.dataset.jam));
    } catch (e) { box.innerHTML = `<p class="small">${esc(this.err(e))}</p>`; }
  },

  /* ---------- a new jam: song, name, instrument ---------- */
  newJam(){
    const pool = this.pool();
    this.body(`<div class="on-card"><h2>Start a jam</h2>
      <label class="on-l"><b>The song</b><select id="on-song">${pool.map(s => `<option value="${esc(s.id)}">${esc(s.title)}${s.artist ? ' · ' + esc(s.artist) : ''}</option>`).join('')}</select></label>
      <p class="small">Find more songs in Play &amp; Learn; they show up here.</p>
      ${this.whoHtml()}
      <div class="row"><button class="btn btn-go" type="button" id="btn-on-create">Create the jam</button><button class="btn btn-sm" type="button" id="btn-on-back">Back</button><span class="small" id="on-msg"></span></div></div>`);
    this.bindWho();
    $('btn-on-back').onclick = () => this.open();
    $('btn-on-create').onclick = async () => {
      const song = pool.find(s => s.id === $('on-song').value), who = this.who(); if (!song || !who) return;
      $('btn-on-create').disabled = true; $('on-msg').textContent = 'Creating…';
      try {
        let jam = null;
        for (let i = 0; i < 4 && !jam; i++) { try { jam = await Sb.insert('jams', { id: this.code(), song_title: song.title.slice(0, 120), song_artist: (song.artist || '').slice(0, 120), song_code: songToCode(song), host_name: who.name }); } catch (e) { if (e.status !== 409) throw e; } }
        if (!jam) throw new Error('no free code');
        Sfx.found(); this.openJam(jam.id);
      } catch (e) { $('on-msg').textContent = this.err(e); $('btn-on-create').disabled = false; }
    };
  },
  whoHtml(){
    const cur = Store.get('onlineInst', 'guitar');
    return `<label class="on-l"><b>Your name</b><input type="text" id="on-name" maxlength="24" value="${esc(this.name())}" placeholder="Your name"></label>
      <div class="on-l"><b>Your instrument</b><div class="on-inst">${INSTRUMENTS.map(i => `<button type="button" data-inst="${i.id}" class="${i.id === cur && i.ready ? 'on' : ''}" ${i.ready ? '' : 'disabled'}>${i.icon} ${i.name}${i.ready ? '' : ' <small>soon</small>'}</button>`).join('')}</div></div>`;
  },
  bindWho(){ $('online-body').querySelectorAll('[data-inst]').forEach(b => b.onclick = () => { $('online-body').querySelectorAll('[data-inst]').forEach(x => x.classList.toggle('on', x === b)); Store.set('onlineInst', b.dataset.inst); }); },
  who(){
    const name = ($('on-name').value || '').trim().slice(0, 24);
    if (!name) { $('on-name').focus(); Sfx.fail(); return null; }
    Store.set('onlineName', name);
    const b = $('online-body').querySelector('[data-inst].on'); return { name, instrument: b ? b.dataset.inst : 'guitar' };
  },

  /* ---------- a jam: its takes, recording yours, playing them together, posting ---------- */
  async openJam(code){
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (code.length !== 6) { const m = $('on-join-msg'); if (m) m.textContent = 'Codes have 6 letters and numbers.'; return; }
    this.stopPlayback();
    UI.show('online');
    this.body('<div class="on-card"><p>Loading the jam…</p></div>');
    try {
      const rows = await Sb.select('jams', 'select=*&id=eq.' + code);
      if (!rows.length) throw Object.assign(new Error('not found'), { status: 404 });
      this.jam = rows[0]; this.jam.song = songFromCode(this.jam.song_code);
      this.takes = await Sb.select('takes', 'select=*&order=created_at.asc&jam_id=eq.' + code);
      this.renderJam();
    } catch (e) { this.body(`<div class="on-card"><p>${esc(this.err(e))}</p><button class="btn btn-sm" type="button" id="btn-on-back">Back</button></div>`); $('btn-on-back').onclick = () => this.open(); }
  },
  renderJam(msg){
    const j = this.jam, link = location.href.split('#')[0] + '#jam=' + j.id, total = this.takes.reduce((a, t) => a + t.score, 0);
    this.body(`<div class="on-card on-jam"><div class="on-jamhead"><div><small>Jam on</small><h2>${esc(j.song_title)}</h2><small>${esc(j.song_artist)}${j.song_artist ? ' · ' : ''}started by ${esc(j.host_name)}</small></div>
        <div class="on-code"><small>Join code</small><b>${esc(j.id)}</b><button class="btn btn-sm" type="button" id="btn-on-link">Copy invite link</button></div></div>
      ${msg ? `<p class="on-msg">${msg}</p>` : ''}
      <h3>Takes <small>${this.takes.length ? 'total ' + total.toLocaleString() : ''}</small></h3>
      <div class="on-takes">${this.takes.length ? this.takes.map((t, i) => `<label class="on-take"><input type="checkbox" data-take="${i}" checked><span class="ti">${this.inst(t.instrument).icon}</span><span class="tn"><b>${esc(t.player_name)}</b><small>${this.inst(t.instrument).name} · ${Math.round(t.accuracy * 100)}%</small></span><span class="gr">${t.grade}</span><span class="sc">${t.score.toLocaleString()}</span><button class="btn btn-sm" type="button" data-solo="${i}">▶</button></label>`).join('') : '<p class="small">No takes yet. Record the first one!</p>'}</div>
      <div class="row on-acts"><button class="btn btn-go" type="button" id="btn-on-rec">🔴 Record my take</button>${this.takes.length ? '<button class="btn" type="button" id="btn-on-play">▶ Play together</button><button class="btn btn-teal" type="button" id="btn-on-post">Post performance</button>' : ''}<button class="btn btn-sm" type="button" id="btn-on-home">Back</button></div>
      <p class="small muted">Takes play back lined up on the song’s first beat. Headphones give the cleanest recordings.</p></div>`);
    $('btn-on-link').onclick = async () => { try { await navigator.clipboard.writeText(link); $('btn-on-link').textContent = 'Copied!'; } catch (e) { prompt('Copy this link', link); } };
    $('btn-on-home').onclick = () => this.open();
    $('btn-on-rec').onclick = () => this.recordPrompt();
    const chosen = () => [...$('online-body').querySelectorAll('[data-take]')].filter(x => x.checked).map(x => this.takes[+x.dataset.take]);
    $('online-body').querySelectorAll('[data-solo]').forEach(b => b.onclick = e => { e.preventDefault(); this.playTogether([this.takes[+b.dataset.solo]], b); });
    if ($('btn-on-play')) $('btn-on-play').onclick = () => this.playTogether(chosen(), $('btn-on-play'));
    if ($('btn-on-post')) $('btn-on-post').onclick = () => this.post(chosen());
  },
  recordPrompt(){
    const j = this.jam;
    this.body(`<div class="on-card"><h2>Record your take</h2><p>You’ll play <b>${esc(j.song_title)}</b> on Stage, scored as usual, while the game records your mic.</p>${this.whoHtml()}
      <div class="row"><button class="btn btn-go" type="button" id="btn-on-go">🎤 Take the stage</button><button class="btn btn-sm" type="button" id="btn-on-back">Back</button><span class="small" id="on-msg"></span></div></div>`);
    this.bindWho();
    $('btn-on-back').onclick = () => this.renderJam();
    $('btn-on-go').onclick = async () => {
      const who = this.who(); if (!who) return;
      if (typeof MediaRecorder === 'undefined') { $('on-msg').textContent = 'This browser can’t record audio.'; return; }
      if (!Mic.on) await Mic.start();
      if ((!Mic.on || !Mic.stream) && who.instrument !== 'drums' && !Midi.name) { $('on-msg').textContent = 'Recording a take needs the microphone. Allow it and try again.'; UI.refreshMic(); return; }
      UI.storyCtx = null; UI.song = j.song; UI.recompile();
      // vocals: the lyrics (and any song file this device has lined up) come along
      if (who.instrument === 'vocals') { $('on-msg').textContent = 'Getting the lyrics…'; await UI.loadVox(); if (!UI.vox) { $('on-msg').textContent = 'No lyrics found for this song, so vocals can’t be recorded on it yet.'; return; } }
      this.rec = { jam: j, ...who };
      UI.battleOpts = { section: 0, loop: false, tempo: 100, inst: who.instrument };
      UI.startGame('stage');
    };
  },
  // called by UI.startGame once the Stage run has started: record the mic, note where beat 0 falls
  beginRecording(){
    const r = this.rec; if (!r) return;
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    // drums, or keys/bass over MIDI: the game makes the sound, so the take records the player's bus (plus the mic, if on)
    let stream = Mic.stream;
    if (r.instrument === 'drums' || ((r.instrument === 'piano' || r.instrument === 'bass') && Midi.name)) {
      const ctx = AudioEngine.ctx; r.dest = ctx.createMediaStreamDestination(); AudioEngine.playerBus.connect(r.dest);
      if (Mic.on && Mic.inNode && !(r.instrument !== 'drums' && Midi.name)) Mic.inNode.connect(r.dest);
      stream = r.dest.stream;
    }
    if (!stream) return;
    try { r.mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 96000 } : undefined); } catch (e) { r.mr = null; return; }
    r.chunks = []; r.type = (r.mr.mimeType || type || 'audio/webm').split(';')[0];
    r.mr.ondataavailable = e => { if (e.data && e.data.size) r.chunks.push(e.data); };
    r.mr.start(1000);
    r.startedAt = AudioEngine.now();
    r.firstBeat = Groove.cfg ? Groove.cfg.startTime : r.startedAt;
  },
  stopRecording(r){
    r = r || this.rec; if (!r || !r.mr) return Promise.resolve(null);
    const unhook = () => { if (r.dest) { try { AudioEngine.playerBus.disconnect(r.dest); Mic.inNode && Mic.inNode.disconnect(r.dest); } catch (e) {} r.dest = null; } };
    return new Promise(res => { r.mr.onstop = () => { unhook(); res(new Blob(r.chunks, { type: r.type })); }; try { r.mr.stop(); } catch (e) { unhook(); res(null); } });
  },
  // a finished Stage run while recording: upload the take, then back to the jam
  record(r){
    const rec = this.rec; if (!rec || r.mode !== 'stage') return null;
    this.rec = null; UI.battleOpts = null;
    const html = `<b>Your take on ${esc(rec.jam.song_title)}</b><span id="on-up">Uploading your take…</span><button class="btn btn-go" type="button" data-online="jam">Back to the jam</button>`;
    (async () => {
      const set = t => { const el = $('on-up'); if (el) el.textContent = t; };
      try {
        const blob = await this.stopRecording(rec);
        if (!blob || !blob.size) throw new Error('nothing was recorded');
        const ext = rec.type.includes('mp4') ? 'm4a' : rec.type.includes('ogg') ? 'ogg' : 'webm';
        const path = rec.jam.id + '/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
        await Sb.upload(path, blob, rec.type);
        await Sb.insert('takes', { jam_id: rec.jam.id, player_name: rec.name, instrument: rec.instrument, score: Math.max(0, Math.round(r.score || 0)), grade: r.failed ? 'F' : r.grade,
          accuracy: Math.max(0, Math.min(1, r.acc || 0)), audio_path: path, offset_ms: Math.round((rec.firstBeat - rec.startedAt) * 1000) });
        set('Take saved to the jam!'); Sfx.found();
      } catch (e) { set('Couldn’t save the take: ' + (e && e.message || e)); Sfx.fail(); }
    })();
    return { html };
  },
  // quit or restarted mid-take: drop the recording (a paused take can't line up with the others)
  cancel(){ const r = this.rec; if (r && r.mr) { r.mr.ondataavailable = null; try { r.mr.stop(); } catch (e) {} } this.rec = null; UI.battleOpts = null; },
  restart(){ const r = this.rec; if (!r) return; if (r.mr) { r.mr.ondataavailable = null; try { r.mr.stop(); } catch (e) {} }
    this.rec = { jam: r.jam, name: r.name, instrument: r.instrument }; UI.battleOpts = { section: 0, loop: false, tempo: 100, inst: r.instrument }; UI.startGame('stage', true); },
  after(){ if (this.jam) this.openJam(this.jam.id); else this.open(); },

  // every chosen take at once, each shifted so their first beats land together
  async playTogether(takes, btn){
    if (this.player) { const same = this.player.btn === btn; this.stopPlayback(); if (same) return; }
    if (!takes.length) return;
    const ctx = AudioEngine.ensure(), label = btn ? btn.textContent : '';
    if (btn) btn.textContent = 'Loading…';
    try {
      const bufs = await Promise.all(takes.map(async t => { const r = await fetch(Sb.audioUrl(t.audio_path)); if (!r.ok) throw new Error('audio missing'); return ctx.decodeAudioData(await r.arrayBuffer()); }));
      const lead = Math.max(...takes.map(t => t.offset_ms)) / 1000, t0 = ctx.currentTime + 0.25, gain = ctx.createGain();
      gain.gain.value = 1 / Math.sqrt(takes.length); gain.connect(AudioEngine.master || ctx.destination);
      const srcs = bufs.map((b, i) => { const s = ctx.createBufferSource(); s.buffer = b; s.connect(gain); s.start(t0 + (lead - takes[i].offset_ms / 1000)); return s; });
      const end = Math.max(...bufs.map((b, i) => lead - takes[i].offset_ms / 1000 + b.duration));
      this.player = { srcs, gain, btn, label, timer: setTimeout(() => this.stopPlayback(), (end + 0.5) * 1000) };
      if (btn) btn.textContent = '■ Stop';
    } catch (e) { if (btn) btn.textContent = label; alert('Couldn’t play the takes: ' + (e && e.message || e)); }
  },
  stopPlayback(){
    const p = this.player; if (!p) return; this.player = null;
    clearTimeout(p.timer); p.srcs.forEach(s => { try { s.stop(); } catch (e) {} }); try { p.gain.disconnect(); } catch (e) {}
    if (p.btn && p.btn.isConnected) p.btn.textContent = p.label;
  },
  async post(takes){
    if (!takes.length) return;
    const who = this.name() || 'Someone', title = (prompt('Name this performance', `${this.jam.song_title} jam`) || '').trim().slice(0, 80);
    if (!title) return;
    try {
      await Sb.insert('performances', { jam_id: this.jam.id, title, song_title: this.jam.song_title, song_artist: this.jam.song_artist, total_score: takes.reduce((a, t) => a + t.score, 0), take_ids: takes.map(t => t.id), posted_by: who });
      Sfx.found(); this.renderJam('Posted! It’s in the performances list now.');
    } catch (e) { this.renderJam(esc(this.err(e))); }
  },
};
