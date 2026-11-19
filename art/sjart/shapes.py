"""Shape builders that return finished Blender mesh objects (clean quads, deliberate forms).

For organic, skinned forms use a Cage (cage.py) so Catmull-Clark and the weights do the work;
these builders are for hard-surface parts and props: guitars, amps, hats, buckles, venue pieces.

All builders work in Blender space (metres, Z up) and return an object at the origin.
"""
import math
import bpy
import numpy as np
from . import bl
from .util import vec, unit, perp, Curve, resample, smooth_closed
from .cage import ring2d, place


# ------------------------------------------------------------------ low level
def grid_mesh(name, rings, closed_u=True, cap0=None, cap1=None, smooth=True):
    """Quad strip mesh through a list of rings (each an (n, 3) array; ring i+1 follows ring i).

    cap0 / cap1: None (open), 'flat' (one n-gon), 'fan' (centre point), 'round' (a small dome:
    two shrinking rings then a centre point). Rings must run counter-clockwise seen from the
    direction the loft travels in, so faces point outward."""
    rings = [np.asarray(r, dtype=np.float64) for r in rings]
    n = len(rings[0])
    V = []
    idx = []
    for r in rings:
        assert len(r) == n, 'grid_mesh: rings differ in length'
        idx.append(list(range(len(V), len(V) + n)))
        V.extend(r)
    F = []
    for a, b in zip(idx[:-1], idx[1:]):
        for i in range(n if closed_u else n - 1):
            j = (i + 1) % n
            F.append((a[i], a[j], b[j], b[i]))

    def cap(ring_ids, pts, kind, flip, prev):
        if kind is None:
            return
        order = (lambda f: tuple(reversed(f))) if flip else (lambda f: tuple(f))
        if kind == 'flat':
            F.append(order(ring_ids))
            return
        c = pts.mean(axis=0)
        axis = unit(c - prev.mean(axis=0)) if prev is not None else vec(0, 0, 1)
        cur = ring_ids
        if kind == 'round':
            rad = float(np.linalg.norm(pts - c, axis=1).mean())
            for s, hgt in ((0.80, 0.42), (0.42, 0.80)):
                p2 = c + (pts - c) * s + axis * rad * hgt * 0.55
                nxt = list(range(len(V), len(V) + n))
                V.extend(p2)
                for i in range(n):
                    j = (i + 1) % n
                    F.append(order((cur[i], cur[j], nxt[j], nxt[i])))
                cur = nxt
            c = c + axis * rad * 0.55
        ci = len(V)
        V.append(c)
        for i in range(n):
            j = (i + 1) % n
            F.append(order((cur[i], cur[j], ci)))

    if closed_u:
        cap(idx[0], rings[0], cap0, True, rings[1] if len(rings) > 1 else None)
        cap(idx[-1], rings[-1], cap1, False, rings[-2] if len(rings) > 1 else None)
    return bl.new_object(name, V, F, smooth=smooth)


# ------------------------------------------------------------------ loft
def loft(name, sections, n=16, steps=None, caps=('round', 'round'), kind='pchip', axis='z', front=(0, -1, 0)):
    """Loft through cross-sections: dicts with t, c (centre), rx, ry (or ryf / ryb), e (or ef / eb),
    pitch (see cage.Loft). n columns round; `steps` rings in total (default: 3 per span).
    Use this for standalone smooth solids (hats, bottles, speaker horns); for body parts use a Cage."""
    from .cage import Loft
    L = Loft(sections, axis=axis, front=front, kind=kind)
    steps = steps or (len(sections) - 1) * 3 + 1
    ts = np.linspace(L.t0, L.t1, steps)
    rings = [L.ring(t, n, comp=False) for t in ts]
    return grid_mesh(name, rings, cap0=caps[0], cap1=caps[1])


# ------------------------------------------------------------------ tube along a spline
def spline(points, n, kind='cr'):
    """n points along a smooth curve through `points` (arc-length even)."""
    P = np.asarray(points, dtype=np.float64)
    c = Curve([(i, p) for i, p in enumerate(P)], kind)
    dense = np.array([c(t) for t in np.linspace(0, len(P) - 1, max(n * 8, 64))])
    return resample(dense, n)


