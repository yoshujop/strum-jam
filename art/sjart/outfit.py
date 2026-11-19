"""Garments, shoes and hair for a Character. Each function adds parts to the character and hides
the body under them. Clothes are shells of the body cage (cage.shell): same topology and the same
skin weights as the skin under them, so they can never tear or poke through when the rig moves.
"""
import math
import numpy as np
from .util import vec, unit, lerp, smoothstep, clamp
from .cage import Cage, Loft, ring2d, place, cc_comp


# ------------------------------------------------------------------ tops and bottoms
def tee(ch, color, sleeve=0.62, hem='hip', collar='neckbase', fit=0.014, drop=0.030, flare=0.010, cls='sj_cloth', name='Tee'):
    """T-shirt. sleeve: how far down the upper arm (0..1); hem: torso ring it ends at; fit: looseness (m);
    drop: how far the hem hangs below that ring; flare: how much the hem and cuffs stand off."""
    h = ch.h
    faces = h.select(torso=(hem, collar), upperarm=(0.0, sleeve))
    hz, TL = h.hz, h.spec.torso_len

    def off(p, meta, n):
        part = meta.get('part', '')
        if part.startswith('upperarm'):
            return fit + flare * smoothstep(0.25, sleeve, meta.get('s', 0.0))
        k = smoothstep(hz + 0.62 * TL, hz + 0.30 * TL, p[2])       # looser below the ribs, and clear of the waistband
        return fit + flare * k

    def ext(p, meta):
        return drop if meta.get('part') == 'torso' and meta.get('ring') == hem else 0.012 if meta.get('part', '').startswith('upperarm') else 0.0

    sh = h.cage.shell(faces, offset=off, lip=0.010, part='tee', extend=ext, crease=0.35)
    ch.hide(faces)
    return ch.add_cage(sh, name, paint=color, cls=cls)


def trousers(ch, color, top='pelvis', leg=0.90, fit=0.011, flare=0.012, cls='sj_cloth', name='Trousers'):
    """Trousers from the `top` torso ring down to `leg` of the shin (0..1). flare widens the ankle."""
    h = ch.h
    faces = h.select(torso=('crotch', top), thigh=(0.0, 1.0), shin=(0.0, leg))

    def off(p, meta, n):
        part = meta.get('part', '')
        if part.startswith('shin'):
            return fit + flare * smoothstep(0.2, leg, meta.get('s', 0.0))
        return fit

    def ext(p, meta):
        return 0.02 if meta.get('part', '').startswith('shin') else 0.0

    sh = h.cage.shell(faces, offset=off, lip=0.010, part='trousers', extend=ext, crease=0.35)
    ch.hide(faces)
    return ch.add_cage(sh, name, paint=color, cls=cls)


