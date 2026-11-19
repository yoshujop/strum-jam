"""The Strum Jam electric guitar: an original offset design (orange lacquer, cream guard, the cream
plate on an orange headstock like the in-game chord plate). Hard-surface proof for the toolkit.

    tools/art.sh art/props/guitar.py            -> vendor/models/guitar.glb
    tools/art.sh art/props/guitar.py out.glb

CONVENTION (see art/ASSET_SPEC.md "Props"):  root node `guitar`, origin at the centre of the body at
mid-thickness.  glTF axes: +X along the neck towards the headstock, +Y towards the bass side (the
low string; up when the guitar is worn right-handed), +Z out of the front (strings, pickups).
Children: guitar_body (everything rigid), string_1 .. string_6 (1 = thinnest; origin at its bridge
saddle, the string runs along local +X), and empties grip_fret, grip_strum, strap_a, strap_b, nut.
"""
import math
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from sjart import *                                   # noqa: E402
from sjart import bl, color, outline, shapes, export  # noqa: E402

PAL = dict(body='#FF8A1F', guard='#FFF1D0', neck='#F4C98A', board='#3B2A3A', metal='#D9DDE8', black='#2A2438',
           cream='#FFF1D0', inlay='#FFF1D0', string='#E8ECF5')
SCALE = 0.63                       # bridge saddle -> nut
XB = -0.085                        # bridge saddle
XN = XB + SCALE                    # nut
BODY_T = 0.044
TOP = -BODY_T / 2                  # y of the body's front face (front is -Y in Blender)
BOARD_TOP = TOP - 0.012            # y of the fretboard surface
N_FRETS = 20


def fret_x(k):
    return XN - SCALE * (1 - 2 ** (-k / 12.0))


def neck_half_w(x):
    """Half width of the fretboard at x (wider towards the body)."""
    return lerp(0.0225, 0.0290, clamp((XN - x) / (XN - 0.10)))


def part(ob, hexcol, cls='sj_toon', line=1.0):
    color.paint(ob, hexcol, cls)
    outline.set_weight(ob, line)
    return ob


