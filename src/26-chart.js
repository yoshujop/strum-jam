/* =====================================================================
   Chart: turn a picked recording into a playable chart.
   Dataset chords (or, only when the song isn't in the dataset, chords that
   Claude reads off at least two chord sources on the web) + a check against
   the recording's preview + timing. Anything the checks can't settle becomes
   a question on the confirm screen instead of a guess. Finished charts are
   cached per recording, so each song is only looked up once.
   ===================================================================== */
const Chart = {
  // fitted on songs with known keys (see test/charttest.js): how far ahead the best transposition must be to count,
  // and how much the recording's key profile weighs against the chords' own
  OFFSET_MARGIN: 0.01, OFFSET_MARGIN_FIRM: 0.04, W_AUDIO: 2, W_PV: 1, W_CH: 1, W_HT: 3, W_WEB: 1, TIMING: 'context',
  /* ---------- cache ---------- */
  workKey(track){ return 'w:' + (Lookup.normTitle(track.title)[0] || '') + '|' + (Lookup.artistVariants(track.artist)[0] || ''); },
  cacheKey(track){ return track.trackId ? 'it' + track.trackId : this.workKey(track); },
  cached(track){
    const c = Store.get('charts', {}) || {};
    let o = c[this.cacheKey(track)];
    if (!o && track.title) { const w = c[this.workKey(track)]; o = typeof w === 'string' ? c[w] : w; }   // the same song under another recording id
    if (!o || typeof o !== 'object') return null;
    try { return validateSong(o, o.source || 'dataset'); } catch (e) { return null; }
  },
  remember(track, song){
    const c = Store.get('charts', {}) || {}, k = this.cacheKey(track); c[k] = song;
    const t = track.title ? track : song; if (t.title && k !== this.workKey(t)) c[this.workKey(t)] = k;
    const keys = Object.keys(c).filter(x => typeof c[x] === 'object');
    if (keys.length > 80) keys.sort((a, b) => (c[a].savedAt || 0) - (c[b].savedAt || 0)).slice(0, keys.length - 80).forEach(x => delete c[x]);
    for (const x of Object.keys(c)) if (typeof c[x] === 'string' && !c[c[x]]) delete c[x];
    Store.set('charts', c);
  },

  /* ---------- the pipeline ---------- */
  // opts: {signal, onStep(key, text), ai: bool (Claude for timing), web: bool (Claude + web search; defaults to ai),
  //        askClaude(prompt, signal, extra), forceWeb, noHT (leave the Hooktheory source out), pcm}
  // Claude timing for dataset charts: off. The accuracy test scores (89%) were measured without it, and the
  // recording + Hooktheory already give the lengths, so it only cost money.
  ASK_TIMING: false,
  FIT_WEB: 0.8,        // a dataset chart that matches less of the preview than this goes to the web backup by itself
  async make(track, opts){
    opts = opts || {};
    const step = (k, t) => opts.onStep && opts.onStep(k, t);
    const signal = opts.signal, canWeb = opts.web != null ? !!opts.web : !!opts.ai;
    // the starter pack: hand-written full arrangements, ready at once and with no network
    if (!opts.forceWeb && !opts.noPack) {
      const p = Lookup.findPack(track);
      if (p) { step('build', 'This one is in the starter pack.'); return this.fromPack(p, track); }
    }
    const offline = !!opts.offline || !!track.local || Lookup.isOffline();
    step('find', 'Looking the song up in the chord datasets…');
    let found = { rows: [] };
    if (!opts.forceWeb && !offline) {
      try { found = await Lookup.findRows(track, { signal }); } catch (e) { if (e.name === 'AbortError') throw e; found = { rows: [], error: String(e && e.message || e), failed: 1, hits: 1 }; }
    } else if (offline && !opts.forceWeb) {
      const tv = Lookup.normTitle(track.title), av = Lookup.artistVariants(track.artist);
      found = { rows: [], offline: true, hits: tv.some(t => av.some(a => Lookup.findKey(t + '|' + a).length)) ? 1 : 0, failed: 1 };
    }
    // the second dataset (Hooktheory): parts of the song with their real lengths and the recording's key
    let ht = null;
    if (!opts.noHT) { try { ht = await Lookup.findHT(track); } catch (e) { ht = null; } }
    let src = 'dataset', web = null, webErr = null, cands = found.rows, auto = null;
    const tryWeb = async why => {
      step('web', why);
      try { web = await this.webChart(track, opts); return true; }
      catch (e) { if (e.name === 'AbortError') throw e; webErr = e; return false; }
    };
    if (!cands.length) {
      if (canWeb && await tryWeb(ht ? 'Only parts of this song are in the datasets. Asking Claude to read chord sources on the web for the rest…' : 'Not in the chord datasets. Asking Claude to read chord sources on the web…')) {
        src = 'web'; cands = [{ sections: web.sections, web: true }];
      } else if (ht) {
        src = 'hooktheory'; cands = [this.htArrange(ht, track)];
      } else if (webErr) throw webErr;
      else throw this.notFound(found, offline);
    }
    // the recording: tempo, beats, key, and where each chart sits against it
    step('listen', 'Listening to the preview to check the key and chords…');
    let pcm = null, frames = null, audioErr = '';
    // a Hooktheory chart is a transcription of this recording with its own tempo: nothing to wait for
    const skipListen = offline || (src === 'hooktheory' && cands[0].bpmKnown && !opts.listen);
    if (skipListen) audioErr = offline ? 'Offline.' : '';
    else if (track.previewUrl && typeof Analyze !== 'undefined') {
      try { pcm = opts.pcm || await Analyze.fetchPcm(track.previewUrl, signal); }
      catch (e) { if (e.name === 'AbortError') throw e; audioErr = e && e.code === 'preview_http' ? 'The preview couldn’t be downloaded.' : /decode/i.test(String(e && e.message)) || e && e.name === 'EncodingError' ? 'This browser couldn’t decode the preview.' : 'The preview couldn’t be read from this page (blocked by the browser).'; }
      if (pcm && typeof Listen !== 'undefined') {
        try { frames = await Listen.batch(pcm, p => step('listen', `Listening to the preview… ${Math.round(p * 100)}%`)); } catch (e) { frames = null; }
      }
    } else audioErr = 'No preview for this recording.';
    if (typeof window !== 'undefined' && window.SJ_DEBUG) window.SJ_LAST = { frames, pcm };
    const analyse = c => { if (!pcm || c.an !== undefined) return; try { c.an = Analyze.run(pcm, frames, { secs: c.sections }, { bpm: web && web.bpm }); } catch (e) { console.warn('analyze', e); c.an = null; } };
    const ratio = c => c.an ? c.an.fit / (c.an.free || 1) : null;
    cands.slice(0, 4).forEach(analyse);
    // a dataset row whose title couldn't be checked (the index is hashed: 1 key in 200 hits a stranger) needs a second
    // opinion before it is used: the recording's preview or Hooktheory's transcription must agree with it
    if (src === 'dataset') {
      const agrees = c => c.verified !== false || (c.an && ratio(c) >= 0.6) || !!(ht && (m => m.score >= 0.6 && m.margin >= 0.1)(Lookup.htMatch(ht, c.sections)));
      const ok = cands.filter(agrees);
      if (ok.length) cands = ok;
      else if (ht) { src = 'hooktheory'; cands = [this.htArrange(ht, track)]; }
      else throw Object.assign(new Error('unverified'), { code: 'unverified' });
    }
    // Hooktheory had no tempo for this song but the preview does: arrange again on the recording's clock
    if (src === 'hooktheory' && !cands[0].bpmKnown && cands[0].an && cands[0].an.bpm) { const an0 = cands[0].an; cands = [this.htArrange(ht, track, { bpm: an0.bpm })]; cands[0].an = an0; }
    // several dataset versions of the same song: keep the one that fits the recording best (then the fullest)
    const len = c => c.sections.reduce((a, s) => a + s.chords.length, 0);
    cands.sort((a, b) => (b.an ? b.an.fit + b.an.margin * 2 : 0) - (a.an ? a.an.fit + a.an.margin * 2 : 0) || len(b) - len(a));
    let pick = cands[0];
    // a dataset chart that fits the recording poorly: straight to the web backup (when there's an API key)
    if (src === 'dataset' && pick.an && ratio(pick) < this.FIT_WEB && canWeb && !web) {
      auto = { from: 'dataset', fit: +ratio(pick).toFixed(3) };
      if (await tryWeb(`The dataset chart only partly matches the recording (${Math.round(ratio(pick) * 100)}%). Asking Claude to read chord sources on the web…`)) {
        const wc = { sections: web.sections, web: true }; analyse(wc);
        auto.webFit = wc.an ? +ratio(wc).toFixed(3) : null;
        // the web chart wins unless it matches the recording clearly worse than the dataset one
        if (!wc.an || ratio(wc) >= ratio(pick) - 0.05) { pick = wc; src = 'web'; auto.used = 'web'; }
        else { auto.used = 'dataset'; web = null; }
      } else { auto.used = 'dataset'; auto.webErr = webErr && (webErr.code || webErr.message) || 'failed'; }
    }
    const an = pick.an || null;
    // Hooktheory against the chosen chart: which transposition lines them up, for the key, the pitch and the timing
    let htm = null;
    if (ht) { const m = pick.ht ? { h: 0, score: 1, margin: 1 } : Lookup.htMatch(ht, pick.sections); if (m.score >= 0.6 && m.margin >= 0.1) htm = { ...m, ht }; }
    let htFix = null;
    if (htm && !pick.ht) {
      const r = this.htCorrect(pick.sections, htm);
      htFix = { fixed: r.fixed, clips: r.used };
      if (r.fixed) pick = { ...pick, sections: r.secs.map((x, i) => ({ ...x, beats: x.beats && x.beats.length === x.chords.length ? x.beats : pick.sections[i].beats })) };
    }
    // timing: the recording and Hooktheory first, Claude for timing only when it helps, then defaults
    let timing = null;
    if (pick.web && web && pick.sections.every(s => s.beats)) timing = { bpm: web.bpm, time: web.time, feel: web.feel, style: web.style, sections: pick.sections.map(s => ({ beats: s.beats })) };
    else if (opts.ai && !pick.ht && this.ASK_TIMING) {
      step('timing', 'Asking Claude for the tempo and how long each chord lasts…');
      try { timing = await this.askTiming(track, pick.sections, opts); } catch (e) { if (e.name === 'AbortError') throw e; timing = null; }
    }
    step('build', 'Laying the chords into bars…');
    const song = this.build(track, pick, an, timing, src, web, audioErr, found, { htm, auto, webErr, htFix });
    if (opts.raw) return song;
    if (typeof window !== 'undefined' && window.SJ_DEBUG && an) song.debug = { cn: pick.sections.map(x => ({ name: x.name, type: x.type, chords: x.chords })), hist: an.hist, histBass: an.histBass, kf: song._kf, ak: an.key && an.key.scores.map(x => [x.tonic, x.minor, +x.s.toFixed(4)]), beatTop: an.beatTop, visits: an.visits, offsets: an.offsets, bpm: an.bpm, key: an.key && [an.key.tonic, an.key.minor, an.key.margin], chordFit: an.chordFit, durations: an.durations, triplet: an.triplet, triple: an.triple, cands: cands.map(c => ({ row: c.row, fit: c.an && c.an.fit, margin: c.an && c.an.margin, n: len(c) })), ks: song._ks, htm: htm && { h: htm.h, score: htm.score, margin: htm.margin } };
    return song;
  },
  // why there is no chart: the data couldn't be reached ('offline': retry), the row couldn't be confirmed
  // ('unverified'), or the song really isn't in the data ('not_in_dataset': paste a sheet / web lookup)
  notFound(found, offline){
    if (found.note === 'no-index') return Object.assign(new Error('no index'), { code: 'no_index' });
    if (found.hits && (found.failed || found.error)) return Object.assign(new Error('chord data unreachable'), { code: 'offline', inIndex: true });
    if (offline) return Object.assign(new Error('offline, not in the built-in songs'), { code: 'offline_nf' });
    return Object.assign(new Error('not in dataset'), { code: 'not_in_dataset' });
  },
  // a starter-pack entry as a finished song
  fromPack(p, track){
    const o = packSong(p);
    return finishChart({ ...o, title: track.trackId ? track.title : o.title, artist: track.trackId ? track.artist : o.artist, album: track.album || '', year: track.year || p.y || 0,
      trackId: String(track.trackId || ''), durationMs: track.durationMs || 0, previewUrl: track.previewUrl || '', art: track.art || '',
      id: track.trackId ? 'rec-' + track.trackId : 'pk-' + slug(o.title + '-' + o.artist),
      prov: { src: 'pack', checked: false, verified: true, status: 'ok', issues: [], form: 'source', tempo: { raw: o.bpm, rule: '', from: 'pack', conf: 'high' }, bpmFrom: 'starter pack' }, savedAt: Date.now() },
      { easy: false, hint: p });
  },
  // Hooktheory as a second opinion on the chart's chords: each clip is lined up with the stretch of the chart it
  // transcribes (local alignment on root + major/minor); where the two disagree on a chord, the Hooktheory chord (a
  // transcription of this recording) is used, there and wherever the chart repeats that exact stretch.
  htCorrect(secs, htm){
    const toks = []; secs.forEach((sec, si) => sec.chords.forEach((c, ci) => toks.push({ si, ci, name: c, id: this.cid(c) })));
    const out = secs.map(x => ({ ...x, chords: x.chords.slice() }));
    let fixed = 0, used = 0;
    const M = 2, X = -1.5, G = -1;
    for (const cl of htm.ht.clips) {
      const ys = [];
      for (const x of cl.chords) { if (x.name === 'N') continue; const nm = transposeName(x.name, (12 - htm.h) % 12), id = this.cid(nm); if (id < 0) continue; if (ys.length && ys[ys.length - 1].id === id) continue; ys.push({ name: nm, id }); }
      if (ys.length < 3) continue;
      // collapse the chart the same way, remembering where each chord came from
      const xs = []; for (const t of toks) { if (xs.length && xs[xs.length - 1].id === t.id) { xs[xs.length - 1].at.push(t); continue; } xs.push({ id: t.id, at: [t] }); }
      const n = ys.length, m = xs.length, W = m + 1, H = new Float32Array((n + 1) * W), P = new Uint8Array((n + 1) * W);
      let best = 0, bi = 0, bj = 0;
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
        const d = H[(i - 1) * W + j - 1] + (ys[i - 1].id === xs[j - 1].id ? M : X), u = H[(i - 1) * W + j] + G, l = H[i * W + j - 1] + G;
        let v = 0, pp = 0; if (d > v) { v = d; pp = 1; } if (u > v) { v = u; pp = 2; } if (l > v) { v = l; pp = 3; }
        H[i * W + j] = v; P[i * W + j] = pp; if (v > best) { best = v; bi = i; bj = j; }
      }
      const pairs = []; let i = bi, j = bj;
      while (i > 0 && j > 0 && P[i * W + j]) { const pp = P[i * W + j]; if (pp === 1) { pairs.push([i - 1, j - 1]); i--; j--; } else if (pp === 2) i--; else j--; }
      if (!pairs.length) continue;
      const same = pairs.filter(([a, b]) => ys[a].id === xs[b].id).length, span = pairs[0][0] - pairs[pairs.length - 1][0] + 1;
      // only a clip that clearly is this stretch of the chart (most of it lines up, most chords agree)
      if (span < ys.length * 0.7 || same < pairs.length * 0.6 || same < 3) continue;
      used++;
      const subs = pairs.filter(([a, b]) => ys[a].id !== xs[b].id);
      if (!subs.length) continue;
      // the same chord between the same neighbours is the same passage elsewhere in the song (a repeated verse or
      // riff), so the correction goes there too
      const ctx = k => (k > 0 ? xs[k - 1].id : -9) + '|' + xs[k].id + '|' + (k + 1 < xs.length ? xs[k + 1].id : -9);
      // only a disagreement with agreeing neighbours on both sides (a clean one-chord substitution) becomes a rule
      const pairAt = new Map(pairs.map(([a, b]) => [a, b]));
      const rule = new Map();
      for (const [a, b] of subs) {
        const pb = pairAt.get(a - 1), nb = pairAt.get(a + 1);
        if (pb === b - 1 && nb === b + 1 && ys[a - 1].id === xs[b - 1].id && ys[a + 1].id === xs[b + 1].id) rule.set(ctx(b), ys[a].name);
        else for (const t of xs[b].at) if (out[t.si].chords[t.ci] !== ys[a].name) { out[t.si].chords[t.ci] = ys[a].name; fixed++; }   // just here
      }
      for (let k = 0; k < xs.length; k++) { const nm = rule.get(ctx(k)); if (!nm) continue; for (const t of xs[k].at) if (out[t.si].chords[t.ci] !== nm) { out[t.si].chords[t.ci] = nm; fixed++; } }
    }
    return { secs: out, fixed, used };
  },
  // a chart from the Hooktheory clips alone (no full-song source): the parts it has, in the order they're played
  htSections(ht){
    const clips = ht.clips.slice().sort((a, b) => (a.start < 0 ? 1e9 : a.start) - (b.start < 0 ? 1e9 : b.start));
    const mmss = t => `${Math.floor(t / 60)}:${String(Math.round(t) % 60).padStart(2, '0')}`;
    return clips.map((c, i) => {
      const chords = [], beats = [];
      for (const x of c.chords) {
        if (x.name === 'N') { if (beats.length) beats[beats.length - 1] += x.beats; continue; }   // a gap just lets the chord ring on
        if (chords.length && chords[chords.length - 1] === x.name) beats[beats.length - 1] += x.beats; else { chords.push(x.name); beats.push(x.beats); }
      }
      return { name: `Part ${i + 1}` + (c.start >= 0 ? ` (${mmss(c.start)})` : ''), type: 'verse', chords, beats, htBeats: true, bpm: c.bpm, time: c.time };
    }).filter(s => s.chords.length);
  },

  // chords with lengths in felt beats -> whole bars. Each chord's start goes to the nearest beat; a start half a beat
  // early is a push and moves onto the beat it anticipates; chords squeezed to nothing are dropped.
  barsOf(chords, beats, bpb){
    let pos = 0; const it = [];
    chords.forEach((name, i) => { let st = Math.round(pos * 2) / 2; if (st % 1) st = Math.ceil(st); it.push({ name, st, len: beats[i] }); pos += beats[i]; });
    const end = Math.max(1, Math.round(pos / bpb)) * bpb, keep = [];
    for (const x of it) {
      if (x.st >= end) break;
      const last = keep[keep.length - 1];
      if (last && last.st === x.st) { if (x.len > last.len) keep[keep.length - 1] = x; continue; }
      if (last && last.name === x.name) continue;
      keep.push(x);
    }
    if (!keep.length) return [];
    keep[0].st = 0;
    const lens = keep.map((x, i) => (i + 1 < keep.length ? keep[i + 1].st : end) - x.st);
    // every bar names its chord (a bar that only holds the last one repeats it), so any slice of bars stands by itself
    let last = keep[0].name;
    return Lookup.layout([{ name: '', chords: keep.map(x => x.name), beats: lens }], bpb)[0].bars.map(b => {
      const t = b.split(' '); if (t[0] === '.') t[0] = last;
      for (const x of t) if (x !== '.') last = x;
      return t.length > 1 && t.slice(1).every(x => x === '.') ? t[0] : t.join(' ');
    });
  },
  // A full, playable song from Hooktheory's clips. The clips are passages of the recording with their start times, so
  // when the recording's length is known the chart is laid along the recording: each passage sits at its own bar, and
  // the bars between are filled by cycling the passages (verse, chorus, verse...). Without times it follows a plain
  // song form. Either way the order and repeats are a best guess: approx is set and every filled section is marked.
  // o: { bpm } the recording's tempo when Hooktheory has none.
  htArrange(ht, track, o){
    o = o || {};
    const hint = typeof songHint === 'function' ? songHint(track.title, track.artist) : null;
    // 1. each clip: chords + lengths, felt tempo and metre
    let clips = ht.clips.map(c => {
      const chords = [], beats = [];
      for (const x of c.chords) {
        if (x.name === 'N') { if (beats.length) beats[beats.length - 1] += x.beats; continue; }   // a gap lets the chord ring on
        if (chords.length && chords[chords.length - 1] === x.name) beats[beats.length - 1] += x.beats; else { chords.push(x.name); beats.push(x.beats); }
      }
      const nt = normalizeTempo(c.bpm, c.time, beats);
      return { start: c.start, raw: c.bpm, chords, beats, felt: nt.bpm, time: nt.time, scale: nt.scale, rule: nt.rule, total: beats.reduce((a, b) => a + b, 0) };
    }).filter(c => c.chords.length);
    // the metre most of the music is in
    const tw = {}; clips.forEach(c => tw[c.time] = (tw[c.time] || 0) + c.total * c.scale);
    const time = Object.keys(tw).sort((a, b) => tw[b] - tw[a])[0] || '4/4';
    const T = parseTime(time), bpb = T.beats;
    // one tempo: the median clip, the others folded to its octave (their beat counts are theirs: only x2 or /2, never rescaled)
    const med = () => { const f = clips.filter(c => c.felt > 0).map(c => c.felt).sort((a, b) => a - b); return f.length ? f[(f.length - 1) >> 1] : 0; };
    const rules = new Set();
    let ref = med();
    for (const c of clips) {
      if (c.rule) rules.add(c.rule);
      if (!(c.felt > 0) || !ref) continue;
      const k = [0.5, 1, 2].sort((x, y) => Math.abs(Math.log2(c.felt * x / ref)) - Math.abs(Math.log2(c.felt * y / ref)))[0];
      if (k !== 1) { c.felt *= k; c.scale *= k; rules.add('clip folded'); }
    }
    ref = Math.round(med());                                       // the median again, now that they agree on the octave
    let bpm = ref, bpmFrom = 'hooktheory';
    if (!bpm) { bpm = o.bpm ? Math.round(o.bpm) : hint && hint.bpm ? hint.bpm : 0; bpmFrom = o.bpm ? 'recording' : bpm ? 'hint' : 'default'; }
    const bpmKnown = bpm > 0; if (!bpm) bpm = 100;
    // a hint that is the same tempo at another octave wins the octave (the rule is right most of the time, not always)
    // and a hint that disagrees outright is believed for the tempo (the bars stay as transcribed)
    if (hint && hint.bpm && ref) {
      const r = hint.bpm / bpm, k = [0.5, 2].find(x => Math.abs(Math.log2(r / x)) < 0.17);
      if (k) { clips.forEach(c => { c.scale *= k; }); bpm = Math.round(bpm * k); rules.add('octave from the song notes'); }
      else if (!hint.soft && Math.abs(Math.log2(r)) > 0.17) { bpm = hint.bpm; bpmFrom = 'hint'; rules.add('tempo from the song notes'); }
    }
    // 2. bars; clips with the same bars are the same passage
    const parts = [], occ = [];
    clips.sort((a, b) => (a.start < 0 ? 1e9 : a.start) - (b.start < 0 ? 1e9 : b.start));
    for (const c of clips) {
      const bars = this.barsOf(c.chords, c.beats.map(b => b * c.scale), bpb); if (!bars.length) continue;
      const sig = bars.join('|');
      let p = parts.find(x => x.sig === sig || x.sig.startsWith(sig + '|') || sig.startsWith(x.sig + '|'));
      if (!p) parts.push(p = { sig, bars, chords: c.chords, beats: c.beats.map(b => b * c.scale) });
      else if (sig.length > p.sig.length) { p.sig = sig; p.bars = bars; p.chords = c.chords; p.beats = c.beats.map(b => b * c.scale); }
      occ.push({ part: p, start: c.start });
    }
    if (!parts.length) return { ht: true, sections: [], laid: [], bpm, time, bpmKnown };
    // 3. roles: in order of appearance verse, chorus, bridge; a short passage right at the top of a 3+ part song is the intro
    const one = parts.length === 1;
    let rest = parts.slice();
    if (parts.length >= 3 && occ[0].start >= 0 && occ[0].start < 8 && occ[0].part.bars.length <= 8 && occ.filter(x => x.part === occ[0].part).length === 1) { occ[0].part.role = 'intro'; rest = parts.filter(p => p !== occ[0].part); }
    rest.forEach((p, i) => { p.role = ['verse', 'chorus', 'bridge'][i] || 'interlude'; });
    const main = rest.filter(p => p.role === 'verse' || p.role === 'chorus');
    const segs = [];
    const push = (part, bars, role, approx, at) => { if (bars.length) segs.push({ part, bars, role: role || part.role, approx: !!approx, at }); };
    const cyc = (p, n, from) => Array.from({ length: n }, (_, i) => p.bars[((from || 0) + i) % p.bars.length]);
    // fill n bars by cycling the main passages, starting after `prev`
    const fill = (n, prev) => {
      let i = prev ? (main.indexOf(prev) + 1) % main.length : 0;
      while (n > 0) {
        const p = main[i % main.length], take = Math.min(p.bars.length, n), last = segs[segs.length - 1];
        if (take < Math.min(4, p.bars.length) && last) last.bars.push(...cyc(last.part, take, last.bars.length));   // a stub: the section before runs on
        else push(p, p.bars.slice(0, take), null, true);
        n -= take; i++;
      }
    };
    const barSec = bpb * 60 / bpm, dur = track.durationMs ? track.durationMs / 1000 : 0, MAXB = 228;
    const timed = occ.filter(x => x.start >= 0);
    let form, anchors = null;
    if (dur > 30 && bpmKnown && timed.length) {
      // along the recording
      form = 'anchored';
      const total = Math.min(MAXB, Math.max(8, Math.round(dur / barSec)));
      const placed = [];
      for (const x of timed) { const bar = Math.round(x.start / barSec); if (bar < total - 1 && (!placed.length || bar > placed[placed.length - 1].bar)) placed.push({ ...x, bar }); }
      const lead = placed.length ? placed[0].bar : total;
      if (lead > 0) {
        const p0 = placed.length ? placed[0].part : main[0], n = lead <= 8 ? lead : (lead % p0.bars.length) || Math.min(4, p0.bars.length);
        push(p0, cyc(p0, n, p0.bars.length * 8 - n), 'intro', true);       // the bars that lead into the passage
        if (lead > n) fill(lead - n, null);
      }
      placed.forEach((x, j) => {
        const end = j + 1 < placed.length ? placed[j + 1].bar : total, n = Math.min(x.part.bars.length, end - x.bar);
        const prev = segs[segs.length - 1];
        // the lead-in bars and the transcribed intro are one intro
        if (j === 0 && x.part.role === 'intro' && prev && prev.role === 'intro' && segs.length === 1) { prev.bars.push(...x.part.bars.slice(0, n)); prev.at = { start: x.start, lead: lead }; }
        else push(x.part, x.part.bars.slice(0, n), null, false, x);
        if (end - x.bar - n > 0) fill(end - x.bar - n, main.includes(x.part) ? x.part : null);
      });
      const lastSeg = segs[segs.length - 1];
      if (lastSeg && lastSeg.approx && lastSeg.bars.length <= 4 && segs.length > 2) lastSeg.role = 'outro';
      anchors = [[0, 0]];
      let bar = 0;
      for (const sg of segs) { const b = (bar + (sg.at && sg.at.lead || 0)) * bpb; if (sg.at && sg.at.start > anchors[anchors.length - 1][0] + 1 && b > anchors[anchors.length - 1][1]) anchors.push([sg.at.start, b]); bar += sg.bars.length; }
      if (dur > anchors[anchors.length - 1][0] + 1 && Math.round(dur / barSec) <= MAXB) anchors.push([dur, bar * bpb]);
    } else {
      // a plain song form, about as long as the recording (or 2:45 when that isn't known)
      form = one ? 'loop' : 'template';
      const target = Math.min(MAXB, Math.max(16, Math.round((dur > 30 ? dur : 165) / barSec)));
      const V = main[0], C = main[1] || main[0], B = rest.find(p => p.role === 'bridge'), I = parts.find(p => p.role === 'intro');
      let n = 0; const add = (p, bars, role) => { push(p, bars, role, true); n += bars.length; };
      if (I) add(I, I.bars, 'intro'); else add(V, cyc(V, Math.min(4, V.bars.length)), 'intro');
      const order = one ? [V] : [V, C];
      let i = 0, bridged = !B;
      while (n + order[i % order.length].bars.length / 2 < target && segs.length < 30) {
        const p = order[i % order.length]; add(p, p.bars); i++;
        if (!bridged && i >= 4 && i % 2 === 0) { add(B, B.bars); bridged = true; i++; }       // verse chorus verse chorus BRIDGE chorus
      }
      if (i < 2) add(order[i % order.length], order[i % order.length].bars);
    }
    // 4. names: Verse 1, Chorus 1, Verse 2... A one-passage song is honest about it: "Round n"
    const NM = { intro: 'Intro', verse: 'Verse', chorus: 'Chorus', bridge: 'Bridge', interlude: 'Interlude', outro: 'Outro' };
    const count = {}, seen = {};
    const label = sg => one && (sg.role === 'verse' || sg.role === 'chorus') ? 'Round' : NM[sg.role];
    segs.forEach(sg => { const l = label(sg); count[l] = (count[l] || 0) + 1; });
    let flip = 0;
    const laid = segs.slice(0, 40).map(sg => {
      const l = label(sg); seen[l] = (seen[l] || 0) + 1;
      // a one-passage song still builds: alternate rounds hit like a verse and like a chorus
      const type = l === 'Round' ? (flip++ % 2 ? 'chorus' : 'verse') : sg.role;
      return { name: l + (count[l] > 1 ? ' ' + seen[l] : ''), type, bars: sg.bars, approx: sg.approx };
    });
    const nClips = ht.clips.length;
    const note = one ? `Only one passage of this song has been transcribed (${parts[0].bars.length} bars). The chart repeats it for the length of the song, so the structure is approximate.`
      : `Built from ${parts.length} transcribed passages of the recording${form === 'anchored' ? ', placed where they are played' : ''}. The bars between them and the repeats are a best guess, so the structure is approximate.`;
    return { ht: true, laid, form, anchors, approx: true, note, bpm, time, bpmKnown, bpmFrom, tempoRaw: clips.map(c => c.raw).filter(x => x > 0).sort((a, b) => a - b)[0] || 0, tempoRule: [...rules].join(', '),
      sections: parts.map((p, i) => ({ name: NM[p.role] || 'Part ' + (i + 1), type: p.role === 'interlude' ? 'verse' : p.role, chords: p.chords, beats: p.beats, htBeats: true })), clips: nClips, parts: parts.length };
  },

  /* ---------- timing ---------- */
  // a chord for the timing tables: root + major/minor/diminished (so "A7" and "A" share what's been seen)
  cid(name){ const c = parseChord(name); return c ? c.root * 3 + (/^m(?!aj)/.test(c.quality) ? 1 : /dim|m7b5/.test(c.quality) ? 2 : 0) : -1; },
  // extra: { htm: Hooktheory match {h, ht}, htChart: the sections are Hooktheory clips with their own lengths }
  merge(secs, an, timing, fallbackBpm, extra){
    extra = extra || {};
    const snapOct = (x, ref) => [0.5, 1, 2, 2 / 3, 1.5, 3, 1 / 3].map(k => x * k).sort((p, q) => Math.abs(Math.log2(p / ref)) - Math.abs(Math.log2(q / ref)))[0];
    // tempo and metre
    let bpm = an && an.bpm || 0, time = '4/4';
    const tb = timing && timing.bpm;
    if (tb) {
      if (bpm) { const r = snapOct(bpm, tb); bpm = Math.abs(Math.log2(r / tb)) < 0.08 ? r : tb; }
      else bpm = tb;
    }
    // no recording and no web timing: Hooktheory's tempo for this recording (felt), else worked out from the length below
    let bpmFrom = an && an.bpm ? 'recording' : tb ? 'timing' : '', htTime = '';
    if (!bpm && extra.htm) {
      const cs = extra.htm.ht.clips.filter(c => c.bpm > 0).map(c => normalizeTempo(c.bpm, c.time, c.chords.filter(x => x.name !== 'N').map(x => x.beats))).sort((x, y) => x.bpm - y.bpm);
      if (cs.length) { const c = cs[(cs.length - 1) >> 1]; bpm = c.bpm; htTime = c.time; bpmFrom = 'hooktheory'; }
    }
    const unknown = !bpm;
    if (!bpm) bpm = fallbackBpm || 100;
    if (timing && TIMES.includes(timing.time)) time = timing.time;
    else if (htTime && !(an && an.bpm)) time = htTime;
    else if (an && an.triple) time = '3/4';
    else if (an && an.triplet && bpm < 80) time = '12/8';
    const T = parseTime(time), bpb = T.beats;
    let from = { audio: 0, claude: 0, hooktheory: 0, default: 0 };
    // beats per chord, as seen in the recording's preview and in the Hooktheory clips
    const ratio = an && an.bpm ? bpm / an.bpm : 1;     // the analysis counted beats at its own tempo
    const obs = new Map(), obs2 = new Map(), obsSec = new Map();
    const add = (m, k, b) => (m.get(k) || m.set(k, []).get(k)).push(b);
    if (an && an.visits) {
      const toks = an.toks;
      for (const v of an.visits) {
        if (v.cut) continue;
        const b = Math.max(1, Math.round(v.beats * ratio));
        const p = toks[v.i - 1] ? this.cid(toks[v.i - 1].name) : '^', c = this.cid(v.name), n = toks[v.i + 1] ? this.cid(toks[v.i + 1].name) : '$';
        add(obs, p + '|' + c + '|' + n, b); add(obs2, c + '|' + n, b);
        const st = secs[v.sec] ? secs[v.sec].type : '';
        add(obsSec, st, b);
      }
    }
    if (extra.htm) {
      const h = extra.htm.h;
      for (const cl of extra.htm.ht.clips) {
        if (!(cl.bpm > 0)) continue;
        // its beats, counted at our tempo: the same pulse, or a clean multiple of it (its transcriber counted in
        // eighths, or in bars of three). Never a free rescale: that smears every chord across the bar lines.
        const f = [1 / 3, 0.5, 1, 2, 3].sort((x, y) => Math.abs(Math.log2(bpm / cl.bpm / x)) - Math.abs(Math.log2(bpm / cl.bpm / y)))[0];
        if (!unknown && Math.abs(Math.log2(bpm / cl.bpm / f)) > 0.2) continue;   // a different tempo altogether: its lengths don't apply
        const toks = [];
        for (const x of cl.chords) {
          if (x.name === 'N') { if (toks.length) toks[toks.length - 1].beats += x.beats; continue; }
          const c = parseChord(x.name); if (!c) continue;
          const id = ((c.root - h + 12) % 12) * 3 + (this.cid(x.name) % 3);
          if (toks.length && toks[toks.length - 1].id === id) toks[toks.length - 1].beats += x.beats; else toks.push({ id, beats: x.beats });
        }
        toks.forEach((t, i) => {
          if (i === 0 || i === toks.length - 1) return;            // the clip's edges may be cut short
          const b = Math.max(1, Math.round(t.beats * f));
          const p = toks[i - 1].id, n = toks[i + 1].id;
          for (let w = 0; w < 2; w++) { add(obs, p + '|' + t.id + '|' + n, b); add(obs2, t.id + '|' + n, b); }   // people's transcriptions count double
        });
      }
    }
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const all = [...obsSec.values()].flat();
    const snap = b => { const opts = [1, 2, 3, 4, 6, 8, 12, 16]; return opts.reduce((x, y) => Math.abs(y - b) < Math.abs(x - b) ? y : x); };
    const out = secs.map((s, si) => {
      const tb2 = timing && timing.sections && timing.sections[si] && Array.isArray(timing.sections[si].beats) && timing.sections[si].beats.length === s.chords.length ? timing.sections[si].beats : null;
      const beats = s.chords.map((c, i) => {
        const pn = s.chords[i - 1] || (secs[si - 1] ? secs[si - 1].chords[secs[si - 1].chords.length - 1] : null), nn = s.chords[i + 1] || (secs[si + 1] ? secs[si + 1].chords[0] : null);
        const p = pn ? this.cid(pn) : '^', n = nn ? this.cid(nn) : '$', ci = this.cid(c);
        const a3 = obs.get(p + '|' + ci + '|' + n), a2 = obs2.get(ci + '|' + n);
        if (this.TIMING === 'uniform' && all.length >= 3) { from.audio++; return snap(med(all)); }
        if (a3) { from.audio++; return snap(med(a3)); }
        if (tb2 && tb2[i] > 0) { from.claude++; return snap(+tb2[i]); }
        if (a2) { from.audio++; return snap(med(a2)); }
        const sm = obsSec.get(s.type);
        if (sm && sm.length >= 2) { from.audio++; return snap(med(sm)); }
        if (all.length >= 3) { from.audio++; return snap(med(all)); }
        from.default++; return bpb;
      });
      return { ...s, beats };
    });
    // no tempo from anywhere: the chart has to last as long as the recording, so the length gives the tempo. When that
    // comes out absurd the chords last two bars each (or half a bar), not one.
    if (unknown && extra.durSec > 30) {
      const beats = out.reduce((a, s) => a + s.beats.reduce((x, y) => x + y, 0), 0);
      let est = beats * 60 / extra.durSec, k = 1;
      if (est < 56) k = 2; else if (est > 176) k = 0.5;
      est *= k;
      if (est >= 56 && est <= 176 && (k !== 0.5 || bpb % 2 === 0)) { bpm = est; bpmFrom = 'length'; if (k !== 1) out.forEach(s => { s.beats = s.beats.map(b => Math.max(1, b * k)); }); }
    }
    return { secs: out, bpm: Math.round(bpm), time, from, bpmFrom: bpmFrom || 'default' };
  },
  async askTiming(track, secs, opts){
    const p = timingPrompt(track, secs);
    const d = await opts.askClaude(p, opts.signal);
    return d && typeof d === 'object' ? d : null;
  },

  /* ---------- web fallback (only when the song isn't in the dataset) ---------- */
  // Story mode's song check reads the web chart before the song is opened (opts.keep); opening it then uses that one
  webMemo: new Map(),
  async webChart(track, opts){
    const k = track && track.trackId;
    if (k && this.webMemo.has(k)) { const w = this.webMemo.get(k); this.webMemo.delete(k); return w; }
    const w = await this.webChartFresh(track, opts);
    if (k && opts && opts.keep) this.webMemo.set(k, w);
    return w;
  },
  async webChartFresh(track, opts){
    const d = await opts.askClaude(webChartPrompt(track), opts.signal, { webSearch: true, kind: 'web', body: { trackId: track.trackId } });
    if (!d || d.found === false || !Array.isArray(d.sections)) throw Object.assign(new Error('Claude couldn’t find chord sources for this recording.'), { code: 'web_nf' });
    const secs = [];
    for (const s of d.sections.slice(0, 40)) {
      const raw = (Array.isArray(s.chords) ? s.chords : String(s.chords || '').split(/\s+/)).map(x => String(x).trim());
      const rb = Array.isArray(s.beats) && s.beats.length === raw.length ? s.beats : null;
      const keep = raw.map((c, i) => [c, rb ? Math.round(+rb[i]) : 0]).filter(([c]) => parseChord(c)).slice(0, 96);
      if (!keep.length) continue;
      const chords = keep.map(x => x[0]), bt = rb && keep.every(x => x[1] > 0 && x[1] <= 32) ? keep.map(x => x[1]) : null;
      const name = cleanStr(s.name, 24) || 'Part ' + (secs.length + 1);
      const type = (/pre/i.test(name) ? 'prechorus' : /chorus/i.test(name) ? 'chorus' : /bridge/i.test(name) ? 'bridge' : /intro/i.test(name) ? 'intro' : /outro|coda|ending/i.test(name) ? 'outro' : /solo/i.test(name) ? 'solo' : /interlude|instrumental|break/i.test(name) ? 'interlude' : 'verse');
      secs.push({ name, type, chords, beats: bt, conf: ['high', 'medium', 'low'].includes(s.confidence) ? s.confidence : 'low' });
    }
    if (!secs.length) throw Object.assign(new Error('The web sources had no readable chords.'), { code: 'web_nf' });
    const sources = (Array.isArray(d.sources) ? d.sources : []).map(u => String(u)).filter(u => /^https?:\/\//.test(u)).slice(0, 6);
    return { sections: secs, sources, key: cleanStr(d.key, 8), capo: Math.round(clampNum(d.capo, 0, 9, 0)), bpm: clampNum(d.bpm, 40, 240, 0), time: TIMES.includes(d.time) ? d.time : '', feel: d.feel, style: d.style };
  },

  /* ---------- decide key / capo, collect questions, build the song ---------- */
  build(track, pick, an, timing, src, web, audioErr, found, extra){
    extra = extra || {};
    const secs = pick.sections, htm = extra.htm || null;
    const m = pick.ht ? { secs, bpm: pick.bpm, time: pick.time, bpmFrom: pick.bpmFrom, from: { audio: 0, claude: 0, hooktheory: secs.reduce((a, x) => a + x.chords.length, 0), default: 0 } }
      : this.merge(secs, an, timing || (web ? { bpm: web.bpm, time: web.time } : null), 100, { htm, durSec: track.durationMs ? track.durationMs / 1000 : 0 });
    const T = parseTime(m.time);
    const flat = [];
    m.secs.forEach(s => s.chords.forEach((c, i) => flat.push({ name: c, beats: s.beats[i], start: i === 0 })));
    // the key: chords first, with the recording's own key profile (moved into the chart's frame) as a second opinion
    const need = an && !an.usedModel ? this.OFFSET_MARGIN * 2 : this.OFFSET_MARGIN;   // the spectrogram fallback is less sure
    // the pitch: the recording's preview when it's sure; otherwise how the Hooktheory chords line up with the chart.
    // A web chart is written for the recording (with its capo), so the preview must be clearly sure to move it; when
    // Hooktheory lines up at another pitch, the preview must be clearly sure too.
    const capo0 = web ? web.capo : 0;
    const htT = htm && !pick.ht ? (htm.h - capo0 + 24) % 12 : null;
    const audT = an && an.offset != null ? (an.offset - capo0 + 24) % 12 : null;
    const needHere = Math.max(need, (pick.web && audT !== 0) || (htT != null && audT !== htT) ? this.OFFSET_MARGIN_FIRM : 0);
    const sure = !!(an && an.offset != null && an.margin > needHere);
    const tPitch = sure ? audT : htT != null ? htT : null, pitchFrom = sure ? 'recording' : htT != null ? 'hooktheory' : '';
    const sureOff = tPitch != null;
    const keyOff = (tPitch != null ? tPitch : 0) + capo0;       // chart shapes -> sounding, for the recording’s key profile
    // the recording's opinion: which of the chart's chords the preview spent its time on (a song's home chord
    // usually gets the most), plus, optionally, the preview's key profile
    let pv = null, pvTot = 0;
    if (an && an.visits) { pv = new Array(24).fill(0); for (const v of an.visits) { const ch = parseChord(v.name); if (!ch) continue; pv[ch.root * 2 + (/^m(?!aj)/.test(ch.quality) ? 1 : 0)] += v.beats; pvTot += v.beats; } }
    const audioTerm = an ? (tonic, minor) => {
      let v = pv && pvTot ? this.W_PV * pv[tonic * 2 + (minor ? 1 : 0)] / pvTot : 0;
      if (an.key && an.key.scores) {
        const snd = (tonic + keyOff) % 12, a = an.key.scores.find(x => x.tonic === snd && x.minor === minor);
        if (a) v += this.W_AUDIO * a.s;
        const tot = an.key.tot; if (tot) { const mx = Math.max(...tot) || 1; v += this.W_CH * tot[snd] / mx; }   // how much the home note sounds
      }
      return v;
    } : null;
    // Hooktheory's key for this recording (moved into the chart's frame by how its chords line up with the chart's),
    // and the key the web sources name, as further opinions
    let htKey = null;
    if (htm) {
      const cnt = new Map(); for (const c of htm.ht.clips) if (c.key) { const id = c.key.tonic * 2 + (c.key.minor ? 1 : 0); cnt.set(id, (cnt.get(id) || 0) + (c.chords.length || 1)); }
      const top = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) htKey = { tonic: ((top[0] >> 1) - htm.h + 12) % 12, minor: !!(top[0] & 1) };
    }
    const wk = web && /^([A-G][#b]?)(m?)$/.exec(String(web.key || '').replace('♯', '#').replace('♭', 'b')), wkc = wk && parseChord(wk[1]);
    const webKey = wkc ? { tonic: (wkc.root - (web.capo || 0) + 24) % 12, minor: !!wk[2] } : null;
    const keyTerm = (tonic, minor) => (audioTerm ? audioTerm(tonic, minor) : 0)
      + (htKey && htKey.tonic === tonic && htKey.minor === minor ? this.W_HT : 0)
      + (webKey && webKey.tonic === tonic && webKey.minor === minor ? this.W_WEB : 0);
    const shapeKey = Lookup.keyOf(flat, keyTerm);
    const kfx = typeof window !== 'undefined' && window.SJ_DEBUG ? Lookup.keyFeatures(flat) : null;
    const issues = [];
    let capo = capo0, tuning = 0, checked = false, checkedAudio = false, checkedHT = false;
    const fitRatio = an ? (an.free ? an.fit / an.free : 1) : null;
    const t = tPitch;
    if (an && an.offset != null) { checked = checkedAudio = true; if (fitRatio < 0.72) issues.push({ id: 'fit', kind: 'fit', ratio: fitRatio }); }
    if (t != null) {
      checked = true; if (pitchFrom === 'hooktheory') checkedHT = true;
      if (t !== 0) {
        const shapesKey = shapeKey ? shapeKey.label : '';
        const snd = shapeKey ? Lookup.keyLabel((shapeKey.tonic + capo + t) % 12, shapeKey.minor) : '';
        // how hard the shapes are as written vs moved to the recording's key (decides what to suggest)
        const names = [...new Set(flat.map(x => x.name))], ch = names.map(n => parseChord(n)).filter(Boolean);
        const avg = list => list.reduce((a, c) => a + chordDifficulty(c, false), 0) / Math.max(1, list.length);
        issues.push({ id: 'pitch', kind: 'pitch', t, capo, shapesKey, soundKey: snd, dw: +avg(ch).toFixed(2), dt: +avg(ch.map(c => transposeChord(c, t))).toFixed(2), from: pitchFrom });
      }
    }
    // chords the recording clearly disagrees with
    if (an) for (const cf of (an.chordFit || [])) if (cf.beats >= 6 && cf.alt - cf.own > 0.2) issues.push({ id: 'chord:' + cf.name, kind: 'chord', name: cf.name, alt: cf.altName.replace('♯', '#').replace('♭', 'b'), own: cf.own, altScore: cf.alt });
    if (web) for (const s of web.sections) if (s.conf !== 'high') issues.push({ id: 'sec:' + s.name, kind: 'section', name: s.name, conf: s.conf });
    // sections into bars
    const laid = pick.laid || Lookup.layout(m.secs, T.beats).map((x, i) => ({ ...x, conf: m.secs[i].conf, type: m.secs[i].type && SECTION_TYPES.includes(m.secs[i].type) ? m.secs[i].type : undefined }));
    const row = pick.data || {};
    const style = (timing && STYLES.includes(timing.style)) ? timing.style : Lookup.styleFor(row.genres, row.main_genre || track.genre);
    const o = {
      title: track.title, artist: track.artist, album: track.album, year: track.year, trackId: String(track.trackId), durationMs: track.durationMs,
      previewUrl: track.previewUrl, art: track.art, bpm: m.bpm, time: m.time, feel: timing && timing.feel === 'swing' ? 'swing' : (an && an.triplet && T.sub !== 3 ? 'swing' : 'straight'),
      style, capo, tuning, strum: timing && timing.strum, drums: timing && timing.drums,
      key: shapeKey ? Lookup.keyLabel((shapeKey.tonic + capo) % 12, shapeKey.minor) : '',
      sections: laid.map(s => ({ name: s.name, bars: s.bars, conf: s.conf, type: s.type, approx: s.approx })),
      approx: !!pick.approx, anchors: pick.anchors || undefined, note: pick.note || '',
      id: track.trackId ? 'rec-' + track.trackId : 'loc-' + slug(track.title + '-' + track.artist),
      prov: {
        src, checked, checkedAudio, checkedHT, verified: pick.verified == null ? null : pick.verified !== false, audioErr: checkedAudio ? '' : audioErr,
        form: pick.form || 'source', tempo: { raw: pick.tempoRaw || 0, rule: pick.tempoRule || '', from: m.bpmFrom || '', conf: ['default', 'length'].includes(m.bpmFrom) ? 'low' : 'high' }, route: pick.route || '', row: pick.row != null ? pick.row : null, spotifyId: pick.spotifyId || '',
        rows: (found.rows || []).map(r => r.row), sources: web ? web.sources : [], timing: m.from, bpmFrom: an && an.bpm ? (timing && timing.bpm ? 'recording + Claude' : 'recording') : timing && timing.bpm ? 'Claude' : m.bpmFrom === 'hooktheory' ? 'Hooktheory' : m.bpmFrom === 'length' ? 'the recording’s length' : m.bpmFrom === 'hint' ? 'the song notes' : 'default',
        offset: an ? an.offset : null, fit: an ? +(an.fit / (an.free || 1)).toFixed(3) : null, audioKey: an ? Lookup.keyLabel(an.key.tonic, an.key.minor) : '', margin: an ? +an.margin.toFixed(4) : null,
        shapeKey: shapeKey ? shapeKey.label : '', status: issues.length ? 'confirm' : 'ok', issues, pitchFrom,
        ht: htm ? { id: htm.ht.id, clips: htm.ht.clips.length, h: htm.h, match: +htm.score.toFixed(2), key: htKey ? Lookup.keyLabel((htKey.tonic + htm.h) % 12, htKey.minor) : '' } : null,
        htFix: extra.htFix || null, auto: extra.auto || null, webErr: extra.webErr ? String(extra.webErr.code || extra.webErr.message || 'failed') : '',
      },
      savedAt: Date.now(),
    };
    // what the source left out: style, strum family, section types, level; and the beginner capo pass, unless the
    // player is about to be asked about pitch / capo anyway (then the answer decides)
    const fin = finishChart(o, { easy: !issues.some(i => i.kind === 'pitch'), styleUnknown: !(timing && STYLES.includes(timing.style)) && !row.genres && !row.main_genre && !track.genre });
    Object.assign(o, fin);
    if (kfx) { o._kf = kfx.cands.map(c => [c.tonic, c.minor, c.f.map(v => +v.toFixed(4))]); o._ks = shapeKey && shapeKey.scores.slice(0, 4).map(x => [x.tonic, x.minor, +x.s.toFixed(3)]); }
    return o;
  },
  // the answer the confirm screen suggests for each question
  recommend(is){
    if (is.kind === 'pitch') {
      const tot = ((is.capo || 0) + is.t) % 12;                 // open shapes -> the recording
      const easier = is.dt != null && is.dw != null ? is.dt <= is.dw + (tot <= 4 ? -1 : 0.4) : false;   // moved shapes no harder
      if (tot === 0) return 'capo';                              // the shapes already sound right without the capo
      if (tot <= 7) return easier ? 'transpose' : 'capo';
      if (tot >= 10) return easier ? 'transpose' : 'tune';
      return 'transpose';
    }
    return 'keep';
  },
  // apply the player's answers from the confirm screen (always starting from the chart as it came in)
  applyChoices(o, choices){
    const orig = (o.prov && o.prov.orig) || { sections: o.sections, capo: o.capo || 0, key: o.key, tuning: o.tuning || 0 };
    const s = JSON.parse(JSON.stringify({ ...o, sections: orig.sections, capo: orig.capo, key: orig.key, tuning: orig.tuning }));
    s.prov.orig = JSON.parse(JSON.stringify(orig));
    let tr = 0;
    for (const is of s.prov.issues) {
      const ch = (choices && choices[is.id]) || 'keep';
      is.answer = ch;
      if (is.kind === 'pitch') {
        const tot = ((orig.capo || 0) + is.t) % 12;
        if (ch === 'capo') s.capo = tot;
        else if (ch === 'tune') { s.capo = 0; s.tuning = tot - 12; }
        else if (ch === 'transpose') { tr = is.t; s.sections = s.sections.map(x => ({ ...x, bars: x.bars.map(b => b.split(/\s+/).map(tk => transposeName(tk, tr)).join(' ')) })); }
      } else if (is.kind === 'chord' && ch === 'swap') {
        const from = transposeName(is.name, tr), to = transposeName(is.alt, tr);
        s.sections = s.sections.map(x => ({ ...x, bars: x.bars.map(b => b.split(/\s+/).map(tk => tk === from ? to : tk).join(' ')) }));
      }
    }
    const sk = parseChord(s.prov.shapeKey || '');
    if (sk) s.key = Lookup.keyLabel((sk.root + tr + (s.capo || 0) + (s.tuning || 0) + 24) % 12, /m$/.test(s.prov.shapeKey));
    s.prov.status = 'confirmed';
    return s;
  },
};
function transposeName(name, d){
  if (!d) return name;
  const ch = parseChord(name); if (!ch) return name;
  const t = transposeChord(ch, d); return chordLabel(t.root, t.quality, t.bass, ch.flat).replace('♯', '#').replace('♭', 'b').replace('m(maj7)', 'mmaj7').replace('6/9', '69');
}

/* ---------- prompts ---------- */
function timingPrompt(track, secs){
  const mmss = track.durationMs ? `${Math.floor(track.durationMs / 60000)}:${String(Math.round(track.durationMs / 1000) % 60).padStart(2, '0')}` : 'unknown length';
  const list = secs.map((s, i) => `${i + 1}. ${s.name}: ${s.chords.join(' ')}`).join('\n');
  return `You are helping a guitar game lay a chord chart into bars. The recording is "${String(track.title).replace(/"/g, "'")}" by ${String(track.artist).replace(/"/g, "'")} (album "${String(track.album || '').replace(/"/g, "'")}", ${track.year || 'year unknown'}, ${mmss}).
The chords below come from a chord dataset. Do NOT change, add or remove chords. Only give timing. Reply with JSON only:
{"bpm":96,"time":"4/4","feel":"straight","style":"pop","strum":"D.DU.UDU","drums":{"kick":"x.......x.x.....","snare":"....x.......x...","hat":"x.x.x.x.x.x.x.x."},"sections":[{"beats":[4,4,2,2]}]}
Rules:
- "sections" has exactly one entry per numbered section below, in the same order, and each "beats" array has exactly one whole number per chord listed: how many beats that chord lasts in the recording.
- "time" is one of 4/4, 3/4, 2/4, 6/8, 12/8. Beats are quarter notes for x/4 and dotted quarters for 6/8 and 12/8; "bpm" uses the same beat.
- "feel" is "straight" or "swing". "style" is one of: ${STYLES.join(', ')} ("none" if the recording has no drums).
- "drums" is a simplified one-bar groove like the recording's drum beat (x hit, X accent, g ghost, . rest; 16 steps for 4/4, 12 for 3/4, 8 for 2/4, 6 for 6/8, 12 for 12/8), or null if there are no drums. "strum" is a common strumming pattern for one beat group.
- No lyrics anywhere.
Sections:
${list}`;
}
function webChartPrompt(track){
  const q = x => String(x || '').replace(/"/g, "'");
  const sec = track.durationMs ? Math.round(track.durationMs / 1000) : 0;
  const mmss = sec ? `, ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} long` : '';
  return `Find the guitar chords for the recording "${q(track.title)}" by ${q(track.artist)} (album "${q(track.album)}", ${track.year || ''}${mmss}).
Use web search to read at least two different chord sources for this exact song (chord sites, official songbooks, music-theory analyses). From them extract ONLY: section names, the chords of each section, the key, capo, tempo and time signature. Work with the chord symbols alone: skip the words on those pages entirely and never write out any lyric line or other text from them, not even in your own notes; refer to places in the song by section name and chord.
Reconcile the sources against the studio recording:
- Where sources disagree, follow the ones that match the recording most closely (official songbooks, careful transcriptions, detailed well-rated tabs), not simplified or beginner versions.
- List the sections in the order they are played on this recording, from the first bar to the last, one entry per occurrence (Intro, Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus, Outro…), including instrumental parts, solos and the ending. Write every repeat out in full: if a line is played four times, write its chords four times.
- One chord symbol per chord change, as the sources write them (keep 7ths, sus, add9 and slash chords; don't simplify, and don't add chords no source has).
- "beats": for each chord, how many beats it lasts on the recording (whole numbers). This is timing only; never change a chord to fit it.${sec ? `
- Check the length: all the beats added up, at your bpm, should come to about the recording's ${sec} seconds (at 120 bpm that would be about ${sec * 2} beats). If your chart is clearly shorter, you have left out repeats or sections: put them in.` : ''}
- Mark a section "high" when the sources agree, "medium" when they mostly agree, and "low" when they disagree or only one source had it.
Reply with the JSON object only, with no other text:
{"found":true,"key":"G","capo":0,"bpm":96,"time":"4/4","feel":"straight","style":"pop","sources":["https://…","https://…"],"sections":[{"name":"Verse 1","chords":["G","D","Em","C"],"beats":[4,4,4,4],"confidence":"high"}]}
"key" is the key the recording sounds in. "capo" is the capo fret the chord shapes assume (0 if none); when sources differ, use the capo most of them use and write the chords for it. "time" is one of 4/4, 3/4, 2/4, 6/8, 12/8; beats are quarter notes for x/4 and dotted quarters for 6/8 and 12/8, and "bpm" uses the same beat. "feel" is "straight" or "swing". "style" is one of: ${STYLES.join(', ')}. If you can't find the song, reply {"found":false}.`;
}