def frames(path, up=(0, 0, 1)):
    """Rotation-minimising frames along a polyline: (tangent, normal, binormal) arrays.
    The first normal is as close to `up` as possible; later ones are parallel-transported,
    so the tube never twists or flips, whatever the path does."""
    P = np.asarray(path, dtype=np.float64)
    m = len(P)
    T = np.zeros_like(P)
    for i in range(m):
        T[i] = unit(P[min(i + 1, m - 1)] - P[max(i - 1, 0)])
    N = np.zeros_like(P)
    N[0] = perp(T[0], up)
    for i in range(1, m):
        v = N[i - 1] - T[i] * np.dot(N[i - 1], T[i])
        N[i] = unit(v) if np.linalg.norm(v) > 1e-9 else perp(T[i], up)
    B = np.cross(T, N)
    return T, N, B


def tube(name, points, radius, n=8, segments=None, caps=('round', 'round'), up=(0, 0, 1), e=2.0, flat=1.0, twist=0.0):
    """Sweep a (super)elliptic section along a smooth curve through `points`.

    radius: a number, a list of (t 0..1, r) keys, or f(t) -> r.   flat: binormal radius / normal radius
    (0.4 = a strap or ribbon).   twist: total twist in radians along the tube.   segments: rings (default by length)."""
    P = np.asarray(points, dtype=np.float64)
    if segments is None:
        segments = max(2, len(P) * 3)
    path = spline(P, segments + 1) if len(P) > 2 else resample(P, segments + 1)
    if callable(radius):
        rf = radius
    elif np.ndim(radius) == 0:
        rf = lambda t: float(radius)
    else:
        rf = Curve(list(radius), 'pchip')
    T, N, B = frames(path, up)
    rings = []
    for i, p in enumerate(path):
        t = i / (len(path) - 1)
        r = rf(t)
        p2 = ring2d(n, r, r * flat, ef=e)
        a = twist * t
        ex = N[i] * math.cos(a) + B[i] * math.sin(a)
        ey = np.cross(T[i], ex)
        rings.append(place(p2, p, ex, ey))
    return grid_mesh(name, rings, cap0=caps[0], cap1=caps[1])


# ------------------------------------------------------------------ lathe
def lathe(name, profile, n=16, axis=(0, 0, 1), origin=(0, 0, 0), smooth_angle=40.0):
    """Revolve a profile [(radius, height), ...] (bottom to top) about an axis.
    Points with radius 0 at either end close the form with a pole; otherwise the ends are capped flat.
    Edges sharper than smooth_angle degrees stay hard (knobs, pegs, cymbal stands)."""
    prof = [(float(r), float(h)) for r, h in profile]
    ax = unit(vec(axis))
    ex = perp(ax, (1, 0, 0))
    ey = np.cross(ax, ex)
    o = vec(origin)
    V, F = [], []
    rows = []
    for r, h in prof:
        if r <= 1e-9:
            rows.append([len(V)])
            V.append(o + ax * h)
        else:
            ids = []
            for k in range(n):
                a = 2 * math.pi * k / n
                ids.append(len(V))
                V.append(o + ax * h + (ex * math.cos(a) + ey * math.sin(a)) * r)
            rows.append(ids)
    for a, b in zip(rows[:-1], rows[1:]):
        for k in range(n):
            j = (k + 1) % n
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                F.append((a[0], b[j], b[k]))
            elif len(b) == 1:
                F.append((a[k], a[j], b[0]))
            else:
                F.append((a[k], a[j], b[j], b[k]))
    if len(rows[0]) > 1:
        F.append(tuple(reversed(rows[0])))
    if len(rows[-1]) > 1:
        F.append(tuple(rows[-1]))
    ob = bl.new_object(name, V, F)
    return hard(ob, smooth_angle)


