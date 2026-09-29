/* =====================================================================
   Picking an instrument on the song screen, and Vocals' setup: the
   lyrics (found online or pasted), their timing against the chart, and
   the optional song file for the real melody.
   ===================================================================== */
const INSTS = [
  { id: 'guitar', name: 'Guitar', ready: true },
  { id: 'vocals', name: 'Vocals', ready: true },
  { id: 'bass', name: 'Bass', ready: true },
  { id: 'piano', name: 'Piano', ready: true },
  { id: 'drums', name: 'Drums', ready: true },
];
Object.assign(UI, {
  vox: null,
  inst(){ const i = INSTS.find(x => x.id === Settings.inst); return i && i.ready ? i.id : 'guitar'; },
  renderInst(){
    const cur = this.inst(), row = $('inst-row'); if (!row) return;
    row.innerHTML = INSTS.map(i => `<button type="button" class="inst i-${i.id}${i.id === cur ? ' on' : ''}" data-inst="${i.id}" ${i.ready ? '' : 'disabled'} aria-pressed="${i.id === cur}"><i aria-hidden="true"></i>${i.name}${i.ready ? '' : '<small>soon</small>'}</button>`).join('');
    row.querySelectorAll('[data-inst]').forEach(b => b.onclick = () => { if (Settings.inst === b.dataset.inst) return; Settings.inst = b.dataset.inst; saveSettings(); Sfx.open && Sfx.open(); this.renderSong(); });
    const g = cur === 'guitar';
    document.querySelectorAll('#scr-song .opts .gtr, #chord-list, #chord-h').forEach(e => { e.hidden = !g; });
    $('btn-practice').disabled = !g; $('btn-practice').classList.toggle('off', !g);
    $('btn-practice').querySelector('span').textContent = g ? 'Waits for you on every chord.' : 'Guitar only for now.';
    $('btn-stage').querySelector('span').textContent = g ? 'In time with the band, scored.' : cur === 'vocals' ? 'Sing with the band, scored.' : 'In time with the band, scored.';
    $('vox-setup').hidden = cur !== 'vocals';
    if (cur === 'vocals') this.loadVox();
    this.instInfo(cur);
  },
  // how each instrument is heard, and MIDI
  instInfo(cur){
    const box = $('inst-info'); if (!box) return;
    const txt = { bass: 'Play the bass line: roots, fifths and octaves built from the chords, shown as tab. The game hears your bass through the mic or an audio interface (any octave counts).',
      piano: 'Play the chords as the cards reach the line. Any octave and any inversion counts. Plug in a MIDI keyboard for the cleanest reading, or play into the mic.',
      drums: 'Play the band’s groove: kick, snare and hats. Use a MIDI e-kit, the keyboard (F kick, J snare, K hat), the pads on screen, or any drum into the mic (timing only).' }[cur];
    box.hidden = !txt; if (!txt) return;
    const midi = cur !== 'bass' ? (Midi.available() ? `<button class="btn btn-sm" type="button" id="btn-midi">${Midi.ok ? (Midi.name ? '🎹 MIDI: ' + esc(Midi.name) : '🎹 MIDI on: plug a device in') : '🎹 Connect MIDI'}</button>` : '<span class="small muted">This browser has no MIDI support.</span>') : '';
    box.innerHTML = `<div class="vox-card"><h3>${INST_NAMES[cur]}</h3><p class="small">${txt}</p><div class="row">${midi}<button class="btn btn-sm btn-teal" type="button" id="btn-cal-inst">👂 Train my ears</button><span class="small muted">Wear headphones: the band stays out of the mic.</span></div></div>`;
    $('btn-cal-inst').onclick = () => this.openCalib(cur);
    if ($('btn-midi')) $('btn-midi').onclick = async () => { await Midi.init(); this.instInfo(cur); };
  },
  midiChanged(){ if (this.screen === 'song') this.instInfo(this.inst()); },

  /* ---------- vocals: lyrics, timing, melody ---------- */
  voxFileKey(s){ return 'voxfile:' + s.id; },
  async loadVox(){
    const s = this.song, box = $('vox-setup'), tok = this._voxTok = {};
    this.vox = null;
    const saved = Store.get(this.voxFileKey(s), null);
    this.voxHtml({ state: 'loading' });
    let lyr;
    try { lyr = await Lyrics.fetch(s); }
    catch (e) { if (tok !== this._voxTok) return; this.voxHtml({ state: 'none', err: e && e.code === 'no_lyrics' ? 'No lyrics found online for this song.' : 'Couldn’t reach the lyrics service. Check your connection.' }); return; }
    if (tok !== this._voxTok || this.song !== s) return;
    const map = saved && saved.map ? { ...saved.map } : Lyrics.fitMap(lyr.lines, this.chart, lyr.dur || s.durationMs / 1000);
    map.nudge = lyr.nudge || 0;
    this.vox = { lines: lyr.lines, map, melody: saved && saved.melody || null, rec: lyr };
    this.voxHtml({ state: 'ok', lyr, saved });
  },
  voxHtml(o){
    const box = $('vox-setup'), s = this.song;
    const paste = `<details class="vox-paste"><summary>Paste your own lyrics</summary><textarea id="vox-text" rows="6" placeholder="Paste lyrics here. Timed lines like [01:02.35] Words… line up best."></textarea><button class="btn btn-sm" type="button" id="btn-vox-save">Use these lyrics</button></details>`;
    if (o.state === 'loading') { box.innerHTML = `<div class="vox-card"><h3>Lyrics</h3><p class="small">Looking up the lyrics…</p></div>`; return; }
    if (o.state === 'none') {
      box.innerHTML = `<div class="vox-card"><h3>Lyrics</h3><p>${esc(o.err)}</p>${paste}</div>`;
      this.bindVoxPaste(); return;
    }
    const L = o.lyr, v = this.vox, n = L.lines.length, nudge = v.map.nudge || 0;
    const timing = v.map.file ? 'lined up with your song file' : L.synced ? 'timed to the recording, lined up with the chart' : 'untimed, spread over the song';
    const mel = v.melody && v.melody.length ? `<b>Melody:</b> ${v.melody.length} notes from your song file.` : `<b>Melody:</b> chord guide (sing any note of the chord). Add the song file for the real melody.`;
    box.innerHTML = `<div class="vox-card">
      <h3>Lyrics <small>${n} lines · ${timing}${L.src === 'lrclib' ? ' · from <a href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a>' : ' · pasted'}</small></h3>
      <div class="vox-peek">${L.lines.slice(0, 4).map(l => `<span>${esc(l.text)}</span>`).join('')}${n > 4 ? '<span class="more">…</span>' : ''}</div>
      <p class="small">${mel}</p>
      <div class="row vox-acts">
        <label class="btn btn-sm vox-file">🎵 ${v.melody ? 'Use another song file' : 'Add the song file'}<input type="file" id="vox-file" accept="audio/*" hidden></label>
        <span class="vox-nudge" title="If the words come early or late, move them"><b>Words:</b><button class="btn btn-sm" type="button" data-nudge="-${this.chart.beats}">◀◀ bar</button><button class="btn btn-sm" type="button" data-nudge="-0.5">◀ ½</button><b id="vox-nudge-v">${nudge > 0 ? '+' : ''}${nudge} beats</b><button class="btn btn-sm" type="button" data-nudge="0.5">½ ▶</button><button class="btn btn-sm" type="button" data-nudge="${this.chart.beats}">bar ▶▶</button></span>
        <button class="btn btn-sm" type="button" id="btn-vox-reload">Look up again</button>
        <button class="btn btn-sm btn-teal" type="button" id="btn-cal-vox">👂 Train my ears</button>
      </div>
      <p class="small muted" id="vox-msg">Headphones help a lot: the game hears your voice, not the band.</p>
      ${paste}</div>`;
    this.bindVoxPaste();
    box.querySelectorAll('[data-nudge]').forEach(b => b.onclick = () => {
      const r = this.vox.rec; r.nudge = Math.max(-64, Math.min(64, (r.nudge || 0) + +b.dataset.nudge)); this.vox.map.nudge = r.nudge; Lyrics.save(s, r);
      $('vox-nudge-v').textContent = `${r.nudge > 0 ? '+' : ''}${r.nudge} beats`;
    });
    $('btn-cal-vox').onclick = () => this.openCalib('vocals');
    $('btn-vox-reload').onclick = () => { Lyrics.clear(s); Store.set(this.voxFileKey(s), null); this.loadVox(); };
    $('vox-file').onchange = async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const msg = $('vox-msg');
      try {
        const r = await Lyrics.analyzeFile(f, this.chart, this.vox.lines, t => { msg.textContent = t; });
        if (!r.map) msg.textContent = 'Couldn’t line that file up with the chart. Is it the same recording?';
        Store.set(this.voxFileKey(s), { map: r.map ? { pts: r.map.pts.filter((_, i) => i % 2 === 0 || i === r.map.pts.length - 1), spb: r.map.spb, file: true } : null, melody: r.melody.map(n => ({ t0: +n.t0.toFixed(3), t1: +n.t1.toFixed(3), m: n.m })) });
        Sfx.found && Sfx.found(); this.loadVox();
      } catch (err) { msg.textContent = 'Couldn’t read that file: ' + (err && err.message || err); }
    };
  },
  bindVoxPaste(){
    const b = $('btn-vox-save'); if (!b) return;
    b.onclick = () => { const t = $('vox-text').value; if (!t.trim()) return; Lyrics.fromText(this.song, t); this.loadVox(); };
  },
  // before a run: is the part ready to play?
  partReady(mode){
    const inst = (this.battleOpts && this.battleOpts.inst) || this.inst();
    if (mode !== 'stage' || Story.tier() || inst === 'guitar') return true;
    if (inst === 'vocals' && !(this.vox && this.vox.lines.length)) { alert('Vocals needs the lyrics first. Wait for them to load, or paste them in.'); return false; }
    return true;
  },
  // the panel under the stage: the guitar's fretboard, or the singer's lyrics
  partPanel(inst){
    const board = $('board'); if (!board) return;
    board.classList.toggle('vox', inst === 'vocals');
    const band = ['bass', 'piano', 'drums'].includes(inst);
    board.classList.toggle('band', band);
    $('band-panel').hidden = !band; $('band-panel').dataset.inst = inst || '';
    $('drum-pads').hidden = inst !== 'drums';
    this.bandBox = band ? { big: $('band-big'), sub: $('band-sub'), next: $('band-next'), pic: $('band-pic') } : null;
    if (this.bandBox) { this.bandBox.big.textContent = ''; this.bandBox.sub.textContent = ''; this.bandBox.next.textContent = ''; this.bandBox.pic.innerHTML = ''; }
    const p = $('vox-panel');
    p.hidden = inst !== 'vocals';
    this.voxBox = inst === 'vocals' ? { cur: $('vox-cur'), next: $('vox-next'), count: $('vox-count') } : null;
    if (this.voxBox) { this.voxBox.cur.textContent = ''; this.voxBox.next.textContent = ''; this.voxBox.count.textContent = ''; }
  },
});

// Drums: keyboard and pads
UI.drumPad = function(lane){ const b = lane && document.querySelector(`#drum-pads [data-lane="${lane}"]`); if (!b) return; b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); };
document.addEventListener('keydown', e => {
  if (UI.screen !== 'game' || !Parts.active || Parts.inst !== 'drums' || UI.openModal || e.repeat) return;
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)) return;
  const lane = DRUM_KEYS[e.key.toLowerCase()]; if (!lane) return;
  e.preventDefault(); e.stopPropagation();
  Parts.drumHit(lane, AudioEngine.now() - AudioEngine.outputLatency(), 'key');
}, true);
document.addEventListener('pointerdown', e => {
  const b = e.target.closest && e.target.closest('#drum-pads [data-lane]'); if (!b) return;
  e.preventDefault(); Parts.drumHit(b.dataset.lane, AudioEngine.now() - AudioEngine.outputLatency(), 'pad');
});
