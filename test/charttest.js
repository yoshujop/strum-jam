// Chart quality: well-known songs through the real chart pipeline against the embedded data, with no network
// (every fetch fails, as on a plane), scored against test/chartsongs.js.
//   node test/charttest.js                 the working tree
//   SRC=/path/to/old/src node test/charttest.js     another copy of src/ (before/after)
//   HINTS=0 node test/charttest.js         without the song notes (27-pack.js SONG_HINTS): what the rules derive alone
//   ONLINE=1 node test/charttest.js        real network (iTunes + the chord dataset), when the hosts are reachable
//   JSON=out.json  writes the per-song rows;  V=1 prints every song
const fs = require('fs');
const songs = require('./chartsongs.js');
const online = process.env.ONLINE === '1';
const { ctx, files } = require('./lib/core')(online ? { fetch: (...a) => fetch(...a) } : {});
if (process.env.HINTS === '0' && ctx.songHint) ctx.songHint.off = true;
const pc = n => { const c = ctx.parseChord(n); return c ? c.root + (/^m(?!aj)/.test(c.quality) ? 'm' : '') : null; };
const keyId = k => { const m = /^([A-G][#b]?)(m?)$/.exec(k || ''), c = m && ctx.parseChord(m[1]); return c ? c.root + (m[2] ? 'm' : '') : null; };
(async () => {
  const rows = [];
  for (const s of songs) {
    const r = { title: s.title, artist: s.artist };
    const t0 = performance.now();
    try {
      let track = { title: s.title, artist: s.artist, trackId: '', durationMs: s.dur * 1000, previewUrl: '', album: '', year: 0, art: '' };
      if (online) { const b = await ctx.Lookup.itunesBest(s.title, s.artist).catch(() => null); if (b) track = b; }
      const o = await ctx.Chart.make(track, { ai: false, web: false });
      const v = ctx.validateSong(o, 'dataset'), ch = ctx.compileSong(v, { shapes: 'standard' });
      r.found = true; r.src = o.prov.src; r.bpm = v.bpm; r.time = v.time; r.key = v.key; r.capo = v.capo; r.strum = v.strum || ''; r.style = v.style;
      r.bars = ch.totalBars; r.sec = Math.round(ch.totalBeats * 60 / v.bpm);
      // sounding chord changes, in order
      const seq = []; for (const e of ch.events) { if (e.rest) continue; const id = pc(e.sounds.replace('♯', '#').replace('♭', 'b')); if (id != null && seq[seq.length - 1] !== id) seq.push(id); }
      r.first = seq.slice(0, 6);
      const tol = b => b && Math.abs(v.bpm - b) / b <= 0.07;
      r.okBpm = tol(s.bpm) || tol(s.alt); r.okFelt = tol(s.bpm);
      r.okTime = s.time.includes(v.time);
      r.okKey = s.key.map(keyId).includes(keyId(v.key));
      r.okProg = s.prog ? s.prog.some(p => { const want = p.map(pc), head = seq.slice(0, 16); for (let i = 0; i + want.length <= head.length; i++) if (want.every((w, j) => head[i + j] === w)) return true; return false; }) : null;
      r.okLen = Math.abs(r.sec - s.dur) / s.dur <= 0.15;                 // a whole song, not a fragment
      r.okStrum = !!r.strum;
      // open-chord friendly: under a fifth of the playing time on full barre shapes
      let barre = 0, tot = 0; for (const e of ch.events) { if (e.rest) continue; tot += e.len; if (e.v.barre && e.v.barre.to - e.v.barre.from >= 2) barre += e.len; }
      r.barre = tot ? +(barre / tot).toFixed(2) : 0; r.okEasy = r.barre < 0.2;
      r.sane = v.bpm >= 50 && v.bpm <= 185;
    } catch (e) { r.found = false; r.code = e.code || String(e.message || e).slice(0, 60); }
    r.ms = Math.round(performance.now() - t0);
    rows.push(r);
    if (process.env.V) console.log(r.found ? 'OK ' : 'ERR', (r.src || r.code || '').padEnd(12), r.found ? `${String(r.bpm).padStart(3)}${r.okBpm ? ' ' : '!'} ${r.time}${r.okTime ? ' ' : '!'} ${String(r.key).padEnd(4)}${r.okKey ? ' ' : '!'} prog${r.okProg === false ? '!' : ' '} capo ${r.capo} barre ${r.barre} ${String(r.sec).padStart(3)}s/${s.dur}${r.okLen ? ' ' : '!'} ${r.strum.padEnd(9)}` : '', s.title, '|', s.artist, r.found ? r.first.join(' ') : '');
  }
  const N = rows.length, F = rows.filter(r => r.found), pct = (n, d) => `${n}/${d} (${d ? Math.round(n / d * 100) : 0}%)`;
  const withProg = F.filter(r => r.okProg !== null);
  const src = {}; F.forEach(r => src[r.src] = (src[r.src] || 0) + 1);
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  console.log(`\nsrc/: ${files.join(' ')}${online ? '  [ONLINE]' : '  [offline: embedded data only]'}${process.env.HINTS === '0' ? '  [song notes off]' : ''}`);
  console.log('songs               ', N);
  console.log('found               ', pct(F.length, N), JSON.stringify(src), 'errors', JSON.stringify(rows.filter(r => !r.found).reduce((a, r) => (a[r.code] = (a[r.code] || 0) + 1, a), {})));
  console.log('tempo right         ', pct(F.filter(r => r.okBpm).length, F.length), ' felt pulse exactly:', pct(F.filter(r => r.okFelt).length, F.length), ' sane (50-185):', pct(F.filter(r => r.sane).length, F.length));
  console.log('metre right         ', pct(F.filter(r => r.okTime).length, F.length));
  console.log('key right           ', pct(F.filter(r => r.okKey).length, F.length));
  console.log('first progression   ', pct(withProg.filter(r => r.okProg).length, withProg.length));
  console.log('full length (±15%)  ', pct(F.filter(r => r.okLen).length, F.length), ' median chart length', med(F.map(r => r.sec)) + 's');
  console.log('has a strum pattern ', pct(F.filter(r => r.okStrum).length, F.length));
  console.log('open-chord friendly ', pct(F.filter(r => r.okEasy).length, F.length), ' with a capo:', F.filter(r => r.capo > 0).length);
  console.log('everything right    ', pct(F.filter(r => r.okBpm && r.okTime && r.okKey && r.okProg !== false && r.okLen && r.okStrum).length, N), '(of all songs: found, tempo, metre, key, progression, full length, strum)');
  console.log('time per song        median', med(rows.map(r => r.ms)) + 'ms', 'worst', Math.max(...rows.map(r => r.ms)) + 'ms');
  if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(rows, null, 1));
  const bad = F.filter(r => !(r.okBpm && r.okTime && r.okKey && r.okProg !== false));
  if (bad.length && !process.env.V) console.log('\nwrong somewhere:\n' + bad.map(r => `  ${r.title}: ${[!r.okBpm && 'tempo ' + r.bpm, !r.okTime && 'metre ' + r.time, !r.okKey && 'key ' + r.key, r.okProg === false && 'progression ' + r.first.join(' ')].filter(Boolean).join(', ')}`).join('\n'));
})();
