# Strum Jam 3D pipeline

How a character goes from a Python art script to a posed, lit, outlined figure on the stage. The contract between the two
halves is `art/ASSET_SPEC.md`; read that for the exact names and numbers. The 2D game does not use any of this yet: the
engine modules are in the build but nothing runs until `GFX.init(canvas)` is called.

```
art/chars/<name>.py --tools/art.sh--> vendor/models/<name>.glb --build.py--> <script id="sj-model-<name>">
      (sjart: Human, outfit, rig)        (committed, validated)                     |
                                                                   Assets.load() / Assets.spawn(name)
                                                                   Rig.create(inst)   FaceDecal.create(inst, spec)
                                                                   GFX.render(dt)  (Toon shader + ink hull, StageKit, VFX)
```

## 1. Set up

```
tools/setup-art.sh                 # once: Blender as a Python module in /opt/sj-bpy (SJ_BPY=<dir> to move it)
tools/build-three.sh               # only when three's version or tools/three-entry.js changes (the bundle is committed)
export NODE_PATH=$(npm root -g)    # Playwright, for every test/*.js render script
```

## 2. Write the art script

`art/chars/<name>.py` (props: `art/props/`, venues: `art/venues/`). `art/chars/mannequin.py` is the template:

```python
from sjart import *
from sjart import outfit

def build():
    reset()
    h = Human(HumanSpec())                      # proportions: every field is in sjart/human.py (height, head, limbs, hands...)
    ch = Character('hero', h, skin='#F2B48C')   # one joined skinned mesh on the SJ rig
    outfit.trousers(ch, '#2E3A66'); outfit.tee(ch, '#F25C3B')
    outfit.sneakers(ch, upper='#FFC93C', sole='#FFFFFF')
    outfit.hair_cap(ch, '#3A2B52', sweep=-0.6)
    outfit.tuft(ch, 'Forelock', '#3A2B52', points, radii, spring='forelock')   # -> spr_forelock_1..3, simulated at runtime
    return ch

build().export()                                # -> vendor/models/hero.glb + art/reports/hero.json, validated
```

Rules that matter: colours are flat sRGB hex in vertex colour (no textures); the material NAME picks the shading class;
garments are built on the body cage so they inherit its skin weights (they never tear); 8-14k triangles; names use only
`[A-Za-z0-9_]`. Props are rigid meshes with named empties for the runtime (`grip_*`, `strap_*`); see `art/props/guitar.py`.
Lower-level modelling tools are in `sjart/cage.py` (quad control cages, shells for clothing) and `sjart/shapes.py`
(lofts, tubes, lathes, bevelled plates, booleans).

```
tools/art.sh art/chars/hero.py          # build + validate (non-zero exit on a spec violation)
tools/art.sh all                        # everything; the output is reproducible byte for byte
SJ_FBX=out/ tools/art.sh all            # FBX twins
tools/artshot.sh vendor/models/hero.glb out.png turn h=1600        # quick look without the engine (turn hands game poses closeups)
tools/art.sh art/preview/poses.py out.glb hero && tools/artshot.sh out.glb p.png closeups   # deformation at the joints
```

## 3. Look at it in the real engine

```
node test/modelshot.js hero <outdir>    # turntable, 4 close-ups, lit stage at 1280x665 and 390x844, hero-info.json (2-4 min)
node test/rigshot.js <outdir> [faces,sheet,stage,poses,perf]   # the animation + face toolkit on the mannequin (40 s);
                                        # rig-hold.png = the guitar hold close up from three sides
node test/gfxdemo.js <outdir>           # full stage per tier; writes dist/gfxdemo.html
python3 build.py "<hosted url>" && SIZES=1280x665,390x844 node test/uishot.js <outdir>   # the 2D game must still be fine
```

`<name>-info.json` must have `warnings: []`. Always open the PNGs: the big sheet for form and line, the two stage shots for
what the player actually sees (a character is about 200 px tall on the laptop, 150 px on the phone).

## 4. Runtime cheat-sheet (all globals, one scope, classic scripts)

```js
await Assets.load();                                   // parse every embedded model once
GFX.init(canvas, { tier: 'medium' });                  // low | medium | high; auto-degrades on slow frames
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 200);
GFX.setScene(scene, cam);                              // lights, floor, backdrop: StageKit (see test/gfxstage.js)

const hero = Assets.spawn('hero', { faceSize: 512 });  // { root, bones, rest, face, attach(), setInk(), ... }
scene.add(hero.root);
const rig = Rig.create(hero), face = FaceDecal.create(hero, 'hero');
const gtr = Assets.spawn('guitar'); gtr.root.rotation.set(0.1, -0.12, 0.5);
hero.attach(gtr.root, 'att_hip', { pos: [-0.03, 0.1, 0.075] });

rig.layer('body', { mask: 'body' }).loop([              // keys are in BEATS; a move ENDS on its beat
  { at: 0, pose: 'bob_down', in: 0.15, ease: 'hit', over: 0.35, settle: 0.4 },
  { at: 0.5, pose: 'bob_up', in: 0.3, ease: 'snap' }], 1);
rig.layer('arms', { mask: 'arms' }).to('guitar_hold', { in: 0 });
rig.ik('arm_L', { target: gtr.root.getObjectByName('grip_fret'), tip: 'att_hand_L', pole: [0.5, -1, -0.3], rot: [-10, -100, 62] });
const strum = rig.ik('arm_R', { target: gtr.root.getObjectByName('grip_strum'), tip: 'att_hand_R', pole: [-1, -0.1, 0.7], rot: [20, 75, -30] });
rig.plant('foot_L'); rig.plant('foot_R'); rig.lookAt(cam.position);

function frame(beat, dt){                               // beat = the music clock
  rig.update(beat, dt); face.look(rig.look.eyeX, -rig.look.eyeY); face.update(dt); GFX.render(dt);
}
// on a beat:  rig.bounce(-0.05); rig.kick(0.7); face.set('hype'); GFX.beat(1); VFX.hit(pos, 'perfect');
```

