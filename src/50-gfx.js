// ============================================================================================================
// GFX: the 3D renderer core (three.js r187, WebGL2). One renderer, one canvas, quality tiers, post-processing.
// ============================================================================================================
// The game owns the frame loop; GFX only draws when asked. Nothing here touches the old 2D code, and nothing
// runs at load time: without vendor/three.bundle.min.js (window.THREE) the page still works, GFX.init() returns null.
//
//   if (GFX.init(canvas, { tier: 'auto' })) {            // 'auto' | 'low' | 'medium' | 'high'
//     const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
//     GFX.setScene(scene, cam);                           // cam.aspect follows the canvas
//     StageKit.rig('club'); scene.add(StageKit.floor(), StageKit.backdrop());
//     await Assets.load(['hero']); scene.add(Assets.spawn('hero').root);
//     function frame(t){ GFX.render(dt); requestAnimationFrame(frame); }      // dt in seconds
//   }
//
// ---- frame --------------------------------------------------------------------------------------------------
//   updaters (StageKit, VFX, yours: GFX.addUpdater(fn(dt, time)))
//   -> shadow map of the key light (objects on layer GFX.CAST; medium / high)
//   -> floor mirror at half size (layer GFX.REFLECT; medium: fills only, high: fills + ink; needs StageKit.floor)
//   -> the scene into an HDR, multisampled target        (no tone mapping: flat colours stay exactly as authored)
//   -> bloom chain fed by values above 1 (sj_emit, hard speculars)     -> one final pass: bloom, grade, vignette, dither
//
// ---- API ----------------------------------------------------------------------------------------------------
//   GFX.init(canvas, { tier, auto, targetFps, alpha, preserve }) -> GFX | null   (null: no WebGL2 or no THREE)
//   GFX.setScene(scene, camera)        GFX.render(dt[, scene, camera])         GFX.resize([cssW, cssH])
//   GFX.setTier('low'|'medium'|'high') GFX.tierName  GFX.tier (the tier's numbers)  GFX.auto (degrade on bad frame times)
//   GFX.beat(amount = 1)               a light pulse: emissives, spots and cones jump and decay (call it on the beat)
//   GFX.grade = { saturation, contrast, gain }   GFX.bloom = { strength, threshold, knee }
//   GFX.vignette = { amount, inner, outer, color }   GFX.clearColor (hex)
//   GFX.shadow = { on, center: Vector3, radius, strength }      what the key light's shadow map covers
//   GFX.stats  { fps, ms, calls, tris, w, h, dpr, tier }        last frame; calls / tris include every pass
//   GFX.on('tier' | 'resize' | 'contextlost' | 'contextrestored', fn)     GFX.off(name, fn)
//   GFX.project(worldVec3, out) -> out {x, y, visible} in CSS pixels of the canvas (for DOM labels over 3D)
//   GFX.snapshot(scene, camera, w, h) -> a 2D canvas with that render (menu portraits, thumbnails)
//   GFX.setCast(object, on) / GFX.setReflect(object, on)        put a whole subtree on / off those layers
//   GFX.dispose()
//
// ---- budget (what a full stage may cost; see GFX.stats) ------------------------------------------------------
//   medium (recent phone, 60 fps): <= 130 draw calls, <= 450k triangles submitted over ALL passes, <= 2.2 MP,
//     MSAA 4x, 4 stage spots in the toon shader, 1-tap hard shadow map (1024), half-size floor mirror (fills only),
//     bloom from 1/4 of the pixels down. A character is drawn 4 times: fill, ink, shadow, mirror.
//   low (old phone, 30 fps): <= 70 draw calls, <= 250k triangles, <= 0.9 MP, MSAA 2x, 2 spots, blob shadows,
//     no mirror, no bloom, no float targets. A character is drawn twice: fill, ink.
//   high (desktop): 2048 shadow map with 4 taps, 6 spots, ink in the mirror, 5 bloom levels.
//   Measured on the demo stage (test/gfxdemo.js: 5 x 11.6k-triangle characters, venue, 2 amps, props, 140-bean
//   crowd, 6 spots + cones, VFX): see the numbers the test prints (GFX.stats).
//   How it holds: a character is 1 fill draw + 1 ink draw (+ face decal, + glass) because Assets merges its
//   material classes into one buffer; a crowd is 2 draws (Toon.instanced); light cones, flares + blob shadows
//   and all VFX are one instanced draw each; every opaque surface uses ONE shader program per tier (class is
//   per-vertex data), so there are no program switches; ink hulls share the skeleton (bones computed once per frame,
//   one bone texture upload); shaders have no dynamic branches beyond the spot loop and take no texture samples
//   except the shadow map (1 tap on medium) and the face decal.
//   Keep crowds, venues and VFX off the CAST / REFLECT layers unless they must be there.
// ============================================================================================================
const GFX = {
  CAST: 1, REFLECT: 2, REFLECT_INK: 3, // layers: shadow casters, things the floor mirror shows, ink hulls (mirrored on high only)
  TIERS: {
    //        dpr cap, pixel cap, MSAA, HDR target, bloom levels (0 off), bloom start divisor, shadow map size + taps, toon spots,
    //        floor mirror (0 off, 1 fills only, 2 fills + ink; half size), VFX pool
    low:    { dpr: 1.5, pixels: 0.9e6, msaa: 2, hdr: false, bloom: 0, bloomDiv: 2, shadow: 0,    taps: 0, spots: 2, mirror: 0,     vfx: 512,   fps: 30 },
    medium: { dpr: 2,   pixels: 2.2e6, msaa: 4, hdr: true,  bloom: 4, bloomDiv: 2, shadow: 1024, taps: 1, spots: 4, mirror: 1,     vfx: 1536, fps: 60 },
    high:   { dpr: 2,   pixels: 4.2e6, msaa: 4, hdr: true,  bloom: 5, bloomDiv: 2, shadow: 2048, taps: 4, spots: 6, mirror: 2,     vfx: 3072, fps: 60 }
  },
  r: null, canvas: null, scene: null, camera: null, caps: null,
  tierName: 'medium', tier: null, auto: true, lost: false, time: 0, w: 0, h: 0, dpr: 1, scale: 1,
  clearColor: '#17142a',
  grade: { saturation: 1.06, contrast: 1.03, gain: 1 },
  bloom: { strength: 0.9, threshold: 1.0, knee: 0.15, spread: 0.62 },
  vignette: { amount: 0.3, inner: 0.5, outer: 1.08, color: '#2a1f5c' },
  shadow: { on: true, center: null, radius: 7, strength: 1 },
  mirror: { on: false, y: 0 },
  stats: { fps: 0, ms: 0, calls: 0, tris: 0, w: 0, h: 0, dpr: 1, tier: '' },
  _ev: {}, _upd: [], _beat: 0, _perf: null,

  supported(){
    if (typeof THREE === 'undefined') return false;
    try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; }
  },

  init(canvas, o){
    o = o || {};
    if (typeof THREE === 'undefined') return null;
    if (this.r) this.dispose();
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: !!o.alpha, depth: false, stencil: false, premultipliedAlpha: true,
      preserveDrawingBuffer: !!o.preserve, powerPreference: 'high-performance' });
    if (!gl) return null;
    const T = THREE, r = new T.WebGLRenderer({ canvas, context: gl });
    r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.NoToneMapping; r.info.autoReset = false; r.setPixelRatio(1);
    this.r = r; this.canvas = canvas; this.lost = false; this.time = 0; this.scale = 1;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const ua = navigator.userAgent || '';
    this.caps = {
      hdr: !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')),
      maxSamples: gl.getParameter(gl.MAX_SAMPLES) || 0,
      gpu: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '',
      mobile: /Mobi|Android|iPhone|iPad|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ''))
    };
    Toon.init();
    this._buildPost();
    this._perf = { last: 0, n: 0, sum: 0, bad: 0, good: 0, warm: 90, fpsN: 0, fpsT: 0 };
    this._onLost = e => { e.preventDefault(); this.lost = true; this._emit('contextlost'); };
    this._onRestored = () => { this.lost = false; this._rt = null; this._alloc(); this._perf.warm = 90; this._emit('contextrestored'); };
    canvas.addEventListener('webglcontextlost', this._onLost, false);
    canvas.addEventListener('webglcontextrestored', this._onRestored, false);
    this.auto = o.auto != null ? !!o.auto : (!o.tier || o.tier === 'auto');
    this.targetFps = o.targetFps || 0;
    this.setTier(!o.tier || o.tier === 'auto' ? this.pickTier() : o.tier);
    return this;
  },
  // A first guess; the frame-time watchdog (GFX.auto) corrects it downwards.
  pickTier(){
    const c = this.caps;
    if (/swiftshader|llvmpipe|software|basic render/i.test(c.gpu)) return 'low';
    if (c.mobile) return (navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'medium';
    return 'high';
  },
  setTier(name){
    if (!this.TIERS[name]) name = 'medium';
    this.tierName = name; this.tier = this.TIERS[name]; this.scale = 1;
    const t = this.tier;
    Toon.setTier({ spots: t.spots, shadow: t.shadow && this.shadow.on ? t.taps : 0, mirror: !!(t.mirror && this.mirror.on) });
    this.w = 0; this.resize();
    if (this._perf) { this._perf.warm = 90; this._perf.bad = 0; this._perf.good = 0; }
    this._emit('tier', name);
    return this;
  },
  setScene(scene, camera){ this.scene = scene; this.camera = camera; if (camera && this.w) this._aspect(camera); return this; },
  on(n, f){ (this._ev[n] = this._ev[n] || []).push(f); return this; },
  off(n, f){ const a = this._ev[n]; if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } return this; },
  _emit(n, a){ const l = this._ev[n]; if (l) for (let i = 0; i < l.length; i++) l[i](a); },
  addUpdater(f){ if (this._upd.indexOf(f) < 0) this._upd.push(f); },
  removeUpdater(f){ const i = this._upd.indexOf(f); if (i >= 0) this._upd.splice(i, 1); },
  beat(a){ this._beat = Math.max(this._beat, a == null ? 1 : a); },
  setCast(o, on){ o.traverse(c => { if (c.isMesh && !c.userData.sjInk) { if (on === false) c.layers.disable(this.CAST); else c.layers.enable(this.CAST); } }); },
  setReflect(o, on){ o.traverse(c => { if (c.isMesh) { const l = c.userData.sjInk ? this.REFLECT_INK : this.REFLECT; if (on === false) c.layers.disable(l); else c.layers.enable(l); } }); },

  // ---- size ---------------------------------------------------------------------------------------------------
  // Call with nothing to follow the canvas's CSS box (render() does that every frame), or with a CSS size.
  resize(cw, ch){
    if (!this.r) return;
    const c = this.canvas;
    if (cw == null) { cw = c.clientWidth || c.width; ch = c.clientHeight || c.height; }
    if (cw < 1 || ch < 1) return;
    const t = this.tier;
    let dpr = Math.min(window.devicePixelRatio || 1, t.dpr, Math.sqrt(t.pixels / (cw * ch))) * this.scale;
    dpr = Math.max(0.5, dpr);
    const w = Math.max(2, Math.round(cw * dpr)), h = Math.max(2, Math.round(ch * dpr));
    if (w === this.w && h === this.h && this._rt) return;
    this.cw = cw; this.ch = ch; this.w = w; this.h = h; this.dpr = dpr;
    this.r.setSize(w, h, false);
    this._alloc();
    if (this.camera) this._aspect(this.camera);
    this._emit('resize', { w, h, dpr });
  },
  _aspect(cam){ if (cam.isPerspectiveCamera) { const a = this.w / this.h; if (Math.abs(cam.aspect - a) > 1e-4) { cam.aspect = a; cam.updateProjectionMatrix(); } } },

  _alloc(){
    const T = THREE, t = this.tier, w = this.w, h = this.h;
    this._free();
    const hdr = t.hdr && this.caps.hdr, R = this._rt = { bloom: [] };
    R.hdr = hdr;
    R.scene = new T.WebGLRenderTarget(w, h, { type: hdr ? T.HalfFloatType : T.UnsignedByteType, colorSpace: hdr ? T.NoColorSpace : T.SRGBColorSpace,
      samples: Math.min(t.msaa, this.caps.maxSamples), depthBuffer: true, stencilBuffer: false, resolveDepthBuffer: false,
      minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false });
    if (t.bloom && hdr) {
      let bw = Math.max(2, Math.round(w / t.bloomDiv)), bh = Math.max(2, Math.round(h / t.bloomDiv));
      for (let i = 0; i < t.bloom && bw >= 2 && bh >= 2; i++) {
        const mk = () => new T.WebGLRenderTarget(bw, bh, { type: T.HalfFloatType, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false });
        R.bloom.push({ down: mk(), up: i < t.bloom - 1 ? mk() : null, w: bw, h: bh });
        bw = Math.round(bw / 2); bh = Math.round(bh / 2);
      }
    }
    if (t.shadow && this.shadow.on) {
      R.shadow = new T.WebGLRenderTarget(t.shadow, t.shadow, { depthBuffer: true, stencilBuffer: false, generateMipmaps: false });
      const d = new T.DepthTexture(t.shadow, t.shadow); d.compareFunction = T.LessEqualCompare; d.minFilter = d.magFilter = T.LinearFilter;
      R.shadow.depthTexture = d;
      Toon.U.uShadowMap.value = d; Toon.U.uShadowP.value.x = 1 / t.shadow;
    }
    if (t.mirror && this.mirror.on) {
      R.mirror = new T.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), { colorSpace: T.SRGBColorSpace, depthBuffer: true, stencilBuffer: false, samples: Math.min(t.msaa, this.caps.maxSamples),
        minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter, generateMipmaps: true });
      Toon.U.uMirror.value = R.mirror.texture;
    }
    const f = this._final;
    f.defines = {}; if (R.bloom.length) f.defines.SJ_BLOOM = 1;
    f.needsUpdate = true;
  },
  _free(){
    const R = this._rt; if (!R) return;
    try {
      R.scene.dispose(); for (const b of R.bloom) { b.down.dispose(); if (b.up) b.up.dispose(); }
      if (R.shadow) { R.shadow.depthTexture.dispose(); R.shadow.dispose(); } if (R.mirror) R.mirror.dispose();
    } catch (e) {}
    this._rt = null;
  },

  // ---- frame --------------------------------------------------------------------------------------------------
  render(dt, scene, camera){
    const r = this.r; if (!r || this.lost) return;
    scene = scene || this.scene; camera = camera || this.camera; if (!scene || !camera) return;
    dt = dt > 0 ? Math.min(dt, 0.1) : 0;
    this._watch();
    this.resize();
    this.time += dt;
    const U = Toon.U;
    this._beat *= Math.exp(-dt * 7); if (this._beat < 0.001) this._beat = 0;
    U.uBeat.value = this._beat; U.uTime.value = this.time;
    for (let i = 0; i < this._upd.length; i++) this._upd[i](dt, this.time);
    r.info.reset();
    this._aspect(camera);
    const R = this._rt;
    if (R.shadow) this._shadowPass(scene);
    if (R.mirror) this._mirrorPass(scene, camera);
    this._scenePass(scene, camera, R.scene, this.w, this.h);
    this._post(R, null);
    const s = this.stats; s.calls = r.info.render.calls; s.tris = r.info.render.triangles; s.w = this.w; s.h = this.h; s.dpr = this.dpr; s.tier = this.tierName;
  },
  _scenePass(scene, camera, target, w, h){
    const r = this.r;
    Toon.U.uView.value.set(w, h, this.dpr * (w / this.w));
    r.setRenderTarget(target);
    r.setClearColor(this.clearColor, 1); r.clear(true, true, false);
    r.render(scene, camera);
  },
  _shadowPass(scene){
    const T = THREE, r = this.r, sh = this.shadow, U = Toon.U, R = this._rt;
    let cam = this._shCam;
    if (!cam) { cam = this._shCam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 100); cam.layers.set(this.CAST); this._shBias = new T.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1); this._shC = new T.Vector3(0, 1, 0); }
    const c = sh.center || this._shC, rad = sh.radius, k = U.uKeyDir.value;
    cam.position.copy(c).addScaledVector(k, rad * 2.5);
    cam.up.set(0, Math.abs(k.y) > 0.98 ? 0 : 1, Math.abs(k.y) > 0.98 ? 1 : 0);
    cam.lookAt(c);
    cam.left = -rad; cam.right = rad; cam.top = rad; cam.bottom = -rad; cam.near = 0.1; cam.far = rad * 5;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    U.uShadowMat.value.copy(this._shBias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    U.uShadowP.value.y = rad * 2 / this.tier.shadow * 1.6;          // normal offset: about a texel and a half
    U.uShadowP.value.w = sh.strength;
    const om = scene.overrideMaterial, bg = scene.background;
    scene.overrideMaterial = Toon.depthMaterial(); scene.background = null;
    r.setRenderTarget(R.shadow); r.setClearColor(0xffffff, 1); r.clear(true, true, false);
    r.render(scene, cam);
    scene.overrideMaterial = om; scene.background = bg;
  },
  // The floor mirror: the scene's REFLECT layer seen from the camera mirrored through y = mirror.y (half size).
  _mirrorPass(scene, camera){
    const T = THREE, r = this.r, R = this._rt, U = Toon.U, y0 = this.mirror.y;
    let vc = this._mirCam;
    if (!vc) { vc = this._mirCam = new T.PerspectiveCamera(); vc.matrixAutoUpdate = false; this._mv = [new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3()]; }
    vc.layers.set(this.REFLECT); if (this.tier.mirror > 1) vc.layers.enable(this.REFLECT_INK);
    const [p, f, u, tg] = this._mv, e = camera.matrixWorld.elements;
    p.setFromMatrixPosition(camera.matrixWorld); f.set(-e[8], -e[9], -e[10]); u.set(e[4], e[5], e[6]);
    p.y = 2 * y0 - p.y; f.y = -f.y; u.y = -u.y;
    tg.copy(p).add(f);
    vc.matrixWorld.lookAt(p, tg, u).setPosition(p);
    vc.matrixWorldInverse.copy(vc.matrixWorld).invert();
    vc.projectionMatrix.copy(camera.projectionMatrix); vc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    U.uMirrorMat.value.copy(this._shBias || (this._shBias = new T.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1))).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    const w = R.mirror.width, h = R.mirror.height, bg = scene.background;
    U.uView.value.set(w, h, this.dpr * (w / this.w));
    scene.background = null;
    r.setRenderTarget(R.mirror); r.setClearColor(0x000000, 0); r.clear(true, true, false);
    r.render(scene, vc);
    scene.background = bg;
  },

  // ---- post ---------------------------------------------------------------------------------------------------
  _buildPost(){
    const T = THREE;
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const V = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
    const mk = (frag, uniforms) => new T.ShaderMaterial({ vertexShader: V, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this._fsCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._fsMesh = new T.Mesh(g, null); this._fsMesh.frustumCulled = false;
    this._fsScene = new T.Scene(); this._fsScene.add(this._fsMesh);
    // bright pass: only what is above the threshold (HDR emissives, speculars), averaged from 4 taps
    this._pre = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform vec4 uThr; varying vec2 vUv;
void main(){ vec4 d = uTexel.xyxy * vec4( -1.0, -1.0, 1.0, 1.0 );
	vec3 c = ( texture2D( tSrc, vUv + d.xy ).rgb + texture2D( tSrc, vUv + d.zy ).rgb + texture2D( tSrc, vUv + d.xw ).rgb + texture2D( tSrc, vUv + d.zw ).rgb ) * 0.25;
	c = clamp( c, vec3( 0.0 ), vec3( 12.0 ) );
	float br = max( c.r, max( c.g, c.b ) );
	float s = clamp( br - uThr.x + uThr.y, 0.0, 2.0 * uThr.y ); s = s * s / ( 4.0 * uThr.y + 1e-4 );
	gl_FragColor = vec4( c * ( max( s, br - uThr.x ) / max( br, 1e-4 ) ), 1.0 ); }`, { tSrc: { value: null }, uTexel: { value: new T.Vector2() }, uThr: { value: new T.Vector4() } });
    this._down = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){ vec4 d = uTexel.xyxy * vec4( -1.0, -1.0, 1.0, 1.0 );
	vec3 c = texture2D( tSrc, vUv ).rgb * 4.0 + texture2D( tSrc, vUv + d.xy ).rgb + texture2D( tSrc, vUv + d.zy ).rgb + texture2D( tSrc, vUv + d.xw ).rgb + texture2D( tSrc, vUv + d.zw ).rgb;
	gl_FragColor = vec4( c * 0.125, 1.0 ); }`, { tSrc: { value: null }, uTexel: { value: new T.Vector2() } });
    this._up = mk(`uniform sampler2D tSrc; uniform sampler2D tHigh; uniform vec2 uTexel; uniform float uSpread; varying vec2 vUv;
void main(){ vec4 d = uTexel.xyxy * vec4( -1.0, -1.0, 1.0, 1.0 );
	vec3 c = ( texture2D( tSrc, vUv + d.xy ).rgb + texture2D( tSrc, vUv + d.zy ).rgb + texture2D( tSrc, vUv + d.xw ).rgb + texture2D( tSrc, vUv + d.zw ).rgb ) * 0.25;
	gl_FragColor = vec4( mix( texture2D( tHigh, vUv ).rgb, c, uSpread ), 1.0 ); }`, { tSrc: { value: null }, tHigh: { value: null }, uTexel: { value: new T.Vector2() }, uSpread: { value: 0.6 } });
    // the only full-resolution pass: bloom (screened in, so flat colours never clip), display encoding, grade, vignette, dither
    this._final = mk(`uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec4 uGrade; uniform vec4 uVig; uniform vec3 uVigCol; varying vec2 vUv;
void main(){
	vec3 c = clamp( texture2D( tScene, vUv ).rgb, 0.0, 1.0 );
	#ifdef SJ_BLOOM
		vec3 b = 1.0 - exp( - texture2D( tBloom, vUv ).rgb * uGrade.w );
		c += b * ( 1.0 - c );
	#endif
	c = sRGBTransferOETF( vec4( c * uGrade.z, 1.0 ) ).rgb;
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = mix( vec3( l ), c, uGrade.x );
	c = ( c - 0.5 ) * uGrade.y + 0.5;
	vec2 q = vUv - 0.5;
	float v = smoothstep( uVig.y, uVig.z, length( q ) * 1.41421 ) * uVig.x;
	c = mix( c, c * uVigCol, v );
	float n = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
	gl_FragColor = vec4( clamp( c, 0.0, 1.0 ) + ( n - 0.5 ) / 255.0, 1.0 ); }`,
      { tScene: { value: null }, tBloom: { value: null }, uGrade: { value: new T.Vector4() }, uVig: { value: new T.Vector4() }, uVigCol: { value: new T.Color() } });
  },
  _blit(mat, target){
    const r = this.r; this._fsMesh.material = mat; r.setRenderTarget(target); r.render(this._fsScene, this._fsCam);
  },
  _post(R, target){
    const B = R.bloom, n = B.length, bl = this.bloom;
    if (n) {
      let m = this._pre; m.uniforms.tSrc.value = R.scene.texture; m.uniforms.uTexel.value.set(1 / R.scene.width, 1 / R.scene.height); m.uniforms.uThr.value.set(bl.threshold, bl.knee, 0, 0);
      this._blit(m, B[0].down);
      m = this._down;
      for (let i = 1; i < n; i++) { m.uniforms.tSrc.value = B[i - 1].down.texture; m.uniforms.uTexel.value.set(1 / B[i - 1].w, 1 / B[i - 1].h); this._blit(m, B[i].down); }
      m = this._up; m.uniforms.uSpread.value = bl.spread;
      for (let i = n - 2; i >= 0; i--) {
        const src = i === n - 2 ? B[i + 1].down : B[i + 1].up;
        m.uniforms.tSrc.value = src.texture; m.uniforms.tHigh.value = B[i].down.texture; m.uniforms.uTexel.value.set(1 / B[i + 1].w, 1 / B[i + 1].h);
        this._blit(m, B[i].up);
      }
    }
    const f = this._final, u = f.uniforms, g = this.grade, v = this.vignette;
    u.tScene.value = R.scene.texture; u.tBloom.value = n ? (n > 1 ? B[0].up.texture : B[0].down.texture) : null;
    u.uGrade.value.set(g.saturation, g.contrast, g.gain, bl.strength);
    u.uVig.value.set(v.amount, v.inner, v.outer, 0); u.uVigCol.value.set(v.color);
    this._blit(f, target);
  },

  // ---- frame-time watchdog --------------------------------------------------------------------------------------
  // Measures the time between render() calls. Too slow for about a second: first render fewer pixels, then drop a
  // tier. Good for ten seconds at a reduced resolution: give the pixels back. Tiers never go up by themselves.
  _watch(){
    const p = this._perf, now = performance.now(), d = now - p.last; p.last = now;
    if (d <= 0 || d > 250) return;                                    // first frame, a hidden tab, a hitch
    p.fpsN++; p.fpsT += d;
    if (p.fpsT >= 500) { this.stats.fps = Math.round(1000 * p.fpsN / p.fpsT); this.stats.ms = +(p.fpsT / p.fpsN).toFixed(1); p.fpsN = 0; p.fpsT = 0; }
    if (!this.auto) return;
    if (p.warm > 0) { p.warm--; return; }                             // shaders compile in the first frames
    p.n++; p.sum += d;
    if (p.n < 30) return;
    const avg = p.sum / p.n, budget = 1000 / (this.targetFps || this.tier.fps); p.n = 0; p.sum = 0;
    if (avg > budget * 1.3) { p.good = 0; if (++p.bad >= 2) { p.bad = 0; this._degrade(); } }
    else { p.bad = 0; if (avg < budget * 1.12 && this.scale < 1 && ++p.good >= 20) { p.good = 0; this.scale = Math.min(1, this.scale + 0.15); this.w = 0; p.warm = 30; } }
  },
  _degrade(){
    if (this.scale > 0.8) { this.scale = 0.8; this.w = 0; this._perf.warm = 30; }
    else if (this.tierName === 'high') this.setTier('medium');
    else if (this.tierName === 'medium') this.setTier('low');
    else if (this.scale > 0.6) { this.scale = 0.6; this.w = 0; this._perf.warm = 30; }
  },

  // ---- helpers ------------------------------------------------------------------------------------------------
  project(v, out){
    out = out || {}; const cam = this.camera; if (!cam) return out;
    const p = (this._pv || (this._pv = new THREE.Vector3())).copy(v).project(cam);
    out.x = (p.x * 0.5 + 0.5) * this.cw; out.y = (0.5 - p.y * 0.5) * this.ch; out.visible = p.z > -1 && p.z < 1 && Math.abs(p.x) <= 1.05 && Math.abs(p.y) <= 1.05;
    return out;
  },
  // Renders a scene at any size through the whole pipeline into a 2D canvas (not for every frame: it reallocates).
  snapshot(scene, camera, w, h){
    const T = THREE, r = this.r; if (!r || this.lost) return null;
    const keep = { w: this.w, h: this.h, dpr: this.dpr, rt: this._rt, a: camera.aspect };
    this._rt = null; this.w = w; this.h = h; this._alloc();
    if (camera.isPerspectiveCamera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const out = new T.WebGLRenderTarget(w, h, { depthBuffer: false }), R = this._rt;
    if (R.shadow) this._shadowPass(scene);
    if (R.mirror) this._mirrorPass(scene, camera);
    this._scenePass(scene, camera, R.scene, w, h);
    this._post(R, out);
    const px = new Uint8Array(w * h * 4); r.readRenderTargetPixels(out, 0, 0, w, h, px);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'), im = cx.createImageData(w, h);
    for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    cx.putImageData(im, 0, 0);
    out.dispose(); this._free();
    this._rt = keep.rt; this.w = keep.w; this.h = keep.h; this.dpr = keep.dpr;
    if (!this._rt) this._alloc(); else { const f = this._final; f.defines = {}; if (this._rt.bloom.length) f.defines.SJ_BLOOM = 1; f.needsUpdate = true;
      if (this._rt.shadow) { Toon.U.uShadowMap.value = this._rt.shadow.depthTexture; Toon.U.uShadowP.value.x = 1 / this.tier.shadow; } if (this._rt.mirror) Toon.U.uMirror.value = this._rt.mirror.texture; }
    if (camera.isPerspectiveCamera) { camera.aspect = keep.a; camera.updateProjectionMatrix(); }
    r.setRenderTarget(null);
    return cv;
  },
  dispose(){
    const r = this.r; if (!r) return;
    this.canvas.removeEventListener('webglcontextlost', this._onLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this._onRestored, false);
    this._free();
    for (const m of [this._pre, this._down, this._up, this._final]) if (m) m.dispose();
    if (this._fsMesh) this._fsMesh.geometry.dispose();
    if (typeof VFX !== 'undefined' && VFX.dispose) VFX.dispose();
    if (typeof StageKit !== 'undefined' && StageKit.dispose) StageKit.dispose();
    Toon.dispose();
    r.dispose();
    this.r = null; this.canvas = null; this.scene = null; this.camera = null; this._upd.length = 0; this._shCam = null; this._mirCam = null;
  }
};
