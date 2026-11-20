// ============================================================================================================
// VFX: cheap graphic effects. Bursts, confetti, impact stars, shockwave rings, speed lines, floating text.
// ============================================================================================================
// Every particle of every effect lives in ONE pooled, instanced quad mesh = ONE draw call, simulated entirely in
// the vertex shader (start position, velocity, gravity, drag, birth time, life are per-instance attributes), so a
// frame costs nothing on the CPU and emitting only writes a few floats into a ring buffer: no per-frame allocation,
// no garbage. Shapes are drawn in the fragment shader (anti-aliased SDFs, optional ink rim), additive and
// alpha-blended particles share the draw through premultiplied alpha. Pool size comes from the tier (GFX.tier.vfx).
//
//   scene.add(VFX.init());                                       // once per scene (after GFX.init)
//   VFX.burst(pos, { color: '#ffce3a', count: 18 });             // hit sparks
//   VFX.stars(pos, { count: 6 });   VFX.ring(pos, { color: '#fff' });   VFX.confetti(pos, { count: 80 });
//   VFX.speedLines(pos, { dir: [0, 0, 1] });   VFX.shock(pos);   // ring lying on the floor
//   VFX.hit(pos, 'perfect');                                     // a ready-made combo: ring + stars + sparks
//   VFX.text('PERFECT!', pos, { color: '#ffce3a' });             // floating text (pooled canvas sprites)
//
// ---- API ----------------------------------------------------------------------------------------------------
//   VFX.init([poolSize]) -> Object3D            VFX.dispose()         VFX.clear()
//   VFX.emit(p)   the primitive everything else uses; p (all optional but pos):
//       pos Vector3|[x,y,z], vel [x,y,z], shape VFX.GLOW|DISC|STAR|RING|RECT|STREAK|SHOCK, color (hex | THREE.Color),
//       gain (HDR multiplier: > 1 blooms), life (s), size, size1 (end size, default 0), rot, spin, gravity, drag,
//       add (true = additive light, false = opaque paint), ink (true = dark rim on DISC / STAR), delay (s)
//   VFX.burst(pos, { count, color, colors[], speed, size, life, gravity, up })
//   VFX.stars(pos, { count, color, size, speed })      VFX.ring(pos, { color, size, life })     VFX.shock(pos, {...})
//   VFX.confetti(pos, { count, colors[], spread, speed, life })
//   VFX.speedLines(pos, { count, dir, color, length, radius })
//   VFX.hit(pos, 'perfect' | 'good' | 'ok' | 'miss')
//   VFX.text(string, pos, { color, ink, size (m), life, rise, font }) -> slot index (pool of 8; oldest is reused)
//   VFX.PALETTE     the default party colours
// ============================================================================================================
const VFX = {
  GLOW: 0, DISC: 1, STAR: 2, RING: 3, RECT: 4, STREAK: 5, SHOCK: 6,
  PALETTE: ['#FFCE3A', '#FF5E7E', '#2EC4B6', '#7B5CF0', '#6CC8FF', '#FF8FC7', '#FFF7E6'],
  STRIDE: 20, TEXTS: 8,
  mesh: null, group: null, n: 0, head: 0, time: 0, _until: 0,
  _seed: 12345,

  // deterministic, allocation-free random (so tests are repeatable)
  rnd(){ let s = this._seed; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this._seed = s; return ((s >>> 0) % 100000) / 100000; },

  init(n){
    if (this.group) return this.group;
    const T = THREE; Toon.init();
    n = this.n = n || (typeof GFX !== 'undefined' && GFX.tier ? GFX.tier.vfx : 1536);
    const g = new T.InstancedBufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const buf = this._buf = new T.InstancedInterleavedBuffer(new Float32Array(n * this.STRIDE), this.STRIDE, 1); buf.setUsage(T.DynamicDrawUsage);
    ['aPos', 'aVel', 'aCol', 'aPar', 'aPhy'].forEach((a, i) => g.setAttribute(a, new T.InterleavedBufferAttribute(buf, 4, i * 4)));
    g.instanceCount = n;
    this._c = new T.Color(); this._ink = new T.Color(Toon.ink); this._p = new T.Vector3();
    const mat = new T.ShaderMaterial({ name: 'sj_vfx', vertexShader: this.VERT, fragmentShader: this.FRAG, transparent: true, depthWrite: false, side: T.DoubleSide,
      blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendEquation: T.AddEquation, premultipliedAlpha: true,
      uniforms: { uNow: { value: 0 }, uInk: { value: this._ink } } });
    const m = this.mesh = new T.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 30; m.name = 'vfx'; m.visible = false; m.userData.sjInk = true;
    this.group = new T.Group(); this.group.name = 'vfx_root'; this.group.add(m);
    this._texts = [];
    this._dirty0 = -1; this._dirty1 = -1; this.head = 0; this.time = 0; this._until = 0;
    this._upd = (dt, time) => this.update(dt);
    if (typeof GFX !== 'undefined') GFX.addUpdater(this._upd);
    return this.group;
  },
  clear(){ if (!this.mesh) return; this._buf.array.fill(0); this._buf.needsUpdate = true; this._until = 0; for (const t of this._texts) t.mesh.visible = false; },
  dispose(){
    if (!this.group) return;
    if (typeof GFX !== 'undefined') GFX.removeUpdater(this._upd);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    for (const t of this._texts) { t.tex.dispose(); t.mesh.material.dispose(); t.mesh.geometry.dispose(); }
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group = null; this.mesh = null; this._texts = [];
  },

  update(dt){
    if (!this.mesh) return;
    this.time += dt;
    const m = this.mesh; m.material.uniforms.uNow.value = this.time; m.visible = this.time < this._until;
    if (this._dirty0 >= 0) {
      const b = this._buf;
      if (b.clearUpdateRanges) { b.clearUpdateRanges(); b.addUpdateRange(this._dirty0 * this.STRIDE, (this._dirty1 - this._dirty0 + 1) * this.STRIDE); }
      b.needsUpdate = true; this._dirty0 = -1; this._dirty1 = -1;
    }
    // floating texts: pop in, rise, face the camera, pop out
    const cam = typeof GFX !== 'undefined' ? GFX.camera : null;
    for (let i = 0; i < this._texts.length; i++) { const t = this._texts[i]; if (!t.mesh.visible) continue;
      t.age += dt; const k = t.age / t.life;
      if (k >= 1) { t.mesh.visible = false; continue; }
      const pop = k < 0.12 ? 1.25 * Math.sin(k / 0.12 * Math.PI / 2) : k < 0.2 ? 1.25 - 0.25 * (k - 0.12) / 0.08 : k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1;
      t.mesh.position.set(t.x, t.y + t.rise * (1 - Math.pow(1 - k, 3)), t.z);
      t.mesh.scale.set(t.w * pop, t.h * pop, 1);
      if (cam) t.mesh.quaternion.copy(cam.quaternion); }
  },

  // ---- the primitive --------------------------------------------------------------------------------------------
  emit(p){
    if (!this.mesh) return;
    const a = this._buf.array, i = this.head, o = i * this.STRIDE; this.head = (i + 1) % this.n;
    if (this._dirty0 < 0) { this._dirty0 = this._dirty1 = i; } else { if (i < this._dirty0) this._dirty0 = i; if (i > this._dirty1) this._dirty1 = i; }
    const pos = p.pos, vel = p.vel, life = p.life || 0.5, t0 = this.time + (p.delay || 0);
    if (pos.isVector3) { a[o] = pos.x; a[o + 1] = pos.y; a[o + 2] = pos.z; } else { a[o] = pos[0]; a[o + 1] = pos[1]; a[o + 2] = pos[2]; }
    a[o + 3] = t0;
    a[o + 4] = vel ? vel[0] : 0; a[o + 5] = vel ? vel[1] : 0; a[o + 6] = vel ? vel[2] : 0; a[o + 7] = life;
    const c = p.color && p.color.isColor ? p.color : this._c.set(p.color || '#ffffff'), g = p.gain == null ? 1 : p.gain;
    a[o + 8] = c.r * g; a[o + 9] = c.g * g; a[o + 10] = c.b * g; a[o + 11] = p.shape || 0;
    a[o + 12] = p.size == null ? 0.1 : p.size; a[o + 13] = p.size1 == null ? 0 : p.size1; a[o + 14] = p.rot || 0; a[o + 15] = p.spin || 0;
    a[o + 16] = p.gravity || 0; a[o + 17] = p.drag || 0; a[o + 18] = p.ink ? 1 : 0; a[o + 19] = p.add ? 1 : 0;
    if (t0 + life > this._until) this._until = t0 + life;
  },

  // ---- effects (each reuses one scratch descriptor: no allocation) ------------------------------------------------
  _d: { pos: null, vel: [0, 0, 0], shape: 0, color: null, gain: 1, life: 0.5, size: 0.1, size1: 0, rot: 0, spin: 0, gravity: 0, drag: 0, ink: false, add: false, delay: 0 },
  _reset(pos){ const d = this._d; d.pos = pos; d.vel[0] = d.vel[1] = d.vel[2] = 0; d.shape = 0; d.color = '#ffffff'; d.gain = 1; d.life = 0.5; d.size = 0.1; d.size1 = 0; d.rot = 0; d.spin = 0; d.gravity = 0; d.drag = 0; d.ink = false; d.add = false; d.delay = 0; return d; },
  _dirv(d, speed, up){
    const r = this, z = r.rnd() * 2 - 1, a = r.rnd() * 6.2832, s = Math.sqrt(1 - z * z);
    d.vel[0] = Math.cos(a) * s * speed; d.vel[1] = (z * (1 - up) + up * Math.abs(z)) * speed; d.vel[2] = Math.sin(a) * s * speed;
  },
  // sparks: hot additive dots flying out, falling a little
  burst(pos, o){
    o = o || {}; const n = o.count || 16, sp = o.speed || 3.2, cs = o.colors;
    for (let i = 0; i < n; i++) { const d = this._reset(pos);
      this._dirv(d, sp * (0.45 + 0.75 * this.rnd()), o.up == null ? 0.5 : o.up);
      d.shape = this.DISC; d.add = true; d.color = cs ? cs[i % cs.length] : o.color || '#FFCE3A'; d.gain = o.gain || 2.2;
      d.life = (o.life || 0.5) * (0.6 + 0.6 * this.rnd()); d.size = (o.size || 0.055) * (0.6 + 0.8 * this.rnd()); d.size1 = 0;
      d.gravity = o.gravity == null ? 5 : o.gravity; d.drag = 2.4; this.emit(d); }
  },
  // impact stars: inked cartoon stars that pop out, spin and shrink
  stars(pos, o){
    o = o || {}; const n = o.count || 5, sp = o.speed || 2.6, cs = o.colors;
    for (let i = 0; i < n; i++) { const d = this._reset(pos), a = (i + this.rnd() * 0.6) / n * 6.2832;
      d.vel[0] = Math.cos(a) * sp; d.vel[1] = Math.sin(a) * sp * 0.8 + 0.8; d.vel[2] = (this.rnd() - 0.5) * 0.6;
      d.shape = this.STAR; d.ink = o.ink !== false; d.color = cs ? cs[i % cs.length] : o.color || '#FFCE3A'; d.gain = o.gain || 1;
      d.life = (o.life || 0.55) * (0.8 + 0.4 * this.rnd()); d.size = (o.size || 0.16) * (0.7 + 0.6 * this.rnd()); d.size1 = d.size * 0.15;
      d.rot = this.rnd() * 6.28; d.spin = (this.rnd() - 0.5) * 9; d.drag = 3.5; d.gravity = 2; this.emit(d); }
  },
  // shockwave ring facing the camera
  ring(pos, o){
    o = o || {}; const d = this._reset(pos);
    d.shape = this.RING; d.add = o.add !== false; d.color = o.color || '#ffffff'; d.gain = o.gain || 1.25; d.life = o.life || 0.38; d.size = (o.size || 1.1) * 0.25; d.size1 = o.size || 1.1; d.delay = o.delay || 0;
    this.emit(d);
  },
  // shockwave ring lying on the floor
  shock(pos, o){
    o = o || {}; const d = this._reset(pos);
    d.shape = this.SHOCK; d.add = o.add !== false; d.color = o.color || '#ffffff'; d.gain = o.gain || 1.4; d.life = o.life || 0.5; d.size = (o.size || 2.4) * 0.2; d.size1 = o.size || 2.4; d.delay = o.delay || 0;
    this.emit(d);
  },
  // paper confetti: opaque tumbling rectangles in the party palette, thrown up and drifting down
  confetti(pos, o){
    o = o || {}; const n = o.count || 60, cs = o.colors || this.PALETTE, sp = o.speed || 5, spread = o.spread == null ? 0.6 : o.spread;
    for (let i = 0; i < n; i++) { const d = this._reset(pos);
      const a = this.rnd() * 6.2832, r = this.rnd() * spread;
      d.vel[0] = Math.cos(a) * r * sp; d.vel[2] = Math.sin(a) * r * sp; d.vel[1] = sp * (0.55 + 0.6 * this.rnd());
      d.shape = this.RECT; d.color = cs[(this.rnd() * cs.length) | 0]; d.life = (o.life || 2.6) * (0.7 + 0.5 * this.rnd());
      d.size = (o.size || 0.06) * (0.7 + 0.7 * this.rnd()); d.size1 = d.size; d.rot = this.rnd() * 6.28; d.spin = (this.rnd() - 0.5) * 14;
      d.gravity = 3.2; d.drag = 1.6; d.delay = this.rnd() * (o.stagger || 0.15); this.emit(d); }
  },
  // speed lines: needles racing along a direction around a point (dashes, impacts, a solo)
  speedLines(pos, o){
    o = o || {}; const n = o.count || 14, dir = o.dir || [0, 1, 0], rad = o.radius || 0.9, sp = o.speed || 9, p = this._p;
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * 6.2832, r = rad * (0.45 + 0.55 * this.rnd());
      // any two axes perpendicular enough to dir
      const ux = Math.abs(dir[1]) > 0.9 ? 1 : 0, uy = Math.abs(dir[1]) > 0.9 ? 0 : 1;
      let bx = dir[1] * 0 - dir[2] * uy, by = dir[2] * ux - dir[0] * 0, bz = dir[0] * uy - dir[1] * ux; const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
      const cx = by * dir[2] - bz * dir[1], cy = bz * dir[0] - bx * dir[2], cz = bx * dir[1] - by * dir[0];
      const px = pos.isVector3 ? pos.x : pos[0], py = pos.isVector3 ? pos.y : pos[1], pz = pos.isVector3 ? pos.z : pos[2];
      p.set(px + (bx * Math.cos(a) + cx * Math.sin(a)) * r, py + (by * Math.cos(a) + cy * Math.sin(a)) * r, pz + (bz * Math.cos(a) + cz * Math.sin(a)) * r);
      const d = this._reset(p), s = sp * (0.7 + 0.6 * this.rnd());
      d.vel[0] = dir[0] * s; d.vel[1] = dir[1] * s; d.vel[2] = dir[2] * s;
      d.shape = this.STREAK; d.add = o.add !== false; d.color = o.color || '#ffffff'; d.gain = o.gain || 1.3; d.life = (o.life || 0.28) * (0.7 + 0.6 * this.rnd());
      d.size = (o.length || 0.5) * (0.6 + 0.8 * this.rnd()); d.size1 = d.size * 0.4; d.delay = this.rnd() * 0.12; this.emit(d); }
  },
  // ready-made judgement feedback
  hit(pos, grade){
    if (grade === 'perfect') { this.ring(pos, { color: '#FFF7E6', size: 0.6 }); this.ring(pos, { color: '#FFCE3A', size: 0.38, delay: 0.06 }); this.stars(pos, { count: 6 }); this.burst(pos, { count: 14, colors: ['#FFCE3A', '#FFF7E6', '#FF8FC7'] }); }
    else if (grade === 'good') { this.ring(pos, { color: '#2EC4B6', size: 0.75 }); this.stars(pos, { count: 3, color: '#2EC4B6', size: 0.12 }); this.burst(pos, { count: 8, color: '#2EC4B6' }); }
    else if (grade === 'ok') { this.ring(pos, { color: '#6CC8FF', size: 0.5 }); this.burst(pos, { count: 5, color: '#6CC8FF' }); }
    else this.burst(pos, { count: 6, color: '#8a84a8', gain: 0.8, speed: 1.6, gravity: 7 });
  },

  // ---- floating text ----------------------------------------------------------------------------------------------
  // Pooled billboards with their own small canvas: thick ink stroke + flat fill, in the game's title font.
  text(str, pos, o){
    if (!this.group) return -1;
    o = o || {}; const T = THREE; let t = null, oldest = null;
    for (const x of this._texts) { if (!x.mesh.visible) { t = x; break; } if (!oldest || x.age / x.life > oldest.age / oldest.life) oldest = x; }
    if (!t && this._texts.length < this.TEXTS) {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = T.LinearFilter;
      const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, premultipliedAlpha: false });
      const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), mat); mesh.renderOrder = 40; mesh.frustumCulled = false; mesh.userData.sjInk = true;
      t = { cv, cx: cv.getContext('2d'), tex, mesh, age: 0, life: 1, x: 0, y: 0, z: 0, w: 1, h: 0.25, rise: 0.4 };
      this._texts.push(t); this.group.add(mesh);
    }
    if (!t) t = oldest;
    const cx = t.cx, W = 512, H = 128;
    cx.clearRect(0, 0, W, H);
    let px = 84; cx.font = '400 ' + px + 'px ' + (o.font || "'Bagel Fat One', 'Baloo 2', Impact, sans-serif");
    const mw = cx.measureText(str).width; if (mw > W - 40) { px = Math.floor(px * (W - 40) / mw); cx.font = '400 ' + px + 'px ' + (o.font || "'Bagel Fat One', 'Baloo 2', Impact, sans-serif"); }
    cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
    cx.strokeStyle = o.ink || Toon.ink; cx.lineWidth = Math.max(8, px * 0.2); cx.strokeText(str, W / 2, H / 2 + 4);
    cx.fillStyle = o.color || '#FFCE3A'; cx.fillText(str, W / 2, H / 2 + 4);
    t.tex.needsUpdate = true;
    const size = o.size || 0.5;
    t.h = size; t.w = size * W / H; t.age = 0; t.life = o.life || 0.9; t.rise = o.rise == null ? 0.45 : o.rise;
    if (pos.isVector3) { t.x = pos.x; t.y = pos.y; t.z = pos.z; } else { t.x = pos[0]; t.y = pos[1]; t.z = pos[2]; }
    t.mesh.visible = true; t.mesh.position.set(t.x, t.y, t.z); t.mesh.scale.set(0.001, 0.001, 1);
    return this._texts.indexOf(t);
  },

  // ---- shaders ------------------------------------------------------------------------------------------------
  VERT: `
attribute vec4 aPos; attribute vec4 aVel; attribute vec4 aCol; attribute vec4 aPar; attribute vec4 aPhy;
uniform float uNow;
varying vec2 vUv; varying vec3 vCol; varying vec4 vK;
void main() {
	float age = uNow - aPos.w, life = aVel.w, k = age / max( life, 1e-4 );
	if ( age < 0.0 || k >= 1.0 || life <= 0.0 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); vUv = vec2( 0.0 ); vCol = vec3( 0.0 ); vK = vec4( 0.0 ); return; }
	float dr = aPhy.y;
	float ft = dr > 0.001 ? ( 1.0 - exp( - dr * age ) ) / dr : age;
	vec3 c = aPos.xyz + aVel.xyz * ft;
	c.y -= 0.5 * aPhy.x * age * age;
	float shape = aCol.a;
	float e = 1.0 - ( 1.0 - k ) * ( 1.0 - k );
	float size = mix( aPar.x, aPar.y, shape > 2.5 && shape < 3.5 || shape > 5.5 ? e : k * k );
	float rot = aPar.z + aPar.w * age;
	vec2 q = position.xy;
	vec4 mv;
	if ( shape > 5.5 ) {
		mv = viewMatrix * vec4( c + vec3( q.x, 0.0, q.y ) * size, 1.0 );
	} else if ( shape > 4.5 ) {
		mv = viewMatrix * vec4( c, 1.0 );
		vec3 vd = ( viewMatrix * vec4( aVel.xyz, 0.0 ) ).xyz;
		vec2 d = length( vd.xy ) > 1e-4 ? normalize( vd.xy ) : vec2( 0.0, 1.0 );
		mv.xy += d * q.x * size + vec2( - d.y, d.x ) * q.y * size * 0.07;
	} else {
		float cs = cos( rot ), sn = sin( rot );
		if ( shape > 3.5 ) q *= vec2( 1.0, 0.6 * cos( aPar.w * 0.7 * age + aPar.z * 3.0 ) );
		mv = viewMatrix * vec4( c, 1.0 );
		mv.xy += vec2( q.x * cs - q.y * sn, q.x * sn + q.y * cs ) * size;
	}
	vUv = position.xy; vCol = aCol.rgb; vK = vec4( shape, k, aPhy.z, aPhy.w );
	gl_Position = projectionMatrix * mv;
}`,
  FRAG: `
uniform vec3 uInk;
varying vec2 vUv; varying vec3 vCol; varying vec4 vK;
float sdStar5( vec2 p, float r, float rf ) {
	const vec2 k1 = vec2( 0.809016994375, -0.587785252292 );
	const vec2 k2 = vec2( -k1.x, k1.y );
	p.x = abs( p.x );
	p -= 2.0 * max( dot( k1, p ), 0.0 ) * k1;
	p -= 2.0 * max( dot( k2, p ), 0.0 ) * k2;
	p.x = abs( p.x );
	p.y -= r;
	vec2 ba = rf * vec2( -k1.y, k1.x ) - vec2( 0.0, 1.0 );
	float h = clamp( dot( p, ba ) / dot( ba, ba ), 0.0, r );
	return length( p - ba * h ) * sign( p.y * ba.x - p.x * ba.y );
}
void main() {
	float shape = vK.x, k = vK.y, r = length( vUv ), d;
	float fade = 1.0;
	if ( shape < 0.5 ) { float g = exp( - 5.0 * r * r ) - 0.0067; gl_FragColor = vec4( vCol * max( g, 0.0 ) * ( 1.0 - k * k ), 0.0 ); return; }
	else if ( shape < 1.5 ) d = r - 0.82;
	else if ( shape < 2.5 ) d = sdStar5( vUv, 0.86, 0.5 ) - 0.06;
	else if ( shape < 3.5 || shape > 5.5 ) { d = abs( r - 0.86 ) - mix( 0.1, 0.008, k ); fade = 1.0 - k * k; }
	else if ( shape < 4.5 ) d = max( abs( vUv.x ) - 0.9, abs( vUv.y ) - 0.9 );
	else { d = abs( vUv.y ) - 0.9 * ( 1.0 - abs( vUv.x ) ); fade = 1.0 - k * k; }
	float w = max( fwidth( d ), 1e-4 );
	float fill = 1.0 - smoothstep( - w, w, d );
	vec3 col = vCol;
	if ( vK.z > 0.5 ) col = mix( col, uInk, smoothstep( - 0.2 - w, - 0.2 + w, d ) );
	float a = fill * fade;
	gl_FragColor = vec4( col * a, a * ( 1.0 - vK.w ) );
}`
};
