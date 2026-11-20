"""THE OFFCUT: Riff's guitar (art/ART_BIBLE.md section 3). An original outline: an offset teardrop with a round
belly and ONE long upper horn, a chunky neck with 7 cream fret bars and a hard-cut tangerine headstock with a cream
plate and six ink pegs in a line (the HUD guitar's headstock).

    tools/art.sh art/props/offcut.py            -> vendor/models/offcut.glb

CONVENTION (art/ASSET_SPEC.md "Props", same as `guitar`): root `offcut`, origin at the centre of the body at
mid-thickness. glTF axes: +X along the neck to the headstock, +Y to the bass side (up when worn right-handed),
+Z out of the front. One rigid mesh `offcut_body` (2 draws; the three string strips are part of it) and the
empties grip_fret, grip_strum, strap_a, strap_b, nut, bridge, plate (centre of the headstock's cream plate).
Total length 1.08 m. The frets are stylised: 7 bars spaced as if the scale were 1.1 m (sj_scale_length).
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from sjart import *                                   # noqa: E402
from sjart import bl, color, outline, shapes, export  # noqa: E402

PAL = dict(body='#FF8A1F', paper='#FFF7E6', neck='#F2D6A2', board='#5A3825', ink='#2B2740', sun='#FFCE3A', cream='#FFF1D0')
BODY_T = 0.055
TOP = -BODY_T / 2                  # y of the body's front face (the front is -Y in Blender)
XB = -0.105                        # bridge
XN = 0.640                         # nut
X_HEEL = 0.125                     # where the neck meets the body
SCALE = 1.10                       # the stylised scale the 7 frets are spaced by
N_FRETS = 7
NECK_T = 0.026
BOARD_TOP = TOP - 0.014            # y of the fretboard surface


def fret_x(k):
    return XN - SCALE * (1 - 2 ** (-k / 12.0))


def neck_hw(x):
    return lerp(0.0350, 0.0400, clamp((XN - x) / (XN - X_HEEL)))


def part(ob, hexcol, cls='sj_toon', line=1.0):
    color.paint(ob, hexcol, cls)
    outline.set_weight(ob, line)
    return ob


def build(pal=PAL, name='offcut'):
    reset()
    P = []
    # ---- body: an offset teardrop, round belly, one long upper horn on the neck side, no lower horn
    ctl = [(-0.210, 0.005), (-0.196, -0.090), (-0.130, -0.158), (-0.030, -0.166), (0.050, -0.130), (0.105, -0.075),
           (0.132, -0.042), (0.136, 0.042), (0.150, 0.074), (0.186, 0.112), (0.214, 0.150), (0.196, 0.178),
           (0.140, 0.166), (0.070, 0.142), (0.000, 0.150), (-0.080, 0.170), (-0.160, 0.146), (-0.202, 0.086)]
    body = shapes.extrude('body', shapes.outline(ctl, n=72, tension=0.5), BODY_T, bevel=0.012, segments=2, plane='xz')
    bl.transform(body, loc=(0, TOP, 0))
    part(body, pal['body'], 'sj_gloss')
    color.set_class(body, 'sj_toon', faces=[0])          # the flat front: a lacquer blob there would flood the whole face
    P.append(body)

    # ---- pick-shaped paper pickguard, point to the tail on the treble side
    guard = shapes.extrude('guard', shapes.rounded([(-0.150, 0.098), (0.118, 0.104), (-0.028, -0.128)], 0.034, steps=5), 0.004,
                           bevel=0.0015, segments=1, plane='xz')
    bl.transform(guard, loc=(0, TOP - 0.004, 0))
    P.append(part(guard, pal['paper'], 'sj_toon', 0.4))
    G = TOP - 0.004                # the guard's face

    # ---- two ink soapbars, the bridge block
    for x in (-0.030, 0.062):
        pk = shapes.box('pickup', (0.035, 0.010, 0.090), bevel=0.003, segments=1, centre=(x, G - 0.005, 0.004), corner=0.009, steps=3)
        P.append(part(pk, pal['ink'], 'sj_gloss', 0.5))
    br = shapes.box('bridge', (0.030, 0.016, 0.086), bevel=0.004, segments=1, centre=(XB, TOP - 0.008, 0.004), corner=0.008, steps=2)
    P.append(part(br, pal['ink'], 'sj_toon', 0.6))

    # ---- two sun knobs on the lacquer
    for x, z in ((-0.118, -0.082), (-0.052, -0.118)):
        kn = shapes.lathe('knob', [(0.0225, 0.0), (0.0225, 0.007), (0.0190, 0.016), (0.0, 0.016)], n=14, axis=(0, -1, 0), origin=(x, TOP, z),
                          smooth_angle=50)
        P.append(part(kn, pal['sun'], 'sj_toon', 0.6))

    # ---- neck: 30 % chunkier than real, maple, a dark board with 7 cream bars and dots at 3, 5, 7
    x1 = XN + 0.012
    nk = [(X_HEEL - 0.03, -neck_hw(X_HEEL)), (x1, -neck_hw(x1)), (x1, neck_hw(x1)), (X_HEEL - 0.03, neck_hw(X_HEEL))]
    neck = shapes.extrude('neck', nk, NECK_T, bevel=0.002, back_bevel=0.012, segments=2, plane='xz')
    bl.transform(neck, loc=(0, BOARD_TOP + 0.004, 0))
    P.append(part(neck, pal['neck'], 'sj_toon'))
    bx0 = X_HEEL + 0.022
    bd = [(bx0, -neck_hw(bx0) + 0.002), (XN, -neck_hw(XN) + 0.002), (XN, neck_hw(XN) - 0.002), (bx0, neck_hw(bx0) - 0.002)]
    board = shapes.extrude('board', bd, 0.006, bevel=0.0015, segments=1, plane='xz')
    bl.transform(board, loc=(0, BOARD_TOP, 0))
    P.append(part(board, pal['board'], 'sj_toon', 0.5))
    P.append(part(shapes.block('nut', (0.010, 0.010, neck_hw(XN) * 2), (XN + 0.005, BOARD_TOP + 0.001, 0)), pal['cream'], 'sj_toon', 0.0))
    for k in range(1, N_FRETS + 1):
        x = fret_x(k)
        P.append(part(shapes.block('fret%d' % k, (0.0075, 0.003, neck_hw(x) * 2 - 0.004), (x, BOARD_TOP - 0.001, 0)), pal['cream'], 'sj_toon', 0.0))
    for k in (3, 5, 7):
        x = 0.5 * (fret_x(k) + fret_x(k - 1))
        P.append(part(shapes.cylinder('dot%d' % k, 0.0095, 0.001, n=10, axis=(0, -1, 0), origin=(x, BOARD_TOP, 0)), pal['cream'], 'sj_toon', 0.0))

    # ---- headstock 0.23 x 0.13: hard-cut, tip cut at 20 degrees, cream plate, six ink pegs in a line
    hx = XN + 0.004
    h_pts = [(hx, -0.036), (hx + 0.030, -0.050), (hx + 0.182, -0.050), (hx + 0.226, 0.072), (hx + 0.050, 0.080), (hx + 0.012, 0.050), (hx, 0.036)]
    head_o = shapes.rounded(h_pts, [0.0, 0.018, 0.014, 0.014, 0.022, 0.016, 0.0], steps=3)
    HT = BOARD_TOP + 0.005
    head = shapes.extrude('head', head_o, 0.020, bevel=0.004, segments=2, plane='xz')
    bl.transform(head, loc=(0, HT, 0))
    P.append(part(head, pal['body'], 'sj_gloss'))
    pl_pts = [(hx + 0.040, -0.036), (hx + 0.166, -0.036), (hx + 0.187, 0.022), (hx + 0.046, 0.026)]
    plate = shapes.extrude('plate', shapes.rounded(pl_pts, 0.010, steps=3), 0.002, bevel=0.0008, segments=1, plane='xz')
    bl.transform(plate, loc=(0, HT - 0.002, 0))
    P.append(part(plate, pal['paper'], 'sj_toon', 0.0))
    for i in range(6):
        x = hx + 0.058 + i * 0.0265
        z = 0.050 + i * 0.0008
        post = shapes.cylinder('post', 0.0085, 0.012, n=8, axis=(0, -1, 0), origin=(x, HT, z))
        P.append(part(post, pal['ink'], 'sj_toon', 0.4))
        key = shapes.box('key', (0.018, 0.010, 0.024), bevel=0.003, segments=1, centre=(x, HT + 0.010, z + 0.040), corner=0.006, steps=2)
        P.append(part(key, pal['ink'], 'sj_toon', 0.8))

    # ---- three cream string strips
    for z in (-0.019, 0.0, 0.019):
        L = XN - XB
        s = shapes.block('string', (L, 0.003, 0.005), (XB + L / 2, BOARD_TOP - 0.006, z))
        P.append(part(s, pal['cream'], 'sj_toon', 0.0))

    # ---- strap pins
    pins = (((-0.2125, 0.0, 0.004), (-1, 0, 0)), ((0.2120, 0.0, 0.162), (0.75, 0, 0.66)))
    for pos, ax in pins:
        pin = shapes.lathe('pin', [(0.006, -0.004), (0.006, 0.006), (0.011, 0.008), (0.011, 0.012), (0.0, 0.013)], n=8, axis=ax, origin=pos, smooth_angle=50)
        P.append(part(pin, pal['ink'], 'sj_toon', 0.5))

    body_ob = bl.join(P, name + '_body')
    outline.outline_attrs(body_ob, auto_thin=False)
    root = bl.empty(name)
    body_ob.parent = root
    out = [root, body_ob]
    marks = {'grip_fret': (fret_x(2) + 0.02, BOARD_TOP + 0.004 + NECK_T, 0.0),      # the back of the neck near the 2nd fret
             'grip_strum': (0.016, G - 0.030, 0.0),                                # over the strings between the pickups
             'strap_a': pins[0][0], 'strap_b': pins[1][0], 'nut': (XN, BOARD_TOP, 0.0), 'bridge': (XB, TOP - 0.016, 0.0),
             'plate': (hx + 0.110, HT - 0.002, -0.006)}
    for k, v in marks.items():
        out.append(bl.empty(k, v, parent=root))
    root['sj_asset'] = 'prop'
    root['sj_scale_length'] = SCALE
    root['sj_frets'] = N_FRETS
    return out


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(export.models_dir(), 'offcut.glb')
    export.export_glb(out, build(), kind='prop')
