/* =====================================================================
   Songs: library, validation, compile to a playable chart, song codes
   ===================================================================== */
const STYLES = ['rock','pop','ballad','halftime','funk','disco','shuffle','country','reggae','punk','hiphop','metal','folk','bossa','edm','waltz','none'];
const TIMES = ['4/4','3/4','2/4','6/8','12/8'];

const LIBRARY = [
  { id:'lib-down-valley', title:'Down in the Valley', artist:'Traditional', bpm:100, time:'3/4', style:'waltz', key:'G', level:1,
    note:'Only two chords. Great first song: switch between G and D on the first beat of the bar.',
    sections:[{name:'Verse 1',bars:['G','G','G','D','D','D','D','G','G','G','G','D','D','D','D','G']},
              {name:'Verse 2',bars:['G','G','G','D','D','D','D','G','G','G','G','D','D','D','D','G']}] },
  { id:'lib-drill-gcd', title:'Chord Drill: G, C, D', artist:'Warm-up', bpm:80, time:'4/4', style:'rock', key:'G', level:1, strum:'D.D.D.DU',
    note:'The three chords behind thousands of songs. Keep your ring finger planted between G and C.',
    sections:[{name:'Round 1',bars:['G','G','C','C','D','D','G','G']},{name:'Round 2',bars:['G','C','D','G','C','D','G','G']}] },
  { id:'lib-drill-minor', title:'Chord Drill: Em, Am, C, D', artist:'Warm-up', bpm:84, time:'4/4', style:'pop', key:'Em', level:1,
    note:'Em to Am is just a small shift. Move both fingers down one string together.',
    sections:[{name:'Round 1',bars:['Em','Em','Am','Am','C','C','D','D']},{name:'Round 2',bars:['Em','Am','C','D','Em','Am','C D','Em']}] },
  { id:'lib-saints', title:'When the Saints Go Marching In', artist:'Traditional', bpm:112, time:'4/4', feel:'swing', style:'shuffle', key:'G', level:1,
    sections:[{name:'Verse 1',bars:['G','G','G','G','G','G','D','D','G','G7','C','C','G','D','G','G']},
              {name:'Verse 2',bars:['G','G','G','G','G','G','D','D','G','G7','C','C','G','D','G','G']}] },
  { id:'lib-amazing-grace', title:'Amazing Grace', artist:'Traditional (John Newton)', bpm:84, time:'3/4', style:'waltz', key:'G', level:1,
    sections:[{name:'Verse 1',bars:['G','G','C','G','G','Em','D','D','G','G7','C','G','Em','D','G','G']},
              {name:'Verse 2',bars:['G','G','C','G','G','Em','D','D','G','G7','C','G','Em','D','G','G']}] },
  { id:'lib-happy-birthday', title:'Happy Birthday to You', artist:'Traditional', bpm:100, time:'3/4', style:'waltz', key:'G', level:1,
    sections:[{name:'Song',bars:['G','D7','D7','G','G7','C','G . D7','G']},{name:'Again',bars:['G','D7','D7','G','G7','C','G . D7','G']}] },
  { id:'lib-susanna', title:'Oh! Susanna', artist:'Stephen Foster', bpm:116, time:'4/4', style:'country', key:'C', level:1, strum:'D.DUD.DU',
    sections:[{name:'Verse',bars:['C','C','C','G7','C','C','C G7','C']},{name:'Chorus',bars:['F','F','C','G7','C','C','C G7','C']},
              {name:'Verse 2',bars:['C','C','C','G7','C','C','C G7','C']},{name:'Chorus 2',bars:['F','F','C','G7','C','C','C G7','C']}] },
  { id:'lib-jingle', title:'Jingle Bells', artist:'James Lord Pierpont', bpm:120, time:'4/4', style:'country', key:'G', level:2,
    sections:[{name:'Verse',bars:['G','G','G','C','C','D','D7','G','G','G','G','C','C','D','D7','G']},
              {name:'Chorus',bars:['G','G','G','G','C','G','A7','D7','G','G','G','G','C','G','D7','G']}] },
  { id:'lib-twinkle', title:'Twinkle, Twinkle, Little Star', artist:'Traditional', bpm:96, time:'4/4', style:'pop', key:'C', level:1,
    sections:[{name:'A',bars:['C','F C','F C','G C']},{name:'B',bars:['C F','C G','C F','C G']},{name:'A again',bars:['C','F C','F C','G C']}] },
  { id:'lib-auld', title:'Auld Lang Syne', artist:'Traditional (Robert Burns)', bpm:80, time:'4/4', style:'ballad', key:'G', level:2,
    sections:[{name:'Verse',bars:['G','D7','G','C','G','D7','Em C','D7 G']},{name:'Chorus',bars:['G','D7','G','C','G','D7','Em C','D7 G']}] },
  { id:'lib-greensleeves', title:'Greensleeves', artist:'Traditional', bpm:96, time:'3/4', style:'folk', key:'Am', level:2,
    sections:[{name:'Verse',bars:['Am','G','F','E','Am','G','F E','E','Am','G','F','E','Am','G','Am E','Am']},
              {name:'Chorus',bars:['C','G','Am','E','C','G','Am E','E','C','G','Am','E','C','G','Am E','Am']}] },
  { id:'lib-rising-sun', title:'House of the Rising Sun', artist:'Traditional', bpm:42, time:'6/8', style:'ballad', key:'Am', level:2,
    note:'Each chord gets one bar of a slow 6/8 sway: ONE two three FOUR five six.',
    sections:[{name:'Verse 1',bars:['Am','C','D','F','Am','C','E','E','Am','C','D','F','Am','E','Am','E']},
              {name:'Verse 2',bars:['Am','C','D','F','Am','C','E','E','Am','C','D','F','Am','E','Am','Am']}] },
  { id:'lib-wayfaring', title:'Wayfaring Stranger', artist:'Traditional', bpm:76, time:'4/4', style:'ballad', key:'Am', level:2,
    sections:[{name:'Verse',bars:['Am','Am','Dm','Am','Am','Am','E','E','Am','Am','Dm','Am','Am','E','Am','Am']},
              {name:'Chorus',bars:['F','F','C','C','F','F','E','E','Am','Am','Dm','Am','Am','E','Am','Am']}] },
  { id:'lib-scarborough', title:'Scarborough Fair', artist:'Traditional', bpm:104, time:'3/4', style:'folk', key:'Am', level:2,
    sections:[{name:'Verse',bars:['Am','Am','G','Am','C','D','Am','Am','Am','C','G','F','Am','G','Am','Am']},
              {name:'Verse 2',bars:['Am','Am','G','Am','C','D','Am','Am','Am','C','G','F','Am','G','Am','Am']}] },
  { id:'lib-sailor', title:'Drunken Sailor', artist:'Traditional sea shanty', bpm:126, time:'4/4', style:'rock', key:'Dm', level:2,
    sections:[{name:'Verse',bars:['Dm','Dm','C','C','Dm','Dm','C Am','Dm']},{name:'Chorus',bars:['Dm','Dm','C','C','Dm','Dm','C Am','Dm']},
              {name:'Verse 2',bars:['Dm','Dm','C','C','Dm','Dm','C Am','Dm']},{name:'Chorus 2',bars:['Dm','Dm','C','C','Dm','Dm','C Am','Dm']}] },
  { id:'lib-blues-a', title:'12-Bar Blues in A', artist:'Warm-up', bpm:92, time:'4/4', feel:'swing', style:'shuffle', key:'A', level:2,
    note:'The classic blues loop: four bars of A7, two of D7, two of A7, then E7, D7, A7, E7.',
    sections:[{name:'Chorus 1',bars:['A7','A7','A7','A7','D7','D7','A7','A7','E7','D7','A7','E7']},
              {name:'Chorus 2',bars:['A7','D7','A7','A7','D7','D7','A7','A7','E7','D7','A7','A7']}] },
  { id:'lib-drill-barre', title:'Chord Drill: F and Bm', artist:'Warm-up', bpm:72, time:'4/4', style:'ballad', key:'C', level:3,
    note:'Barre chords. Roll your index finger slightly onto its bony side, and keep your thumb behind the neck.',
    sections:[{name:'Round 1',bars:['C','C','F','F','G','G','C','C']},{name:'Round 2',bars:['D','D','Bm','Bm','G','G','A','A']}] },
];
LIBRARY.forEach(s => s.source = 'library');

