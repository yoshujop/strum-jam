"""Wardrobe: designed outfit pieces and accessories for the band members, on top of outfit.py's basics.

    wardrobe.bomber(ch, '#2EC4B6', trim='#3A3552', zip_color='#FFF7E6')   cropped open bomber: shell + collar + zip
    wardrobe.hightops(ch, body=..., cap=..., sole=..., heel=...)           chunky high-top trainers
    wardrobe.band(ch, 'Sweatband', '#FFCE3A', forearm=(0.64, 0.86), sides='R')   a band round a limb (sweatband, sock)
    wardrobe.slab(ch, 'Slab', pieces, depth=0.36, origin=..., lean=8)       hair (or anything) cut from 2D outlines
    wardrobe.strap(ch, '#FFF7E6', a, b)                                     a guitar strap lying on the clothes
    wardrobe.patch(ch, 'Patch', rings, colour, centre, back=True)           flat appliques pressed onto the clothes
    wardrobe.nails(ch, {'index': '#2EC4B6', ...}, side='L')                 finger nails
    wardrobe.charm(ch, 'Earring', pts2d, colour, at, bone='head', spring='earring')   a small hanging plate

Shells keep the body's skin weights (they cannot tear); rigid pieces follow one bone; pieces that lie on
the clothes (strap, patches, zip) take the spine chain's weights at their height.
"""
import math
import numpy as np
from mathutils.bvhtree import BVHTree
from .util import vec, unit, lerp, smoothstep, clamp, resample
from .cage import ring2d, place
from . import bl, color as col, outline, shapes, outfit
from .human import NT


# ------------------------------------------------------------------ helpers
def _bvh(objs):
    V, F = [], []
    for o in objs:
        base = len(V)
        V.extend(tuple(v.co) for v in o.data.vertices)
        F.extend(tuple(base + i for i in p.vertices) for p in o.data.polygons)
    return BVHTree.FromPolygons(V, F)


def _outer_hit(bvh, origin, direction, far=2.0):
    """The outermost surface point seen from far away looking back along -direction, through `origin`."""
    d = unit(direction)
    start = np.asarray(origin, dtype=float) + d * far
    hit = bvh.ray_cast(tuple(start), tuple(-d), far * 2)
    return None if hit[0] is None else np.array(hit[0])


def chain_weights(ch):
    """fn(position) -> spine chain weights at that height (for things lying on the torso's clothes)."""
    h = ch.h

    def fn(p):
        return {b: w for b, w in h._chain_w(p[2]).items() if w > 1e-4}
    return fn


def _torso_cols(cg, fi):
    return {cg.meta[i].get('col') for i in cg.f[fi]}


# ------------------------------------------------------------------ tee under an open jacket
def tee_front(ch, color, cols=2, hem='pelvis', collar='neckbase', fit=0.016, drop=0.03, cls='sj_cloth', name='Tee'):
    """Only the part of a tee an open jacket shows: the front `cols` torso columns each side of the centre."""
    h = ch.h
    cg = h.cage
    front = {k % NT for k in range(-cols, cols + 1)}
    faces = [fi for fi in h.select(torso=(hem, collar)) if _torso_cols(cg, fi) <= front]
    sh = cg.shell(faces, offset=fit, lip=0.010, part='tee', crease=0.35, wall=0.0,
                  extend=lambda p, m: drop if m.get('ring') == hem else 0.0)
    ch.hide(faces)
    return ch.add_cage(sh, name, paint=color, cls=cls)


