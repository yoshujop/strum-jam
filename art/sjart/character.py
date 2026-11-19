"""Character assembly: body + garments + accessories -> one skinned mesh on the SJ rig -> GLB.

    h = Human(HumanSpec(...))
    ch = Character('mannequin', h, skin='#F2B48C')
    outfit.tee(ch, '#F25C3B'); outfit.trousers(ch, '#2F3A5F'); outfit.sneakers(ch, '#F4F1E8')
    outfit.hair_cap(ch, '#3B2A4A')
    ch.export()                      # -> vendor/models/mannequin.glb + validation report

Parts are Cages (subdivided here, they keep their authored weights) or finished mesh objects
(bound rigidly to a bone, or by a weight function). Everything is joined into one mesh, so a
character costs one draw call per material class (+ the same again for the ink hull).
"""
import os
import numpy as np
import bpy
from . import bl, color, rig, outline, export
from .cage import Cage

FACE_UV = 'UVMap'


def face_uv(ob, mask, centre_x, centre_z, size):
    """Planar-project faces onto the 2D face canvas (Blender space, character facing -Y).

    u = 0.5 + (x - centre_x) / size   (the character's left, +X, is the viewer's right: unmirrored)
    v = 0.5 + (z - centre_z) / size   (Blender's v is up; the glTF exporter flips it, so image-top is up)
    Faces outside `mask` get uv (0, 0). Returns the mask of faces that fit inside the unit square."""
    me = ob.data
    uvl = me.uv_layers.get(FACE_UV) or me.uv_layers.new(name=FACE_UV)
    P = bl.co(ob)
    nl = len(me.loops)
    lv = np.zeros(nl, dtype=np.int32)
    me.loops.foreach_get('vertex_index', lv)
    u = 0.5 + (P[lv, 0] - centre_x) / size
    v = 0.5 + (P[lv, 2] - centre_z) / size
    tot = np.zeros(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get('loop_total', tot)
    lf = np.repeat(np.arange(len(me.polygons)), tot)
    inside = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
    ok = np.ones(len(me.polygons), dtype=bool)
    np.logical_and.at(ok, lf, inside)
    ok &= np.asarray(mask, dtype=bool)
    lm = ok[lf]
    uv = np.zeros((nl, 2), dtype=np.float32)
    uv[lm, 0] = u[lm]
    uv[lm, 1] = v[lm]
    uvl.data.foreach_set('uv', uv.ravel())
    return ok


class Character:
    def __init__(self, name, human, skin='#F2B48C'):
        self.name = name
        self.h = human
        self.skin = skin
        self.hidden = set()         # body cage faces covered by garments
        self.parts = []             # finished objects, in join order
        self.joints = dict(human.joints)
        self.parents = dict(rig.PARENTS)
        self.extras = {}
        self.rig = None
        self.mesh = None

    # ------------------------------------------------------------ adding parts
    def hide(self, faces, interior=True):
        """Mark body cage faces as covered (deleted at build). interior=True keeps the faces that
        touch the border of the selection, so no gap can open at a hem."""
        self.hidden.update(self.h.cage.interior(faces) if interior else faces)

    def add_cage(self, cage, name, paint=None, cls='sj_cloth', by=None, levels=None, line=1.0):
        """Subdivide a cage into a part.  paint: one hex colour, or with `by` (a face tag name)
        a dict {tag value: hex or (hex, class)}; '' is the default entry."""
        ob = cage.to_object(name, levels=self.h.spec.levels if levels is None else levels, orient=False)
        bl.recalc_normals(ob)
        if isinstance(paint, dict):
            cf = bl.face_attr(ob, 'sj_cf')
            vals = np.array([str(cage.ft[i].get(by, '')) for i in cf])
            d = paint.get('', '#FFFFFF')
            color.paint(ob, d[0] if isinstance(d, tuple) else d, d[1] if isinstance(d, tuple) else cls)
            for k, c in paint.items():
                if k == '':
                    continue
                c, kc = c if isinstance(c, tuple) else (c, cls)
                color.paint(ob, c, kc, faces=(vals == k))
        elif paint is not None:
            color.paint(ob, paint, cls)
        if line != 1.0:
            outline.set_weight(ob, line)
        self.parts.append(ob)
        return ob

    def add_rigid(self, ob, bone, line=None):
        """A finished mesh that follows one bone (hats, buckles, glasses, a guitar on the back)."""
        ob.vertex_groups.clear()
        g = ob.vertex_groups.new(name=bone)
        g.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
        if line is not None:
            outline.set_weight(ob, line)
        self.parts.append(ob)
        return ob

    def add_weighted(self, ob, fn, line=None):
        """A finished mesh with weights from fn(position) -> {bone: weight} (hair on spring chains, tails)."""
        ob.vertex_groups.clear()
        groups = {}
        for v in ob.data.vertices:
            w = fn(np.array(v.co))
            s = sum(w.values()) or 1.0
            for b, x in w.items():
                if x > 0:
                    g = groups.get(b) or groups.setdefault(b, ob.vertex_groups.new(name=b))
                    g.add([v.index], x / s, 'REPLACE')
        if line is not None:
            outline.set_weight(ob, line)
        self.parts.append(ob)
        return ob

    def spring(self, chain, points, parent):
        """Spring bones spr_<chain>_1..n through `points`, hung from `parent`. Returns the bone names."""
        return rig.spring_chain(self.joints, self.parents, chain, points, parent)

    # ------------------------------------------------------------ build
    def build(self, weight_smooth=1):
        h = self.h
        lm = h.lm
        body = h.cage.to_object('Body', levels=h.spec.levels)
        cf = bl.face_attr(body, 'sj_cf')
        part = np.array([h.cage.ft[i].get('part', '') for i in cf])
        color.paint(body, self.skin, 'sj_skin')
        # face decal region: the front of the head
        fn = bl.face_normals(body)
        fc = bl.face_centres(body)
        size = lm['face_size']
        front = (part == 'head') & (fn[:, 1] < -0.30) & (np.abs(fc[:, 0]) < size * 0.5) & (np.abs(fc[:, 2] - lm['eye_z']) < size * 0.5)
        ok = face_uv(body, front, 0.0, lm['eye_z'], size)
        color.set_class(body, 'sj_face', faces=ok)
        if self.hidden:
            hid = np.array(sorted(self.hidden))
            bl.delete_faces(body, np.isin(cf, hid))
        # thinner ink in the webs between the fingers (a full line there fills the gaps with black)
        cf2 = bl.face_attr(body, 'sj_cf')
        web = np.array([h.cage.ft[i].get('zone') == 'web' for i in cf2])
        if web.any():
            vids = sorted({v for p in body.data.polygons if web[p.index] for v in p.vertices})
            outline.set_weight(body, 0.30, vids)
        outline.ensure_weight(body)
        objs = [body] + self.parts
        for o in objs:
            outline.ensure_weight(o)
            if o.data.uv_layers.get(FACE_UV) is None:
                o.data.uv_layers.new(name=FACE_UV)
                z = np.zeros(len(o.data.loops) * 2, dtype=np.float32)
                o.data.uv_layers[FACE_UV].data.foreach_set('uv', z)
        mesh = bl.join(objs, self.name.capitalize())
        self.rig = rig.build_armature('SJ_rig', self.joints, self.parents)
        rig.clean_weights(mesh, smooth=weight_smooth)
        rig.bind(mesh, self.rig)
        outline.outline_attrs(mesh)
        self.mesh = mesh
        self.extras.update(sj_asset='character', sj_spec='1', sj_height=round(float(h.spec.height), 4),
                           sj_face_size=round(float(size), 4), sj_eye_height=round(float(lm['eye_z']), 4))
        return self.rig, mesh

    def export(self, path=None, **kw):
        if self.mesh is None:
            self.build()
        path = path or os.path.join(export.models_dir(), self.name + '.glb')
        kw.setdefault('expect', {'height': (self.h.spec.height + kw.pop('height_extra', 0.0), kw.pop('height_tol', 0.12))})
        return export.export_glb(path, [self.rig, self.mesh], kind='character', extras=self.extras, **kw)