function clampNum(v, lo, hi, d){ v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }
function cleanStr(v, max){ return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function slug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'song'; }

function parseTime(t){
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(t || '4/4').trim());
  const n = m ? +m[1] : 4, d = m ? +m[2] : 4;
  if (d === 8 && n % 3 === 0 && n >= 6) return { beats: n / 3, sub: 3, label: n + '/8' };
  if (d === 8) return { beats: Math.max(2, Math.round(n / 2)), sub: 2, label: n + '/8' };
  const b = Math.min(7, Math.max(2, n));
  return { beats: b, sub: 4, label: b + '/4' };
}

// Validate anything that came from Claude, a song code, or storage.
function validateSong(o, source){
  if (!o || typeof o !== 'object') throw new Error('That song data is empty.');
  const song = {};
  song.title = cleanStr(o.title, 80) || 'Untitled song';
  song.artist = cleanStr(o.artist, 60);
  song.time = TIMES.includes(String(o.time).trim()) ? String(o.time).trim() : '4/4';
  song.bpm = Math.round(clampNum(o.bpm, 40, 240, 100));
  song.feel = o.feel === 'swing' ? 'swing' : 'straight';
  song.style = STYLES.includes(o.style) ? o.style : 'rock';
  song.capo = Math.round(clampNum(o.capo, 0, 9, 0));
  song.key = cleanStr(o.key, 8);
  song.strum = /^[DUdu.\-x ]{2,16}$/.test(o.strum || '') ? String(o.strum).toUpperCase().replace(/[-X ]/g, '.') : '';
  song.note = cleanStr(o.note, 220);
  song.level = Math.round(clampNum(o.level, 1, 3, 0)) || 0;
  const T = parseTime(song.time), steps = T.beats * T.sub;
  if (o.drums && typeof o.drums === 'object') {
    const d = {};
    for (const k of ['kick','snare','hat']) {
      const v = String(o.drums[k] || '').replace(/\s|\|/g, '');
      if (/^[xXg.\-o]+$/.test(v) && v.length === steps) d[k] = v.replace(/-/g, '.');
    }
    song.drums = (d.kick || d.snare) ? { kick: d.kick || '.'.repeat(steps), snare: d.snare || '.'.repeat(steps), hat: d.hat || '.'.repeat(steps) } : null;
  } else song.drums = null;
  const secs = Array.isArray(o.sections) ? o.sections.slice(0, 40) : [];
  let total = 0;
  song.sections = [];
  for (const s of secs) {
    if (!s || !Array.isArray(s.bars)) continue;
    const bars = [];
    for (const b of s.bars) {
      for (const piece of String(b == null ? '' : b).split('|')) {
        const t = cleanStr(piece, 48);
        if (t && total < 240) { bars.push(t); total++; }
      }
    }
    if (bars.length) song.sections.push({ name: cleanStr(s.name, 24) || 'Part ' + (song.sections.length + 1), bars });
  }
  if (!song.sections.length) throw new Error('No chords were found in that song.');
  // at least one real chord
  const any = song.sections.some(s => s.bars.some(b => b.split(/\s+/).some(t => parseChord(t))));
  if (!any) throw new Error('None of the chord names could be read.');
  song.source = source || o.source || 'code';
  song.id = (o.id && /^[a-z0-9-]{1,80}$/.test(o.id)) ? o.id : (song.source === 'library' ? 'lib-' : 'my-') + slug(song.title + '-' + song.artist);
  return song;
}

