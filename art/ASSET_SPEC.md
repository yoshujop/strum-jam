# Strum Jam asset spec v1

The contract between the Blender art pipeline (`art/`, the `sjart` toolkit) and the three.js runtime.
`sjart.export.validate` checks every exported `.glb` against it and fails the build on a violation.
Reports of the committed assets are in `art/reports/<name>.json` (triangles, bones, joint rest positions, bounds).

## Pipeline

```
tools/setup-art.sh                      # once: python venv with Blender as a module (bpy), default /opt/sj-bpy
tools/art.sh art/chars/mannequin.py     # one asset -> vendor/models/mannequin.glb + art/reports/mannequin.json
tools/art.sh all                        # every script in art/chars, art/props, art/venues
SJ_FBX=out/ tools/art.sh all            # also write FBX twins (Roblox / other DCC import)
tools/artshot.sh vendor/models/mannequin.glb out.png turn h=1600     # look at it (sheets: turn hands game poses closeups prop one)
tools/art.sh art/preview/poses.py out.glb [char]   # the 12 deformation test poses, for `artshot.sh out.glb x.png poses|closeups`
tools/art.sh art/preview/variants.py outdir        # four extreme builds (range proof, not game assets)
```

Assets are code: `art/chars/<name>.py`, `art/props/<name>.py`, `art/venues/<name>.py` each write
`vendor/models/<name>.glb` (committed; `build.py` embeds them as
`<script type="application/octet-stream" id="sj-model-<name>">`). No Draco / meshopt compression.

## Space and units

- Metres. In Blender: Z up, the character faces -Y, its left is +X. Exported glTF: Y up, the character faces +Z,
  its left is +X (Blender `(x, y, z)` -> glTF `(x, z, -y)`). Feet on the ground at the origin (lowest point within 5 mm of y = 0).
- The hero guitarist is about 1.8 m. The mannequin: 1.80 m to the crown (1.87 with hair), eye line 1.632 m.
- Names of nodes, bones, meshes and materials use only `[A-Za-z0-9_]`; node names are unique.

## Skeleton: "SJ rig"

```
root
└ hips ─ thigh_L ─ shin_L ─ foot_L ─ toe_L          (and _R)
   ├ att_hip
   └ spine ─ chest ─ neck ─ head ─ att_head  (+ spr_* hair chains)
               ├ att_back
               └ shoulder_L ─ upperarm_L ─ forearm_L ─ hand_L ─ thumb1_L ─ thumb2_L     (and _R)
                                              │          ├ index1_L ─ index2_L
                                              │          ├ middle1_L ─ middle2_L
                                              │          ├ pinky1_L ─ pinky2_L
                                              │          └ att_hand_L
                                              └ twist_forearm_L
```

- `_L` / `_R` are the CHARACTER's left / right. `hand_L` is on +X.
- Four-finger cartoon hands: thumb, index, middle, pinky, two bones each.
- `twist_forearm_L/R` (child of the forearm, lower 40 % of it) is a helper that keeps the wrist from candy-wrapping:
  the runtime should give it **half of the hand's twist about the forearm axis**. Left at rest it is harmless
  (the wrist then twists over a shorter length). It is the only non-contract deform bone the body uses.
- Spring chains: `spr_<chain>_<n>`, n = 1 at the root of the chain, each the child of the previous (the first is a child of the
  bone it hangs from). Plain bones in the file; the runtime simulates them. The mannequin has `spr_forelock_1..3` (child of `head`).
- Attachment bones, no weights: `att_hand_L`, `att_hand_R`, `att_back`, `att_head`, `att_hip`.
  - `att_head` (top of the skull), `att_back` (between the shoulder blades, on the surface), `att_hip` (front of the pelvis, on the
    surface): **identity world orientation at rest** (so a prop parented with an identity local transform stands upright, facing +Z).
  - `att_hand_*`: in the palm, under the middle of the palm. Local +Y points to the fingertips, local +X to the thumb side,
    local +Z out of the BACK of the left hand / out of the PALM of the right hand (the two are mirror images).
- Rest pose: relaxed A-pose (arms 40 degrees below horizontal, elbows bent 9 degrees forward, fingers slightly curled and fanned),
  legs straight.
- **Bone rolls are not standardised** (attachment bones excepted). The runtime captures each bone's rest world matrix at load and
  authors poses as MODEL-SPACE rotations about the bone's rest head, parents carrying children
  (`sjart.rig.Poser` is the reference implementation, `art/preview/poses.py` the examples: "bend the left elbow" is a rotation about
  the model-space axis `(-sin A, 0, -cos A)` (Blender axes, A = the A-pose angle) whatever the roll is).
- Skinning: max 4 influences per vertex, normalised. Weights are authored on the control cage (not bone heat), so a finger only ever
  follows its own bones and clothes carry exactly the weights of the skin under them.
- Extra bones are allowed (the runtime leaves bones it does not know at rest).

## Geometry

