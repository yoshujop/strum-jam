/* =====================================================================
   Lyrics and the vocal melody, for Vocals mode.
   - Lyrics come from LRCLIB (lrclib.net, free, no key), synced to the
     recording line by line; a player can also paste their own (LRC or plain).
     They're fetched when needed and cached on this device, never shipped.
   - A time map turns recording time into the chart's beats. With the song
     file, it comes from the recording itself (beat tracking + the chart's
     chords lined up against it, like the preview check); without it, from
     where the lyric lines fall against the chart's bars, plus the player's
     own nudge.
   - The melody: from the song file, the Basic Pitch model's top voice while
     a line is being sung. Without the file, the chord's notes are the guide.
   ===================================================================== */
const LRCLIB = 'https://lrclib.net/api';
const Lyrics = {
  // "[01:02.35] text" (several stamps per line allowed; word stamps <..> dropped) -> [{t, text}]
  parseLrc(txt){
    const out = [];
    for (const raw of String(txt || '').split(/\r?\n/)) {
      const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
      if (!stamps.length) continue;
      const text = raw.replace(/\[[^\]]*\]/g, '').replace(/<\d+:\d+(?:\.\d+)?>/g, '').trim();
      for (const m of stamps) out.push({ t: +m[1] * 60 + parseFloat(m[2].replace(':', '.')), text });
    }
    out.sort((a, b) => a.t - b.t);
    // a line lasts until the next one starts (capped); empty stamps are pauses
    const lines = [];
    out.forEach((l, i) => { if (!l.text) return; const nx = out[i + 1]; lines.push({ t0: l.t, t1: nx ? Math.min(nx.t, l.t + 12) : l.t + 5, text: l.text }); });
    return lines;
  },
  // plain lyrics with no times: spread over the song, skipping the first 8% (intro)
  spreadPlain(txt, durSec){
    const ls = String(txt || '').split(/\r?\n/).map(s => s.trim()).filter(s => s && !/^\[.*\]$/.test(s));
    if (!ls.length) return [];
    const d = durSec || 180, a = d * 0.08, step = (d * 0.9 - a) / ls.length;
    return ls.map((text, i) => ({ t0: a + i * step, t1: a + (i + 0.92) * step, text, guessed: true }));
  },
  key(song){ return 'lyr:' + (song.trackId || (song.title + '|' + song.artist).toLowerCase()); },
  cached(song){ const c = Store.get(this.key(song), null); return c && Array.isArray(c.lines) ? c : null; },
  save(song, rec){ Store.set(this.key(song), rec); },
  clear(song){ Store.set(this.key(song), null); },
  // user-supplied lyrics (from the song screen)
  fromText(song, txt){
    const synced = this.parseLrc(txt);
    const rec = synced.length >= 3 ? { lines: synced, synced: true, src: 'pasted' } : { lines: this.spreadPlain(txt, song.durationMs / 1000), synced: false, src: 'pasted' };
    rec.nudge = 0; this.save(song, rec); return rec;
  },
  async fetch(song, signal){
    const c = this.cached(song); if (c) return c;
    const q = s => encodeURIComponent(String(s || '').replace(/\s*[\(\[][^)\]]*(remaster|live|version|edit|mono|stereo|feat)[^)\]]*[\)\]]/ig, '').trim());
    const dur = song.durationMs ? Math.round(song.durationMs / 1000) : 0;
    const pick = rows => {
      rows = (rows || []).filter(r => r && !r.instrumental && (r.syncedLyrics || r.plainLyrics));
      if (!rows.length) return null;
      const sc = r => (r.syncedLyrics ? 0 : 30) + (dur && r.duration ? Math.abs(r.duration - dur) : 5);
      return rows.sort((a, b) => sc(a) - sc(b))[0];
    };
    let row = null;
    try {
      const r = await fetch(`${LRCLIB}/get?track_name=${q(song.title)}&artist_name=${q(song.artist)}${dur ? '&duration=' + dur : ''}`, { signal });
      if (r.ok) row = pick([await r.json()]);
    } catch (e) { if (e.name === 'AbortError') throw e; }
    if (!row) {
      const r = await fetch(`${LRCLIB}/search?track_name=${q(song.title)}&artist_name=${q(song.artist)}`, { signal });
      if (!r.ok) throw Object.assign(new Error('lyrics HTTP ' + r.status), { code: 'lyrics_http' });
      row = pick(await r.json());
    }
    if (!row) throw Object.assign(new Error('No lyrics found for this song.'), { code: 'no_lyrics' });
    const lines = row.syncedLyrics ? this.parseLrc(row.syncedLyrics) : [];
    const rec = lines.length >= 3 ? { lines, synced: true, src: 'lrclib', dur: row.duration || dur }
      : { lines: this.spreadPlain(row.plainLyrics, row.duration || dur), synced: false, src: 'lrclib', dur: row.duration || dur };
    rec.nudge = 0;
    this.save(song, rec);
    return rec;
  },

  /* ---------- recording time -> chart beats ---------- */
  // a map is {pts: [[sec, beat], ...]} (piecewise linear, extrapolated at the chart tempo), plus the player's nudge in beats
  mapBeat(map, t){
    const p = map.pts, spb = map.spb;
    if (p.length === 1 || t <= p[0][0]) return p[0][1] + (t - p[0][0]) / spb + (map.nudge || 0);
    for (let i = 1; i < p.length; i++) if (t <= p[i][0]) { const [a, x] = p[i - 1], [b, y] = p[i]; return x + (y - x) * (t - a) / (b - a || 1) + (map.nudge || 0); }
    const [a, x] = p[p.length - 1]; return x + (t - a) / spb + (map.nudge || 0);
  },
  // No song file. Lyrics run on the recording's clock and the chart on its own, so they are put on ONE clock here and
  // every line lands inside the chart:
  // 1. a chart that follows the recording (song.anchors: Hooktheory passages at their own times) maps through them;
  // 2. a chart about as long as the sung part plays straight through: beat = (t - T0) / spb, with T0 chosen (among the
  //    offsets that keep every line inside the chart) so the lines start on beats, mostly bar lines, the first after the intro;
  // 3. a chart that is shorter or much longer than the recording (a default tempo, a part of the song) is stretched over
  //    it: the recording's start and end are pinned to the chart's, and the first line to the first section it can start.
  // Returns { pts, spb, fit, how: 'anchors' | 'offset' | 'stretch', ratio (chart seconds per recording second) }.
  fitMap(lines, chart, durSec){
    const spb = 60 / chart.bpm, B = chart.beats, total = chart.totalBeats * spb;
    const real = lines.filter(l => !l.guessed), st = real.map(l => l.t0);
    const an = chart.song && chart.song.anchors;
    if (an && an.length >= 2 && an[an.length - 1][1] <= chart.totalBeats + 0.5) {
      const pts = an.map(p => [p[0], p[1]]), last = st.length ? Math.max(...real.map(l => l.t1)) : 0;
      // lines sung after the last anchor still have to fit before the chart ends
      const end = pts[pts.length - 1]; if (last > end[0] && end[1] + (last - end[0]) / spb > chart.totalBeats) pts.push([last + 1, chart.totalBeats]);
      return { pts, spb, fit: 1, how: 'anchors', ratio: 1 };
    }
    const dur = durSec || (lines.length ? lines[lines.length - 1].t1 + 5 : total);
    if (!st.length) {
      // guessed lines (plain lyrics spread over the recording): the recording maps onto the chart end to end
      return { pts: [[0, 0], [Math.max(1, dur), chart.totalBeats]], spb, fit: 0, how: 'stretch', ratio: total / Math.max(1, dur) };
    }
    const first = st[0], lastEnd = Math.max(...real.map(l => l.t1));
    // offsets that keep every line inside the chart
    const lo = lastEnd - total, hi = first;
    if (hi - lo >= 0 && total >= dur * 0.8 && total <= dur * 1.25) {
      let best = Math.max(lo, Math.min(hi, 0)), bestS = -1e9;
      for (let T0 = Math.max(lo, -4 * B * spb); T0 <= hi + 1e-9; T0 += 0.01) {
        let s = 0;
        for (const t of st) { const b = (t - T0) / spb, fb = b - Math.round(b), fbar = (b / B) - Math.round(b / B); s += Math.cos(fb * Math.PI * 2) * 0.6 + Math.cos(fbar * Math.PI * 2) * 0.4; }
        // the singing usually starts where a section does (after the intro): a pull toward the first line landing on one
        const b1 = (first - T0) / spb; if (chart.sections.some(sec => Math.abs(sec.startBeat - b1) < 0.4)) s += 1.5;
        s -= Math.abs(T0) / (60 * spb) * 0.02;          // small pull toward the chart starting with the recording
        if (s > bestS) { bestS = s; best = T0; }
      }
      return { pts: [[best, 0]], spb, fit: bestS / st.length, how: 'offset', ratio: 1 };
    }
    // stretch. The first line goes to the start of the section nearest to where it falls proportionally (so the intro
    // stays an intro), the rest of the recording is spread evenly over the rest of the chart.
    const pts = [[0, 0]], k = chart.totalBeats / Math.max(1, dur);
    const want = first * k, secs = chart.sections.filter(sec => sec.startBeat > 0 && sec.startBeat < chart.totalBeats * 0.4);
    const sec = secs.sort((x, y) => Math.abs(x.startBeat - want) - Math.abs(y.startBeat - want))[0];
    if (sec && first > 1 && Math.abs(sec.startBeat - want) < Math.max(4 * B, want * 0.6)) pts.push([first, sec.startBeat]);
    const endT = Math.max(dur, lastEnd + 1);
    if (endT > pts[pts.length - 1][0]) pts.push([endT, chart.totalBeats]);
    return { pts, spb, fit: 0, how: 'stretch', ratio: total / Math.max(1, dur) };
  },
  // how the lines sit on the chart: how many start (and end) inside it, how many start within a quarter beat of a beat
  coverage(lines, map, chart){
    let inside = 0, onBeat = 0, onBar = 0;
    for (const l of lines) {
      const b0 = this.mapBeat(map, l.t0), b1 = this.mapBeat(map, l.t1);
      if (b0 >= -0.5 && b1 <= chart.totalBeats + 0.5) inside++;
      if (Math.abs(b0 - Math.round(b0)) <= 0.25) onBeat++;
      if (Math.abs(b0 / chart.beats - Math.round(b0 / chart.beats)) <= 0.25 / chart.beats) onBar++;
    }
    return { lines: lines.length, inside, onBeat, onBar };
  },
  // with the song file: Analyze.run lines the chart's chords up against the recording's beats. Each tracked beat k
  // that sits on chord token i gives a (time, chart beat) pair; keep the ones that move forward in step, smooth the offset.
  fileMap(an, chart){
    const spbC = 60 / chart.bpm, fps = Analyze.FPS;
    const evs = chart.events.filter(e => !e.rest);
    if (!an || !an.path || !an.beatFrames || !evs.length) return null;
    const raw = [];
    let run = -1, runStart = 0;
    for (let k = 0; k < an.path.length && k < an.beatFrames.length; k++) {
      const i = an.path[k]; if (i !== run) { run = i; runStart = k; }
      const e = evs[i]; if (!e) continue;
      const j = k - runStart; if (j >= e.len) continue;           // the recording held the chord longer than the chart: skip
      raw.push([an.beatFrames[k] / fps, e.beat + j]);
    }
    if (raw.length < 8) return null;
    // offsets (time - beat * spb) are steady where the alignment is right; a running median throws out the jumps
    const off = raw.map(([t, b]) => t - b * spbC), W = 12, pts = [];
    for (let i = 0; i < raw.length; i++) {
      const w = off.slice(Math.max(0, i - W), i + W + 1).sort((a, b) => a - b), m = w[w.length >> 1];
      if (Math.abs(off[i] - m) < spbC * 0.6) pts.push([raw[i][0], (raw[i][0] - m) / spbC]);
    }
    const mono = []; for (const p of pts) if (!mono.length || (p[0] > mono[mono.length - 1][0] && p[1] > mono[mono.length - 1][1])) mono.push(p);
    return mono.length >= 8 ? { pts: mono, spb: spbC, fit: mono.length / an.path.length, file: true } : null;
  },

  /* ---------- the melody from the song file ---------- */
  // Basic Pitch frames -> the top voice in the singing range while a line is sung -> notes [{t0, t1, m}]
  melody(frames, lines){
    const fps = Analyze.FPS, F = frames.F, lo = 52 - 21, hi = 81 - 21;   // MIDI 52..81 (E3..A5)
    const singing = new Uint8Array(F);
    for (const l of lines) for (let f = Math.max(0, Math.floor(l.t0 * fps)); f < Math.min(F, Math.ceil(l.t1 * fps)); f++) singing[f] = 1;
    const top = new Int16Array(F).fill(-1);
    for (let f = 0; f < F; f++) {
      if (!singing[f]) continue;
      // the highest clear note that's nearly as strong as the strongest one (the voice usually sits on top)
      let mx = 0; for (let p = lo; p <= hi; p++) mx = Math.max(mx, frames.note[f * 88 + p]);
      let best = -1; if (mx >= 0.45) for (let p = hi; p >= lo; p--) if (frames.note[f * 88 + p] >= Math.max(0.45, mx * 0.6)) { best = p; break; }
      top[f] = best >= 0 ? best + 21 : -1;
    }
    // median filter (7 frames), then notes of at least ~90 ms
    const med = new Int16Array(F).fill(-1);
    for (let f = 3; f < F - 3; f++) { const w = []; for (let d = -3; d <= 3; d++) if (top[f + d] > 0) w.push(top[f + d]); med[f] = w.length >= 4 ? w.sort((a, b) => a - b)[w.length >> 1] : -1; }
    const notes = [];
    for (let f = 0; f < F;) {
      const m = med[f]; let g = f + 1; while (g < F && med[g] === m) g++;
      if (m > 0 && g - f >= 8) {
        const last = notes[notes.length - 1];
        if (last && last.m === m && f / fps - last.t1 < 0.08) last.t1 = g / fps; else notes.push({ t0: f / fps, t1: g / fps, m });
      }
      f = g;
    }
    return notes;
  },
  // read a song file the player picked, run the model and the chart check over it
  async analyzeFile(file, chart, lines, onStep){
    onStep && onStep('Reading the song file…');
    const buf = await file.arrayBuffer();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ab = await new Promise((res, rej) => { const p = new OAC(1, Analyze.SR * 2, Analyze.SR).decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
    const n = ab.length, x = new Float32Array(n);
    for (let c = 0; c < ab.numberOfChannels; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i] / ab.numberOfChannels; }
    const pcm = ab.sampleRate === Analyze.SR ? x : Analyze.resampleLinear(x, ab.sampleRate, Analyze.SR);
    const frames = await Listen.batch(pcm, p => onStep && onStep(`Listening to the song… ${Math.round(p * 100)}%`));
    onStep && onStep('Lining the song up with the chart…');
    const secs = chart.sections.map((s, k) => ({ name: s.name, chords: chart.events.filter(e => !e.rest && e.sec === k).map(e => e.sounds) }));
    const an = Analyze.run(pcm, frames, { secs }, { bpm: chart.bpm });
    const map = this.fileMap(an, chart);
    const mel = lines && lines.length ? this.melody(frames, lines) : [];
    return { map, melody: mel, dur: pcm.length / Analyze.SR };
  },
};
