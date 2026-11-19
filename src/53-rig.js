// ============================================================================================================
// Rig: runtime character animation for SJ-rig characters (ASSET SPEC v1). Pose-to-pose on a MUSIC CLOCK.
// ============================================================================================================
// Nothing is baked: every frame the rig mixes plain-data poses on layers, solves IK, look-at, springs,
// squash & stretch and smears, and writes the bones. Time is in BEATS so a strike lands exactly on its beat.
//
//   const hero = Assets.spawn('mannequin'), rig = Rig.create(hero);
//   rig.layer('body', { mask: 'body' }).loop([                      // lower body + trunk groove, every beat
//     { at: 0,   pose: 'bob_down', in: 0.16, ease: 'hit',  over: 0.25, settle: 0.3, follow: 0.03 },
//     { at: 0.5, pose: 'bob_up',   in: 0.30, ease: 'snap' } ], 1);
//   rig.layer('arms', { mask: 'arms' }).to('guitar_hold', { in: 0 });
//   rig.plant('foot_L'); rig.plant('foot_R');                       // feet stay put while the hips move
//   const fret = rig.ik('arm_L', { target: guitar.root.getObjectByName('grip_fret'), tip: 'att_hand_L', pole: [0.3, -1, -0.5] });
//   rig.lookAt(camera.position);
//   function frame(dt){ beat += dt * bpm / 60; rig.update(beat, dt); GFX.render(dt); }
//   onBeat: rig.bounce(-0.07); rig.kick(1.2);                       // body squash + spring impulse
//
// ---- conventions (engine-agnostic: the same data drives an iOS / Roblox port) --------------------------------
//   MODEL SPACE: +X = the character's left, +Y up, +Z front, metres. A bone's pose is a rotation DELTA given in
//   model axes, about the bone's rest head, and parents carry children (so "bend the left elbow" is the same
//   numbers whatever the bone rolls are, and whatever the shoulder is doing). World = G(parent) * delta * rest.
//
//   POSE (plain data; Rig.POSES holds the named library, Rig.definePose(name, data) adds to it):
//     { use: 'other' | ['a', 'b'],              start from other poses
//       bones: { hips: [rx, ry, rz],            degrees, R = Rx * Ry * Rz (three.js Euler 'XYZ') in model axes
//                upperarm: [0, 0, -30],         a name without _L/_R = both sides, the right one mirrored
//                forearm_L: { bend: 80, twist: 20, r: [rx, ry, rz] },   bend: about the joint's hinge (elbows and
//                                               fingers fold to the front / palm, knees to the back); twist: about
//                                               the bone's own length; r: Euler on top. q = r * bend * twist
//                head: [x, y, z, w] },          or a quaternion
//       move:  { hips: [0, -0.05, 0] },         offsets in metres for a 1.8 m character (scaled to the rig)
//       hands: 'fist' | { L: 'fret', R: 'pick' } | { L: { index: [1, 1], thumb: [0.5, 0.4], spread: 6 } },
//       squash: { body: 0.92, head: 1.08 } }    stretch along Y, volume preserving (1 = none)
//   HANDS (Rig.HANDS): open, relax, fist, pick, fret, stick, mic, point, rock.  Per finger [curl1, curl2] with
//     1 = fully curled; thumb = [oppose, curl]; spread in degrees.
//   KEY (how a layer gets to a pose):  { pose, in: beats the move takes (it ENDS on the beat), ease, antic, over,
//       settle, follow, delay: { bone | group: beats }, tag }
//     ease: 'snap' (shoots out, cushions in: the default) | 'hit' (accelerates into contact) | 'smooth' |
//           'linear' | 'step' (holds, then pops on the beat)
//     antic: 0..1 pulls back first, away from the pose (wind-up)       over: 0..1 overshoots; the extreme lands ON the
//     beat and settles over `settle` beats (rebound)                   follow: beats of delay per joint down the
//     chain from the layer's root-most bone (follow-through / drag)    tag: passed to rig.onKey when the key lands
//
// ---- API ----------------------------------------------------------------------------------------------------
//   Rig.create(instance, { size }) -> rig                 instance from Assets.spawn (needs .bones, .rest, .root)
//   rig.layer(name, { mask, mode: 'over' | 'add', weight }) -> layer     layers mix in creation order. mask: a group
//       ('all','body','lower','upper','torso','spine','head','arms','arm_L','arm_R','legs','leg_L','leg_R','hands',
//       'hand_L','hand_R'), bone names, a comma list, an array or { name: weight }. No mask = the bones its poses name.
//   layer.to(pose, key)            one move; key.beat = when it lands (default: now + key.in). Late calls are squeezed.
//   layer.loop(keys, lengthBeats, startBeat = 0)   keys: [{ at: beat in the loop, pose, ...key }]; lands every cycle
//   layer.at(beat, pose, key)      schedule ahead (look-ahead: the move starts at beat - in)
//   layer.stop()  layer.weight  layer.mode
//   rig.ik(chain, { target, tip, pole, rot, weight, offset }) -> ik      chain: 'arm_L','arm_R','leg_L','leg_R'
//       target: Object3D (may hang from one of this rig's own bones, e.g. a grip on a worn guitar), a world
//       THREE.Vector3, or [x, y, z] in model space. tip: 'att_hand_L' (the palm lands on the target) or the end bone.
//       pole: model-space direction the elbow / knee points. rot: null (keep the posed hand), [rx, ry, rz] (model-space
//       delta of the end bone) or 'target' (the tip bone takes the target's orientation). ik.offset: model-space
//       THREE.Vector3 added to the target (strums, hits). ik.weight 0..1.
//   rig.plant('foot_L', weight = 1) -> ik     keeps the foot where it rests, flat (ik.offset lifts it for a stomp)
//   rig.lookAt(target | null, { weight, yaw, pitch, neck, speed })   head + neck within limits; rig.look.eyeX / eyeY
//       (-1..1, +x = the character's left) is what is left for the pupils (FaceDecal.look)
//   rig.aim(bone, target, axis, weight) -> aim      the bone's model-space rest axis points at the target (sticks)
//   Rig.aimObject(object3d, worldTarget, axis)      same for a loose prop (its local axis)
//   rig.hand('L' | 'R', preset | null, weight)      override the fingers of a hand whatever the layers say
//   rig.spring(chain | '*', { freq, damp, gravity, limit })   tune spr_<chain>_* (Hz, damping ratio, g, degrees)
//   rig.kick(amount, [x, y, z])    impulse to every spring chain (m/s, default downwards)
//   rig.bounce(amount)             whole-body squash impulse: -0.08 = squash 8 % then spring back (volume preserving)
//   rig.squash = { body, head }    extra stretch factors you can drive yourself (on top of poses and bounce)
//   rig.smear = { on, trail, v0, v1, max, bones }   speed-stretch of fast hands / feet; trail: ribbon ghosts (Rig.Trails)
//   rig.update(beat, dt)           beat: the music clock in beats; dt: seconds since the last frame (springs)
//   rig.onKey = (tag, layer, key) => {}             a key with a tag landed (expressions, VFX)
//   rig.pos(bone, outVec3) -> model-space position after update;  rig.worldPos(bone, outVec3)
//   Rig.Trails.init(max = 12, { manual }) -> Object3D to add to the scene (one draw for every smear ribbon). It updates
//       itself from GFX.render; with manual: true call Rig.Trails.update(dt, camera) yourself. Rig.Trails.clear()
//   Rig.channel(v0) -> ch    one number on the music clock: ch.to(v, key), ch.at(beat, v, key), ch.loop([{ at, v, ...key }],
//       len), ch.get(beat) -> value now (call it every frame, before rig.update). For IK offsets, weights, props.
//   Rig.mirror(pose) -> the pose with left and right swapped.   Rig.clock(bpm) -> { beat, bpm, tick(dt) }
//   Cost: no allocation per frame; about 50 bones * (layers + FK + write) flat-array maths per character.
// ============================================================================================================
const Rig = (function(){
  const F = Float32Array, DEG = Math.PI / 180, PI = Math.PI;
  const S = new F(96);                                     // scratch: quats at 0,4,8..., vectors from 48
  // ---- flat quaternion / vector maths (x, y, z, w) -----------------------------------------------------------
  function qmul(o, oi, a, ai, b, bi){
    const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3], bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
    o[oi] = aw * bx + ax * bw + ay * bz - az * by; o[oi + 1] = aw * by - ax * bz + ay * bw + az * bx;
    o[oi + 2] = aw * bz + ax * by - ay * bx + az * bw; o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
  }
  function qmulc(o, oi, a, ai, b, bi){                     // conj(a) * b
    const ax = -a[ai], ay = -a[ai + 1], az = -a[ai + 2], aw = a[ai + 3], bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
    o[oi] = aw * bx + ax * bw + ay * bz - az * by; o[oi + 1] = aw * by - ax * bz + ay * bw + az * bx;
    o[oi + 2] = aw * bz + ax * by - ay * bx + az * bw; o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
  }
  function vrot(o, oi, q, qi, x, y, z){
    const qx = q[qi], qy = q[qi + 1], qz = q[qi + 2], qw = q[qi + 3];
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    o[oi] = x + qw * tx + qy * tz - qz * ty; o[oi + 1] = y + qw * ty + qz * tx - qx * tz; o[oi + 2] = z + qw * tz + qx * ty - qy * tx;
  }
  function vrotc(o, oi, q, qi, x, y, z){                   // rotate by conj(q)
    const qx = -q[qi], qy = -q[qi + 1], qz = -q[qi + 2], qw = q[qi + 3];
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    o[oi] = x + qw * tx + qy * tz - qz * ty; o[oi + 1] = y + qw * ty + qz * tx - qx * tz; o[oi + 2] = z + qw * tz + qx * ty - qy * tx;
  }
  function qslerp(o, oi, a, ai, b, bi, t){                 // unclamped: t < 0 and t > 1 extrapolate (antic, overshoot)
    const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3]; let bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
    let c = ax * bx + ay * by + az * bz + aw * bw, s0, s1;
    if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    if (c > 0.99995) { s0 = 1 - t; s1 = t; } else { const th = Math.acos(c), sn = 1 / Math.sin(th); s0 = Math.sin((1 - t) * th) * sn; s1 = Math.sin(t * th) * sn; }
    const x = ax * s0 + bx * s1, y = ay * s0 + by * s1, z = az * s0 + bz * s1, w = aw * s0 + bw * s1, n = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
    o[oi] = x * n; o[oi + 1] = y * n; o[oi + 2] = z * n; o[oi + 3] = w * n;
  }
  function qarc(o, oi, ux, uy, uz, vx, vy, vz){            // shortest rotation taking unit u to unit v
    const d = ux * vx + uy * vy + uz * vz;
    if (d < -0.999999) { let x = 0, y = -uz, z = uy; if (y * y + z * z < 1e-6) { x = -uz; y = 0; z = ux; } const n = 1 / Math.sqrt(x * x + y * y + z * z); o[oi] = x * n; o[oi + 1] = y * n; o[oi + 2] = z * n; o[oi + 3] = 0; return; }
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, w = 1 + d, n = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
    o[oi] = x * n; o[oi + 1] = y * n; o[oi + 2] = z * n; o[oi + 3] = w * n;
  }
  function qeuler(o, oi, rx, ry, rz){                      // degrees, R = Rx * Ry * Rz
    const c1 = Math.cos(rx * DEG / 2), c2 = Math.cos(ry * DEG / 2), c3 = Math.cos(rz * DEG / 2), s1 = Math.sin(rx * DEG / 2), s2 = Math.sin(ry * DEG / 2), s3 = Math.sin(rz * DEG / 2);
    o[oi] = s1 * c2 * c3 + c1 * s2 * s3; o[oi + 1] = c1 * s2 * c3 - s1 * c2 * s3; o[oi + 2] = c1 * c2 * s3 + s1 * s2 * c3; o[oi + 3] = c1 * c2 * c3 - s1 * s2 * s3;
  }
  function qaxis(o, oi, x, y, z, deg){ const s = Math.sin(deg * DEG / 2); o[oi] = x * s; o[oi + 1] = y * s; o[oi + 2] = z * s; o[oi + 3] = Math.cos(deg * DEG / 2); }
  function qid(o, oi){ o[oi] = 0; o[oi + 1] = 0; o[oi + 2] = 0; o[oi + 3] = 1; }
  function qcp(o, oi, a, ai){ o[oi] = a[ai]; o[oi + 1] = a[ai + 1]; o[oi + 2] = a[ai + 2]; o[oi + 3] = a[ai + 3]; }
  // local scale of a bone for a stretch `s` along the unit direction (lx, ly, lz) given in the bone's own axes, volume preserving
  function stretchScale(scale, s, lx, ly, lz, keepVolume){ const p = keepVolume ? 1 / Math.sqrt(s) : 1, d = s - p; scale.x *= p + d * lx * lx; scale.y *= p + d * ly * ly; scale.z *= p + d * lz * lz; }

  // ---- easing: the value of a move, tb beats after its landing beat --------------------------------------------
  const EASE = { snap: 0, hit: 1, smooth: 2, linear: 3, step: 4 };
  function curve(tb, k){
    const peak = 1 + k.over;
    if (tb >= 0) { if (!k.over || tb >= k.settle) return 1; const s = tb / k.settle, f = 1 - s; return 1 + k.over * f * f * Math.cos(s * PI * 1.5); }
    if (k.in <= 0) return 0;
    let u = 1 + tb / k.in; if (u <= 0) return 0;
    let lo = 0;
    if (k.antic) { const ua = 0.42; if (u < ua) return -k.antic * Math.sin(u / ua * PI * 0.5); lo = -k.antic; u = (u - ua) / (1 - ua); }
    let e;
    switch (k.ease) { case 1: e = u * u * u; break; case 2: e = u * u * (3 - 2 * u); break; case 3: e = u; break; case 4: e = 0; break; default: { const v = 1 - u; e = 1 - v * v * v * v; } }
    return lo + (peak - lo) * e;
  }

  // ---- bone groups ------------------------------------------------------------------------------------------
  const FING = ['thumb1', 'thumb2', 'index1', 'index2', 'middle1', 'middle2', 'pinky1', 'pinky2'];
  const side = (list, s) => list.map(n => n + '_' + s);
  const ARM = ['shoulder', 'upperarm', 'forearm', 'hand'], LEG = ['thigh', 'shin', 'foot', 'toe'];
  const GROUPS = {
    spine: ['spine', 'chest'], torso: ['hips', 'spine', 'chest'], head: ['neck', 'head'],
    arm_L: side(ARM, 'L'), arm_R: side(ARM, 'R'), hand_L: side(FING, 'L'), hand_R: side(FING, 'R'),
    leg_L: side(LEG, 'L'), leg_R: side(LEG, 'R')
  };
  GROUPS.arms = GROUPS.arm_L.concat(GROUPS.arm_R, GROUPS.hand_L, GROUPS.hand_R); GROUPS.hands = GROUPS.hand_L.concat(GROUPS.hand_R);
  GROUPS.legs = GROUPS.leg_L.concat(GROUPS.leg_R); GROUPS.lower = ['root', 'hips'].concat(GROUPS.legs);
  GROUPS.upper = GROUPS.spine.concat(GROUPS.head, GROUPS.arms); GROUPS.body = GROUPS.lower.concat(GROUPS.spine, GROUPS.head);
  const DEPTH = { root: 0, hips: 0, spine: 1, chest: 2, neck: 3, head: 4, shoulder: 3, upperarm: 4, forearm: 5, hand: 6, thigh: 1, shin: 2, foot: 3, toe: 4 };

  const HANDS = {
    open:  { thumb: [-0.25, -0.1], index: [-0.1, -0.05], middle: [-0.1, -0.05], pinky: [-0.1, -0.05], spread: 14 },
    relax: { thumb: [0.1, 0.15], index: [0.22, 0.3], middle: [0.3, 0.38], pinky: [0.4, 0.45], spread: 2 },
    fist:  { thumb: [0.75, 0.7], index: [1, 1], middle: [1, 1], pinky: [1, 1], spread: 0 },
    pick:  { thumb: [0.7, 0.35], index: [0.72, 0.8], middle: [0.62, 0.7], pinky: [0.5, 0.6], spread: 3 },
    fret:  { thumb: [0.2, 0.25], index: [0.6, 0.9], middle: [0.7, 0.95], pinky: [0.8, 0.9], spread: 9 },
    stick: { thumb: [0.6, 0.45], index: [0.85, 0.9], middle: [0.9, 0.95], pinky: [0.95, 0.95], spread: 0 },
    mic:   { thumb: [0.5, 0.4], index: [0.75, 0.8], middle: [0.8, 0.85], pinky: [0.85, 0.85], spread: 2 },
    point: { thumb: [0.7, 0.6], index: [-0.05, 0], middle: [1, 1], pinky: [1, 1], spread: 0 },
    rock:  { thumb: [0.8, 0.7], index: [-0.08, 0], middle: [1, 1], pinky: [-0.08, 0], spread: 10 }
  };
  // The built-in pose library: a small vocabulary every band member shares. Model axes, see the header.
  const POSES = {
    rest: {},
    stand: { bones: { upperarm: [0, 0, -34], forearm: { bend: 14 } }, hands: 'relax' },
    bob_down: { move: { hips: [0, -0.075, 0.01] }, bones: { hips: [5, 0, 0], spine: [5, 0, 0], chest: [4, 0, 0], neck: [4, 0, 0], head: [10, 0, 0] }, squash: { head: 0.94 } },
    bob_up: { move: { hips: [0, 0.012, 0] }, bones: { hips: [-1, 0, 0], spine: [-2, 0, 0], chest: [-2, 0, 0], head: [-5, 0, 0] }, squash: { head: 1.03 } },
    sway_L: { move: { hips: [0.07, -0.03, 0] }, bones: { hips: [0, 6, -7], spine: [0, -3, 5], chest: [0, -4, 6], head: [0, 5, 7] } },
    sway_R: { move: { hips: [-0.07, -0.03, 0] }, bones: { hips: [0, -6, 7], spine: [0, 3, -5], chest: [0, 4, -6], head: [0, -5, -7] } },
    lean_back: { move: { hips: [0, -0.03, 0.05] }, bones: { hips: [-9, 0, 0], spine: [-8, 0, 0], chest: [-8, 0, 0], head: [-10, 0, 0] } },
    crouch: { move: { hips: [0, -0.2, -0.02] }, bones: { hips: [16, 0, 0], spine: [8, 0, 0], chest: [6, 0, 0], head: [-14, 0, 0] }, squash: { body: 0.95 } },
    headbang_down: { bones: { spine: [8, 0, 0], chest: [12, 0, 0], neck: [16, 0, 0], head: [24, 0, 0] }, move: { hips: [0, -0.05, 0] } },
    headbang_up: { bones: { spine: [-3, 0, 0], chest: [-5, 0, 0], neck: [-8, 0, 0], head: [-12, 0, 0] } },
    guitar_hold: { bones: { shoulder_L: [0, 0, 6], upperarm_L: [0, -28, -8], forearm_L: { bend: 78, twist: -50 }, hand_L: [0, 0, 0],
      upperarm_R: [0, 30, 22], forearm_R: { bend: 82, twist: 30 } }, hands: { L: 'fret', R: 'pick' } },
    strum_down: { bones: { forearm_R: [0, 0, 16], hand_R: [0, 0, 14] } },
    strum_up: { bones: { forearm_R: [0, 0, -12], hand_R: [0, 0, -12] } },
    cheer: { bones: { shoulder: [0, 0, 14], upperarm: [0, 0, 96], forearm: { bend: 22 }, chest: [-8, 0, 0], head: [-14, 0, 0] }, hands: 'open', squash: { body: 1.05 } },
    fist_pump: { bones: { shoulder_R: [0, 0, -14], upperarm_R: [0, 20, -100], forearm_R: { bend: 30 }, chest: [-5, 0, -4], head: [-10, 0, 0] }, hands: { R: 'fist' } },
    point: { bones: { upperarm_R: [0, 80, -30], forearm_R: { bend: 6 }, chest: [0, -12, 0] }, hands: { R: 'point' } },
    rock_on: { bones: { shoulder_L: [0, 0, 12], upperarm_L: [0, -15, 95], forearm_L: { bend: 26 }, chest: [-6, 0, 3], head: [-12, 0, 4] }, hands: { L: 'rock' } },
    sticks_ready: { bones: { upperarm: [0, -38, -12], forearm: { bend: 70, twist: -40 } }, hands: 'stick' },
    stick_up_R: { bones: { upperarm_R: [0, 44, 20], forearm_R: { bend: 118, twist: 40 }, hand_R: [-30, 0, 0] }, hands: { R: 'stick' } },
    stick_hit_R: { bones: { upperarm_R: [0, 36, 16], forearm_R: { bend: 52, twist: 40 }, hand_R: [24, 0, 0] }, hands: { R: 'stick' } },
    stick_up_L: { bones: { upperarm_L: [0, -44, -20], forearm_L: { bend: 118, twist: -40 }, hand_L: [-30, 0, 0] }, hands: { L: 'stick' } },
    stick_hit_L: { bones: { upperarm_L: [0, -36, -16], forearm_L: { bend: 52, twist: -40 }, hand_L: [24, 0, 0] }, hands: { L: 'stick' } },
    mic_hold: { bones: { upperarm_R: [0, 50, 26], forearm_R: { bend: 128, twist: 30 } }, hands: { R: 'mic' } },
    jump_antic: { move: { hips: [0, -0.26, -0.03] }, bones: { hips: [20, 0, 0], spine: [8, 0, 0], head: [-16, 0, 0], upperarm: [30, 0, -20] }, squash: { body: 0.9 } },
    jump_air: { move: { hips: [0, 0.34, 0] }, bones: { hips: [-6, 0, 0], chest: [-8, 0, 0], head: [-8, 0, 0], upperarm: [0, 0, 80], thigh: [-22, 0, 4], shin: { bend: 50 } }, hands: 'open', squash: { body: 1.1 } }
  };

  function maskWeights(c, mask){
    const w = new F(c.nb); if (mask == null) return w;
    const add = (name, v) => { name = name.trim(); if (name === 'all') { w.fill(v); return; }
      if (GROUPS[name]) { GROUPS[name].forEach(n => { if (n in c.idx) w[c.idx[n]] = v; }); return; }
      if (name in c.idx) w[c.idx[name]] = v; else if ((name + '_L') in c.idx) { w[c.idx[name + '_L']] = v; w[c.idx[name + '_R']] = v; } };
    if (typeof mask === 'string') mask.split(',').forEach(n => add(n, 1));
    else if (Array.isArray(mask)) mask.forEach(n => add(n, 1));
    else for (const k in mask) add(k, mask[k]);
    return w;
  }

  // ============================================================================================================
  // Layer: a pose-to-pose player on the music clock
  // ============================================================================================================
  function Layer(c, name, o){
    this.c = c; this.name = name; this.mode = o.mode === 'add' ? 'add' : 'over'; this.weight = o.weight == null ? 1 : o.weight;
    this.auto = o.mask == null; this.mask = maskWeights(c, o.mask); this.list = new Int16Array(c.nb); this.n = 0; this._relist();
    const nb = c.nb;
    this.fq = new F(nb * 4); this.cq = new F(nb * 4); this.fp = new F(nb * 3); this.cp = new F(nb * 3); this.delay = new F(nb);
    for (let i = 0; i < nb; i++) { this.fq[i * 4 + 3] = 1; this.cq[i * 4 + 3] = 1; }
    this.fs = new F([1, 1]); this.cs = new F([1, 1]);       // squash: body, head
    this.key = null; this.kBeat = 0; this.done = true; this.landed = true; this.used = false;
    this.q = []; this.pat = null; this.patLen = 1; this.patStart = 0; this.pi = 0; this.pc = 0;
  }
  Layer.prototype = {
    _relist(){ this.n = 0; let d0 = 99; for (let i = 0; i < this.c.nb; i++) if (this.mask[i] > 0) { this.list[this.n++] = i; d0 = Math.min(d0, this.c.depth[i]); } this.d0 = d0 === 99 ? 0 : d0; },
    _key(pose, k){
      k = k || {}; const c = this.c, p = c.pose(pose);
      if (this.auto) { let ch = false; for (let i = 0; i < c.nb; i++) if (p.has[i] && !this.mask[i]) { this.mask[i] = 1; ch = true; } if (ch) this._relist(); }
      let delays = null;
      if (k.delay) { delays = maskWeights(c, null); for (const n in k.delay) { const w = maskWeights(c, n); for (let i = 0; i < c.nb; i++) if (w[i]) delays[i] = k.delay[n]; } }
      return { pose: p, in: k.in == null ? 0.25 : k.in, ease: EASE[k.ease] || 0, antic: k.antic || 0, over: k.over || 0, settle: k.settle == null ? 0.35 : k.settle,
        follow: k.follow || 0, delays, tag: k.tag == null ? null : k.tag, at: k.at || 0, beat: k.beat, sq: k.in };
    },
    to(pose, k){ const key = this._key(pose, k); key.beat = k && k.beat != null ? k.beat : this.c.beat + key.in; this._queue(key); return this; },
    at(beat, pose, k){ const key = this._key(pose, k); key.beat = beat; this._queue(key); return this; },
    _queue(key){ const q = this.q; let i = q.length; while (i > 0 && q[i - 1].beat - q[i - 1].in > key.beat - key.in) i--; q.splice(i, 0, key); },
    loop(keys, len, start){
      this.pat = keys.map(k => this._key(k.pose, k)).sort((a, b) => a.at - b.at); this.patLen = len || 1; this.patStart = start || 0;
      const rel = Math.max(0, this.c.beat - this.patStart); this.pc = Math.floor(rel / this.patLen); this.pi = 0;
      return this;
    },
    stop(){ this.pat = null; this.q.length = 0; return this; },
    _begin(key, beat, now){
      this.fq.set(this.cq); this.fp.set(this.cp); this.fs.set(this.cs);
      this.key = key; this.kBeat = beat; this.done = false; this.landed = false; this.used = true;
      key.sq = beat - key.in < now - 1e-6 ? Math.max(0, beat - now) : key.in;      // late: squeeze the move so it still lands on the beat
      const c = this.c, d = this.delay;
      for (let j = 0; j < this.n; j++) { const i = this.list[j]; d[i] = key.follow * Math.max(0, c.depth[i] - this.d0) + (key.delays ? key.delays[i] : 0); }
    },
    update(now){
      // start whatever is due (a key's move starts `in` beats before it lands)
      let guard = 0;
      while (this.pat && guard++ < 64) {
        const k = this.pat[this.pi], kb = this.patStart + this.pc * this.patLen + k.at;
        if (now < kb - k.in) break;
        if (now - kb < this.patLen) this._begin(k, kb, now);
        if (++this.pi >= this.pat.length) { this.pi = 0; this.pc++; }
      }
      if (guard >= 64) this.pc = Math.floor((now - this.patStart) / this.patLen);
      while (this.q.length && now >= this.q[0].beat - this.q[0].in) { const k = this.q.shift(); this._begin(k, k.beat, now); }
      const key = this.key; if (!key || this.done) return;
      const K = Layer._k; K.in = key.sq; K.ease = key.ease; K.antic = key.antic; K.over = key.over; K.settle = key.settle;
      const tb0 = now - this.kBeat, fq = this.fq, cq = this.cq, tq = key.pose.q, fp = this.fp, cp = this.cp, tp = key.pose.p, d = this.delay;
      let maxD = 0;
      for (let j = 0; j < this.n; j++) {
        const i = this.list[j], v = curve(tb0 - d[i], K), a = i * 4, b = i * 3; if (d[i] > maxD) maxD = d[i];
        if (v === 0) { cq[a] = fq[a]; cq[a + 1] = fq[a + 1]; cq[a + 2] = fq[a + 2]; cq[a + 3] = fq[a + 3]; }
        else if (v === 1) { cq[a] = tq[a]; cq[a + 1] = tq[a + 1]; cq[a + 2] = tq[a + 2]; cq[a + 3] = tq[a + 3]; }
        else qslerp(cq, a, fq, a, tq, a, v);
        cp[b] = fp[b] + (tp[b] - fp[b]) * v; cp[b + 1] = fp[b + 1] + (tp[b + 1] - fp[b + 1]) * v; cp[b + 2] = fp[b + 2] + (tp[b + 2] - fp[b + 2]) * v;
      }
      const v = curve(tb0, K); this.cs[0] = this.fs[0] + (key.pose.body - this.fs[0]) * v; this.cs[1] = this.fs[1] + (key.pose.head - this.fs[1]) * v;
      if (!this.landed && tb0 >= 0) { this.landed = true; if (key.tag != null && this.c.onKey) this.c.onKey(key.tag, this, key); }
      if (tb0 >= maxD + (key.over ? key.settle : 0)) this.done = true;
    }
  };
  Layer._k = { in: 0, ease: 0, antic: 0, over: 0, settle: 0 };

  // ============================================================================================================
  // Channel: one number on the music clock, moved with the same keys as a pose (IK offsets, weights, props)
  // ============================================================================================================
  function Chan(v){ this.v = v || 0; this.f = this.v; this.g = this.v; this.key = null; this.kb = 0; this.q = []; this.pat = null; this.len = 1; this.start = 0; this.pi = 0; this.pc = 0; this.beat = 0; this.onKey = null; this.landed = true; }
  Chan.prototype = {
    _key(v, k){ k = k || {}; return { v, in: k.in == null ? 0.25 : k.in, ease: EASE[k.ease] || 0, antic: k.antic || 0, over: k.over || 0, settle: k.settle == null ? 0.35 : k.settle, at: k.at || 0, beat: k.beat, tag: k.tag == null ? null : k.tag, sq: 0 }; },
    to(v, k){ const key = this._key(v, k); if (key.beat == null) key.beat = this.beat + key.in; this.q.push(key); this.q.sort((a, b) => (a.beat - a.in) - (b.beat - b.in)); return this; },
    at(beat, v, k){ const key = this._key(v, k); key.beat = beat; this.q.push(key); this.q.sort((a, b) => (a.beat - a.in) - (b.beat - b.in)); return this; },
    loop(keys, len, start){ this.pat = keys.map(k => this._key(k.v, k)).sort((a, b) => a.at - b.at); this.len = len || 1; this.start = start || 0; this.pc = Math.floor(Math.max(0, this.beat - this.start) / this.len); this.pi = 0; return this; },
    stop(){ this.pat = null; this.q.length = 0; return this; },
    _begin(k, kb, now){ this.f = this.v; this.g = k.v; this.key = k; this.kb = kb; this.landed = false; k.sq = kb - k.in < now - 1e-6 ? Math.max(0, kb - now) : k.in; },
    get(now){
      this.beat = now; let guard = 0;
      while (this.pat && guard++ < 64) { const k = this.pat[this.pi], kb = this.start + this.pc * this.len + k.at; if (now < kb - k.in) break; if (now - kb < this.len) this._begin(k, kb, now); if (++this.pi >= this.pat.length) { this.pi = 0; this.pc++; } }
      if (guard >= 64) this.pc = Math.floor((now - this.start) / this.len);
      while (this.q.length && now >= this.q[0].beat - this.q[0].in) { const k = this.q.shift(); this._begin(k, k.beat, now); }
      const k = this.key; if (!k) return this.v;
      const K = Layer._k; K.in = k.sq; K.ease = k.ease; K.antic = k.antic; K.over = k.over; K.settle = k.settle;
      this.v = this.f + (this.g - this.f) * curve(now - this.kb, K);
      if (!this.landed && now >= this.kb) { this.landed = true; if (k.tag != null && this.onKey) this.onKey(k.tag, this, k); }
      return this.v;
    }
  };

  // ============================================================================================================
  // Char: one rigged character
  // ============================================================================================================
  function Char(inst, o){
    o = o || {}; const T = THREE; this.inst = inst; this.root = inst.root;
    const names = this.names = Object.keys(inst.bones), nb = this.nb = names.length, idx = this.idx = {};
    names.forEach((n, i) => { idx[n] = i; });
    this.bones = names.map(n => inst.bones[n]); this.map = new Map(); this.bones.forEach((b, i) => this.map.set(b, i));
    this.parent = new Int16Array(nb); this.depth = new Uint8Array(nb);
    this.M = new F(nb * 4); this.Mp = new F(nb * 4); this.restP = new F(nb * 3); this.off = new F(nb * 3); this.dir = new F(nb * 3); this.hinge = new F(nb * 3);
    this.d = new F(nb * 4); this.dp = new F(nb * 3); this.G = new F(nb * 4); this.P = new F(nb * 3); this.moved = new Uint8Array(nb); this.scaled = new Uint8Array(nb);
    const q = new T.Quaternion(), q2 = new T.Quaternion();
    inst.root.updateMatrixWorld(true); inst.root.getWorldQuaternion(q2); q2.invert();
    for (let i = 0; i < nb; i++) {
      const b = this.bones[i], r = inst.rest[names[i]], pi = this.map.has(b.parent) ? this.map.get(b.parent) : -1; this.parent[i] = pi;
      this.M[i * 4] = r.mQuat.x; this.M[i * 4 + 1] = r.mQuat.y; this.M[i * 4 + 2] = r.mQuat.z; this.M[i * 4 + 3] = r.mQuat.w;
      this.restP[i * 3] = r.mPos.x; this.restP[i * 3 + 1] = r.mPos.y; this.restP[i * 3 + 2] = r.mPos.z;
      if (pi >= 0) { qcp(this.Mp, i * 4, this.M, pi * 4); for (let k = 0; k < 3; k++) this.off[i * 3 + k] = this.restP[i * 3 + k] - this.restP[pi * 3 + k]; }
      else { b.parent.getWorldQuaternion(q).premultiply(q2); this.Mp[i * 4] = q.x; this.Mp[i * 4 + 1] = q.y; this.Mp[i * 4 + 2] = q.z; this.Mp[i * 4 + 3] = q.w; for (let k = 0; k < 3; k++) this.off[i * 3 + k] = this.restP[i * 3 + k]; }
      const base = names[i].replace(/_[LR]$/, ''); this.depth[i] = base in DEPTH ? DEPTH[base] : FING.indexOf(base) >= 0 ? 7 : pi >= 0 ? this.depth[pi] + 1 : 0;
      qid(this.d, i * 4); qid(this.G, i * 4);
    }
    // each bone's rest direction (towards its main child) and hinge axis, in model space
    const MAIN = { upperarm: 'forearm', forearm: 'hand', thigh: 'shin', shin: 'foot', foot: 'toe', hips: 'spine', spine: 'chest', chest: 'neck', neck: 'head', shoulder: 'upperarm',
      thumb1: 'thumb2', index1: 'index2', middle1: 'middle2', pinky1: 'pinky2', hand: 'middle1' };
    for (let i = 0; i < nb; i++) {
      const m = /^(.*?)(_[LR])?$/.exec(names[i]), ch = MAIN[m[1]] ? idx[MAIN[m[1]] + (m[2] || '')] : undefined; let x, y, z;
      if (ch !== undefined) { x = this.restP[ch * 3] - this.restP[i * 3]; y = this.restP[ch * 3 + 1] - this.restP[i * 3 + 1]; z = this.restP[ch * 3 + 2] - this.restP[i * 3 + 2]; }
      else if (/^(thumb|index|middle|pinky)2/.test(names[i]) || /^spr_/.test(names[i])) { const p = this.parent[i]; x = this.off[i * 3]; y = this.off[i * 3 + 1]; z = this.off[i * 3 + 2];
        if (p < 0 || /^spr_.*_1$/.test(names[i])) { vrot(S, 48, this.M, i * 4, 0, 1, 0); x = S[48]; y = S[49]; z = S[50]; } }
      else { vrot(S, 48, this.M, i * 4, 0, 1, 0); x = S[48]; y = S[49]; z = S[50]; }
      const n = 1 / (Math.hypot(x, y, z) || 1); this.dir[i * 3] = x * n; this.dir[i * 3 + 1] = y * n; this.dir[i * 3 + 2] = z * n;
    }
    this.size = o.size || ('hips' in idx ? this.restP[idx.hips * 3 + 1] / 0.9914 : 1);
    this._hands();
    for (let i = 0; i < nb; i++) {                         // hinge: elbows fold to the front, knees to the back, fingers to the palm (set in _hands)
      if (this.hinge[i * 3] || this.hinge[i * 3 + 1] || this.hinge[i * 3 + 2]) continue;
      const base = names[i].replace(/_[LR]$/, ''), back = base === 'shin' || base === 'thigh' ? -1 : 1, dx = this.dir[i * 3], dy = this.dir[i * 3 + 1], dz = this.dir[i * 3 + 2];
      let hx = dy * back, hy = -dx * back, hz = 0;         // dir x (0, 0, back): rotating +deg about it swings dir towards z = back
      if (base === 'thigh') { hx = -hx; hy = -hy; }       // a positive bend lifts the thigh to the FRONT, and folds the shin BACK
      const n = Math.hypot(hx, hy, hz); if (n < 1e-4) { hx = back; hy = 0; hz = 0; } else { hx /= n; hy /= n; hz /= n; }
      this.hinge[i * 3] = hx; this.hinge[i * 3 + 1] = hy; this.hinge[i * 3 + 2] = hz;
    }
    this._desc = {}; this.layers = []; this.layerBy = {}; this.iks = []; this.aims = []; this._poses = new Map();
    this.beat = 0; this.onKey = null;
    this.squash = { body: 1, head: 1 }; this._bx = 0; this._bv = 0; this._body = 1; this.bounceFreq = 3.4; this.bounceDamp = 0.32;
    this.look = { target: null, weight: 1, yaw: 62, pitch: 32, neck: 0.38, speed: 16, eyeX: 0, eyeY: 0, _y: 0, _p: 0 };
    this.handOv = { L: null, R: null, wL: 0, wR: 0 };
    this.smear = { on: true, trail: true, v0: 2.2, v1: 9, max: 0.9, color: null, bones: ['hand_L', 'hand_R', 'foot_L', 'foot_R'].filter(n => n in idx) };
    this._sm = this.smear.bones.map(n => ({ i: idx[n], px: 0, py: 0, pz: 0, amt: 0, slot: -1, ok: false }));
    this._rootInv = new T.Matrix4(); this._m = new T.Matrix4(); this._m2 = new T.Matrix4(); this._v = new T.Vector3(); this._v2 = new T.Vector3(); this._q = new T.Quaternion(); this._s = new T.Vector3(1, 1, 1);
    this._rq = new F([0, 0, 0, 1]); this._rp = new F(3); this._rs = 1; this._bs = new F([1, 1, 1]);
    this._springs(); this._acc = 0;
    this.iRoot = idx.root; this.iHead = idx.head; this.iNeck = idx.neck; this.iChest = idx.chest;
    this.twist = ['L', 'R'].map(s => ({ t: idx['twist_forearm_' + s], f: idx['forearm_' + s], h: idx['hand_' + s] })).filter(t => t.t !== undefined && t.f !== undefined && t.h !== undefined);
  }
  Char.prototype = {
    // fingers: curl axes from the hand's own geometry, so presets work on any hand
    _hands(){
      const c = this, idx = c.idx, P = c.restP; c.fing = {};
      for (const s of ['L', 'R']) {
        const h = idx['hand_' + s]; if (h === undefined) continue;
        const sub = (a, b, o) => { S[o] = P[a * 3] - P[b * 3]; S[o + 1] = P[a * 3 + 1] - P[b * 3 + 1]; S[o + 2] = P[a * 3 + 2] - P[b * 3 + 2]; };
        let nx, ny, nz; const att = idx['att_hand_' + s];
        if (att !== undefined) { vrot(S, 48, c.M, att * 4, 0, 0, s === 'L' ? -1 : 1); nx = S[48]; ny = S[49]; nz = S[50]; }
        else { const a = idx['index1_' + s], b = idx['pinky1_' + s]; if (a === undefined || b === undefined) continue; sub(a, h, 48); sub(b, h, 52);
          nx = S[49] * S[54] - S[50] * S[53]; ny = S[50] * S[52] - S[48] * S[54]; nz = S[48] * S[53] - S[49] * S[52]; const n = Math.hypot(nx, ny, nz) || 1; nx /= n; ny /= n; nz /= n;
          if (nx * (s === 'L' ? -0.5 : 0.5) - ny < 0) { nx = -nx; ny = -ny; nz = -nz; } }
        const f = c.fing[s] = { n: [nx, ny, nz], bones: {} }, hd = h * 3;
        for (const name of ['index', 'middle', 'pinky', 'thumb']) for (const k of [1, 2]) {
          const i = idx[name + k + '_' + s]; if (i === undefined) continue;
          const dx = c.dir[i * 3], dy = c.dir[i * 3 + 1], dz = c.dir[i * 3 + 2];
          let ax = dy * nz - dz * ny, ay = dz * nx - dx * nz, az = dx * ny - dy * nx; const n = Math.hypot(ax, ay, az) || 1; ax /= n; ay /= n; az /= n;
          c.hinge[i * 3] = ax; c.hinge[i * 3 + 1] = ay; c.hinge[i * 3 + 2] = az;
          f.bones[name + k] = i;
        }
        // the thumb opposes by rolling about the hand's length, towards the palm
        const t1 = idx['thumb1_' + s];
        if (t1 !== undefined) { const hx = c.dir[hd], hy = c.dir[hd + 1], hz = c.dir[hd + 2], tx = c.dir[t1 * 3], ty = c.dir[t1 * 3 + 1], tz = c.dir[t1 * 3 + 2];
          const cx = hy * tz - hz * ty, cy = hz * tx - hx * tz, cz = hx * ty - hy * tx, sg = cx * nx + cy * ny + cz * nz < 0 ? -1 : 1; f.opp = [hx * sg, hy * sg, hz * sg]; }
      }
    },
    _fingers(q, has, s, preset, w){
      const f = this.fing[s]; if (!f) return; const h = typeof preset === 'string' ? HANDS[preset] : preset; if (!h) return;
      const hg = this.hinge, sp = h.spread || 0;
      for (const name of ['index', 'middle', 'pinky']) { const v = h[name]; if (!v) continue;
        for (const k of [1, 2]) { const i = f.bones[name + k]; if (i === undefined) continue;
          qaxis(S, 0, hg[i * 3], hg[i * 3 + 1], hg[i * 3 + 2], v[k - 1] * (k === 1 ? 84 : 98) * w);
          if (k === 1 && sp && name !== 'middle') { qaxis(S, 4, f.n[0], f.n[1], f.n[2], sp * (name === 'index' ? 1 : -1) * (s === 'L' ? 1 : -1) * w); qmul(S, 0, S, 4, S, 0); }
          qcp(q, i * 4, S, 0); if (has) has[i] = 1; } }
      const v = h.thumb;
      if (v) { const i1 = f.bones.thumb1, i2 = f.bones.thumb2;
        if (i1 !== undefined) { qaxis(S, 0, f.opp[0], f.opp[1], f.opp[2], v[0] * 62 * w); qaxis(S, 4, hg[i1 * 3], hg[i1 * 3 + 1], hg[i1 * 3 + 2], v[1] * 26 * w); qmul(q, i1 * 4, S, 0, S, 4); if (has) has[i1] = 1; }
        if (i2 !== undefined) { qaxis(q, i2 * 4, hg[i2 * 3], hg[i2 * 3 + 1], hg[i2 * 3 + 2], v[1] * 70 * w); if (has) has[i2] = 1; } }
    },
    // compiled pose for this rig (cached): dense delta quats + offsets
    pose(p){
      const src = typeof p === 'string' ? POSES[p] : p; if (!src) throw new Error('Rig: no pose "' + p + '"');
      let cp = this._poses.get(src); if (cp) return cp;
      const c = this, nb = c.nb; cp = { q: new F(nb * 4), p: new F(nb * 3), has: new Uint8Array(nb), body: 1, head: 1, src };
      for (let i = 0; i < nb; i++) cp.q[i * 4 + 3] = 1;
      this._poses.set(src, cp);
      const uses = src.use ? (Array.isArray(src.use) ? src.use : [src.use]) : [];
      for (const u of uses) { const b = c.pose(u); for (let i = 0; i < nb; i++) if (b.has[i]) { qcp(cp.q, i * 4, b.q, i * 4); cp.p[i * 3] = b.p[i * 3]; cp.p[i * 3 + 1] = b.p[i * 3 + 1]; cp.p[i * 3 + 2] = b.p[i * 3 + 2]; cp.has[i] = 1; } cp.body *= b.body; cp.head *= b.head; }
      const each = (name, fn) => { if (name in c.idx) fn(c.idx[name], 1); else { if ((name + '_L') in c.idx) fn(c.idx[name + '_L'], 1); if ((name + '_R') in c.idx) fn(c.idx[name + '_R'], -1); } };
      const B = src.bones || {};
      for (const name in B) each(name, (i, m) => {
        const v = B[name], a = i * 4;
        if (Array.isArray(v)) { if (v.length === 4) { cp.q[a] = v[0]; cp.q[a + 1] = v[1] * m; cp.q[a + 2] = v[2] * m; cp.q[a + 3] = v[3]; } else qeuler(cp.q, a, v[0], v[1] * m, v[2] * m); }
        else { qid(S, 0);
          if (v.twist) qaxis(S, 0, c.dir[i * 3], c.dir[i * 3 + 1], c.dir[i * 3 + 2], v.twist * m);
          if (v.bend) { qaxis(S, 4, c.hinge[i * 3], c.hinge[i * 3 + 1], c.hinge[i * 3 + 2], v.bend); qmul(S, 0, S, 4, S, 0); }
          if (v.r) { qeuler(S, 4, v.r[0], v.r[1] * m, v.r[2] * m); qmul(S, 0, S, 4, S, 0); }
          qcp(cp.q, a, S, 0); }
        cp.has[i] = 1; });
      const Mv = src.move || {};
      for (const name in Mv) each(name, (i, m) => { const v = Mv[name]; cp.p[i * 3] = v[0] * m * c.size; cp.p[i * 3 + 1] = v[1] * c.size; cp.p[i * 3 + 2] = v[2] * c.size; cp.has[i] = 1; });
      if (src.hands) { const h = src.hands; if (typeof h === 'string' || h.index || h.thumb) { c._fingers(cp.q, cp.has, 'L', h, 1); c._fingers(cp.q, cp.has, 'R', h, 1); } else { if (h.L) c._fingers(cp.q, cp.has, 'L', h.L, 1); if (h.R) c._fingers(cp.q, cp.has, 'R', h.R, 1); } }
      if (src.squash) { if (src.squash.body != null) cp.body = src.squash.body; if (src.squash.head != null) cp.head = src.squash.head; }
      return cp;
    },
    layer(name, o){ if (this.layerBy[name]) return this.layerBy[name]; const l = new Layer(this, name, o || {}); this.layers.push(l); this.layerBy[name] = l; return l; },
    desc(b){                                               // descendants of bone index b, parents first
      if (this._desc[b]) return this._desc[b]; const out = [], inSet = new Uint8Array(this.nb); inSet[b] = 1;
      for (let i = 0; i < this.nb; i++) { const p = this.parent[i]; if (p >= 0 && inSet[p]) { inSet[i] = 1; out.push(i); } }
      return (this._desc[b] = new Int16Array(out));
    },
    _prop(list, skipA, skipB){                              // re-run FK for a list of bones from their (changed) parents
      const G = this.G, P = this.P, d = this.d, off = this.off, dp = this.dp, par = this.parent;
      for (let j = 0; j < list.length; j++) { const i = list[j]; if (i === skipA || i === skipB) continue; const p = par[i], a = i * 4, b = i * 3;
        qmul(G, a, G, p * 4, d, a); vrot(P, b, G, p * 4, off[b] + dp[b], off[b + 1] + dp[b + 1], off[b + 2] + dp[b + 2]); P[b] += P[p * 3]; P[b + 1] += P[p * 3 + 1]; P[b + 2] += P[p * 3 + 2]; }
    },
    ik(chain, o){
      o = o || {}; const m = /^(arm|leg)_([LR])$/.exec(chain); if (!m) throw new Error('Rig: no IK chain "' + chain + '"');
      const n = m[1] === 'arm' ? ['upperarm', 'forearm', 'hand'] : ['thigh', 'shin', 'foot'], s = m[2], idx = this.idx;
      const a = idx[n[0] + '_' + s], b = idx[n[1] + '_' + s], c = idx[n[2] + '_' + s]; if (a === undefined || b === undefined || c === undefined) return null;
      const ik = { chain, a, b, c, target: o.target || null, weight: o.weight == null ? 1 : o.weight, offset: new THREE.Vector3(), rot: o.rot === undefined ? null : o.rot, _rq: new F([0, 0, 0, 1]),
        pole: new F(o.pole || (m[1] === 'arm' ? [s === 'L' ? 0.35 : -0.35, -1, -0.45] : [s === 'L' ? 0.12 : -0.12, 0, 1])), tip: -1, tipV: new F(3), tipQ: new F([0, 0, 0, 1]),
        l1: Math.hypot(this.off[b * 3], this.off[b * 3 + 1], this.off[b * 3 + 2]), l2: Math.hypot(this.off[c * 3], this.off[c * 3 + 1], this.off[c * 3 + 2]),
        list: this.desc(a), reach: 0 };
      if (o.offset) ik.offset.fromArray(o.offset);
      const tip = o.tip && idx[o.tip]; if (tip !== undefined && tip !== false && tip !== c) { ik.tip = tip; for (let k = 0; k < 3; k++) ik.tipV[k] = this.restP[tip * 3 + k] - this.restP[c * 3 + k]; qcp(ik.tipQ, 0, this.M, tip * 4); }
      this.iks.push(ik); return ik;
    },
    plant(foot, w){ const s = /_R$/.test(foot) ? 'R' : 'L', i = this.idx['foot_' + s]; if (i === undefined) return null;
      return this.ik('leg_' + s, { target: [this.restP[i * 3], this.restP[i * 3 + 1], this.restP[i * 3 + 2]], rot: [0, 0, 0], weight: w }); },
    lookAt(t, o){ const L = this.look; L.target = t || null; if (o) for (const k in o) L[k] = o[k]; return L; },
    aim(bone, target, axis, weight){ const i = this.idx[bone]; if (i === undefined) return null; const a = { i, target, axis: new F(axis || [this.dir[i * 3], this.dir[i * 3 + 1], this.dir[i * 3 + 2]]), weight: weight == null ? 1 : weight, list: this.desc(i) };
      const n = Math.hypot(a.axis[0], a.axis[1], a.axis[2]) || 1; a.axis[0] /= n; a.axis[1] /= n; a.axis[2] /= n; this.aims.push(a); return a; },
    hand(s, preset, w){ this.handOv[s] = preset || null; this.handOv['w' + s] = preset ? (w == null ? 1 : w) : 0; },
    bounce(a){ this._bv += a * this.bounceFreq * 2 * PI * 1.25; },
    kick(a, dir){ const x = dir ? dir[0] : 0, y = dir ? dir[1] : -1, z = dir ? dir[2] : 0; for (const ch of this.springs) for (let j = 0; j < ch.n; j++) { ch.v[j * 3] += x * a; ch.v[j * 3 + 1] += y * a; ch.v[j * 3 + 2] += z * a; } },
    spring(name, o){ for (const ch of this.springs) if (name === '*' || ch.name === name) for (const k in o) ch[k] = o[k]; },
    _springs(){
      const c = this, chains = {}; c.springs = [];
      c.names.forEach((n, i) => { const m = /^spr_(.+)_(\d+)$/.exec(n); if (m) (chains[m[1]] = chains[m[1]] || []).push([+m[2], i]); });
      for (const name in chains) {
        const list = chains[name].sort((a, b) => a[0] - b[0]).map(e => e[1]), n = list.length;
        const ch = { name, n, b: new Int16Array(list), len: new F(n), tv: new F(n * 3), x: new F(n * 3), v: new F(n * 3), freq: 3.4, damp: 0.3, gravity: 0.25, limit: 55, init: false };
        for (let j = 0; j < n; j++) { const i = list[j]; let len = 0.07;
          if (j + 1 < n) { const k = list[j + 1]; len = Math.hypot(c.off[k * 3], c.off[k * 3 + 1], c.off[k * 3 + 2]); const s = 1 / (len || 1); ch.tv[j * 3] = c.off[k * 3] * s; ch.tv[j * 3 + 1] = c.off[k * 3 + 1] * s; ch.tv[j * 3 + 2] = c.off[k * 3 + 2] * s; }
          else { if (j > 0) len = ch.len[j - 1]; vrot(S, 48, c.M, i * 4, 0, 1, 0); ch.tv[j * 3] = S[48]; ch.tv[j * 3 + 1] = S[49]; ch.tv[j * 3 + 2] = S[50]; }   // the last bone runs along its own +Y
          ch.len[j] = len; }
        c.springs.push(ch);
      }
    },
    // model-space position (and orientation into this._q) of an IK / look target
    _target(t, out, external){
      const c = this; external.v = false;
      if (!t) return false;
      if (t.isVector3) { out.copy(t).applyMatrix4(c._rootInv); external.v = true; return true; }
      if (!t.isObject3D) { out.set(t[0], t[1], t[2]); c._q.set(0, 0, 0, 1); return true; }
      const m = c._m; t.updateMatrix(); m.copy(t.matrix); let p = t.parent;
      while (p) {
        const bi = c.map.get(p);
        if (bi !== undefined) { const G = c.G, M = c.M; qmul(S, 0, G, bi * 4, M, bi * 4); c._q.set(S[0], S[1], S[2], S[3]); c._v2.set(c.P[bi * 3], c.P[bi * 3 + 1], c.P[bi * 3 + 2]);
          c._m2.compose(c._v2, c._q, c._s); m.premultiply(c._m2); break; }
        if (p === c.root) break;
        if (!p.isBone) p.updateMatrix(); m.premultiply(p.matrix); p = p.parent;
      }
      if (!p) { t.updateWorldMatrix(true, false); m.copy(t.matrixWorld).premultiply(c._rootInv); external.v = true; }
      m.decompose(out, c._q, c._v2); return true;
    },
    pos(bone, out){ const i = this.idx[bone] * 3; return out.set(this.P[i] * this._bs[0], this.P[i + 1] * this._bs[1], this.P[i + 2] * this._bs[2]); },
    worldPos(bone, out){ return this.pos(bone, out).applyMatrix4(this.root.matrixWorld); },

    update(beat, dt){
      const c = this, nb = c.nb, d = c.d, dp = c.dp, G = c.G, P = c.P, par = c.parent, off = c.off, T = THREE;
      c.beat = beat; dt = Math.min(0.1, Math.max(0, dt || 0));
      // 1 layers
      for (let i = 0; i < nb; i++) { const a = i * 4; d[a] = 0; d[a + 1] = 0; d[a + 2] = 0; d[a + 3] = 1; }
      dp.fill(0); let body = c.squash.body, head = c.squash.head;
      for (const L of c.layers) {
        L.update(beat); if (!L.used) continue; const w0 = L.weight; if (w0 <= 0) continue;
        const cq = L.cq, cp = L.cp, add = L.mode === 'add';
        for (let j = 0; j < L.n; j++) { const i = L.list[j], a = i * 4, b = i * 3, w = w0 * L.mask[i];
          if (add) { if (w >= 0.999) qmul(d, a, cq, a, d, a); else { qid(S, 0); qslerp(S, 4, S, 0, cq, a, w); qmul(d, a, S, 4, d, a); } dp[b] += cp[b] * w; dp[b + 1] += cp[b + 1] * w; dp[b + 2] += cp[b + 2] * w; }
          else { if (w >= 0.999) { d[a] = cq[a]; d[a + 1] = cq[a + 1]; d[a + 2] = cq[a + 2]; d[a + 3] = cq[a + 3]; dp[b] = cp[b]; dp[b + 1] = cp[b + 1]; dp[b + 2] = cp[b + 2]; }
            else { qslerp(d, a, d, a, cq, a, w); dp[b] += (cp[b] - dp[b]) * w; dp[b + 1] += (cp[b + 1] - dp[b + 1]) * w; dp[b + 2] += (cp[b + 2] - dp[b + 2]) * w; } } }
        body *= 1 + (L.cs[0] - 1) * w0; head *= 1 + (L.cs[1] - 1) * w0;
      }
      for (const s of ['L', 'R']) { const w = c.handOv['w' + s]; if (w > 0 && c.handOv[s]) c._fingers(d, null, s, c.handOv[s], w); }
      // whole-body bounce (a damped spring on the squash factor)
      { const om = c.bounceFreq * 2 * PI, k = om * om, cd = 2 * c.bounceDamp * om; let n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
        for (let i = 0; i < n; i++) { c._bv += (-k * c._bx - cd * c._bv) * h; c._bx += c._bv * h; } }
      body = Math.max(0.5, Math.min(1.6, body + c._bx)); c._body = body;
      const sxz = 1 / Math.sqrt(body); c._bs[0] = sxz; c._bs[1] = body; c._bs[2] = sxz;
      // 2 FK in model space
      for (let i = 0; i < nb; i++) { const p = par[i], a = i * 4, b = i * 3;
        if (p < 0) { G[a] = d[a]; G[a + 1] = d[a + 1]; G[a + 2] = d[a + 2]; G[a + 3] = d[a + 3]; P[b] = off[b] + dp[b]; P[b + 1] = off[b + 1] + dp[b + 1]; P[b + 2] = off[b + 2] + dp[b + 2]; }
        else { qmul(G, a, G, p * 4, d, a); vrot(P, b, G, p * 4, off[b] + dp[b], off[b + 1] + dp[b + 1], off[b + 2] + dp[b + 2]); P[b] += P[p * 3]; P[b + 1] += P[p * 3 + 1]; P[b + 2] += P[p * 3 + 2]; } }
      // root transform (targets and springs live in the world)
      c.root.updateWorldMatrix(true, false); c._rootInv.copy(c.root.matrixWorld).invert();
      c.root.matrixWorld.decompose(c._v, c._q, c._v2); c._rq[0] = c._q.x; c._rq[1] = c._q.y; c._rq[2] = c._q.z; c._rq[3] = c._q.w; c._rp[0] = c._v.x; c._rp[1] = c._v.y; c._rp[2] = c._v.z; c._rs = c._v2.x;
      // 3 IK
      const ext = Char._ext, tv = c._v;
      for (const ik of c.iks) {
        if (ik.weight <= 0 || !c._target(ik.target, tv, ext)) continue;
        let tx = tv.x, ty = tv.y, tz = tv.z;
        if (ext.v) { tx /= c._bs[0]; ty /= c._bs[1]; tz /= c._bs[2]; }
        tx += ik.offset.x; ty += ik.offset.y; tz += ik.offset.z;
        const a = ik.a, b = ik.b, e = ik.c, a4 = a * 4, b4 = b * 4, e4 = e * 4, w = ik.weight;
        // the end bone's orientation: S[8..11]
        if (ik.rot === 'target' && ik.target.isObject3D) { S[0] = c._q.x; S[1] = c._q.y; S[2] = c._q.z; S[3] = c._q.w; const tq = ik.tip >= 0 ? ik.tipQ : c.M; const ti = ik.tip >= 0 ? 0 : e4;
          S[4] = -tq[ti]; S[5] = -tq[ti + 1]; S[6] = -tq[ti + 2]; S[7] = tq[ti + 3]; qmul(S, 8, S, 0, S, 4); }
        else if (ik.rot && ik.rot !== 'target') qeuler(S, 8, ik.rot[0], ik.rot[1], ik.rot[2]);
        else qcp(S, 8, G, e4);
        if (w < 1 && ik.rot) qslerp(S, 8, G, e4, S, 8, w);
        if (ik.tip >= 0) { vrot(S, 48, S, 8, ik.tipV[0], ik.tipV[1], ik.tipV[2]); tx -= S[48]; ty -= S[49]; tz -= S[50]; }
        const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], l1 = ik.l1, l2 = ik.l2;
        let dx = tx - ax, dy = ty - ay, dz = tz - az, dist = Math.hypot(dx, dy, dz) || 1e-5; dx /= dist; dy /= dist; dz /= dist;
        const max = (l1 + l2) * 0.999, soft = max * 0.93; ik.reach = dist / (l1 + l2);
        if (dist > soft) dist = max - (max - soft) * Math.exp(-(dist - soft) / (max - soft));
        dist = Math.max(dist, Math.abs(l1 - l2) + 0.01);
        const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), hgt = Math.sqrt(Math.max(0, l1 * l1 - x * x));
        let px = ik.pole[0], py = ik.pole[1], pz = ik.pole[2]; const pd = px * dx + py * dy + pz * dz; px -= dx * pd; py -= dy * pd; pz -= dz * pd; let pn = Math.hypot(px, py, pz);
        if (pn < 1e-4) { px = P[b * 3] - ax; py = P[b * 3 + 1] - ay; pz = P[b * 3 + 2] - az; const q = px * dx + py * dy + pz * dz; px -= dx * q; py -= dy * q; pz -= dz * q; pn = Math.hypot(px, py, pz) || 1; }
        px /= pn; py /= pn; pz /= pn;
        const ex = ax + dx * x + px * hgt, ey = ay + dy * x + py * hgt, ez = az + dz * x + pz * hgt, wx = ax + dx * dist, wy = ay + dy * dist, wz = az + dz * dist;
        // upper bone: swing its current direction onto the new one
        vrot(S, 48, G, a4, off[b * 3], off[b * 3 + 1], off[b * 3 + 2]); let n = 1 / (Math.hypot(S[48], S[49], S[50]) || 1);
        qarc(S, 12, S[48] * n, S[49] * n, S[50] * n, (ex - ax) / l1, (ey - ay) / l1, (ez - az) / l1);
        qmul(S, 16, S, 12, G, a4);                                  // new G[a]
        qmul(S, 20, S, 12, G, b4);                                  // G[b] carried along
        vrot(S, 48, S, 20, off[e * 3], off[e * 3 + 1], off[e * 3 + 2]); n = 1 / (Math.hypot(S[48], S[49], S[50]) || 1);
        qarc(S, 24, S[48] * n, S[49] * n, S[50] * n, (wx - ex) / l2, (wy - ey) / l2, (wz - ez) / l2);
        qmul(S, 20, S, 24, S, 20);                                  // new G[b]
        if (w >= 0.999) { qcp(G, a4, S, 16); qcp(G, b4, S, 20); qcp(G, e4, S, 8); }
        else { qslerp(G, a4, G, a4, S, 16, w); qslerp(G, b4, G, b4, S, 20, w); if (ik.rot) qcp(G, e4, S, 8); }
        vrot(P, b * 3, G, a4, off[b * 3], off[b * 3 + 1], off[b * 3 + 2]); P[b * 3] += ax; P[b * 3 + 1] += ay; P[b * 3 + 2] += az;
        vrot(P, e * 3, G, b4, off[e * 3], off[e * 3 + 1], off[e * 3 + 2]); P[e * 3] += P[b * 3]; P[e * 3 + 1] += P[b * 3 + 1]; P[e * 3 + 2] += P[b * 3 + 2];
        c._prop(ik.list, b, e);
      }
      // 4 aim constraints
      for (const A of c.aims) {
        if (A.weight <= 0 || !c._target(A.target, tv, ext)) continue; const i = A.i, a = i * 4;
        let dx = tv.x - P[i * 3], dy = tv.y - P[i * 3 + 1], dz = tv.z - P[i * 3 + 2]; const n = Math.hypot(dx, dy, dz); if (n < 1e-5) continue;
        vrot(S, 48, G, a, A.axis[0], A.axis[1], A.axis[2]); qarc(S, 0, S[48], S[49], S[50], dx / n, dy / n, dz / n); qmul(S, 4, S, 0, G, a);
        if (A.weight >= 0.999) qcp(G, a, S, 4); else qslerp(G, a, G, a, S, 4, A.weight);
        c._prop(A.list, -1, -1);
      }
      // 5 look-at: neck + head, in the chest's frame, with limits; the rest goes to the eyes
      const L = c.look, iH = c.iHead;
      if (iH !== undefined) {
        let yaw = 0, pitch = 0, ry = 0, rp = 0;
        if (L.target && L.weight > 0 && c._target(L.target, tv, ext)) {
          const pc = c.iChest !== undefined ? c.iChest : par[iH];
          vrotc(S, 48, G, pc * 4, tv.x - P[iH * 3], tv.y - P[iH * 3 + 1] - 0.09 * c.size, tv.z - P[iH * 3 + 2]);
          ry = Math.atan2(S[48], S[50]) / DEG; rp = Math.atan2(S[49], Math.hypot(S[48], S[50])) / DEG;
          yaw = Math.max(-L.yaw, Math.min(L.yaw, ry)) * L.weight; pitch = Math.max(-L.pitch, Math.min(L.pitch, rp)) * L.weight;
        }
        const k = 1 - Math.exp(-L.speed * dt); L._y += (yaw - L._y) * k; L._p += (pitch - L._p) * k;
        if (L.target) { L.eyeX = Math.max(-1, Math.min(1, (ry - L._y) / 30)); L.eyeY = Math.max(-1, Math.min(1, (rp - L._p) / 22)); } else { L.eyeX = 0; L.eyeY = 0; }
        if (Math.abs(L._y) > 0.05 || Math.abs(L._p) > 0.05) {
          const iN = c.iNeck, ns = iN !== undefined ? L.neck : 0;
          if (iN !== undefined) { qeuler(S, 0, 0, L._y * ns, 0); qeuler(S, 4, -L._p * ns, 0, 0); qmul(S, 0, S, 0, S, 4); qmul(S, 4, G, par[iN] * 4, S, 0); qmul(G, iN * 4, S, 4, d, iN * 4);
            vrot(P, iH * 3, G, iN * 4, off[iH * 3] + dp[iH * 3], off[iH * 3 + 1] + dp[iH * 3 + 1], off[iH * 3 + 2] + dp[iH * 3 + 2]); P[iH * 3] += P[iN * 3]; P[iH * 3 + 1] += P[iN * 3 + 1]; P[iH * 3 + 2] += P[iN * 3 + 2]; }
          qeuler(S, 0, 0, L._y * (1 - ns), 0); qeuler(S, 4, -L._p * (1 - ns), 0, 0); qmul(S, 0, S, 0, S, 4); qmul(S, 4, G, par[iH] * 4, S, 0); qmul(G, iH * 4, S, 4, d, iH * 4);
          c._prop(c.desc(iN !== undefined ? iN : iH), iH, -1);
        }
      }
      // 6 forearm twist helpers: half of the hand's twist about the forearm
      for (const t of c.twist) { const f4 = t.f * 4, h = t.h; qmulc(S, 0, G, f4, G, h * 4);
        const ax = c.dir[t.f * 3], ay = c.dir[t.f * 3 + 1], az = c.dir[t.f * 3 + 2], pr = S[0] * ax + S[1] * ay + S[2] * az; let w = S[3]; if (w < 0) w = -w;
        const sg = S[3] < 0 ? -1 : 1, ang = Math.atan2(pr * sg, w); qaxis(S, 4, ax, ay, az, ang / DEG);       // half angle = full/2
        qmul(G, t.t * 4, G, f4, S, 4); }
      // 7 springs
      c._acc += dt; let steps = Math.floor(c._acc / (1 / 120)); c._acc -= steps / 120; if (steps > 8) { steps = 8; c._acc = 0; }
      const rq = c._rq, rp0 = c._rp, rs = c._rs, hh = 1 / 120;
      for (const ch of c.springs) {
        const om = ch.freq * 2 * PI, cl = Math.cos(ch.limit * DEG);
        for (let j = 0; j < ch.n; j++) {
          const i = ch.b[j], p = par[i], j3 = j * 3, x = ch.x, v = ch.v, len = ch.len[j] * rs;
          if (j > 0) { vrot(P, i * 3, G, p * 4, off[i * 3], off[i * 3 + 1], off[i * 3 + 2]); P[i * 3] += P[p * 3]; P[i * 3 + 1] += P[p * 3 + 1]; P[i * 3 + 2] += P[p * 3 + 2]; }
          // head and rest direction in the world
          vrot(S, 48, rq, 0, P[i * 3] * c._bs[0] * rs, P[i * 3 + 1] * c._bs[1] * rs, P[i * 3 + 2] * c._bs[2] * rs); const hx = S[48] + rp0[0], hy = S[49] + rp0[1], hz = S[50] + rp0[2];
          vrot(S, 52, G, p * 4, ch.tv[j3], ch.tv[j3 + 1], ch.tv[j3 + 2]); const mx = S[52], my = S[53], mz = S[54];   // model-space rest direction, carried
          vrot(S, 56, rq, 0, mx, my, mz); const rx = S[56], ry2 = S[57], rz = S[58];
          const tx = hx + rx * len, ty = hy + ry2 * len, tz = hz + rz * len;
          if (!ch.init || Math.hypot(x[j3] - tx, x[j3 + 1] - ty, x[j3 + 2] - tz) > 1.5 * rs) { x[j3] = tx; x[j3 + 1] = ty; x[j3 + 2] = tz; v[j3] = 0; v[j3 + 1] = 0; v[j3 + 2] = 0; }
          const fj = 1 + 0.35 * (ch.n - 1 - j) / Math.max(1, ch.n), k = om * om * fj * fj, cd = 2 * ch.damp * om * fj;
          for (let s = 0; s < steps; s++) {
            v[j3] += (k * (tx - x[j3]) - cd * v[j3]) * hh; v[j3 + 1] += (k * (ty - x[j3 + 1]) - cd * v[j3 + 1] - 9.8 * ch.gravity * rs) * hh; v[j3 + 2] += (k * (tz - x[j3 + 2]) - cd * v[j3 + 2]) * hh;
            x[j3] += v[j3] * hh; x[j3 + 1] += v[j3 + 1] * hh; x[j3 + 2] += v[j3 + 2] * hh;
          }
          let ux = x[j3] - hx, uy = x[j3 + 1] - hy, uz = x[j3 + 2] - hz, un = Math.hypot(ux, uy, uz) || 1; ux /= un; uy /= un; uz /= un;
          let cs = ux * rx + uy * ry2 + uz * rz;
          if (cs < cl) { // outside the cone: pull back onto it
            let ox = ux - rx * cs, oy = uy - ry2 * cs, oz = uz - rz * cs; const on = Math.hypot(ox, oy, oz) || 1, sl = Math.sqrt(1 - cl * cl); ux = rx * cl + ox / on * sl; uy = ry2 * cl + oy / on * sl; uz = rz * cl + oz / on * sl;
            const vr = v[j3] * ox / on + v[j3 + 1] * oy / on + v[j3 + 2] * oz / on; if (vr > 0) { v[j3] -= ox / on * vr; v[j3 + 1] -= oy / on * vr; v[j3 + 2] -= oz / on * vr; } }
          x[j3] = hx + ux * len; x[j3 + 1] = hy + uy * len; x[j3 + 2] = hz + uz * len;
          const vd = v[j3] * ux + v[j3 + 1] * uy + v[j3 + 2] * uz; v[j3] -= ux * vd; v[j3 + 1] -= uy * vd; v[j3 + 2] -= uz * vd;   // keep the length: no radial speed
          vrotc(S, 48, rq, 0, ux, uy, uz); qarc(S, 0, mx, my, mz, S[48], S[49], S[50]); qmul(G, i * 4, S, 0, G, p * 4);
        }
        ch.init = true;
      }
      // 8 write the bones: local = conj(Mp) * conj(Gp) * G * M
      const M = c.M, Mp = c.Mp, bones = c.bones;
      for (let i = 0; i < nb; i++) { const p = par[i], a = i * 4, bn = bones[i];
        if (p < 0) qmul(S, 0, G, a, M, a); else { qmulc(S, 4, G, p * 4, G, a); qmul(S, 0, S, 4, M, a); }
        qmulc(S, 4, Mp, a, S, 0); bn.quaternion.set(S[4], S[5], S[6], S[7]);
        const b = i * 3, mv = dp[b] !== 0 || dp[b + 1] !== 0 || dp[b + 2] !== 0;
        if (mv || c.moved[i]) { const r = c.inst.rest[c.names[i]].pos; vrotc(S, 48, Mp, a, dp[b], dp[b + 1], dp[b + 2]); bn.position.set(r.x + S[48], r.y + S[49], r.z + S[50]); c.moved[i] = mv ? 1 : 0; }
        if (c.scaled[i]) { bn.scale.set(1, 1, 1); c.scaled[i] = 0; }
      }
      // 9 squash & stretch: whole body on the root (feet stay on the ground), head on the head bone
      if (c.iRoot !== undefined && Math.abs(body - 1) > 1e-4) { const i = c.iRoot; qmul(S, 0, G, i * 4, M, i * 4); vrotc(S, 48, S, 0, 0, 1, 0); stretchScale(bones[i].scale, body, S[48], S[49], S[50], true); c.scaled[i] = 1; }
      if (iH !== undefined && Math.abs(head - 1) > 1e-4) { vrotc(S, 48, M, iH * 4, 0, 1, 0); stretchScale(bones[iH].scale, head, S[48], S[49], S[50], true); c.scaled[iH] = 1; }
      // 10 smears: stretch fast hands / feet along their motion, feed the ribbon trails
      const sm = c.smear;
      if (dt > 0) for (const s of c._sm) {
        const i = s.i, x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; let vx = (x - s.px) / dt, vy = (y - s.py) / dt, vz = (z - s.pz) / dt; s.px = x; s.py = y; s.pz = z;
        if (!s.ok) { s.ok = true; continue; }
        const sp = Math.hypot(vx, vy, vz), want = sm.on ? Math.max(0, Math.min(1, (sp - sm.v0) / (sm.v1 - sm.v0))) : 0;
        s.amt = want > s.amt ? want : s.amt + (want - s.amt) * Math.min(1, dt * 18);
        if (s.amt > 0.02 && sp > 1e-3) { vx /= sp; vy /= sp; vz /= sp; qmul(S, 0, G, i * 4, M, i * 4); vrotc(S, 48, S, 0, vx, vy, vz); stretchScale(bones[i].scale, 1 + sm.max * s.amt, S[48], S[49], S[50], false); c.scaled[i] = 1; }
        if (sm.trail && Trails.mesh) { if (s.slot < 0) s.slot = Trails.slot();
          if (s.slot >= 0) { vrot(S, 52, G, i * 4, c.dir[i * 3] * 0.07 * c.size, c.dir[i * 3 + 1] * 0.07 * c.size, c.dir[i * 3 + 2] * 0.07 * c.size);
            vrot(S, 48, rq, 0, (P[i * 3] + S[52]) * c._bs[0] * rs, (P[i * 3 + 1] + S[53]) * c._bs[1] * rs, (P[i * 3 + 2] + S[54]) * c._bs[2] * rs);
            Trails.feed(s.slot, S[48] + rp0[0], S[49] + rp0[1], S[50] + rp0[2], want > 0.12, sm.color, 0.085 * c.size * rs); } }
      }
    }
  };
  Char._ext = { v: false };

  // ============================================================================================================
  // Trails: smear ribbons for every character, ONE draw (an ink ribbon under a fill ribbon, tapered crescents)
  // ============================================================================================================
  const Trails = {
    mesh: null, K: 10, SEG: 12, LIFE: 0.11, n: 0, used: 0, time: 0,
    init(max, o){
      if (this.mesh) return this.mesh; const T = THREE, n = this.n = max || 12, K = this.K, SEG = this.SEG, vper = (SEG + 1) * 4;
      this.s = []; for (let i = 0; i < n; i++) this.s.push({ p: new F(K * 3), t: new F(K).fill(-9), h: 0, on: false, live: false, last: -9, col: new F([1, 1, 1]), w: 0.085 });
      const g = new T.BufferGeometry(); this.pos = new F(n * vper * 3); this.col = new F(n * vper * 4); const ix = [];
      for (let s = 0; s < n; s++) for (let layer = 0; layer < 2; layer++) { const b = s * vper + layer * (SEG + 1) * 2; for (let k = 0; k < SEG; k++) { const a = b + k * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
      g.setAttribute('position', new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage)); g.setAttribute('color', new T.BufferAttribute(this.col, 4).setUsage(T.DynamicDrawUsage)); g.setIndex(ix);
      const mat = new T.ShaderMaterial({ name: 'sj_trail', transparent: true, depthWrite: false, side: T.DoubleSide,
        vertexShader: 'attribute vec4 color; varying vec4 vC; void main(){ vC = color; gl_Position = projectionMatrix * viewMatrix * vec4( position, 1.0 ); }',
        fragmentShader: 'varying vec4 vC; void main(){ gl_FragColor = vC; }' });
      const m = this.mesh = new T.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 20; m.name = 'rig_trails'; m.visible = false;
      this.ink = new T.Color(typeof Toon !== 'undefined' && Toon.ink ? Toon.ink : '#1E1B2E'); this._c = new T.Color(); this._cam = new T.Vector3();
      this._upd = dt => this.update(dt); if (!(o && o.manual) && typeof GFX !== 'undefined' && GFX.addUpdater) GFX.addUpdater(this._upd);
      return m;
    },
    slot(){ return this.mesh && this.used < this.n ? this.used++ : -1; },
    clear(){ if (!this.mesh) return; for (const s of this.s) { s.t.fill(-9); s.on = false; s.live = false; } this.pos.fill(0); this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.visible = false; },
    feed(i, x, y, z, fast, color, w){
      const s = this.s[i], K = this.K; if (!fast && !s.live) { s.p[s.h * 3] = x; s.p[s.h * 3 + 1] = y; s.p[s.h * 3 + 2] = z; s.t[s.h] = this.time; return; }   // idle: keep one fresh point
      s.h = (s.h + 1) % K; s.p[s.h * 3] = x; s.p[s.h * 3 + 1] = y; s.p[s.h * 3 + 2] = z; s.t[s.h] = this.time; s.live = true; s.w = w;
      if (fast) { s.on = true; s.last = this.time; if (color) { this._c.set(color); s.col[0] = this._c.r; s.col[1] = this._c.g; s.col[2] = this._c.b; } }
    },
    update(dt, cam){
      if (!this.mesh) return; this.time += dt; cam = cam || (typeof GFX !== 'undefined' && GFX.camera); if (!cam) return;
      const K = this.K, SEG = this.SEG, vper = (SEG + 1) * 4, pos = this.pos, col = this.col, now = this.time, LIFE = this.LIFE; let any = false;
      cam.getWorldPosition(this._cam); const cx = this._cam.x, cy = this._cam.y, cz = this._cam.z, ik = this.ink;
      for (let si = 0; si < this.n; si++) {
        const s = this.s[si], base = si * vper; if (!s.live) continue;
        // how many samples are still young: newest first
        let cnt = 0; for (let k = 0; k < K; k++) { const j = (s.h - k + K) % K; if (now - s.t[j] <= LIFE && s.t[j] > -1) cnt++; else break; }
        if (cnt < 2 || !s.on || now - s.last > LIFE) { s.live = false; s.on = false; for (let k = base * 3; k < (base + vper) * 3; k++) pos[k] = 0; continue; }
        any = true;
        for (let k = 0; k <= SEG; k++) {
          const u = k / SEG, f = (1 - u) * (cnt - 1), i0 = Math.floor(f), fr = f - i0;                // u = 0 the tail, 1 the head
          const ja = (s.h - Math.min(cnt - 1, i0 + 1) + K) % K, jb = (s.h - i0 + K) % K, jp = (s.h - Math.min(cnt - 1, i0 + 2) + K) % K, jn = (s.h - Math.max(0, i0 - 1) + K) % K, p = s.p, t = 1 - fr;
          // Catmull-Rom between a (older) and b (newer)
          const t2 = t * t, t3 = t2 * t, w0 = -0.5 * t3 + t2 - 0.5 * t, w1 = 1.5 * t3 - 2.5 * t2 + 1, w2 = -1.5 * t3 + 2 * t2 + 0.5 * t, w3 = 0.5 * t3 - 0.5 * t2;
          const x = p[jp * 3] * w0 + p[ja * 3] * w1 + p[jb * 3] * w2 + p[jn * 3] * w3, y = p[jp * 3 + 1] * w0 + p[ja * 3 + 1] * w1 + p[jb * 3 + 1] * w2 + p[jn * 3 + 1] * w3, z = p[jp * 3 + 2] * w0 + p[ja * 3 + 2] * w1 + p[jb * 3 + 2] * w2 + p[jn * 3 + 2] * w3;
          let tx = p[jb * 3] - p[ja * 3], ty = p[jb * 3 + 1] - p[ja * 3 + 1], tz = p[jb * 3 + 2] - p[ja * 3 + 2];
          const vx = cx - x, vy = cy - y, vz = cz - z; let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx; const sn = Math.hypot(sx, sy, sz) || 1;
          const wd = s.w * Math.pow(u, 0.75) * (1 - 0.25 * u), wi = wd + (u > 0.02 ? 0.014 : 0); sx /= sn; sy /= sn; sz /= sn;
          let o = (base + k * 2) * 3; pos[o] = x + sx * wi; pos[o + 1] = y + sy * wi; pos[o + 2] = z + sz * wi; pos[o + 3] = x - sx * wi; pos[o + 4] = y - sy * wi; pos[o + 5] = z - sz * wi;
          o = (base + (SEG + 1) * 2 + k * 2) * 3; pos[o] = x + sx * wd; pos[o + 1] = y + sy * wd; pos[o + 2] = z + sz * wd; pos[o + 3] = x - sx * wd; pos[o + 4] = y - sy * wd; pos[o + 5] = z - sz * wd;
          let c4 = (base + k * 2) * 4; col[c4] = ik.r; col[c4 + 1] = ik.g; col[c4 + 2] = ik.b; col[c4 + 3] = 1; col[c4 + 4] = ik.r; col[c4 + 5] = ik.g; col[c4 + 6] = ik.b; col[c4 + 7] = 1;
          c4 = (base + (SEG + 1) * 2 + k * 2) * 4; col[c4] = s.col[0]; col[c4 + 1] = s.col[1]; col[c4 + 2] = s.col[2]; col[c4 + 3] = 1; col[c4 + 4] = s.col[0]; col[c4 + 5] = s.col[1]; col[c4 + 6] = s.col[2]; col[c4 + 7] = 1;
        }
      }
      const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; this.mesh.visible = any;
    }
  };

  const _aq = { a: null, b: null, v: null };
  return {
    POSES, HANDS, GROUPS, Trails, Layer, Char,
    create(inst, o){ return new Char(inst, o); },
    definePose(name, data){ POSES[name] = data; return data; },
    mirror(p){
      const src = typeof p === 'string' ? POSES[p] : p, sw = n => /_L$/.test(n) ? n.slice(0, -1) + 'R' : /_R$/.test(n) ? n.slice(0, -1) + 'L' : n, out = {};
      if (src.use) out.use = src.use;
      if (src.bones) { out.bones = {}; for (const n in src.bones) { const v = src.bones[n], sided = /_[LR]$/.test(n);
        out.bones[sw(n)] = Array.isArray(v) ? (v.length === 4 ? [v[0], -v[1], -v[2], v[3]] : [v[0], -v[1], -v[2]]) : { bend: v.bend, twist: v.twist == null ? undefined : (sided ? -v.twist : v.twist), r: v.r ? [v.r[0], -v.r[1], -v.r[2]] : undefined }; } }
      if (src.move) { out.move = {}; for (const n in src.move) { const v = src.move[n]; out.move[sw(n)] = [-v[0], v[1], v[2]]; } }
      if (src.hands) out.hands = typeof src.hands === 'string' || src.hands.index ? src.hands : { L: src.hands.R, R: src.hands.L };
      if (src.squash) out.squash = src.squash;
      return out;
    },
    channel(v){ return new Chan(v); },
    clock(bpm){ return { bpm: bpm || 120, beat: 0, tick(dt){ this.beat += dt * this.bpm / 60; return this.beat; } }; },
    // point a loose prop's local axis at a world position (minimal rotation from where it is)
    aimObject(obj, target, axis){
      const T = THREE; if (!_aq.a) { _aq.a = new T.Quaternion(); _aq.b = new T.Quaternion(); _aq.v = new T.Vector3(); _aq.w = new T.Vector3(); _aq.u = new T.Vector3(); }
      obj.updateWorldMatrix(true, false); obj.getWorldQuaternion(_aq.a); _aq.u.set(axis ? axis[0] : 0, axis ? axis[1] : 1, axis ? axis[2] : 0).normalize();
      _aq.v.copy(_aq.u).applyQuaternion(_aq.a); _aq.w.setFromMatrixPosition(obj.matrixWorld); _aq.w.subVectors(target, _aq.w).normalize();
      _aq.b.setFromUnitVectors(_aq.v, _aq.w).multiply(_aq.a);                 // new world orientation
      if (obj.parent) { obj.parent.getWorldQuaternion(_aq.a); _aq.b.premultiply(_aq.a.invert()); }
      obj.quaternion.copy(_aq.b);
    }
  };
})();
