# Tiny Blender-python helpers for the engine's TEST FIXTURES (test/fixtures/mk_fixtures.py).
# Not the art toolkit (that is art/sjart): just enough to build ASSET SPEC v1 conformant test models
# (rigged, vertex-coloured, sj_* materials, _SJOUT/_SJOUTW outline attributes) so the runtime can be tested.
#
# Blender space: Z up, the character faces -Y, its left is +X. Exported glTF: Y up, facing +Z.
import bpy, bmesh, math
from mathutils import Vector, Matrix


def srgb_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexlin(h):
    """'#RRGGBB' (sRGB, how colours are authored) -> linear RGBA tuple (what glTF COLOR_0 stores)."""
    h = h.lstrip('#')
    return tuple(srgb_lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4)) + (1.0,)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


class Model:
    """One mesh object built part by part. Every part gets a material class (sj_*), a flat colour,
    an outline weight and (for rigged models) bone weights."""

    def __init__(self, name, bones=None):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.verts.layers.float_color.new('Col')
        self.ow = self.bm.verts.layers.float.new('_SJOUTW')
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.dl = self.bm.verts.layers.deform.verify()
        self.mats = []            # material names, index = slot
        self.bones = bones or []  # vertex-group order
        self.morph = {}           # shape key name -> {vert index: Vector offset fn}

    def slot(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _finish(self, verts, faces, mat, color, weight, ow, smooth):
        c = hexlin(color)
        for v in verts:
            v[self.col] = c
            v[self.ow] = ow
            if weight is not None:
                w = weight(v.co) if callable(weight) else {weight: 1.0}
                tot = sum(w.values()) or 1.0
                for b, x in w.items():
                    if x > 1e-4:
                        v[self.dl][self.bones.index(b)] = x / tot
        mi = self.slot(mat)
        for f in faces:
            f.material_index = mi
            f.smooth = smooth
        return verts, faces

    # ---- primitives ----
    def lathe(self, p0, p1, profile, segs=16, mat='sj_toon', color='#FFFFFF', weight=None, ow=1.0, smooth=True, scale=None):
        """Surface of revolution along p0->p1. profile: [(t metres along the axis, radius)], radius 0 = pole."""
        p0 = Vector(p0); p1 = Vector(p1)
        ax = (p1 - p0).normalized()
        u = ax.cross(Vector((0, 1, 0)))
        if u.length < 1e-4:
            u = ax.cross(Vector((1, 0, 0)))
        u.normalize(); v = ax.cross(u)
        bm = self.bm; rings = []; verts = []; faces = []
        for (t, r) in profile:
            c = p0 + ax * t
            if r < 1e-6:
                ring = [bm.verts.new(c)]
            else:
                ring = [bm.verts.new(c + (u * math.cos(a) + v * math.sin(a)) * r) for a in (2 * math.pi * i / segs for i in range(segs))]
            rings.append(ring); verts += ring
        for a, b in zip(rings, rings[1:]):
            for i in range(segs):
                j = (i + 1) % segs
                if len(a) == 1 and len(b) == 1:
                    continue
                if len(a) == 1:
                    faces.append(bm.faces.new((a[0], b[j], b[i])))
                elif len(b) == 1:
                    faces.append(bm.faces.new((a[i], a[j], b[0])))
                else:
                    faces.append(bm.faces.new((a[i], a[j], b[j], b[i])))
        if scale is not None:   # (sx, sy, sz) about the part's midpoint, in world axes
            mid = (p0 + p1) / 2
            for q in verts:
                d = q.co - mid
                q.co = mid + Vector((d.x * scale[0], d.y * scale[1], d.z * scale[2]))
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        return self._finish(verts, faces, mat, color, weight, ow, smooth)

    def capsule(self, p0, p1, r0, r1=None, cap=4, mid=2, **kw):
        r1 = r0 if r1 is None else r1
        L = (Vector(p1) - Vector(p0)).length
        prof = [(-r0 * math.cos(math.pi / 2 * i / cap), r0 * math.sin(math.pi / 2 * i / cap)) for i in range(cap + 1)]
        prof += [(L * i / (mid + 1), r0 + (r1 - r0) * i / (mid + 1)) for i in range(1, mid + 1)]
        prof += [(L + r1 * math.sin(math.pi / 2 * i / cap), r1 * math.cos(math.pi / 2 * i / cap)) for i in range(cap + 1)]
        return self.lathe(p0, p1, prof, **kw)

    def cyl(self, p0, p1, r0, r1=None, bevel=0.0, **kw):
        r1 = r0 if r1 is None else r1
        L = (Vector(p1) - Vector(p0)).length
        b = min(bevel, L / 2, r0, r1)
        prof = [(0, 0), (0, r0 - b)] + ([(b, r0), (L - b, r1)] if b > 0 else [(0, r0), (L, r1)]) + [(L, r1 - b), (L, 0)]
        kw.setdefault('smooth', False)
        return self.lathe(p0, p1, prof, **kw)

    def sphere(self, c, r, scale=(1, 1, 1), segs=20, rings=12, **kw):
        c = Vector(c)
        prof = [(r - r * math.cos(math.pi * i / rings), r * math.sin(math.pi * i / rings)) for i in range(rings + 1)]
        prof[0] = (0, 0); prof[-1] = (2 * r, 0)
        return self.lathe(c - Vector((0, 0, r)), c + Vector((0, 0, r)), prof, segs=segs, scale=scale, **kw)

    def box(self, c, size, bevel=0.0, rot=None, mat='sj_toon', color='#FFFFFF', weight=None, ow=1.0, smooth=False):
        bm = self.bm
        r = bmesh.ops.create_cube(bm, size=1.0)
        verts = r['verts']
        for v in verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if bevel > 0:
            edges = list({e for v in verts for e in v.link_edges})
            res = bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, profile=0.5, affect='EDGES')
            verts = list({v for f in res['faces'] for v in f.verts} | {v for v in verts if v.is_valid})
        M = Matrix.Translation(Vector(c)) @ (rot.to_4x4() if rot is not None else Matrix.Identity(4))
        faces = list({f for v in verts for f in v.link_faces})
        for v in verts:
            v.co = M @ v.co
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        return self._finish(verts, faces, mat, color, weight, ow, smooth)

    def retag(self, faces, mat):
        mi = self.slot(mat)
        for f in faces:
            f.material_index = mi

    # ---- build ----
    def build(self, rig=None):
        me = bpy.data.meshes.new(self.name)
        self.bm.verts.index_update()
        self.bm.to_mesh(me)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        for m in self.mats:
            me.materials.append(bpy.data.materials.get(m) or bpy.data.materials.new(m))
        me.color_attributes.active_color = me.color_attributes['Col']
        me.color_attributes.render_color_index = 0
        # _SJOUT: the smoothed outline normal, shared by vertices at the same position, stored in glTF space
        # (Blender exports custom attributes raw, so the Z-up -> Y-up swap (x, z, -y) is done here).
        acc = {}
        for v in me.vertices:
            k = (round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5))
            acc[k] = acc.get(k, Vector((0, 0, 0))) + v.normal
        a = me.attributes.new('_SJOUT', 'FLOAT_VECTOR', 'POINT')
        for v in me.vertices:
            n = acc[(round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5))].normalized()
            a.data[v.index].vector = (n.x, n.z, -n.y)
        if rig is not None:
            for b in self.bones:
                ob.vertex_groups.new(name=b)   # same order as the deform layer indices
            ob.parent = rig
            mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
        self.bm.free()
        self.ob = ob
        return ob


def make_rig(name, bones):
    """bones: [(name, head, tail, parent or None)] in Blender space. Returns the armature object."""
    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for (n, h, t, p) in bones:
        b = arm.edit_bones.new(n); b.head = h; b.tail = t
        if p:
            b.parent = arm.edit_bones[p]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def export(path, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_active_vertex_color_when_no_material=True, export_skins=True, export_influence_nb=4,
                              export_animations=False, export_morph=True, export_morph_normal=True, export_tangents=False,
                              export_materials='EXPORT', export_def_bones=False, export_extras=False)
    tris = sum(len(p.vertices) - 2 for o in objects if o.type == 'MESH' for p in o.data.polygons)
    import os
    print('WROTE %s  %d tris  %d bytes' % (path, tris, os.path.getsize(path)))
