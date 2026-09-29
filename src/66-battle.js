/* =====================================================================
   Battle: 2 to 4 players on one device take turns playing the same song
   on Stage; the highest score wins. (Online battles need a server; this
   is the pass-the-guitar version.)
   ===================================================================== */
const Battle = {
  st: null,
  active(){ return !!(this.st && this.st.playing); },
  open(){
    this.st = null;
    this.renderSetup(); UI.show('battle');
  },
  pool(){ const seen = new Set(); return [...UI.mine(), ...LIBRARY.map(s => validateSong(s, 'library'))].filter(s => !seen.has(s.id) && seen.add(s.id)); },
  renderSetup(){
    const saved = Store.get('battleNames', ['Player 1', 'Player 2']);
    const setup = this.setup || (this.setup = { names: Array.isArray(saved) && saved.length >= 2 ? saved.slice(0, 4) : ['Player 1', 'Player 2'], songId: '', section: 'all' });
    const pool = this.pool();
    if (!setup.songId && pool.length) setup.songId = pool[0].id;
    $('battle-body').innerHTML = `<div class="bt-card"><h2>Who’s playing?</h2>
        <div class="bt-names">${setup.names.map((n, i) => `<label><span class="pn p${i}">${i + 1}</span><input type="text" maxlength="16" data-p="${i}" value="${esc(n)}" aria-label="Player ${i + 1} name">${setup.names.length > 2 ? `<button type="button" class="btn btn-sm" data-rm="${i}" aria-label="Remove ${esc(n)}">✕</button>` : ''}</label>`).join('')}</div>
        ${setup.names.length < 4 ? '<button type="button" class="btn btn-sm" id="btn-bt-add">+ Add a player</button>' : ''}</div>
      <div class="bt-card"><h2>The song</h2>
        <select id="bt-song" aria-label="Song">${pool.map(s => `<option value="${esc(s.id)}" ${s.id === setup.songId ? 'selected' : ''}>${esc(s.title)}${s.artist ? ' · ' + esc(s.artist) : ''}</option>`).join('')}</select>
        <label class="toggle small"><input type="checkbox" id="bt-short" ${setup.section === 'first' ? 'checked' : ''}> Short battle: just the first section</label>
        <p class="small">Everyone plays the same song on Stage, one after another. Pass the guitar (or the phone) between turns. Highest score wins. Find more songs in Play &amp; Learn.</p></div>
      <div class="bt-go"><button class="btn btn-go btn-big" type="button" id="btn-bt-start">⚔️ Start the battle</button><span class="small muted">Online battles against other players are coming later.</span></div>`;
    $('battle-body').querySelectorAll('[data-p]').forEach(i => i.oninput = () => { setup.names[+i.dataset.p] = i.value; });
    $('battle-body').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { setup.names.splice(+b.dataset.rm, 1); this.renderSetup(); });
    const add = $('btn-bt-add'); if (add) add.onclick = () => { setup.names.push('Player ' + (setup.names.length + 1)); this.renderSetup(); };
    $('bt-song').onchange = e => { setup.songId = e.target.value; };
    $('bt-short').onchange = e => { setup.section = e.target.checked ? 'first' : 'all'; };
    $('btn-bt-start').onclick = () => this.start();
  },
  start(){
    const setup = this.setup, song = this.pool().find(s => s.id === setup.songId); if (!song) return;
    const names = setup.names.map((n, i) => n.trim() || 'Player ' + (i + 1));
    Store.set('battleNames', names);
    this.st = { song, section: setup.section, players: names.map(name => ({ name, score: null, grade: '', acc: 0 })), turn: 0, playing: false };
    Sfx.found(); this.renderTurn();
  },
  // between turns: whose go it is, and the scores so far
  renderTurn(){
    const st = this.st, p = st.players[st.turn];
    $('battle-body').innerHTML = `<div class="bt-turn"><small>Turn ${st.turn + 1} of ${st.players.length} · ${esc(st.song.title)}</small>
        <h2>Pass the guitar to<br><b class="p${st.turn}">${esc(p.name)}</b></h2>
        <button class="btn btn-go btn-big" type="button" id="btn-bt-play">🎤 ${esc(p.name)}, take the stage</button></div>
      ${this.board(false)}`;
    $('btn-bt-play').onclick = () => this.play();
    UI.show('battle');
  },
  board(final){
    const st = this.st, ranked = st.players.map((p, i) => ({ ...p, i })).filter(p => p.score != null).sort((a, b) => b.score - a.score);
    if (!ranked.length) return '';
    return `<div class="bt-card bt-board"><h2>${final ? 'Final scores' : 'Scores so far'}</h2>${ranked.map((p, k) => `<div class="bt-row${final && k === 0 ? ' win' : ''}"><span class="rk">${final && k === 0 ? '👑' : k + 1}</span><span class="pn p${p.i}">${p.i + 1}</span><b>${esc(p.name)}</b><span class="gr">${esc(p.grade)}</span><span class="sc">${p.score.toLocaleString()}</span></div>`).join('')}</div>`;
  },
  play(){
    const st = this.st; st.playing = true;
    UI.storyCtx = null; UI.song = st.song; UI.recompile();
    // same rules for everyone: the song's first section only for a short battle, full tempo, the player's note check
    UI.battleOpts = { section: 0, loop: st.section === 'first', tempo: 100, inst: 'guitar' };
    UI.startGame('stage');
  },
  // a finished Stage run during a battle
  record(r){
    const st = this.st; if (!st || !st.playing || r.mode !== 'stage') return null;
    st.playing = false; UI.battleOpts = null;
    const p = st.players[st.turn]; p.score = r.failed ? 0 : r.score; p.grade = r.failed ? 'F' : r.grade; p.acc = r.acc;
    st.turn++;
    const last = st.turn >= st.players.length;
    if (last) { const w = st.players.slice().sort((a, b) => b.score - a.score); const tie = w[1] && w[1].score === w[0].score;
      return { big: true, won: true, html: `<b>${tie ? 'It’s a tie!' : esc(w[0].name) + ' wins the battle!'}</b><span>${w.map(x => `${esc(x.name)} ${x.score.toLocaleString()}`).join(' · ')}</span><button class="btn btn-go" type="button" data-bt="done">See the scoreboard</button>` }; }
    return { html: `<b>${esc(p.name)}: ${p.score.toLocaleString()}</b><span>Up next: ${esc(st.players[st.turn].name)}</span><button class="btn btn-go" type="button" data-bt="next">Next player →</button>` };
  },
  after(){ const st = this.st; if (!st) return UI.show('title'); if (st.turn < st.players.length) this.renderTurn(); else this.finish(); },
  finish(){
    $('battle-body').innerHTML = `${this.board(true)}<div class="bt-go"><button class="btn btn-go" type="button" id="btn-bt-again">Rematch</button><button class="btn" type="button" id="btn-bt-new">New battle</button></div>`;
    $('btn-bt-again').onclick = () => { this.st.players.forEach(p => { p.score = null; p.grade = ''; }); this.st.turn = 0; this.renderTurn(); };
    $('btn-bt-new').onclick = () => { this.st = null; this.renderSetup(); };
    UI.show('battle');
  },
};
