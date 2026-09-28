/* =====================================================================
   Lookup: the exact recording first, then its real chords from data.
   1. iTunes Search API: the player picks the exact recording (cover art,
      artist, album, year, duration, 30-second preview).
   2. Chordonomicon (Kantarelis et al. 2024, CC BY-NC 4.0): ~680k chord
      charts with section tags, one per Spotify track. A compact index
      embedded in the page maps "title | artist" (as Spotify spells them) to
      dataset rows; the row itself comes from the Hugging Face datasets
      server. When Apple and Spotify spell the title differently,
      ListenBrainz gives the Spotify tracks of the recording and Spotify's own
      titles are tried. Every row is checked against Spotify's title.
   3. The chords are laid into bars with the song's tempo and metre (from the
      recording, or Claude for timing only). The chords always come from the
      data; nothing here rewrites them.
   ===================================================================== */
const Lookup = {
  ITUNES: 'https://itunes.apple.com/search',
  HF_ROWS: 'https://datasets-server.huggingface.co/rows?dataset=ailsntua%2FChordonomicon&config=default&split=train',
  LB: 'https://labs.api.listenbrainz.org/spotify-id-from-metadata/json',
  OEMBED: 'https://open.spotify.com/oembed?url=',
  CREDIT: 'Chord data: Chordonomicon (Kantarelis et al., 2024), CC BY-NC 4.0',
  CREDIT_URL: 'https://huggingface.co/datasets/ailsntua/Chordonomicon',

  /* ---------- network ---------- */
  async getJson(url, opts){
    opts = opts || {};
    let last;
    for (let a = 0; a < (opts.tries || 2); a++) {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), opts.timeout || 15000);
      const stop = () => ctl.abort();
      if (opts.signal) { if (opts.signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); opts.signal.addEventListener('abort', stop, { once: true }); }
      try {
        const r = await fetch(url, { signal: ctl.signal, method: opts.method || 'GET', headers: opts.headers, body: opts.body });
        if (r.status === 429 || r.status >= 500) { last = Object.assign(new Error('HTTP ' + r.status), { status: r.status }); await new Promise(z => setTimeout(z, 700 * (a + 1))); continue; }
        if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
        return await r.json();
      } catch (e) {
        if (opts.signal && opts.signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
        last = e; if (e.status && e.status < 500 && e.status !== 429) throw e;
        if (a + 1 < (opts.tries || 2)) await new Promise(z => setTimeout(z, 600 * Math.pow(2, a)));
      } finally { clearTimeout(to); if (opts.signal) opts.signal.removeEventListener('abort', stop); }
    }
    throw last || new Error('network');
  },

  /* ---------- 1. iTunes: the exact recording ---------- */
  async itunes(q, opts){
    opts = opts || {};
    const u = opts.artistId ? this.ITUNES.replace('/search', '/lookup') + '?id=' + opts.artistId + '&entity=song&limit=200&country=' + (opts.country || 'US')
      : this.ITUNES + '?media=music&entity=song&limit=' + (opts.limit || 15) + '&country=' + (opts.country || 'US') + '&term=' + encodeURIComponent(q);
    let j;
    try { j = await this.getJson(u, { signal: opts.signal }); }
    catch (e) { if (e.status !== 403) throw e; await new Promise(z => setTimeout(z, 2500)); j = await this.getJson(u, { signal: opts.signal }); }   // Apple answers 403 when busy
    const seen = new Set(), out = [];
    for (const r of (j.results || [])) {
      if (r.kind !== 'song' || !r.trackId) continue;
      const k = (r.trackName + '|' + r.artistName + '|' + r.collectionName).toLowerCase();
      if (seen.has(k)) continue; seen.add(k);
      out.push(this.trackOf(r));
    }
    return out;
  },
  trackOf(r){
    return { trackId: r.trackId, title: r.trackName, artist: r.artistName, artistId: r.artistId || 0, album: r.collectionName || '', year: r.releaseDate ? +String(r.releaseDate).slice(0, 4) : 0,
      durationMs: r.trackTimeMillis || 0, previewUrl: r.previewUrl || '', genre: r.primaryGenreName || '',
      art: (r.artworkUrl100 || r.artworkUrl60 || '').replace(/\/\d+x\d+bb\./, '/200x200bb.'), url: r.trackViewUrl || '' };
  },
  // versions that aren't the original studio recording (unless the title asks for one)
  VER: /\blive\b|acoustic|unplugged|\bdemo\b|remix|\bmix\b|karaoke|instrumental|cover|tribute|re-?record|taylor.s version|rehearsal|\bsession\b|orchestral|symphonic|a cappella|lullaby|8-bit/i,
  isVersion(r){ return this.VER.test(r.title) || /\blive\b|unplugged|acoustic|karaoke|tribute|lullaby|renditions|performs|covers/i.test(r.album); },
  // score iTunes results against a known title + artist: the original studio recording wins, and among equals the earliest release
  rankRecordings(res, title, artist){
    const tv = this.normTitle(title), av = this.artistVariants(artist), asked = this.VER.test(title);
    return res.map((r, i) => {
      const t = this.normTitle(r.title).some(x => tv.includes(x)) ? 3 : 0;
      const a = this.artistVariants(r.artist).some(x => av.includes(x)) ? 2 : 0;
      const ver = !asked && this.isVersion(r) ? -2.5 : 0;
      return { r, t, a, ver, s: t + a + ver - i * 0.02 - (r.year > 1900 ? (r.year - 1950) * 0.004 : 0.2) };
    }).sort((x, y) => y.s - x.s);
  },
  // best iTunes match for a known title + artist (Story mode and the accuracy test pick songs by name).
  // Apple's search often buries the studio original under covers and live cuts; then the artist's own catalogue is searched.
  async itunesBest(title, artist, opts){
    const res = await this.itunes(title + ' ' + artist, { ...opts, limit: 25 });
    let ranked = this.rankRecordings(res, title, artist);
    const clean = x => x && x.t && x.a && !x.ver;
    if (!clean(ranked[0])) {
      const art = ranked.find(x => x.a && x.r.artistId);
      if (art) {
        try {
          const more = await this.itunes('', { ...opts, artistId: art.r.artistId });
          const r2 = this.rankRecordings(more, title, artist);
          if (clean(r2[0])) ranked = r2;
        } catch (e) { if (e.name === 'AbortError') throw e; }
      }
    }
    const b = ranked[0];
    return b && b.s >= 2.5 ? b.r : null;
  },

  /* ---------- Story mode: the artist's studio albums, with release dates and tracklists ---------- */
  // MusicBrainz says which releases are studio albums and when each first came out (Apple often dates a reissue);
  // Apple has the tracklists and the recordings the game plays. Without MusicBrainz, Apple's own album list is filtered.
  MB: 'https://musicbrainz.org/ws/2/',
  // edition tags that don't make a different album
  EDITION: /\s*[(\[][^)\]]*\b(deluxe|expanded|edition|remaster(ed)?|anniversary|version|explicit|clean|bonus|reissue|mono|stereo)\b[^)\]]*[)\]]/gi,
  NOT_STUDIO: /\b(live|greatest hits|best of|the best|hits|collection|anthology|essentials?|karaoke|instrumentals?|remix(es|ed)?|commentary|interview|tribute|b-sides|rarities|playlist|unplugged|in concert|soundtrack|christmas collection)\b/i,
  isEdition(t){ return String(t).replace(this.EDITION, '') !== String(t); },
  albumKey(t){ return this.core(this.base(String(t || '').replace(this.EDITION, '').replace(/\s+-\s+(single|ep)$/i, ''))); },
  async itunesArtist(name, opts){
    opts = opts || {};
    const u = this.ITUNES + '?media=music&entity=musicArtist&limit=10&country=US&term=' + encodeURIComponent(name);
    const j = await this.getJson(u, { signal: opts.signal });
    const want = this.normArtist(name), res = (j.results || []).filter(r => r.artistId && r.artistName);
    const hit = res.find(r => this.normArtist(r.artistName) === want) || res.find(r => this.artistVariants(r.artistName).includes(want));
    if (hit) return { artistId: hit.artistId, name: hit.artistName };
    // spelled differently (or not listed as an artist): the artist of the best-matching song
    const songs = await this.itunes(name, { signal: opts.signal, limit: 10 });
    const s = songs.find(x => x.artistId && this.artistVariants(x.artist).includes(want));
    return s ? { artistId: s.artistId, name: s.artist.replace(/\s*(&|,|\bfeat\.?|\bwith\b).*$/i, '') } : (res[0] ? { artistId: res[0].artistId, name: res[0].artistName, loose: true } : null);
  },
  async itunesAlbums(artistId, opts){
    const j = await this.getJson(this.ITUNES.replace('/search', '/lookup') + '?id=' + artistId + '&entity=album&limit=200&country=US', { signal: opts && opts.signal });
    return (j.results || []).filter(r => r.wrapperType === 'collection' && r.collectionId).map(r => ({
      collectionId: r.collectionId, title: r.collectionName || '', artist: r.artistName || '', artistId: r.artistId || 0,
      date: String(r.releaseDate || '').slice(0, 10), year: r.releaseDate ? +String(r.releaseDate).slice(0, 4) : 0,
      trackCount: r.trackCount || 0, explicit: r.collectionExplicitness === 'explicit' }));
  },
  // tracklists for several albums (a few per request; Apple limits how often it can be asked)
  async itunesTracks(ids, opts){
    const out = new Map(), L = this.ITUNES.replace('/search', '/lookup');
    const load = async group => {
      const j = await this.getJson(L + '?id=' + group.join(',') + '&entity=song&limit=200&country=US', { signal: opts && opts.signal });
      for (const r of (j.results || [])) {
        if (r.wrapperType !== 'track' || r.kind !== 'song' || !r.trackId) continue;
        const list = out.get(r.collectionId) || out.set(r.collectionId, []).get(r.collectionId);
        if (!list.some(x => x.trackId === r.trackId)) list.push({ ...this.trackOf(r), disc: r.discNumber || 1, no: r.trackNumber || 0 });
      }
    };
    for (let i = 0; i < ids.length; i += 6) await load(ids.slice(i, i + 6));
    // a group that came back short: ask for the missing albums one at a time
    for (const id of ids) if (!out.has(id)) { try { await load([id]); } catch (e) { if (e.name === 'AbortError') throw e; } }
    for (const list of out.values()) list.sort((a, b) => a.disc - b.disc || a.no - b.no);
    return out;
  },
  // studio albums (and mixtapes) with their first release dates, or null when MusicBrainz can't be reached
  async mbAlbums(name, opts){
    const get = u => this.getJson(this.MB + u + (u.includes('?') ? '&' : '?') + 'fmt=json', { signal: opts && opts.signal, timeout: 15000 });
    const wait = () => new Promise(z => setTimeout(z, 1100));   // MusicBrainz asks for one request a second
    try {
      const a = await get('artist?limit=5&query=' + encodeURIComponent('artist:"' + String(name).replace(/"/g, '') + '"'));
      const want = this.normArtist(name), list = (a && a.artists) || [];
      const hit = list.find(x => this.normArtist(x.name) === want && x.score >= 80) || list.find(x => x.score >= 95);
      if (!hit) return null;
      const out = [];
      for (let offset = 0; offset < 300; offset += 100) {
        await wait();
        const r = await get('release-group?artist=' + hit.id + '&type=album&limit=100&offset=' + offset);
        const rg = (r && r['release-groups']) || [];
        for (const g of rg) {
          const sec = g['secondary-types'] || [];
          if (g['primary-type'] !== 'Album' || sec.some(t => t !== 'Mixtape/Street') || !g['first-release-date']) continue;
          out.push({ title: g.title, date: g['first-release-date'], year: +g['first-release-date'].slice(0, 4), mixtape: sec.length > 0 });
        }
        if (offset + 100 >= ((r && r['release-group-count']) || 0)) break;
      }
      return out.length ? out : null;
    } catch (e) { if (e.name === 'AbortError') throw e; return null; }
  },
  // {artist, artistId, source, albums: [{id, title, year, date, collectionId, tracks}]} oldest first
  async discography(name, opts){
    opts = opts || {};
    const art = await this.itunesArtist(name, opts);
    if (!art) return null;
    const [coll, mb] = await Promise.all([this.itunesAlbums(art.artistId, opts), this.mbAlbums(art.name, opts)]);
    const own = coll.filter(c => c.artistId === art.artistId || this.artistVariants(c.artist).includes(this.normArtist(art.name)));
    const single = c => /\s+-\s+(single|ep)$/i.test(c.title) || c.trackCount < 7;
    // several Apple editions of one album: the standard one (explicit if there's a choice), then the fullest
    const pick = list => list.slice().sort((a, b) => (this.isEdition(a.title) - this.isEdition(b.title)) || (b.explicit - a.explicit) || (b.trackCount - a.trackCount) || String(a.date).localeCompare(String(b.date)))[0];
    let albums = [];
    if (mb) {
      for (const m of mb) {
        const k = this.albumKey(m.title), cands = own.filter(c => this.albumKey(c.title) === k && !/\s+-\s+(single|ep)$/i.test(c.title));
        albums.push({ title: m.title, year: m.year, date: m.date, mixtape: m.mixtape, coll: cands.length ? pick(cands) : null });
      }
    } else {
      const groups = new Map();
      for (const c of own) { if (single(c) || this.NOT_STUDIO.test(c.title)) continue; const k = this.albumKey(c.title); (groups.get(k) || groups.set(k, []).get(k)).push(c); }
      for (const list of groups.values()) { const c = pick(list), first = list.reduce((a, b) => (a.date && a.date < b.date ? a : b)); albums.push({ title: c.title.replace(this.EDITION, '').trim(), year: first.year, date: first.date, coll: c }); }
    }
    // the same album twice (MusicBrainz lists some twice): keep the earliest
    const seen = new Set();
    albums = albums.sort((a, b) => String(a.date).localeCompare(String(b.date))).filter(a => { const k = this.albumKey(a.title); if (seen.has(k)) return false; seen.add(k); return true; });
    const tracks = await this.itunesTracks(albums.filter(a => a.coll).map(a => a.coll.collectionId), opts);
    albums = albums.map((a, i) => ({ id: 'A' + (i + 1), title: a.title, year: a.year, date: a.date, mixtape: !!a.mixtape, collectionId: a.coll ? a.coll.collectionId : 0,
      tracks: a.coll ? (tracks.get(a.coll.collectionId) || []) : [] }));
    return { artist: art.name, artistId: art.artistId, source: mb ? 'musicbrainz' : 'itunes', albums };
  },

  /* ---------- names, spelled the way the index was built ---------- */
  base(s){ return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`´]/g, "'"); },
  core(x){
    return x.replace(/\s+-\s+.*$/, '').replace(/\s*\b(feat|ft|featuring)\b\.?.*$/, '').replace(/&/g, ' and ').replace(/in'(?=\s|$)/g, 'ing')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/^the /, '');
  },
  normTitle(t){
    const b = this.base(t);
    const a = this.core(b.replace(/\s*[(\[][^)\]]*[)\]]/g, ' ')), c = this.core(b.replace(/[()\[\]]/g, ' '));
    return [...new Set([a, c].filter(Boolean))];
  },
  normArtist(a){ return this.base(a).replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/^the /, ''); },
  artistVariants(a){
    const b = this.base(a);
    const parts = [b, ...b.split(/\s*(?:,|&|\band\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\bx\b)\s*/)];
    return [...new Set(parts.map(p => this.normArtist(p)).filter(Boolean))];
  },
  fnv(str){
    const bytes = new TextEncoder().encode(str);
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  },

  /* ---------- the embedded index: "title|artist" -> dataset rows ---------- */
  index: null,
  loadIndex(){
    if (this.index) return this.index;
    let bytes = null;
    if (typeof CHORD_INDEX_BYTES !== 'undefined') bytes = CHORD_INDEX_BYTES;
    else if (typeof document !== 'undefined') {
      const el = document.getElementById('sj-chord-index');
      if (el) { const bin = atob(el.textContent.trim()); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
    }
    if (!bytes || bytes.length < 16) return (this.index = { ok: false });
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== 'SJCI') return (this.index = { ok: false });
    const bits = bytes[5], check = dv.getUint16(6, true), n = dv.getUint32(8, true), nb = 1 << bits;
    const counts = new Uint16Array(bytes.buffer.slice(bytes.byteOffset + 12, bytes.byteOffset + 12 + nb * 2));
    const off = new Uint32Array(nb + 1); for (let i = 0; i < nb; i++) off[i + 1] = off[i] + counts[i];
    const start = 12 + nb * 2;
    const entries = new Uint32Array(bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + start + n * 4));
    return (this.index = { ok: true, bits, check, n, off, entries });
  },
  findKey(key){
    const ix = this.loadIndex(); if (!ix.ok) return [];
    const h = this.fnv(key), b = h >>> (32 - ix.bits), c = (h >>> (32 - ix.bits - ix.check)) & ((1 << ix.check) - 1);
    const out = [];
    for (let i = ix.off[b]; i < ix.off[b + 1]; i++) { const e = ix.entries[i]; if ((e >>> 20) === c) out.push(e & 0xfffff); }
    return out;
  },

  /* ---------- the second chord source: Hooktheory TheoryTab (embedded, gzip JSON) ---------- */
  // Sheet Sage release of the Hooktheory data (Donahue, Thickstun & Liang, ISMIR 2022), CC BY-NC-SA 3.0. Each song has a
  // few audio-aligned clips (usually verse / chorus), with the recording's key and every chord's length in beats.
  HT_CREDIT: 'Hooktheory TheoryTab data (via Sheet Sage, Donahue et al., 2022), CC BY-NC-SA 3.0',
  HT_URL: 'https://github.com/chrisdonahue/sheetsage',
  ht: null,
  async loadHT(){
    if (this.ht !== null) return this.ht;
    try {
      let bytes = typeof HT_BYTES !== 'undefined' ? HT_BYTES : null;
      if (!bytes && typeof document !== 'undefined') {
        const el = document.getElementById('sj-hooktheory');
        if (el) { const bin = atob(el.textContent.trim()); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
      }
      if (!bytes || typeof DecompressionStream === 'undefined') return (this.ht = false);
      const txt = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      this.ht = JSON.parse(txt).songs || false;
    } catch (e) { this.ht = false; }
    return this.ht;
  },
  slug(s){ return this.base(s).replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^the-/, ''); },
  titleSlugs(t){
    const b = this.base(t), np = x => x.replace(/\s*[(\[][^)\]]*[)\]]/g, ' '), nd = x => x.replace(/\s+-\s+.*$/, ''), nf = x => x.replace(/\s*\b(feat|ft|featuring)\b\.?.*$/, '');
    const base = [b, np(b), nd(b), nd(np(b)), nf(b), nf(np(b))];
    return [...new Set([...base, ...base.map(x => x.replace(/ing\b/g, 'in')), ...base.map(x => x.replace(/in'(?=\s|$)/g, 'ing'))].map(x => this.slug(x)).filter(Boolean))];
  },
  artistSlugs(a){
    const b = this.base(a);
    return [...new Set([b, b.replace(/\s*\b(feat|ft|featuring)\b\.?.*$/, ''), b.replace(/\s*(&|,|\band\b|\bwith\b|\bx\b|\bvs\b).*$/, ''), b.replace(/&/g, 'and')].map(x => this.slug(x)).filter(Boolean))];
  },
  // the clips for this recording (original artist only: covers are separate songs in Hooktheory)
  async findHT(track){
    const db = await this.loadHT(); if (!db) return null;
    for (const a of this.artistSlugs(track.artist)) for (const t of this.titleSlugs(track.title)) {
      const c = db[a + '|' + t]; if (!c) continue;
      const seen = new Set(), clips = [];
      for (const [start, bpm, time, key, nkeys, str] of c) {
        const chords = str.split(' ').map(x => { const i = x.lastIndexOf(':'); return { name: x.slice(0, i), beats: +x.slice(i + 1) }; }).filter(x => x.beats > 0 && (x.name === 'N' || parseChord(x.name)));
        const sig = start >= 0 ? 't' + Math.round(start) : 'c' + str;
        if (seen.has(sig) || !chords.some(x => x.name !== 'N')) continue; seen.add(sig);   // two people transcribed the same passage
        const k = /^([A-G][#b]?)(m?)$/.exec(key || ''), kc = k && parseChord(k[1]);
        clips.push({ start, bpm, time, key: kc ? { tonic: kc.root, minor: !!k[2], label: key } : null, keyChanges: nkeys > 1, chords });
      }
      if (clips.length) return { id: a + '|' + t, clips };
    }
    return null;
  },
  // how the Hooktheory chords sit against a chart's chords: the transposition (Hooktheory = chart + h) that makes the
  // most of them line up in order, and how many did
  htMatch(ht, secs){
    const id = n => { const c = parseChord(n); return c ? c.root * 3 + (/^m(?!aj)/.test(c.quality) ? 1 : /dim|m7b5/.test(c.quality) ? 2 : 0) : -1; };
    const seq = []; for (const s of secs) for (const c of s.chords) { const v = id(c); if (v >= 0 && seq[seq.length - 1] !== v) seq.push(v); }
    let best = { h: 0, score: 0, n: 0 }, second = 0;
    for (let h = 0; h < 12; h++) {
      let score = 0, n = 0;
      for (const cl of ht.clips) {
        const xs = []; for (const x of cl.chords) { if (x.name === 'N') continue; const v = id(x.name); if (v < 0) continue; const r = Math.floor(v / 3), q = v % 3; const w = ((r - h + 12) % 12) * 3 + q; if (xs[xs.length - 1] !== w) xs.push(w); }
        // longest common subsequence between this clip and the chart (order kept, gaps allowed)
        const m = seq.length, L = new Uint16Array((xs.length + 1) * (m + 1));
        for (let i = 1; i <= xs.length; i++) for (let j = 1; j <= m; j++) L[i * (m + 1) + j] = xs[i - 1] === seq[j - 1] ? L[(i - 1) * (m + 1) + j - 1] + 1 : Math.max(L[(i - 1) * (m + 1) + j], L[i * (m + 1) + j - 1]);
        score += L[xs.length * (m + 1) + m]; n += xs.length;
      }
      const f = n ? score / n : 0;
      if (f > best.score) { second = best.score; best = { h, score: f, n }; } else if (f > second) second = f;
    }
    best.margin = best.score - second;
    return best;
  },

  /* ---------- other services ---------- */
  async spotifyTitle(kind, id, signal){ const j = await this.getJson(this.OEMBED + encodeURIComponent('https://open.spotify.com/' + kind + '/' + id), { signal, tries: 2, timeout: 10000 }); return j && j.title || ''; },
  async lbIds(track, signal){
    const clean = t => String(t).replace(/\s*[(\[][^)\]]*(remaster|version|mono|stereo|edit|mix|live|deluxe)[^)\]]*[)\]]/gi, '').replace(/\s+-\s+.*(remaster|version|mono|stereo|edit|mix|live).*$/i, '').trim();
    const ids = [];
    for (const rel of [track.album || '', '']) {
      const u = this.LB + '?artist_name=' + encodeURIComponent(track.artist) + '&release_name=' + encodeURIComponent(clean(rel)) + '&track_name=' + encodeURIComponent(clean(track.title));
      try { const j = await this.getJson(u, { signal, timeout: 12000 }); for (const x of (j && j[0] && j[0].spotify_track_ids) || []) if (!ids.includes(x)) ids.push(x); } catch (e) { if (e.name === 'AbortError') throw e; }
      if (ids.length >= 6) break;
    }
    return ids;
  },
  async hfRow(row, signal){
    const j = await this.getJson(this.HF_ROWS + '&offset=' + row + '&length=1', { signal, timeout: 20000, tries: 3 });
    const r = j && j.rows && j.rows[0] && j.rows[0].row;
    if (!r || +r.id !== row + 1) throw new Error('dataset row moved');
    return r;
  },

  // every dataset row for this recording, checked against Spotify's own title
  rowsMemo: new Map(),
  async findRows(track, opts){
    const k = track && track.trackId, m = k && this.rowsMemo.get(k);
    if (m) return m;
    const r = await this.findRowsFresh(track, opts);
    if (k && r.rows.length) { this.rowsMemo.set(k, r); if (this.rowsMemo.size > 60) this.rowsMemo.delete(this.rowsMemo.keys().next().value); }
    return r;
  },
  async findRowsFresh(track, opts){
    opts = opts || {};
    const signal = opts.signal, ix = this.loadIndex();
    if (!ix.ok) return { rows: [], note: 'no-index' };
    const tv = this.normTitle(track.title), av = this.artistVariants(track.artist);
    const tried = new Set(), cands = new Map();
    const tryKeys = (titles, route) => {
      for (const t of titles) for (const a of av) {
        const k = t + '|' + a; if (tried.has(k)) continue; tried.add(k);
        for (const r of this.findKey(k)) if (!cands.has(r)) cands.set(r, { row: r, route, titles: titles.slice() });
      }
    };
    tryKeys(tv, 'title');
    if (!cands.size) {
      const ids = await this.lbIds(track, signal).catch(e => { if (e.name === 'AbortError') throw e; return []; });
      const ts = await Promise.all(ids.slice(0, 8).map(id => this.spotifyTitle('track', id, signal).catch(() => '')));
      tryKeys([...new Set(ts.filter(Boolean).flatMap(t => this.normTitle(t)))], 'listenbrainz');
    }
    const rows = [];
    for (const c of [...cands.values()].slice(0, 6)) {
      let r;
      try { r = await this.hfRow(c.row, signal); } catch (e) { if (e.name === 'AbortError') throw e; continue; }
      let st = null;
      try { st = await this.spotifyTitle('track', r.spotify_song_id, signal); } catch (e) { if (e.name === 'AbortError') throw e; }
      if (st != null && !this.normTitle(st).some(x => c.titles.includes(x) || tv.includes(x))) continue;   // a different song that shares the hash
      rows.push({ row: c.row, route: c.route, verified: st != null, spotifyId: r.spotify_song_id, spotifyTitle: st, data: r, sections: this.parseCN(r.chords) });
    }
    return { rows };
  },

  /* ---------- Chordonomicon's notation -> ours ---------- */
  CNQ: { '':'', 'min':'m', '7':'7', 'min7':'m7', 'no3d':'5', 'maj7':'maj7', 'sus4':'sus4', 'add9':'add9', 'sus2':'sus2', 'add13':'6', '9':'9', '7sus4':'7sus4',
    'dim':'dim', 'add11':'add11', 'min9':'m9', 'minadd13':'m6', 'dim7':'dim7', 'maj9':'maj9', 'aug':'aug', '13':'13', 'min11':'m11', '11':'11', '7sus2':'7sus2',
    'minadd9':'madd9', 'minmaj7':'mmaj7', 'maj7sus2':'maj7sus2', '7b9':'7b9', 'majs9':'maj7', 'augmaj7':'augmaj7', 'minadd11':'madd11', 'maj13':'maj13',
    'maj911s':'maj9', 'min13':'m13', '13b':'7', 'maj7sus4':'maj7sus4', 'augmaj9':'augmaj7', 'dimb7':'m7b5', 'maj11':'maj9', 'dim9':'dim', '13b9':'7b9',
    'majs911s':'maj7', 'minb9':'m', 'minmaj9':'mmaj7', '11b9':'11', '11s':'7', 'maj1311s':'maj13', 'dimb9':'dim', 'dim13b9':'dim7', 'augmaj11':'augmaj7' },
  cnChord(tok){
    const [main, bass] = tok.split('/');
    const m = /^([A-G])(s(?!us)|b)?(.*)$/.exec(main); if (!m) return null;
    const q = this.CNQ[m[3]]; if (q === undefined) return null;
    const acc = m[2] === 's' ? '#' : m[2] === 'b' ? 'b' : '';
    let name = m[1] + acc + q;
    if (bass) { const b = /^([A-G])(s|b)?$/.exec(bass); if (b) name += '/' + b[1] + (b[2] === 's' ? '#' : b[2] === 'b' ? 'b' : ''); }
    return parseChord(name) ? name : null;
  },
  SEC_NAMES: { intro: 'Intro', verse: 'Verse', prechorus: 'Pre-Chorus', chorus: 'Chorus', bridge: 'Bridge', outro: 'Outro', interlude: 'Interlude', instrumental: 'Instrumental', solo: 'Solo' },
  parseCN(str){
    const secs = []; let cur = null;
    for (const t of String(str || '').split(/\s+/)) {
      if (!t) continue;
      const m = /^<([a-z_-]+?)(?:_(\d+))?>$/.exec(t);
      if (m) { const ty = m[1].replace(/[_-]/g, ''); cur = { type: this.SEC_NAMES[ty] ? ty : 'verse', num: +m[2] || 0, chords: [] }; secs.push(cur); continue; }
      const c = this.cnChord(t); if (!c) continue;
      if (!cur) { cur = { type: 'intro', num: 0, chords: [] }; secs.push(cur); }
      cur.chords.push(c);
    }
    const list = secs.filter(s => s.chords.length), count = {};
    list.forEach(s => count[s.type] = (count[s.type] || 0) + 1);
    const seen = {};
    list.forEach(s => { seen[s.type] = (seen[s.type] || 0) + 1; s.name = this.SEC_NAMES[s.type] + (count[s.type] > 1 ? ' ' + seen[s.type] : ''); });
    // a row with no section tags at all is the whole song, not an intro
    if (list.length === 1 && !/<[a-z_-]+>/.test(String(str || ''))) { list[0].type = 'verse'; list[0].name = 'Song'; }
    return list;
  },

  /* ---------- key from chords (shapes as written) ---------- */
  KK_MAJ: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  KK_MIN: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  corr(a, b){ const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n; let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sa && sb ? s / Math.sqrt(sa * sb) : 0; },
  // items: [{name, beats}] in order. Returns {tonic, minor, label, score, margin, scores}.
  // Weights fitted on 12k songs with known keys (McGill Billboard + Hooktheory): pitch-class profile, how much of the
  // song is diatonic to the key, time on the tonic / dominant / subdominant chord, starting and ending on the tonic,
  // V -> I resolutions, and sections that start or end on the tonic. About 80% right from chords alone; the relative major/minor is the usual miss, which the
  // recording then helps settle.
  KEY_W: [1.85, 2.15, 0.6, 0.4, 0.4, 0.37, 0.02, 0.75, 0, 0, 0.45, 0.1],
  keyFeatures(items){
    const seq = items.map(x => ({ ch: parseChord(x.name), w: x.beats || 1, start: !!x.start })).filter(x => x.ch);
    if (!seq.length) return null;
    const total = seq.reduce((a, x) => a + x.w, 0);
    const pc = new Array(12).fill(0);
    for (const { ch, w } of seq) chordPcs(ch).forEach((p, i) => { pc[p] += w * (i === 0 ? 1.4 : 1); });
    const cls = q => /dim|m7b5/.test(q) ? 'd' : /^m(?!aj)/.test(q) ? 'm' : /^5$|sus/.test(q) ? 'x' : 'M';
    const DIA = [{ 0: 'M', 2: 'm', 4: 'm', 5: 'M', 7: 'M', 9: 'm', 11: 'd', 10: 'M' }, { 0: 'm', 2: 'd', 3: 'M', 5: 'm', 7: 'Mm', 8: 'M', 10: 'M' }];
    const out = [];
    for (let t = 0; t < 12; t++) for (const minor of [false, true]) {
      const prof = (minor ? this.KK_MIN : this.KK_MAJ).map((_, i, a) => a[(i - t + 12) % 12]);
      const f = new Array(12).fill(0), D = DIA[minor ? 1 : 0];
      f[0] = this.corr(pc, prof);
      let dia = 0, ton = 0, dom = 0, sub = 0;
      const isT = x => x && x.ch.root === t && (cls(x.ch.quality) === 'x' || cls(x.ch.quality) === (minor ? 'm' : 'M'));
      for (const x of seq) {
        const deg = (x.ch.root - t + 12) % 12, c = cls(x.ch.quality), want = D[deg];
        if (want && (c === 'x' || want.includes(c))) dia += x.w;
        if (isT(x)) ton += x.w;
        if (deg === 7 && c !== 'm') dom += x.w;
        if (deg === 5) sub += x.w;
      }
      f[1] = dia / total; f[2] = ton / total; f[3] = dom / total; f[4] = sub / total;
      f[5] = isT(seq[0]) ? 1 : 0; f[6] = isT(seq[seq.length - 1]) ? 1 : 0;
      let vi = 0, ivi = 0;
      for (let i = 0; i + 1 < seq.length; i++) if (isT(seq[i + 1])) { const a = (seq[i].ch.root - t + 12) % 12; if (a === 7 && cls(seq[i].ch.quality) !== 'm') vi++; if (a === 5) ivi++; }
      f[7] = vi / seq.length; f[8] = ivi / seq.length; f[9] = minor ? 1 : 0;
      // sections that start / end on the tonic chord
      let st = 0, sn = 0, en = 0, ne = 0;
      seq.forEach((x, i) => { if (x.start) { sn++; if (isT(x)) st++; } if (i === seq.length - 1 || seq[i + 1].start) { ne++; if (isT(x)) en++; } });
      f[10] = sn ? st / sn : 0; f[11] = ne ? en / ne : 0;
      out.push({ tonic: t, minor, f, s: f.reduce((a, v, i) => a + v * this.KEY_W[i], 0) });
    }
    return { cands: out, seq };
  },
  keyOf(items, audio){
    const kf = this.keyFeatures(items); if (!kf) return null;
    const scores = kf.cands.map(c => ({ tonic: c.tonic, minor: c.minor, s: c.s + (audio ? audio(c.tonic, c.minor) : 0) }));
    scores.sort((a, b) => b.s - a.s);
    const k = scores[0];
    const flat = kf.seq.some(x => x.ch.flat) || [5, 10, 3, 8, 1].includes(k.tonic) && !k.minor || [2, 7, 0, 5, 10].includes(k.tonic) && k.minor;
    return { tonic: k.tonic, minor: k.minor, label: noteName(k.tonic, flat) + (k.minor ? 'm' : ''), score: k.s, margin: k.s - scores[1].s, scores };
  },
  keyLabel(tonic, minor, flatHint){ const flat = flatHint != null ? flatHint : ([5, 10, 3, 8, 1].includes(tonic) && !minor) || ([2, 7, 0, 5, 10, 3].includes(tonic) && minor); return noteName(tonic, flat) + (minor ? 'm' : ''); },

  /* ---------- lay the chords into bars ---------- */
  // secs: [{name, chords:[names], beats:[per chord]}]; beatsPerBar from the metre
  layout(secs, beatsPerBar){
    return secs.map(s => {
      const beats = [];
      // lengths may be fractional (Hooktheory, tempo scaling): round where each chord starts, so the total stays true
      let pos = 0;
      s.chords.forEach((c, i) => {
        const len = s.beats && s.beats[i] > 0 ? s.beats[i] : beatsPerBar, a = Math.round(pos), b = Math.round(pos + len); pos += len;
        const n = b - a; for (let k = 0; k < n; k++) beats.push(k ? '.' : c);
      });
      if (!beats.length && s.chords.length) beats.push(s.chords[0]);
      while (beats.length % beatsPerBar) beats.push('.');          // finish the last bar
      const bars = [];
      for (let i = 0; i < beats.length; i += beatsPerBar) {
        const b = beats.slice(i, i + beatsPerBar);
        const named = b.map((x, k) => [x, k]).filter(([x]) => x !== '.');
        if (!named.length) bars.push('.');
        else if (named.length === 1 && named[0][1] === 0) bars.push(named[0][0]);
        else if (beatsPerBar % 2 === 0 && named.length === 2 && named[0][1] === 0 && named[1][1] === beatsPerBar / 2) bars.push(named[0][0] + ' ' + named[1][0]);
        else bars.push(b.join(' '));
      }
      return { name: s.name, bars };
    });
  },

  /* ---------- style from the dataset's genre ---------- */
  styleFor(genre, main){
    const g = (String(main || '') + ' ' + String(genre || '')).toLowerCase();
    if (/reggae|ska/.test(g)) return 'reggae';
    if (/punk/.test(g)) return 'punk';
    if (/metal/.test(g)) return 'metal';
    if (/country|bluegrass|americana/.test(g)) return 'country';
    if (/funk|disco/.test(g)) return /disco/.test(g) ? 'disco' : 'funk';
    if (/hip hop|rap|trap/.test(g)) return 'hiphop';
    if (/folk|singer-songwriter|acoustic/.test(g)) return 'folk';
    if (/soul|r&b|motown/.test(g)) return 'ballad';
    if (/bossa|latin/.test(g)) return 'bossa';
    if (/electronic|edm|dance|house/.test(g)) return 'edm';
    if (/pop/.test(g) && !/rock/.test(g)) return 'pop';
    return 'rock';
  },
};
