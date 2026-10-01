/* ---------- the funk drummer, drawn live ----------
   Drawn the way cartoon rhythm games draw their casts: one thick ink silhouette around the whole body
   (round shoulders grow out of the jacket, sleeves bend at a real elbow, the head sits on the neck in
   the shirt collar, the flares run down into the platform shoes). He plays like a drummer: one hand
   keeps the hi-hat going, the other cracks the snare on the backbeat, the foot works the kick, and the
   strokes come from elbow -> wrist -> stick in that order, with a wind-up before each hit, a smear on
   the fast part and a rebound after. Every stroke is keyed to a hit the band really plays; he looks
   ahead so the stick lands on it. Coordinates are the 500 x 650 design box (floor at y = 522).          */
const FunkDrummer = (() => {
  const INK = '#2b1a12', SKIN = '#a8683f', SKIN_D = '#87502b', SKIN_L = '#c98a5c', HAIR = '#2a1712', HAIR_L = '#5a3424',
    GOLD = '#ffc93c', GOLD_D = '#c98a1e', GOLD_L = '#fff0a8', TEETH = '#ffffff', TEETH_D = '#c9c5d4', RIM = '#15131b', TIE = '#141219', TIE_L = '#34313f',   // gold chains, rings and hoops; white teeth; black shades rims
     PINK = '#ff4fa0', LIP = '#e2566f', MOUTH = '#5a0f1e', TONGUE = '#ff6f8e',
    PURP = '#24222B', PURP_D = '#121117', PURP_L = '#3E3B4A', SHIRT = '#FAF9FD', SHIRT_D = '#D9D6E4', RED = '#9A96A6', RED_D = '#74707F',   // a sharp black suit, white shirt, black tie; grey drums
    CREAM = '#fff4d6', WOOD = '#f6dca8', CYM = '#ffc93c', CYM_D = '#e5a92a', CYM_L = '#fff3b0', CHROME = '#d9dde6', CHROME_D = '#b7bcc8', CYAN = '#8ff0ff';
  const LW = 6, LI = 3.5, STICK = 60, BUTT = 20, W_UP = 31, W_FO = 26;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
  const E = { out: t => 1 - (1 - t) * (1 - t), in2: t => t * t, in3: t => t * t * t, io: t => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t) };
  const D2R = Math.PI / 180;
  // the kit, as seen from the crowd: snare and hi-hat in front just above the bass drum, floor tom and
  // ride on the left, crash up on the right
  const KIT = { kick: { x: 250, y: 432, r: 80 }, snare: { x: 190, y: 348, rx: 40 }, hat: { x: 318, y: 336, rx: 36 },
    tom: { x: 88, y: 410, rx: 44 }, crash: { x: 440, y: 234, rx: 52 }, ride: { x: 66, y: 268, rx: 50 } };
  // contact pose for each stroke: where the stick tip lands, the stick's angle (hand -> tip), where the
  // elbow sits (relative to the shoulder), which way "raising the stick" turns it, and how big the stroke is
  const HIT = {
    snare:  { tip: [198, 346], a: 38, e: [-66, 52], up: -1, hand: 'A', size: 1.15 },
    tom:    { tip: [100, 406], a: 122, e: [-44, 50], up: 1, hand: 'A', size: 0.9 },
    hat:    { tip: [306, 334], a: 145, e: [68, 50], up: 1, hand: 'B', size: 0.55 },
    crash:  { tip: [402, 236], a: -24, e: [40, 28], up: -1, hand: 'B', size: 1.3 },
    bsn:    { tip: [186, 350], a: 160, e: [30, 50], up: 1, hand: 'B', size: 0.9 },
    clickA: { tip: [350, 187], a: -58, e: [55, 30], up: 1, hand: 'A', size: 0.4 },
    clickB: { tip: [360, 195], a: -122, e: [72, 26], up: -1, hand: 'B', size: 0.4 },
  };
  for (const k in HIT) { const h = HIT[k]; h.a *= D2R; h.x = h.tip[0] - STICK * Math.cos(h.a); h.y = h.tip[1] - STICK * Math.sin(h.a); h.side = h.hand === 'A' ? -1 : 1; }
  const HOME = { A: 'snare', B: 'hat' };
  const pose = (x, y, a, ex, ey) => ({ x, y, a, ex, ey });
  const mix = (p, q, t, ta, te) => pose(lerp(p.x, q.x, t), lerp(p.y, q.y, t), lerp(p.a, q.a, ta == null ? t : ta), lerp(p.ex, q.ex, te == null ? t : te), lerp(p.ey, q.ey, te == null ? t : te));
  const hitP = d => { const h = HIT[d]; return pose(h.x, h.y, h.a, h.e[0], h.e[1]); };
  const upP = (d, lift) => { const h = HIT[d], L = lift * h.size;
    if (d === 'crash') return pose(h.x - 14, h.y - L * 0.9, h.a + h.up * 1.1, h.e[0] - 4, h.e[1] - L * 0.6);
    if (d.startsWith('click')) return pose(h.x - h.side * 10, h.y + 10, h.a - h.up * 0.55, h.e[0], h.e[1] + 4);
    return pose(h.x - h.side * L * 0.1, h.y - L * 0.55, h.a + h.up * (0.95 + h.size * 0.4), h.e[0] + h.side * 6, h.e[1] - L * 0.25); };
  const rebP = (d, lift) => { const h = HIT[d], L = lift * h.size;
    if (d === 'crash') return pose(h.x + 14, h.y + 22, h.a + 0.5, h.e[0] + 6, h.e[1] + 8);
    if (d.startsWith('click')) return pose(h.x, h.y + 4, h.a + h.up * 0.2, h.e[0], h.e[1]);
    return pose(h.x, h.y - L * 0.35, h.a + h.up * 0.45, h.e[0], h.e[1] - L * 0.12); };
  const hovP = (d, lift) => { const h = HIT[d]; if (d === 'crash' || d === 'bsn' || d.startsWith('click')) return hovP(HOME[h.hand], lift);
    const L = lift * h.size; return pose(h.x, h.y - 4 - L * 0.2, h.a + h.up * 0.3, h.e[0], h.e[1] - 2); };

  // split the band's hits between the hands and the kick foot, the way a drummer would
  function plan(events){
    const A = [], B = [], K = [];
    let i = 0, fillN = 0, lastTom = -9;
    while (i < events.length) {
      const t = events[i].t, ks = new Set();
      while (i < events.length && events[i].t - t < 0.006) ks.add(events[i++].kind);
      if (ks.has('stick')) { A.push({ t, d: 'clickA' }); B.push({ t, d: 'clickB' }); continue; }
      if (ks.has('kick')) K.push(t);
      let a = null, b = null;
      if (ks.has('crash')) b = 'crash'; else if (ks.has('hat')) b = 'hat';
      if (ks.has('snare')) a = 'snare';
      if (ks.has('tom')) { fillN = t - lastTom < 0.4 ? fillN + 1 : 0; lastTom = t; if (fillN % 2 === 0) b = 'bsn'; else a = 'tom'; }
      if (a) A.push({ t, d: a }); if (b) B.push({ t, d: b });
    }
    return { A, B, K };
  }
  // where a hand is at time t: contact -> rebound -> drift -> wind-up -> strike.
  // In the strike the elbow leads, the hand follows and the stick whips in last.
  function handAt(list, t, hand, lift){
    let p = null, n = null;
    for (const e of list) { if (e.t <= t) p = e; else { n = e; break; } }
    if (p && t - p.t > 1.5) p = null;
    if (n && n.t - t > 1.2) n = null;
    const home = HOME[hand];
    if (!p && !n) return hovP(home, lift);
    const tp = p ? p.t : -1e9, tn = n ? n.t : 1e9, gap = Math.min(tn - tp, 0.9);
    const hold = Math.min(0.03, gap * 0.15), rb = Math.min(0.11, gap * 0.32), ws = Math.min(0.26, gap * 0.55), sk = ws * 0.48;
    if (p && t < tp + hold) return hitP(p.d);
    if (p && t < tp + rb) return mix(hitP(p.d), rebP(p.d, lift), E.out((t - tp - hold) / (rb - hold)));
    const from = p ? rebP(p.d, lift) : hovP(n.d, lift), to = hovP(n ? n.d : home, lift);
    const a0 = p ? tp + rb : tn - 1.2, a1 = n ? tn - ws : tp + rb + 0.5;
    const mid = x => mix(from, to, E.io(clamp((x - a0) / Math.max(0.001, a1 - a0), 0, 1)));
    if (!n || t < tn - ws) return mid(t);
    if (t < tn - sk) { const k = (t - (tn - ws)) / (ws - sk); return mix(mid(tn - ws), upP(n.d, lift), E.out(k), E.out(k), E.out(Math.min(1, k * 1.3))); }
    const k = (t - (tn - sk)) / sk;
    return mix(upP(n.d, lift), hitP(n.d), E.in2(k), E.in3(k), E.out(Math.min(1, k * 1.6)));
  }

  const P = s => new Path2D(s);
  const FACE = P('M192 178 C192 140 308 140 308 178 C312 220 300 246 274 258 C262 266 238 266 226 258 C200 246 188 220 192 178 Z');
  const M = {
    grin: P('M212 232 Q250 270 288 232 Q250 242 212 232 Z'),
    yell: P('M222 228 Q250 218 278 228 Q286 262 250 270 Q214 262 222 228 Z'),
    oh: P('M236 236 Q250 226 264 236 Q268 258 250 262 Q232 258 236 236 Z'),
    pucker: P('M241 240 Q250 233 259 240 Q261 252 250 254 Q239 252 241 240 Z'),
    laugh: P('M214 232 Q250 226 286 232 Q282 272 250 276 Q218 272 214 232 Z'),
    grit: P('M216 234 Q250 230 284 234 Q284 254 250 258 Q216 254 216 234 Z'),
  };
  const STACHE_L = P('M249 226 Q224 214 206 230 Q198 238 192 228'), STACHE_R = P('M251 226 Q276 214 294 230 Q302 238 308 228');
  const SHOE = P('M-74 -22 Q-74 -36 -54 -36 L0 -36 L0 0 L-74 0 Z'), BODY = P('M-76 4 C-94 -58 -60 -106 0 -106 C60 -106 94 -58 76 4 Z'),
    LAPEL_L = P('M-100 10 L-100 -120 L-14 -104 L-20 -56 L-28 10 Z'), LAPEL_R = P('M100 10 L100 -120 L14 -104 L20 -56 L28 10 Z'),
    JACKET_SH = P('M100 10 L100 -120 L60 -100 C84 -70 84 -30 64 10 Z'), JACKET_HI = P('M-70 6 C-84 -50 -60 -92 -36 -100 C-60 -84 -72 -48 -60 6 Z'),
    VNECK = P('M-15 -106 L15 -106 L0 -60 Z'), NECK = P('M-16 -130 L16 -130 L15 -98 L-15 -98 Z'),
    FIST = P('M-14 -16 Q6 -22 16 -12 Q22 0 16 12 Q6 22 -14 16 Q-22 0 -14 -16 Z');
  const star = (c, x, y, R, r, rot) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5 + (rot || 0), q = i % 2 ? r : R; c.lineTo(x + q * Math.cos(a), y + q * Math.sin(a)); } c.closePath(); };
  // outline-then-fill: shapes drawn this way share one outer ink line, so joins disappear
  function inked(c, paths, fill, lw){ c.lineWidth = (lw || LW) * 2; c.strokeStyle = INK; for (const p of paths) c.stroke(p); c.fillStyle = fill; for (const p of paths) c.fill(p); }
  function shadeIn(c, shape, dx, dy, col, alpha){
    c.save(); c.clip(shape); c.globalAlpha = alpha == null ? 1 : alpha; c.fillStyle = col;
    const m = new Path2D(); m.rect(-100, -150, 700, 800); m.addPath(shape, new DOMMatrix([1, 0, 0, 1, dx, dy])); c.fill(m, 'evenodd'); c.restore();
  }
  const AFRO = (() => { const p = new Path2D(); p.ellipse(250, 116, 100, 80, 0, 0, Math.PI * 2); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; p.moveTo(250 + 96 * Math.cos(a) + 40, 116 + 74 * Math.sin(a)); p.arc(250 + 96 * Math.cos(a), 116 + 74 * Math.sin(a), 40, 0, Math.PI * 2); } return p; })();
  // a leg: one soft tube from the hip, bending at the knee, flaring over the shoe
  function tube(S, El, W, w0, w1, w2){
    const Q = [2 * El[0] - (S[0] + W[0]) / 2, 2 * El[1] - (S[1] + W[1]) / 2], L = [], R = [], n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t, x = u * u * S[0] + 2 * u * t * Q[0] + t * t * W[0], y = u * u * S[1] + 2 * u * t * Q[1] + t * t * W[1];
      let tx = 2 * u * (Q[0] - S[0]) + 2 * t * (W[0] - Q[0]), ty = 2 * u * (Q[1] - S[1]) + 2 * t * (W[1] - Q[1]); const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const w = t < 0.5 ? lerp(w0, w1, t / 0.5) : lerp(w1, w2, (t - 0.5) / 0.5);
      L.push([x - ty * w / 2, y + tx * w / 2]); R.push([x + ty * w / 2, y - tx * w / 2]);
    }
    const p = new Path2D(); p.moveTo(L[0][0], L[0][1]); for (const q of L) p.lineTo(q[0], q[1]); for (let i = n; i >= 0; i--) p.lineTo(R[i][0], R[i][1]); p.closePath();
    return p;
  }

  function create(){ return { lastReal: 0, afro: { x: 0, y: 0, vx: 0, vy: 0, px: null }, med: { a: 0, v: 0, px: null }, sh: { y: 0, v: 0, r: 0, vr: 0 }, prevL: 0, lvlUp: -9, prevDK: 9, prevDS: 9, blinkAt: 0 }; }
  function spring(s, tx, ty, dt, k, damp){
    if (s.px == null) { s.x = tx; s.y = ty; s.px = 1; }
    const ax = k * (tx - s.x) - damp * s.vx, ay = k * (ty - s.y) - damp * s.vy;
    s.vx += ax * dt; s.vy += ay * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    return [clamp(s.x - tx, -16, 16), clamp(s.y - ty, -14, 18)];
  }

  // pick the face for this moment: a different look for every hype level, changing from bar to bar
  function chooseFace(L, playing, beat, ph, hits, missAgo, lvlUpAgo, ctx){
    const f = { mouth: 'grin', eyes: 'open', browUp: 0, browAng: 0, shades: 'on', wiggle: 0, look: 0 };
    const bar = Math.floor(beat / 4), bpos = ((beat % 4) + 4) % 4, slot = ((bar % 4) + 4) % 4, { dSn, dCr, dHat, dTom } = hits;
    if (missAgo < 0.8) { f.mouth = missAgo < 0.3 ? 'oh' : 'grit'; f.eyes = 'wide'; f.browUp = -14; f.browAng = -0.18; f.shades = 'down'; return f; }
    if (lvlUpAgo < 1.1) { f.mouth = 'laugh'; f.eyes = 'happy'; f.browUp = -14; f.shades = 'up'; return f; }
    // drum fills: full concentration going round the kit (clenched grill, fierce brows, shades slipping, eyes on the sticks)...
    if (playing && ctx.inFill) { f.mouth = 'grit'; f.eyes = 'fierce'; f.browAng = 0.34; f.browUp = 4; f.shades = 'slip'; f.look = ctx.look; return f; }
    // ...then the payoff when it lands
    if (playing && ctx.afterFill < 0.75) { f.mouth = L >= 2 ? 'yell' : 'laugh'; f.eyes = 'happy'; f.browUp = -14; f.shades = L >= 3 ? 'up' : 'on'; return f; }
    if (!playing) { f.mouth = 'smirk'; if (((Math.floor(beat / 8) % 3) + 3) % 3 === 2) { f.shades = 'peek'; f.eyes = 'side'; f.browUp = -8; } return f; }
    const hitNow = Math.min(dSn, dTom, dCr) < 0.14;
    if (L === 0) {
      f.mouth = 'smirk';
      if (slot === 2 && bpos >= 1 && bpos < 3) { f.shades = 'peek'; f.eyes = 'side'; f.browUp = -9; }
      if (slot === 3 && bpos >= 3) { f.browUp = -10; f.browAng = 0.1; f.wiggle = 1; }
    } else if (L === 1) {
      f.mouth = slot === 1 && ph > 0.35 && ph < 0.9 ? 'pucker' : 'grin';
      if (slot === 3 && bpos >= 2) { f.shades = 'peek'; f.eyes = 'wink'; f.browUp = -8; }
      if (dSn < 0.15) f.browUp = -5;
    } else if (L === 2) {
      f.mouth = dSn < 0.2 ? (bar % 2 ? 'yell' : 'oh') : 'grin';
      f.wiggle = slot === 1 ? 1 : 0;
      if (slot === 2 && bpos >= 1 && bpos < 3) { f.shades = 'peek'; f.eyes = 'wink'; f.browUp = -10; }
    } else if (L === 3) {
      f.mouth = dCr < 0.4 ? 'yell' : hitNow ? 'grit' : slot === 3 && bpos >= 2 ? 'yell' : 'grin';
      f.browAng = 0.2; f.eyes = 'fierce';
      if (slot === 1 && bpos >= 2) { f.shades = 'peek'; f.browUp = -6; }
    } else {
      f.mouth = dSn < 0.24 || dCr < 0.4 ? 'yell' : 'laugh';
      f.browAng = 0.24; f.eyes = slot === 3 ? 'happy' : 'fierce'; f.browUp = dSn < 0.2 ? -6 : 0;
      if (slot === 3) f.shades = 'up';
    }
    if (ctx.busy >= 7 && f.mouth === 'grin') { f.mouth = Math.min(dSn, dHat) < 0.1 ? 'grit' : 'grin'; f.browAng = Math.max(f.browAng, 0.16); }
    if (ctx.busy <= 2.5 && L <= 1 && f.mouth === 'grin') f.mouth = 'smirk';
    return f;
  }

  function draw(c, st, o){
    const { now, level: L0, events, playing } = o, L = playing ? clamp(L0 | 0, 0, 4) : 0;
    const rm = typeof reduceMotion !== 'undefined' && reduceMotion;
    const real = o.real != null ? o.real : performance.now() / 1000, dt = clamp(real - (st.lastReal || real), 0, 0.05); st.lastReal = real;
    const beat = o.beat, ph = ((beat % 1) + 1) % 1, beatN = Math.floor(beat);
    const pl = plan(events || []), lift = [22, 26, 30, 34, 38][L];
    const hA = rm ? hovP('snare', lift) : handAt(pl.A, now, 'A', lift), hB = rm ? hovP('hat', lift) : handAt(pl.B, now, 'B', lift);
    const sinceIn = (list, ds) => { let b = 9; for (const e of list) if (ds.includes(e.d) && e.t <= now) b = Math.min(b, now - e.t); return b; };
    const dSn = Math.min(sinceIn(pl.A, ['snare']), sinceIn(pl.B, ['bsn'])), dTom = sinceIn(pl.A, ['tom']), dHat = sinceIn(pl.B, ['hat']), dCr = sinceIn(pl.B, ['crash']);
    let dK = 9, nK = 9; for (const t of pl.K) { if (t <= now) dK = Math.min(dK, now - t); else nK = Math.min(nK, t - now); }
    const missAgo = o.missAgo == null ? 9 : o.missAgo, missed = missAgo < 0.75;
    if (playing && st.seen && L > st.prevL) st.lvlUp = real; st.prevL = L; st.seen = true;
    // --- body: groove bob (down ON the beat, hold, snap), shimmy, head-bang, kick squash ---
    const down = rm || !playing ? 0 : ph < 0.55 ? 1 - E.out(ph / 0.55) : ph < 0.84 ? 0 : E.in2((ph - 0.84) / 0.16);
    const side = beatN % 2 ? 1 : -1, sideS = rm || !playing ? 0 : side * (ph < 0.2 ? 2 * E.out(ph / 0.2) - 1 : 1);
    const kickSq = dK < 0.03 ? dK / 0.03 : Math.exp(-(dK - 0.03) / 0.1), antic = nK < 0.07 ? 1 - nK / 0.07 : 0;
    const flinch = missed ? Math.sin(Math.min(1, missAgo / 0.25) * Math.PI) : 0;
    const breathe = Math.sin(real * 2.1) * 0.012;
    const windA = clamp((HIT.snare.y - hA.y) / lift, 0, 1.4), windB = clamp((HIT.hat.y - hB.y) / lift, 0, 1.6);
    const sq = 1 + breathe + 0.02 * Math.max(windA, windB * 0.6) * (L >= 2 ? 1 : 0.5) - [0.02, 0.03, 0.03, 0.05, 0.06][L] * down - 0.035 * kickSq * (playing ? 1 : 0) + 0.02 * antic - 0.08 * flinch;
    const shimmy = L === 2 ? 5 : L >= 3 ? 3 : 0;
    const bend = ((hA.x - HIT.snare.x) + (hB.x - HIT.hat.x)) * 0.06 + sideS * shimmy;
    const rot = (hB.y - hA.y) * 0.0005 + (L === 2 ? sideS * 0.035 : 0);
    const hip = [250, 358 + down * [1, 2, 2, 4, 5][L] + flinch * 6];
    const TM = new DOMMatrix().translate(hip[0], hip[1]).rotate(rot / D2R).multiply(new DOMMatrix([1, 0, -bend / 104, 1, 0, 0])).scale(1 / Math.sqrt(sq), sq);
    const tp = (u, v) => { const q = TM.transformPoint({ x: u, y: v }); return [q.x, q.y]; };
    const SA = tp(-52, -86), SB = tp(52, -86), NK = tp(0, -104);
    SA[1] -= windA * lift * 0.12; SB[1] -= windB * lift * 0.1;
    // head: rides on the neck, nods on the beat, tilts on the shimmy
    const nodDeg = [3, 5, 6, 11, 14][L] * down + (L === 2 ? sideS * 5 : 0) - 4 * flinch;
    const headRot = rot + nodDeg * D2R * (L >= 3 ? 0.45 : 1);
    const headDY = (L >= 3 ? 14 : 4) * down * (playing ? 1 : 0) - 8 * flinch;
    const HM = new DOMMatrix().translate(NK[0], NK[1]).rotate(headRot / D2R).translate(0, headDY - 14).translate(-250, -262);
    // afro, chain and shades follow through on springs
    const anchor = HM.transformPoint({ x: 250, y: 150 });
    const lag = rm ? [0, 0] : spring(st.afro, anchor.x, anchor.y, dt, 240, 13);
    const chest = tp(0, -40); if (st.med.px == null) st.med.px = chest[0];
    const vx = dt > 0 ? (chest[0] - st.med.px) / dt : 0; st.med.px = chest[0];
    st.med.v += (-120 * st.med.a - 7 * st.med.v - vx * 0.08) * dt; st.med.a = clamp(st.med.a + st.med.v * dt, -0.5, 0.5);
    // how busy the hands are, and whether a fill is going on (toms / the crossed snare)
    let busy = 0, inFill = false, lastFill = -9, look = 0, nearest = 9;
    for (const [list] of [[pl.A], [pl.B]]) for (const e of list) {
      if (e.t <= now && now - e.t < 1) busy++;
      const fillHit = e.d === 'tom' || e.d === 'bsn';
      if (fillHit && e.t <= now) lastFill = Math.max(lastFill, e.t);
      if (fillHit && e.t > now - 0.22 && e.t < now + 0.3) { inFill = true; const dd = Math.abs(e.t - now); if (dd < nearest) { nearest = dd; look = clamp((HIT[e.d].tip[0] - 250) / 25, -5, 5); } }
    }
    const afterFill = inFill ? 9 : now - lastFill;
    const face = chooseFace(L, playing, beat, ph, { dSn, dCr, dHat, dTom }, missAgo, real - st.lvlUp, { busy, inFill, afterFill, look });
    if (st.forceFace) Object.assign(face, st.forceFace);
    st.look = lerp(st.look || 0, face.look, clamp(dt * 12, 0, 1));
    // shades: bounce on the nose with every kick and snare, creep down over two bars and get flicked back up,
    // slide down for a peek, flip up into the afro, fly off on the big crashes
    { const sh = st.sh; let tgt = face.shades === 'down' ? 34 : face.shades === 'peek' ? 30 : face.shades === 'slip' ? 6 : face.shades === 'up' ? -66 : 0;
      if (face.shades === 'on' && playing && L >= 1) tgt += 9 * (((beat % 8) + 8) % 8) / 8;
      if (!rm) {
        if (dK < st.prevDK - 0.001) sh.v += 70 + 30 * L; if (dSn < st.prevDS - 0.001) { sh.v += 50 + 25 * L; sh.vr += (Math.random() - 0.5) * 3; }
        if (L >= 3 && dCr < 0.02 && face.shades !== 'up') sh.v -= 1100;
        sh.v += (420 * (tgt - sh.y) - 16 * sh.v) * dt; sh.y += sh.v * dt;
        sh.vr += (-300 * sh.r - 12 * sh.vr + (L === 2 ? sideS * 2 : 0)) * dt; sh.r = clamp(sh.r + sh.vr * dt, -0.35, 0.35);
      } else { sh.y = tgt; sh.r = 0; }
      st.prevDK = dK; st.prevDS = dSn; }

    c.save(); c.translate(o.x, o.floorY); const k = o.h / 650; c.scale(k, k); c.translate(-250, -522);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(250, 522, 230, 14, 0, 0, Math.PI * 2); c.fill();
    // stands behind everything
    c.strokeStyle = INK; c.lineWidth = 6; c.beginPath();
    c.moveTo(KIT.ride.x, KIT.ride.y); c.lineTo(38, 522); c.lineTo(18, 522);
    c.moveTo(KIT.crash.x, KIT.crash.y); c.lineTo(468, 522); c.lineTo(488, 522);
    c.moveTo(KIT.hat.x, KIT.hat.y); c.lineTo(KIT.hat.x, 522); c.stroke();
    // --- afro (behind the face), squashing with its own lag ---
    c.save(); c.setTransform(c.getTransform().multiply(HM));
    c.translate(lag[0] * 0.9, lag[1] * 0.8);
    const afS = 1 + clamp(-lag[1] * 0.006, -0.06, 0.07);
    c.translate(250, 190); c.scale(1 / Math.sqrt(afS), afS); c.translate(-250, -190);
    inked(c, [AFRO], HAIR, LW);
    shadeIn(c, AFRO, -14, -12, '#3d2219', 1);
    c.strokeStyle = HAIR_L; c.lineWidth = 6;
    for (const [x, y] of [[328, 110], [136, 110], [143, 82], [164, 58], [195, 42], [232, 36], [269, 42], [300, 58], [321, 82], [180, 96], [290, 92]]) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 18, y - 16, x + 34, y - 2); c.stroke(); }
    c.restore();
    // --- legs: purple flares from under the jacket down into the platform shoes ---
    const kickLift = !playing || rm ? 0 : nK < 0.12 ? E.out(1 - nK / 0.12) * 0.9 : dK < 0.05 ? 0 : dK < 0.2 ? 0.4 * (1 - (dK - 0.05) / 0.15) : 0;
    const hatFoot = !playing || rm ? 0 : L >= 1 ? (ph < 0.5 ? 0 : E.io((ph - 0.5) / 0.5)) : 0;
    const legL = tube(tp(-36, -8), [178, 436 - kickLift * 12], [180, 490 - kickLift * 8], 46, 38, 46), legR = tube(tp(36, -8), [322, 436 - hatFoot * 6], [320, 490 - hatFoot * 4], 46, 38, 46);
    inked(c, [legL, legR], PURP, LW);
    shadeIn(c, legL, 8, -4, PURP_D, 1); shadeIn(c, legR, 8, -4, PURP_D, 1);
    const shoe = (x0, flip, ang) => {
      c.save(); c.translate(x0, 522); c.scale(flip, 1); c.rotate(ang);
      inked(c, [SHOE], '#26222F', 2.8); c.fillStyle = '#3A3546'; c.fillRect(-74, -12, 74, 12); c.lineWidth = 4; c.strokeStyle = INK; c.strokeRect(-74, -12, 74, 12);   // black shoes
      c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 3; c.beginPath(); c.moveTo(-64, -30); c.lineTo(-14, -30); c.stroke();
      c.fillStyle = '#fff'; for (const x of [-60, -43, -26]) { c.beginPath(); c.arc(x, -6, 2.5, 0, 7); c.fill(); }
      c.restore();
    };
    shoe(214, 1, -kickLift * 0.2); shoe(286, -1, -hatFoot * 0.07);
    // --- torso: one bean-shaped jacket, sheared and squashed as a whole ---
    c.save(); c.setTransform(c.getTransform().multiply(TM));
    inked(c, [BODY], SHIRT, LW);
    const tw = Math.floor(real * 8) % 2;
    c.save(); c.clip(BODY);
    c.fillStyle = PURP; c.fill(LAPEL_L); c.fill(LAPEL_R);
    c.fillStyle = PURP_D; c.fill(JACKET_SH);
    c.fillStyle = PURP_L; c.globalAlpha = 0.9; c.fill(JACKET_HI); c.globalAlpha = 1;
    // the shirt: crisp white, a soft shade down one side, buttoned up to the collar
    c.fillStyle = SHIRT_D; c.globalAlpha = 0.8; c.beginPath(); c.moveTo(6, -104); c.lineTo(22, -56); c.lineTo(28, 10); c.lineTo(10, 10); c.lineTo(4, -60); c.closePath(); c.fill(); c.globalAlpha = 1;
    c.restore();
    // lapels: black with a satin facing along the edge (no trim, no stars: a nice black suit)
    c.strokeStyle = PURP_L; c.lineWidth = 6; c.beginPath(); c.moveTo(-19, -99); c.lineTo(-25, -56); c.lineTo(-33, -2); c.moveTo(19, -99); c.lineTo(25, -56); c.lineTo(33, -2); c.stroke();
    c.strokeStyle = INK; c.lineWidth = LI; c.beginPath(); c.moveTo(-15, -103); c.lineTo(-21, -56); c.lineTo(-29, 4); c.moveTo(15, -103); c.lineTo(21, -56); c.lineTo(29, 4); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(-40, -86); c.lineTo(-26, -76); c.moveTo(40, -86); c.lineTo(26, -76); c.stroke();                 // the notch of each lapel
    c.beginPath(); c.moveTo(-58, -30); c.quadraticCurveTo(-50, -26, -46, -18); c.moveTo(56, -40); c.quadraticCurveTo(50, -34, 48, -26); c.stroke();
    // a white pocket square
    c.fillStyle = SHIRT; c.beginPath(); c.moveTo(-56, -62); c.lineTo(-48, -70); c.lineTo(-42, -63); c.lineTo(-38, -68); c.lineTo(-36, -60); c.closePath(); c.fill(); c.lineWidth = 2.4; c.stroke();
    c.beginPath(); c.moveTo(-60, -60); c.lineTo(-34, -60); c.stroke();
    // neck, the shirt collar over it, the black tie, then the gold chains over the lot
    inked(c, [NECK], SKIN_D, 2.6);
    const collar = sg => { c.beginPath(); c.moveTo(sg * 1, -101); c.lineTo(sg * 19, -108); c.lineTo(sg * 13, -88); c.closePath(); };
    for (const sg of [-1, 1]) { collar(sg); c.fillStyle = SHIRT; c.fill(); c.lineWidth = 3.2; c.strokeStyle = INK; c.stroke(); }
    const knot = new Path2D('M-7 -101 L7 -101 L5 -89 L-5 -89 Z'), blade = new Path2D('M-5 -90 L5 -90 L10 -24 L0 -12 L-10 -24 Z');
    for (const q of [blade, knot]) { c.fillStyle = TIE; c.fill(q); c.lineWidth = 3.2; c.strokeStyle = INK; c.stroke(q); }
    c.strokeStyle = TIE_L; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-2, -86); c.lineTo(-5, -30); c.stroke();
    const chain = (y1, w, lw1, lw2, d) => { c.strokeStyle = INK; c.lineWidth = lw1; c.beginPath(); c.moveTo(-w, -100); c.quadraticCurveTo(0, y1, w, -100); c.stroke();
      c.strokeStyle = GOLD; c.lineWidth = lw2; c.setLineDash(d); c.stroke(); c.strokeStyle = GOLD_L; c.lineWidth = Math.max(1.2, lw2 * 0.3); c.lineDashOffset = -1; c.stroke(); c.lineDashOffset = 0; c.setLineDash([]); };
    chain(-76, 16, 8, 4.5, [3, 2]); chain(-56, 24, 9, 5.5, [4, 2]);
    c.save(); c.translate(0, -98); c.rotate(st.med.a); c.translate(0, 98);
    chain(-26, 30, 10, 6.5, [5, 2]);
    // a gold medallion on the long chain
    c.beginPath(); c.arc(0, -61, 8.5, 0, 7); c.fillStyle = GOLD; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.arc(-2, -63, 3, 0, 7); c.fillStyle = GOLD_L; c.fill();
    c.restore();
    c.restore();
    // --- head ---
    drawHead(c, st, HM, face, { L, playing, rm, real, now, dSn, dHat, dK, missed });
    // --- the kit ---
    drawKit(c, { dSn, dCr, dHat, dTom, dK, rm });
    // --- arms: round shoulders out of the jacket, a real elbow, the stick in the fist ---
    const torsoW = new Path2D(); torsoW.addPath(BODY, TM);
    const armOf = (S, h) => { const El = [S[0] + h.ex, S[1] + h.ey], dx = h.x - El[0], dy = h.y - El[1], l = Math.hypot(dx, dy) || 1, wr = Math.min(12, l * 0.45); return { S, El, W: [h.x - dx / l * wr, h.y - dy / l * wr], h }; };
    const arms = [armOf(SA, hA), armOf(SB, hB)];
    // smears: faded copies of the stick plus a swoosh along the path of its tip (drawn under the arms)
    if (!rm) for (const [list, hand, cur] of [[pl.A, 'A', hA], [pl.B, 'B', hB]]) {
      const g1 = handAt(list, now - 0.028, hand, lift), sp = Math.hypot(g1.x - cur.x, g1.y - cur.y) + Math.abs(g1.a - cur.a) * STICK;
      if (sp < 22) continue;
      const tipAt = g => [g.x + Math.cos(g.a) * STICK, g.y + Math.sin(g.a) * STICK], path = [];
      for (let j = 0; j <= 8; j++) path.push(tipAt(j ? handAt(list, now - j * 0.009, hand, lift) : cur));
      const band = new Path2D(), Lb = [], Rb = [];
      for (let j = 0; j < path.length; j++) { const a = path[Math.max(0, j - 1)], b2 = path[Math.min(path.length - 1, j + 1)], ddx = b2[0] - a[0], ddy = b2[1] - a[1], l = Math.hypot(ddx, ddy) || 1, w = 6 * (1 - j / path.length);
        Lb.push([path[j][0] - ddy / l * w, path[j][1] + ddx / l * w]); Rb.push([path[j][0] + ddy / l * w, path[j][1] - ddx / l * w]); }
      band.moveTo(Lb[0][0], Lb[0][1]); for (const q of Lb) band.lineTo(q[0], q[1]); for (let j = Rb.length - 1; j >= 0; j--) band.lineTo(Rb[j][0], Rb[j][1]); band.closePath();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.fill(band); c.strokeStyle = 'rgba(43,26,18,.7)'; c.lineWidth = 2.5; c.stroke(band);
      for (let j = 2; j >= 1; j--) { const g = handAt(list, now - j * 0.02, hand, lift); c.globalAlpha = 0.28 * (3 - j); stickShape(c, g); }
      c.globalAlpha = 1;
    }
    for (const arm of arms) drawArm(c, arm, torsoW);
    // impact lines at the tips
    if (!rm) for (const [d, dd] of [['snare', sinceIn(pl.A, ['snare'])], ['bsn', sinceIn(pl.B, ['bsn'])], ['hat', dHat], ['tom', dTom], ['crash', dCr]]) if (dd < 0.09) {
      const t2 = HIT[d].tip, s = 1 + dd * 6; c.strokeStyle = INK; c.lineWidth = 5; c.globalAlpha = 1 - dd / 0.09;
      c.beginPath(); for (const a of [-2.3, -1.57, -0.8]) { c.moveTo(t2[0] + Math.cos(a) * 16 * s, t2[1] + Math.sin(a) * 16 * s); c.lineTo(t2[0] + Math.cos(a) * 30 * s, t2[1] + Math.sin(a) * 30 * s); } c.stroke(); c.globalAlpha = 1;
    }
    // music notes float up once he's grooving
    if (L >= 2 && playing && !rm) for (let i = 0; i < 3; i++) {
      const cyc = ((real / 2.1 + i * 0.33) % 1), x = [430, 70, 455][i] + 25 * cyc, y = [150, 170, 100][i] - 70 * cyc;
      c.globalAlpha = Math.sin(cyc * Math.PI); c.fillStyle = [PINK, '#19c3b0', GOLD][i]; c.strokeStyle = INK; c.lineWidth = 4;
      c.beginPath(); c.moveTo(x + 6, y); c.lineTo(x + 6, y - 26); c.quadraticCurveTo(x + 18, y - 22, x + 16, y - 10); c.stroke(); c.lineWidth = 3; c.beginPath(); c.ellipse(x, y + 1, 8, 6, -0.3, 0, 7); c.fill(); c.stroke(); c.globalAlpha = 1;
    }
    c.restore();
    st.last = { now, hA, hB, dK };
    return st.last;
  }

  function drawArm(c, arm, torsoW){
    const { S, El, W, h } = arm;
    const up = new Path2D(); up.moveTo(S[0], S[1]); up.lineTo(El[0], El[1]);
    const fo = new Path2D(); fo.moveTo(El[0], El[1]); fo.lineTo(W[0], W[1]);
    const cuffDir = [W[0] - El[0], W[1] - El[1]], cl = Math.hypot(cuffDir[0], cuffDir[1]) || 1;
    const cuff = new Path2D(); cuff.moveTo(W[0] - cuffDir[0] / cl * 5, W[1] - cuffDir[1] / cl * 5); cuff.lineTo(W[0] + cuffDir[0] / cl * 2, W[1] + cuffDir[1] / cl * 2);
    const ink = () => { c.strokeStyle = INK; c.lineWidth = W_UP + 2 * LW; c.stroke(up); c.lineWidth = W_FO + 2 * LW; c.stroke(fo); c.lineWidth = W_FO + 6 + 2 * LW; c.stroke(cuff); };
    // outline everywhere outside the jacket; over the jacket too, except right at the shoulder where the sleeve grows out
    c.save(); const outside = new Path2D(); outside.rect(-500, -500, 1500, 1600); outside.addPath(torsoW); c.clip(outside, 'evenodd'); ink(); c.restore();
    c.save(); const inside = new Path2D(); inside.addPath(torsoW); inside.moveTo(S[0] + 36, S[1]); inside.arc(S[0], S[1], 36, 0, Math.PI * 2); c.clip(inside, 'evenodd'); ink(); c.restore();
    c.strokeStyle = PURP; c.lineWidth = W_UP; c.stroke(up); c.lineWidth = W_FO; c.stroke(fo);
    // shading on the under side of each segment, gold piping down the sleeve
    const seg = (a, b, w, t0, t1, off, col, lw) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); if (l < 4) return; let nx = -dy / l, ny = dx / l; if (ny < 0) { nx = -nx; ny = -ny; }
      c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'butt'; c.beginPath(); c.moveTo(a[0] + dx * t0 + nx * off * w, a[1] + dy * t0 + ny * off * w); c.lineTo(a[0] + dx * t1 + nx * off * w, a[1] + dy * t1 + ny * off * w); c.stroke(); c.lineCap = 'round'; };
    seg(S, El, W_UP, 0.35, 0.92, 0.3, PURP_D, 11); seg(El, W, W_FO, 0.1, 0.85, 0.28, PURP_D, 9);
    seg(S, El, W_UP, 0.3, 0.9, -0.2, PURP_L, 3); seg(El, W, W_FO, 0.12, 0.8, -0.18, PURP_L, 3);
    // a crease on the inside of the elbow
    const v1 = [S[0] - El[0], S[1] - El[1]], v2 = [W[0] - El[0], W[1] - El[1]], l1 = Math.hypot(v1[0], v1[1]) || 1, l2 = Math.hypot(v2[0], v2[1]) || 1;
    const bis = [v1[0] / l1 + v2[0] / l2, v1[1] / l1 + v2[1] / l2], bl = Math.hypot(bis[0], bis[1]);
    if (bl > 0.25 && l2 > 14) { const bx = bis[0] / bl, by = bis[1] / bl, cx = El[0] + bx * 9, cy = El[1] + by * 9;
      c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - by * 7, cy + bx * 7); c.quadraticCurveTo(El[0] + bx * 4, El[1] + by * 4, cx + by * 7, cy - bx * 7); c.stroke(); }
    // gold cuff, then the stick, then the fist around it
    c.strokeStyle = SHIRT; c.lineWidth = W_FO + 4; c.stroke(cuff);
    stickShape(c, h); fist(c, h);
  }
  function stickShape(c, h){
    const ca = Math.cos(h.a), sa = Math.sin(h.a), x0 = h.x - ca * BUTT, y0 = h.y - sa * BUTT, x1 = h.x + ca * STICK, y1 = h.y + sa * STICK;
    c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 11; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.strokeStyle = WOOD; c.lineWidth = 5; c.stroke();
  }
  function fist(c, h){
    c.save(); c.translate(h.x, h.y); c.rotate(h.a);
    inked(c, [FIST], SKIN, 2.5);
    c.strokeStyle = INK; c.lineWidth = 3.2; c.beginPath(); c.moveTo(4, -15); c.quadraticCurveTo(10, 0, 4, 15); c.moveTo(12, -11); c.quadraticCurveTo(16, 0, 12, 11); c.stroke();
    c.strokeStyle = SKIN_L; c.lineWidth = 3; c.beginPath(); c.moveTo(-10, -10); c.quadraticCurveTo(-4, -14, 2, -13); c.stroke();
    c.strokeStyle = INK; c.lineWidth = 7; c.beginPath(); c.moveTo(2, -14); c.lineTo(2, -6); c.stroke(); c.strokeStyle = GOLD; c.lineWidth = 3.5; c.stroke();
    c.restore();
  }

  function drawHead(c, st, HM, f, s){
    const { L, playing, rm, real, now, dSn, dHat, dK, missed } = s;
    c.save(); c.setTransform(c.getTransform().multiply(HM));
    for (const x of [190, 310]) { c.beginPath(); c.ellipse(x, 200, 13, 17, 0, 0, 7); c.fillStyle = SKIN; c.fill(); c.lineWidth = 5; c.strokeStyle = INK; c.stroke(); }
    const de = Math.min(dSn, dHat), ear = rm ? 0 : Math.sin(de * 30) * Math.exp(-de * 8) * 0.4;
    for (const [x, sg] of [[188, -1], [312, 1]]) { c.save(); c.translate(x, 212); c.rotate(ear * sg); c.beginPath(); c.arc(0, 10, 10, 0, 7); c.lineWidth = 7; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3.5; c.strokeStyle = GOLD; c.stroke(); c.restore(); }
    inked(c, [FACE], SKIN, 2.6);
    shadeIn(c, FACE, -10, -8, SKIN_D, 0.85);
    c.save(); c.clip(FACE); c.fillStyle = SKIN_D; c.globalAlpha = 0.6; c.beginPath(); c.ellipse(250, 146, 70, 16, 0, 0, 7); c.fill(); c.restore();
    c.fillStyle = `rgba(226,122,106,${0.4 + 0.1 * L})`; for (const x of [206, 294]) { c.beginPath(); c.ellipse(x, 222, 9 + L, 7 + L * 0.5, 0, 0, 7); c.fill(); }
    const shY = st.sh.y, shR = st.sh.r, eyesShow = Math.abs(shY) > 3;
    // eyes (seen when the shades move)
    if (eyesShow) {
      if (real > st.blinkAt + 3.2) st.blinkAt = real + Math.random() * 2;
      const blink = real > st.blinkAt && real < st.blinkAt + 0.12, dart = f.eyes === 'side' ? 5 * Math.sign(Math.sin(real * 3)) : (st.look || 0);
      for (const x of [222, 278]) {
        const shut = blink || f.eyes === 'happy' || (f.eyes === 'wink' && x > 250);
        if (shut) { c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); if (f.eyes === 'happy') { c.moveTo(x - 12, 184); c.quadraticCurveTo(x, 168, x + 12, 184); } else { c.moveTo(x - 12, 180); c.quadraticCurveTo(x, 186, x + 12, 180); } c.stroke(); continue; }
        const ry = f.eyes === 'wide' ? 18 : f.eyes === 'fierce' ? 11 : 15;
        c.beginPath(); c.ellipse(x, 178, 13, ry, 0, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 4; c.strokeStyle = INK; c.stroke();
        c.fillStyle = INK; c.beginPath(); c.arc(x + dart + (x < 250 ? 3 : -3), 180, f.eyes === 'wide' ? 4 : 6, 0, 7); c.fill();
        if (f.eyes === 'fierce') { c.lineWidth = 5; c.beginPath(); c.moveTo(x - 14, x < 250 ? 168 : 172); c.lineTo(x + 14, x < 250 ? 172 : 168); c.stroke(); }
      }
    }
    // brows: raise, furrow, wiggle
    const brows = () => { const wig = f.wiggle && !rm ? Math.sin(real * 16) * 4 : 0;
      for (const [x0, x1, sg] of [[200, 244, -1], [256, 300, 1]]) { c.save(); c.translate((x0 + x1) / 2, 147 + f.browUp + (sg > 0 ? wig : -wig)); c.rotate(f.browAng * sg); c.beginPath(); c.moveTo(x0 - (x0 + x1) / 2, 6); c.quadraticCurveTo(0, -11, x1 - (x0 + x1) / 2, 6); c.lineWidth = 10; c.strokeStyle = INK; c.stroke(); c.restore(); } };
    if (shY > -30) brows();
    // One mouth at a time. A new mouth has to last a moment before it replaces the old one (no flicker between faces);
    // the open mouths (oh, yell, laugh) ease open from nothing and ease shut again before the next mouth appears.
    { const dt = Math.min(0.1, Math.max(0, real - (st.moT == null ? real : st.moT))); st.moT = real;
      if (st.mCur == null) { st.mCur = f.mouth; st.mSince = real; }
      if (f.mouth === st.mCur) st.mNext = null; else if (real - st.mSince > 0.16) st.mNext = f.mouth;
      const OPEN = ['oh', 'yell', 'laugh'], curOpen = OPEN.includes(st.mCur);
      st.mo = st.mo == null ? (curOpen ? 1 : 0) : st.mo;
      if (st.mNext && st.mNext !== st.mCur) {
        // leaving an open mouth: close it first; otherwise swap straight away
        if (curOpen && !rm) { st.mo = Math.max(0, st.mo - dt * 9); if (st.mo <= 0.02) { st.mCur = st.mNext; st.mSince = real; st.mNext = null; st.mo = 0; } }
        else { st.mCur = st.mNext; st.mSince = real; st.mNext = null; st.mo = 0; }
      } else if (OPEN.includes(st.mCur)) st.mo = rm ? 1 : Math.min(1, st.mo + dt * 12);
      if (OPEN.includes(st.mCur)) {
        const k = 1 - Math.pow(1 - st.mo, 3);
        c.save(); c.translate(250, 232); c.scale(0.75 + 0.25 * k, Math.max(0.08, k)); c.translate(-250, -232);
        drawMouth(c, st.mCur, real, rm, k); c.restore();
      } else drawMouth(c, st.mCur, real, rm, 0); }
    c.save(); c.translate(250, 226); c.scale(1, 1 - 0.12 * Math.exp(-Math.min(dSn, dK) * 14)); c.translate(-250, -226);
    c.lineWidth = 12; c.strokeStyle = INK; c.stroke(STACHE_L); c.stroke(STACHE_R); c.lineWidth = 6; c.strokeStyle = HAIR; c.stroke(STACHE_L); c.stroke(STACHE_R); c.restore();
    c.beginPath(); c.ellipse(250, 216, 19, 14, 0, 0, 7); c.fillStyle = '#96582f'; c.fill(); c.lineWidth = 5; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.ellipse(244, 211, 5.5, 3.5, 0, 0, 7); c.fillStyle = SKIN_L; c.fill();
    // shades
    const tw = Math.floor(real * 8) % 2;
    c.save(); c.translate(250, 182 + shY); c.rotate(shR - (shY < -30 ? 0.06 : 0)); c.translate(-250, -182);
    c.strokeStyle = RIM; c.lineWidth = 7; c.beginPath(); c.moveTo(196, 176); c.lineTo(178, 170); c.moveTo(304, 176); c.lineTo(322, 170); c.stroke();
    { const parts = [[222, 182, 30, 24], [278, 182, 30, 24], [250, 177, 22, 12], [250, 187, 22, 12]].map(([x, y, rx, ry]) => { const q = new Path2D(); q.ellipse(x, y, rx, ry, 0, 0, 7); return q; });
      c.strokeStyle = INK; c.lineWidth = 16; for (const q of parts) c.stroke(q);
      c.strokeStyle = RIM; c.lineWidth = 9; for (const q of parts) c.stroke(q);
      c.fillStyle = PINK; for (const q of parts) c.fill(q); }
    c.strokeStyle = '#fff'; c.lineWidth = 5; c.globalAlpha = 0.85; c.beginPath(); c.moveTo(204, 176); c.lineTo(216, 164); c.moveTo(260, 176); c.lineTo(272, 164); c.stroke(); c.globalAlpha = 1;
    c.strokeStyle = '#ff9cc9'; c.lineWidth = 4; c.beginPath(); c.moveTo(212, 190); c.lineTo(232, 170); c.moveTo(268, 190); c.lineTo(288, 170); c.stroke();
    if (tw) { c.fillStyle = '#fff'; for (const [x, y] of [[198, 172], [222, 156], [302, 172], [278, 156]]) { c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill(); } }
    c.restore();
    if (shY <= -30) brows();
    // sweat flies off when he's on fire (or just blew it)
    if (((L >= 3 && playing) || missed) && !rm) for (let i = 0; i < (missed ? 1 : 3); i++) {
      const cyc = ((real * 1.1 + i * 0.37) % 1), dir = i % 2 ? 1 : -1, x = (dir > 0 ? 312 : 188) + dir * 70 * cyc, y = [168, 160, 150][i] - 40 * cyc + 70 * cyc * cyc;
      c.globalAlpha = Math.sin(cyc * Math.PI); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 8, y + 12, x, y + 16); c.quadraticCurveTo(x + 8, y + 12, x, y); c.fillStyle = '#8fe3ff'; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke(); c.globalAlpha = 1;
    }
    c.restore();
  }
  function drawMouth(c, m, real, rm, k){
    c.strokeStyle = INK; c.lineWidth = 5;
    // the tongue: rises into view as the mouth opens and bobs a little while it's open
    const open = (shape, teethH, tongue) => { c.save(); c.clip(shape); c.fillStyle = MOUTH; c.fillRect(200, 215, 100, 70);
      if (tongue) { const bob = rm ? 0 : Math.sin(real * 11) * 2.2 * (k || 0), ty = tongue + (1 - (k || 1)) * 14 + bob;
        c.fillStyle = TONGUE; c.beginPath(); c.ellipse(250, ty, 18, 10 + (k || 0) * 2, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(90,15,30,.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(250, ty - 6); c.lineTo(250, ty + 3); c.stroke(); }
      if (teethH) { c.fillStyle = TEETH; c.fillRect(200, 215, 100, teethH); c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(200, 215 + teethH); c.lineTo(300, 215 + teethH); c.stroke(); } c.restore(); c.strokeStyle = INK; c.lineWidth = 5; c.stroke(shape); };
    if (m === 'grin') { c.save(); c.clip(M.grin); c.fillStyle = MOUTH; c.fillRect(200, 220, 100, 60); c.fillStyle = TEETH; c.fillRect(200, 220, 100, 29); c.strokeStyle = TEETH_D; c.lineWidth = 2.5; c.beginPath(); for (const x of [222, 236, 264, 278]) { c.moveTo(x, 238); c.lineTo(x, 249); } c.stroke(); c.restore(); c.lineWidth = 5; c.strokeStyle = INK; c.stroke(M.grin); }
    else if (m === 'smirk') { c.beginPath(); c.moveTo(226, 240); c.quadraticCurveTo(256, 252, 282, 234); c.stroke(); c.lineWidth = 4; c.beginPath(); c.moveTo(280, 230); c.quadraticCurveTo(288, 234, 286, 242); c.stroke(); }
    else if (m === 'pucker') { c.fillStyle = MOUTH; c.fill(M.pucker); c.lineWidth = 7; c.strokeStyle = LIP; c.stroke(M.pucker); c.lineWidth = 4; c.strokeStyle = INK; c.stroke(M.pucker);
      if (!rm) { const cyc = (real * 1.5) % 1; c.globalAlpha = 1 - cyc; c.lineWidth = 3; c.beginPath(); c.arc(300 + cyc * 30, 238 - cyc * 20, 6 + cyc * 6, -1, 1); c.stroke(); c.globalAlpha = 1; } }
    else if (m === 'oh') open(M.oh, 0, 258);
    else if (m === 'yell') open(M.yell, 24, 266);
    else if (m === 'laugh') open(M.laugh, 26, 268);
    else if (m === 'grit') { c.save(); c.clip(M.grit); c.fillStyle = TEETH; c.fillRect(200, 225, 100, 40); c.strokeStyle = TEETH_D; c.lineWidth = 2.5; c.beginPath(); for (const x of [228, 239, 250, 261, 272]) { c.moveTo(x, 230); c.lineTo(x, 258); } c.stroke(); c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(214, 245); c.lineTo(286, 245); c.stroke(); c.restore(); c.lineWidth = 5; c.stroke(M.grit); }
  }

  function drawKit(c, s){
    const { dSn, dCr, dHat, dTom, dK, rm } = s;
    const env = (d, tau) => rm ? 0 : Math.exp(-d / tau);
    const cymbal = (x, y, rx, tilt, wob, col) => { c.save(); c.translate(x, y); c.rotate(tilt + wob);
      c.beginPath(); c.ellipse(0, 0, rx, 12, 0, 0, 7); c.fillStyle = col; c.fill(); c.save(); c.clip(); c.fillStyle = CYM_D; c.beginPath(); c.ellipse(8, 7, rx, 12, 0, 0, 7); c.fill(); c.restore();
      c.beginPath(); c.ellipse(0, 0, rx, 12, 0, 0, 7); c.lineWidth = 5; c.strokeStyle = INK; c.stroke();
      c.beginPath(); c.ellipse(-6, -2, rx * 0.6, 4.5, 0, 0, 7); c.lineWidth = 3; c.strokeStyle = CYM_L; c.stroke();
      c.beginPath(); c.arc(0, -2, 5, 0, 7); c.fillStyle = INK; c.fill(); c.restore(); };
    // ride (left) sways a little when the kit is hit hard; crash (right) swings and settles
    cymbal(KIT.ride.x, KIT.ride.y, KIT.ride.rx, -0.14, rm ? 0 : Math.sin(dK * 20) * 0.03 * Math.exp(-dK * 5), CYM);
    const w = rm ? 0 : Math.sin(dCr * 28) * 0.24 * Math.exp(-dCr * 3.5) + (dCr < 0.05 ? 0.14 : 0);
    cymbal(KIT.crash.x, KIT.crash.y, KIT.crash.rx, 0.16, w, CYM);
    if (dCr < 0.4 && !rm) { const q = 1 - dCr / 0.4, R = 20 + 26 * E.out(1 - q); c.globalAlpha = q; star(c, KIT.crash.x + 18, KIT.crash.y - 36, R, R * 0.45, 0.2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 5; c.strokeStyle = INK; c.stroke(); star(c, KIT.crash.x + 18, KIT.crash.y - 36, R * 0.55, R * 0.25, 0.2); c.fillStyle = GOLD; c.fill(); c.lineWidth = 3; c.stroke(); c.globalAlpha = 1; }
    // floor tom (left)
    { const { x, y } = KIT.tom, q = env(dTom, 0.07); c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.moveTo(x - 36, y + 40); c.lineTo(x - 42, 522); c.moveTo(x + 36, y + 40); c.lineTo(x + 42, 522); c.stroke();
      c.save(); c.translate(x, y + 50); c.scale(1 + 0.05 * q, 1 - 0.1 * q); c.translate(-x, -y - 50);
      c.fillStyle = RED; c.fillRect(x - 44, y, 88, 50); c.fillStyle = RED_D; c.fillRect(x + 16, y, 28, 50); c.lineWidth = 5; c.strokeStyle = INK; c.strokeRect(x - 44, y, 88, 50);
      c.strokeStyle = CHROME; c.lineWidth = 4; c.beginPath(); c.moveTo(x - 42, y + 12); c.lineTo(x + 42, y + 12); c.stroke();
      c.beginPath(); c.ellipse(x, y + 50, 44, 10, 0, 0, Math.PI); c.fillStyle = RED_D; c.fill(); c.strokeStyle = INK; c.lineWidth = 5; c.stroke();
      c.beginPath(); c.ellipse(x, y, 44, 11, 0, 0, 7); c.fillStyle = '#fffaf0'; c.fill(); c.stroke(); c.restore(); }
    // snare, peeking over the bass drum
    { const { x, y } = KIT.snare, q = env(dSn, 0.06), jump = -3 * q;
      c.save(); c.translate(x, y + 14); c.scale(1 + 0.05 * q, 1 - 0.12 * q); c.translate(-x, -y - 14 + jump);
      c.fillStyle = CHROME; c.fillRect(x - 40, y, 80, 30); c.fillStyle = CHROME_D; c.fillRect(x + 18, y, 22, 30); c.lineWidth = 5; c.strokeStyle = INK; c.strokeRect(x - 40, y, 80, 30);
      c.strokeStyle = RED; c.lineWidth = 5; c.beginPath(); c.moveTo(x - 38, y + 11); c.lineTo(x + 38, y + 11); c.moveTo(x - 38, y + 21); c.lineTo(x + 38, y + 21); c.stroke();
      c.beginPath(); c.ellipse(x, y, 40, 10, 0, 0, 7); c.fillStyle = '#fffaf0'; c.fill(); c.strokeStyle = INK; c.lineWidth = 5; c.stroke(); c.restore(); }
    // hi-hat: the top cymbal claps down on each hit
    { const { x, y, rx } = KIT.hat, dn = 7 * env(dHat, 0.05);
      c.beginPath(); c.ellipse(x, y + 12, rx, 8, 0, 0, 7); c.fillStyle = CYM_D; c.fill(); c.lineWidth = 5; c.strokeStyle = INK; c.stroke();
      c.save(); c.translate(x, y + dn); c.rotate(rm ? 0 : Math.sin(dHat * 40) * 0.06 * Math.exp(-dHat * 10));
      c.beginPath(); c.ellipse(0, 0, rx, 8, 0, 0, 7); c.fillStyle = '#ffdc70'; c.fill(); c.stroke(); c.beginPath(); c.arc(0, -3, 4, 0, 7); c.fillStyle = INK; c.fill(); c.restore(); }
    // bass drum: the big star drum, thumping forward on every kick
    { const { x, y, r } = KIT.kick, q = env(dK, 0.08), R = r * (1 + 0.06 * q);
      c.save(); c.translate(x, y); c.scale(1 + 0.02 * q, 1 - 0.02 * q);
      c.beginPath(); c.arc(0, 0, R, 0, 7); c.fillStyle = RED; c.fill(); c.lineWidth = 7; c.strokeStyle = INK; c.stroke();
      c.save(); c.clip(); c.fillStyle = RED_D; c.beginPath(); c.arc(-12, -12, R, 0, 7); c.rect(-200, -200, 400, 400); c.fill('evenodd'); c.restore();
      c.beginPath(); c.arc(0, 0, R, 0, 7); c.lineWidth = 7; c.stroke();
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; c.save(); c.translate(Math.cos(a) * R * 0.87, Math.sin(a) * R * 0.87); c.fillStyle = CHROME; c.fillRect(-5, -5, 10, 10); c.lineWidth = 3; c.strokeRect(-5, -5, 10, 10); c.restore(); }
      c.beginPath(); c.arc(0, 0, R * 0.75, 0, 7); c.fillStyle = CREAM; c.fill(); c.lineWidth = 5; c.stroke();
      c.restore(); }
  }
  return { create, draw, plan, handAt, HIT, KIT };
})();