# ------------------------------------------------------------------ shoes
def sneaker_cage(h, length=1.22, width=1.40, sole=0.046, collar=0.050, toe_up=0.012):
    """The left sneaker: a chunky cartoon trainer built round the foot (length / width relative to the bare foot)."""
    sp = h.spec
    c = Cage()
    A = h.A
    L = sp.foot_len * length
    Wd = sp.foot_w / 2 * width
    fh = sp.foot_h
    heel_y = A[1] + 0.27 * sp.foot_len + 0.5 * (L - sp.foot_len) * 0.55
    top = fh * 1.04 + sole * 0.6
    # f along the shoe, half width, top height (x fh), x drift, sole lift
    table = [(0.035, 0.66, 0.86, 0.000, 0.004), (0.13, 0.86, 1.00, 0.000, 0.0), (0.27, 0.93, 1.02, 0.000, 0.0),
             (0.42, 0.98, 0.98, 0.002, 0.0), (0.58, 1.03, 0.74, 0.004, 0.0), (0.74, 1.03, 0.60, 0.006, 0.0),
             (0.89, 0.90, 0.54, 0.007, toe_up * 0.5), (0.975, 0.60, 0.44, 0.007, toe_up)]
    rings = []
    for f, hw, tp, dx, lift in table:
        w = hw * Wd
        t = max(tp * top, sole + 0.02)
        y = heel_y - f * L
        x0 = A[0] + dx
        m = sole + (t - sole) * 0.50
        prof = [(-w * 1.06, 0.0), (-w * 0.38, 0.0), (w * 0.38, 0.0), (w * 1.06, 0.0),          # bottom
                (w * 1.10, sole), (w * 1.00, m), (w * 0.66, t * 0.985),                       # outer side
                (w * 0.24, t * 1.02), (-w * 0.24, t * 1.02),                                  # top
                (-w * 0.66, t * 0.985), (-w * 1.00, m), (-w * 1.10, sole)]                    # inner side
        pts = [vec(x0 + px, y, pz + (lift if pz <= sole + 1e-6 else lift * 0.5)) for px, pz in prof]
        wt = smoothstep(0.60, 0.84, f)
        rings.append(c.add(pts, w={'foot_L': 1 - wt, 'toe_L': wt}, part='shoe', s=f))
    hole_cols = {6, 7, 8}            # top faces: columns 6-7, 7-8, 8-9
    for i in range(len(rings) - 1):
        zone = 'cap' if table[i][0] >= 0.73 else 'upper'
        for k in range(12):
            if i in (1, 2) and k in hole_cols:
                continue
            j = (k + 1) % 12
            z = 'sole' if k in (0, 1, 2, 3, 11) else ('lace' if k == 7 and 0.40 <= table[i][0] < 0.73 else zone)
            c.face((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]), part='shoe', zone=z)
    for ring, rev, zone in ((rings[0], True, 'upper'), (rings[-1], False, 'cap')):
        n0 = len(c.f)
        loop = ring[::-1] if rev else ring
        start = loop.index(ring[3]) if rev else 0
        c.fill(loop, bulge=0.010, start=start, a=3, part='shoe', zone=zone)
        for fi in range(n0, len(c.f)):
            if max(c.v[i][2] for i in c.f[fi]) <= sole + 0.012:
                c.ft[fi]['zone'] = 'sole'
    ra, rb, rc = rings[1], rings[2], rings[3]
    hole = [ra[6], ra[7], ra[8], ra[9], rb[9], rc[9], rc[8], rc[7], rc[6], rb[6]]
    # collar: a padded ring round the ankle, folded in
    cz = fh + collar
    cy = A[1] + 0.004
    rr = sp.r_ankle * 1.55
    w_col = {'foot_L': 0.7, 'shin_L': 0.3}
    for i in hole:
        c.w[i] = dict(w_col)
    p2 = ring2d(10, rr * 1.02, rr * 1.10, rr * 1.12)
    outer = c.add(place(p2, vec(A[0], cy, cz), vec(1, 0, 0), vec(0, 1, 0.16)), w=w_col, part='shoe')
    inner = c.add(place(p2 * 0.74, vec(A[0], cy, cz + 0.004), vec(1, 0, 0), vec(0, 1, 0.16)), w=w_col, part='shoe')
    deep = c.add(place(p2 * 0.70, vec(A[0], cy, cz - 0.045), vec(1, 0, 0), vec(0, 1, 0.10)), w=w_col, part='shoe')
    _, o2 = c.bridge_auto(hole, outer, part='shoe', zone='upper')
    k = outer.index(o2[0])
    d = 1 if outer[(k + 1) % 10] == o2[1] else -1
    i2 = [inner[(k + d * m) % 10] for m in range(10)]
    d2 = [deep[(k + d * m) % 10] for m in range(10)]
    c.bridge(o2, i2, part='shoe', zone='collar')
    c.bridge(i2, d2, part='shoe', zone='lining')
    return c


def sneakers(ch, upper='#F4F1E8', sole='#FFFFFF', cap=None, lace=None, lining='#2A2438', name='Shoe', **kw):
    """A pair of trainers; hides the bare feet. Colours: upper, sole, toe cap, lace panel, lining."""
    h = ch.h
    c = sneaker_cage(h, **kw)
    pal = {'': (upper, 'sj_cloth'), 'sole': (sole, 'sj_toon'), 'cap': (cap or sole, 'sj_toon'), 'lace': (lace or sole, 'sj_cloth'),
           'collar': (upper, 'sj_cloth'), 'lining': (lining, 'sj_cloth')}
    ch.hide(h.select(foot=True), interior=False)
    a = ch.add_cage(c, name + '_L', paint=pal, by='zone')
    b = ch.add_cage(c.mirrored(), name + '_R', paint=pal, by='zone')
    return a, b


