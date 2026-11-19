// Browser-side helpers for the engine's test pages (inlined by test/gfxpage.js after the engine): GfxTest.
// A sample lit stage, camera framing, and a tiny procedural "groove" for SJ-rig characters, all on the public API.
const GfxTest = {
  // Camera that frames a box from an azimuth / elevation (degrees; az 0 = from the front, +Z).
  frame(cam, box, az, el, pad){
    const T = THREE, c = box.getCenter(new T.Vector3()), s = box.getSize(new T.Vector3());
    const vf = cam.fov * Math.PI / 360, hf = Math.atan(Math.tan(vf) * cam.aspect);
    const rw = 0.5 * Math.hypot(s.x, s.z), rh = 0.5 * s.y;
    const d = Math.max(rh / Math.tan(vf), rw / Math.tan(hf)) * (pad || 1.15) + rw;
    const a = az * Math.PI / 180, e = el * Math.PI / 180;
    cam.position.set(c.x + Math.sin(a) * Math.cos(e) * d, c.y + Math.sin(e) * d, c.z + Math.cos(a) * Math.cos(e) * d);
    cam.near = Math.max(0.02, d * 0.02); cam.far = d * 20 + 100; cam.lookAt(c); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  },
  // The sample stage: club rig, glossy plank floor, sky dome, (the "club" fixture when loaded), six coloured spots.
  stage(scene, o){
    o = o || {};
    StageKit.rig('club');
    const floor = StageKit.floor({ size: 60, color: '#34295f', gloss: 0.75, planks: 0.55, plankStrength: 0.2, sky: '#5a48c8', mirror: 0.5 });
    const sky = StageKit.backdrop({ top: '#0a0722', mid: '#24135c', bottom: '#120d2e', glow: '#6a2a9a', glowDir: [0, 0.2, -1], glowSize: 0.42 });
    scene.add(sky, floor);
    let venue = null;
    if (Assets.has('club')) { venue = Assets.spawn('club', { cast: false }); scene.add(venue.root); }
    const cols = ['#FF5E7E', '#2EC4B6', '#FFCE3A', '#7B5CF0', '#FF8FC7', '#6CC8FF'], xs = [-5, -3, -1, 1, 3, 5], spots = [];
    xs.forEach((x, i) => spots.push(StageKit.spot({ pos: [x, 5.35, -1.25], target: [x * 0.62, 0, 0.5], color: cols[i], angle: 13, intensity: i % 2 ? 0.9 : 1.15, beat: 0.5,
      sway: { x: 0.9, z: 0.5, speed: 0.55 + 0.07 * i, phase: i * 1.7 } })));
    scene.add(StageKit.group);
    GFX.shadow.center = new THREE.Vector3(0, 1, -0.5); GFX.shadow.radius = 7;
    return { floor, sky, venue, spots };
  },
  // A neutral studio for looking at one model: paper floor that takes the shadow, paper sky.
  studio(scene){
    StageKit.rig('studio');
    const floor = StageKit.floor({ size: 80, color: '#efe6d6', gloss: 0, mirror: 0, sky: '#efe6d6' });
    scene.add(floor);
    return { floor };
  },
  // A graphic test face on an sj_face decal (canvas centre = between the eyes, +x = the viewer's right).
  face(inst, variant){
    const f = inst.face; if (!f) return; const c = f.ctx, S = f.size, u = S / 256; variant = variant || 0;
    c.clearRect(0, 0, S, S); c.save(); c.translate(S / 2, S / 2); c.scale(u, u);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#1E1B2E'; c.fillStyle = '#1E1B2E';
    for (const sx of [-1, 1]) {
      c.beginPath(); c.ellipse(sx * 40, 4, 13, variant % 2 ? 9 : 19, 0, 0, 6.2832); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(sx * 40 - 4, -3, 4.5, 0, 6.2832); c.fill(); c.fillStyle = '#1E1B2E';
      c.lineWidth = 7; c.beginPath(); c.moveTo(sx * 22, -30 + (variant % 3) * 3); c.lineTo(sx * 58, -36 - (variant % 3) * 4); c.stroke();
    }
    c.lineWidth = 7; c.beginPath();
    if (variant % 2) { c.arc(0, 44, 20, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    else { c.moveTo(-24, 46); c.quadraticCurveTo(0, 78, 24, 46); c.closePath(); c.fillStyle = '#7a1f3d'; c.fill(); c.stroke(); }
    c.fillStyle = 'rgba(255,94,126,0.55)'; for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * 66, 30, 12, 7, 0, 0, 6.2832); c.fill(); }
    c.restore(); f.update();
  },
  // Pose-to-pose groove on the SJ rig using model-space deltas (never assumes bone axes): bob, sway, arm pump.
  _q: null, _e: null, _q2: null,
  groove(inst, t, phase, amount){
    const T = THREE; if (!this._q) { this._q = new T.Quaternion(); this._q2 = new T.Quaternion(); this._e = new T.Euler(); }
    const b = inst.bones, R = inst.rest; if (!b.hips) return;
    amount = amount == null ? 1 : amount;
    const beat = t * 2 + (phase || 0), f = beat - Math.floor(beat), hit = Math.pow(1 - f, 3);            // snappy: jump on the beat, ease back
    const side = Math.floor(beat) % 2 ? 1 : -1;
    const set = (name, x, y, z) => { if (!b[name]) return; this._q.setFromEuler(this._e.set(x * amount, y * amount, z * amount)).multiply(R[name].mQuat); inst.setBoneModelQuat(name, this._q); };
    b.hips.position.copy(R.hips.pos); b.hips.position.y -= 0.035 * hit * amount;
    set('hips', 0.03 * hit, 0.12 * side * (1 - f), 0.05 * side);
    set('spine', 0.06 * hit, 0.08 * side, 0.04 * side);
    set('chest', 0.08 * hit, 0.12 * side, 0.03 * side);
    set('head', -0.1 * hit + 0.05, -0.1 * side, -0.06 * side);
    set('upperarm_L', 0, 0, -0.5 - 0.35 * hit); set('forearm_L', -0.5, 0, -0.9 - 0.3 * hit);
    set('upperarm_R', 0, 0, 0.25 + 0.2 * hit * side); set('forearm_R', -0.7, 0, 0.5);
  }
};