/* ---- compile a song into a timeline of chord events ---- */
function compileSong(song, opts){
  const easy = !!(opts && opts.easy);
  const T = parseTime(song.time);
  const beats = T.beats;
  const raw = []; // {tok, beat, len, sec, bar}
  let bar = 0;
  const sections = [];
  song.sections.forEach((s, si) => {
    sections.push({ name: s.name, startBar: bar, bars: s.bars.length, startBeat: bar * beats });
    for (const b of s.bars) {
      const toks = b.split(/\s+/).filter(Boolean);
      const n = toks.length;
      let lens;
      if (!n) lens = [];
      else if (n === beats) lens = toks.map(() => 1);
      else if (beats % n === 0 || n > beats) lens = toks.map(() => beats / n);
      else { const base = Math.floor(beats / n), r = beats - base * n; lens = toks.map((_, i) => base + (i < r ? 1 : 0)); }
      let pos = bar * beats;
      if (!n) raw.push({ tok: '.', beat: pos, len: beats, sec: si, bar });
      toks.forEach((t, i) => { raw.push({ tok: t, beat: pos, len: lens[i], sec: si, bar }); pos += lens[i]; });
      bar++;
    }
  });
  const totalBars = bar, totalBeats = bar * beats;

  // resolve tokens -> chords, merge holds and repeats (not across sections)
  const evs = [];
  for (const r of raw) {
    const hold = /^[.\-\/%]+$/.test(r.tok);
    const nc = /^(N\.?C\.?|rest)$/i.test(r.tok);
    const ch = (hold || nc) ? null : parseChord(r.tok);
    const last = evs[evs.length - 1];
    if ((hold || (!nc && !ch)) && last && last.sec === r.sec) { last.len += r.len; continue; }
    if (ch && last && last.sec === r.sec && last.ch && last.name === ch.name) { last.len += r.len; continue; }
    if (nc && last && last.rest && last.sec === r.sec) { last.len += r.len; continue; }
    if (hold || (!nc && !ch)) {
      // hold at the start of a section: continue the previous section's chord as a new event
      const prev = evs[evs.length - 1];
      if (prev && prev.ch) evs.push({ ch: prev.ch, name: prev.name, beat: r.beat, len: r.len, sec: r.sec, bar: r.bar });
      else evs.push({ rest: true, beat: r.beat, len: r.len, sec: r.sec, bar: r.bar });
      continue;
    }
    if (nc) { evs.push({ rest: true, beat: r.beat, len: r.len, sec: r.sec, bar: r.bar }); continue; }
    evs.push({ ch, name: ch.name, beat: r.beat, len: r.len, sec: r.sec, bar: r.bar });
  }

  // capo choice
  const c0 = song.capo || 0;
  const uniq = new Map();
  evs.forEach(e => { if (e.ch) { const u = uniq.get(e.name) || { ch: e.ch, count: 0 }; u.count++; uniq.set(e.name, u); } });
  let capo = c0, shift = 0;
  if (easy) {
    let best = Infinity;
    for (let c = 0; c <= 7; c++) {
      const sh = c0 - c;
      let cost = c * 0.3 + (c === c0 ? -1.2 : 0);
      for (const u of uniq.values()) { const d = chordDifficulty(sh ? transposeChord(u.ch, sh) : u.ch, true); cost += d * (1 + Math.min(u.count, 8) * 0.08); }
      if (cost < best - 0.01) { best = cost; capo = c; shift = sh; }
    }
  }
  const useFlats = [...uniq.values()].some(u => u.ch.flat);
  const shapeOf = ch => {
    if (!shift) return ch;
    const t = transposeChord(ch, shift);
    return { ...t, flat: useFlats, name: chordLabel(t.root, t.quality, t.bass, useFlats) };
  };
  const events = [];
  for (const e of evs) {
    if (!e.ch) { events.push({ ...e, rest: true }); continue; }
    const shape = shapeOf(e.ch);
    const v = voicingFor(shape, easy);
    events.push({ ...e, shape, label: v.simplified || shape.name, full: shape.name, sounds: chordLabel(mod12(e.ch.root + c0), e.ch.quality, e.ch.bass == null ? null : mod12(e.ch.bass + c0), e.ch.flat || useFlats),
      v, notes: soundingNotes(v, capo) });
  }
  const unique = [];
  const seen = new Set();
  for (const e of events) if (!e.rest && !seen.has(e.label)) { seen.add(e.label); unique.push({ label: e.label, v: e.v, sounds: e.sounds, count: events.filter(x => x.label === e.label).length }); }
  return { song, easy, beats, sub: T.sub, timeLabel: T.label, stepsPerBar: beats * T.sub, bpm: song.bpm, swing: song.feel === 'swing',
    capo, shift, capoChanged: capo !== c0, events, sections, totalBars, totalBeats, unique };
}