def build(pal=PAL, name='guitar'):
    reset()
    P = []                         # rigid parts, joined into guitar_body

    # ---- body: extruded, bevelled outline (x along the neck, z towards the bass side)
    ctl = [(-0.214, -0.020), (-0.196, -0.108), (-0.118, -0.160), (-0.030, -0.146), (0.036, -0.112), (0.090, -0.122),
           (0.146, -0.150), (0.190, -0.136), (0.184, -0.092), (0.146, -0.050), (0.128, -0.030),
           (0.128, 0.032), (0.152, 0.062), (0.190, 0.104), (0.224, 0.140), (0.216, 0.172), (0.168, 0.170),
           (0.120, 0.146), (0.050, 0.124), (-0.020, 0.140), (-0.110, 0.168), (-0.190, 0.136), (-0.224, 0.060)]
    body_o = shapes.outline(ctl, n=88, tension=0.5)
    body = shapes.extrude('body', body_o, BODY_T, bevel=0.009, segments=2, plane='xz')
    bl.transform(body, loc=(0, TOP, 0))
    P.append(part(body, pal['body'], 'sj_gloss'))

    # ---- pickguard: a thin cream plate under the strings and controls
    g_ctl = [(0.118, -0.034), (0.118, 0.040), (0.060, 0.070), (-0.020, 0.078), (-0.100, 0.064), (-0.128, 0.010), (-0.150, -0.030),
             (-0.184, -0.062), (-0.176, -0.104), (-0.110, -0.132), (-0.030, -0.118), (0.040, -0.090), (0.100, -0.094), (0.146, -0.104),
             (0.150, -0.080)]
    guard = shapes.extrude('guard', shapes.outline(g_ctl, n=64, tension=0.45), 0.0030, bevel=0.0012, segments=1, plane='xz')
    bl.transform(guard, loc=(0, TOP - 0.0030, 0))
    P.append(part(guard, pal['guard'], 'sj_toon', 0.35))

    # ---- neck (rounded back), fretboard, nut
    x0, x1 = 0.105, XN + 0.030
    nk = [(x0, -neck_half_w(x0)), (x1, -neck_half_w(x1)), (x1, neck_half_w(x1)), (x0, neck_half_w(x0))]
    neck = shapes.extrude('neck', nk, 0.022, bevel=0.0, back_bevel=0.0105, segments=3, plane='xz')
    bl.transform(neck, loc=(0, BOARD_TOP + 0.006, 0))
    P.append(part(neck, pal['neck'], 'sj_toon'))
    bx0 = fret_x(N_FRETS) - 0.012
    bd = [(bx0, -neck_half_w(bx0)), (XN, -neck_half_w(XN)), (XN, neck_half_w(XN)), (bx0, neck_half_w(bx0))]
    board = shapes.extrude('board', bd, 0.0065, bevel=0.0015, segments=1, plane='xz')
    bl.transform(board, loc=(0, BOARD_TOP, 0))
    P.append(part(board, pal['board'], 'sj_toon', 0.6))
    P.append(part(shapes.block('nut', (0.006, 0.0085, neck_half_w(XN) * 2), (XN + 0.003, BOARD_TOP + 0.0015, 0)), pal['cream'], 'sj_toon', 0.0))

    # ---- frets and inlays
    for k in range(1, N_FRETS + 1):
        x = fret_x(k)
        f = shapes.block('fret%d' % k, (0.0030, 0.0022, neck_half_w(x) * 2 - 0.001), (x, BOARD_TOP - 0.0009, 0))
        P.append(part(f, pal['metal'], 'sj_metal', 0.0))
    for k in (3, 5, 7, 9, 12, 15, 17, 19):
        x = 0.5 * (fret_x(k) + fret_x(k - 1))
        for z in ((-0.011, 0.011) if k == 12 else (0.0,)):
            d = shapes.cylinder('inlay%d' % k, 0.0050, 0.0008, n=10, axis=(0, -1, 0), origin=(x, BOARD_TOP, z))
            P.append(part(d, pal['inlay'], 'sj_toon', 0.0))

    # ---- headstock: orange, with the cream plate
    hx = XN + 0.012
    h_ctl = [(hx, -0.0240), (hx + 0.022, -0.0400), (hx + 0.070, -0.0470), (hx + 0.128, -0.0440), (hx + 0.160, -0.0260),
             (hx + 0.176, 0.0100), (hx + 0.196, 0.0440), (hx + 0.172, 0.0600), (hx + 0.110, 0.0520), (hx + 0.050, 0.0490),
             (hx + 0.018, 0.0400), (hx, 0.0240)]
    head_o = shapes.outline(h_ctl, n=48, tension=0.5)
    head = shapes.extrude('head', head_o, 0.0150, bevel=0.0035, segments=2, plane='xz')
    HT = BOARD_TOP + 0.0055                 # the headstock face sits a little below the fretboard
    bl.transform(head, loc=(0, HT, 0))
    P.append(part(head, pal['body'], 'sj_gloss'))
    plate = shapes.extrude('plate', shapes.inset(head_o, 0.0085), 0.0016, bevel=0.0008, segments=1, plane='xz')
    bl.transform(plate, loc=(0, HT - 0.0016, 0))
    P.append(part(plate, pal['cream'], 'sj_toon', 0.0))

    # ---- tuners: 3 + 3, posts on the face, keys off the edges
    posts = []
    for i in range(3):
        x = hx + 0.040 + i * 0.047
        for sgn, zz in ((1, 0.030 + i * 0.002), (-1, -0.027)):
            posts.append((x, zz))
            p = shapes.cylinder('post', 0.0046, 0.0115, n=8, axis=(0, -1, 0), origin=(x, HT - 0.0016, zz))
            P.append(part(p, pal['metal'], 'sj_metal', 0.4))
            edge = 0.050 + (0.008 if sgn > 0 else 0.0)
            sh = shapes.cylinder('shaft', 0.0026, 0.016, n=6, axis=(0, 0, sgn), origin=(x, HT + 0.0075, sgn * (edge - 0.006)))
            P.append(part(sh, pal['metal'], 'sj_metal', 0.0))
            key = shapes.box('key', (0.017, 0.0065, 0.0135), bevel=0.002, segments=1, centre=(x, HT + 0.0075, sgn * (edge + 0.0150)), corner=0.005, steps=2)
            P.append(part(key, pal['metal'], 'sj_metal', 0.6))

    # ---- pickups (bobbin + cream ring + pole pieces), bridge, tailpiece
    for x in (-0.030, 0.062):
        ring = shapes.box('pring', (0.046, 0.0040, 0.092), bevel=0.0012, segments=1, centre=(x, TOP - 0.0030 - 0.0020, 0), corner=0.006, steps=2)
        P.append(part(ring, pal['cream'], 'sj_toon', 0.0))
        pk = shapes.box('pickup', (0.034, 0.0080, 0.078), bevel=0.002, segments=2, centre=(x, TOP - 0.0030 - 0.0040, 0), corner=0.006, steps=3)
        P.append(part(pk, pal['black'], 'sj_gloss', 0.5))
        for i in range(6):
            z = (i - 2.5) * 0.0108
            pole = shapes.cylinder('pole', 0.0030, 0.0008, n=6, axis=(0, -1, 0), origin=(x, TOP - 0.0030 - 0.0080, z))
            P.append(part(pole, pal['metal'], 'sj_metal', 0.0))
    bridge = shapes.box('bridge', (0.018, 0.0125, 0.082), bevel=0.003, segments=1, centre=(XB - 0.002, TOP - 0.0030 - 0.00625, 0), corner=0.006)
    P.append(part(bridge, pal['metal'], 'sj_metal', 0.6))
    tail = shapes.box('tail', (0.016, 0.0100, 0.090), bevel=0.004, segments=1, centre=(XB - 0.046, TOP - 0.0030 - 0.0050, 0), corner=0.007)
    P.append(part(tail, pal['metal'], 'sj_metal', 0.6))

    # ---- controls: two knobs, a selector switch, the jack plate
    for x, z in ((-0.128, -0.086), (-0.070, -0.104)):
        kn = shapes.lathe('knob', [(0.0135, 0.0), (0.0135, 0.004), (0.0115, 0.0115), (0.0100, 0.0135), (0.0, 0.0135)], n=14,
                          axis=(0, -1, 0), origin=(x, TOP - 0.0030, z), smooth_angle=50)
        P.append(part(kn, pal['black'], 'sj_gloss', 0.6))
        cap = shapes.cylinder('knobcap', 0.0062, 0.0010, n=10, axis=(0, -1, 0), origin=(x, TOP - 0.0030 - 0.0135, z))
        P.append(part(cap, pal['cream'], 'sj_toon', 0.0))
    sw = shapes.lathe('switch', [(0.0075, 0.0), (0.0075, 0.0018), (0.0022, 0.0030), (0.0020, 0.0120), (0.0042, 0.0150), (0.0042, 0.0190), (0.0, 0.0205)],
                      n=10, axis=unit(vec(0.25, -1, 0.2)), origin=(0.150, TOP, 0.118), smooth_angle=50)
    P.append(part(sw, pal['cream'], 'sj_toon', 0.5))
    # ---- strap pins
    pins = (((-0.2215, 0.0, 0.016), (-1, 0, 0)), ((0.2260, 0.0, 0.156), (0.8, 0, 0.6)))
    for pos, ax in pins:
        pin = shapes.lathe('pin', [(0.0036, -0.003), (0.0036, 0.0045), (0.0072, 0.0060), (0.0072, 0.0090), (0.0, 0.0100)], n=10, axis=ax, origin=pos, smooth_angle=50)
        P.append(part(pin, pal['metal'], 'sj_metal', 0.5))

    body_ob = bl.join(P, name + '_body')
    outline.outline_attrs(body_ob, auto_thin=False)

    # ---- strings: separate nodes so the runtime can pluck them. 1 = thinnest (treble side, -z)
    root = bl.empty(name)
    body_ob.parent = root
    out = [root, body_ob]
    order = [posts[5], posts[3], posts[1], posts[0], posts[2], posts[4]]      # which post each string goes to
    for i in range(6):
        zb = (i - 2.5) * 0.0108
        zn = (i - 2.5) * 0.0070
        r = 0.00075 + 0.00017 * i
        yb = TOP - 0.0030 - 0.0125 - r
        yn = BOARD_TOP - 0.0030 - r
        px, pz = order[i]
        pts = [(0, 0, 0), (XN + 0.003 - XB, yn - yb, zn - zb), (px - XB, HT - 0.0105 - yb, pz - zb)]
        s = shapes.grid_mesh('string_%d' % (i + 1), [ring_at(pts, j, r) for j in range(3)], cap0='flat', cap1='flat')
        bl.recalc_normals(s)
        color.paint(s, pal['string'], 'sj_metal')
        outline.set_weight(s, 0.0)
        outline.outline_attrs(s, auto_thin=False)
        s.location = (XB, yb, zb)
        s.parent = root
        s['sj_scale'] = round(SCALE + 0.003, 4)
        out.append(s)

    # ---- named points for the runtime
    marks = {'grip_fret': (fret_x(3) + 0.012, BOARD_TOP + 0.006 + 0.022, 0.0),   # back of the neck near the 3rd fret: fretting hand
             'grip_strum': (0.016, TOP - 0.022, 0.0),                           # over the strings between the pickups: strumming hand
             'strap_a': pins[0][0], 'strap_b': pins[1][0],
             'nut': (XN, BOARD_TOP, 0.0), 'bridge': (XB, TOP - 0.0155, 0.0)}
    for k, v in marks.items():
        out.append(bl.empty(k, v, parent=root))
    root['sj_asset'] = 'prop'
    root['sj_scale_length'] = SCALE
    root['sj_frets'] = N_FRETS
    return out


def ring_at(pts, j, r, n=5):
    """A small n-gon ring round point j of a string path (perpendicular to the local direction)."""
    import numpy as np
    P = np.asarray(pts, dtype=float)
    d = unit(P[min(j + 1, len(P) - 1)] - P[max(j - 1, 0)])
    a = perp(d, (0, -1, 0))
    b = np.cross(d, a)
    return [P[j] + (a * math.cos(2 * math.pi * k / n) + b * math.sin(2 * math.pi * k / n)) * r for k in range(n)]


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(export.models_dir(), 'guitar.glb')
    export.export_glb(out, build(), kind='prop')
