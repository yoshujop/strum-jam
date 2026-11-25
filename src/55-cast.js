// ============================================================================================================
// Cast: the band members as DATA (art/ART_BIBLE.md) + a small helper that puts one on a stage.
// ============================================================================================================
// One entry per member: which model and instrument (vendor/models/*.glb), the face spec and named expressions for
// FaceDecal, the instrument hold (attach + IK), signature poses for Rig, the hair's hype meter, spring tuning.
// Everything is plain data in MODEL space (+X = the character's left, +Y up, +Z front), so it ports as it is.
// Nothing runs at load.
//
//   await Assets.load();
//   const riff = Cast.spawn('riff', { faceSize: 512 });      // -> actor; needs Assets, Rig, FaceDecal
//   scene.add(riff.root);  riff.lookAt(camera.position);
//   riff.pose('lean');                                        // a named pose of Cast.riff.poses (body + feet + guitar angle)
//   riff.pose('kickstand', { in: 0.08, over: 0.3 });          // key options as in Rig (beats)
//   riff.strum(1);  riff.strum(-1);                           // a down / up stroke: the hand snaps across the strings
//   riff.express('grin', { hold: 0.6 });                      // a named expression of Cast.riff.face.expressions
//   riff.hype(3);                                             // 0..4: the quiff grows a step per level
//   every frame: riff.update(beat, dt);                       // feet, guitar, rig, pupils, face (then GFX.render)
//
// actor = { def, inst, root, rig, face, guitar (instance | null), fret, strumIK, feet: { L, R }, pose(), strum(), express(),
//           hype(), lookAt(), update() }.   Cast.riff.poses.<name> = { body: a Rig pose for the 'body' mask, feet: { L, R:
//           { pos: [x, y, z] metres from the rest footprint, rot: [rx, ry, rz] } }, knees: { L, R: pole }, guitar: [x, y, z] metres the
//           instrument slides from its hold (model axes), neck: degrees
//           the guitar neck points above horizontal, arms: optional Rig pose for the arms (replaces the hold) }.
// ============================================================================================================
const Cast = (function(){
  const INK = '#1E1B2E';
  const riff = {
    name: 'Riff', role: 'guitar', model: 'riff', guitar: 'offcut', height: 1.88, colour: '#2EC4B6', shape: 'Z', movesOn: [0, 2],
    palette: { teal: '#2EC4B6', dark: '#3A3552', paper: '#FFF7E6', tangerine: '#FF8A1F', sun: '#FFCE3A', coral: '#FF5E7E', skin: '#E3A26B', hair: '#2B2740' },
    // ---- face: canvas units (256 = the face square, 0.249 m on his long head; origin between the eyes, +x = the viewer's right = his LEFT)
    face: {
      spec: {
        ink: INK, line: 5.2, scale: 1.2,
        // two D shapes, flat side up, outer corners down 6 degrees. His left (fretting side) eye is wide open and 10 % larger;
        // his right (strumming side) eye is two-thirds open under a double-weight lid. Teal iris ring, pick-shaped pupils.
        eyes: { shape: 'dee', x: 47, y: 4, w: 28, h: 38, tilt: -6, white: '#FFF7E6', iris: '#2EC4B6', pupil: 0.5, pupilShape: 'pick', shine: 'square',
          lid: 1, lidLine: 1.15, L: { scale: 1.1 }, R: { open: 0.66, lidLine: 2 } },
        brows: { style: 'slab', x: 47, y: -45, w: 29, thick: 13, color: INK, slit: 'R', R: { dy: 6, a: 10 } },   // the half-lid side sits lower and angled in: attitude, not sleep
        mouth: { y: 71, x: -4, w: 28, inner: '#5A0F1E', tongue: '#FF5E7E', teeth: 'top', teethColor: '#FFF1D0', hook: 1 },
        extras: [
          { type: 'dots', x: 54, y: 50, r: 3.6, pts: [[-9, 0], [9, 0], [0, 13]] },        // the D chord, under the wide eye
          { type: 'pick', color: '#FFFFFF', size: 9, rot: 142, dx: -5, dy: 1, line: 0.8 } ]   // chewed OUTSIDE the low corner of the smirk, point out
      },
      base: 'smirk',
      expressions: {
        smirk:    { mouth: { w: 0.92, c: 0.5, s: 0.95 }, browAs: 0.55, browY: 0.1 },
        locked:   { eoL: 0.66, eoR: 1, lx: 0.75, ly: 0.7, mouth: { w: 0.45, c: 0 }, browA: 9, browY: -0.35, pick: 0 },
        grin:     { eo: 0, ec: 1, mouth: { w: 1.22, o: 0.62, c: 1, s: 0.3, t: 1 }, browY: 0.7, pick: 0 },
        yell:     { eoL: 1.15, eoR: 1.75, pup: 0.7, mouth: { w: 1.4, o: 1.7, c: 0.2, t: 1, g: 0.75 }, browA: 20, browY: 0.15, browAs: 0, pick: 0 },
        rock:     { eoL: 0.58, eoR: 0.9, lx: 0, ly: 0.2, mouth: { w: 1.3, o: 0.95, c: 0.9, s: 0.55, t: 1 }, browA: 7, browY: -0.25, browAs: 0.5, pick: 0 },   // PERFECT: a lazy open grin under heavy lids
        flinch:   { glyph: 'squeeze', mouth: { w: 0.7, c: -0.2, wob: 1.4 }, jump: 7, browA: -14, browY: 0.6, pick: 0 },
        flat:     { glyph: 'flat', mouth: { w: 0.7, c: 0 }, browY: -0.5, mark: 'sweat', pick: 0 },
        mirror:   { eoL: 0.9, lx: -0.35, ly: 1, browAs: 1.3, mouth: { w: 0.2, o: 0.16, r: 1 }, pick: 0 },
        camera:   { eoL: 0, ec: 1, eoR: 1.5, lx: 0, ly: 0, mouth: { w: 1.05, c: 0.75, s: 0.9 }, browAs: -0.6, browY: 0.4 },
        awe:      { eoL: 1.15, eoR: 1.6, pup: 0.6, mouth: { w: 0.3, o: 0.42, r: 1 }, browY: 1.4, pick: 0 },
        sheepish: { eoR: 0, ec: 1, mouth: { w: 1.05, o: 0.42, c: 0.85, s: -0.5, t: 1 }, browA: -18, browY: 0.5, mark: 'sweat', pick: 0 }
      }
    },
    // ---- The Offcut, slung low: body centre at hip height, neck 27 degrees up, headstock at shoulder height
    hold: {
      bone: 'att_hip', pos: [-0.05, -0.14, 0.115], rot: [4, -9, 32],                  // degrees, XYZ; rot[2] = the neck angle
      fret:  { grip: 'grip_fret', tip: 'att_hand_L', pole: [0.55, -1, -0.25], rot: [-10, -100, 62], offset: [0, 0, 0] },
      strum: { grip: 'grip_strum', tip: 'att_hand_R', pole: [-1, -0.15, 0.6], rot: [20, 75, -30], back: 0.07, lift: 0.03, travel: 0.075, along: 0.0 },
      arms: { bones: { shoulder_L: [0, 0, 6], upperarm_L: [0, -28, -8], forearm_L: { bend: 78, twist: -50 }, upperarm_R: [0, 30, 22], forearm_R: { bend: 82, twist: 30 } },
        hands: { L: 'fret', R: 'pick' } }
    },
    // ---- signature poses (motion brief 3.2). Riff never stands up straight.
    poses: {
      rest: { body: {}, feet: { L: { pos: [0, 0, 0] }, R: { pos: [0, 0, 0] } }, neck: 32 },
      // the Lean: feet wide, knees a little in, weight on the back (strumming-side) foot, hips forward, torso back 12
      // degrees, head tilted 6 degrees toward the neck. Hair, guitar and legs make a Z.
      lean: { body: { move: { hips: [-0.105, -0.125, 0.125] }, bones: { hips: [-11, 9, 0], spine: [-9, 4, 4], chest: [-8, 3, 5], neck: [8, 0, -5], head: [20, -5, -11] } },
        feet: { L: { pos: [0.30, 0, 0.12], rot: [0, 26, 0] }, R: { pos: [-0.19, 0, -0.05], rot: [0, -18, 0] } },
        knees: { L: [-0.10, 0, 1], R: [0.10, 0, 1] }, neck: 32 },
      // the heel bounce on 1 and 3 (key it over 'lean' and back): the back knee drops, the chin tucks, the quiff lags
      lean_dip: { body: { move: { hips: [-0.125, -0.195, 0.125] }, bones: { hips: [-8, 9, 0], spine: [-6, 4, 4], chest: [-4, 3, 6], neck: [8, 0, -5], head: [22, -5, -11] }, squash: { head: 0.96 } },
        feet: { L: { pos: [0.30, 0, 0.12], rot: [0, 26, 0] }, R: { pos: [-0.19, 0, -0.05], rot: [0, -18, 0] } },
        knees: { L: [-0.10, 0, 1], R: [0.10, 0, 1] }, neck: 29 },
      // PERFECT, the Kickstand, staged in the screen plane: the whole body leans 35 degrees away from the neck, the kick
      // leg goes straight out to the neck side with the sole to the camera, the head tips back so the face is open, the
      // guitar slides to the strumming-side hip with the neck to the sky, outside the fretting-side ear
      kickstand: { body: { move: { hips: [-0.17, -0.07, 0] }, bones: { hips: [0, 0, 14], spine: [0, 0, 11], chest: [-2, 0, 10], neck: [-5, 0, -8], head: [-12, 0, -12] }, squash: { body: 1.04 } },
        feet: { L: { pos: [0.52, 0.47, 0.06], rot: [-75, 0, 72] }, R: { pos: [0.03, 0, 0], rot: [0, -12, 0] } },
        knees: { L: [0.2, 1, 0.4], R: [-0.5, 0, 1] }, neck: 47, guitar: [-0.07, -0.10, 0.03] }
    },
    strumRecoil: { down: { bones: { chest: [2, 2, 0], head: [3, 0, 0] } }, up: { bones: { chest: [-2, -2, 0], head: [-2, 0, 0] } } },
    // ---- the hair: a level meter. The quiff's upper half hangs from hype_1; it slides up step * level and the quiff grows.
    hype: { bones: ['hype_1'], step: 0.046, curl: 4, levels: 4 },   // curl: degrees the quiff rolls forward per level
    linePx: 4.6,                                                       // the hero's ink: 1.45 x the default hull
    springs: { quiff: { freq: 3.6, damp: 0.45, gravity: 0, limit: 7 }, earring: { freq: 3.2, damp: 0.25, gravity: 0.6, limit: 40 } }
  };

  const DEG = Math.PI / 180;
  function spawn(name, o){
    o = o || {}; const def = Cast[name]; if (!def || !def.model) throw new Error('Cast: no member "' + name + '"');
    const T = THREE, inst = Assets.spawn(def.model, { faceSize: o.faceSize || 512, linePx: o.linePx || def.linePx }), rig = Rig.create(inst), face = FaceDecal.create(inst, def.face.spec);
    const A = { def, inst, root: inst.root, rig, face, guitar: null, fret: null, strumIK: null, feet: {}, _feet: { L: [0, 0, 0, 0, 0, 0], R: [0, 0, 0, 0, 0, 0] }, _feetT: { L: [0, 0, 0, 0, 0, 0], R: [0, 0, 0, 0, 0, 0] },
      _neck: def.hold ? def.hold.rot[2] : 0, _neckT: def.hold ? def.hold.rot[2] : 0, _gp: [0, 0, 0], _gpT: [0, 0, 0], _strum: 0, _strumT: 0, _hype: 0, snap: 26 };
    face.set(def.face.expressions[def.face.base], { snap: true });
    for (const k in def.springs || {}) rig.spring(k, def.springs[k]);
    const body = rig.layer('body', { mask: 'body' }), arms = rig.layer('arms', { mask: 'arms' });
    rig.layer('recoil', { mask: 'chest,head', mode: 'add' });
    for (const s of ['L', 'R']) A.feet[s] = rig.plant('foot_' + s);
    if (def.hold && def.guitar && o.guitar !== false && Assets.has(def.guitar)) {
      const H = def.hold, g = A.guitar = Assets.spawn(def.guitar); g.root.rotation.set(H.rot[0] * DEG, H.rot[1] * DEG, H.rot[2] * DEG);
      const mount = new T.Group(); inst.attach(mount, H.bone, { pos: H.pos }); mount.add(g.root);          // the pose may slide the guitar on its mount
      arms.to(H.arms, { in: 0 });
      A.fret = rig.ik('arm_L', { target: g.root.getObjectByName(H.fret.grip), tip: H.fret.tip, pole: H.fret.pole, rot: H.fret.rot.slice(), offset: H.fret.offset });
      A.strumIK = rig.ik('arm_R', { target: g.root.getObjectByName(H.strum.grip), tip: H.strum.tip, pole: H.strum.pole, rot: H.strum.rot.slice() });
    } else arms.to('stand', { in: 0 });
    A.pose = (p, key) => { const P = typeof p === 'string' ? def.poses[p] : p; if (!P) throw new Error('Cast: ' + name + ' has no pose "' + p + '"');
      body.to(P.body || {}, Object.assign({ in: 0 }, key));
      for (const s of ['L', 'R']) { const f = P.feet && P.feet[s], t = A._feetT[s]; for (let i = 0; i < 3; i++) { t[i] = f && f.pos ? f.pos[i] : 0; t[3 + i] = f && f.rot ? f.rot[i] : 0; }
        const kn = P.knees && P.knees[s]; if (A.feet[s]) { A.feet[s].pole[0] = kn ? kn[0] : (s === 'L' ? 0.12 : -0.12); A.feet[s].pole[1] = kn ? kn[1] : 0; A.feet[s].pole[2] = kn ? kn[2] : 1; } }
      if (P.neck != null) A._neckT = P.neck; A._gpT = (P.guitar || [0, 0, 0]).slice();
      if (!key || !key.in) { for (const s of ['L', 'R']) A._feet[s] = A._feetT[s].slice(); A._neck = A._neckT; A._gp = A._gpT.slice(); }
      if (P.arms) arms.to(P.arms, Object.assign({ in: 0 }, key)); return A; };
    A.strum = (dir, key) => { A._strumT = dir; if (def.strumRecoil) rig.layerBy.recoil.to(dir > 0 ? def.strumRecoil.down : dir < 0 ? def.strumRecoil.up : {}, Object.assign({ in: 0.1, ease: 'hit', over: 0.4, settle: 0.3 }, key)); if (key && key.in === 0) A._strum = dir; return A; };
    A.express = (e, opt) => { const x = typeof e === 'string' ? def.face.expressions[e] || e : e; A._gaze = !!x && typeof x === 'object' && (x.lx != null || x.ly != null); if (A._gaze) face.lookSet = false; face.set(x, opt); return A; };
    A.hype = level => { const Hy = def.hype; if (!Hy) return A; A._hype = level; const mv = {};
      Hy.bones.forEach((b, i) => { const r = rig.idx[b] == null ? null : inst.rest[b], d = Hy.step * Math.max(0, level - i) / rig.size; if (!r) return;
        const up = new T.Vector3(0, 1, 0).applyQuaternion(r.mQuat); mv[b] = [up.x * d, up.y * d, up.z * d]; });
      const rot = {}; if (Hy.curl) rot[Hy.bones[0]] = [Hy.curl * level, 0, 0];
      rig.layer('hype', { mode: 'add' }).to({ move: mv, bones: rot }, { in: 0.12, ease: 'snap', over: 0.5, settle: 0.3 }); return A; };
    A.lookAt = (t, opt) => { rig.lookAt(t, opt); return A; };
    A.update = (beat, dt) => {
      const k = 1 - Math.exp(-A.snap * dt), H = def.hold;
      for (const s of ['L', 'R']) { const f = A._feet[s], t = A._feetT[s], ik = A.feet[s]; for (let i = 0; i < 6; i++) f[i] += (t[i] - f[i]) * k;
        if (ik) { ik.offset.set(f[0], f[1], f[2]); ik.rot[0] = f[3]; ik.rot[1] = f[4]; ik.rot[2] = f[5]; } }
      if (A.guitar) { A._neck += (A._neckT - A._neck) * k; A._strum += (A._strumT - A._strum) * (1 - Math.exp(-60 * dt)); A.guitar.root.rotation.z = A._neck * DEG; for (let i = 0; i < 3; i++) A._gp[i] += (A._gpT[i] - A._gp[i]) * k; A.guitar.root.position.set(A._gp[0], A._gp[1], A._gp[2]);
        const th = A._neck * DEG, sx = Math.sin(th), cx = Math.cos(th), d = H.strum.travel * A._strum - H.strum.back;
        const al = H.strum.along || 0; A.strumIK.offset.set(sx * d + cx * al, -cx * d + sx * al, H.strum.lift); }
      rig.update(beat, dt); if (!A._gaze) face.look(rig.look.eyeX, -rig.look.eyeY); face.update(dt);
    };
    A.pose(o.pose || 'rest');
    return A;
  }
  return { riff, spawn };
})();