# ------------------------------------------------------------------ bomber jacket
def bomber(ch, color, trim, zip_color=None, fit=0.028, box=0.050, puff=0.020, sleeve=0.40, cuff_from=0.16, cuff_fit=0.030,
           hem='hip', drop=0.030, hem_in=0.004, open_cols=1, close=0.0, collar=0.048, collar_rise=0.035, cls='sj_cloth', name='Jacket',
           bands=0.0, stand=None, yoke=0.0):
    """A cropped, boxy, open bomber: a shell over torso and arms with a dark hem band and fat cuffs, a ribbed
    stand collar (a half torus open at the front) and a zip line down both edges of the opening.

    box: extra room at the waist (the jacket hangs from the chest instead of following the waist);
    puff: extra room in the sleeves; sleeve / cuff_from: where the sleeve and its cuff end along the forearm;
    open_cols: torso columns left open each side of the front centre; close: slides the edges back together (m);
    collar: tube radius of the collar (0 = none); collar_rise: how much higher it stands at the back.
    bands: > 0 builds the hem band and the cuffs as separate rib bands standing this proud of the shell (a hard step and
    its own ink line) instead of painting the shell; stand: dict of stand_collar() options, replaces the tube collar;
    yoke: extra room across the shoulders (drop shoulders)."""
    h = ch.h
    cg = h.cage
    front = {k % NT for k in range(-open_cols, open_cols + 1)}
    faces = [fi for fi in h.select(torso=(hem, 'neckbase'), upperarm=(0.0, 1.0), forearm=(0.0, sleeve))
             if not (cg.ft[fi].get('part') == 'torso' and _torso_cols(cg, fi) <= front)]
    boxy = {hem: hem_in, 'pelvis': box * 0.85, 'waist': box, 'ribs': box * 0.6, 'chest': box * 0.2 + yoke * 0.4, 'upchest': yoke, 'shoulder': 0.006 + yoke, 'neckbase': -0.006}

    def off(p, meta, n):
        part = meta.get('part', '')
        s = meta.get('s', 0.0)
        if part.startswith('upperarm'):
            return fit + 0.006 + puff * smoothstep(0.15, 0.9, s)
        if part.startswith('forearm'):
            return cuff_fit if s >= sleeve - 1e-6 else fit + puff if s < cuff_from + 1e-6 else cuff_fit
        return fit + boxy.get(meta.get('ring'), 0.0)

    def ext(p, meta):
        if meta.get('part', '').startswith('forearm'):
            return 0.010
        if meta.get('ring') == hem:
            return drop
        if meta.get('ring') == 'neckbase':
            return 0.0
        return close

    sh = cg.shell(faces, offset=off, lip=0.014, part='jacket', extend=ext, crease=0.3)
    edge = {'L': [], 'R': []}
    for fi, t in enumerate(sh.ft):
        ms = [sh.meta[i] for i in sh.f[fi]]
        z = ''
        if t.get('lip'):
            if all(m.get('part', '').startswith('forearm') for m in ms):
                z = 'cuff'
            elif all(m.get('ring') == hem for m in ms):
                z = 'hem'
            elif all(m.get('ring') == 'neckbase' for m in ms):
                z = 'hem'
        elif t.get('src_part') == 'torso' and t.get('lo') == hem:
            z = 'hem'
        elif (t.get('src_part') or '').startswith('forearm') and t.get('d0', 0.0) >= cuff_from - 1e-6:
            z = 'cuff'
        t['zone'] = z
    ob = ch.add_cage(sh, name, paint={'': (color, cls), 'hem': (color if bands else trim, cls), 'cuff': (trim, cls)}, by='zone')
    ch.hide(faces)
    band_top = -1e9
    if bands:
        hb = [fi for fi in faces if cg.ft[fi].get('part') == 'torso' and cg.ft[fi].get('lo') == hem]
        b = cg.shell(hb, offset=lambda p, m, n: off(p, m, n) + bands, lip=0.012, part='hemband', crease=0.3, wall=0.0,
                     extend=lambda p, m: drop + 0.006 if m.get('ring') == hem else 0.0)
        ch.add_cage(b, name + '_Hem', paint=trim, cls=cls)
        band_top = max(cg.v[i][2] for fi in hb for i in cg.f[fi]) - 0.004
        cf = [fi for fi in faces if cg.ft[fi].get('part', '').startswith('forearm') and cg.ft[fi].get('d0', 0.0) >= cuff_from - 1e-6]
        b = cg.shell(cf, offset=lambda p, m, n: cuff_fit + bands, lip=0.014, part='cuffband', crease=0.3, wall=0.0,
                     extend=lambda p, m: 0.014)
        ch.add_cage(b, name + '_Cuffs', paint=trim, cls=cls)
    # zip: a thin cream line down each edge of the opening
    if zip_color:
        e_cols = {open_cols: 'L', NT - open_cols: 'R'}
        for i, m in enumerate(sh.meta):
            if m.get('col') in e_cols and not m.get('lip') and m.get('part') == 'torso' and i in {v for lp in sh.hems for v in lp}:
                edge[e_cols[m['col']]].append(np.array(sh.v[i]))
        wfn = chain_weights(ch)
        for side, pts in edge.items():
            if len(pts) < 3:
                continue
            pts = [p for p in pts if p[2] >= band_top]
            pts.sort(key=lambda p: p[2])
            pts = [p + vec(-0.004 if side == 'L' else 0.004, -0.003, 0) for p in pts]
            z = shapes.tube('Zip_' + side, pts, 0.0075, n=4, caps=('fan', 'fan'), segments=len(pts) + 2)
            col.paint(z, zip_color, 'sj_toon')
            ch.add_weighted(z, wfn, line=0.5)
    if stand is not None:
        stand_collar(ch, trim, cls=cls, **stand)
    # collar: half a torus round the neck, open at the front, higher at the back
    elif collar > 0:
        sp = h.spec
        z0 = h.sz + 0.066 + collar * 0.55
        rx = sp.neck_r * 1.62 + fit + collar * 1.55
        ry = rx * 0.96
        a0 = math.radians(30)
        pts = []
        for k in range(17):
            a = lerp(a0, 2 * math.pi - a0, k / 16.0)
            pts.append(vec(rx * math.sin(a), 0.014 - ry * math.cos(a), z0 + collar_rise * 0.5 * (1 - math.cos(a))))
        c = shapes.tube('Collar', pts, [(0, collar * 0.62), (0.10, collar), (0.90, collar), (1, collar * 0.62)], n=6, flat=0.46,
                        caps=('round', 'round'), segments=18)
        col.paint(c, trim, cls)
        ch.add_weighted(c, lambda p: {'chest': 0.72, 'neck': 0.28})
    return ob