# ------------------------------------------------------------------ hair
def hair_cap(ch, color, front=0.80, back=0.26, side=0.52, thick=0.030, top=0.022, fringe=0.022, sweep=0.5, cls='sj_hair', name='Hair'):
    """A chunky one-piece hair mass hugging the skull: a thick shell over the scalp.

    front / side / back: hairline heights as fractions of the head height (chin = 0, crown = 1);
    thick: base thickness; top: extra volume on top; fringe: how far the front hem hangs over the forehead;
    sweep: -1..1 pushes the fringe to one side (the fringe hangs lower on that side)."""
    h = ch.h
    sp = h.spec
    cz, Hh, hc, hd = h.chin_z, sp.head_h, h.head_cy, sp.head_d

    def line(p):
        fr = clamp(-(p[1] - hc) / (hd * 0.5), -1, 1)                 # 1 front .. -1 back
        if fr >= 0:
            return lerp(side, front, smoothstep(0.05, 0.85, fr))
        return lerp(side, back, smoothstep(0.0, 0.75, -fr))

    cg = h.cage
    faces = []
    for fi, t in enumerate(cg.ft):
        if t.get('part') != 'head':
            continue
        ctr = np.mean([cg.v[i] for i in cg.f[fi]], axis=0)
        if (ctr[2] - cz) / Hh > line(ctr):
            faces.append(fi)

    def off(p, meta, n):
        u = (p[2] - cz) / Hh
        return thick + top * smoothstep(0.55, 1.0, u) * max(n[2], 0.0)

    def ext(p, meta):
        fr = clamp(-(p[1] - hc) / (hd * 0.5), -1, 1)
        sx = p[0] / (sp.head_w * 0.5)
        return fringe * smoothstep(0.2, 0.9, fr) * (1.0 + 0.8 * sweep * sx) + 0.006

    sh = cg.shell(faces, offset=off, lip=thick * 0.85, part='hair', extend=ext, crease=0.25, wall=0.5)
    for i in range(len(sh.v)):
        sh.w[i] = {'head': 1.0}
    ch.hide(faces)
    return ch.add_cage(sh, name, paint=color, cls=cls)


def tuft(ch, name, color, points, radius, bone='head', spring=None, n=8, flat=0.7, cls='sj_hair'):
    """A tapered lock of hair along `points` (root first). radius: [(t, r), ...] keys.
    spring: a chain name -> the lock gets spring bones spr_<chain>_1..k through its points (hung from `bone`)
    and is weighted to them; otherwise it follows `bone` rigidly."""
    from . import shapes
    P = np.asarray(points, dtype=np.float64)
    ob = shapes.tube(name, P, radius, n=n, flat=flat, caps=('fan', 'round'), segments=max(6, len(P) * 3))
    from . import color as col
    col.paint(ob, color, cls)
    if spring:
        names = ch.spring(spring, P, bone)
        seg = [(P[i], P[i + 1]) for i in range(len(P) - 1)]

        def wfn(p):
            best, bt = 0, 0.0
            bd = 1e9
            for i, (a, b) in enumerate(seg):
                ab = b - a
                t = clamp(float(np.dot(p - a, ab) / np.dot(ab, ab)))
                d = float(np.linalg.norm(p - (a + ab * t)))
                if d < bd:
                    bd, best, bt = d, i, t
            w = {names[best]: 1.0}
            if bt < 0.3:
                prev = names[best - 1] if best > 0 else bone
                k = 0.5 * (1 - bt / 0.3)
                w = {names[best]: 1 - k, prev: k}
            elif bt > 0.7 and best + 1 < len(names):
                k = 0.5 * (bt - 0.7) / 0.3
                w = {names[best]: 1 - k, names[best + 1]: k}
            return w
        return ch.add_weighted(ob, wfn)
    return ch.add_rigid(ob, bone)