/* ---- song codes ---- */
function songToCode(song){
  const o = { title: song.title, artist: song.artist, bpm: song.bpm, time: song.time, feel: song.feel, style: song.style, capo: song.capo,
    key: song.key, strum: song.strum, note: song.note, drums: song.drums, sections: song.sections };
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return 'SJ1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function songFromCode(code){
  const m = /SJ1\.([A-Za-z0-9_\-]+)/.exec(String(code).replace(/\s+/g, ''));
  if (!m) throw new Error('That doesn’t look like a Strum Jam song code. Codes start with SJ1.');
  let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  let json;
  try { const bin = atob(b64); json = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); }
  catch (e) { throw new Error('The song code is incomplete. Copy the whole thing and try again.'); }
  let o; try { o = JSON.parse(json); } catch (e) { throw new Error('The song code is incomplete. Copy the whole thing and try again.'); }
  return validateSong(o, 'code');
}

/* ---- the prompt used to chart any song ---- */
function chartPrompt(query){
  return `You are the chart writer for "Strum Jam", a game that teaches people to play songs on guitar. The player searched for: "${query.replace(/"/g, "'").slice(0, 120)}".

Work out which song they most likely mean (the best-known recording) and write a guitar CHORD CHART for it as JSON only, in exactly this shape:
{"found":true,"title":"Song Title","artist":"Artist","bpm":96,"time":"4/4","feel":"straight","style":"pop","capo":0,"key":"G","strum":"D.DU.UDU","drums":{"kick":"x.......x.x.....","snare":"....x.......x...","hat":"x.x.x.x.x.x.x.x."},"note":"One short playing tip.","sections":[{"name":"Intro","bars":["G","G","D","D"]},{"name":"Verse 1","bars":["Em","C","G","D"]}]}

Rules:
- NO LYRICS anywhere: not in section names, notes, or anywhere else. Section names are generic: Intro, Verse 1, Pre-Chorus, Chorus, Bridge, Solo, Outro.
- Chords are the shapes guitarists commonly play for this song (like a popular chord chart). "capo" is the capo fret for those shapes, 0 if none.
- Each string in "bars" is ONE bar. Write one chord for the whole bar, or several chords separated by spaces to split the bar evenly, or one token per beat with "." to hold (e.g. "G . C ." in 4/4). Use "N.C." for a bar with no chord.
- "time" is one of 4/4, 3/4, 2/4, 6/8, 12/8. "bpm" is the real tempo: quarter-note beats for x/4, dotted-quarter beats for 6/8 and 12/8.
- "feel" is "straight" or "swing". "style" is one of: ${STYLES.join(', ')} ("none" if the recording has no drums).
- "drums" is a simplified one-bar groove that resembles the recording's real drum beat: characters x (hit), X (accent), g (ghost), . (rest). Each string is exactly 16 steps for 4/4, 12 for 3/4, 8 for 2/4, 6 for 6/8, 12 for 12/8. Use null if the song has no drums.
- "strum" is a common strumming pattern for one beat group, like "D.DU.UDU".
- Keep the song's real structure in order, with repeats written out, up to about 120 bars in total.
- If you can't identify the song, reply {"found":false,"suggestions":["Song – Artist","Song – Artist"]}.
Reply with the JSON only.`;
}