def stand_collar(ch, color, r=0.115, flare=0.050, height=0.09, front=0.045, thick=0.03, gap=38.0, z=None, cy=0.014, squash=0.94,
                 lean=0.0, n=12, cls='sj_cloth', name='Collar', weights=None):
    """A popped stand collar: a wall round the neck, open at the front, low at the opening and `height` tall at the back.

    r: radius at its foot; flare: how much wider the top is at the back (it leans out, clear of the jaw);
    front: its height at the opening; gap: half the opening in degrees; z: foot height (default: the shoulder line);
    lean: tilts the top backwards (m at the back)."""
    h = ch.h
    z0 = h.sz + 0.060 if z is None else z
    a0 = math.radians(gap)
    rings = []
    for k in range(n + 1):
        a = lerp(a0, 2 * math.pi - a0, k / float(n))
        u = 0.5 * (1 - math.cos(a))                                    # 0 at the front .. 1 at the back
        e = smoothstep(0.0, 0.10, k / float(n)) * smoothstep(0.0, 0.10, 1 - k / float(n))
        hh = lerp(front, height, smoothstep(0.0, 0.75, u)) * (0.55 + 0.45 * e)
        out = vec(math.sin(a), -math.cos(a) * squash, 0)
        foot = vec(0, cy, z0) + out * r
        top = foot + out * (flare * (0.35 + 0.65 * u)) + vec(0, lean * u, hh)
        ax = unit(top - foot)
        side = unit(np.cross(vec(0, 0, 1), out))
        nrm = unit(np.cross(side, ax))                                 # outwards, square to the wall
        if np.dot(nrm, out) < 0:
            nrm = -nrm
        t2 = thick / 2
        rings.append([foot - nrm * t2, foot + nrm * t2, top + nrm * t2 - ax * t2 * 0.6, top + nrm * t2 * 0.45, top - nrm * t2 * 0.45,
                      top - nrm * t2 - ax * t2 * 0.6])
    ob = shapes.grid_mesh(name, rings, cap0='fan', cap1='fan')
    bl.recalc_normals(ob)
    shapes.hard(ob, 50.0)
    col.paint(ob, color, cls)
    return ch.add_weighted(ob, weights or (lambda p: {'chest': 0.72, 'neck': 0.28}))


def hoop(ch, name, color, centre, axis=(0, 0, 1), width=0.02, proud=0.004, thick=0.006, n=10, reach=0.10, targets=None, bone=None,
         weights=None, cls='sj_cloth', line=0.0):
    """A flat band hugging whatever is already there, round `centre`, square to `axis`: a sock stripe, a sleeve stripe,
    a belt, an arm band. It is found by ray casting, so it fits any limb or garment. bone: rigid on that bone;
    otherwise weights (fn(position) -> {bone: w}). reach: how far from the centre the surface is looked for (keep it
    under the distance to the next limb)."""
    from .util import perp
    bvh = _bvh(targets or ch.parts)
    c = np.asarray(centre, dtype=float)
    ax = unit(axis)
    e1 = perp(ax)
    e2 = np.cross(ax, e1)
    rad = []
    for i in range(n):
        th = 2 * math.pi * i / n
        d = e1 * math.cos(th) + e2 * math.sin(th)
        best = 0.0
        for dz in (-width / 2, 0.0, width / 2):
            hit = _outer_hit(bvh, c + ax * dz, d, far=reach)
            if hit is not None:
                best = max(best, float(np.dot(hit - c, d)))
        rad.append(best)
    rad = np.array(rad)
    rad = np.maximum(rad, (np.roll(rad, 1) + rad + np.roll(rad, -1)) / 3.0) + proud
    rings = []
    for i in range(n + 1):
        th = 2 * math.pi * (i % n) / n
        d = e1 * math.cos(th) + e2 * math.sin(th)
        p = c + d * rad[i % n]
        hw = width / 2
        rings.append([p + ax * hw - d * thick, p + ax * hw, p - ax * hw, p - ax * hw - d * thick])
    ob = shapes.grid_mesh(name, rings)
    bl.weld(ob, 1e-5)
    bl.recalc_normals(ob)
    shapes.hard(ob, 50.0)
    col.paint(ob, color, cls)
    if bone:
        return ch.add_rigid(ob, bone, line=line)
    return ch.add_weighted(ob, weights or chain_weights(ch), line=line)


