/* =====================================================================
   Starter pack + song notes: what the page knows about famous songs with
   no network and no dataset.
   - SONG_PACK: full hand-written arrangements (chords only, no lyrics) of
     songs every beginner asks for that the embedded data lacks or only has
     in pieces. Chords are the usual beginner shapes with the usual capo;
     section lengths are close to the record, not bar-exact, so they are
     marked approximate.
   - SONG_HINTS: felt tempo and style for well-known recordings, used when a
     source has no tempo (a third of Hooktheory's clips), counts it at
     another octave, or has no genre. Tempos in the ready-made careers
     (64-curated.js) count as hints too.
   Plain data: nothing here touches the DOM.
   ===================================================================== */
// parts: bars separated by |, chords in a bar by spaces (as in song.sections[].bars). form: PART or PART*repeats.
// Part letters name the section: I intro, V verse, P pre-chorus, C chorus, B bridge, S solo, T interlude, O outro.
const SONG_PACK = [
  { t: 'Wonderwall', a: 'Oasis', y: 1995, bpm: 87, time: '4/4', key: 'F#m', capo: 2, style: 'rock', strum: 'slow16',
    parts: { I: 'Em7 G|Dsus4 A7sus4', V: 'Em7 G|Dsus4 A7sus4', P: 'Cadd9 Dsus4|Em7|Cadd9 Dsus4|Em7|Cadd9 Dsus4|G Em7|A7sus4|A7sus4', C: 'Cadd9 Em7|G Em7', O: 'Em7 G|Dsus4 A7sus4' },
    form: 'I*4 V*4 V*4 P C*4 V*4 P C*4 C*4 O*8', tip: 'Keep your ring and little fingers on the third fret of the top two strings for every chord.' },
  { t: "Knockin' on Heaven's Door", a: 'Bob Dylan', y: 1973, bpm: 69, time: '4/4', key: 'G', capo: 0, style: 'ballad',
    parts: { I: 'G D|Am|G D|C', V: 'G D|Am|G D|C', C: 'G D|Am|G D|C', O: 'G D|C' },
    form: 'I V*2 C*2 V*2 C*2 O', tip: 'One loop for the whole song: G and D share a bar, then Am the first time round and C the second.' },
  { t: "Free Fallin'", a: 'Tom Petty', y: 1989, bpm: 84, time: '4/4', key: 'F', capo: 3, style: 'rock',
    parts: { I: 'D G|G D A', V: 'D G|G D A', C: 'D G|G D A', S: 'D G|G D A', O: 'D G|G D A' },
    form: 'I*2 V*4 V*4 C*4 V*4 V*4 C*4 S*4 C*4 C*4 O*2', tip: 'Capo 3. The same two bars all the way through; the chorus just gets louder.' },
  { t: 'Hey, Soul Sister', a: 'Train', y: 2009, bpm: 97, time: '4/4', key: 'E', capo: 4, style: 'pop',
    parts: { I: 'C|G|Am|F', V: 'C|G|Am|F', C: 'F|G|C|G', T: 'C|G|Am|F', B: 'C|G|Am|F', O: 'C|G|Am|F' },
    form: 'I*2 V*4 C*2 T V*4 C*2 B*2 C*2 O*2', tip: 'Capo 4. Four chords, one bar each.' },
  { t: 'Seven Nation Army', a: 'The White Stripes', y: 2003, bpm: 124, time: '4/4', key: 'Em', capo: 0, style: 'rock',
    parts: { I: 'Em . G D|C B', V: 'Em . G D|C B', T: 'G|A', C: 'Em . G D|C B' },
    form: 'I*6 V*8 T*2 C*8 V*8 T*2 C*8 V*8 T*2 C*8', tip: 'The riff as chords: Em for two beats, G and D a beat each, then C and B.' },
  { t: 'La Bamba', a: 'Ritchie Valens', y: 1958, bpm: 150, time: '4/4', key: 'C', capo: 0, style: 'rock',
    parts: { I: 'C F|G', V: 'C F|G', C: 'C F|G', S: 'C F|G', O: 'C F|G' },
    form: 'I*4 V*8 C*4 V*8 S*8 V*4 O*3', tip: 'Three chords in a loop: C and F share a bar, G gets its own.' },
  { t: 'Bella ciao', a: 'Traditional', alt: ['Bella Ciao (Traditional)'], bpm: 126, time: '4/4', key: 'Am', capo: 0, style: 'folk',
    parts: { I: 'Dm|Am|E7|Am', V: 'Am|Am|Am|Am|Dm|Am|E7|Am', O: 'Dm|Am|E7|Am' },
    form: 'I V*2 V*2 V*2 V*2 O', tip: 'Traditional Italian folk song. Am for four bars, then Dm, Am, E7, Am.' },
  { t: 'Fast Car', a: 'Tracy Chapman', y: 1988, bpm: 104, time: '4/4', key: 'A', capo: 2, style: 'folk',
    parts: { I: 'Cmaj7 G|Em D', V: 'Cmaj7 G|Em D', C: 'C|G|Em|D', T: 'Cmaj7 G|Em D', O: 'Cmaj7 G|Em D' },
    form: 'I*4 V*8 V*8 C*2 T*2 V*8 C*2 T*2 V*8 C*2 O*4', tip: 'Capo 2. The riff is four chords, two to a bar.' },
  { t: "Blowin' in the Wind", a: 'Bob Dylan', y: 1963, bpm: 87, time: '4/4', key: 'D', capo: 7, style: 'folk',
    parts: { I: 'G|G', V: 'G C|G|G C|D|G C|G|G C|D|G C|G|G C|D', C: 'C D|G Em|C D|G|G|G', O: 'G|G' },
    form: 'I V C V C V C O', tip: 'Capo 7 with G shapes, as on the record (or no capo to sing it lower).' },
  { t: 'Wonderful Tonight', a: 'Eric Clapton', y: 1977, bpm: 95, time: '4/4', key: 'G', capo: 0, style: 'ballad',
    parts: { I: 'G|D/F#|C|D', V: 'G|D/F#|C|D|G|D/F#|C|D|C|D|G D/F#|Em|C|D|G|G', B: 'C|D|G D/F#|Em|C|D|C|D', T: 'G|D/F#|C|D', S: 'G|D/F#|C|D', O: 'G|D/F#|C|D' },
    form: 'I*2 V T V B S*2 V O*2', tip: 'The intro lick sits over G, D/F#, C, D: one bar each.' },
];
const PACK_NAMES = { I: 'Intro', V: 'Verse', P: 'Pre-Chorus', C: 'Chorus', B: 'Bridge', S: 'Solo', T: 'Interlude', O: 'Outro' };
const PACK_TYPES = { I: 'intro', V: 'verse', P: 'prechorus', C: 'chorus', B: 'bridge', S: 'solo', T: 'interlude', O: 'outro' };
// a pack entry -> a plain song object (validateSong / finishChart take it from here)
function packSong(p){
  const secs = [], count = {}, seen = {};
  const steps = p.form.split(/\s+/).filter(Boolean).map(tok => { const m = /^([A-Z]\w*?)(?:\*(\d+))?$/.exec(tok); return m && p.parts[m[1]] ? { k: m[1], n: +m[2] || 1 } : null; }).filter(Boolean);
  steps.forEach(s => { const nm = PACK_NAMES[s.k[0]] || 'Part'; count[nm] = (count[nm] || 0) + 1; });
  for (const s of steps) {
    const nm = PACK_NAMES[s.k[0]] || 'Part', one = p.parts[s.k].split('|').map(b => b.trim()).filter(Boolean), bars = [];
    for (let i = 0; i < s.n; i++) bars.push(...one);
    seen[nm] = (seen[nm] || 0) + 1;
    secs.push({ name: nm + (count[nm] > 1 ? ' ' + seen[nm] : ''), type: PACK_TYPES[s.k[0]] || 'verse', bars });
  }
  return { title: p.t, artist: p.a, year: p.y || 0, bpm: p.bpm, time: p.time || '4/4', feel: p.feel || 'straight', style: p.style || 'rock', key: p.key, capo: p.capo || 0,
    approx: true, sections: secs,
    note: (p.tip ? p.tip + ' ' : '') + 'Starter-pack arrangement: the usual beginner chords, written by hand. Section lengths are close to the record, not exact.' };
}