/* ---- paste a chord sheet from any site: keep chords + section labels, drop the words ---- */
const SECTION_RE = /^(intro|verse|pre[\s-]?chorus|chorus|post[\s-]?chorus|bridge|solo|guitar solo|interlude|instrumental|outro|coda|refrain|hook|breakdown|riff|ending|tag|middle 8|break|pre)\b\s*(\d+)?/i;
const CHORD_TOKEN_RE = /^[A-G][#b♯♭]?(?:maj|min|dim|aug|sus|add|m|M|Δ|ø|°|\+|-|\d|b|#|\(|\))*(?:\/[A-G][#b♯♭]?)?$/;
const FILLER_RE = /^(\||\|\||\|:|:\||-+|\/|%|\.{2,}|N\.?C\.?|\(|\)|→|->|\*)$/i;
const REPEAT_RE = /^\(?(?:x\s*(\d+)|(\d+)\s*x)\)?$/i;
function isChordTok(t){ const s = t.replace(/^\(|\)$/g, ''); return CHORD_TOKEN_RE.test(s) && !!parseChord(s); }
function titleCaseSection(m){
  const word = m[1].toLowerCase().replace(/\s+/g, ' ').replace('pre chorus', 'pre-chorus').replace('post chorus', 'post-chorus');
  const nice = word === 'pre' ? 'Pre-Chorus' : word.replace(/(^|[\s-])\w/g, x => x.toUpperCase());
  return nice + (m[2] ? ' ' + m[2] : '');
}
function parseChordSheet(text, opts){
  opts = opts || {};
  const perBar = opts.perBar || 1;
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const out = { title: '', artist: '', capo: 0, bpm: 0, time: '', tuning: '', sections: [] };
  let cur = null, part = 0;
  const named = new Map();
  const newSection = name => { cur = { name, bars: [] }; out.sections.push(cur); };
  const addBars = (bars, times) => { if (!cur) newSection('Intro'); for (let r = 0; r < (times || 1); r++) cur.bars.push(...bars); };
  for (let raw of lines) {
    let line = raw.replace(/\t/g, '    ').trim();
    if (!line) continue;
    // ChordPro directives
    const dir = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(line);
    if (dir) {
      const k = dir[1].toLowerCase(), v = dir[2] || '';
      if (k === 'title' || k === 't') out.title = cleanStr(v, 80);
      else if (k === 'artist' || k === 'subtitle' || k === 'st') out.artist = cleanStr(v, 60);
      else if (k === 'capo') out.capo = parseInt(v, 10) || 0;
      else if (k === 'tempo') out.bpm = parseInt(v, 10) || 0;
      else if (k === 'time') out.time = v.trim();
      else if (/^(soc|start_of_chorus)$/.test(k)) newSection('Chorus');
      else if (/^(sov|start_of_verse)$/.test(k)) newSection('Verse');
      else if (/^(sob|start_of_bridge)$/.test(k)) newSection('Bridge');
      else if (k === 'c' || k === 'comment' || k === 'ci') { const m = SECTION_RE.exec(v.trim()); if (m) newSection(titleCaseSection(m)); }
      continue;
    }
    const capo = /\bcapo\b[^0-9]{0,12}(\d{1,2})/i.exec(line) || /\b(\d{1,2})(?:st|nd|rd|th)\s+fret\b.*\bcapo\b/i.exec(line);
    if (capo && line.length < 60) { out.capo = Math.min(9, parseInt(capo[1], 10) || 0); continue; }
    if (/\bno capo\b/i.test(line)) { out.capo = 0; continue; }
    const tempo = /\b(?:tempo|bpm)\b[^0-9]{0,6}(\d{2,3})|\b(\d{2,3})\s*bpm\b/i.exec(line);
    if (tempo && line.length < 40) { out.bpm = parseInt(tempo[1] || tempo[2], 10); continue; }
    if (/^tuning\b/i.test(line)) { out.tuning = line.slice(0, 60); continue; }
    if (/^[eBGDAE]\s*[|:]?-/.test(line) || /-{4,}/.test(line)) continue;               // tab staff lines
    // section headers: [Verse 1], Chorus:, (Bridge)
    const hdr = /^[\[(]?\s*([^\])]{1,30}?)\s*[\])]?\s*:?\s*$/.exec(line);
    if (hdr && (/^\[.*\]$/.test(line) || /:$/.test(line) || SECTION_RE.test(hdr[1]))) {
      const inner = hdr[1].trim();
      const toks = inner.split(/\s+/);
      if (!toks.every(isChordTok)) {
        const m = SECTION_RE.exec(inner);
        const name = m ? titleCaseSection(m) : 'Part ' + (++part);
        // header with no chords under it later: reuse an earlier section's chords
        newSection(name);
        continue;
      }
    }
    // inline ChordPro: words with [G]chords
    if (/\[[A-G][^\]]{0,10}\]/.test(line)) {
      const chords = [...line.matchAll(/\[([^\]]{1,12})\]/g)].map(m => m[1].trim()).filter(isChordTok);
      if (chords.length) { addBars(groupBars(chords, perBar)); continue; }
    }
    // chord-only line?
    let toks = line.split(/\s+/).filter(Boolean);
    let times = 1;
    const last = toks[toks.length - 1];
    const rep = last && REPEAT_RE.exec(last);
    if (rep) { times = Math.min(8, parseInt(rep[1] || rep[2], 10) || 1); toks = toks.slice(0, -1); }
    const hasBarLines = /\|/.test(line);
    const core = toks.map(t => t.replace(/^\|+|\|+$/g, '')).filter(t => t && !FILLER_RE.test(t));
    if (!core.length || !core.every(isChordTok)) continue;                      // a line of words: ignored
    if (hasBarLines) {
      const bars = line.replace(REPEAT_RE, '').split('|').map(b => b.trim().split(/\s+/).filter(t => t && isChordTok(t)).map(t => t.replace(/^\(|\)$/g, '')).join(' ')).filter(Boolean);
      addBars(bars, times);
    } else addBars(groupBars(core.map(t => t.replace(/^\(|\)$/g, '')), perBar), times);
  }
  // fill empty sections from earlier ones with the same name, drop the rest
  for (const s of out.sections) {
    const base = s.name.replace(/\s+\d+$/, '');
    if (s.bars.length) { if (!named.has(base)) named.set(base, s.bars.slice()); }
    else if (named.has(base)) s.bars = named.get(base).slice();
  }
  out.sections = out.sections.filter(s => s.bars.length);
  // number repeated section names: Verse, Verse -> Verse 1, Verse 2
  const counts = {};
  out.sections.forEach(s => { counts[s.name] = (counts[s.name] || 0) + 1; });
  const seen = {};
  out.sections.forEach(s => { if (counts[s.name] > 1 && !/\d$/.test(s.name)) { seen[s.name] = (seen[s.name] || 0) + 1; s.name = s.name + ' ' + seen[s.name]; } });
  return out;
}
function groupBars(chords, perBar){
  const bars = [];
  for (let i = 0; i < chords.length; i += perBar) bars.push(chords.slice(i, i + perBar).join(' '));
  return bars;
}
function grooveFillPrompt(title, artist){
  return `For the recording "${String(title).replace(/"/g, "'").slice(0, 80)}" by "${String(artist).replace(/"/g, "'").slice(0, 60)}", reply with JSON only describing its tempo and drum groove (no lyrics):
{"bpm":96,"time":"4/4","feel":"straight","style":"pop","strum":"D.DU.UDU","drums":{"kick":"x.......x.x.....","snare":"....x.......x...","hat":"x.x.x.x.x.x.x.x."}}
"time" is 4/4, 3/4, 2/4, 6/8 or 12/8; bpm is quarter-note beats for x/4 and dotted-quarter beats for 6/8 and 12/8. "style" is one of: ${STYLES.join(', ')}. Drum strings use x, X, g and . with exactly 16 steps for 4/4, 12 for 3/4, 8 for 2/4, 6 for 6/8, 12 for 12/8; use null for "drums" if the recording has no drums. If you don't know the song, give your best guess for its genre.`;
}