def tab(ch, name, color, centre, size, bone='head', bevel=0.004, rot_z=0.0, cls='sj_hair', line=None):
    """A small rounded block stuck on a bone: a sideburn, a heel tab, a badge. size (x, y, z); rot_z degrees."""
    ob = shapes.box(name, size, bevel=bevel, segments=1, corner=bevel, steps=2) if bevel > 0 else shapes.block(name, size)
    P = bl.co(ob)
    if rot_z:
        a = math.radians(rot_z)
        x, y = P[:, 0].copy(), P[:, 1].copy()
        P[:, 0], P[:, 1] = x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
    bl.set_co(ob, P + np.asarray(centre, dtype=float))
    col.paint(ob, color, cls)
    return ch.add_rigid(ob, bone, line=line)


# ------------------------------------------------------------------ bands round a limb
def band(ch, name, color, fit=0.010, ext=0.008, lip=0.008, cls='sj_cloth', stripes=None, **select):
    """A band of cloth round a limb: wardrobe.band(ch, 'Sweatband', '#FFCE3A', forearm=(0.64, 0.86), sides='R').
    stripes: [(z0, z1, colour), ...] repaints the faces between two heights (sock bands)."""
    h = ch.h
    faces = h.select(**select)
    sh = h.cage.shell(faces, offset=fit, lip=lip, part='band', extend=(lambda p, m: ext) if ext else None, crease=0.3, wall=0.0)
    ob = ch.add_cage(sh, name, paint=color, cls=cls)
    if stripes:
        fc = bl.face_centres(ob)
        for z0, z1, c in stripes:
            col.paint(ob, c, cls, faces=(fc[:, 2] >= z0) & (fc[:, 2] < z1))
    ch.hide(faces)
    return ob


# ------------------------------------------------------------------ shoes
def hightops(ch, body='#FFF7E6', cap='#2EC4B6', sole='#FF8A1F', heel=None, lace=None, lining='#2B2740', collar=0.085,
             length=1.22, width=1.40, sole_h=0.040, name='Shoe'):
    """Chunky high-top trainers: outfit.sneaker_cage with a tall padded collar, a coloured toe cap, heel tab and sole band."""
    h = ch.h
    c = outfit.sneaker_cage(h, length=length, width=width, sole=sole_h, collar=collar, toe_up=0.016)
    for fi, t in enumerate(c.ft):
        if t.get('zone') == 'upper':
            ss = [c.meta[i].get('s') for i in c.f[fi]]
            if all(s is not None and s <= 0.14 for s in ss):
                t['zone'] = 'heel'
    pal = {'': (body, 'sj_cloth'), 'sole': (sole, 'sj_toon'), 'cap': (cap, 'sj_toon'), 'heel': (heel or cap, 'sj_toon'),
           'lace': (lace or body, 'sj_cloth'), 'collar': (body, 'sj_cloth'), 'lining': (lining, 'sj_cloth')}
    ch.hide(h.select(foot=True), interior=False)
    a = ch.add_cage(c, name + '_L', paint=pal, by='zone')
    b = ch.add_cage(c.mirrored(), name + '_R', paint=pal, by='zone')
    return a, b


# ------------------------------------------------------------------ slabs cut from outlines (hair, signs)
def _slab_rule(r):
    p0, p1 = np.asarray(r['line'][0], dtype=float), np.asarray(r['line'][1], dtype=float)
    d = p1 - p0
    ln = float(np.linalg.norm(d))
    d = d / ln
    n = np.array([d[1], -d[0]])
    if n[1] > 0:
        n = -n                       # the side of the line the band is on: below it
    return dict(r, p0=p0, d=d, n=n, len=ln, width=r.get('width', 0.0), face=r.get('face', 'any'), tol=r.get('tol', 0.004))