- One skinned mesh per character (parts are joined), split by the exporter into one primitive per material class.
  8-14k triangles per character. The mannequin: 12.4k triangles, 6.6k vertices, 5 primitives, 48 bones.
- Flat albedo in `COLOR_0` (authored as sRGB hex, stored linear). No textures, no images in the file.
- `TEXCOORD_0` exists only for the face decal (zeros elsewhere).
- Props: static meshes under one root node, 200-6000 triangles. Venues: 500-60000.

## Material classes (the material NAME picks the shading)

| name | shading |
|---|---|
| `sj_toon` | default cel: flat colour + one shadow tone |
| `sj_skin`, `sj_hair`, `sj_cloth` | same cel shading; separate so the runtime can tint the shadow per class |
| `sj_metal` | hard specular blob |
| `sj_gloss` | vinyl / patent leather / lacquer: specular streak |
| `sj_emit` | unlit, glows, feeds bloom |
| `sj_glass` | transparent tinted, no ink line |
| `sj_face` | the face decal region (skin shading + the 2D face canvas) |

A mesh (or node) whose name ends in `_noline` gets no ink outline.

### Face decal (`sj_face`)

The front of the head is planar-projected onto a square 2D canvas: `u = 0.5 + x / S`, `v = 0.5 - (y - eye) / S` in glTF space
(v = 0 is the top of the image, three.js `flipY = false`), where `S` = `sj_face_size` and `eye` = `sj_eye_height`, both stored as
glTF extras on the rig node (mannequin: S = 0.258 m, eye = 1.632 m). The canvas centre sits between the eyes; the image appears
upright and unmirrored to a viewer facing the character (the character's left eye is on the right of the canvas).
Only faces wholly inside the unit square carry the class, so UVs never leave 0..1. The nose and ears are geometry (`sj_skin`).
The projection is along the face normal at rest, so features near the cheeks stretch: keep eyes within the middle 70 % of the canvas.

## Ink outline attributes

- `_SJOUT` (vec3): the direction to push a vertex for the inverted hull: an area-weighted normal shared by all vertices at the same
  position (hard edges and material seams do not crack). **Stored in glTF axes** already.
- `_SJOUTW` (float 0..1): line thickness weight. 1 = full line; thinner where the form is thin (fingers, ears, hair tips: scaled by
  local thickness, never below 0.42), 0.3 in the webs between fingers, 0 = no line (frets, inlays, strings, small hardware).
- Hull vertex position = `position + normalize(_SJOUT) * lineWidth * _SJOUTW` (after skinning, in view or world space).
  The reference line width is 0.5 % of the character's height at close range (9 mm for 1.8 m), about 1.2 % at in-game size
  (a 200 px character wants a line of 2-2.5 px): scale the width with distance.
- three.js lower-cases the names: `geometry.attributes._sjout`, `_sjoutw`. When absent the runtime welds positions and smooths normals itself.

## Characters are built from the Human builder

`sjart.Human(HumanSpec(...))` -> body cage + joints; `sjart.Character` joins body, garments and accessories and exports.
See `art/chars/mannequin.py` (the template for every band member: spec + hair + outfit + props) and `art/preview/variants.py`
(lanky 1.92 m, round 1.45 m, heavy 1.86 m, petite 1.52 m from the same code).
Extras on the rig node: `sj_asset`, `sj_spec`, `sj_height`, `sj_face_size`, `sj_eye_height`.

## Props

- A root node named after the asset, children: `<name>_body` (everything rigid, one mesh) + separately named moving parts + empties
  for grips and anchors. Origin and axes are documented in the prop's script.
- `guitar` (glTF axes): origin at the centre of the body at mid-thickness; **+X along the neck towards the headstock, +Y towards the
  bass side (the low string: up when worn right-handed), +Z out of the front** (strings, pickups). About 1.01 m long, body 0.33 m wide.
  - `string_1` .. `string_6` (1 = thinnest): separate mesh nodes; node origin at the bridge saddle, the string runs along local +X to the
    nut (`sj_scale` extra = that length, 0.633 m) and on to its tuner post. Displace / scale them to pluck. They have `_SJOUTW` = 0.
  - Empties: `grip_fret` (back of the neck at the 3rd fret: where the fretting hand's palm goes), `grip_strum` (2 cm above the strings
    between the pickups), `strap_a` (tail pin), `strap_b` (upper horn pin), `nut`, `bridge`.
  - Root extras: `sj_scale_length` (0.63), `sj_frets` (20). Fret k is at `nut.x - 0.63 * (1 - 2^(-k/12))`.
  - To wear it: parent the root to `att_hip`, rotate so +X points to the character's left and up about 20-30 degrees, +Z forward; then
    IK the left hand's `att_hand_L` to `grip_fret` and the right hand to `grip_strum`.

## FBX twin

`SJ_FBX=<dir>` (or `export_glb(..., fbx=path)`) writes the same scene as FBX: Y up, -Z forward, metres, no leaf bones, vertex colours
(sRGB), custom properties. Same bone names, same mesh.

## Roblox (R15) mapping

Roblox has no custom shaders: flat colours come from vertex colours baked to a small palette texture (or `SurfaceAppearance`), the ink
line is a second, inverted-hull MeshPart (black, back faces flipped outwards, pushed along `_SJOUT * _SJOUTW` at export time) or a
`Highlight`, and the face is a `Decal` on the head. R15 wants 15 rigid-ish parts; the SJ rig maps as below (skinned meshes are allowed
with these bone names; bones without a counterpart are merged into their parent, or kept as extra skinned bones).

| SJ bone | R15 part / bone |
|---|---|
| `root` | `HumanoidRootPart` |
| `hips` | `LowerTorso` |
| `spine` + `chest` | `UpperTorso` (spine merged into it) |
| `neck` + `head` | `Head` (neck merged; joint `Neck`) |
| `shoulder_L/R` | merged into `UpperTorso` (or an extra bone under it) |
| `upperarm_L` / `_R` | `LeftUpperArm` / `RightUpperArm` |
| `forearm_L` (+ `twist_forearm_L`) | `LeftLowerArm` / `RightLowerArm` |
| `hand_L` (+ fingers) | `LeftHand` / `RightHand` (fingers stay as extra skinned bones, or are baked into a hand pose) |
| `thigh_L` / `_R` | `LeftUpperLeg` / `RightUpperLeg` |
| `shin_L` / `_R` | `LeftLowerLeg` / `RightLowerLeg` |
| `foot_L` + `toe_L` | `LeftFoot` / `RightFoot` |
| `att_hand_L/R` | `LeftGripAttachment` / `RightGripAttachment` |
| `att_head`, `att_back`, `att_hip` | `HatAttachment`, `BodyBackAttachment`, `WaistFrontAttachment` |
| `spr_*` | extra bones (driven by a script) or dropped |

Roblox notes: R15 rest pose is a T-pose with identity bone orientations: re-pose from the A-pose and re-orient bones in the FBX export
step (a future `export_roblox`), mesh limit 10k triangles per MeshPart (the character is one 12k mesh: split body / outfit, or build
with fewer cage rings), 4 influences are supported, scale 1 stud = 0.28 m.

## iOS notes

- glTF loads directly in SceneKit / RealityKit (via USDZ conversion) and in any engine; 4 influences and < 65k vertices per mesh fit
  every mobile GPU skinning path. No textures means tiny downloads (mannequin 0.6 MB uncompressed, about 0.26 MB gzipped).
- Budget on a phone: 5 band members x 12k triangles x 2 (fill + hull) = 120k skinned triangles, about 10 draw calls per character.
  If that is too much for old phones, build an LOD with `HumanSpec(levels=0)` (the raw cage: the mannequin drops to 3.6k triangles, same rig and weights), or drop the hull for far characters.
- Custom attributes (`_SJOUT`, `_SJOUTW`) survive in glTF; for USDZ / Metal they must be mapped to primvars or recomputed.

## Verified at integration (art pipeline -> runtime, on `mannequin` + `guitar`)

Checked by rendering through the real engine (`test/modelshot.js`, `test/rigshot.js`), not by reading code:

| item | result |
|---|---|
| axes / scale | glTF Y-up, +Z forward, feet at the origin, 1.87 m to the top of the hair; no runtime correction |
| bone names | all 48 found by `Rig` (incl. `twist_forearm_*`, `spr_forelock_1..3`, `att_*`); `Assets.info().warnings` is empty |
| face UV | upright and unmirrored (wink test: the character's left eye is on the viewer's right) |
| colour | COLOR_0 linear in the glb, shown as the authored sRGB after the output pass |
| outline attributes | `_SJOUT` / `_SJOUTW` are used (`_sjout`, `_sjoutw`): finger webs thin, strings and frets lineless |
| material classes | skin, face, cloth, toon, hair, gloss, metal all resolve; a character is 3 draws (fill, ink, face) |
| props | `grip_fret` and `grip_strum` work as IK targets; the guitar hangs from `att_hip` |

Runtime rules assets can rely on (and must not fight):

- **Skin and face take no cast shadows** (`Toon.cls.skin.recv = 0`, `face.recv = 0`) and their terminator is pushed 0.3 towards
  the dark side, so a fringe or a hat brim never puts a slab of shadow across the face. Shape a face with the N.L terminator and
  the face canvas only. Cloth, hair and props still receive hard cast shadows.
- Every node of a prop is its own fill + ink draw (the guitar's six strings make it 14 draws). Keep a part as a node only when
  the runtime really animates it; otherwise join it into the body.
- Grip empties mark the SURFACE to touch. The palm bone (`att_hand_*`) sits about 8 cm up the hand, so a hold offsets the IK
  target by that much (see the strum in `test/rigdemo.js`).

See `docs/3D_PIPELINE.md` for the end-to-end walkthrough.
