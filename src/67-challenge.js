/* =====================================================================
   Setlist challenge: pick 3 to 5 songs, then clear every one of them on
   Stage (at the grade you chose) to win. Songs can be cleared in any
   order; your best grade on each is kept.
   ===================================================================== */
const Challenge = {
  picking: null,
  get(){ const c = Store.get('challenge', null); return c && Array.isArray(c.songs) && c.songs.length ? c : null; },
  set(c){ Store.set('challenge', c); },
  pool(){ const seen = new Set(); return [...UI.mine(), ...LIBRARY.map(s => validateSong(s, 'library'))].filter(s => !seen.has(s.id) && seen.add(s.id)); },
  done(c){ return c.songs.every(s => c.best[s.id] && GRADE_RANK[c.best[s.id]] >= GRADE_RANK[c.need]); },
  render(){
    const box = $('challenge-box'); if (!box) return;
    const c = this.get();
    if (this.picking) {
      const p = this.picking, pool = this.pool();
      box.innerHTML = `<div class="ch-card"><h2>🏆 New setlist challenge</h2><p>Pick 3 to 5 songs (${p.ids.length} picked). Search for more above and they’ll show up here.</p>
        <div class="ch-need">Clear each one on Stage with at least ${['C', 'B', 'A'].map(g => `<button type="button" data-need="${g}" class="${p.need === g ? 'on' : ''}">${g}</button>`).join('')}</div>
        <div class="ch-pick">${pool.map(s => `<label class="cb-song${p.ids.includes(s.id) ? ' on' : ''}"><input type="checkbox" data-id="${esc(s.id)}" ${p.ids.includes(s.id) ? 'checked' : ''}><span class="t">${esc(s.title)} <small class="small">· ${esc(s.artist || '')}</small></span><span class="r">${['', 'Easy', 'Medium', 'Hard'][UI.difficulty(s)]}</span></label>`).join('')}</div>
        <div class="row"><button class="btn btn-go" type="button" id="btn-ch-go" ${p.ids.length >= 3 && p.ids.length <= 5 ? '' : 'disabled'}>Start the challenge</button><button class="btn btn-sm" type="button" id="btn-ch-cancel">Cancel</button></div></div>`;
      box.querySelectorAll('[data-need]').forEach(b => b.onclick = () => { p.need = b.dataset.need; this.render(); });
      box.querySelectorAll('[data-id]').forEach(i => i.onchange = () => {
        if (i.checked && p.ids.length >= 5) { i.checked = false; Sfx.fail(); return; }
        p.ids = i.checked ? [...p.ids, i.dataset.id] : p.ids.filter(x => x !== i.dataset.id); this.render();
      });
      $('btn-ch-go').onclick = () => { const songs = p.ids.map(id => pool.find(s => s.id === id)).filter(Boolean); this.set({ songs, need: p.need, best: {}, started: Date.now() }); this.picking = null; Sfx.found(); this.render(); };
      $('btn-ch-cancel').onclick = () => { this.picking = null; this.render(); };
      return;
    }
    if (!c) {
      box.innerHTML = `<button class="ch-promo" type="button" id="btn-ch-new"><span class="mi" aria-hidden="true">🏆</span><b>Setlist challenge</b><span>Pick 3 to 5 songs. Learn them, then clear every one on Stage to win.</span></button>`;
      $('btn-ch-new').onclick = () => { Sfx.open(); this.picking = { ids: [], need: 'B' }; this.render(); };
      return;
    }
    const n = c.songs.filter(s => c.best[s.id] && GRADE_RANK[c.best[s.id]] >= GRADE_RANK[c.need]).length, won = n === c.songs.length;
    box.innerHTML = `<div class="ch-card${won ? ' won' : ''}"><h2>${won ? '🏆 Challenge won!' : '🏆 Setlist challenge'}</h2>
      <p>${won ? `You cleared all ${c.songs.length} songs with a ${c.need} or better.` : `${n} of ${c.songs.length} cleared. Get a ${c.need} or better on Stage in each one. Practice doesn’t count, but it helps.`}</p>
      <div class="ch-bar"><i style="width:${Math.round(n / c.songs.length * 100)}%"></i></div>
      <div class="ch-list">${c.songs.map((s, i) => { const g = c.best[s.id], ok = g && GRADE_RANK[g] >= GRADE_RANK[c.need];
        return `<button type="button" class="ch-song${ok ? ' ok' : ''}" data-i="${i}"><span class="n">${ok ? '✓' : i + 1}</span><span class="t"><b>${esc(s.title)}</b><small>${esc(s.artist || '')}${g ? ' · best ' + g : ''}</small></span></button>`; }).join('')}</div>
      <div class="row"><button class="btn btn-sm" type="button" id="btn-ch-end">${won ? 'New challenge' : 'Give up'}</button></div></div>`;
    box.querySelectorAll('.ch-song').forEach(b => b.onclick = () => { Sfx.open(); UI.openSong(validateSong(c.songs[+b.dataset.i], c.songs[+b.dataset.i].source || 'library')); });
    $('btn-ch-end').onclick = () => { if (!won && !confirm('Give up this challenge?')) return; this.set(null); this.picking = won ? { ids: [], need: c.need } : null; this.render(); };
  },
  // a finished Stage run: counts if the song is in the challenge. Returns {html, big} for the results screen, or null.
  record(r){
    const c = this.get(); if (!c || r.mode !== 'stage' || r.failed || !r.chart) return null;
    const id = r.chart.song.id; if (!c.songs.some(s => s.id === id)) return null;
    const was = this.done(c), old = c.best[id];
    if (!old || GRADE_RANK[r.grade] > GRADE_RANK[old]) c.best[id] = r.grade;
    this.set(c);
    const ok = GRADE_RANK[r.grade] >= GRADE_RANK[c.need], n = c.songs.filter(s => c.best[s.id] && GRADE_RANK[c.best[s.id]] >= GRADE_RANK[c.need]).length;
    if (!was && this.done(c)) return { big: true, won: true, html: `<b>Challenge won!</b><span>All ${c.songs.length} songs cleared with a ${c.need} or better.</span>` };
    return { html: ok ? `<b>Setlist: ${n} of ${c.songs.length} cleared</b><span>${n < c.songs.length ? `${c.songs.length - n} to go.` : ''}</span>` : `<b>Setlist challenge: needs a ${c.need}</b><span>Practice the tough changes, then try again.</span>` };
  },
};
