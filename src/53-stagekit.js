// ============================================================================================================
// StageKit: lighting rigs, stage spots with visible light cones, the stage floor, the sky / backdrop, blob shadows.
// ============================================================================================================
// Everything a venue needs to be lit, at a fixed cost: all light cones are ONE instanced draw, all lamp flares and
// blob shadows are ONE instanced draw, the spots themselves cost nothing but a loop in the toon shader
// (GFX.tier.spots of them: 2 / 4 / 6; the brightest win).
//
//   StageKit.rig('club');                                     // key / fill(shadow tone) / rim / fog / grade preset
//   scene.add(StageKit.floor({ size: 30, color: '#3a2f6b', gloss: 0.7, planks: 0.5 }));
//   scene.add(StageKit.backdrop({ top: '#0d0a26', mid: '#3b1d7a', bottom: '#ff5e7e', glow: '#ffce3a' }));
//   scene.add(StageKit.group);                                // the cones + flares + blob shadows (add once)
//   const s = StageKit.spot({ pos: [-3, 6, 1], target: [0, 1, 0], color: '#ff5e7e', angle: 16, intensity: 1.2,
//                             beat: 0.6, sway: { x: 1.5, z: 0.4, speed: 0.7, phase: 0 } });
//   s.target.set(1, 1, 0); s.intensity = 2; s.color.set('#2ec4b6'); s.on = false;      // animate it freely
//   StageKit.blob(hero.root, 0.45);                           // a blob shadow that follows an object (shown only
//                                                             // on tiers without the shadow map)
//   GFX.beat(1);                                              // on the beat: spots with .beat, cones, emissives pump
//
// ---- API ----------------------------------------------------------------------------------------------------
//   StageKit.rig(name | params[, overrides]) -> params   presets: studio, club, street, arena, sunset (StageKit.RIGS).
//       params = Toon.look() keys + { clear, vignette:{...}, bloom:{...}, grade:{...} }
//   StageKit.spot(opts) -> spot    opts: pos, target, color, angle (half angle, degrees), inner (0..1 of angle: the
//       hot core), intensity, range (m), cone (true: visible beam; a number scales its brightness), flare (true),
//       beat (how much GFX.beat pumps it), sway {x, y, z, speed, phase}, light (true: lights toon surfaces)
//   StageKit.removeSpot(spot)      StageKit.clearSpots()
//   StageKit.floor(opts) -> Mesh   opts: size, color, gloss 0..1, planks (plank width in m, 0 = none),
//       plankStrength, mirror 0..1 (real reflection on the high tier), sky (the colour grazing angles pick up), y
//   StageKit.backdrop(opts) -> Mesh   a sky dome that follows the camera: top / mid / bottom colours, horizon
//       (-1..1, where mid sits), glow colour + glowDir [x,y,z] + glowSize, bands (0 smooth, n = stepped glow rings)
//   StageKit.blob(object3d | Vector3, radius[, opacity]) -> handle     StageKit.removeBlob(handle)
//   StageKit.group                 Object3D holding the instanced cones / flares / blobs
//   StageKit.clear()  remove spots + blobs          StageKit.dispose()
// ============================================================================================================
const StageKit = {
  MAX: 16, MAX_BLOBS: 48,
  RIGS: {
    // neutral daylight for looking at models: paper backdrop, soft violet shadow tone
    studio: { key: { dir: { az: -32, el: 42 }, color: '#ffffff' }, amb: '#ffffff', shade: { mul: '#a99ce6', tint: '#4a3f8f', shift: 0.06, threshold: 0.05, soft: 0 },
      rim: { dir: { az: 150, el: 25 }, color: '#ffffff', threshold: 0.62, strength: 0.35 }, fog: { color: '#efe6d6', density: 0, start: 0, max: 0 }, spotWash: 0.3,
      clear: '#efe6d6', vignette: { amount: 0.12, inner: 0.6, outer: 1.2, color: '#c9b8a0' }, bloom: { strength: 0.7, threshold: 1.0 }, grade: { saturation: 1.05, contrast: 1.02, gain: 1 } },
    // small dark room: warm key from the front left, deep indigo shadow tone, cyan back light, haze
    club: { key: { dir: { az: -28, el: 48 }, color: '#fff0dc' }, amb: '#ffffff', shade: { mul: '#8b7de0', tint: '#2b1f73', shift: 0.1, threshold: 0.05, soft: 0 },
      rim: { dir: { az: 155, el: 30 }, color: '#8fe9ff', threshold: 0.56, strength: 0.75 }, fog: { color: '#1c1446', density: 0.028, start: 7, max: 0.8 }, spotWash: 0.15,
      clear: '#120d2e', vignette: { amount: 0.42, inner: 0.45, outer: 1.05, color: '#1a1050' }, bloom: { strength: 0.95, threshold: 1.0 }, grade: { saturation: 1.1, contrast: 1.04, gain: 1 } },
    // outdoors by day: high sun, sky-blue shadow tone, no haze to speak of
    street: { key: { dir: { az: -40, el: 58 }, color: '#fff7e2' }, amb: '#ffffff', shade: { mul: '#93a6f2', tint: '#35508f', shift: 0.08, threshold: 0.02, soft: 0 },
      rim: { dir: { az: 140, el: 20 }, color: '#ffffff', threshold: 0.66, strength: 0.3 }, fog: { color: '#bfe6ff', density: 0.012, start: 14, max: 0.7 }, spotWash: 0.3,
      clear: '#8fd3ff', vignette: { amount: 0.16, inner: 0.6, outer: 1.2, color: '#3a5fb0' }, bloom: { strength: 0.6, threshold: 1.0 }, grade: { saturation: 1.08, contrast: 1.03, gain: 1 } },
    // big hall: cold key, near-black blue shadows, hot magenta back light, long haze
    arena: { key: { dir: { az: -20, el: 55 }, color: '#eef4ff' }, amb: '#ffffff', shade: { mul: '#5f6fd0', tint: '#141a5c', shift: 0.2, threshold: 0.08, soft: 0 },
      rim: { dir: { az: 165, el: 35 }, color: '#ff7fd0', threshold: 0.5, strength: 0.95 }, fog: { color: '#0e1140', density: 0.016, start: 10, max: 0.85 }, spotWash: 0.2,
      clear: '#080a24', vignette: { amount: 0.5, inner: 0.4, outer: 1.0, color: '#0a0c3a' }, bloom: { strength: 1.05, threshold: 1.0 }, grade: { saturation: 1.12, contrast: 1.05, gain: 1 } },
    // golden hour: low orange key, plum shadow tone
    sunset: { key: { dir: { az: -60, el: 22 }, color: '#ffe2b0' }, amb: '#ffffff', shade: { mul: '#a070c8', tint: '#5a2a78', shift: 0.12, threshold: 0.03, soft: 0 },
      rim: { dir: { az: 120, el: 18 }, color: '#ffd08a', threshold: 0.55, strength: 0.7 }, fog: { color: '#ff9e7a', density: 0.014, start: 10, max: 0.6 }, spotWash: 0.3,
      clear: '#ff9e7a', vignette: { amount: 0.25, inner: 0.5, outer: 1.1, color: '#6a2a70' }, bloom: { strength: 0.8, threshold: 1.0 }, grade: { saturation: 1.1, contrast: 1.03, gain: 1 } }
  },
  spots: [], blobs: [], group: null, current: null, coneGain: 1,
  _cones: null, _decals: null, _ord: [],

  rig(name, over){
    const base = typeof name === 'string' ? this.RIGS[name] || this.RIGS.studio : name || {};
    const p = Object.assign({}, base, over || {});
    Toon.look(p);
    if (typeof GFX !== 'undefined') {
      if (p.clear) GFX.clearColor = p.clear;
      if (p.vignette) Object.assign(GFX.vignette, p.vignette);
      if (p.bloom) Object.assign(GFX.bloom, p.bloom);
      if (p.grade) Object.assign(GFX.grade, p.grade);
    }
    this.current = typeof name === 'string' ? name : 'custom';
    return p;
  },

  // ---- spots --------------------------------------------------------------------------------------------------
  _init(){
    if (this.group) return;
    const T = THREE; Toon.init();
    this.group = new T.Group(); this.group.name = 'stagekit';
    // light cones: an open cone, apex at the origin, pointing down -Y, base radius 1, length 1 (scaled per instance)
    const cg = new T.CylinderGeometry(0.05, 1, 1, 40, 1, true); cg.translate(0, -0.5, 0);
    const cm = new T.ShaderMaterial({ name: 'sj_cone', vertexShader: this.CONE_VERT, fragmentShader: this.CONE_FRAG, side: T.DoubleSide, transparent: true,
      depthWrite: false, blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendEquation: T.AddEquation, uniforms: { uFogP: Toon.U.uFogP } });
    const c = this._cones = new T.InstancedMesh(cg, cm, this.MAX);
    c.instanceColor = new T.InstancedBufferAttribute(new Float32Array(this.MAX * 3), 3);
    c.count = 0; c.frustumCulled = false; c.renderOrder = 20; c.name = 'stagekit_cones'; c.userData.sjInk = true;
    if (typeof GFX !== 'undefined') c.layers.enable(GFX.REFLECT);            // beams show in the glossy floor
    // decals: lamp flares (additive billboards) and blob shadows (dark discs lying on the floor), premultiplied alpha
    const qg = new T.PlaneGeometry(2, 2);
    const n = this.MAX + this.MAX_BLOBS;
    qg.setAttribute('aDecal', new T.InstancedBufferAttribute(new Float32Array(n * 4), 4));       // kind (0 flare, 1 blob), strength, -, -
    const dm = new T.ShaderMaterial({ name: 'sj_decal', vertexShader: this.DECAL_VERT, fragmentShader: this.DECAL_FRAG, transparent: true, depthWrite: false,
      blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendEquation: T.AddEquation, premultipliedAlpha: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const d = this._decals = new T.InstancedMesh(qg, dm, n);
    d.instanceColor = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    d.count = 0; d.frustumCulled = false; d.renderOrder = 5; d.name = 'stagekit_decals'; d.userData.sjInk = true;
    this.group.add(d, c);
    this._m = new T.Matrix4(); this._q = new T.Quaternion(); this._v = new T.Vector3(); this._v2 = new T.Vector3(); this._s = new T.Vector3(); this._down = new T.Vector3(0, -1, 0);
    this._upd = (dt, time) => this.update(dt, time);
    if (typeof GFX !== 'undefined') GFX.addUpdater(this._upd);
  },
  spot(o){
    this._init(); o = o || {}; const T = THREE;
    const s = { pos: new T.Vector3(0, 5, 0), target: new T.Vector3(), color: new T.Color(o.color || '#ffffff'), angle: o.angle == null ? 16 : o.angle,
      inner: o.inner == null ? 0.6 : o.inner, intensity: o.intensity == null ? 1 : o.intensity, range: o.range || 16, cone: o.cone == null ? 1 : +o.cone,
      flare: o.flare !== false, beat: o.beat || 0, sway: o.sway || null, light: o.light !== false, on: true, _t: new T.Vector3(), _i: 0 };
    if (o.pos) s.pos.fromArray(o.pos); if (o.target) s.target.fromArray(o.target);
    if (this.spots.length >= this.MAX) { console.warn('StageKit: more than ' + this.MAX + ' spots'); return s; }
    this.spots.push(s); this._ord.push(s);
    return s;
  },
  removeSpot(s){ let i = this.spots.indexOf(s); if (i >= 0) this.spots.splice(i, 1); i = this._ord.indexOf(s); if (i >= 0) this._ord.splice(i, 1); },
  clearSpots(){ this.spots.length = 0; this._ord.length = 0; },
  blob(target, radius, opacity){
    this._init();
    const b = { target, radius: radius || 0.4, opacity: opacity == null ? 0.55 : opacity, y: 0.012, on: true };
    if (this.blobs.length < this.MAX_BLOBS) this.blobs.push(b);
    return b;
  },
  removeBlob(b){ const i = this.blobs.indexOf(b); if (i >= 0) this.blobs.splice(i, 1); },
  clear(){ this.clearSpots(); this.blobs.length = 0; },

  // Called by GFX every frame (no allocations): sways, beat pulse, toon spot uniforms, cone + decal instances.
  update(dt, time){
    const U = Toon.U, S = this.spots, O = this._ord, beat = typeof GFX !== 'undefined' ? GFX._beat : 0, tier = typeof GFX !== 'undefined' && GFX.tier ? GFX.tier : { spots: 4, shadow: 0 };
    const cones = this._cones, decals = this._decals, m = this._m, q = this._q, v = this._v, sc = this._s;
    let nc = 0, nd = 0; const dA = decals.geometry.attributes.aDecal;
    for (let i = 0; i < S.length; i++) {
      const s = S[i], w = s.sway; s._t.copy(s.target);
      if (w) { const a = time * (w.speed || 1) + (w.phase || 0); s._t.x += Math.sin(a) * (w.x || 0); s._t.z += Math.cos(a * 0.83) * (w.z || 0); s._t.y += Math.sin(a * 1.31) * (w.y || 0); }
      s._i = s.on ? s.intensity * (1 + s.beat * beat) : 0;
      if (s._i <= 0) continue;
      v.copy(s._t).sub(s.pos); const len = Math.min(v.length(), s.range); if (len < 1e-4) continue; v.normalize();
      if (s.cone > 0) {
        q.setFromUnitVectors(this._down, v);
        const L = len * 1.02, R = L * Math.tan(s.angle * Math.PI / 180);
        m.compose(s.pos, q, sc.set(R, L, R)); cones.setMatrixAt(nc, m);
        const g = s._i * s.cone * this.coneGain; cones.instanceColor.setXYZ(nc, s.color.r * g, s.color.g * g, s.color.b * g); nc++;
      }
      if (s.flare) {
        const r = 0.22 + 0.1 * Math.min(s._i, 2);
        m.makeScale(r, r, r).setPosition(s.pos); decals.setMatrixAt(nd, m);
        decals.instanceColor.setXYZ(nd, s.color.r, s.color.g, s.color.b); dA.setXYZW(nd, 0, Math.min(s._i, 2.5), 0, 0); nd++;
      }
    }
    // the spots that light surfaces: the brightest first (insertion sort on a persistent array)
    for (let i = 1; i < O.length; i++) { const x = O[i]; let j = i - 1; while (j >= 0 && O[j]._i * (O[j].light ? 1 : 0) < x._i * (x.light ? 1 : 0)) { O[j + 1] = O[j]; j--; } O[j + 1] = x; }
    let n = 0; const max = Math.min(tier.spots, Toon.MAX_SPOTS);
    for (let i = 0; i < O.length && n < max; i++) {
      const s = O[i]; if (s._i <= 0 || !s.light) continue;
      v.copy(s._t).sub(s.pos).normalize();
      const co = Math.cos(s.angle * Math.PI / 180), ci = Math.cos(s.angle * s.inner * Math.PI / 180);
      U.uSpotPos.value[n].set(s.pos.x, s.pos.y, s.pos.z, 1 / (s.range * s.range * 2.2));
      U.uSpotDir.value[n].set(v.x, v.y, v.z, co);
      U.uSpotCol.value[n].set(s.color.r * s._i, s.color.g * s._i, s.color.b * s._i, ci); n++;
    }
    U.uSpotN.value = n;
    // blob shadows only where there is no shadow map
    if (!(tier.shadow && typeof GFX !== 'undefined' && GFX.shadow.on)) {
      const B = this.blobs;
      for (let i = 0; i < B.length; i++) { const b = B[i]; if (!b.on) continue;
        const t = b.target; if (t.isObject3D) v.setFromMatrixPosition(t.matrixWorld); else v.copy(t);
        m.makeScale(b.radius, b.radius, b.radius).setPosition(v.x, b.y, v.z); decals.setMatrixAt(nd, m);
        decals.instanceColor.setXYZ(nd, 0.05, 0.03, 0.14); dA.setXYZW(nd, 1, b.opacity, 0, 0); nd++; }
    }
    cones.count = nc; cones.visible = nc > 0; decals.count = nd; decals.visible = nd > 0;
    if (nc) { cones.instanceMatrix.needsUpdate = true; cones.instanceColor.needsUpdate = true; }
    if (nd) { decals.instanceMatrix.needsUpdate = true; decals.instanceColor.needsUpdate = true; dA.needsUpdate = true; }
  },

  // ---- floor --------------------------------------------------------------------------------------------------
  // A glossy stage floor: cel-shaded, takes cast shadows and spot pools, picks up the sky at grazing angles, shows
  // stretched spot highlights, and (high tier) a real mirror of everything on the GFX.REFLECT layer.
  floor(o){
    o = o || {}; const T = THREE, size = o.size || 40;
    const g = o.round ? new T.CircleGeometry(size / 2, 64) : new T.PlaneGeometry(size, size);
    g.rotateX(-Math.PI / 2);
    if (o.mirror !== 0 && typeof GFX !== 'undefined' && !GFX.mirror.on) { GFX.mirror.on = true; GFX.mirror.y = o.y || 0; if (GFX.r) GFX.setTier(GFX.tierName); }
    const mat = Toon.material({ cls: 'toon', color: o.color || '#3a2f6b', unique: true,
      floor: { gloss: o.gloss == null ? 0.6 : o.gloss, grid: o.planks || 0, gridStrength: o.plankStrength == null ? 0.22 : o.plankStrength, mirror: o.mirror == null ? 0.45 : o.mirror, sky: o.sky || '#6b5bd6' } });
    const m = new T.Mesh(g, mat); m.name = 'stage_floor'; m.position.y = o.y || 0; m.userData.sjFloor = true;
    return m;
  },

  // ---- backdrop -----------------------------------------------------------------------------------------------
  backdrop(o){
    o = o || {}; const T = THREE;
    const u = { uTop: { value: new T.Color(o.top || '#0d0a26') }, uMid: { value: new T.Color(o.mid || '#3b1d7a') }, uBot: { value: new T.Color(o.bottom || '#ff5e7e') },
      uGlow: { value: new T.Color(o.glow || '#000000') }, uGlowDir: { value: new T.Vector3().fromArray(o.glowDir || [0, 0.1, -1]).normalize() },
      uP: { value: new T.Vector4(o.horizon == null ? 0.0 : o.horizon, o.glowSize == null ? 0.5 : o.glowSize, o.bands || 0, o.spread == null ? 0.6 : o.spread) } };
    const mat = new T.ShaderMaterial({ name: 'sj_sky', uniforms: u, side: T.BackSide, depthTest: false, depthWrite: false, vertexShader: this.SKY_VERT, fragmentShader: this.SKY_FRAG });
    const m = new T.Mesh(new T.SphereGeometry(1, 24, 12), mat);
    m.name = 'backdrop'; m.frustumCulled = false; m.renderOrder = -100; m.userData.sjInk = true;
    m.set = p => { if (p.top) u.uTop.value.set(p.top); if (p.mid) u.uMid.value.set(p.mid); if (p.bottom) u.uBot.value.set(p.bottom); if (p.glow) u.uGlow.value.set(p.glow); };
    return m;
  },

  dispose(){
    if (!this.group) return;
    if (typeof GFX !== 'undefined') GFX.removeUpdater(this._upd);
    for (const m of [this._cones, this._decals]) { m.geometry.dispose(); m.material.dispose(); }
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group = null; this._cones = null; this._decals = null; this.clear();
  },

  // ---- shaders ------------------------------------------------------------------------------------------------
  CONE_VERT: `
uniform vec4 uFogP;
varying vec3 vWP; varying vec3 vApex; varying vec3 vAxis; varying float vT; varying vec3 vCol; varying float vFog;
void main() {
	vec4 wp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
	vWP = wp.xyz;
	vApex = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
	vAxis = normalize( ( modelMatrix * instanceMatrix * vec4( 0.0, -1.0, 0.0, 0.0 ) ).xyz );
	vT = - position.y;
	#ifdef USE_INSTANCING_COLOR
		vCol = instanceColor;
	#else
		vCol = vec3( 1.0 );
	#endif
	vec4 mv = viewMatrix * wp;
	float fd = max( length( mv.xyz ) - uFogP.y, 0.0 ) * uFogP.x;
	vFog = min( 1.0 - exp( - fd * fd ), uFogP.w );
	gl_Position = projectionMatrix * mv;
}`,
  // soft edges: the beam fades where the view ray only grazes the cone (its silhouette), so no hard border;
  // brightness falls off along the beam; a little noise breaks up 8-bit banding.
  CONE_FRAG: `
varying vec3 vWP; varying vec3 vApex; varying vec3 vAxis; varying float vT; varying vec3 vCol; varying float vFog;
void main() {
	vec3 rel = vWP - vApex;
	vec3 rad = normalize( rel - vAxis * dot( rel, vAxis ) );
	vec3 V = normalize( cameraPosition - vWP );
	vec3 Vp = V - vAxis * dot( V, vAxis );
	float lv = length( Vp );
	float edge = lv > 1e-4 ? abs( dot( rad, Vp / lv ) ) : 1.0;
	edge = edge * edge * ( 3.0 - 2.0 * edge );
	float along = pow( 1.0 - vT, 1.6 ) * smoothstep( 0.0, 0.035, vT );
	float a = edge * along * 0.2 * ( 1.0 - vFog * 0.6 );
	float n = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
	gl_FragColor = vec4( vCol * a * ( 0.94 + 0.12 * n ), 0.0 );
}`,
  DECAL_VERT: `
attribute vec4 aDecal;
varying vec2 vUv; varying vec3 vCol; varying vec2 vK;
void main() {
	vUv = position.xy; vK = aDecal.xy;
	#ifdef USE_INSTANCING_COLOR
		vCol = instanceColor;
	#else
		vCol = vec3( 1.0 );
	#endif
	vec3 c = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
	float r = length( instanceMatrix[ 0 ].xyz );
	vec4 mv;
	if ( aDecal.x < 0.5 ) { mv = viewMatrix * vec4( c, 1.0 ); mv.xy += position.xy * r * 3.2; }
	else mv = viewMatrix * vec4( c + vec3( position.x, 0.0, position.y ) * r, 1.0 );
	gl_Position = projectionMatrix * mv;
}`,
  DECAL_FRAG: `
varying vec2 vUv; varying vec3 vCol; varying vec2 vK;
void main() {
	float r = length( vUv );
	if ( vK.x < 0.5 ) {
		// lamp flare: a hot core (HDR, blooms) and a soft halo, additive
		float core = 1.0 - smoothstep( 0.2, 0.26, r );
		float halo = pow( max( 1.0 - r, 0.0 ), 3.0 );
		gl_FragColor = vec4( vCol * ( core * 1.6 + halo * 0.5 ) * vK.y + vec3( core * 0.6 * vK.y ), 0.0 );
	} else {
		// blob shadow: a flat disc with a crisp, anti-aliased edge
		float w = max( fwidth( r ), 0.002 );
		float a = ( 1.0 - smoothstep( 0.92 - w, 0.92 + w, r ) ) * vK.y;
		gl_FragColor = vec4( vCol * a, a );
	}
}`,
  SKY_VERT: `
varying vec3 vDir;
void main() {
	vDir = position;
	vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
	gl_Position = p.xyww;
}`,
  SKY_FRAG: `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform vec3 uGlow; uniform vec3 uGlowDir; uniform vec4 uP;
varying vec3 vDir;
void main() {
	vec3 d = normalize( vDir );
	float h = d.y - uP.x;
	vec3 c = h > 0.0 ? mix( uMid, uTop, smoothstep( 0.0, uP.w, h ) ) : mix( uMid, uBot, smoothstep( 0.0, uP.w * 0.6, - h ) );
	float g = clamp( 1.0 - acos( clamp( dot( d, uGlowDir ), -1.0, 1.0 ) ) / ( uP.y * 3.14159 ), 0.0, 1.0 );
	if ( uP.z > 0.5 ) { float s = g * uP.z; float f = fract( s ); float w = max( fwidth( s ), 1e-4 ); g = ( floor( s ) + smoothstep( 1.0 - w, 1.0, f ) ) / uP.z; }
	else g = g * g * ( 3.0 - 2.0 * g );
	c = mix( c, uGlow, g * step( 0.001, dot( uGlow, vec3( 1.0 ) ) ) * 0.85 );
	float n = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
	gl_FragColor = vec4( c + ( n - 0.5 ) / 255.0, 1.0 );
}`
};