def cylinder(name, r, h, n=16, bevel=0.0, axis=(0, 0, 1), origin=(0, 0, 0)):
    """A capped cylinder from height 0 to h along `axis`, with an optional rounded rim."""
    b = min(bevel, r * 0.49, h * 0.49)
    if b > 0:
        k = 0.2929 * b      # 45 degree point of the rim arc
        prof = [(r - b, 0), (r - k, k), (r, b), (r, h - b), (r - k, h - k), (r - b, h)]
    else:
        prof = [(r, 0), (r, h)]
    return lathe(name, prof, n=n, axis=axis, origin=origin, smooth_angle=50.0 if b > 0 else 30.0)


# ------------------------------------------------------------------ extruded outline
def outline(points, n=64, tension=0.5):
    """A smooth closed 2D outline through control points, as n evenly spaced points."""
    return smooth_closed(np.asarray(points, dtype=np.float64), n, tension)


def polygon_area(P):
    P = np.asarray(P)
    x, y = P[:, 0], P[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def inset(P, d):
    """Move a closed 2D outline inwards by d (outwards when d < 0), mitred."""
    P = np.asarray(P, dtype=np.float64)
    if polygon_area(P) < 0:
        return inset(P[::-1], d)[::-1]
    prv, nxt = np.roll(P, 1, axis=0), np.roll(P, -1, axis=0)
    e1 = P - prv
    e2 = nxt - P
    e1 /= np.maximum(np.linalg.norm(e1, axis=1), 1e-12)[:, None]
    e2 /= np.maximum(np.linalg.norm(e2, axis=1), 1e-12)[:, None]
    n1 = np.stack([-e1[:, 1], e1[:, 0]], axis=1)   # left normals = inward for a CCW polygon
    n2 = np.stack([-e2[:, 1], e2[:, 0]], axis=1)
    m = n1 + n2
    ln = np.maximum(np.linalg.norm(m, axis=1), 1e-9)
    m /= ln[:, None]
    cosh = np.clip((m * n1).sum(axis=1), 0.35, 1.0)
    return P + m * (d / cosh)[:, None]


def extrude(name, pts2d, depth, bevel=0.004, segments=2, plane='xz', back_bevel=None, smooth_angle=35.0):
    """A plate cut from a closed 2D outline, with rounded edges on both faces.

    pts2d  the outline (any winding), e.g. from `outline(...)`.
    depth  thickness. The plate spans 0..depth along the plane's normal:
           plane 'xy' -> +Z (outline is x, y);  'xz' -> +Y (outline is x, z), so its FRONT face is at y = 0
           facing -Y, like a character;  'yz' -> +X.
    bevel  edge rounding radius (front; back_bevel for the back face, default the same), `segments` steps.
    The caps are single flat n-gons (hard-surface flat faces shade perfectly flat), side walls are quads."""
    P = np.asarray(pts2d, dtype=np.float64)
    if polygon_area(P) < 0:
        P = P[::-1]
    n = len(P)
    bb = bevel if back_bevel is None else back_bevel
    layers = []   # (inset distance, depth position)
    for k in range(segments + 1):
        a = (math.pi / 2) * k / max(segments, 1)
        if bevel > 0:
            layers.append((bevel * (1 - math.sin(a)), bevel * (1 - math.cos(a))))
    if bevel <= 0:
        layers.append((0.0, 0.0))
    back = []
    for k in range(segments + 1):
        a = (math.pi / 2) * k / max(segments, 1)
        if bb > 0:
            back.append((bb * (1 - math.sin(a)), depth - bb * (1 - math.cos(a))))
    if bb <= 0:
        back.append((0.0, depth))
    layers += back[::-1]

    def lift(p2, d):
        if plane == 'xy':
            return np.stack([p2[:, 0], p2[:, 1], np.full(n, d)], axis=1)
        if plane == 'xz':
            return np.stack([p2[:, 0], np.full(n, d), p2[:, 1]], axis=1)
        return np.stack([np.full(n, d), p2[:, 0], p2[:, 1]], axis=1)

    V, rows = [], []
    for ins, d in layers:
        q = inset(P, ins) if ins > 0 else P
        rows.append(list(range(len(V), len(V) + n)))
        V.extend(lift(q, d))
    F = [tuple(rows[0]), tuple(reversed(rows[-1]))]
    for a, b in zip(rows[:-1], rows[1:]):
        for i in range(n):
            j = (i + 1) % n
            F.append((a[j], a[i], b[i], b[j]))
    ob = bl.new_object(name, V, F)
    bl.recalc_normals(ob)
    return hard(ob, smooth_angle)


def box(name, size, bevel=0.003, segments=2, centre=(0, 0, 0), corner=None, steps=4):
    """A rounded box. size (x, y, z); `corner` rounds the outline seen from the front (xz) more than the edges."""
    sx, sy, sz = size
    c = corner if corner is not None else bevel
    c = min(c, sx * 0.49, sz * 0.49)
    pts = []
    for cx, cz, a0 in ((sx / 2 - c, sz / 2 - c, 0), (-sx / 2 + c, sz / 2 - c, 90), (-sx / 2 + c, -sz / 2 + c, 180), (sx / 2 - c, -sz / 2 + c, 270)):
        steps = steps if c > 0.002 else 1
        for k in range(steps + 1):
            a = math.radians(a0 + 90.0 * k / steps)
            pts.append((cx + c * math.cos(a), cz + c * math.sin(a)))
    ob = extrude(name, pts, sy, bevel=min(bevel, sy * 0.49), segments=segments, plane='xz')
    bl.transform(ob, loc=(centre[0], centre[1] - sy / 2, centre[2]))
    return ob


def block(name, size, centre=(0, 0, 0)):
    """A plain sharp-edged box (12 triangles): frets, nuts, small hardware where a bevel would be sub-pixel."""
    sx, sy, sz = (x / 2.0 for x in size)
    cx, cy, cz = centre
    V = [(cx + a * sx, cy + b * sy, cz + c * sz) for a in (-1, 1) for b in (-1, 1) for c in (-1, 1)]
    F = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    ob = bl.new_object(name, V, F, smooth=False)
    bl.recalc_normals(ob)
    return ob


# ------------------------------------------------------------------ finishing
def hard(ob, smooth_angle=35.0):
    """Hard-surface shading: smooth, edges sharper than the angle stay crisp, and normals weighted by
    face area so big flat faces stay perfectly flat next to a bevel (no cel-shading blotches)."""
    bl.shade(ob, True, sharp_angle=math.radians(smooth_angle))
    bl.modify(ob, 'WEIGHTED_NORMAL', keep_sharp=True, weight=100, mode='FACE_AREA')
    return ob


def bevel(ob, width=0.003, segments=2, angle=35.0):
    """Round every edge sharper than `angle` degrees."""
    bl.modify(ob, 'BEVEL', width=width, segments=segments, limit_method='ANGLE', angle_limit=math.radians(angle),
              harden_normals=False)
    return hard(ob, angle)


def solidify(ob, thickness=0.004, offset=-1.0, rim=True):
    """Give a surface thickness (offset -1 = grow inwards, +1 = outwards)."""
    return bl.modify(ob, 'SOLIDIFY', thickness=thickness, offset=offset, use_rim=rim, use_even_offset=True)


def union(name, objs, voxel=None, smooth=0, exact=True):
    """Merge solids into one watertight mesh.

    voxel=None : exact boolean union (hard-surface: keeps every face as authored).
    voxel=size : boolean union, then a voxel remesh at that size and `smooth` Laplacian passes:
                 an SDF-style blend with soft fillets where the parts met (organic merges: a hair
                 mass from several tufts, a blobby prop). Remeshed geometry is dense: decimate or
                 use it as a source for a hand-built cage when triangles matter."""
    base = bl.duplicate(objs[0], name)
    for o in objs[1:]:
        m = base.modifiers.new('u', 'BOOLEAN')
        m.operation = 'UNION'
        m.object = o
        m.solver = 'EXACT' if exact else 'FLOAT'
        bl.apply_modifiers(base)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    if voxel:
        bl.modify(base, 'REMESH', mode='VOXEL', voxel_size=voxel, use_smooth_shade=True)
        if smooth:
            bl.modify(base, 'LAPLACIANSMOOTH', iterations=smooth, lambda_factor=1.0, use_volume_preserve=True)
        base.data.shade_smooth()
    return base


def decimate(ob, ratio=0.5):
    return bl.modify(ob, 'DECIMATE', ratio=ratio)
