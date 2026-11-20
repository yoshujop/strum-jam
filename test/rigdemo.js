// Browser side of test/rigshot.js (inlined after the engine): RigDemo, the animation toolkit proving itself on the real
// engine. A guitarist (layers: bob + sway + guitar hold, hands IK'd to the worn guitar, strums on a channel, a fist pump
// with a smear in bar 2) and a drummer (sticks IK'd to two drums, strikes landing on the beat), 120 bpm, 8-beat loop.
// Only the public API: Rig, FaceDecal, Assets, GFX, Toon, StageKit, GfxTest.
const RigDemo = {
  bpm: 120, beat: 0, bn: -1, chars: [], errors: [],
  FACES: ['happy', 'cool', 'focus', 'smug', 'happy', 'wink', 'strain', 'hype'],        // the guitarist's face, per beat
  DFACES: ['focus', 'focus', 'yell', 'focus', 'cool', 'focus', 'angry', 'joy'],
  async init(o){
    o = o || {}; const T = THREE, D = this;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Assets.load();
    GFX.init(document.getElementById('c'), { tier: o.tier || 'medium', auto: false });
    const scene = D.scene = new T.Scene(), portrait = innerHeight > innerWidth, cam = D.cam = new T.PerspectiveCamera(portrait ? 34 : 30, innerWidth / innerHeight, 0.1, 200);
    GFX.setScene(scene, cam);
    if (o.venue === 'stage') { GfxTest.stage(scene); if (portrait) { cam.position.set(0.1, 1.5, 9.2); cam.lookAt(0.1, 1.0, 0); } else { cam.position.set(0, 1.5, 6.4); cam.lookAt(0, 1.15, 0); } }
    else { GfxTest.studio(scene); cam.position.set(0, 1.25, 6.2); cam.lookAt(0, 0.98, 0); GFX.shadow.center = new T.Vector3(0, 1, 0); GFX.shadow.radius = 3; }
    cam.updateMatrixWorld(true);
    if (o.trails !== false) scene.add(Rig.Trails.init(12, { manual: true }));
    D.guitarist(o.solo ? 0 : -0.75, o); if (!o.solo) D.drummer(0.95, o);
    return D;
  },

  guitarist(x, o){
    const D = this, T = THREE, m = Assets.spawn('mannequin', { faceSize: o.faceSize || 512 }); m.root.position.set(x, 0, 0); D.scene.add(m.root); StageKit.blob(m.root, 0.42);
    const rig = Rig.create(m), face = FaceDecal.create(m, 'hero');
    const gtr = Assets.spawn('guitar'), th = 0.5; gtr.root.rotation.set(0.1, -0.12, th);
    m.attach(gtr.root, 'att_hip', { pos: [-0.03, 0.1, 0.075] });
    // layers: the groove underneath, the playing on top
    rig.layer('body', { mask: 'body' }).loop([
      { at: 0, pose: 'bob_down', in: 0.15, ease: 'hit', over: 0.35, settle: 0.4, follow: 0.03 },
      { at: 0.5, pose: 'bob_up', in: 0.3, ease: 'snap', follow: 0.03 }], 1);
    rig.layer('sway', { mask: 'torso,head', mode: 'add' }).loop([
      { at: 0, pose: 'sway_L', in: 0.28, over: 0.3, settle: 0.5, follow: 0.05 },
      { at: 2, pose: 'sway_R', in: 0.28, over: 0.3, settle: 0.5, follow: 0.05 }], 4);
    rig.layer('arms', { mask: 'arms' }).to('guitar_hold', { in: 0 });
    // the big move of bar 2: wind up on 6, fist in the air on 7, back on the strings for the next 1
    rig.layer('big', { mask: 'arm_R,hand_R,chest,head', mode: 'over' }).loop([
      { at: 7, pose: 'fist_pump', in: 0.3, antic: 0.35, over: 0.3, settle: 0.4, follow: 0.035, lead: true, tag: 'pump' },
      { at: 7.98, pose: { use: 'guitar_hold', bones: { chest: [0, 0, 0], head: [0, 0, 0] } }, in: 0.3, ease: 'hit' }], 8);
    rig.layerBy.big.weight = 0;
    rig.plant('foot_L'); rig.plant('foot_R');
    const fret = rig.ik('arm_L', { target: gtr.root.getObjectByName('grip_fret'), tip: 'att_hand_L', pole: [0.5, -1, -0.3], rot: [-10, -100, 62] });
    const strum = rig.ik('arm_R', { target: gtr.root.getObjectByName('grip_strum'), tip: 'att_hand_R', pole: [-1, -0.1, 0.7], rot: [20, 75, -30] });
    const sc = Rig.channel(-1).loop([{ at: 0, v: 1, in: 0.13, ease: 'hit', over: 0.25, settle: 0.25 }, { at: 0.5, v: -1, in: 0.15, ease: 'hit', over: 0.2, settle: 0.25 }], 1);
    const bw = Rig.channel(0).loop([{ at: 6.72, v: 1, in: 0.02 }, { at: 7.98, v: 0, in: 0.25, ease: 'smooth' }], 8);
    rig.lookAt(D.cam.position);
    rig.smear.color = '#F2B48C';
    rig.onKey = tag => { if (tag === 'pump' && typeof VFX !== 'undefined' && VFX.mesh) VFX.hit(rig.worldPos('hand_R', new T.Vector3()), 'perfect'); };
    const sx = Math.sin(th), cx = Math.cos(th);
    D.chars.push({ m, rig, face, faces: D.FACES, pre(beat){
      const s = sc.get(beat), w = bw.get(beat);      // the strum runs across the strings, centred on the pickups (the palm bone sits 8 cm up the hand)
      strum.offset.set(sx * (0.05 * s - 0.085), -cx * (0.05 * s - 0.085), 0.02); strum.weight = 1 - w; rig.layerBy.big.weight = w;
      rig.hand('R', w > 0.5 ? 'fist' : null);
    } });
  },

  drummer(x, o){
    const D = this, T = THREE, m = Assets.spawn('mannequin', { faceSize: o.faceSize || 512 }); m.root.position.set(x, 0, -0.1); m.root.rotation.y = -0.5; D.scene.add(m.root); StageKit.blob(m.root, 0.42);
    const rig = Rig.create(m), face = FaceDecal.create(m, 'cool');
    // two drums on stands and two sticks, straight from Toon
    const drum = (px, py, pz, r, col) => { const g = new T.Group(), d = Toon.mesh(new T.CylinderGeometry(r, r * 0.96, 0.16, 28), { cls: 'gloss', color: col }), s = Toon.mesh(new T.CylinderGeometry(r * 1.02, r * 1.02, 0.014, 28), { cls: 'toon', color: '#FFF7E6' }),
      l = Toon.mesh(new T.CylinderGeometry(0.02, 0.03, py - 0.08, 10), { cls: 'metal', color: '#b9bccb' });
      s.position.y = 0.085; l.position.y = -(py - 0.08) / 2 - 0.08; g.add(d, s, l); g.position.set(px, py, pz); m.root.add(g); return g; };
    drum(-0.3, 0.86, 0.5, 0.2, '#FF5E7E'); drum(0.28, 0.8, 0.48, 0.24, '#2EC4B6');
    // sticks: a group on each palm whose +Y runs to the tip (the grip is 10 cm from the butt); aimed every frame, after the rig
    const sticks = {};
    for (const s of ['L', 'R']) { const st = Toon.mesh(new T.CylinderGeometry(0.008, 0.013, 0.42, 8), { cls: 'toon', color: '#f1d9a8', outline: { px: 2 } });
      const h = new T.Group(); st.position.y = 0.11; h.add(st); m.bones['att_hand_' + s].add(h); sticks[s] = h; }
    rig.layer('body', { mask: 'body' }).loop([
      { at: 0, pose: 'bob_down', in: 0.15, ease: 'hit', over: 0.3, settle: 0.4, follow: 0.03 },
      { at: 0.5, pose: 'bob_up', in: 0.3, ease: 'snap', follow: 0.03 }], 1);
    rig.layer('bang', { mask: 'spine,head', mode: 'add' }).loop([
      { at: 2, pose: 'headbang_down', in: 0.16, ease: 'hit', over: 0.25, follow: 0.05 }, { at: 2.5, pose: 'headbang_up', in: 0.3, follow: 0.05 }, { at: 3.2, pose: 'rest', in: 0.3 },
      { at: 6, pose: 'headbang_down', in: 0.16, ease: 'hit', over: 0.25, follow: 0.05 }, { at: 6.5, pose: 'headbang_up', in: 0.3, follow: 0.05 }, { at: 7.2, pose: 'rest', in: 0.3 }], 8);
    rig.layer('arms', { mask: 'arms' }).to('sticks_ready', { in: 0 });
    rig.plant('foot_L'); rig.plant('foot_R');
    // The hands sit behind their drum; a channel per hand (1 = stick up, 0 = contact) slams them down ON the beat: wind-up
    // before (antic), contact exactly at the key, rebound after. The stick is aimed at a point that rises with the channel.
    const dR = [-0.3, 0.95, 0.5], dL = [0.28, 0.89, 0.48];
    const R = rig.ik('arm_R', { target: [dR[0] - 0.02, dR[1] + 0.09, dR[2] - 0.3], tip: 'att_hand_R', pole: [-0.9, -0.6, -0.5], rot: [30, 40, 0] });
    const L = rig.ik('arm_L', { target: [dL[0] + 0.02, dL[1] + 0.09, dL[2] - 0.3], tip: 'att_hand_L', pole: [0.9, -0.6, -0.5], rot: [30, -40, 0] });
    const hit = at => [{ at, v: 0, in: 0.24, ease: 'hit', antic: 1.1, tag: 'hit' }, { at: at + 0.2, v: 0.42, in: 0.18, ease: 'snap' }];
    const cr = Rig.channel(0.42).loop(hit(0).concat(hit(1), hit(2), hit(3)), 4), cl = Rig.channel(0.42).loop(hit(0.5).concat(hit(1.5), hit(2.5), hit(3), hit(3.5)), 4);
    const aimV = new T.Vector3(), hitV = new T.Vector3();
    const spark = d => () => { if (typeof VFX !== 'undefined' && VFX.mesh) VFX.burst(hitV.set(d[0], d[1], d[2]).applyMatrix4(m.root.matrixWorld), { count: 4, color: '#FFF7E6', speed: 1.4, size: 0.022, life: 0.22 }); };
    cr.onKey = spark(dR); cl.onKey = spark(dL);
    rig.smear.color = '#f1d9a8';
    D.chars.push({ m, rig, face, faces: D.DFACES,
      pre(beat){ const a = this.a = cr.get(beat), b = this.b = cl.get(beat);
        R.offset.set(0, a * 0.36, -a * 0.1); R.rot[0] = 30 - a * 70; L.offset.set(0, b * 0.36, -b * 0.1); L.rot[0] = 30 - b * 70; },
      post(){ Rig.aimObject(sticks.R, aimV.set(dR[0], dR[1] + this.a * 1.2, dR[2] - this.a * 0.25).applyMatrix4(m.root.matrixWorld)); Rig.aimObject(sticks.L, aimV.set(dL[0], dL[1] + this.b * 1.2, dL[2] - this.b * 0.25).applyMatrix4(m.root.matrixWorld)); } });
  },

  // one fixed step of the show. render: false = simulate only (the caller snapshots)
  step(dt, render){
    const D = this; D.beat += dt * D.bpm / 60; const bn = Math.floor(D.beat + 1e-6), on = bn !== D.bn; D.bn = bn;
    for (const ch of D.chars) {
      if (on) { ch.rig.bounce(bn % 2 ? -0.03 : -0.055); ch.rig.kick(bn % 2 ? 0.35 : 0.7); ch.face.set(ch.faces[bn % ch.faces.length]); }
      ch.pre(D.beat); ch.rig.update(D.beat, dt); if (ch.post) ch.post();
      ch.face.look(ch.rig.look.eyeX, -ch.rig.look.eyeY); ch.face.update(dt);
    }
    if (on) GFX.beat(bn % 4 === 0 ? 1 : 0.5);
    if (Rig.Trails.mesh) Rig.Trails.update(dt, D.cam);
    if (render !== false) GFX.render(dt);
  }
};
window.addEventListener('error', e => RigDemo.errors.push(e.message));