def slab(ch, name, pieces, depth, origin, lean=0.0, bevel=0.02, bone='head', spring=None, line=None):
    """Pieces cut from front-view 2D outlines and extruded front to back: Riff's hair.

    pieces: [dict(pts=[(x, y), ...], color=hex, cls='sj_hair', proud=0.0, bone=None, bevel=None, depth=None, y0=0.0,
                  cuts=[((y, z), (ny, nz)), ...], paint=[dict(line=((x0, z0), (x1, z1)), color=hex, face=..., width=...)])].
       cuts: side-view plane cuts (y = metres behind the piece's front face, z up): everything on the normal's side goes
          (a sloped back, a wedge), the hole is capped.
       paint: colour areas measured from an edge of the outline (`line`, two front-view points): face='top' the flat
          plane along that edge; face='front' a band `width` wide down the front face under it (and the bevel);
          face='any' a stripe `width` wide all round. The boundary is cut into the mesh, so it is crisp.
       x is the character's left, y is up, both from `origin`; `proud` grows a piece outwards by that much front and back
       (a cap that sits over the piece under it); bone: a piece that follows its own bone (telescoping plates).
    origin: (x, y_front, z) in Blender space: where (0, 0) of the outlines is, and the y of the front face.
    lean: degrees the whole slab tilts to the character's right (about the front-back axis through `origin`).
    spring: a chain name -> one spring bone spr_<chain>_1 at the root that the slab hangs from (jelly lag)."""
    o = np.asarray(origin, dtype=float)
    a = math.radians(lean)
    ca, sa = math.cos(a), math.sin(a)
    owner = bone
    if spring:
        top = max(p[1] for pc in pieces for p in pc['pts'])
        owner = ch.spring(spring, [o + vec(0, depth * 0.5, 0), o + vec(-sa * top, depth * 0.5, ca * top)], bone)[0]
    out = []
    for k, pc in enumerate(pieces):
        pr = pc.get('proud', 0.0)
        d = pc.get('depth', depth) + 2 * pr
        ob = shapes.extrude('%s_%d' % (name, k), pc['pts'], d, bevel=pc.get('bevel', bevel) if pc.get('bevel', bevel) is not None else bevel,
                            segments=pc.get('segments', 1), plane='xz', smooth_angle=30.0)
        for (cy, cz), (ny, nz) in pc.get('cuts', ()):
            shapes.cut(ob, (0.0, cy + pr, cz), (0.0, ny, nz))
        rules = [_slab_rule(r) for r in pc.get('paint', ())]
        for r in rules:
            if r['width']:
                q = r['p0'] + r['n'] * r['width']
                shapes.score(ob, (q[0], 0.0, q[1]), (r['n'][0], 0.0, r['n'][1]))
        if pc.get('cuts') or rules:
            shapes.hard(ob, 30.0)
        col.paint(ob, pc['color'], pc.get('cls', 'sj_hair'))
        if rules:
            fc, fn = bl.face_centres(ob), bl.face_normals(ob)
            xz = fc[:, [0, 2]]
            for r in rules:
                sdist = (xz - r['p0']) @ r['n']
                t = (xz - r['p0']) @ r['d']
                m = (t > -r['tol']) & (t < r['len'] + r['tol'])
                if r['face'] == 'top':
                    m &= (fn[:, [0, 2]] @ (-r['n']) > 0.6) & (np.abs(sdist) < 0.03)
                else:
                    m &= (sdist > -0.03) & (sdist < r['width'])
                    if r['face'] == 'front':
                        m &= (fn[:, 1] < -0.5) | ((fn[:, [0, 2]] @ (-r['n']) > 0.5) & (fc[:, 1] < 0.05))
                col.paint(ob, r['color'], r.get('cls') or pc.get('cls', 'sj_hair'), faces=m)
        P = bl.co(ob)
        x, y, z = P[:, 0].copy(), P[:, 1] - pr + pc.get('y0', 0.0), P[:, 2].copy()
        P[:, 0] = o[0] + x * ca - z * sa
        P[:, 1] = o[1] + y
        P[:, 2] = o[2] + x * sa + z * ca
        bl.set_co(ob, P)
        b = pc.get('bone')
        if b and b not in ch.joints:
            # a slider bone: head at the piece's base centre, pointing up the slab
            c2 = np.mean(np.asarray(pc['pts'], dtype=float), axis=0)
            base = o + vec(c2[0] * ca - c2[1] * sa, depth * 0.5, c2[0] * sa + c2[1] * ca)
            ch.joints[b] = (base, base + vec(-sa, 0, ca) * 0.05)
            ch.parents[b] = owner
        ch.add_rigid(ob, b or owner, line=pc.get('line', line))
        out.append(ob)
    return out


