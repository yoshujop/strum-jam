"""Ink outline attributes for the runtime's inverted-hull pass.

_SJOUT   vec3  the direction to push a vertex for the hull: a smoothed normal, identical for
               all vertices that share a position (so hard edges and seams do not crack open).
               Stored in glTF axes (Y up, +Z front), because the exporter does not convert
               custom attributes.
_SJOUTW  float 0..1 line thickness weight: 1 = full line, less on thin parts (fingers, ears,
               hair tips), 0 = no line.

While building, parts can carry a POINT float attribute "sj_outw" (a multiplier, default 1)
that survives joins; `outline_attrs` folds it into _SJOUTW at the end.
"""
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from . import bl

MULT = 'sj_outw'


def set_weight(ob, value, verts=None):
    """Set the outline weight multiplier of a part (or of some of its vertices: mask or indices)."""
    me = ob.data
    a = me.attributes.get(MULT) or me.attributes.new(MULT, 'FLOAT', 'POINT')
    n = len(me.vertices)
    cur = np.ones(n, dtype=np.float32)
    if a.data and len(a.data) == n:
        a.data.foreach_get('value', cur)
        if not cur.any() and verts is not None:
            cur[:] = 1.0
    if verts is None:
        cur[:] = value
    else:
        cur[np.asarray(verts)] = value
    a.data.foreach_set('value', cur)
    return ob


def _ensure_mult(ob):
    me = ob.data
    a = me.attributes.get(MULT)
    if a is None:
        a = me.attributes.new(MULT, 'FLOAT', 'POINT')
        a.data.foreach_set('value', np.ones(len(me.vertices), dtype=np.float32))
    return a


def ensure_weight(ob):
    """Make sure the multiplier attribute exists (call on every part before joining, so the
    join does not fill missing values with 0)."""
    _ensure_mult(ob)
    return ob


def smoothed_normals(ob, weld=1e-4):
    """Area-weighted vertex normals, averaged over all vertices at the same position."""
    me = ob.data
    P = bl.co(ob)
    nl = len(me.loops)
    lv = np.zeros(nl, dtype=np.int32)
    me.loops.foreach_get('vertex_index', lv)
    npoly = len(me.polygons)
    tot = np.zeros(npoly, dtype=np.int32)
    me.polygons.foreach_get('loop_total', tot)
    start = np.zeros(npoly, dtype=np.int32)
    me.polygons.foreach_get('loop_start', start)
    fn = bl.face_normals(ob)
    area = np.zeros(npoly, dtype=np.float32)
    me.polygons.foreach_get('area', area)
    lf = np.zeros(nl, dtype=np.int32)
    for i in range(npoly):
        lf[start[i]:start[i] + tot[i]] = i
    keys = np.round(P / weld).astype(np.int64)
    _, inv = np.unique(keys, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    G = np.zeros((inv.max() + 1, 3))
    np.add.at(G, inv[lv], fn[lf] * area[lf][:, None])
    ln = np.linalg.norm(G, axis=1)
    bad = ln < 1e-12
    ln[bad] = 1
    G /= ln[:, None]
    N = G[inv]
    if bad.any():
        vn = np.zeros(len(me.vertices) * 3, dtype=np.float32)
        me.vertices.foreach_get('normal', vn)
        vn = vn.reshape(-1, 3)
        fix = bad[inv]
        N[fix] = vn[fix]
    return N


def thickness(ob, N, far=1.0):
    """Local thickness at each vertex: distance to the opposite wall along the inward normal."""
    me = ob.data
    P = bl.co(ob)
    polys = [tuple(p.vertices) for p in me.polygons]
    tree = BVHTree.FromPolygons([tuple(p) for p in P], polys, all_triangles=False)
    out = np.full(len(P), far)
    for i in range(len(P)):
        n = Vector(N[i])
        o = Vector(P[i]) - n * 1e-3
        hit = tree.ray_cast(o, -n, far)
        if hit[0] is not None:
            out[i] = hit[3] + 1e-3
    return out


def outline_attrs(ob, auto_thin=True, thin_ref=0.055, thin_min=0.42, weld=1e-4):
    """Write _SJOUT and _SJOUTW on a finished mesh (call last, after joins and deletions).

    auto_thin: scale the line down where the form is thinner than thin_ref metres
               (never below thin_min), so fingers and hair tips keep their shape under the ink."""
    me = ob.data
    N = smoothed_normals(ob, weld)
    w = np.ones(len(me.vertices), dtype=np.float32)
    if auto_thin:
        t = thickness(ob, N)
        w = np.clip(t / thin_ref, thin_min, 1.0).astype(np.float32)
    m = me.attributes.get(MULT)
    if m is not None:
        mult = np.ones(len(me.vertices), dtype=np.float32)
        m.data.foreach_get('value', mult)
        w = w * mult
    for name in ('_SJOUT', '_SJOUTW'):
        old = me.attributes.get(name)
        if old is not None:
            me.attributes.remove(old)
    a = me.attributes.new('_SJOUT', 'FLOAT_VECTOR', 'POINT')
    gl = np.stack([N[:, 0], N[:, 2], -N[:, 1]], axis=1).astype(np.float32)   # Blender -> glTF axes
    a.data.foreach_set('vector', gl.ravel())
    b = me.attributes.new('_SJOUTW', 'FLOAT', 'POINT')
    b.data.foreach_set('value', np.clip(w, 0, 1))
    m = me.attributes.get(MULT)
    if m is not None:
        me.attributes.remove(m)
    return ob