- **Poses** are plain data: per-bone MODEL-SPACE deltas (Euler degrees, quaternion or `{bend, twist}`), `move`, `hands`,
  `squash`. A name without `_L` / `_R` is mirrored to both sides. `Rig.POSES` (25), `Rig.definePose`, `Rig.HANDS` (open,
  relax, fist, pick, fret, stick, mic, point, rock). Bone rolls are not standardised: never write local rotations.
- **Keys**: `in` (beats of travel before the beat), `ease` (`snap`, `hit`, `smooth`, `linear`, `step`), `antic`, `over` +
  `settle`, `follow` (+ `lead: true` so the END of the chain lands on the beat), `tag` -> `rig.onKey`.
  `Rig.channel(v)` runs one number on the same system (IK offsets, weights, props).
- **IK holds**: a grip empty marks the surface; the palm bone is about 8 cm up the hand, so offset the target
  (`ik.offset`) and choose the `pole` so the forearm passes in FRONT of the instrument. Check with `rig-hold.png`.
- **Face**: `face.set(preset, {snap, hold})` (21 presets), `face.mouth(shape)` (18), `face.blink()`; specs in
  `FaceDecal.SPECS` or your own object (eyes, brows, mouth, teeth, extras). Redraws only on change (~1 a second idle).
- **Look**: `Toon.cls.<class>` (shade, rim, spec, sheen, term, emit, beat, recv) then `Toon.applyClasses()`; scene mood with
  `StageKit.rig(name)` / `Toon.look({...})`. Skin and face take no cast shadows by design (`recv: 0`).
- Each `src/5x-*.js` file starts with its full API and an example; `test/rigdemo.js` is the worked example (a guitarist
  and a drummer at 120 bpm).

## 5. Budgets

| | low (old phones) | medium (phones, laptops) | high |
|---|---|---|---|
| ceiling: draws / triangles over all passes, full stage | 70 / 250k | 130 / 450k | - |
| measured: 5 characters + crowd + venue + VFX | 39 / 235k | 82 / 370k | 95 / 439k |
| a character | fill + ink + face | the same, again in the shadow map and the mirror | the same, 4-tap shadows |

Per character: 8-14k triangles, at most 60 bones, 4 influences, one 256-512 px face canvas, no other textures. Rig + face
for five characters costs 0.1 ms a frame in headless Chromium. A prop should be 2 draws: join its parts (the guitar is 14
today because each string is a node). None of this has been timed on a real phone: software GL says nothing about fill
rate, so the counts above are the budget until a device says otherwise.

## 6. iOS and Roblox

- **iOS**: a WKWebView build runs the web engine unchanged. Natively, the same `.glb` converts to USDZ for RealityKit /
  SceneKit; vertex-colour albedo, 4 influences and under 60 bones are within Metal skinning limits. The toon shader, the
  ink hull (`_SJOUT`, `_SJOUTW` are plain vertex attributes) and the face canvas (any 2D context to a texture) would be
  re-implemented; poses, keys, hand presets and face specs are engine-free data and port as they are.
- **Roblox**: `SJ_FBX=dir tools/art.sh all` writes FBX twins, and `art/ASSET_SPEC.md` has the SJ rig to R15 table. Still to
  write: `export_roblox` (T-pose re-rest, R15 part split under 10k triangles each, fingers baked into the hand, vertex
  colours to a small palette texture). Outlines become a Highlight or an inverted-hull MeshPart; the face a Decal driven
  from the same face spec.
- Keep assets engine-agnostic: no three.js-only extensions, no compression, nothing that depends on bone rolls.

## 7. Known gaps, most important first

1. The mannequin is a clean base, not a designed character: tube trousers, shell hair, plain shoulders, smallish hands.
   The band members still have to be designed and built on it.
2. No inner ink lines (creases, where an arm crosses the torso): only the silhouette hull and the face canvas.
3. Instrument holds are tuned by eye per prop and per character; there is no seated pose, bass or keys hold yet, and the
   drum sticks sink into the drum head at contact.
4. Stage lighting on dark cloth: the coloured spots still read as stripes on navy trousers at stage distance.
5. No timing on a real device; the tier watchdog thresholds are guesses.
6. The floor mirror is soft, mirrors the venue too and has no clip plane.
7. No `export_roblox`; nothing is wired into the game (`#stage3d` behind a flag is the next step).
