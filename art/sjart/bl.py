"""Blender glue: scene reset, mesh <-> numpy, modifiers, joins. Everything here needs bpy."""
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector


def reset():
    """Empty scene, metric units. Call first in every art script."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'
    s.unit_settings.scale_length = 1.0
    return s


def link(ob):
    if ob.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(ob)
    return ob


def new_object(name, verts, faces, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(float(x) for x in p) for p in verts], [], [tuple(int(i) for i in f) for f in faces])
    me.update(calc_edges=True)
    ob = bpy.data.objects.new(name, me)
    link(ob)
    if smooth:
        me.shade_smooth()
    return ob


def empty(name, loc=(0, 0, 0), parent=None, size=0.02):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = size
    ob.location = loc
    link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def co(ob):
    a = np.zeros(len(ob.data.vertices) * 3, dtype=np.float32)
    ob.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3).astype(np.float64)


def set_co(ob, P):
    ob.data.vertices.foreach_set('co', np.asarray(P, dtype=np.float32).ravel())
    ob.data.update()


def face_attr(ob, name, default=0):
    a = ob.data.attributes.get(name)
    n = len(ob.data.polygons)
    if a is None:
        return np.full(n, default)
    out = np.zeros(n, dtype=np.int32 if a.data_type == 'INT' else np.float32)
    a.data.foreach_get('value', out)
    return out


def face_centres(ob):
    a = np.zeros(len(ob.data.polygons) * 3, dtype=np.float32)
    ob.data.polygons.foreach_get('center', a)
    return a.reshape(-1, 3).astype(np.float64)


def face_normals(ob):
    a = np.zeros(len(ob.data.polygons) * 3, dtype=np.float32)
    ob.data.polygons.foreach_get('normal', a)
    return a.reshape(-1, 3).astype(np.float64)


def tri_count(ob):
    return int(sum(len(p.vertices) - 2 for p in ob.data.polygons))


def apply_modifiers(ob):
    """Bake the modifier stack into the mesh (keeps attributes and vertex groups)."""
    if not ob.modifiers:
        return ob
    dg = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    name = ob.data.name
    ob.modifiers.clear()
    old = ob.data
    ob.data = new
    bpy.data.meshes.remove(old)
    new.name = name
    return ob


def modify(ob, kind, apply=True, **props):
    """Add a modifier, set its properties, bake it. e.g. modify(ob, 'BEVEL', width=0.004, segments=2)."""
    m = ob.modifiers.new(kind.lower(), kind)
    for k, v in props.items():
        setattr(m, k, v)
    if apply:
        apply_modifiers(ob)
    return ob


def subdivide(ob, levels=1):
    return modify(ob, 'SUBSURF', levels=levels, render_levels=levels, subdivision_type='CATMULL_CLARK')


def bake_transform(ob):
    """Apply the object's location/rotation/scale to its mesh data."""
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)
    ob.data.update()
    return ob


def transform(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """Move the mesh data itself (euler XYZ radians), leaving the object at the origin."""
    from mathutils import Euler
    s = Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0)) if not np.isscalar(scale) else Matrix.Scale(scale, 4)
    m = Matrix.Translation(Vector(loc)) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ s
    ob.data.transform(m)
    if m.determinant() < 0:
        ob.data.flip_normals()
    ob.data.update()
    return ob


def duplicate(ob, name=None):
    new = ob.copy()
    new.data = ob.data.copy()
    if name:
        new.name = name
        new.data.name = name
    link(new)
    return new


def join(objs, name=None):
    """Join mesh objects into the first one (attributes, materials and vertex groups merge by name)."""
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    base = objs[0]
    if len(objs) > 1:
        for o in bpy.context.scene.objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = base
        bpy.ops.object.join()
    if name:
        base.name = name
        base.data.name = name
    return base


def delete_faces(ob, mask):
    """Delete the faces where mask is true, and the vertices left without a face."""
    mask = np.asarray(mask, dtype=bool)
    if not mask.any():
        return ob
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if mask[f.index]], context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def weld(ob, dist=1e-5):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def recalc_normals(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def mirror_x(ob, weld_dist=1e-4, swap_groups=True):
    """Add the x-mirrored half to a mesh built on +x only (centre seam welded, _L/_R groups swapped)."""
    m = ob.modifiers.new('mirror', 'MIRROR')
    m.use_axis = (True, False, False)
    m.use_clip = True
    m.merge_threshold = weld_dist
    m.use_mirror_vertex_groups = swap_groups
    return apply_modifiers(ob)


def shade(ob, smooth=True, sharp_angle=None):
    """Smooth shading; with sharp_angle (radians) edges steeper than that stay hard."""
    me = ob.data
    if not smooth:
        me.shade_flat()
        return ob
    me.shade_smooth()
    if sharp_angle is not None:
        me.set_sharp_from_angle(angle=sharp_angle)
    return ob


def mark_sharp(ob, edge_mask):
    me = ob.data
    a = me.attributes.get('sharp_edge') or me.attributes.new('sharp_edge', 'BOOLEAN', 'EDGE')
    a.data.foreach_set('value', np.asarray(edge_mask, dtype=bool))
    me.update()
    return ob
