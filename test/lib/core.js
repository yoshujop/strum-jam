// Loads the engine-agnostic part of the game (theory, songs, arranging, lookup, charts, lyrics, starter pack) into a
// plain Node context, with the embedded chord data, no browser. SRC=<dir> points at another copy of src/ (e.g. the
// commit before a change, for before/after numbers).
//   const { ctx, run } = require('./lib/core')();   run('Lookup.normTitle("x")')  /  ctx.Chart.make(...)
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = function load(opts){
  opts = opts || {};
  const root = path.join(__dirname, '..', '..'), src = opts.src || process.env.SRC || path.join(root, 'src');
  const files = ['10-theory.js', '20-songs.js', '21-arrange.js', '25-lookup.js', '26-chart.js', '27-pack.js', '61-lyrics.js', '64-curated.js'].filter(f => fs.existsSync(path.join(src, f)));
  const mem = {};
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, TextEncoder, TextDecoder, AbortController, Response, Blob, DecompressionStream, URL, performance, atob, btoa,
    CHORD_INDEX_BYTES: new Uint8Array(fs.readFileSync(path.join(root, 'vendor', 'chord-index.bin'))),
    HT_BYTES: new Uint8Array(fs.readFileSync(path.join(root, 'vendor', 'hooktheory.json.gz'))),
    // every music host is "unreachable" unless a test installs its own fetch
    fetch: opts.fetch || (async () => { throw new TypeError('Failed to fetch'); }),
    Store: { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } },
  });
  // top-level const/let of classic scripts share one scope only when the scripts are one program
  const code = files.map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('\n')
    + '\n;globalThis.__api = { ' + ['Lookup', 'Chart', 'Lyrics', 'LIBRARY', 'validateSong', 'compileSong', 'parseChord', 'parseTime', 'parseChordSheet', 'transposeChord', 'voicingFor', 'noteName',
      'chartModel', 'finishChart', 'normalizeTempo', 'easyCapo', 'songDifficulty', 'pickStrum', 'strumPattern', 'STRUMS', 'SONG_PACK', 'SONG_HINTS', 'songHint', 'packSong', 'CURATED']
      .map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(', ') + ' };';
  vm.runInContext(code, ctx, { filename: 'strum-jam-core.js' });
  const api = ctx.__api;
  return { ctx: api, vm: ctx, files, run: js => vm.runInContext(js, ctx) };
};