// "Title — Artist": [felt bpm (0 = no opinion), style, feel]
const SONG_HINTS = {};
(function(){
  const H = [
    ['Wonderwall', 'Oasis', 87, 'rock'], ['Let It Be', 'The Beatles', 72, 'ballad'], ['Riptide', 'Vance Joy', 102, 'folk'], ['Hotel California', 'Eagles', 74, 'rock'],
    ['Wagon Wheel', 'Old Crow Medicine Show', 148, 'country'], ['Wagon Wheel', 'Darius Rucker', 148, 'country'], ['Zombie', 'The Cranberries', 84, 'rock'], ['Creep', 'Radiohead', 92, 'rock'],
    ['Sweet Home Alabama', 'Lynyrd Skynyrd', 98, 'rock'], ['Stand By Me', 'Ben E. King', 118, 'pop'], ['Someone Like You', 'Adele', 67, 'ballad'], ['Perfect', 'Ed Sheeran', 63, 'ballad'],
    ['Blinding Lights', 'The Weeknd', 171, 'edm'], ['Smells Like Teen Spirit', 'Nirvana', 117, 'rock'], ['Hallelujah', 'Jeff Buckley', 0, 'ballad'], ['Hallelujah', 'Leonard Cohen', 0, 'ballad'],
    ["Knockin' on Heaven's Door", 'Bob Dylan', 69, 'ballad'], ['A Horse with No Name', 'America', 123, 'folk'], ['Three Little Birds', 'Bob Marley & The Wailers', 75, 'reggae'],
    ['No Woman, No Cry', 'Bob Marley & The Wailers', 78, 'reggae'], ['Brown Eyed Girl', 'Van Morrison', 150, 'pop'], ['Wish You Were Here', 'Pink Floyd', 61, 'ballad'],
    ['Take Me Home, Country Roads', 'John Denver', 82, 'country'], ['Hey Jude', 'The Beatles', 74, 'ballad'], ['Imagine', 'John Lennon', 76, 'ballad'], ['Viva la Vida', 'Coldplay', 138, 'pop'],
    ['Yellow', 'Coldplay', 87, 'rock'], ['Love Story', 'Taylor Swift', 119, 'country'], ["Sweet Child O' Mine", "Guns N' Roses", 125, 'rock'], ['Thinking Out Loud', 'Ed Sheeran', 79, 'ballad'],
    ['Ho Hey', 'The Lumineers', 80, 'folk'], ["I'm Yours", 'Jason Mraz', 75, 'reggae'], ['Good Riddance (Time of Your Life)', 'Green Day', 95, 'folk'], ['House of the Rising Sun', 'The Animals', 78, 'ballad'],
    ['Despacito', 'Luis Fonsi', 89, 'pop'], ['Jolene', 'Dolly Parton', 111, 'country'], ['Ring of Fire', 'Johnny Cash', 105, 'country'], ['Folsom Prison Blues', 'Johnny Cash', 112, 'country'],
    ['Tears in Heaven', 'Eric Clapton', 77, 'ballad'], ['Mr. Brightside', 'The Killers', 148, 'rock'], ['Chasing Cars', 'Snow Patrol', 104, 'rock'],
    ['Have You Ever Seen the Rain', 'Creedence Clearwater Revival', 116, 'rock'], ['Bad Moon Rising', 'Creedence Clearwater Revival', 179, 'country'], ['Losing My Religion', 'R.E.M.', 125, 'rock'],
    ["What's Up?", '4 Non Blondes', 134, 'rock'], ["Don't Stop Believin'", 'Journey', 119, 'rock'], ['Hey Ya!', 'OutKast', 159, 'pop'], ['Dreams', 'Fleetwood Mac', 120, 'pop'],
    ['With or Without You', 'U2', 110, 'rock'], ['Stairway to Heaven', 'Led Zeppelin', 82, 'ballad'], ['Under the Bridge', 'Red Hot Chili Peppers', 84, 'rock'],
    ['Shallow', 'Lady Gaga', 96, 'ballad'], ['Let Her Go', 'Passenger', 75, 'folk'], ['All of Me', 'John Legend', 63, 'ballad'], ['Stay With Me', 'Sam Smith', 84, 'ballad'],
    ['Royals', 'Lorde', 85, 'hiphop'], ['Rolling in the Deep', 'Adele', 105, 'pop'], ['Twist and Shout', 'The Beatles', 124, 'rock'], ['Lean on Me', 'Bill Withers', 75, 'ballad'],
    ['Shape of You', 'Ed Sheeran', 96, 'pop'], ['Every Breath You Take', 'The Police', 117, 'pop'], ['Redemption Song', 'Bob Marley & The Wailers', 116, 'folk'],
  ];
  for (const [t, a, bpm, style, feel] of H) SONG_HINTS[t + '|' + a] = { bpm, style, feel };
})();
// what the page knows about a recording by name: { bpm, style, feel } or null. songHint.off = true switches it off (tests).
function songHint(title, artist){
  if (songHint.off || typeof Lookup === 'undefined') return null;
  if (!songHint.map) {
    const m = songHint.map = new Map(), key = (t, a) => Lookup.normTitle(t)[0] + '|' + Lookup.artistVariants(a)[0];
    for (const k in SONG_HINTS) { const i = k.lastIndexOf('|'); m.set(key(k.slice(0, i), k.slice(i + 1)), SONG_HINTS[k]); }
    // the tempos written into the ready-made careers
    if (typeof CURATED !== 'undefined') for (const c of CURATED) for (const l of (c.levels || [])) for (const s of (l.songs || [])) { const k = key(s[0], c.artist); if (!m.has(k) && s[3] > 0) m.set(k, { bpm: s[3], soft: true }); }
  }
  const tv = Lookup.normTitle(title), av = Lookup.artistVariants(artist);
  for (const t of tv) for (const a of av) { const h = songHint.map.get(t + '|' + a); if (h) return h; }
  return null;
}
