// ============================================================================================================
// FaceDecal: a character's face, drawn in 2D ink on the canvas of its sj_face region (ASSET SPEC v1).
// ============================================================================================================
// A face is DATA: a face spec (what this character's features look like) + expression parameters (what they are
// doing right now). The decal is redrawn only when something changes (an expression, a blink, a pupil step), so
// a face costs nothing on most frames. Expressions change pose-to-pose: one smeared in-between, one overshoot,
// then the hold, like a hand-drawn cut.
//
//   const hero = Assets.spawn('mannequin', { faceSize: 512 });
//   const face = FaceDecal.create(hero, { eyes: { shape: 'oval', iris: '#2EC4B6' }, brows: { style: 'taper', color: '#2a1f4e' },
//                                         extras: [{ type: 'blush' }, { type: 'freckles' }] });
//   face.set('hype');                              // a named expression (FaceDecal.PRESETS), 2 in-betweens
//   face.set({ mouth: 'oh', browY: 0.8 }, { snap: true });      // or raw parameters on top of the neutral face
//   face.mouth('ah');                              // lip-sync / singing: only the mouth changes, at once
//   face.look(rig.look.eyeX, -rig.look.eyeY);      // pupils follow a target (-1..1, +x = the viewer's right, +y down);
//                                                  // they move in steps, at most ~5 times a second (each is a texture upload)
//   every frame: face.update(dt);                  // blinks, in-betweens; redraws + uploads only when needed
//
// ---- canvas ------------------------------------------------------------------------------------------------
//   Everything is authored on a 256-unit square whatever the texture size: the origin is BETWEEN THE EYES, +x is the
//   viewer's right (the character's left), +y is down. The mannequin's face reaches x = +-115, y = -90 (hairline)
//   to 115 (chin); its nose (geometry) sits at (0, 28) and is about 24 units wide, so mouths live around y = 70.
//   Texture: 512 px for the hero and close-ups, 256 px for a band member at stage distance (Assets.spawn faceSize).
//   Lines are thick on purpose (spec.line, 7.5 units = 3 % of the face): a face on a phone is about 40 px wide.
//
// ---- face spec (all optional; FaceDecal.SPEC holds the defaults, FaceDecal.SPECS a few ready-made faces) ------
//   { ink: '#1E1B2E', line: 7.5, scale: 1.16 (everything, about the point between the eyes: big graphic features read at
//     stage distance; the numbers below are before this scale),
//     eyes:  { shape: 'oval' | 'round' | 'almond' | 'half' | 'rect' | 'dot', x: 44 (half the spacing), y: 0, w: 21, h: 27
//              (radii), tilt: degrees (outer corners up), white: '#fff', iris: null | colour, pupil: 0.56 (of the eye),
//              shine: true, lash: 0..3, lidLine: 1 (weight of the lid line, x line) },
//     brows: { style: 'bar' | 'arc' | 'taper' | 'thin', x: 44, y: -42, w: 22 (half length), thick: 9, color },
//     mouth: { y: 68, w: 29 (half width), inner: '#6b1730', tongue: '#ff6f91', teeth: 'top' | 'both' | 'none' | 'grill' |
//              'gap' | 'fangs', teethColor: '#fff', lip: null | colour },
//     extras: [ { type: 'blush', style: 'oval' | 'lines', color, x, y }, { type: 'freckles' }, { type: 'moustache', style:
//              'handlebar' | 'brush', color }, { type: 'goatee', color }, { type: 'shades', color, shine }, { type:
//              'glasses', color }, { type: 'mole', x, y }, { type: 'scar', x, y }, { type: 'bags' }, { type: 'star', x, y, color } ] }
//
// ---- expression parameters -----------------------------------------------------------------------------------
//   eoL, eoR   eye openness 0..1.25 (eo sets both; L / R are the CHARACTER's left / right)
//   ec         how a shut eye curves: -1 = a resting lid (blink, sleep), +1 = a laughing arc (^ ^)
//   sq         squint: the lower lid comes up 0..1          lid   upper lid slant: + angry / focused, - sad
//   browA      degrees: + angry (inner ends down), - worried        browY  raise (+) / lower (-), in brow thicknesses
//   browAs     asymmetry: + raises the character's left brow, lowers the right one (the "oh really" brow)
//   lx, ly     pupil look target, -1..1 (also face.look)     pup   pupil size multiplier
//   glyph      null | 'x' | 'squeeze' (> <) | 'star'         replaces the eyes
//   mouth      a shape name from FaceDecal.MOUTHS (neutral, flat, smile, smirk, grin, open, ah, oh, oo, ee, yell, grit,
//              laugh, frown, wobble, pout, tongue, whistle) or its raw numbers { w, o, c, s, r, t, g, wob }:
//              width, open, curve (+ smile / - frown), skew (smirk), round, teeth (1 = top row, 2 = clenched), tongue
//              (> 1 sticks out), wobble
//   blush      0..1 extra blush                              mark  null | 'sweat' | 'vein' | 'tear'
//   PRESETS: idle, happy, joy, hype, focus, cool, smug, shock, oops, sad, angry, strain, wink, sleepy, dizzy, star,
//            sing_a, sing_o, sing_e, yell, whistle
//
// ---- API ----------------------------------------------------------------------------------------------------
//   FaceDecal.create(instance | null, spec, { size }) -> face     instance: from Assets.spawn (uses instance.face);
//                                                                 null: its own canvas (menus, sheets, tests)
//   face.set(preset | params, { snap, frames: 2, hold })   pose-to-pose change; hold: seconds, then back to the last
//                                                          expression set without a hold (a flash of 'oops' on a miss)
//   face.mouth(shape | null)   face.look(x, y)   face.blink()   face.autoBlink = true
//   face.update(dt) -> true when it redrew                 face.draw()  force a redraw
//   face.spec / face.respec(spec)                          face.canvas, face.redraws (count, for budgets)
//   FaceDecal.sheet(spec, names?, cell = 256) -> canvas    every expression of a face side by side (preview / tests)
// ============================================================================================================
const FaceDecal = (function(){
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const SPEC = {
    ink: '#1E1B2E', line: 7.5, scale: 1.16,
    eyes: { shape: 'oval', x: 44, y: 0, w: 21, h: 27, tilt: 0, white: '#ffffff', iris: null, pupil: 0.56, shine: true, lash: 0, lidLine: 1 },
    brows: { style: 'taper', x: 44, y: -42, w: 22, thick: 9, color: null },
    mouth: { y: 68, w: 29, inner: '#6b1730', tongue: '#ff6f91', teeth: 'top', teethColor: '#ffffff', lip: null },
    extras: []
  };
  // ready-made faces: original band members used by the demos (specs are plain data; make your own)
  const SPECS = {
    hero: { eyes: { shape: 'oval', iris: null }, brows: { style: 'taper', color: '#2a1f4e' }, extras: [{ type: 'blush' }] },
    cool: { eyes: { shape: 'half', w: 22, h: 24 }, brows: { style: 'bar', thick: 10, color: '#1E1B2E' }, mouth: { teeth: 'grill', teethColor: '#FFCE3A' }, extras: [{ type: 'moustache', style: 'handlebar', color: '#1E1B2E' }] },
    diva: { eyes: { shape: 'almond', w: 25, h: 21, tilt: 9, lash: 3, iris: '#7B5CF0' }, brows: { style: 'arc', thick: 6, color: '#5a2a4e' }, mouth: { lip: '#FF5E7E', w: 22 }, extras: [{ type: 'blush', style: 'lines' }, { type: 'mole', x: 34, y: 52 }] },
    kid: { eyes: { shape: 'dot', w: 11, h: 15, x: 40 }, brows: { style: 'thin', color: '#7a4a2a', y: -34 }, mouth: { teeth: 'gap' }, extras: [{ type: 'freckles' }, { type: 'blush' }] },
    boss: { eyes: { shape: 'rect', w: 20, h: 17, iris: '#2EC4B6' }, brows: { style: 'bar', thick: 12, w: 26, color: '#3a2a20' }, mouth: { teeth: 'both', w: 30 }, extras: [{ type: 'goatee', color: '#3a2a20' }, { type: 'scar', x: 66, y: -18 }] },
    shady: { eyes: { shape: 'round', w: 20, h: 20 }, brows: { style: 'bar', color: '#1E1B2E' }, extras: [{ type: 'shades', color: '#FF8FC7' }] }
  };
  const E0 = { eoL: 1, eoR: 1, ec: -1, sq: 0, lid: 0, browA: 0, browY: 0, browAs: 0, lx: 0, ly: 0, pup: 1, glyph: null, mouth: 'neutral', blush: 0, mark: null };
  const NUM = ['eoL', 'eoR', 'ec', 'sq', 'lid', 'browA', 'browY', 'browAs', 'pup', 'blush'];
  const M0 = { w: 1, o: 0, c: 0, s: 0, r: 0, t: 0, g: 0, wob: 0 }, MK = ['w', 'o', 'c', 's', 'r', 't', 'g', 'wob'];
  const MOUTHS = {
    neutral: { w: 0.62, c: 0.25 }, flat: { w: 0.75, c: 0 }, smile: { w: 1, c: 0.85 }, smirk: { w: 0.8, c: 0.7, s: 0.75 },
    grin: { w: 1.2, o: 0.5, c: 1, t: 2 }, open: { w: 0.85, o: 0.7, c: 0.75, t: 1, g: 0.6 }, ah: { w: 0.8, o: 0.95, c: 0.35, t: 1, g: 0.7 },
    oh: { w: 0.5, o: 0.8, r: 1 }, oo: { w: 0.34, o: 0.42, r: 1 }, ee: { w: 1.15, o: 0.36, c: 0.5, t: 2 },
    yell: { w: 1.05, o: 1.3, c: 0.1, t: 1, g: 0.75 }, grit: { w: 1.15, o: 0.5, c: -0.25, t: 2 }, laugh: { w: 1.25, o: 1.05, c: 1, t: 1, g: 0.65 },
    frown: { w: 0.8, c: -0.8 }, wobble: { w: 0.95, c: -0.3, wob: 1 }, pout: { w: 0.36, c: -0.5 }, tongue: { w: 0.85, o: 0.45, c: 0.9, g: 1.8 },
    whistle: { w: 0.26, o: 0.3, r: 1 }
  };
  const PRESETS = {
    idle: { mouth: 'smile' },
    happy: { mouth: 'grin', browY: 0.5, sq: 0.3 },
    joy: { eo: 0, ec: 1, mouth: 'laugh', browY: 0.8, blush: 0.8 },
    hype: { eo: 1.18, pup: 0.8, mouth: 'yell', browY: 1.1 },
    focus: { eo: 0.85, lid: 0.55, browA: 14, browY: -0.5, mouth: 'flat' },
    cool: { eo: 0.62, mouth: 'smirk', browAs: 0.7, browY: 0.1 },
    smug: { eo: 0.5, ec: 1, sq: 0.35, mouth: 'smirk', browA: -6, browY: 0.5 },
    shock: { eo: 1.25, pup: 0.5, mouth: 'oh', browY: 1.5 },
    oops: { eo: 1.12, pup: 0.6, mouth: 'wobble', browA: -18, browY: 0.7, mark: 'sweat' },
    sad: { eo: 0.85, lid: -0.7, browA: -20, mouth: 'frown', ly: 0.5 },
    angry: { eo: 0.85, lid: 0.9, browA: 24, browY: -0.9, mouth: 'grit', mark: 'vein' },
    strain: { glyph: 'squeeze', mouth: 'grit', browA: 20, browY: -0.6, blush: 0.6 },
    wink: { eoR: 0, ec: 1, mouth: 'grin', browAs: 0.6, browY: 0.3 },
    sleepy: { eo: 0.38, lid: -0.15, mouth: 'neutral', browY: -0.4 },
    dizzy: { glyph: 'x', mouth: 'wobble', browA: -10 },
    star: { glyph: 'star', mouth: 'laugh', browY: 1 },
    sing_a: { eo: 0.9, mouth: 'ah', browY: 0.8 }, sing_o: { eo: 0, ec: -1, mouth: 'oh', browY: 1, browA: -8 }, sing_e: { eo: 1, mouth: 'ee', browY: 0.4 },
    yell: { eo: 0.9, lid: 0.6, browA: 18, browY: -0.3, mouth: 'yell' },
    whistle: { eo: 0.9, mouth: 'whistle', browY: 0.6, lx: 0.6, ly: -0.3 }
  };

  function merge(base, over){ const o = {}; for (const k in base) o[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? Object.assign({}, base[k], over && over[k]) : (over && over[k] !== undefined ? over[k] : base[k]); if (over && over.extras) o.extras = over.extras; return o; }
  function mouthOf(m){ const src = typeof m === 'string' ? MOUTHS[m] || MOUTHS.neutral : m || MOUTHS.neutral; const o = {}; for (const k of MK) o[k] = src[k] == null ? M0[k] : src[k]; return o; }
  function resolve(p){                                     // preset name or params -> a full parameter set (mouth as numbers)
    const src = typeof p === 'string' ? PRESETS[p] : p; if (!src) throw new Error('FaceDecal: no expression "' + p + '"');
    const o = Object.assign({}, E0, src); if (src.eo != null) { if (src.eoL == null) o.eoL = src.eo; if (src.eoR == null) o.eoR = src.eo; } delete o.eo;
    o.mouth = mouthOf(o.mouth); return o;
  }
  function mix(a, b, t, out){
    for (const k of NUM) out[k] = a[k] + (b[k] - a[k]) * t;
    for (const k of MK) out.mouth[k] = a.mouth[k] + (b.mouth[k] - a.mouth[k]) * t;
    const s = t < 0.5 ? a : b; out.glyph = s.glyph; out.mark = s.mark; out.lx = b.lx; out.ly = b.ly;
    if (out.eoL < 0) out.eoL = 0; if (out.eoR < 0) out.eoR = 0; if (out.mouth.o < 0) out.mouth.o = 0;
    return out;
  }

  function Face(inst, spec, o){
    o = o || {};
    if (inst && inst.face) { this.target = inst.face; this.canvas = inst.face.canvas; this.ctx = inst.face.ctx; this.size = inst.face.size; }
    else { this.target = null; this.size = o.size || 256; this.canvas = o.canvas || document.createElement('canvas'); if (!o.canvas) this.canvas.width = this.canvas.height = this.size; else this.size = this.canvas.width; this.ctx = this.canvas.getContext('2d'); }
    this.respec(spec);
    this.cur = resolve('idle'); this.from = resolve('idle'); this.to = resolve('idle'); this.base = this.to; this.shown = resolve('idle');
    this.stage = 3; this.t = 0; this.frames = 2; this.holdT = 0;
    this.lx = 0; this.ly = 0; this.qx = 0; this.qy = 0; this.lookSet = false; this.lookT = 0;
    this.autoBlink = true; this.bt = 1.5 + Math.random() * 3; this.bs = 0; this.bk = 1;
    this.mo = null; this.dirty = true; this.redraws = 0; this.seed = (o.seed || 1) * 7919 % 233280;
  }
  Face.prototype = {
    respec(spec){ this.spec = merge(SPEC, spec || {}); if (!this.spec.brows.color) this.spec.brows.color = this.spec.ink; this.dirty = true; return this; },
    set(p, o){
      o = o || {}; const to = resolve(p);
      if (!o.hold) this.base = to;
      this.holdT = o.hold || 0;
      mix(this.shown, this.shown, 0, this.from); this.to = to; this.mo = null;
      this.frames = o.frames == null ? 2 : o.frames;
      if (o.snap || this.frames <= 0) { this.stage = 3; mix(to, to, 1, this.cur); } else { this.stage = this.frames >= 2 ? 0 : 1; this.t = 0; this._stage(); }
      this.dirty = true; return this;
    },
    _stage(){                                              // 0: smeared in-between, 1: overshoot, 2..: the pose
      if (this.stage === 0) { mix(this.from, this.to, 0.55, this.cur); this.cur.eoL *= 0.55; this.cur.eoR *= 0.55; }
      else if (this.stage === 1) { mix(this.from, this.to, 1.22, this.cur); }
      else mix(this.to, this.to, 1, this.cur);
    },
    mouth(m){ this.mo = m == null ? null : mouthOf(m); this.dirty = true; return this; },
    look(x, y){ this.lx = Math.max(-1, Math.min(1, x || 0)); this.ly = Math.max(-1, Math.min(1, y || 0)); this.lookSet = true;
      // pupils move in steps, with hysteresis: a head that bobs does not make them (and the texture upload) flicker
      if (this.lookT <= 0 && (Math.abs(this.lx - this.qx) > 0.3 || Math.abs(this.ly - this.qy) > 0.4)) { this.qx = Math.round(this.lx * 4) / 4; this.qy = Math.round(this.ly * 3) / 3; this.lookT = 0.18; this.dirty = true; } return this; },
    blink(){ if (this.bs === 0) { this.bs = 1; this.bq = 0; this.bk = 0.45; this.dirty = true; } return this; },
    update(dt){
      if (this.lookT > 0) this.lookT -= dt;
      if (this.stage < 3) { this.t += dt; const step = 0.045;
        if (this.t >= step) { this.t = 0; this.stage++; if (this.stage >= 2) this.stage = 3; this._stage(); this.dirty = true; } }
      else if (this.holdT > 0) { this.holdT -= dt; if (this.holdT <= 0) this.set(this.base); }
      // blink: half, shut, half, open (about 150 ms)
      if (this.bs > 0) { this.bq += dt; const d = this.bs === 2 ? 0.07 : 0.035;
        if (this.bq >= d) { this.bq = 0; this.bs = this.bs === 3 ? 0 : this.bs + 1; this.bk = this.bs === 2 ? 0 : this.bs === 0 ? 1 : 0.45; this.dirty = true; } }
      else if (this.autoBlink) { this.bt -= dt; if (this.bt <= 0) { this.seed = (this.seed * 9301 + 49297) % 233280; this.bt = 2.2 + this.seed / 233280 * 3.6; this.blink(); } }
      if (!this.dirty) return false;
      this.draw(); return true;
    },

    // ---- drawing --------------------------------------------------------------------------------------------
    draw(){
      const c = this.ctx, S = this.size, sp = this.spec, e = this.cur, u = S / 256, sh = this.shown;
      mix(e, e, 1, sh); if (this.mo) for (const k of MK) sh.mouth[k] = this.mo[k];
      sh.lx = this.lookSet ? this.qx : e.lx; sh.ly = this.lookSet ? this.qy : e.ly;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, S, S); { const k = u * (sp.scale || 1); c.setTransform(k, 0, 0, k, S / 2, S / 2); }
      c.lineCap = 'round'; c.lineJoin = 'round'; c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      const shades = sp.extras.find(x => x.type === 'shades');
      if (!shades) { this._eye(c, -1, sh.eoR * this.bk, sh); this._eye(c, 1, sh.eoL * this.bk, sh); }
      for (const x of sp.extras) this._under(c, x, sh);
      if (sh.blush > 0.02 && !sp.extras.some(x => x.type === 'blush')) this._under(c, { type: 'blush', _a: sh.blush }, sh);
      this._brows(c, sh);
      this._mouth(c, sh.mouth);
      for (const x of sp.extras) this._over(c, x, sh);
      if (sh.mark) this._mark(c, sh.mark);
      this.dirty = false; this.redraws++;
      if (this.target) this.target.update();
    },
    _shape(c, shape, w, h){
      c.beginPath();
      if (shape === 'almond') { c.moveTo(-w, 0); c.quadraticCurveTo(0, -h * 2, w, 0); c.quadraticCurveTo(0, h * 2, -w, 0); c.closePath(); }
      else if (shape === 'half') { c.moveTo(-w, -h * 0.3); c.lineTo(w, -h * 0.3); c.bezierCurveTo(w, h * 1.45, -w, h * 1.45, -w, -h * 0.3); c.closePath(); }
      else if (shape === 'rect') { const r = Math.min(w, h) * 0.5; c.moveTo(-w + r, -h); c.arcTo(w, -h, w, h, r); c.arcTo(w, h, -w, h, r); c.arcTo(-w, h, -w, -h, r); c.arcTo(-w, -h, w, -h, r); c.closePath(); }
      else c.ellipse(0, 0, w, shape === 'round' ? w : h, 0, 0, TAU);
    },
    _eye(c, sx, open, e){
      const sp = this.spec, E = sp.eyes, w = E.w, lw = sp.line; let h = E.shape === 'round' ? E.w : E.h;
      c.save(); c.translate(sx * E.x, E.y); c.rotate(-sx * E.tilt * DEG);
      c.strokeStyle = sp.ink; c.fillStyle = sp.ink; c.lineWidth = lw;
      if (e.glyph) {
        const g = e.glyph, r = Math.max(w, h * 0.8);
        if (g === 'x') { c.lineWidth = lw * 1.15; c.beginPath(); c.moveTo(-r * 0.75, -r * 0.75); c.lineTo(r * 0.75, r * 0.75); c.moveTo(r * 0.75, -r * 0.75); c.lineTo(-r * 0.75, r * 0.75); c.stroke(); }
        else if (g === 'squeeze') { c.lineWidth = lw * 1.15; c.beginPath(); c.moveTo(sx * r * 0.85, -r * 0.7); c.lineTo(-sx * r * 0.6, 0); c.lineTo(sx * r * 0.85, r * 0.7); c.stroke(); }
        else if (g === 'star') { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = (i % 2 ? 0.5 : 1.15) * r; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fillStyle = '#FFCE3A'; c.fill(); c.lineWidth = lw * 0.8; c.stroke(); }
        c.restore(); return;
      }
      if (open < 0.1) {                                    // shut: one confident arc
        c.lineWidth = lw * 1.1; c.beginPath();
        if (e.ec > 0) { c.moveTo(-w, h * 0.28); c.quadraticCurveTo(0, -h * 0.95 * e.ec, w, h * 0.28); }
        else { c.moveTo(-w, -h * 0.05); c.quadraticCurveTo(0, h * 0.6 * -e.ec, w, -h * 0.05); }
        c.stroke(); this._lash(c, sx, w, e.ec > 0 ? h * 0.28 : -h * 0.05); c.restore(); return;
      }
      if (E.shape === 'dot') {                             // bead eyes: solid ink
        const hh = Math.max(lw * 0.6, h * Math.min(1.2, open)); c.beginPath(); c.ellipse(0, 0, w, hh, 0, 0, TAU); c.fill();
        if (E.shine && open > 0.5) { c.fillStyle = '#fff'; c.beginPath(); c.arc(-w * 0.3, -hh * 0.38, w * 0.3, 0, TAU); c.fill(); }
        c.restore(); return;
      }
      const over = Math.max(1, open); h *= 1 + (over - 1) * 0.6; const ww = w * (1 + (over - 1) * 0.3);
      this._shape(c, E.shape, ww, h); c.fillStyle = E.white; c.fill();
      c.save(); c.clip();
      const pr = Math.min(ww, h) * E.pupil * e.pup, px = e.lx * (ww - pr * 0.8) * 0.8, py = e.ly * (h - pr) * 0.75 + (E.shape === 'half' ? h * 0.25 : 0);
      if (E.iris) { c.fillStyle = E.iris; c.beginPath(); c.ellipse(px, py, pr * 1.25, pr * 1.5, 0, 0, TAU); c.fill(); c.lineWidth = lw * 0.45; c.stroke();
        c.fillStyle = sp.ink; c.beginPath(); c.ellipse(px, py, pr * 0.62, pr * 0.8, 0, 0, TAU); c.fill(); }
      else { c.fillStyle = sp.ink; c.beginPath(); c.ellipse(px, py, pr * 0.92, pr * 1.2, 0, 0, TAU); c.fill(); }
      if (E.shine) { c.fillStyle = '#fff'; c.beginPath(); c.arc(px - pr * 0.36, py - pr * 0.5, pr * 0.33, 0, TAU); c.fill(); }
      c.restore();
      c.strokeStyle = sp.ink; c.lineWidth = lw; this._shape(c, E.shape, ww, h); c.stroke();
      // lids: erase what they cover (the skin shows through), then ink the lid line
      const cut = 1 - Math.min(1, open), yi = -h + 2 * h * cut + Math.max(0, e.lid) * h * 0.95, yo = -h + 2 * h * cut + Math.max(0, -e.lid) * h * 0.95;
      const xi = -sx * (ww + lw), xo = sx * (ww + lw), B = 200;
      if (cut > 0.01 || Math.abs(e.lid) > 0.02) {
        c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.moveTo(xi, yi - lw * 0.4); c.lineTo(xo, yo - lw * 0.4); c.lineTo(xo, -B); c.lineTo(xi, -B); c.closePath(); c.fill();
        c.globalCompositeOperation = 'source-over'; c.save(); this._shape(c, E.shape, ww + lw * 0.5, h + lw * 0.5); c.clip();
        c.lineWidth = lw * 1.25 * E.lidLine; c.beginPath(); c.moveTo(xi, yi); c.lineTo(xo, yo); c.stroke(); c.restore();
      }
      if (e.sq > 0.02) {
        const ys = h - e.sq * h * 0.75, yc = h - e.sq * h * 1.35;
        c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.moveTo(-ww - lw, ys + lw * 0.4); c.quadraticCurveTo(0, yc + lw * 0.4, ww + lw, ys + lw * 0.4); c.lineTo(ww + lw, B); c.lineTo(-ww - lw, B); c.closePath(); c.fill();
        c.globalCompositeOperation = 'source-over'; c.save(); this._shape(c, E.shape, ww + lw * 0.5, h + lw * 0.5); c.clip();
        c.lineWidth = lw; c.beginPath(); c.moveTo(-ww - lw, ys); c.quadraticCurveTo(0, yc, ww + lw, ys); c.stroke(); c.restore();
      }
      this._lash(c, sx, ww, -h * 0.35 + 2 * h * cut * 0.6);
      c.restore();
    },
    _lash(c, sx, w, y){ const n = this.spec.eyes.lash; if (!n) return; const lw = this.spec.line; c.lineWidth = lw * 0.8; c.beginPath();
      for (let i = 0; i < n; i++) { const a = (-18 - i * 24) * DEG, x0 = sx * (w - 2 - i * 5), y0 = y - i * 3.5; c.moveTo(x0, y0); c.lineTo(x0 + sx * Math.cos(a) * 13, y0 + Math.sin(a) * 13); } c.stroke(); },
    _brows(c, e){
      const sp = this.spec, B = sp.brows, lw = B.thick; if (B.style === 'none') return;
      for (const sx of [-1, 1]) {
        const as = e.browAs * (sx > 0 ? 1 : -1), y = B.y - (e.browY + as) * lw * 0.9, A = (e.browA - as * 5) * DEG, w = B.w;
        const yi = Math.sin(A) * w, yo = -Math.sin(A) * w * 0.75;
        c.save(); c.translate(sx * B.x, y); c.scale(sx, 1);              // local: -x = inner end, +x = outer end
        c.strokeStyle = B.color; c.fillStyle = B.color; c.lineWidth = lw;
        if (B.style === 'taper') { const t = lw * 0.62; c.beginPath(); c.moveTo(-w, yi - t); c.quadraticCurveTo(0, (yi + yo) / 2 - t * 1.5, w, yo - t * 0.2); c.lineTo(w + 1, yo + t * 0.25); c.quadraticCurveTo(0, (yi + yo) / 2 + t * 0.3, -w, yi + t); c.closePath(); c.fill(); c.lineWidth = lw * 0.3; c.stroke(); }
        else if (B.style === 'arc') { c.beginPath(); c.moveTo(-w, yi + 3); c.quadraticCurveTo(0, (yi + yo) / 2 - 11, w, yo + 4); c.stroke(); }
        else { if (B.style === 'thin') c.lineWidth = lw * 0.6; c.beginPath(); c.moveTo(-w, yi); c.lineTo(w, yo); c.stroke(); }
        c.restore();
      }
    },
    _mouth(c, m){
      const sp = this.spec, M = sp.mouth, lw = sp.line, W = Math.max(3, M.w * m.w), y0 = M.y, lift = m.c * W * 0.42, dx = m.s * W * 0.22;
      const yl = y0 - lift * (1 - m.s), yr = y0 - lift * (1 + m.s * 0.6);
      c.strokeStyle = sp.ink; c.lineWidth = lw; c.fillStyle = M.inner;
      if (m.o < 0.07) {                                    // shut: one stroke
        c.beginPath();
        if (m.wob > 0.05) { const n = 18; for (let i = 0; i <= n; i++) { const t = i / n, x = -W + 2 * W * t, base = (1 - t) * yl + t * yr + 4 * t * (1 - t) * lift * 0.9, y = base + Math.sin(t * Math.PI * 5) * 4.2 * m.wob * Math.sin(t * Math.PI); if (i) c.lineTo(x + dx, y); else c.moveTo(x + dx, y); } }
        else { c.moveTo(-W + dx, yl); c.quadraticCurveTo(dx, y0 + lift * 1.15, W + dx, yr); }
        if (M.lip) { c.strokeStyle = M.lip; c.lineWidth = lw * 1.9; c.stroke(); c.strokeStyle = sp.ink; c.lineWidth = lw * 0.7; }
        c.stroke(); return;
      }
      const H = M.w * 1.5 * m.o, sm = Math.max(0, Math.min(1, m.c)); let top, bot;
      c.beginPath();
      if (m.r > 0.5) { const ry = Math.max(4, H * 0.62); c.ellipse(dx, y0 + ry * 0.35, W, ry, 0, 0, TAU); top = y0 + ry * 0.35 - ry; bot = y0 + ry * 0.35 + ry; }
      else { const tc = y0 + lift * 0.35 * sm - H * 0.45 * (1 - sm), bc = y0 + lift * 0.35 + H * (1.3 + 0.35 * sm);
        c.moveTo(-W + dx, yl); c.quadraticCurveTo(dx, tc, W + dx, yr); c.quadraticCurveTo(dx, bc, -W + dx, yl); c.closePath(); top = 0.5 * tc + 0.25 * (yl + yr); bot = 0.5 * bc + 0.25 * (yl + yr); }
      if (M.lip) { c.strokeStyle = M.lip; c.lineWidth = lw * 2.2; c.stroke(); c.strokeStyle = sp.ink; c.lineWidth = lw * 0.75; }
      c.fill(); c.save(); c.clip();
      const teeth = M.teeth, hgt = bot - top;
      if (m.g > 0.02) { c.fillStyle = M.tongue; c.beginPath(); c.ellipse(dx, bot + hgt * 0.08, W * 0.62, hgt * 0.5 * Math.min(1, m.g), 0, 0, TAU); c.fill(); }
      if (m.t > 0.02 && teeth !== 'none') {
        c.fillStyle = M.teethColor;
        if (m.t > 1.5) { c.fillRect(dx - W * 1.3, top - 20, W * 2.6, hgt + 40); c.lineWidth = lw * 0.36; c.beginPath(); c.moveTo(dx - W * 1.3, (top + bot) / 2 + lift * 0.2); c.quadraticCurveTo(dx, (top + bot) / 2 + lift * 0.5, dx + W * 1.3, (top + bot) / 2 + lift * 0.2);
          const n = Math.max(1, Math.round(W / 17)); for (let i = -n; i <= n; i++) { if (teeth !== 'grill' && i === 0 && teeth === 'gap') continue; const x = dx + (i + 0.5) * W / (n + 0.5); c.moveTo(x, top - 5); c.lineTo(x, bot + 5); } c.stroke(); }
        else { const th = hgt * 0.34 * m.t; c.fillRect(dx - W * 1.3, top - 20, W * 2.6, 20 + th);
          if (teeth === 'both') c.fillRect(dx - W * 0.8, bot - hgt * 0.18, W * 1.6, 30);
          if (teeth === 'gap') { c.fillStyle = M.inner; c.fillRect(dx - 2.2, top - 5, 4.4, th + 6); }
          if (teeth === 'grill') { c.lineWidth = lw * 0.4; c.beginPath(); for (let i = -3; i <= 3; i++) { const x = dx + (i + 0.5) * W / 3.5; c.moveTo(x, top - 5); c.lineTo(x, top + th); } c.stroke(); }
          if (teeth === 'fangs') { c.fillStyle = M.teethColor; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(dx + s * W * 0.62, top + th - 1); c.lineTo(dx + s * W * 0.42, top + th + hgt * 0.3); c.lineTo(dx + s * W * 0.25, top + th - 1); c.fill(); } } }
      }
      c.restore();
      c.beginPath();
      if (m.r > 0.5) { const ry = Math.max(4, H * 0.62); c.ellipse(dx, y0 + ry * 0.35, W, ry, 0, 0, TAU); }
      else { const tc = y0 + lift * 0.35 * sm - H * 0.45 * (1 - sm), bc = y0 + lift * 0.35 + H * (1.3 + 0.35 * sm); c.moveTo(-W + dx, yl); c.quadraticCurveTo(dx, tc, W + dx, yr); c.quadraticCurveTo(dx, bc, -W + dx, yl); c.closePath(); }
      c.strokeStyle = sp.ink; c.stroke();
      if (m.g > 1.02) {                                    // the tongue sticks out
        const tw = W * 0.5, tl = 8 + (m.g - 1) * M.w * 0.9, ty = bot - lw * 0.5; c.fillStyle = M.tongue; c.lineWidth = lw * 0.8;
        c.beginPath(); c.moveTo(dx - tw, ty); c.lineTo(dx - tw, ty + tl - tw); c.arc(dx, ty + tl - tw, tw, Math.PI, 0, true); c.lineTo(dx + tw, ty); c.closePath(); c.fill(); c.stroke();
        c.lineWidth = lw * 0.5; c.beginPath(); c.moveTo(dx, ty + 2); c.lineTo(dx, ty + tl * 0.6); c.stroke();
      }
    },
    _under(c, x, e){
      const sp = this.spec, lw = sp.line;
      if (x.type === 'blush') { const a = Math.min(1, (x._a != null ? x._a : 0.6) + (x._a != null ? 0 : e.blush * 0.4)), bx = x.x || 74, by = x.y || 36;
        if (x.style === 'lines') { c.strokeStyle = x.color || '#FF5E7E'; c.globalAlpha = Math.min(1, a + 0.25); c.lineWidth = lw * 0.55; c.beginPath(); for (const sx of [-1, 1]) for (let i = -1; i <= 1; i++) { c.moveTo(sx * bx + i * 8 + 3, by - 6); c.lineTo(sx * bx + i * 8 - 3, by + 6); } c.stroke(); }
        else { c.fillStyle = x.color || '#FF5E7E'; c.globalAlpha = a * 0.6; for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * bx, by, 17, 10, 0, 0, TAU); c.fill(); } }
        c.globalAlpha = 1; }
      else if (x.type === 'freckles') { c.fillStyle = x.color || '#b5653a'; for (const sx of [-1, 1]) for (const p of [[-9, 0], [0, 6], [9, -1]]) { c.beginPath(); c.arc(sx * (x.x || 66) + p[0], (x.y || 30) + p[1], 2.6, 0, TAU); c.fill(); } }
      else if (x.type === 'bags') { c.strokeStyle = sp.ink; c.lineWidth = lw * 0.5; for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * sp.eyes.x - 14, sp.eyes.h + 9); c.quadraticCurveTo(sx * sp.eyes.x, sp.eyes.h + 16, sx * sp.eyes.x + 14, sp.eyes.h + 9); c.stroke(); } }
      else if (x.type === 'star') { c.save(); c.translate(x.x || 76, x.y || 34); c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? 6 : 14; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fillStyle = x.color || '#FFCE3A'; c.fill(); c.strokeStyle = sp.ink; c.lineWidth = lw * 0.6; c.stroke(); c.restore(); }
    },
    _over(c, x, e){
      const sp = this.spec, lw = sp.line, E = sp.eyes;
      if (x.type === 'moustache') { const y = x.y || 49; c.fillStyle = x.color || sp.ink; c.strokeStyle = sp.ink; c.lineWidth = lw * 0.5;
        if (x.style === 'brush') { c.beginPath(); c.moveTo(-22, y - 7); c.quadraticCurveTo(0, y - 12, 22, y - 7); c.quadraticCurveTo(28, y + 5, 20, y + 7); c.quadraticCurveTo(0, y + 3, -20, y + 7); c.quadraticCurveTo(-28, y + 5, -22, y - 7); c.closePath(); }
        else { c.beginPath(); c.moveTo(0, y - 5); for (const s of [1, -1]) { c.bezierCurveTo(s * 12, y - 11, s * 30, y - 6, s * 40, y + 6); c.bezierCurveTo(s * 44, y + 1, s * 46, y - 6, s * 50, y - 9); c.bezierCurveTo(s * 50, y + 8, s * 40, y + 15, s * 30, y + 12); c.bezierCurveTo(s * 16, y + 10, s * 8, y + 4, 0, y + 6); if (s > 0) c.lineTo(0, y - 5); } c.closePath(); }
        c.fill(); c.stroke(); }
      else if (x.type === 'goatee') { const y = sp.mouth.y + 26; c.fillStyle = x.color || sp.ink; c.beginPath(); c.moveTo(-11, y); c.quadraticCurveTo(0, y - 4, 11, y); c.quadraticCurveTo(8, y + 20, 0, y + 22); c.quadraticCurveTo(-8, y + 20, -11, y); c.fill(); }
      else if (x.type === 'shades' || x.type === 'glasses') { const solid = x.type === 'shades', w = E.w + 13, h = (E.shape === 'round' ? E.w : E.h) * 0.8 + 6, y = E.y + 2;
        c.strokeStyle = sp.ink; c.lineWidth = lw * (solid ? 1 : 0.8);
        for (const sx of [-1, 1]) { c.save(); c.translate(sx * (E.x + 2), y); c.beginPath(); const r = h * 0.55; c.moveTo(-w + r, -h); c.arcTo(w, -h, w, h, r * 0.7); c.arcTo(w, h, -w, h, r * 1.3); c.arcTo(-w, h, -w, -h, r * 1.3); c.arcTo(-w, -h, w, -h, r * 0.7); c.closePath();
          if (solid) { c.fillStyle = x.color || sp.ink; c.fill(); c.save(); c.clip(); c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.moveTo(-w * 0.2, -h * 1.2); c.lineTo(w * 0.25, -h * 1.2); c.lineTo(-w * 0.55, h * 1.2); c.lineTo(-w, h * 1.2); c.closePath(); c.fill(); c.restore(); }
          c.stroke(); c.restore(); }
        c.beginPath(); c.moveTo(-(E.x + 2 - w) - 1, y - h * 0.55); c.quadraticCurveTo(0, y - h * 0.9, (E.x + 2 - w) + 1, y - h * 0.55); c.lineWidth = lw; c.stroke(); }
      else if (x.type === 'mole') { c.fillStyle = sp.ink; c.beginPath(); c.arc(x.x || 40, x.y || 50, 3.4, 0, TAU); c.fill(); }
      else if (x.type === 'scar') { c.strokeStyle = x.color || '#c96a5a'; c.lineWidth = lw * 0.6; const X = x.x || 66, Y = x.y || -18; c.beginPath(); c.moveTo(X - 6, Y - 13); c.lineTo(X + 6, Y + 13); c.moveTo(X - 7, Y - 2); c.lineTo(X + 5, Y - 7); c.moveTo(X - 4, Y + 6); c.lineTo(X + 8, Y + 1); c.stroke(); }
    },
    _mark(c, mark){
      const sp = this.spec, lw = sp.line;
      if (mark === 'sweat' || mark === 'tear') { const x = mark === 'sweat' ? 92 : sp.eyes.x + 6, y = mark === 'sweat' ? -52 : sp.eyes.h + 18; c.fillStyle = '#9fe0ff'; c.strokeStyle = sp.ink; c.lineWidth = lw * 0.6;
        c.beginPath(); c.moveTo(x, y - 15); c.bezierCurveTo(x + 13, y + 2, x + 9, y + 13, x, y + 13); c.bezierCurveTo(x - 9, y + 13, x - 13, y + 2, x, y - 15); c.fill(); c.stroke(); }
      else if (mark === 'vein') { const x = -84, y = -66, a = 5, b = 13; c.strokeStyle = '#FF3355'; c.lineWidth = lw * 0.75; c.beginPath();
        for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { c.moveTo(x + sx * b, y + sy * a); c.quadraticCurveTo(x + sx * a, y + sy * a, x + sx * a, y + sy * b); } c.stroke(); }
    }
  };

  return {
    SPEC, SPECS, PRESETS, MOUTHS, Face,
    create(inst, spec, o){ const f = new Face(inst, typeof spec === 'string' ? SPECS[spec] : spec, o); f.draw(); return f; },
    sheet(spec, names, cell){
      names = names || Object.keys(PRESETS); cell = cell || 256; const cols = Math.min(names.length, 7), rows = Math.ceil(names.length / cols);
      const cv = document.createElement('canvas'); cv.width = cols * cell; cv.height = rows * (cell + 22); const c = cv.getContext('2d');
      const f = new Face(null, typeof spec === 'string' ? SPECS[spec] : spec, { size: cell }); f.autoBlink = false;
      names.forEach((n, i) => { const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + 22); f.set(n, { snap: true }); f.draw();
        c.fillStyle = '#f5b48a'; c.beginPath(); c.ellipse(x + cell / 2, y + cell * 0.52, cell * 0.46, cell * 0.47, 0, 0, TAU); c.fill(); c.drawImage(f.canvas, x, y);
        c.fillStyle = '#1E1B2E'; c.font = '600 15px sans-serif'; c.textAlign = 'center'; c.fillText(n, x + cell / 2, y + cell + 16); });
      return cv;
    }
  };
})();
