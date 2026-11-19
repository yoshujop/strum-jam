"""Flat colours and material classes.

Albedo lives in the vertex colour attribute "Color" (face-corner domain, linear floats) which the
glTF exporter writes as COLOR_0. Colours are authored as sRGB hex and converted here.
The material's NAME is the shading class the runtime looks at (ASSET_SPEC.md); the Blender
material itself is a neutral placeholder.
"""
import bpy
import numpy as np
from .util import hex_linear

CLASSES = ('sj_toon', 'sj_skin', 'sj_hair', 'sj_cloth', 'sj_metal', 'sj_gloss', 'sj_emit', 'sj_glass', 'sj_face')
ATTR = 'Color'


def material(cls):
    assert cls in CLASSES, 'unknown material class %r (allowed: %s)' % (cls, ', '.join(CLASSES))
    m = bpy.data.materials.get(cls)
    if m is None:
        m = bpy.data.materials.new(cls)
        m.diffuse_color = (1, 1, 1, 1)
        m.roughness = 0.3 if cls in ('sj_metal', 'sj_gloss') else 1.0
        m.metallic = 1.0 if cls == 'sj_metal' else 0.0
    return m


def slot(ob, cls):
    """Index of the material slot for a class on this object (added when missing)."""
    mats = ob.data.materials
    for i, m in enumerate(mats):
        if m is not None and m.name == cls:
            return i
    mats.append(material(cls))
    return len(mats) - 1


def _color_attr(me):
    a = me.color_attributes.get(ATTR)
    if a is None:
        a = me.color_attributes.new(ATTR, 'FLOAT_COLOR', 'CORNER')
        n = len(me.loops)
        a.data.foreach_set('color', np.tile(np.array([1, 1, 1, 1], dtype=np.float32), n))
    me.color_attributes.active_color = a
    me.color_attributes.render_color_index = list(me.color_attributes).index(a)
    return a


def _mask(ob, faces):
    n = len(ob.data.polygons)
    if faces is None:
        return np.ones(n, dtype=bool)
    faces = np.asarray(faces)
    if faces.dtype == bool:
        assert len(faces) == n, 'face mask has %d entries, mesh has %d faces' % (len(faces), n)
        return faces
    m = np.zeros(n, dtype=bool)
    m[faces] = True
    return m


def paint(ob, color, cls=None, faces=None):
    """Give faces a flat colour (sRGB hex) and, optionally, a material class.

    faces: None (all), a boolean mask, or a list of face indices."""
    me = ob.data
    a = _color_attr(me)
    mask = _mask(ob, faces)
    n = len(me.loops)
    col = np.zeros(n * 4, dtype=np.float32)
    a.data.foreach_get('color', col)
    col = col.reshape(-1, 4)
    starts = np.zeros(len(me.polygons), dtype=np.int32)
    totals = np.zeros(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get('loop_start', starts)
    me.polygons.foreach_get('loop_total', totals)
    lmask = np.repeat(mask, totals)  # loops are stored face by face
    order_ok = np.all(starts == np.concatenate([[0], np.cumsum(totals)[:-1]]))
    if not order_ok:
        lmask = np.zeros(n, dtype=bool)
        for s, t, m in zip(starts, totals, mask):
            if m:
                lmask[s:s + t] = True
    r, g, b = hex_linear(color)
    col[lmask] = (r, g, b, 1.0)
    a.data.foreach_set('color', col.ravel())
    if cls is not None:
        idx = slot(ob, cls)
        mi = np.zeros(len(me.polygons), dtype=np.int32)
        me.polygons.foreach_get('material_index', mi)
        mi[mask] = idx
        me.polygons.foreach_set('material_index', mi)
    elif not me.materials:
        slot(ob, 'sj_toon')
    me.update()
    return ob


def set_class(ob, cls, faces=None):
    me = ob.data
    idx = slot(ob, cls)
    mask = _mask(ob, faces)
    mi = np.zeros(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get('material_index', mi)
    mi[mask] = idx
    me.polygons.foreach_set('material_index', mi)
    me.update()
    return ob
