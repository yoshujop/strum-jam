"""RIFF: guitar, the hero (art/ART_BIBLE.md section 3). The only diagonal in the band.

A 3.5-head human: a pick-shaped head under an ink slab of hair with a tangerine dip, a cropped teal bomber
over a paper tee, cropped dark trousers, the biggest high-tops in the band, a sun sweatband on the strumming
wrist and a coral pick earring on the fretting side. Rest pose is the rig's A-pose; "the Lean" is a pose
(src/55-cast.js). The face is 2D ink on the decal (Cast.riff.face).

    tools/art.sh art/chars/riff.py            -> vendor/models/riff.glb
    tools/art.sh art/chars/riff.py out.glb

Extra bones: spr_slab_1 (the slab's jelly lag), hype_1..4 (the level-meter plates of the hair's high step: slide
each along its own length, see Cast.riff.hype), spr_earring_1.
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from sjart import *                      # noqa: E402
from sjart import outfit, wardrobe      # noqa: E402

PAL = dict(skin='#E3A26B', teal='#2EC4B6', dark='#3A3552', paper='#FFF7E6', tang='#FF8A1F', sun='#FFCE3A', coral='#FF5E7E',
           hair='#2B2740', under='#3A3552', amber='#FFB020', grape='#7B5CF0', ink='#2B2740')

# landmarks (m): sole 0.04, shoe top 0.19, knee 0.36, crotch 0.60, jacket hem 0.66, shoulders and chin 1.13, skull top 1.58,
# hair low step 1.72, high step 1.80
SPEC = HumanSpec(
    height=1.58, head_h=0.45, head_w=0.50, head_d=0.42, jaw=0.58, chin=0.30, cheek=0.42, face_e=3.0, skull_e=2.3, ear=0.74, nose=0.0,
    neck_len=0.05, neck_r=0.05,
    torso_len=0.41, shoulder_w=0.49, chest_w=0.45, chest_d=0.225, waist_w=0.30, waist_d=0.19, hip_w=0.33, hip_d=0.20, torso_e=2.5,
    upperarm_len=0.235, forearm_len=0.225, r_shoulder=0.049, r_bicep=0.045, r_elbow=0.040, r_forearm=0.0425, r_wrist=0.034,
    forearm_rings=(0.16, 0.40, 0.64, 0.86),
    hand_len=0.19, hand_w=0.13, hand_t=0.046, finger_r=0.0215, finger_splay=9.0,
    knee=0.55, stance=1.34, r_thigh=0.072, r_midthigh=0.066, r_knee=0.055, r_calf=0.053, r_ankle=0.040,
    shin_rings=(0.12, 0.40, 0.66, 0.88),
    foot_len=0.325, foot_w=0.121, foot_h=0.110)

# the Slab, front view (m): x towards the fretting hand (the character's left), y up from the hairline centre.
# The bible's top outline (one right-angle step, flat tops, 0.66 wide); below the hairline the sides run down and IN to
# the skull so it grows out of the head like a flat-top instead of sitting on it like a hat, and the blunt fringe has
# its own step: low over the half-lidded eye, higher over the wide one.
HAIR_Y = 1.56            # the hairline centre
DIP = 0.04               # the tangerine band
DEPTH = 0.455
SL = dict(xb0=-0.272, x0t=-0.36, xs=0.06, x1t=0.30, xb1=0.266, hi_a=0.22, hi_b=0.24, lo_a=0.15, lo_b=0.16, bot=-0.105, notch=0.04, xn=0.035)


def slab_pieces(pal):
    s = SL
    lx = lambda y: lerp(s['xb0'], s['x0t'], (y - s['bot']) / (s['hi_a'] - s['bot']))     # left edge at height y
    rx = lambda y: lerp(s['xb1'], s['x1t'], (y - s['bot']) / (s['lo_b'] - s['bot']))     # right edge
    nb = s['bot'] + s['notch']
    body = [(lx(s['bot']), s['bot']), (lx(s['hi_a'] - DIP), s['hi_a'] - DIP), (s['xs'], s['hi_b'] - DIP),
            (s['xs'], s['lo_a'] - DIP), (rx(s['lo_b'] - DIP), s['lo_b'] - DIP), (rx(nb), nb), (s['xn'], nb), (s['xn'], s['bot'])]
    hi = [(lx(s['hi_a'] - DIP - 0.012) - 0.004, s['hi_a'] - DIP - 0.012), (s['x0t'] - 0.004, s['hi_a']), (s['xs'] + 0.004, s['hi_b']),
          (s['xs'] + 0.004, s['hi_b'] - DIP - 0.012)]
    lo = [(s['xs'] - 0.02, s['lo_a'] - DIP - 0.012), (s['xs'] - 0.02, s['lo_a']), (s['x1t'] + 0.004, s['lo_b']),
          (rx(s['lo_b'] - DIP - 0.012) + 0.004, s['lo_b'] - DIP - 0.012)]
    pieces = [dict(pts=body, color=pal['hair'], cls='sj_toon'),
              dict(pts=lo, color=pal['tang'], proud=0.004)]
    # hype plates: four nested plates inside the high step; plate 1 carries the tangerine cap. Each slides up its bone.
    for k in range(1, 5):
        ins = 0.004 + 0.002 * k
        y1 = s['hi_a'] - DIP
        plate = [(lx(y1 - 0.055) + ins, y1 - 0.060), (lx(y1) + ins, y1 - 0.004), (s['xs'] - ins, y1 + 0.016),
                 (s['xs'] - ins, y1 - 0.060)]
        edge = [(lx(y1 - 0.016) + ins - 0.003, y1 - 0.020), (lx(y1) + ins - 0.003, y1 - 0.004), (s['xs'] - ins + 0.003, y1 + 0.016),
                (s['xs'] - ins + 0.003, y1)]
        pieces.append(dict(pts=plate, color=pal['hair'], cls='sj_toon', bone='hype_%d' % k, depth=DEPTH - 2 * ins, y0=ins, bevel=0.006))
        if k > 1:
            pieces.append(dict(pts=edge, color=pal['tang'], bone='hype_%d' % k, depth=DEPTH - 2 * ins + 0.006, y0=ins - 0.003, bevel=0.004))
    pieces.append(dict(pts=hi, color=pal['tang'], proud=0.004, bone='hype_1'))
    return pieces


def build(name='riff', pal=PAL):
    reset()
    h = Human(SPEC)
    sp = h.spec
    ch = Character(name, h, skin=pal['skin'])

    # ---- legs and feet
    outfit.trousers(ch, pal['dark'], top='pelvis', leg=0.40, fit=0.012, flare=0.006)
    wardrobe.band(ch, 'Sock', pal['paper'], fit=0.007, ext=0.004, shin=(0.40, 1.0), lip=0.0,
                  stripes=[(0.215, 0.240, pal['teal'])])
    wardrobe.hightops(ch, body=pal['paper'], cap=pal['teal'], sole=pal['tang'], heel=pal['teal'], lace=pal['paper'], collar=0.100, sole_h=0.048)

    # ---- tee, bomber, strap
    wardrobe.tee_front(ch, pal['paper'])
    wardrobe.bomber(ch, pal['teal'], trim=pal['dark'], zip_color=pal['paper'])
    wardrobe.strap(ch, pal['paper'], a=(0.215, 0.0, h.sz + 0.07), b=(-0.205, 0.0, h.hz + 0.10), squares=6, square_color=pal['ink'])
    # the Needle Drop on the back: a ring (the record) with a pick inside, cream
    pk = [(x * 1.25, z * 1.25 + 0.046) for x, z in wardrobe.pick_outline(0.062, 0.074, n=16)]
    wardrobe.patch(ch, 'Patch', [dict(ring=(0.110, 0.078), n=20), pk], pal['paper'], centre=(0.0, h.hz + 0.60 * sp.torso_len))
    wardrobe.band(ch, 'Sweatband', pal['sun'], fit=0.013, ext=0.010, forearm=(0.64, 0.86), sides='R')

    # ---- hair: the undercut cap, then the Slab on top of it
    outfit.hair_cap(ch, pal['under'], front=0.775, side=0.60, back=0.34, thick=0.012, top=0.0, fringe=0.0, sweep=0.0, name='Undercut')
    forehead_y = h.head_cy - sp.head_d * 0.44
    wardrobe.slab(ch, 'Slab', slab_pieces(pal), depth=DEPTH, origin=(0.0, forehead_y - 0.045, HAIR_Y), lean=8.0, bevel=0.02,
                  bone='head', spring='slab')

    # ---- the small things
    ear_x = sp.head_w * 0.5 * 0.955 + 0.030
    wardrobe.charm(ch, 'Earring', wardrobe.pick_outline(0.058, 0.064, n=14), pal['coral'],
                   at=(ear_x, h.head_cy + sp.head_d * 0.07 - 0.004, h.chin_z + 0.445 * sp.head_h - 0.036), yaw=32.0, spring='earring', cls='sj_toon')
    wardrobe.nails(ch, {'index': pal['teal'], 'middle': pal['amber'], 'pinky': pal['grape']}, side='L')
    return ch


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else None
    build().export(out, height_extra=0.225, height_tol=0.03)