# ------------------------------------------------------------------ things lying on the clothes
def strap(ch, color, a, b, width=0.08, thick=0.014, gap=0.004, n=22, squares=0, square_color='#2B2740', targets=None,
          cls='sj_cloth', name='Strap'):
    """A strap round the torso through `a` (over a shoulder) and `b` (at the opposite hip), in the plane that
    holds both and the front-back axis, lying on whatever clothes are already on the character.
    squares: this many small ink squares along the front run."""
    bvh = _bvh(targets or ch.parts)
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    C = (a + b) / 2
    u = unit(a - b)
    fwd = vec(0, -1, 0)
    dirs, rad = [], []
    for i in range(n):
        th = 2 * math.pi * i / n
        d = unit(u * math.cos(th) + fwd * math.sin(th))
        hit = _outer_hit(bvh, C, d)
        dirs.append(d)
        rad.append(float(np.dot(hit - C, d)) if hit is not None else 0.1)
    rad = np.array(rad)
    sm = rad.copy()
    for _ in range(3):
        sm = (np.roll(sm, 1) + sm * 2 + np.roll(sm, -1)) / 4
    rad = np.maximum(rad, sm) + gap + thick / 2
    pts = np.array([C + d * r for d, r in zip(dirs, rad)])
    side = unit(np.cross(u, fwd))                      # across the strap's width
    rings = []
    hw, ht = width / 2, thick / 2
    prof = [(-hw, -ht), (-hw * 0.5, -ht), (hw * 0.5, -ht), (hw, -ht), (hw, ht), (hw * 0.5, ht), (-hw * 0.5, ht), (-hw, ht)]
    for i in range(n + 1):
        k = i % n
        t = unit(pts[(k + 1) % n] - pts[(k - 1) % n])
        out = unit(np.cross(side, t))
        if np.dot(out, dirs[k]) < 0:
            out = -out
        rings.append([pts[k] + side * px + out * py for px, py in prof])
    ob = shapes.grid_mesh(name, rings)
    bl.weld(ob, 1e-5)
    bl.recalc_normals(ob)
    shapes.hard(ob, 50.0)
    col.paint(ob, color, cls)
    wfn = chain_weights(ch)
    ch.add_weighted(ob, wfn)
    if squares:
        s = width * 0.42
        for j in range(squares):
            th = math.radians(lerp(32, 150, j / max(1, squares - 1)))
            f = th / (2 * math.pi) * n
            k0 = int(f) % n
            p = lerp(pts[k0], pts[(k0 + 1) % n], f - int(f))
            d = unit(lerp(dirs[k0], dirs[(k0 + 1) % n], f - int(f)))
            t = unit(pts[(k0 + 1) % n] - pts[k0])
            outv = unit(np.cross(side, t))
            if np.dot(outv, d) < 0:
                outv = -outv
            c0 = p + outv * (ht + 0.0015)
            V = [c0 + t * (sx * s / 2) + side * (sy * s / 2) + outv * sz for sz in (-0.003, 0.0015) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            F = [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
            q = bl.new_object('%s_sq%d' % (name, j), V, F, smooth=False)
            bl.recalc_normals(q)
            col.paint(q, square_color, cls)
            ch.add_weighted(q, wfn, line=0.0)
    return ob


def patch(ch, name, shapes2d, color, centre, back=True, lift=0.004, cls='sj_cloth', targets=None, levels=3):
    """Flat appliques pressed onto the clothes: each shape is a closed 2D outline [(x, z), ...] (or a dict
    {'ring': (r_outer, r_inner), 'n': 32}) round `centre` = (x, z), projected onto the front or the back."""
    bvh = _bvh(targets or ch.parts)
    cx, cz = centre
    sgn = 1.0 if back else -1.0
    V, F = [], []
    for sh in shapes2d:
        if isinstance(sh, dict):
            ro, ri = sh['ring']
            m = sh.get('n', 32)
            rr = [lerp(ro, ri, k / 2.0) for k in range(3)]
            rings = [[(r * math.cos(2 * math.pi * i / m), r * math.sin(2 * math.pi * i / m)) for i in range(m)] for r in rr]
            fan = False
        else:
            P = np.asarray(sh, dtype=float)
            if shapes.polygon_area(P) < 0:
                P = P[::-1]
            c0 = P.mean(axis=0)
            m = len(P)
            rings = [[tuple(c0 + (p - c0) * (1 - k / float(levels))) for p in P] for k in range(levels)]
            fan = True
        base = len(V)
        for r in rings:
            V.extend(r)
        for k in range(len(rings) - 1):
            for i in range(m):
                j = (i + 1) % m
                q = (base + k * m + i, base + k * m + j, base + (k + 1) * m + j, base + (k + 1) * m + i)
                F.append(q if back else q[::-1])
        if fan:
            ci = len(V)
            V.append(tuple(np.mean(np.asarray(rings[-1]), axis=0)))
            for i in range(m):
                j = (i + 1) % m
                t = (base + (len(rings) - 1) * m + i, base + (len(rings) - 1) * m + j, ci)
                F.append(t if back else t[::-1])
    V3 = []
    for x, z in V:
        o = vec(cx + x, 0.0, cz + z)
        hit = _outer_hit(bvh, o, vec(0, sgn, 0))
        y = (hit[1] if hit is not None else 0.0) + sgn * lift
        V3.append((cx + x, y, cz + z))
    # outline points are counter-clockwise seen from +Y looking at -Y... make the normals face outwards
    ob = bl.new_object(name, V3, F, smooth=True)
    fn = bl.face_normals(ob)
    if np.mean(fn[:, 1]) * sgn < 0:
        ob.data.flip_normals()
        ob.data.update()
    col.paint(ob, color, cls)
    ch.add_weighted(ob, chain_weights(ch), line=0.0)
    return ob


# ------------------------------------------------------------------ small things
def nails(ch, colors, side='L', size=0.021, name='Nail'):
    """Flat finger nails on one hand: colors = {'index': hex, 'middle': hex, 'pinky': hex, 'thumb': hex}."""
    J = ch.joints
    sp = ch.h.spec
    s = 1.0 if side == 'L' else -1.0
    D = ch.h.D * vec(s, 1, 1)
    out = []
    for f, hexcol in colors.items():
        b = '%s2_%s' % (f, side)
        if b not in J:
            continue
        head, tail = J[b][0], J[b][1]
        u = unit(tail - head)
        n = unit(D - u * np.dot(D, u))
        w = np.cross(u, n)
        r = sp.finger_r * (1.1 if f == 'thumb' else 1.0)
        c0 = tail - u * (size * 0.62) + n * (r * 1.0)
        hl, hw = size / 2, size * 0.46
        V = [c0 + u * (a * hl) + w * (c * hw) + n * (0.0025 - 0.004 * abs(c) - 0.003 * max(a, 0)) for a, c in ((-1, -1), (1, -0.8), (1, 0.8), (-1, 1), (0, 0))]
        F = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
        ob = bl.new_object('%s_%s_%s' % (name, f, side), V, F, smooth=True)
        fn = bl.face_normals(ob)
        if float(np.mean(fn @ n)) < 0:
            ob.data.flip_normals()
            ob.data.update()
        col.paint(ob, hexcol, 'sj_gloss')
        ch.add_rigid(ob, b, line=0.0)
        out.append(ob)
    return out


def charm(ch, name, pts2d, color, at, yaw=30.0, thick=0.010, bone='head', spring=None, cls='sj_gloss', drop=0.012):
    """A small plate hanging from a point (an earring): outline [(x, z)] with (0, 0) at the hanging point, z down negative.
    yaw: degrees the plate is turned out of the front plane so it reads from the front and the side."""
    ob = shapes.extrude(name, pts2d, thick, bevel=thick * 0.3, segments=1, plane='xz')
    a = math.radians(yaw)
    at = np.asarray(at, dtype=float)
    P = bl.co(ob)
    x, y, z = P[:, 0].copy(), P[:, 1] - thick / 2, P[:, 2].copy()
    P[:, 0] = at[0] + x * math.cos(a) - y * math.sin(a)
    P[:, 1] = at[1] + x * math.sin(a) + y * math.cos(a)
    P[:, 2] = at[2] - drop + z
    bl.set_co(ob, P)
    col.paint(ob, color, cls)
    low = min(p[1] for p in pts2d)
    if spring:
        names = ch.spring(spring, [at, at + vec(0, 0, low - drop)], bone)
        return ch.add_rigid(ob, names[0], line=0.7)
    return ch.add_rigid(ob, bone, line=0.7)


def pick_outline(w=0.06, h=0.066, n=24, point=0.34):
    """A guitar pick: a rounded triangle, point down, hanging point (0, 0) at the top centre. [(x, z)]."""
    ctl = [(-w * 0.50, -h * 0.20), (-w * 0.34, -h * 0.03), (0.0, 0.0), (w * 0.34, -h * 0.03), (w * 0.50, -h * 0.20),
           (w * 0.36, -h * 0.58), (w * point * 0.32, -h * 0.94), (0.0, -h), (-w * point * 0.32, -h * 0.94), (-w * 0.36, -h * 0.58)]
    return [tuple(p) for p in shapes.outline(ctl, n=n, tension=0.5)]


# ------------------------------------------------------------------ high-tops cut from a side outline
def kicks(ch, body='#FFF7E6', cap='#2EC4B6', sole='#FF8A1F', heel='#2EC4B6', lace='#2B2740', roll=None, length=0.40, width=0.17,
          top=0.19, sole_h=0.04, step=0.01, tongue=0.03, laces=3, heel_y=None, toe_out=0.0, name='Kick'):
    """Chunky high-top trainers, each cut from a side outline (graphic, hard-edged): an even sole band that steps out
    from the upper, a toe cap, a padded collar roll round the ankle, a tongue block above it, fat lace bars across the
    instep and a heel tab. Rigid on the foot, the front follows the toe bone. Hides the bare feet.

    length / width / top: the shoe's size (m); sole_h / step: the sole band and how far it stands out; tongue: how far
    the tongue rises above the collar; laces: number of bars; toe_out: degrees the shoes turn out at rest."""
    h = ch.h
    A = h.A
    hy = A[1] + 0.30 * length if heel_y is None else heel_y
    L, W = length, width
    ball_u = hy - ch.joints['toe_L'][0][1]

    def hw(u):                                                         # half width in plan view: narrower heel, round toe
        return (W / 2) * (0.84 + 0.16 * smoothstep(0.0, 0.55 * L, u)) * (max(0.0, 1 - max(0.0, (u - 0.62 * L) / (0.42 * L)) ** 2.2)) ** 0.5

    cu = 0.155 * L                                                     # the ankle's place along the shoe
    up = [(0.004, sole_h - 0.004), (-0.004, 0.50 * top), (0.012, top), (0.29 * L, top - 0.004), (0.30 * L, top + tongue),
          (0.385 * L, top + tongue - 0.004), (0.43 * L, top - 0.02), (0.70 * L, 0.60 * top), (0.86 * L, 0.56 * top), (0.975 * L, 0.42 * top),
          (0.995 * L, sole_h - 0.004)]
    so = [(-0.008, 0.0), (-0.012, sole_h), (L + 0.006, sole_h + 0.008), (L + 0.010, 0.016), (0.93 * L, 0.0)]
    out = []
    for sgn, S in ((1.0, 'L'), (-1.0, 'R')):
        parts = []

        def place_x(ob, widen=0.0):
            """An outline extruded along +X: put it on the foot, heel at hy, toe to -Y, shaped in plan view."""
            P = bl.co(ob)
            u = P[:, 1].copy()
            t = (P[:, 0] / W) * 2 - 1                                  # -1 inner .. 1 outer
            k = np.array([hw(x) for x in u])
            P[:, 0] = (t * (k + widen)) * sgn + A[0] * sgn
            P[:, 1] = hy - u
            bl.set_co(ob, P)
            bl.recalc_normals(ob)
            return ob

        upper = shapes.extrude('%s_up_%s' % (name, S), shapes.rounded(up, [0.012, 0.03, 0.022, 0.006, 0.014, 0.016, 0.02, 0.05, 0.05, 0.04, 0.012], steps=2),
                               W, bevel=0.02, segments=1, plane='yz')
        shapes.score(upper, (0, 0.74 * L, 0), (0, 1, 0))
        col.paint(upper, body, 'sj_cloth')
        fc = bl.face_centres(upper)
        col.paint(upper, cap, 'sj_toon', faces=fc[:, 1] > 0.74 * L)
        parts.append(place_x(upper))
        sl = shapes.extrude('%s_sole_%s' % (name, S), shapes.rounded(so, [0.012, 0.012, 0.016, 0.014, 0.03], steps=2), W, bevel=0.004, segments=1, plane='yz')
        col.paint(sl, sole, 'sj_toon')
        parts.append(place_x(sl, widen=step))
        # the collar roll
        n = 10
        rx, ry = hw(cu) - 0.012, 0.135 * L
        ring = [vec(A[0] * sgn + rx * math.cos(2 * math.pi * i / n), hy - cu - 0.004 + ry * math.sin(2 * math.pi * i / n),
                    top - 0.004 + 0.010 * math.sin(2 * math.pi * i / n)) for i in range(n)]
        rings = []
        for i in range(n + 1):
            p = ring[i % n]
            tg = unit(ring[(i + 1) % n] - ring[(i - 1) % n])
            o = unit(np.cross(tg, vec(0, 0, 1)))
            rings.append([p + (o * math.cos(a) + vec(0, 0, 1) * math.sin(a)) * 0.017 for a in [2 * math.pi * j / 5 for j in range(5)]])
        rl = shapes.grid_mesh('%s_roll_%s' % (name, S), rings)
        bl.weld(rl, 1e-5)
        bl.recalc_normals(rl)
        col.paint(rl, roll or body, 'sj_cloth')
        parts.append(rl)
        # lace bars across the instep
        p0, p1 = np.array(up[6]), np.array(up[7])
        sl_a = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
        for j in range(laces):
            f = (j + 0.6) / (laces + 0.2)
            q = lerp(p0, p1, f)
            wbar = hw(q[0]) * 2 - 0.05
            bar = shapes.block('%s_lace%d_%s' % (name, j, S), (wbar, 0.022, 0.016))
            P = bl.co(bar)
            yy, zz = P[:, 1].copy(), P[:, 2].copy()
            P[:, 1] = hy - (q[0] + yy * math.cos(sl_a) - zz * math.sin(sl_a))
            P[:, 2] = q[1] + 0.001 + yy * math.sin(sl_a) + zz * math.cos(sl_a)
            P[:, 0] += A[0] * sgn
            bl.set_co(bar, P)
            bl.recalc_normals(bar)
            col.paint(bar, lace, 'sj_cloth')
            outline.set_weight(bar, 0.0)
            parts.append(bar)
        if heel:
            hb = shapes.block('%s_heel_%s' % (name, S), (0.05, 0.016, top - sole_h - 0.03),
                            centre=(A[0] * sgn, hy + 0.002, (top + sole_h) / 2 + 0.012))
            col.paint(hb, heel, 'sj_toon')
            outline.set_weight(hb, 0.5)
            parts.append(hb)
        for o in parts:
            outline.ensure_weight(o)
        ob = bl.join(parts, '%s_%s' % (name, S))
        if toe_out:
            a = math.radians(toe_out) * sgn
            P = bl.co(ob)
            x, y = P[:, 0] - A[0] * sgn, P[:, 1] - A[1]
            P[:, 0], P[:, 1] = A[0] * sgn + x * math.cos(a) + y * math.sin(a), A[1] - x * math.sin(a) + y * math.cos(a)
            bl.set_co(ob, P)
        by = hy - ball_u

        def wfn(p, S=S, by=by):
            wt = smoothstep(by + 0.03, by - 0.03, p[1]) * smoothstep(0.75 * top, 0.5 * top, p[2])
            return {'foot_' + S: 1 - wt, 'toe_' + S: wt}
        ch.add_weighted(ob, wfn)
        out.append(ob)
    ch.hide(h.select(foot=True), interior=False)
    return out
