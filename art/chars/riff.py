"""RIFF: guitar, the hero (art/ART_BIBLE.md section 3). The only diagonal in the band.

A 3.5-head human: a pick-shaped head under an ink slab of hair with a tangerine dip, a cropped teal bomber
over a paper tee, cropped dark trousers, the biggest high-tops in the band, a sun sweatband on the strumming
wrist and a coral pick earring on the fretting side. Rest pose is the rig's A-pose; "the Lean" is a pose
(src/55-cast.js). The face is 2D ink on the decal (Cast.riff.face).

    tools/art.sh art/chars/riff.py            -> vendor/models/riff.glb
    tools/art.sh art/chars/riff.py out.glb

Extra bones: spr_slab_1 (the slab's jelly lag), hype_1..4 (the level meter in the hair's high step: hype_1 carries
the cap, each bone a band with a tangerine edge; slide bone k up by step * max(0, level - k + 1), see Cast.riff.hype),
spr_earring_1.
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from sjart import *                      # noqa: E402
from sjart import outfit, wardrobe      # noqa: E402

# under: the bible lists the undercut as #3A3552; next to the #2B2740 slab the two arrive as one dark at stage size, so it
# is lifted to #4A4466 here (art director's fix 2; needs the owner's OK as a bible change).
PAL = dict(skin='#E3A26B', teal='#2EC4B6', dark='#3A3552', paper='#FFF7E6', tang='#FF8A1F', sun='#FFCE3A', coral='#FF5E7E',
           hair='#2B2740', under='#4A4466', amber='#FFB020', grape='#7B5CF0', ink='#2B2740', yoke='#D8D0EC')

# landmarks (m): sole 0.04, shoe top 0.19, trouser cuff 0.26, knee 0.36, crotch 0.60, tee tail 0.63, jacket hem 0.67,
# shoulders and chin 1.13, skull top 1.58, hair low step 1.72, high step 1.80
SPEC = HumanSpec(
    height=1.58, head_h=0.45, head_w=0.50, head_d=0.42, jaw=0.50, chin=0.36, cheek=0.30, face_e=3.0, skull_e=2.3, ear=1.0, nose=0.0,
    # the pick: widest at the temples, flat cheeks running down to a small round chin
    tweak={'jaw': dict(rx=0.78, ryf=0.96), 'mouth': dict(rx=0.86), 'eye': dict(rx=0.975), 'forehead': dict(rx=1.10),
           'crown': dict(rx=1.50, ryf=1.30, ryb=1.0), 'top': dict(rx=1.5, ryf=1.4)},
    neck_len=0.05, neck_r=0.05,
    torso_len=0.41, shoulder_w=0.525, chest_w=0.47, chest_d=0.23, waist_w=0.30, waist_d=0.19, hip_w=0.285, hip_d=0.19, torso_e=2.5,
    upperarm_len=0.25, forearm_len=0.235, r_shoulder=0.050, r_bicep=0.045, r_elbow=0.040, r_forearm=0.0425, r_wrist=0.034,
    forearm_rings=(0.14, 0.46, 0.68, 0.88),
    hand_len=0.19, hand_w=0.13, hand_t=0.046, finger_r=0.0215, finger_splay=9.0,
    knee=0.55, stance=1.50, knee_fwd=0.022, r_thigh=0.086, r_midthigh=0.077, r_knee=0.058, r_calf=0.056, r_ankle=0.041,
    shin_rings=(0.12, 0.40, 0.66, 0.88),
    foot_len=0.325, foot_w=0.121, foot_h=0.110)

# ---- the Slab, front view (m): x towards the fretting hand (the character's left), z up from the hairline centre.
# The bible's outline: near-parallel sides (0.60 at the base, 0.66 at the top), one right-angle step in the top edge.
# Side view: the front face overhangs the forehead, the top is flat for 0.20, then ONE straight chamfer drops to the skull
# at the crown, so in profile it is a wedge (a quiff), not a box. The fringe is three blunt chunks; outside them the
# side walls stop 0.03 below the hairline, over the undercut.
HAIR_Z = 1.56                                   # the hairline centre
DIP = 0.045                                     # the tangerine band down the front edge
DEPTH = 0.43
FLAT = 0.20                                     # the flat top, front to back, before the chamfer
CHAMFER = ((FLAT, 0.24), (0.790, 0.613))        # side view plane: through (y, z), normal (y, z)
STEP = 0.05                                     # one hype plate
XS = 0.06                                       # the step between the high and the low top
FRINGE = [(-0.215, -0.045, -0.100), (-0.045, 0.075, -0.062), (0.075, 0.215, -0.082)]   # x0, x1, bottom: never a straight line
TEMPLE = -0.030


def lx(z):                                      # the slab's edge on the strumming side
    return -0.32 - 0.04 * z / 0.22


def rx(z):                                      # ... on the fretting side
    return 0.28 + 0.02 * z / 0.16


def hi(x):                                      # the high top edge
    return 0.22 + (x + 0.36) * 0.02 / 0.42


def lo(x):                                      # the low top edge
    return 0.15 + (x - XS) * 0.01 / 0.24


def slab_pieces(pal):
    xl = lx(0.17)
    h0 = lambda x: hi(x) - STEP                                 # the high step's top under the cap
    body = [(lx(TEMPLE), TEMPLE), (xl, h0(xl)), (XS, h0(XS)), (XS, lo(XS)), (0.30, lo(0.30)), (rx(TEMPLE), TEMPLE), (FRINGE[-1][1], TEMPLE)]
    for x0, x1, z in reversed(FRINGE):
        body += [(x1, z), (x0, z)]
    body.append((FRINGE[0][0], TEMPLE))
    low_edge = ((XS, lo(XS)), (0.30, lo(0.30)))
    pieces = [dict(pts=body, color=pal['hair'], cls='sj_toon', cuts=[CHAMFER],
                   paint=[dict(line=low_edge, color=pal['tang'], face='top'), dict(line=low_edge, color=pal['tang'], face='front', width=DIP)])]
    # hype_1: the cap of the high step (flush with the slab's sides: no lid) and the first band hidden under it
    hi_edge = ((-0.36, hi(-0.36)), (XS, hi(XS)))
    cap = [(xl, h0(xl)), (-0.36, hi(-0.36)), (XS, hi(XS)), (XS, h0(XS))]
    pieces.append(dict(pts=cap, color=pal['hair'], cls='sj_toon', bone='hype_1', cuts=[CHAMFER],
                       paint=[dict(line=hi_edge, color=pal['tang'], face='top'), dict(line=hi_edge, color=pal['tang'], face='front', width=DIP)]))
    # four bands inside the slab, each one hype level tall with a fresh tangerine edge; band k rises with bone hype_k
    ins = 0.005
    e0 = ((xl + ins, h0(xl + ins) - 0.002), (XS - ins, h0(XS - ins) - 0.002))
    band = [(lx(0.12) + ins, e0[0][1] - STEP - 0.004), e0[0], e0[1], (XS - ins, e0[1][1] - STEP - 0.004)]
    for k in range(1, 5):
        pieces.append(dict(pts=band, color=pal['hair'], cls='sj_toon', bone='hype_%d' % k, depth=FLAT + 0.028 - 2 * ins, y0=ins, bevel=0.004,
                           paint=[dict(line=e0, color=pal['tang'], face='any', width=0.016)]))
    return pieces


def build(name='riff', pal=PAL):
    reset()
    h = Human(SPEC)
    sp = h.spec
    ch = Character(name, h, skin=pal['skin'])
    ch.face_flat = 0.7

    # ---- legs and feet: carrot trousers cropped above the ankle, paper socks with two teal bands, the biggest high-tops
    outfit.trousers(ch, pal['dark'], top='hip', leg=0.40, fit=0.014, flare=-0.004)
    sock = wardrobe.band(ch, 'Sock', pal['paper'], fit=0.007, ext=0.004, shin=(0.40, 1.0), lip=0.0)
    for s, S in ((1, 'L'), (-1, 'R')):
        K, A = h.K * vec(s, 1, 1), h.A * vec(s, 1, 1)
        for j, z in enumerate((0.215, 0.247)):
            wardrobe.hoop(ch, 'SockBand%d_%s' % (j, S), pal['teal'], lerp(K, A, (K[2] - z) / (K[2] - A[2])), axis=unit(K - A), width=0.02,
                          proud=0.003, targets=[sock], bone='shin_' + S, cls='sj_toon')
    wardrobe.kicks(ch, body=pal['paper'], cap=pal['teal'], sole=pal['tang'], heel=pal['teal'], lace=pal['ink'], length=0.40, width=0.17,
                   top=0.19, sole_h=0.04, toe_out=6.0)

    # ---- tee (front + a tail under the cropped jacket), yoke, bomber, strap
    tee = wardrobe.tee_front(ch, pal['paper'], hem='hip', drop=0.0)
    wardrobe.band(ch, 'TeeTail', pal['paper'], fit=0.021, ext=0.012, lip=0.010, torso=('crotch', 'hip'), where=lambda t: t.get('lo') != 'under')
    wardrobe.patch(ch, 'Yoke', [wardrobe.pick_outline(0.40, 0.25, n=14)], pal['yoke'], centre=(0.0, h.sz + 0.065), back=False, targets=[tee], lift=0.003, levels=2)
    wardrobe.bomber(ch, pal['teal'], trim=pal['dark'], zip_color=pal['paper'], fit=0.024, box=0.052, puff=0.008, yoke=0.014,
                    sleeve=0.46, cuff_from=0.14, cuff_fit=0.028, hem='hip', drop=0.016, hem_in=0.046, bands=0.012,
                    stand=dict(r=0.112, flare=0.062, height=0.092, front=0.05, thick=0.03, gap=40.0))
    wardrobe.strap(ch, pal['paper'], a=(0.235, 0.0, h.sz + 0.07), b=(-0.205, 0.0, h.hz + 0.10), squares=6, square_color=pal['ink'])
    # the Needle Drop on the back: a solid record ring with a filled pick touching the rim at the lower right
    pk = [(x * 1.2 - 0.047, z * 1.2 - 0.012) for x, z in wardrobe.pick_outline(0.062, 0.074, n=12)]
    wardrobe.patch(ch, 'Patch', [dict(ring=(0.110, 0.080), n=18), pk], pal['paper'], centre=(-0.05, h.hz + 0.64 * sp.torso_len), levels=2)
    wardrobe.band(ch, 'Sweatband', pal['sun'], fit=0.013, ext=0.010, forearm=(0.68, 0.88), sides='R')

    # ---- hair: the undercut (a lighter value than the slab), squared sideburns, then the Slab growing out of it
    outfit.hair_cap(ch, pal['under'], front=0.775, side=0.60, back=0.34, thick=0.012, top=0.0, fringe=0.0, sweep=0.0, name='Undercut')
    for s in (1, -1):
        wardrobe.tab(ch, 'Sideburn', pal['under'], (s * (sp.head_w * 0.5 - 0.004), h.head_cy - 0.030, h.chin_z + 0.60 * sp.head_h - 0.032),
                     (0.022, 0.05, 0.075), bevel=0.0, line=0.6)
    forehead_y = h.head_cy - sp.head_d * 0.44
    wardrobe.slab(ch, 'Slab', slab_pieces(pal), depth=DEPTH, origin=(0.0, forehead_y - 0.040, HAIR_Z), lean=8.0, bevel=0.008,
                  bone='head', spring='slab')

    # ---- the small things
    ear_x = sp.head_w * 0.5 * 0.955 + 0.034
    wardrobe.charm(ch, 'Earring', wardrobe.pick_outline(0.058, 0.064, n=10), pal['coral'],
                   at=(ear_x, h.head_cy + sp.head_d * 0.07 - 0.004, h.chin_z + 0.445 * sp.head_h - 0.046), yaw=32.0, spring='earring', cls='sj_toon')
    wardrobe.nails(ch, {'index': pal['teal'], 'middle': pal['amber'], 'pinky': pal['grape']}, side='L')
    return ch


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else None
    build().export(out, height_extra=0.225, height_tol=0.03)
