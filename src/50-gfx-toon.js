// ============================================================================================================
// Toon: the cel-shading material system and the ink outlines (the look of the 3D game).
// ============================================================================================================
// One uber shader draws every opaque material class of ASSET SPEC v1. The class is DATA, not a shader variant:
// a per-vertex id (attribute _sjcls, written by Assets so a whole character is ONE draw call) or a per-material
// uniform. Per class the scene holds a small parameter row (shadow-tone multiplier, rim strength, hard specular
// blob / streak, sheen band, emission), so "how skin looks" is tuned in one place for the whole game.
//
//   lit tone    = albedo * key colour                         (albedo = flat vertex colour COLOR_0 * tint)
//   shadow tone = mix(albedo * shadeMul * class shade, shadeTint, shift)      <- ONE shadow tone, hue shifted
//   terminator  = hard step on N.L, anti-aliased with screen-space derivatives (never blurry, never jaggy)
//   + stage spots (hard cone, hard N.L, stay graphic)  + hard rim band  + hard specular blob / streak / sheen
//   + optional hard cast shadows (GFX's shadow map)    + distance fog   + emission (HDR, feeds bloom)
// Skinning, morph targets, instancing (InstancedMesh, instanceColor) and BatchedMesh all work (three's chunks).
//
// Ink outlines are an inverted hull: the same geometry drawn again, back faces only, pushed out along the
// smoothed outline normal (_sjout; computed here by welding positions when the asset has none), with a width
// that is constant in screen pixels between two world-space clamps and scaled per vertex by _sjoutw.
// The hull is a child mesh sharing the geometry AND the skeleton: bones are computed once per frame.
//
// ---- API -----------------------------------------------------------------------------------------------------
//   Toon.look({ key:{dir:[x,y,z]|{az,el}, color}, shade:{mul, tint, shift, threshold, soft}, amb,
//               rim:{dir, color, threshold, strength}, fog:{color, density, start, max}, spotWash })
//       the scene's lighting mood. Colours are sRGB hex strings. Missing keys keep their value.
//       (StageKit.rig('club') etc. are presets that call this.)
//   Toon.cls.skin.shade = '#ffd9cf'; Toon.applyClasses()      per-class tuning (see Toon.cls below)
//   Toon.material({ cls:'cloth', color:'#ff5e7e' })           a cel material for your own geometry
//       opts: cls ('toon','skin','hair','cloth','metal','gloss','emit','glass','face'), color (tint, default
//       white), vertexColors (default: false here; Assets turns it on), vcls (class per vertex), receive (cast
//       shadows land on it, default true), spots (stage spots light it, default true), side, map (face canvas),
//       opacity, unique (do not share the cached instance), floor:{gloss, grid, gridStrength, sky}
//   Toon.mesh(geometry, { cls, color, outline:true|{px, color}, cast:true })   mesh + outline in one call
//   Toon.addOutline(mesh, { px:3, color:'#1E1B2E', min:0.004, max:0.03, scale:1 })   -> the outline mesh
//   Toon.prepGeometry(geometry, { cls:'toon', noline:false })  adds _sjout / _sjoutw / _sjcls when missing
//   Toon.ink = '#1E1B2E'; Toon.linePx = 3.2                    defaults for new outlines
//
//   const m = Toon.mesh(new THREE.SphereGeometry(0.5, 32, 20), { cls: 'gloss', color: '#2EC4B6' });
//   scene.add(m);
// ============================================================================================================
const Toon = {
  CLS: { toon: 0, skin: 1, hair: 2, cloth: 3, metal: 4, gloss: 5, emit: 6, face: 7, glass: 5 },
  // Per-class look. shade: multiplies the scene's shadow tone (hue shift per class). rim: rim-band strength.
  // spec: hard highlight [radius 0..1, strength (HDR, >1 blooms), stretch (>1 vertical streak, <1 horizontal)].
  // sheen: a lighter tone band around the highlight direction [threshold N.H, amount]. term: terminator offset.
  // emit: unlit HDR intensity. beat: how much GFX.beat() pumps the emission.
  cls: {
    toon:  { shade: '#ffffff', rim: 1.0, spec: [0, 0, 1],       sheen: [1, 0],      term: 0,    emit: 0,   beat: 0 },
    skin:  { shade: '#ffd3c4', rim: 0.9, spec: [0, 0, 1],       sheen: [1, 0],      term: 0,    emit: 0,   beat: 0 },
    hair:  { shade: '#f0eaff', rim: 1.2, spec: [0, 0, 0.4],     sheen: [0.86, 0.3], term: 0,    emit: 0,   beat: 0 },
    cloth: { shade: '#ffffff', rim: 0.8, spec: [0, 0, 1],       sheen: [1, 0],      term: 0,    emit: 0,   beat: 0 },
    metal: { shade: '#b9b4d6', rim: 1.4, spec: [0.2, 1.5, 1],   sheen: [0.6, 0.55], term: 0.05, emit: 0,   beat: 0 },
    gloss: { shade: '#e6e0f5', rim: 1.2, spec: [0.2, 1.15, 2.6], sheen: [0.3, 0.1],  term: 0,    emit: 0,   beat: 0 },
    emit:  { shade: '#ffffff', rim: 0,   spec: [0, 0, 1],       sheen: [1, 0],      term: 0,    emit: 1.7, beat: 0.6 },
    face:  { shade: '#ffd3c4', rim: 0.6, spec: [0, 0, 1],       sheen: [1, 0],      term: 0,    emit: 0,   beat: 0 }
  },
  ink: '#1E1B2E', linePx: 3.2, lineMin: 0.0035, lineMax: 0.032,
  MAX_SPOTS: 8,
  U: null, _mats: [], _cache: {}, _tier: { spots: 4, shadow: 0, mirror: false },

  init(){
    if (this.U) return this;
    const T = THREE, v4 = n => Array.from({ length: n }, () => new T.Vector4());
    this.U = {
      uKeyDir: { value: new T.Vector3(-0.45, 0.75, 0.5).normalize() }, uKeyCol: { value: new T.Color(1, 1, 1) },
      uAmb: { value: new T.Color(1, 1, 1) }, uShadeMul: { value: new T.Color('#9a8fd8') }, uShadeTint: { value: new T.Color('#3b2f7a') },
      uShade: { value: new T.Vector4(0.06, 0.0, 0.08, 0) },
      uRimDir: { value: new T.Vector3(0.5, 0.4, -0.75).normalize() }, uRimCol: { value: new T.Color('#bfe9ff') }, uRim: { value: new T.Vector4(0.6, 0.55, 0, 0) },
      uSpotPos: { value: v4(this.MAX_SPOTS) }, uSpotDir: { value: v4(this.MAX_SPOTS) }, uSpotCol: { value: v4(this.MAX_SPOTS) },
      uSpotN: { value: 0 }, uSpotWash: { value: 0.35 },
      uFogCol: { value: new T.Color('#2a2350') }, uFogP: { value: new T.Vector4(0, 0, 0, 0.85) },
      uClsA: { value: v4(8) }, uClsB: { value: v4(8) }, uClsC: { value: v4(8) },
      uBeat: { value: 0 }, uTime: { value: 0 }, uView: { value: new T.Vector3(1280, 665, 1) },
      uShadowMap: { value: null }, uShadowMat: { value: new T.Matrix4() }, uShadowP: { value: new T.Vector4(1 / 1024, 0.02, 0.0015, 1) },
      uMirror: { value: null }, uMirrorMat: { value: new T.Matrix4() }
    };
    this.applyClasses();
    return this;
  },

  // ---- scene look -------------------------------------------------------------------------------------------
  _dir(d, out){
    if (Array.isArray(d)) out.set(d[0], d[1], d[2]);
    else if (d && d.isVector3) out.copy(d);
    else if (d) { const az = (d.az || 0) * Math.PI / 180, el = (d.el || 0) * Math.PI / 180; out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); }
    return out.normalize();
  },
  look(p){
    this.init(); const U = this.U; p = p || {};
    if (p.key) { if (p.key.dir) this._dir(p.key.dir, U.uKeyDir.value); if (p.key.color) U.uKeyCol.value.set(p.key.color); if (p.key.intensity != null) U.uKeyCol.value.multiplyScalar(p.key.intensity); }
    if (p.amb) U.uAmb.value.set(p.amb);
    if (p.shade) { const s = p.shade, v = U.uShade.value;
      if (s.mul) U.uShadeMul.value.set(s.mul); if (s.tint) U.uShadeTint.value.set(s.tint);
      if (s.threshold != null) v.x = s.threshold; if (s.soft != null) v.y = s.soft; if (s.shift != null) v.z = s.shift; }
    if (p.rim) { const r = p.rim, v = U.uRim.value;
      if (r.dir) this._dir(r.dir, U.uRimDir.value); if (r.color) U.uRimCol.value.set(r.color);
      if (r.threshold != null) v.x = r.threshold; if (r.strength != null) v.y = r.strength; }
    if (p.fog) { const f = p.fog, v = U.uFogP.value;
      if (f.color) U.uFogCol.value.set(f.color); if (f.density != null) v.x = f.density; if (f.start != null) v.y = f.start; if (f.max != null) v.w = f.max; }
    if (p.spotWash != null) U.uSpotWash.value = p.spotWash;
    return this;
  },
  applyClasses(){
    const U = this.U, c = new THREE.Color();
    for (const k in this.cls) { const i = this.CLS[k], d = this.cls[k];
      c.set(d.shade); U.uClsA.value[i].set(c.r, c.g, c.b, d.rim);
      U.uClsB.value[i].set(d.spec[0], d.spec[1], d.spec[2] || 1, d.emit);
      U.uClsC.value[i].set(d.sheen[0], d.sheen[1], d.term, d.beat); }
  },

  // ---- materials --------------------------------------------------------------------------------------------
  material(o){
    this.init(); o = o || {};
    const T = THREE, cls = o.cls || 'toon', glass = cls === 'glass', face = cls === 'face' || !!o.map, floor = o.floor || null;
    const key = o.unique || floor ? null : [cls, o.color || '', o.vertexColors ? 1 : 0, o.vcls ? 1 : 0, o.receive === false ? 0 : 1, o.spots === false ? 0 : 1, o.side || 0, o.opacity == null ? 1 : o.opacity, face && !o.map ? 'f' : ''].join('|');
    if (key && !o.map && this._cache[key]) return this._cache[key];
    const U = this.U, u = {};
    for (const k in U) u[k] = U[k];                                    // shared by reference: one update lights everything
    u.uTint = { value: new T.Color(o.color || '#ffffff') };
    u.uOpacity = { value: o.opacity == null ? (glass ? 0.42 : 1) : o.opacity };
    u.uCls = { value: this.CLS[cls] || 0 };
    u.uFaceMap = { value: o.map || this._blankFace() };
    u.uGlass = { value: new T.Vector2(0.38, 0.85) };
    if (floor) {
      u.uFloor = { value: new T.Vector4(floor.gloss == null ? 0.6 : floor.gloss, floor.grid || 0, floor.gridStrength == null ? 0.25 : floor.gridStrength, floor.mirror == null ? 0.5 : floor.mirror) };
      u.uFloorSky = { value: new T.Color(floor.sky || '#6b5bd6') };
    }
    const m = new T.ShaderMaterial({
      name: 'sj_' + cls, uniforms: u, vertexShader: this.VERT, fragmentShader: this.FRAG,
      vertexColors: !!o.vertexColors, side: o.side || (glass ? T.DoubleSide : T.FrontSide),
      transparent: glass || (o.opacity != null && o.opacity < 1), depthWrite: !glass
    });
    m.userData.sj = { cls, receive: o.receive !== false && !glass, spots: o.spots !== false, vcls: !!o.vcls, face, glass, floor: !!floor };
    this._defines(m); this._mats.push(m);
    if (key && !o.map) this._cache[key] = m;
    return m;
  },
  _defines(m){
    const s = m.userData.sj, t = this._tier, d = {};
    d.SJ_SPOTS = s.spots ? Math.min(t.spots, this.MAX_SPOTS) : 0;
    d.SJ_SHADOW = s.receive ? t.shadow : 0;
    if (s.vcls) d.SJ_VCLS = 1; if (s.face) d.SJ_FACE = 1; if (s.glass) d.SJ_GLASS = 1;
    if (s.floor) { d.SJ_FLOOR = 1; if (t.mirror) d.SJ_MIRROR = 1; }
    m.defines = d; m.needsUpdate = true;
  },
  // GFX calls this when the quality tier changes: { spots, shadow (0 off, 1 one tap, 4 four taps), mirror }
  setTier(t){ Object.assign(this._tier, t); for (const m of this._mats) if (m.userData.sj) this._defines(m); },
  _blankFace(){
    if (!this._blank) { this._blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); this._blank.needsUpdate = true; }
    return this._blank;
  },

  outlineMaterial(o){
    this.init(); o = o || {};
    const T = THREE, U = this.U;
    const m = new T.ShaderMaterial({
      name: 'sj_ink', vertexShader: this.OUT_VERT, fragmentShader: this.OUT_FRAG, side: T.BackSide,
      uniforms: { uView: U.uView, uFogCol: U.uFogCol, uFogP: U.uFogP,
        uInk: { value: new T.Color(o.color || this.ink) },
        uOut: { value: new T.Vector4(o.px == null ? this.linePx : o.px, o.min == null ? this.lineMin : o.min, o.max == null ? this.lineMax : o.max, o.scale == null ? 1 : o.scale) } }
    });
    this._mats.push(m);
    return m;
  },
  // The depth-only material GFX renders shadow casters with (three adds skinning / morphs / instancing per object).
  depthMaterial(){
    return this._depth || (this._depth = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  },

  // ---- geometry ---------------------------------------------------------------------------------------------
  // Makes sure a geometry has what the shaders read: normal, _sjout (smoothed outline normal), _sjoutw (line weight)
  // and _sjcls (material class per vertex, when asked). Safe to call twice.
  prepGeometry(g, o){
    o = o || {}; const T = THREE, A = g.attributes, n = A.position.count;
    if (!A.normal) g.computeVertexNormals();
    if (!A._sjout) g.setAttribute('_sjout', new T.BufferAttribute(this.smoothNormals(g), 3));
    else if (!g.userData.sjOutChecked) this._fixOutSpace(g);
    g.userData.sjOutChecked = true;
    if (!A._sjoutw) { const w = new Float32Array(n).fill(o.noline ? 0 : 1); g.setAttribute('_sjoutw', new T.BufferAttribute(w, 1)); }
    if (o.cls != null && !A._sjcls) { const c = new Uint8Array(n).fill(this.CLS[o.cls] || 0); g.setAttribute('_sjcls', new T.BufferAttribute(c, 1)); }
    return g;
  },
  // Smoothed normals: vertices at the same position (split by hard edges, UV seams, material borders) share the
  // average of their normals, so the inverted hull stays closed at hard edges.
  smoothNormals(g){
    const P = g.attributes.position, N = g.attributes.normal, n = P.count, out = new Float32Array(n * 3);
    const map = new Map(), id = new Int32Array(n), acc = []; const q = 1 / 2e-4;
    for (let i = 0; i < n; i++) {
      const k = Math.round(P.getX(i) * q) + '_' + Math.round(P.getY(i) * q) + '_' + Math.round(P.getZ(i) * q);
      let j = map.get(k); if (j === undefined) { j = acc.length / 3; map.set(k, j); acc.push(0, 0, 0); }
      id[i] = j; acc[j * 3] += N.getX(i); acc[j * 3 + 1] += N.getY(i); acc[j * 3 + 2] += N.getZ(i);
    }
    for (let i = 0; i < n; i++) {
      const j = id[i] * 3; let x = acc[j], y = acc[j + 1], z = acc[j + 2]; let l = Math.hypot(x, y, z);
      if (l < 1e-6) { x = N.getX(i); y = N.getY(i); z = N.getZ(i); l = Math.hypot(x, y, z) || 1; }
      out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
    }
    return out;
  },
  // Blender exports custom attributes raw (Z up). The spec stores _SJOUT in glTF space (Y up); if an asset slipped
  // through in Blender space (it then disagrees with NORMAL), convert it here: (x, y, z) -> (x, z, -y).
  _fixOutSpace(g){
    const O = g.attributes._sjout, N = g.attributes.normal; if (!N) return;
    let a = 0, b = 0; const n = O.count;
    for (let i = 0; i < n; i++) { const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i), x = O.getX(i), y = O.getY(i), z = O.getZ(i);
      a += x * nx + y * ny + z * nz; b += x * nx + z * ny - y * nz; }
    if (b > a + 0.15 * n) {
      for (let i = 0; i < n; i++) { const y = O.getY(i), z = O.getZ(i); O.setY(i, z); O.setZ(i, -y); }
      O.needsUpdate = true;
      if (!this._warnedSpace) { this._warnedSpace = true; console.warn('Toon: an asset stores _SJOUT in Blender space (Z up); converted. Export it as (x, z, -y).'); }
    }
  },

  // ---- outlines ---------------------------------------------------------------------------------------------
  // Adds the ink hull for a mesh as a child (shares geometry, skeleton and morph influences). Returns it.
  // geometry: optional other geometry for the hull (Assets passes a view of the merged buffers).
  addOutline(mesh, o, geometry){
    o = o || {}; const T = THREE, g = geometry || mesh.geometry;
    if (!geometry) this.prepGeometry(g);
    const mat = o.material || this.outlineMaterial(o);
    let ol;
    if (mesh.isSkinnedMesh) { ol = new T.SkinnedMesh(g, mat); ol.bind(mesh.skeleton, mesh.bindMatrix); ol.boundingSphere = mesh.boundingSphere; }
    else if (mesh.isInstancedMesh) { ol = new T.InstancedMesh(g, mat, mesh.count); ol.instanceMatrix = mesh.instanceMatrix; ol.count = mesh.count; ol.boundingSphere = mesh.boundingSphere; }
    else ol = new T.Mesh(g, mat);
    if (mesh.morphTargetInfluences) { ol.morphTargetInfluences = mesh.morphTargetInfluences; ol.morphTargetDictionary = mesh.morphTargetDictionary; }
    ol.name = (mesh.name || 'mesh') + '_ink'; ol.frustumCulled = mesh.frustumCulled; ol.userData.sjInk = true;
    ol.renderOrder = mesh.renderOrder + 0.5;                            // after the fill: most hull pixels fail the depth test early
    mesh.add(ol); mesh.userData.sjOutline = ol;
    return ol;
  },
  // Mesh + outline for hand-built geometry. opts: see Toon.material, plus outline (true | {px,color,min,max}) and cast.
  mesh(geometry, o){
    o = o || {};
    this.prepGeometry(geometry);
    const m = new THREE.Mesh(geometry, o.material || this.material(o));
    if (o.outline !== false && o.cls !== 'emit' && o.cls !== 'glass') this.addOutline(m, o.outline === true || o.outline == null ? {} : o.outline);
    if (o.cast !== false && typeof GFX !== 'undefined') m.layers.enable(GFX.CAST);
    if (typeof GFX !== 'undefined' && o.reflect !== false) { m.layers.enable(GFX.REFLECT); if (m.userData.sjOutline) m.userData.sjOutline.layers.enable(GFX.REFLECT); }
    return m;
  },
  dispose(){
    for (const m of this._mats) m.dispose();
    this._mats.length = 0; this._cache = {};
    if (this._blank) { this._blank.dispose(); this._blank = null; }
    if (this._depth) { this._depth.dispose(); this._depth = null; }
  },

  // ---- shaders ----------------------------------------------------------------------------------------------
  VERT: `
#include <common>
#include <batching_pars_vertex>
#include <color_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
uniform vec4 uFogP;
uniform float uCls;
#ifdef SJ_VCLS
attribute float _sjcls;
#endif
varying float vCls;
varying vec3 vWN;
varying vec3 vWP;
varying float vFog;
#ifdef SJ_FACE
varying vec2 vUv;
#endif
#if SJ_SHADOW > 0
uniform mat4 uShadowMat;
uniform vec4 uShadowP;
varying vec3 vSh;
#endif
#ifdef SJ_MIRROR
uniform mat4 uMirrorMat;
varying vec4 vMir;
#endif
void main() {
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	vWN = normalize( ( vec4( transformedNormal, 0.0 ) * viewMatrix ).xyz );
	vec4 wp = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		wp = batchingMatrix * wp;
	#endif
	#ifdef USE_INSTANCING
		wp = instanceMatrix * wp;
	#endif
	wp = modelMatrix * wp;
	vWP = wp.xyz;
	#ifdef SJ_VCLS
		vCls = _sjcls;
	#else
		vCls = uCls;
	#endif
	#ifdef SJ_FACE
		vUv = uv;
	#endif
	float fd = max( length( mvPosition.xyz ) - uFogP.y, 0.0 ) * uFogP.x;
	vFog = min( 1.0 - exp( - fd * fd ), uFogP.w );
	#if SJ_SHADOW > 0
		vSh = ( uShadowMat * vec4( wp.xyz + vWN * uShadowP.y, 1.0 ) ).xyz;
	#endif
	#ifdef SJ_MIRROR
		vMir = uMirrorMat * wp;
	#endif
}`,

  FRAG: `
#include <common>
#include <color_pars_fragment>
uniform vec3 uTint;
uniform float uOpacity;
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uAmb;
uniform vec3 uShadeMul;
uniform vec3 uShadeTint;
uniform vec4 uShade;
uniform vec3 uRimDir;
uniform vec3 uRimCol;
uniform vec4 uRim;
uniform vec4 uClsA[ 8 ];
uniform vec4 uClsB[ 8 ];
uniform vec4 uClsC[ 8 ];
uniform vec3 uFogCol;
uniform float uBeat;
uniform float uSpotWash;
varying float vCls;
varying vec3 vWN;
varying vec3 vWP;
varying float vFog;
#if SJ_SPOTS > 0
uniform vec4 uSpotPos[ SJ_SPOTS ];
uniform vec4 uSpotDir[ SJ_SPOTS ];
uniform vec4 uSpotCol[ SJ_SPOTS ];
uniform int uSpotN;
#endif
#ifdef SJ_FACE
uniform sampler2D uFaceMap;
varying vec2 vUv;
#endif
#ifdef SJ_GLASS
uniform vec2 uGlass;
#endif
#if SJ_SHADOW > 0
uniform highp sampler2DShadow uShadowMap;
uniform vec4 uShadowP;
varying vec3 vSh;
float sjShadow() {
	vec3 c = vSh;
	if ( c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 ) return 1.0;
	c.z -= uShadowP.z;
	#if SJ_SHADOW > 1
		float t = uShadowP.x * 0.75;
		float s = texture( uShadowMap, c + vec3( -t, -0.4 * t, 0.0 ) ) + texture( uShadowMap, c + vec3( 0.4 * t, -t, 0.0 ) )
			+ texture( uShadowMap, c + vec3( t, 0.4 * t, 0.0 ) ) + texture( uShadowMap, c + vec3( -0.4 * t, t, 0.0 ) );
		s *= 0.25;
	#else
		float s = texture( uShadowMap, c );
	#endif
	return mix( 1.0, smoothstep( 0.35, 0.65, s ), uShadowP.w );
}
#endif
#ifdef SJ_FLOOR
uniform vec4 uFloor;
uniform vec3 uFloorSky;
#ifdef SJ_MIRROR
uniform sampler2D uMirror;
varying vec4 vMir;
#endif
#endif
// a hard step with an edge exactly as soft as one pixel needs (plus an optional minimum band)
float sjStep( float e, float x, float soft ) {
	float w = clamp( fwidth( x ) * 0.8, soft, 0.25 );
	return smoothstep( e - w, e + w, x );
}
void main() {
	vec3 base = uTint;
	#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
		base *= vColor.rgb;
	#endif
	float alpha = uOpacity;
	#ifdef SJ_FACE
		vec4 fc = texture2D( uFaceMap, vUv );
		base = mix( base, fc.rgb, fc.a );
	#endif
	int ci = int( vCls + 0.5 );
	vec4 cA = uClsA[ ci ];
	vec4 cB = uClsB[ ci ];
	vec4 cC = uClsC[ ci ];
	vec3 N = normalize( vWN );
	#ifdef DOUBLE_SIDED
		N *= gl_FrontFacing ? 1.0 : - 1.0;
	#endif
	vec3 V = isOrthographic ? normalize( vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] ) ) : normalize( cameraPosition - vWP );

	// --- the two tones
	float ndl = dot( N, uKeyDir );
	float lit = sjStep( uShade.x + cC.z, ndl, uShade.y );
	#if SJ_SHADOW > 0
		lit *= sjShadow();
	#endif
	vec3 shadeCol = mix( base * uShadeMul * cA.rgb, uShadeTint, uShade.z );
	vec3 col = mix( shadeCol, base * uKeyCol, lit ) * uAmb;

	// --- stage spots: hard cone (two steps), hard N.L
	#if SJ_SPOTS > 0
		vec3 sp = vec3( 0.0 );
		#ifdef SJ_FLOOR
			vec3 Rf = reflect( - V, N );
			vec3 streak = vec3( 0.0 );
		#endif
		for ( int i = 0; i < SJ_SPOTS; i ++ ) {
			if ( i >= uSpotN ) break;
			vec3 Lv = uSpotPos[ i ].xyz - vWP;
			float d2 = dot( Lv, Lv );
			vec3 L = Lv * inversesqrt( d2 );
			float cone = dot( - L, uSpotDir[ i ].xyz );
			float cw = max( fwidth( cone ), 0.003 );
			float c = 0.5 * smoothstep( uSpotDir[ i ].w - cw, uSpotDir[ i ].w + cw, cone ) + 0.5 * smoothstep( uSpotCol[ i ].w - cw, uSpotCol[ i ].w + cw, cone );
			float att = clamp( 1.0 - d2 * uSpotPos[ i ].w, 0.0, 1.0 );
			sp += uSpotCol[ i ].rgb * ( c * att * sjStep( 0.08, dot( N, L ), 0.0 ) );
			#ifdef SJ_FLOOR
				vec3 dl = L - Rf;
				dl.y *= 0.3;
				float sd = length( dl );
				streak += uSpotCol[ i ].rgb * ( ( 1.0 - sjStep( 0.16, sd, 0.02 ) ) * 0.6 + ( 1.0 - sjStep( 0.07, sd, 0.01 ) ) * 0.6 );
			#endif
		}
		col += mix( base, vec3( 1.0 ), uSpotWash ) * sp;
	#endif
	col = min( col, vec3( 1.0 ) );

	// --- sheen band, hard specular blob / streak (key light only, on the lit side)
	vec3 H = normalize( uKeyDir + V );
	float sheen = sjStep( cC.x, dot( N, H ), 0.0 ) * cC.y * lit;
	col = mix( col, mix( col, vec3( 1.0 ), 0.55 ), sheen );
	vec3 dv = ( viewMatrix * vec4( N - H, 0.0 ) ).xyz;
	dv.y /= cB.z;
	float spec = ( 1.0 - sjStep( cB.x, length( dv ), 0.0 ) ) * cB.y * lit;
	col += vec3( spec );

	// --- rim band from the back light
	float fr = 1.0 - max( dot( N, V ), 0.0 );
	float rv = fr * clamp( dot( N, uRimDir ) * 1.6 + 0.35, 0.0, 1.0 );
	col += uRimCol * ( sjStep( uRim.x, rv, 0.0 ) * uRim.y * cA.a );

	#ifdef SJ_FLOOR
		float fres = pow( fr, 3.0 );
		col = mix( col, uFloorSky, fres * uFloor.x * 0.5 );
		#ifdef SJ_MIRROR
			vec4 mir = texture2DProj( uMirror, vMir );
			col = mix( col, mir.rgb, mir.a * uFloor.w * ( 0.45 + 0.55 * fres ) );
		#endif
		#if SJ_SPOTS > 0
			col += streak * uFloor.x * 0.35;
		#endif
		if ( uFloor.y > 0.0 ) {
			float gx = vWP.x / uFloor.y;
			float ln = 1.0 - min( abs( fract( gx - 0.5 ) - 0.5 ) / max( fwidth( gx ), 1e-5 ) * 0.7, 1.0 );
			col *= 1.0 - ln * uFloor.z;
		}
	#endif

	// --- emission (unlit, HDR: this is what blooms)
	col = mix( col, base * cB.w * ( 1.0 + uBeat * cC.w ), step( 0.001, cB.w ) );

	#ifdef SJ_GLASS
		float ge = sjStep( 0.55, fr, 0.0 );
		alpha = mix( uGlass.x, uGlass.y, ge ) * uOpacity / 0.42;
		alpha = clamp( alpha + spec, 0.0, 1.0 );
	#endif
	col = mix( col, uFogCol, vFog );
	gl_FragColor = vec4( col, alpha );
	#include <colorspace_fragment>
}`,

  OUT_VERT: `
#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
attribute vec3 _sjout;
attribute float _sjoutw;
uniform vec4 uOut;
uniform vec3 uView;
uniform vec4 uFogP;
varying float vFog;
void main() {
	#include <morphinstance_vertex>
	#include <batching_vertex>
	vec3 objectNormal = _sjout;
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	vec4 mvPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		mvPosition = batchingMatrix * mvPosition;
	#endif
	#ifdef USE_INSTANCING
		mvPosition = instanceMatrix * mvPosition;
	#endif
	mvPosition = modelViewMatrix * mvPosition;
	vec3 n = normalize( transformedNormal );
	// world units covered by one pixel at this depth, then: constant pixel width between two world-space clamps
	float wpp = ( isOrthographic ? 2.0 : - 2.0 * mvPosition.z ) / ( projectionMatrix[ 1 ][ 1 ] * uView.y );
	float w = clamp( uOut.x * uView.z * wpp, uOut.y, uOut.z ) * _sjoutw * uOut.w;
	mvPosition.xyz += n * w;
	gl_Position = projectionMatrix * mvPosition;
	float fd = max( length( mvPosition.xyz ) - uFogP.y, 0.0 ) * uFogP.x;
	vFog = min( 1.0 - exp( - fd * fd ), uFogP.w );
}`,

  OUT_FRAG: `
uniform vec3 uInk;
uniform vec3 uFogCol;
varying float vFog;
void main() {
	gl_FragColor = vec4( mix( uInk, uFogCol, vFog ), 1.0 );
	#include <colorspace_fragment>
}`
};
