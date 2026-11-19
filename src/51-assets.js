// ============================================================================================================
// Assets: loads the game's 3D models (ASSET SPEC v1 .glb) and hands out ready-to-render instances.
// ============================================================================================================
// build.py embeds every vendor/models/<name>.glb as <script type="application/octet-stream" id="sj-model-<name>">
// (base64). Assets decodes and parses them (GLTFLoader), turns each into a TEMPLATE once, and spawn() clones it.
//
// What a template does to a model (so nobody downstream has to think about it):
//   * material NAMES pick the shading class (sj_toon, sj_skin, sj_hair, sj_cloth, sj_metal, sj_gloss, sj_emit,
//     sj_glass, sj_face); the glTF materials themselves are thrown away.
//   * all primitives of one mesh node are MERGED into one buffer with a per-vertex class id, so a character is
//     1 fill draw + 1 ink draw (+ 1 for the face decal, + 1 for glass) however many material classes it uses.
//   * ink outlines: an inverted hull per node using _SJOUT / _SJOUTW (computed when the asset has none);
//     meshes named *_noline, sj_emit and sj_glass get no line. The hull shares the node's skeleton.
//   * vertex colours (COLOR_0, linear) are the albedo; skin weights are normalised to 4 influences.
//
//   await Assets.load(['hero', 'guitar'], (done, total, name) => bar.style.width = 100 * done / total + '%');
//   const hero = Assets.spawn('hero');               // { root, bones, rest, meshes, outlines, face, ... }
//   scene.add(hero.root);
//   hero.bones.head.quaternion.multiply(q);          // drive bones yourself (see hero.rest for the rest pose)
//   hero.attach(Assets.spawn('guitar').root, 'att_hand_R', { pos: [0, 0, 0.05] });
//   hero.face.ctx.fillRect(100, 110, 20, 30); hero.face.update();     // draw the face (2D canvas, see below)
//
// ---- API ----------------------------------------------------------------------------------------------------
//   Assets.list() -> names embedded in the page          Assets.has(name)         Assets.info(name) -> stats + warnings
//   Assets.register(name, arrayBuffer)                   add a .glb at runtime (tests, downloads)
//   Assets.load(names?, onProgress?) -> Promise          parse + build templates (all embedded models when no names)
//   Assets.spawn(name, opts) -> instance                 opts: outline (true), ink ('#1E1B2E'), linePx, cast (true),
//                                                        reflect (true), receive (true: cast shadows land on it),
//                                                        spots (true), faceSize (256)
//   instance.root        Object3D to add to the scene (Y up, faces +Z, feet at the origin)
//   instance.bones       { name: THREE.Bone }            independent skeleton per instance
//   instance.rest        { name: { pos, quat, scale, mPos, mQuat } }   rest pose: local, and in MODEL space (mPos / mQuat).
//                        Bone rolls are not standardised: author poses as model-space deltas on top of mQuat.
//   instance.setBoneModelQuat(name, q)   set a bone's orientation given in model space (q = delta * rest.mQuat)
//   instance.resetPose()
//   instance.meshes / .outlines          the fill meshes and their ink hulls
//   instance.face        null | { canvas, ctx, texture, size, update() }   sj_face decal: the canvas centre is between
//                        the eyes, +x is the viewer's right, +y is down. Call update() after drawing.
//   instance.morph(name, value)          morph target by name on every mesh that has it
//   instance.setInk(color) / setLine({ px, min, max, scale }) / setOutline(on)
//   instance.attach(object3d, boneName, { pos, quat, scale })   parent under a bone, in MODEL-space axes at rest
//   instance.dispose()
// ============================================================================================================
const Assets = {
  _tpl: {}, _raw: {}, _loading: {},
  SIDE_BONES: ['shoulder', 'upperarm', 'forearm', 'hand', 'thumb1', 'thumb2', 'index1', 'index2', 'middle1', 'middle2', 'pinky1', 'pinky2', 'thigh', 'shin', 'foot', 'toe'],
  CORE_BONES: ['root', 'hips', 'spine', 'chest', 'neck', 'head'],

  list(){
    const out = Object.keys(this._raw);
    if (typeof document !== 'undefined') document.querySelectorAll('script[id^="sj-model-"]').forEach(e => { const n = e.id.slice(9); if (out.indexOf(n) < 0) out.push(n); });
    return out;
  },
  has(name){ return !!this._tpl[name]; },
  register(name, buffer){ this._raw[name] = buffer; delete this._tpl[name]; },
  _bytes(name){
    if (this._raw[name]) return this._raw[name];
    const el = typeof document !== 'undefined' && document.getElementById('sj-model-' + name);
    if (!el) return null;
    const bin = atob(el.textContent.trim()), n = bin.length, b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = bin.charCodeAt(i);
    return b.buffer;
  },
  load(names, onProgress){
    if (typeof names === 'function') { onProgress = names; names = null; }
    names = names || this.list();
    if (typeof names === 'string') names = [names];
    let done = 0; const total = names.length;
    const one = name => {
      if (this._tpl[name]) return Promise.resolve();
      if (this._loading[name]) return this._loading[name];
      return (this._loading[name] = new Promise((res, rej) => {
        setTimeout(() => {                                             // let the loading screen paint between models
          const buf = this._bytes(name);
          if (!buf) { delete this._loading[name]; return rej(new Error('Assets: no model "' + name + '"')); }
          new THREE.GLTFLoader().parse(buf, '', g => {
            try { this._tpl[name] = this._template(name, g); delete this._loading[name]; res(); } catch (e) { delete this._loading[name]; rej(e); }
          }, e => { delete this._loading[name]; rej(e instanceof Error ? e : new Error('Assets: ' + name + ': ' + (e && e.message || e))); });
        }, 0);
      }));
    };
    let p = Promise.resolve();
    names.forEach(n => { p = p.then(() => one(n)).then(() => { done++; if (onProgress) onProgress(done, total, n); }); });
    return p;
  },
  info(name){ const t = this._tpl[name]; return t ? t.info : null; },

  // ---- template -----------------------------------------------------------------------------------------------
  _cls(mat){
    const n = (mat && mat.name || '').toLowerCase().replace(/[._]\d+$/, ''), m = /^sj_([a-z]+)/.exec(n);
    return m && (m[1] in Toon.CLS) ? m[1] : null;
  },
  _template(name, gltf){
    const T = THREE, scene = gltf.scene, warn = [], t = { name, scene, lines: [], info: null, rest: {}, hasFace: false };
    scene.updateMatrixWorld(true);
    // group the primitives by node: a multi-primitive glTF mesh is a Group of meshes, a single one is the node itself
    const groups = new Map();
    scene.traverse(o => { if (!o.isMesh) return;
      const multi = o.parent && o.parent.isGroup && o.parent.children.every(c => c.isMesh) && o.parent !== scene;
      const key = multi ? o.parent : o;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o); });
    let tris = 0, verts = 0, draws = 0; const perCls = {}, morphs = {};
    groups.forEach((prims, node) => {
      const multi = node !== prims[0], nodeName = node.name || prims[0].name;
      const nolineNode = /_noline(_\d+)?$/i.test(nodeName);
      const parts = prims.map(m => {
        let cls = this._cls(m.material);
        if (!cls) { warn.push('material "' + (m.material && m.material.name) + '" on ' + nodeName + ' is not an sj_* class: drawn as sj_toon'); cls = 'toon'; }
        const noline = nolineNode || /_noline(_\d+)?$/i.test(m.name) || cls === 'emit' || cls === 'glass';
        const order = cls === 'glass' ? 3 : cls === 'face' ? 2 : noline ? 0 : 1;
        if (!m.geometry.attributes.color) warn.push(nodeName + ' (' + cls + ') has no COLOR_0: using the material colour');
        if (!m.geometry.attributes._sjout) warn.push(nodeName + ' (' + cls + ') has no _SJOUT: outline normals computed by welding');
        const c = m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
        perCls[cls] = (perCls[cls] || 0) + c / 3;
        return { mesh: m, cls, noline, order };
      }).sort((a, b) => a.order - b.order);
      const merged = this._merge(parts, warn, nodeName);
      const first = prims[0], skinned = !!first.isSkinnedMesh, holder = multi ? node : first.parent;
      const mk = (geo, mat, suffix, part) => {
        const m = skinned ? new T.SkinnedMesh(geo, mat) : new T.Mesh(geo, mat);
        m.name = nodeName + suffix; m.userData.sjPart = part;
        if (skinned) { m.bind(first.skeleton, first.bindMatrix); m.frustumCulled = false; }
        if (first.morphTargetDictionary && geo.morphAttributes.position) { m.updateMorphTargets(); m.morphTargetDictionary = Object.assign({}, first.morphTargetDictionary);
          if (first.morphTargetInfluences) m.morphTargetInfluences = first.morphTargetInfluences.slice(); Object.assign(morphs, first.morphTargetDictionary); }
        if (!multi) { m.position.copy(first.position); m.quaternion.copy(first.quaternion); m.scale.copy(first.scale); }
        return m;
      };
      const R = merged.ranges, made = [];
      if (R.fill.count) made.push(mk(this._view(merged.geo, R.fill), null, '', 'fill'));
      if (R.face.count) { made.push(mk(this._view(merged.geo, R.face), null, '_face', 'face')); t.hasFace = true; }
      if (R.glass.count) made.push(mk(this._view(merged.geo, R.glass), null, '_glass', 'glass'));
      if (R.line.count && made.length) { made[0].userData.sjLine = t.lines.length; t.lines.push(this._view(merged.geo, R.line)); draws++; }
      // swap the glTF meshes for ours (children of a single-primitive node move to the first new mesh)
      if (multi) { prims.forEach(p => node.remove(p)); made.forEach(m => node.add(m)); }
      else { const kids = first.children.slice(); holder.remove(first); made.forEach(m => holder.add(m)); kids.forEach(k => made[0].add(k)); }
      prims.forEach(p => { p.geometry.dispose(); const ms = Array.isArray(p.material) ? p.material : [p.material]; ms.forEach(x => x && x.dispose && x.dispose()); });
      tris += merged.tris; verts += merged.verts; draws += made.length;
    });
    // rest pose, local and in model space
    const names = [], bad = [];
    scene.traverse(o => { if (o.name && !/^[A-Za-z0-9_]+$/.test(o.name)) bad.push(o.name);
      if (!o.isBone) return;
      names.push(o.name);
      const mq = new T.Quaternion(), mp = new T.Vector3(), ms = new T.Vector3(); o.matrixWorld.decompose(mp, mq, ms);
      t.rest[o.name] = { pos: o.position.clone(), quat: o.quaternion.clone(), scale: o.scale.clone(), mPos: mp, mQuat: mq }; });
    if (bad.length) warn.push('names outside [A-Za-z0-9_]: ' + bad.slice(0, 6).join(', '));
    if (names.length) {
      const need = this.CORE_BONES.concat(...this.SIDE_BONES.map(b => [b + '_L', b + '_R'])), miss = need.filter(b => names.indexOf(b) < 0);
      if (miss.length) warn.push('SJ rig bones missing: ' + miss.join(', '));
    }
    const box = new T.Box3().setFromObject(scene);
    if (names.length && Math.abs(box.min.y) > 0.03) warn.push('feet are not on the ground: lowest point y = ' + box.min.y.toFixed(3));
    t.info = { name, tris: Math.round(tris), verts, draws, bones: names.length, classes: perCls, morphs: Object.keys(morphs), face: t.hasFace,
      size: [+(box.max.x - box.min.x).toFixed(3), +(box.max.y - box.min.y).toFixed(3), +(box.max.z - box.min.z).toFixed(3)], warnings: warn };
    return t;
  },

  // Concatenates the primitives of one node into one indexed buffer. Order: no-line opaque, outlined opaque, face, glass,
  // so fill / line / face / glass are each one contiguous index range of the same buffers (views share them).
  _merge(parts, warn, nodeName){
    const T = THREE, skinned = !!parts[0].mesh.isSkinnedMesh;
    let nv = 0, ni = 0;
    parts.forEach(p => { const g = p.mesh.geometry; Toon.prepGeometry(g); p.nv = g.attributes.position.count; p.ni = g.index ? g.index.count : p.nv; nv += p.nv; ni += p.ni; });
    const anyUv = parts.some(p => p.cls === 'face');
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), out = new Float32Array(nv * 3), col = new Uint16Array(nv * 3);
    const ow = new Uint8Array(nv), cls = new Uint8Array(nv), uv = anyUv ? new Float32Array(nv * 2) : null;
    const si = skinned ? new Uint16Array(nv * 4) : null, sw = skinned ? new Float32Array(nv * 4) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const nMorph = Math.max(...parts.map(p => (p.mesh.geometry.morphAttributes.position || []).length));
    const mp = [], mn = []; for (let k = 0; k < nMorph; k++) { mp.push(new Float32Array(nv * 3)); mn.push(new Float32Array(nv * 3)); }
    const ranges = { fill: { start: 0, count: 0 }, line: { start: 0, count: 0 }, face: { start: 0, count: 0 }, glass: { start: 0, count: 0 } };
    let v0 = 0, i0 = 0; const c = new T.Color();
    for (const p of parts) {
      const g = p.mesh.geometry, A = g.attributes, n = p.nv, id = Toon.CLS[p.cls];
      const mc = p.mesh.material && p.mesh.material.color ? p.mesh.material.color : c.set(1, 1, 1);
      for (let i = 0; i < n; i++) {
        const j = v0 + i;
        pos[j * 3] = A.position.getX(i); pos[j * 3 + 1] = A.position.getY(i); pos[j * 3 + 2] = A.position.getZ(i);
        nor[j * 3] = A.normal.getX(i); nor[j * 3 + 1] = A.normal.getY(i); nor[j * 3 + 2] = A.normal.getZ(i);
        out[j * 3] = A._sjout.getX(i); out[j * 3 + 1] = A._sjout.getY(i); out[j * 3 + 2] = A._sjout.getZ(i);
        const r = A.color ? A.color.getX(i) : mc.r, gg = A.color ? A.color.getY(i) : mc.g, b = A.color ? A.color.getZ(i) : mc.b;
        col[j * 3] = Math.round(Math.min(1, Math.max(0, r)) * 65535); col[j * 3 + 1] = Math.round(Math.min(1, Math.max(0, gg)) * 65535); col[j * 3 + 2] = Math.round(Math.min(1, Math.max(0, b)) * 65535);
        ow[j] = p.noline ? 0 : Math.round(Math.min(1, Math.max(0, A._sjoutw.getX(i))) * 255);
        cls[j] = id;
        if (uv && A.uv) { uv[j * 2] = A.uv.getX(i); uv[j * 2 + 1] = A.uv.getY(i); }
        if (skinned) {
          let a = A.skinWeight.getX(i), b2 = A.skinWeight.getY(i), c2 = A.skinWeight.getZ(i), d = A.skinWeight.getW(i), s = a + b2 + c2 + d;
          if (s < 1e-6) { a = 1; s = 1; }
          sw[j * 4] = a / s; sw[j * 4 + 1] = b2 / s; sw[j * 4 + 2] = c2 / s; sw[j * 4 + 3] = d / s;
          si[j * 4] = A.skinIndex.getX(i); si[j * 4 + 1] = A.skinIndex.getY(i); si[j * 4 + 2] = A.skinIndex.getZ(i); si[j * 4 + 3] = A.skinIndex.getW(i);
        }
      }
      const MP = g.morphAttributes.position || [], MN = g.morphAttributes.normal || [];
      if (nMorph && MP.length !== nMorph) warn.push(nodeName + ': primitives disagree on morph targets');
      for (let k = 0; k < MP.length && k < nMorph; k++) for (let i = 0; i < n; i++) { const j = (v0 + i) * 3;
        mp[k][j] = MP[k].getX(i); mp[k][j + 1] = MP[k].getY(i); mp[k][j + 2] = MP[k].getZ(i);
        if (MN[k]) { mn[k][j] = MN[k].getX(i); mn[k][j + 1] = MN[k].getY(i); mn[k][j + 2] = MN[k].getZ(i); } }
      if (g.index) for (let i = 0; i < p.ni; i++) idx[i0 + i] = g.index.getX(i) + v0; else for (let i = 0; i < p.ni; i++) idx[i0 + i] = v0 + i;
      const rg = p.order === 3 ? ranges.glass : p.order === 2 ? ranges.face : ranges.fill;
      if (!rg.count) rg.start = i0; rg.count += p.ni;
      if (p.order === 1 || p.order === 2) { if (!ranges.line.count) ranges.line.start = i0; ranges.line.count += p.ni; }
      v0 += n; i0 += p.ni;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3, true)); geo.setAttribute('_sjout', new T.BufferAttribute(out, 3));
    geo.setAttribute('_sjoutw', new T.BufferAttribute(ow, 1, true)); geo.setAttribute('_sjcls', new T.BufferAttribute(cls, 1));
    if (uv) geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    if (skinned) { geo.setAttribute('skinIndex', new T.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new T.BufferAttribute(sw, 4)); }
    if (nMorph) { geo.morphAttributes.position = mp.map(a => new T.BufferAttribute(a, 3)); geo.morphAttributes.normal = mn.map(a => new T.BufferAttribute(a, 3)); geo.morphTargetsRelative = parts[0].mesh.geometry.morphTargetsRelative; }
    geo.setIndex(new T.BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    return { geo, ranges, tris: ni / 3, verts: nv };
  },
  // A geometry that draws one index range of another's buffers (no copies: the attributes are shared objects).
  _view(base, range){
    const g = new THREE.BufferGeometry();
    for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
    g.setIndex(base.index);
    for (const k in base.morphAttributes) g.morphAttributes[k] = base.morphAttributes[k];
    g.morphTargetsRelative = base.morphTargetsRelative;
    g.boundingSphere = base.boundingSphere; g.boundingBox = base.boundingBox;
    g.setDrawRange(range.start, range.count);
    g.userData.sjOutChecked = true;
    return g;
  },

  // ---- instances ----------------------------------------------------------------------------------------------
  spawn(name, o){
    const t = this._tpl[name]; if (!t) throw new Error('Assets: "' + name + '" is not loaded (await Assets.load first)');
    o = o || {}; const T = THREE, root = T.SkeletonUtils.clone(t.scene); root.name = name;
    const inst = { name, root, bones: {}, rest: t.rest, meshes: [], outlines: [], face: null, _ink: null, _mats: [] };
    // one skeleton per source skeleton (the clone gives every skinned mesh its own)
    const src = [], dst = [], shared = new Map();
    t.scene.traverse(n => { if (n.isSkinnedMesh) src.push(n); });
    root.traverse(n => { if (n.isSkinnedMesh) dst.push(n); if (n.isBone) inst.bones[n.name] = n; });
    dst.forEach((m, i) => { const k = src[i].skeleton; if (shared.has(k)) { m.skeleton.dispose(); m.bind(shared.get(k), m.bindMatrix); } else shared.set(k, m.skeleton); });
    inst.skeleton = dst.length ? dst[0].skeleton : null;
    if (t.hasFace) {
      const size = o.faceSize || 256, cv = document.createElement('canvas'); cv.width = cv.height = size;
      const tex = new T.CanvasTexture(cv); tex.flipY = false; tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
      inst.face = { canvas: cv, ctx: cv.getContext('2d'), texture: tex, size, update(){ tex.needsUpdate = true; } };
    }
    const opt = { vcls: true, vertexColors: true, receive: o.receive !== false, spots: o.spots !== false };
    const list = []; root.traverse(n => { if (n.isMesh) list.push(n); });
    for (const m of list) {
      const part = m.userData.sjPart; if (!part) continue;
      if (part === 'face') { m.material = Toon.material(Object.assign({ cls: 'face', map: inst.face.texture, unique: true }, opt)); inst._mats.push(m.material); }
      else if (part === 'glass') { m.material = Toon.material(Object.assign({ cls: 'glass' }, opt)); m.renderOrder = 10; }
      else m.material = Toon.material(opt);
      inst.meshes.push(m);
      if (o.cast !== false && part !== 'glass') m.layers.enable(GFX.CAST);
      if (o.reflect !== false) m.layers.enable(GFX.REFLECT);
      if (m.userData.sjLine != null && o.outline !== false) {
        if (!inst._ink) { inst._ink = Toon.outlineMaterial({ color: o.ink, px: o.linePx }); inst._mats.push(inst._ink); }
        const ol = Toon.addOutline(m, { material: inst._ink }, t.lines[m.userData.sjLine]);
        if (o.reflect !== false) ol.layers.enable(GFX.REFLECT);
        inst.outlines.push(ol);
      }
    }
    const q = new T.Quaternion(), q2 = new T.Quaternion();
    inst.setBoneModelQuat = (bn, mq) => { const b = inst.bones[bn]; if (!b) return;
      if (b.parent && b.parent !== root) { b.parent.getWorldQuaternion(q); root.getWorldQuaternion(q2); q.premultiply(q2.invert()); b.quaternion.copy(q.invert()).multiply(mq); }
      else b.quaternion.copy(mq); };
    inst.resetPose = () => { for (const bn in inst.bones) { const r = t.rest[bn], b = inst.bones[bn]; if (r) { b.position.copy(r.pos); b.quaternion.copy(r.quat); b.scale.copy(r.scale); } } };
    inst.morph = (mn, v) => { for (const m of inst.meshes) { const d = m.morphTargetDictionary; if (d && mn in d) m.morphTargetInfluences[d[mn]] = v; }
      for (const ol of inst.outlines) { const d = ol.morphTargetDictionary; if (d && mn in d && ol.morphTargetInfluences !== ol.parent.morphTargetInfluences) ol.morphTargetInfluences[d[mn]] = v; } };
    inst.setInk = c => { if (inst._ink) inst._ink.uniforms.uInk.value.set(c); };
    inst.setLine = l => { if (!inst._ink) return; const u = inst._ink.uniforms.uOut.value; if (typeof l === 'number') u.x = l; else { if (l.px != null) u.x = l.px; if (l.min != null) u.y = l.min; if (l.max != null) u.z = l.max; if (l.scale != null) u.w = l.scale; } };
    inst.setOutline = on => { for (const ol of inst.outlines) ol.visible = !!on; };
    inst.attach = (obj, bn, a) => { const b = inst.bones[bn]; if (!b) throw new Error('Assets: ' + name + ' has no bone "' + bn + '"');
      a = a || {}; const h = new T.Group(); h.name = 'att_' + bn;
      h.quaternion.copy(t.rest[bn].mQuat).invert();                    // the holder's axes = model axes while the bone is at rest
      if (a.pos) obj.position.fromArray(a.pos); if (a.quat) obj.quaternion.copy(a.quat); if (a.scale != null) obj.scale.setScalar(a.scale);
      h.add(obj); b.add(h); return h; };
    inst.dispose = () => { if (root.parent) root.parent.remove(root); shared.forEach(s => s.dispose());
      inst._mats.forEach(m => { const i = Toon._mats.indexOf(m); if (i >= 0) Toon._mats.splice(i, 1); m.dispose(); });
      if (inst.face) inst.face.texture.dispose(); };
    return inst;
  },
  dispose(name){
    const names = name ? [name] : Object.keys(this._tpl);
    for (const n of names) { const t = this._tpl[n]; if (!t) continue;
      t.scene.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); t.lines.forEach(g => g.dispose()); delete this._tpl[n]; }
  }
};
