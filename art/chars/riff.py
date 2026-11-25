"""RIFF: guitar, the hero. A lanky virtual-band frontman (art direction v3; identity from art/ART_BIBLE.md section 3).

About 6 heads to the crown at 1.67 m (1.88 m with the quiff): a small long-jawed head on a long neck, narrow sloped
shoulders, a thin slouched torso, very long thin limbs, big hands, oversized high-tops. Teal bomber over a paper tee,
tapered cropped trousers, a sun sweatband on the strumming wrist, a coral pick earring on the fretting side, and a
sculpted ink quiff with a tangerine streak that leans to the strumming side. The face is 2D ink (Cast.riff.face).

    tools/art.sh art/chars/riff.py            -> vendor/models/riff.glb
    tools/art.sh art/chars/riff.py out.glb

Extra bones: spr_quiff_1 (the quiff's jelly lag), hype_1 (child of it: slide it up and the quiff grows, see
Cast.riff.hype), spr_earring_1.
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from sjart import *                      # noqa: E402
from sjart import outfit, wardrobe      # noqa: E402

PAL = dict(skin='#E3A26B', teal='#2EC4B6', dark='#3A3552', paper='#FFF7E6', tang='#FF8A1F', sun='#FFCE3A', coral='#FF5E7E',
           hair='#2B2740', under='#4A4466', amber='#FFB020', grape='#7B5CF0', ink='#2B2740', yoke='#D8D0EC')

SPEC = HumanSpec(
    height=1.78, head_h=0.29, head_w=0.216, head_d=0.236, jaw=0.74, chin=0.9, cheek=0.2, face_e=2.7, skull_e=2.1, ear=1.05, nose=0.0,
    # a long face: cheekbones at the eye line, flat cheeks running down to a square jutting chin
    tweak={'jaw': dict(rx=1.18, ryf=1.10, ef=2.7, dz=-0.004), 'mouth': dict(rx=0.93, ryf=1.02), 'forehead': dict(rx=1.04), 'crown': dict(rx=1.1)},
    neck_len=0.115, neck_r=0.036,
    torso_len=0.45, shoulder_w=0.325, chest_w=0.265, chest_d=0.165, waist_w=0.215, waist_d=0.145, hip_w=0.255, hip_d=0.165,
    torso_e=2.4, trap=0.55, butt=0.006,
    posture=(-0.040, -0.026, 0.026, 0.022, -0.038),
    upperarm_len=0.30, forearm_len=0.28, r_shoulder=0.039, r_bicep=0.030, r_elbow=0.031, r_forearm=0.030, r_wrist=0.021,
    hand_len=0.25, hand_w=0.118, hand_t=0.036, palm=0.46, finger_r=0.0165, finger_splay=9.0, finger_curl=10.0,
    knee=0.50, stance=1.25, knee_fwd=0.012, r_thigh=0.061, r_midthigh=0.050, r_knee=0.045, r_calf=0.041, r_ankle=0.029,
    shin_rings=(0.10, 0.30, 0.52, 0.64, 0.74, 0.88),
    foot_len=0.30, foot_w=0.105, foot_h=0.090)
SCALE = 0.94                             # the design above is drawn at 1.78 m to the crown; he ships at 1.67 m (1.88 m with the quiff)
SPEC = SPEC.scaled(SCALE).but(posture=tuple(v * SCALE for v in SPEC.posture))


# ---- the quiff. Head frame (m): origin on the crown, x = his left (the fretting side), y = back, z = up.
# Every chunk grows out of the scalp, sweeps forward and up off the hairline, then rolls back and over to his RIGHT
# (the strumming side, away from the guitar neck). name: (points, half widths, bulge, options)
T_ = 'tang'
WF = [(0, 0.050), (0.3, 0.068), (0.78, 0.056), (1, 0.008)]
TF = [(0, 0.026), (0.35, 0.038), (0.78, 0.028), (1, 0.006)]
LOCKS = [
    ('Core', [(-0.030, 0.150, -0.010), (-0.055, 0.060, 0.070), (-0.080, -0.050, 0.100), (-0.075, -0.130, 0.060)],
     [(0, 0.060), (0.35, 0.105), (0.75, 0.112), (1, 0.085)], [(0, 0.030), (0.35, 0.065), (0.75, 0.075), (1, 0.045)], dict(n=10, seg=7, under=0.7, e=2.4)),
    ('F_L', [(0.070, -0.080, -0.050), (0.085, -0.145, 0.020), (0.060, -0.140, 0.100), (0.015, -0.075, 0.150), (-0.020, 0.020, 0.150)],
     WF, TF, dict(tip=0.66, n=10, seg=9, e=1.9)),
    ('F_C', [(0.000, -0.090, -0.050), (0.000, -0.165, 0.030), (-0.035, -0.160, 0.120), (-0.075, -0.090, 0.185), (-0.105, 0.020, 0.195)],
     WF, TF, dict(tip=0.66, n=10, seg=9, e=1.9)),
    ('F_R', [(-0.070, -0.080, -0.050), (-0.100, -0.150, 0.030), (-0.140, -0.145, 0.110), (-0.170, -0.080, 0.165), (-0.195, 0.020, 0.170)],
     WF, TF, dict(tip=0.66, n=10, seg=9, e=1.9)),
    ('Streak', [(-0.035, -0.105, -0.040), (-0.050, -0.185, 0.035), (-0.090, -0.180, 0.120), (-0.128, -0.105, 0.197), (-0.145, -0.030, 0.185)],
     [(0, 0.018), (0.4, 0.024), (1, 0.010)], [(0, 0.020), (0.5, 0.024), (1, 0.010)], dict(color=T_)),
    ('Tail', [(-0.080, 0.020, 0.130), (-0.105, 0.090, 0.150), (-0.125, 0.150, 0.185)],
     [(0, 0.050), (0.5, 0.042), (1, 0.006)], [(0, 0.028), (0.5, 0.026), (1, 0.005)], dict(n=8, seg=6, e=1.9)),
    ('Back', [(-0.020, 0.030, 0.030), (-0.030, 0.118, 0.020), (-0.022, 0.146, -0.060), (-0.012, 0.138, -0.135)],
     [(0, 0.070), (0.4, 0.084), (0.8, 0.060), (1, 0.022)], [(0, 0.024), (0.4, 0.030), (1, 0.010)], dict(sway=False)),
    ('S_R', [(-0.095, -0.060, -0.060), (-0.124, 0.020, -0.050), (-0.112, 0.105, -0.085)],
     [(0, 0.034), (0.5, 0.040), (1, 0.012)], [(0, 0.016), (0.5, 0.022), (1, 0.008)], dict(sway=False, n=8, seg=6)),
    ('S_L', [(0.095, -0.060, -0.060), (0.124, 0.020, -0.050), (0.112, 0.105, -0.085)],
     [(0, 0.034), (0.5, 0.040), (1, 0.012)], [(0, 0.016), (0.5, 0.022), (1, 0.008)], dict(sway=False, n=8, seg=6)),
    ('Stray', [(0.050, -0.100, -0.050), (0.068, -0.140, -0.072), (0.058, -0.132, -0.122)],
     [(0, 0.018), (0.5, 0.020), (1, 0.007)], [(0, 0.012), (0.5, 0.014), (1, 0.006)], dict(sway=False, n=8, seg=6)),
]


def hair(ch, pal):
    h = ch.h
    sp = h.spec
    k = sp.head_h / 0.29
    O = vec(0.0, h.head_cy, sp.height)
    hp = lambda p: O + vec(p[0], p[1], p[2]) * k
    outfit.hair_cap(ch, pal['under'], front=0.80, side=0.56, back=0.24, thick=0.010, top=0.0, fringe=0.0, sweep=0.0, name='Undercut')
    centre = hp((0.0, 0.0, -0.11))
    spr = ch.spring('quiff', [hp((0, -0.03, -0.02)), hp((-0.05, -0.05, 0.16))], 'head')[0]
    base = hp((-0.03, -0.06, 0.06))
    ch.joints['hype_1'] = (base, base + unit(vec(-0.25, 0.0, 1.0)) * 0.05)
    ch.parents['hype_1'] = spr
    for name, pts, wd, th, o in LOCKS:
        sway = o.get('sway', True)
        wardrobe.lock(ch, 'Hair_' + name, [hp(p) for p in pts], [(t, w * k) for t, w in wd], [(t, x * k) for t, x in th],
                      pal[o.get('color', 'hair')], centre, cls=o.get('cls', 'sj_toon'), e=o.get('e', 2.8), under=o.get('under', 0.4),
                      tip=(o['tip'], pal['tang']) if o.get('tip') else None, n=o.get('n', 8), segments=o.get('seg', 9),
                      sway=(spr, 0.15, 0.7) if sway else None, grow=('hype_1', 0.45, 1.0) if sway else None, line=o.get('line'))


def build(name='riff', pal=PAL):
    reset()
    h = Human(SPEC)
    sp = h.spec
    ch = Character(name, h, skin=pal['skin'])
    ch.face_flat = 0.7
    # ---- legs and feet: carrot trousers with a rolled cuff breaking on the biggest high-tops in the band
    wardrobe.slacks(ch, pal['dark'], top='hip', leg=0.74, cuff_from=0.64)
    wardrobe.band(ch, 'Sock', pal['paper'], fit=0.008, ext=0.004, shin=(0.74, 1.0), lip=0.0)
    wardrobe.chunky(ch, body=pal['paper'], cap=pal['teal'], sole=pal['tang'], heel=pal['teal'], lace=pal['ink'], toe_out=7.0, length=1.38, width=1.60)

    # ---- tee (front + a tail under the cropped jacket), bomber, strap
    tee = wardrobe.tee_front(ch, pal['paper'], hem='pelvis', drop=0.0)
    wardrobe.band(ch, 'TeeTail', pal['paper'], fit=0.022, ext=0.014, lip=0.010, torso=('hip', 'pelvis'))
    wardrobe.bomber(ch, pal['teal'], trim=pal['dark'], zip_color=pal['paper'], fit=0.022, box=0.055, puff=0.026, yoke=0.022,
                    sleeve=0.36, cuff_from=0.14, cuff_fit=0.030, hem='pelvis', drop=0.020, hem_in=0.040, bands=0.014,
                    collar=0.021, collar_rise=0.012)
    wardrobe.strap(ch, pal['paper'], a=(0.150, 0.0, h.sz + 0.055), b=(-0.125, 0.0, h.hz + 0.25), width=0.06, thick=0.009, gap=0.002, n=20, squares=6, square_color=pal['ink'])
    pk = [(x * 1.2 - 0.040, z * 1.2 - 0.010) for x, z in wardrobe.pick_outline(0.052, 0.062, n=12)]
    wardrobe.patch(ch, 'Patch', [dict(ring=(0.090, 0.066), n=18), pk], pal['paper'], centre=(-0.035, h.hz + 0.70 * sp.torso_len), levels=2)
    wardrobe.band(ch, 'Sweatband', pal['sun'], fit=0.012, ext=0.010, forearm=(0.62, 0.86), sides='R')

    # ---- the small things
    ear_x = sp.head_w * 0.5 * 0.955 + 0.024
    wardrobe.charm(ch, 'Earring', wardrobe.pick_outline(0.040, 0.046, n=10), pal['coral'],
                   at=(ear_x, h.head_cy + sp.head_d * 0.07 - 0.004, h.chin_z + 0.445 * sp.head_h - 0.036), yaw=32.0, spring='earring', cls='sj_toon')
    wardrobe.nails(ch, {'index': pal['teal'], 'middle': pal['amber'], 'pinky': pal['grape']}, side='L', size=0.017)
    hair(ch, pal)
    return ch


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else None
    build().export(out, height_extra=0.0, height_tol=0.3, budget=(8000, 18000))
