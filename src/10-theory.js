"use strict";
/* =====================================================================
   Strum Jam — music theory + chord voicings
   ===================================================================== */
const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const LETTER_PC = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const OPEN_MIDI = [40,45,50,55,59,64];           // low E .. high e (string index 0..5)
const STRING_NAMES = ['E','A','D','G','B','e'];
const mod12 = n => ((n % 12) + 12) % 12;
const midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);
const hzToMidi = f => 69 + 12 * Math.log2(f / 440);
function noteName(pc, flat){ return (flat ? FLATS : SHARPS)[mod12(pc)]; }
function midiName(m, flat){ return noteName(m, flat) + (Math.floor(m / 12) - 1); }

function parsePc(s){
  const m = /^([A-Ga-g])([#b♯♭]*)/.exec(s || '');
  if (!m) return null;
  let pc = LETTER_PC[m[1].toUpperCase()];
  for (const ch of m[2]) pc += (ch === '#' || ch === '♯') ? 1 : -1;
  return { pc: mod12(pc), len: m[0].length, flat: /[b♭]/.test(m[2]) };
}

// quality -> intervals (semitones above root)
const QUALITIES = {
  '':[0,4,7], 'm':[0,3,7], '5':[0,7], '7':[0,4,7,10], 'maj7':[0,4,7,11], 'm7':[0,3,7,10],
  'mmaj7':[0,3,7,11], '6':[0,4,7,9], 'm6':[0,3,7,9], '9':[0,4,7,10,2], 'maj9':[0,4,7,11,2],
  'm9':[0,3,7,10,2], 'add9':[0,4,7,2], 'madd9':[0,3,7,2], '69':[0,4,7,9,2], 'sus2':[0,2,7],
  'sus4':[0,5,7], '7sus4':[0,5,7,10], 'dim':[0,3,6], 'dim7':[0,3,6,9], 'm7b5':[0,3,6,10],
  'aug':[0,4,8], '7#9':[0,4,7,10,3], '7b9':[0,4,7,10,1], '7#5':[0,4,8,10], '11':[0,5,7,10,2],
  '13':[0,4,7,10,9], 'm11':[0,3,7,10,5]
};
// used when simplifying a chord (easy mode, or no voicing found)
const SIMPLER = { 'maj9':'maj7','9':'7','13':'7','11':'7sus4','m11':'m7','m9':'m7','7#9':'7','7b9':'7','7#5':'aug',
  '69':'6','add9':'','madd9':'m','mmaj7':'m','m6':'m','6':'','maj7':'','m7':'m','7':'','7sus4':'sus4','sus2':'','sus4':'',
  'dim7':'dim','m7b5':'m','aug':'','dim':'m','5':'' };

function normalizeQuality(q){
  let s = (q || '').replace(/[()\s]/g, '').replace(/♭/g,'b').replace(/♯/g,'#');
  const map = [
    [/^(maj|M|Δ)$/, ''], [/^(min|mi|-)$/, 'm'],
    [/^(maj7|M7|Δ7|Δ|ma7|j7)$/, 'maj7'], [/^(maj9|M9|Δ9)$/, 'maj9'],
    [/^(m7|min7|mi7|-7)$/, 'm7'], [/^(m9|min9|-9)$/, 'm9'], [/^(m11|min11)$/, 'm11'],
    [/^(mmaj7|mM7|m\(maj7\)|minmaj7|m\+7|-Δ7)$/, 'mmaj7'],
    [/^(m7b5|m7-5|ø|ø7|min7b5)$/, 'm7b5'], [/^(dim|°|o)$/, 'dim'], [/^(dim7|°7|o7)$/, 'dim7'],
    [/^(aug|\+|\+5|#5)$/, 'aug'], [/^(7#5|aug7|\+7|7\+)$/, '7#5'],
    [/^(sus|sus4|4)$/, 'sus4'], [/^(sus2|2)$/, 'sus2'], [/^(7sus|7sus4|7sus2)$/, '7sus4'],
    [/^(add9|add2|2add)$/, 'add9'], [/^(madd9|madd2|m\(add9\)|minadd9)$/, 'madd9'],
    [/^(6\/9|69|6add9)$/, '69'], [/^(min6|-6)$/, 'm6'], [/^(maj6|M6)$/, '6'],
    [/^(7b9|7-9)$/, '7b9'], [/^(7#9|7\+9)$/, '7#9'], [/^(dom7|7)$/, '7'], [/^(power|5|no3)$/, '5'],
  ];
  for (const [re, v] of map) if (re.test(s)) return v;
  if (QUALITIES[s] !== undefined) return s;
  // unknown suffix: fall back sensibly
  if (/^m(?!aj)/.test(s)) return /7/.test(s) ? 'm7' : 'm';
  if (/maj7|M7/.test(s)) return 'maj7';
  if (/sus/.test(s)) return 'sus4';
  if (/13|11|9|7/.test(s)) return '7';
  return '';
}

const chordCache = new Map();
function parseChord(raw){
  if (raw == null) return null;
  const key = String(raw);
  if (chordCache.has(key)) return chordCache.get(key);
  let s = key.trim().replace(/\s+/g, '');
  let out = null;
  if (/^(N\.?C\.?|x|rest|%)$/i.test(s)) out = null;
  else {
    let bass = null;
    const sl = s.indexOf('/');
    if (sl > 0) { const b = parsePc(s.slice(sl + 1)); if (b) bass = b.pc; s = s.slice(0, sl); }
    const r = parsePc(s);
    if (r) {
      const quality = normalizeQuality(s.slice(r.len));
      out = { root: r.pc, quality, bass: (bass === r.pc ? null : bass), flat: r.flat, name: key.trim() };
    }
  }
  chordCache.set(key, out);
  return out;
}
function chordLabel(root, quality, bass, flat){
  const q = { '':'', 'm':'m', 'mmaj7':'m(maj7)', '69':'6/9', 'm7b5':'m7♭5', '7#9':'7♯9', '7b9':'7♭9', '7#5':'7♯5' }[quality];
  return noteName(root, flat) + (q !== undefined ? q : quality) + (bass != null ? '/' + noteName(bass, flat) : '');
}
function chordPcs(ch){
  const iv = QUALITIES[ch.quality] || QUALITIES[''];
  const pcs = iv.map(i => mod12(ch.root + i));
  if (ch.bass != null && !pcs.includes(ch.bass)) pcs.push(ch.bass);
  return pcs;
}
function transposeChord(ch, semis){
  return { ...ch, root: mod12(ch.root + semis), bass: ch.bass == null ? null : mod12(ch.bass + semis),
    name: chordLabel(mod12(ch.root + semis), ch.quality, ch.bass == null ? null : mod12(ch.bass + semis), ch.flat) };
}

/* ---------------- voicing tables ----------------
   'frets|fingers' low E -> high e. frets: x = muted, digits (or (10) style not needed).
   fingers: 0 none, 1-4, T thumb.                                                        */
const OPEN_SHAPES = {
  'C':'x32010|032010','C7':'x32310|032410','Cmaj7':'x32000|032000','Cadd9':'x32030|021030','Csus2':'x30013|030014',
  'Csus4':'x33011|034011','C6':'x32210|042310','C/G':'332010|432010','C/B':'x22010|023010','C/E':'032010|032010',
  'D':'xx0232|000132','Dm':'xx0231|000231','D7':'xx0212|000213','Dmaj7':'xx0222|000123','Dm7':'xx0211|000211',
  'Dsus2':'xx0230|000130','Dsus4':'xx0233|000134','D6':'xx0202|000102','D5':'xx023x|000130','D/F#':'200232|T00132',
  'D/A':'x00232|000132',
  'E':'022100|023100','Em':'022000|023000','E7':'020100|020100','Em7':'020000|020000','Emaj7':'021100|031200',
  'Esus4':'022200|023400','E5':'022xxx|012000','E9':'020102|020103','Esus2':'024400|013400','E7sus4':'020200|020300',
  'Em9':'020002|020003','Em6':'022020|023040','Eadd9':'024100|024100',
  'F':'133211|134211','Fmaj7':'xx3210|003210','Fsus2':'xx3011|003011','F/C':'x33211|034211','Fmaj7/C':'x33210|034210',
  'Fadd9':'xx3213|003214','F6':'xx3231|003241',
  'G':'320003|210003','G7':'320001|320001','Gmaj7':'320002|320001','G6':'320000|210000','Gsus4':'3x0013|300014',
  'G/B':'x20003|010003','G5':'355xxx|134000','Gadd9':'300203|200104','G/F#':'2x0003|100003',
  'A':'x02220|001230','Am':'x02210|002310','A7':'x02020|002030','Am7':'x02010|002010','Amaj7':'x02120|002130',
  'Asus2':'x02200|001200','Asus4':'x02230|001230','A7sus4':'x02030|002030','A5':'x022xx|001200','A6':'x02222|001111',
  'Aadd9':'x02420|001420','Am/G':'3x2210|402310','A/E':'002220|001230','A/C#':'x42220|041230','Am6':'x02212|002314',
  'Am9':'x02413|002413','Am/E':'002210|002310','Am/C':'x32210|042310',
  'B7':'x21202|021304','Bm7':'x20202|010203','Bsus4':'x24452|012341',
  'Em/B':'x22000|023000','E/G#':'4x2100|402100','C/D':'xx0010|000010',
  'F/A':'x03211|003211','Em/D':'xx0000|000000','E/D':'xx0100|000100','G/A':'x00003|000003','A/B':'x22220|011110',
};
// easier replacements used by "Easy + capo"
const EASY_SHAPES = {
  'F':'xx3211|003211','Bm':'xx4432|003421','B':'xx4442|002341','F#m':'xx4222|003111','Bb':'xx3331|002341',
  'F#':'xx4322|004311','Gm':'xx0333|000234','Fm':'xx3111|003111','Bm7':'x20202|010203','C#m':'xx2120|002130',
  'Cm':'xx1013|002014','Dm':'xx0231|000231','Ebm':'xx1342|001342','Eb':'xx1343|001243',
  'Db':'xx3121|004121','F#m7':'xx2222|001111','C#m7':'xx2424|001314','Bbm':'xx3321|003421'
};
// Movable barre shapes: offsets from root fret (null = muted) + fingers
const E_SHAPES = { // root on low E string
  '':[[0,2,2,1,0,0],[1,3,4,2,1,1]], 'm':[[0,2,2,0,0,0],[1,3,4,1,1,1]], '7':[[0,2,0,1,0,0],[1,3,1,2,1,1]],
  'm7':[[0,2,0,0,0,0],[1,3,1,1,1,1]], 'maj7':[[0,null,1,1,0,null],[1,0,3,4,2,0]], 'sus4':[[0,2,2,2,0,0],[1,2,3,4,1,1]],
  '7sus4':[[0,2,0,2,0,0],[1,3,1,4,1,1]], '5':[[0,2,2,null,null,null],[1,3,4,0,0,0]], 'm6':[[0,null,-1,0,0,null],[2,0,1,3,4,0]],
  '6':[[0,null,-1,1,0,null],[2,0,1,4,3,0]], 'm7b5':[[0,null,0,0,-1,null],[2,0,3,4,1,0]], 'mmaj7':[[0,2,1,0,0,0],[1,4,2,1,1,1]], 'dim7':[[0,null,-1,0,-1,null],[2,0,1,3,1,0]]
};
const A_SHAPES = { // root on A string
  '':[[null,0,2,2,2,0],[0,1,2,3,4,1]], 'm':[[null,0,2,2,1,0],[0,1,3,4,2,1]], '7':[[null,0,2,0,2,0],[0,1,3,1,4,1]],
  'm7':[[null,0,2,0,1,0],[0,1,3,1,2,1]], 'maj7':[[null,0,2,1,2,0],[0,1,3,2,4,1]], 'sus2':[[null,0,2,2,0,0],[0,1,3,4,1,1]],
  'sus4':[[null,0,2,2,3,0],[0,1,2,3,4,1]], '7sus4':[[null,0,2,0,3,0],[0,1,3,1,4,1]], '5':[[null,0,2,2,null,null],[0,1,3,4,0,0]],
  'dim':[[null,0,1,2,1,null],[0,1,2,4,3,0]], 'm7b5':[[null,0,1,0,1,null],[0,1,3,2,4,0]], 'dim7':[[null,0,1,-1,1,null],[0,2,3,1,4,0]],
  'aug':[[null,0,3,2,2,null],[0,1,4,2,3,0]], '6':[[null,0,2,2,2,2],[0,1,3,3,3,3]], '9':[[null,0,-1,0,0,0],[0,2,1,3,3,3]],
  'm9':[[null,0,-2,0,0,0],[0,2,1,3,3,3]], '7#9':[[null,0,-1,0,1,null],[0,2,1,3,4,0]], 'add9':[[null,0,2,4,2,0],[0,1,2,4,3,1]],
  'mmaj7':[[null,0,2,1,1,0],[0,1,4,2,3,1]], 'm6':[[null,0,2,-1,1,null],[0,2,4,1,3,0]]
};

function shapeFromString(str){
  const [f, g] = str.split('|');
  const frets = [...f].map(c => c === 'x' ? -1 : parseInt(c, 36));
  const fingers = [...g].map(c => c === 'T' ? 5 : (parseInt(c, 10) || 0));
  return finishVoicing(frets, fingers);
}
function finishVoicing(frets, fingers){
  fingers = fingers.map((f, i) => frets[i] > 0 ? f : 0);
  // barre = same finger on 2+ strings at the same fret
  let barre = null;
  for (let fi = 1; fi <= 4; fi++) {
    const idx = []; let fr = null;
    frets.forEach((x, i) => { if (fingers[i] === fi && x > 0) { idx.push(i); fr = x; } });
    if (idx.length >= 2 && idx.every(i => frets[i] === fr)) {
      const b = { fret: fr, from: Math.min(...idx), to: Math.max(...idx), finger: fi };
      if (!barre || fi === 1) barre = b;
    }
  }
  const fretted = frets.filter(x => x > 0);
  const played = frets.filter(x => x >= 0).length;
  const minF = fretted.length ? Math.min(...fretted) : 0, maxF = fretted.length ? Math.max(...fretted) : 0;
  let diff = 0;
  if (barre && barre.to - barre.from >= 2) diff += 3; else if (barre) diff += 1;
  diff += Math.max(0, minF - 3) * 0.4 + Math.max(0, maxF - minF - 2) * 0.8 + fretted.length * 0.25 + (6 - played) * 0.1;
  if (fingers.includes(5)) diff += 1.2;
  return { frets, fingers, barre, minF, maxF, diff };
}
function movable(table, rootString, ch){
  const sh = table[ch.quality]; if (!sh) return null;
  let r = mod12(ch.root - OPEN_MIDI[rootString]);
  const minOff = Math.min(...sh[0].filter(v => v != null));
  if (r + minOff < 1) r += 12;
  if (r > 12) return null;
  const frets = sh[0].map(v => v == null ? -1 : r + v);
  if (frets.some(x => x > 15)) return null;
  return finishVoicing(frets, sh[1].slice());
}

/* ---- generic search for anything the tables don't cover ---- */
function searchVoicing(ch){
  const pcs = chordPcs(ch);
  const iv = QUALITIES[ch.quality] || [0,4,7];
  const required = pcs.filter(pc => !(iv.length >= 4 && pc === mod12(ch.root + 7) && pc !== ch.bass));
  const bassPc = ch.bass != null ? ch.bass : ch.root;
  let best = null;
  for (let pos = 0; pos <= 10; pos++) {
    const lo = pos === 0 ? 1 : pos, hi = pos === 0 ? 3 : pos + 3;
    const opts = OPEN_MIDI.map(o => {
      const a = [-1];
      if (pos <= 4 && pcs.includes(mod12(o))) a.push(0);
      for (let f = lo; f <= hi; f++) if (pcs.includes(mod12(o + f))) a.push(f);
      return a;
    });
    const cur = [0,0,0,0,0,0];
    const rec = i => {
      if (i === 6) { const c = evalCandidate(cur, required, bassPc, pos); if (c && (!best || c.score < best.score)) best = c; return; }
      for (const f of opts[i]) { cur[i] = f; rec(i + 1); }
    };
    rec(0);
  }
  return best ? best.v : null;
}
function evalCandidate(fr, required, bassPc, pos){
  const played = []; for (let i = 0; i < 6; i++) if (fr[i] >= 0) played.push(i);
  if (played.length < 4) return null;
  const first = played[0];
  for (let i = first; i < 6; i++) if (fr[i] < 0 && i !== 5 && !(i === 1 && first === 0)) return null; // mutes: low strings, top e, or A under a low-E root
  if (mod12(OPEN_MIDI[first] + fr[first]) !== bassPc) return null;
  const have = new Set(played.map(i => mod12(OPEN_MIDI[i] + fr[i])));
  for (const pc of required) if (!have.has(pc)) return null;
  const fretted = played.filter(i => fr[i] > 0);
  let fingersNeeded = fretted.length, barre = false;
  if (fretted.length) {
    const minF = Math.min(...fretted.map(i => fr[i]));
    if (fretted.length > 4) {
      const atMin = fretted.filter(i => fr[i] === minF);
      const lo = Math.min(...atMin), hi = Math.max(...atMin);
      let ok = atMin.length >= 2;
      for (let i = lo; i <= hi && ok; i++) if (fr[i] < minF) ok = false;
      if (!ok) return null;
      barre = true; fingersNeeded = 1 + fretted.filter(i => fr[i] > minF).length;
    }
  }
  if (fingersNeeded > 4) return null;
  const opens = played.filter(i => fr[i] === 0).length;
  const maxF = fretted.length ? Math.max(...fretted.map(i => fr[i])) : 0;
  const minF = fretted.length ? Math.min(...fretted.map(i => fr[i])) : 0;
  const score = pos * 0.9 + (6 - played.length) * 0.6 + (barre ? 2.5 : 0) + fingersNeeded * 0.35 - opens * 0.35 + (maxF - minF) * 0.3 + (fr[5] < 0 ? 0.6 : 0) + (first === 0 && fr[1] < 0 ? 0.8 : 0);
  return { score, v: { frets: fr.slice(), fingers: assignFingers(fr, barre) } };
}
function assignFingers(fr, barre){
  const fingers = [0,0,0,0,0,0];
  const fretted = []; for (let i = 0; i < 6; i++) if (fr[i] > 0) fretted.push(i);
  if (!fretted.length) return fingers;
  const minF = Math.min(...fretted.map(i => fr[i]));
  let rest = fretted, next = 1;
  if (barre) { fretted.filter(i => fr[i] === minF).forEach(i => fingers[i] = 1); rest = fretted.filter(i => fr[i] > minF); next = 2; }
  rest.sort((a, b) => fr[a] - fr[b] || a - b);
  let prev = next - 1; const base = barre ? minF : minF;
  const trial = rest.map(i => { const f = Math.max(prev + 1, 1 + fr[i] - base); prev = f; return f; });
  const ok = trial.every(f => f <= 4);
  rest.forEach((i, k) => fingers[i] = ok ? trial[k] : next + k);
  return fingers;
}

/* ---- pick a voicing for a chord ---- */
const voicingCache = new Map();
function tableKey(root, quality, bass, flat){ return noteName(root, flat) + quality + (bass != null ? '/' + noteName(bass, flat) : ''); }
function lookupTable(table, ch){
  for (const flat of [false, true]) {
    const k = tableKey(ch.root, ch.quality, ch.bass, flat);
    if (table[k]) return shapeFromString(table[k]);
  }
  return null;
}
function addBass(v, bassPc){
  if (bassPc == null) return v;
  const pcAt = (fr, i) => mod12(OPEN_MIDI[i] + fr[i]);
  const first = v.frets.findIndex(x => x >= 0);
  if (pcAt(v.frets, first) === bassPc) return v;
  // 1) mute low strings until the bass note is lowest
  for (let k = first + 1; k <= 3; k++) {
    if (v.frets[k] < 0) continue;
    const played = v.frets.filter((x, i) => i >= k && x >= 0).length;
    if (played >= 4 && pcAt(v.frets, k) === bassPc) {
      const frets = v.frets.map((x, i) => i < k ? -1 : x), fingers = v.fingers.map((x, i) => i < k ? 0 : x);
      return finishVoicing(frets, fingers);
    }
  }
  // 2) re-fret the lowest string to the bass note if its old note is doubled elsewhere
  const oldPc = pcAt(v.frets, first);
  const doubled = v.frets.some((x, i) => i > first && x >= 0 && pcAt(v.frets, i) === oldPc);
  if (doubled) {
    for (let f = 0; f <= Math.max(4, v.maxF); f++) {
      if (mod12(OPEN_MIDI[first] + f) !== bassPc) continue;
      if (f > 0 && (f < v.minF - 1 || f > v.minF + 3)) continue;
      const frets = v.frets.slice(), fingers = v.fingers.slice();
      const oldFinger = fingers[first];
      frets[first] = f;
      const onBarre = v.barre && v.barre.fret === f && first >= v.barre.from;
      if (f === 0) fingers[first] = 0;
      else if (onBarre) fingers[first] = v.barre.finger;
      else if (oldFinger && !(v.barre && oldFinger === v.barre.finger)) fingers[first] = oldFinger;
      else { const used = new Set(fingers.filter(x => x > 0)); const free = [1,2,3,4].find(x => !used.has(x)); if (!free) continue; fingers[first] = free; }
      return finishVoicing(frets, fingers);
    }
  }
  // 3) add the bass on a lower, unused string
  const frets = v.frets.slice(), fingers = v.fingers.slice();
  const used = new Set(fingers.filter(f => f > 0));
  for (let s = first - 1; s >= 0; s--) {
    for (let f = 0; f <= Math.max(4, v.maxF); f++) {
      if (mod12(OPEN_MIDI[s] + f) !== bassPc) continue;
      if (f > 0 && f < v.minF - 1) continue;
      if (f === 0) { frets[s] = 0; }
      else {
        const free = [4,3,2,1].find(x => !used.has(x));
        const fin = !free && s === 0 && f <= 3 ? 5 : free;
        if (!fin) continue;
        frets[s] = f; fingers[s] = fin;
      }
      for (let k = 0; k < s; k++) frets[k] = -1;
      return finishVoicing(frets, fingers);
    }
  }
  return v; // couldn't fit the bass note: play the chord without it
}
function voicingFor(ch, easy){
  const key = tableKey(ch.root, ch.quality, ch.bass, false) + (easy ? '#e' : '');
  if (voicingCache.has(key)) return voicingCache.get(key);
  let v = null, simplified = null;
  if (easy) {
    const normal = voicingFor(ch, false);
    if (normal.diff < 2.5) { v = normal; simplified = normal.simplified; }
    else {
      v = lookupTable(EASY_SHAPES, { ...ch, bass: null });
      if (v && ch.bass != null) simplified = chordLabel(ch.root, ch.quality, null, ch.flat);
      let q = ch.quality, guard = 0;
      while (!v && SIMPLER[q] !== undefined && guard++ < 4) {
        q = SIMPLER[q];
        const c2 = { ...ch, quality: q, bass: null };
        const o = lookupTable(OPEN_SHAPES, c2);
        v = (o && o.diff < 3) ? o : lookupTable(EASY_SHAPES, c2);
        if (v) simplified = chordLabel(ch.root, q, null, ch.flat);
      }
      if (!v) { v = normal; simplified = normal.simplified; }
    }
  } else {
    v = lookupTable(OPEN_SHAPES, ch);
    if (!v && ch.bass != null) { const base = voicingFor({ ...ch, bass: null }, false); v = addBass(base, ch.bass); simplified = base.simplified || null; }
    if (!v) {
      const e = movable(E_SHAPES, 0, ch), a = movable(A_SHAPES, 1, ch);
      v = !e ? a : !a ? e : (a.minF <= e.minF ? a : e);
      if (v && v.minF > 7) { const s = searchVoicing(ch); if (s) { const sv = finishVoicing(s.frets, s.fingers); if (sv.minF < v.minF) v = sv; } }
    }
    if (!v) { const s = searchVoicing(ch); if (s) v = finishVoicing(s.frets, s.fingers); }
    if (!v) {
      let q = ch.quality, guard = 0;
      while (!v && SIMPLER[q] !== undefined && guard++ < 5) {
        q = SIMPLER[q];
        const c2 = { ...ch, quality: q, bass: null };
        v = lookupTable(OPEN_SHAPES, c2) || movable(A_SHAPES, 1, c2) || movable(E_SHAPES, 0, c2);
        if (v) simplified = chordLabel(ch.root, q, null, ch.flat);
      }
    }
    if (!v) v = movable(E_SHAPES, 0, { ...ch, quality: '' });
  }
  v = { ...v, simplified };
  voicingCache.set(key, v);
  return v;
}
function soundingNotes(v, capo){
  // returns [{string, midi}] for played strings
  const out = [];
  v.frets.forEach((f, i) => { if (f >= 0) out.push({ string: i, midi: OPEN_MIDI[i] + capo + f }); });
  return out;
}
function chordDifficulty(ch, easy){ return voicingFor(ch, easy).diff; }
