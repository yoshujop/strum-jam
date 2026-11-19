"""The SJ rig: skeleton building, skinning and weight clean-up.

Bone names and hierarchy are the contract with the runtime (art/ASSET_SPEC.md). Bone rolls are
not part of the contract, with one exception: attachment bones (att_*) have documented axes.
"""
import bpy
import numpy as np
from mathutils import Vector
from . import bl

SIDES = ('L', 'R')
DIGITS = ('thumb', 'index', 'middle', 'pinky')

PARENTS = {'root': None, 'hips': 'root', 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck',
           'att_back': 'chest', 'att_head': 'head', 'att_hip': 'hips'}
for _s in SIDES:
    PARENTS.update({
        'shoulder_' + _s: 'chest', 'upperarm_' + _s: 'shoulder_' + _s, 'forearm_' + _s: 'upperarm_' + _s,
        'twist_forearm_' + _s: 'forearm_' + _s, 'hand_' + _s: 'forearm_' + _s, 'att_hand_' + _s: 'hand_' + _s,
        'thigh_' + _s: 'hips', 'shin_' + _s: 'thigh_' + _s, 'foot_' + _s: 'shin_' + _s, 'toe_' + _s: 'foot_' + _s})
    for _d in DIGITS:
        PARENTS[_d + '1_' + _s] = 'hand_' + _s
        PARENTS[_d + '2_' + _s] = _d + '1_' + _s

# bones every SJ character must have (twist_forearm_* is an optional helper)
REQUIRED = [b for b in PARENTS if not b.startswith('twist_')]
ORDER = list(PARENTS)


def is_deform(name):
    return not (name.startswith('att_') or name == 'root')


def build_armature(name, joints, parents=None):
    """Create the armature object from {bone: (head, tail[, z_axis])} (Blender space).

    Bones are added parents-first in a fixed order so joint indices are stable between exports.
    Roll: the bone's Z axis is aimed at the character's front (-Y), or up for bones that point
    forward; a third tuple element overrides that (used by att_hand_*)."""
    parents = dict(PARENTS if parents is None else parents)
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bl.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    order = [b for b in ORDER if b in joints] + [b for b in joints if b not in ORDER]
    done = set()

    def add(b):
        if b in done:
            return
        p = parents.get(b)
        if p is not None:
            assert p in joints, 'bone %s needs its parent %s' % (b, p)
            add(p)
        j = joints[b]
        eb = arm.edit_bones.new(b)
        eb.head = Vector(j[0])
        eb.tail = Vector(j[1])
        d = (eb.tail - eb.head).normalized()
        if len(j) > 2:
            hint = Vector(j[2])
        else:
            hint = Vector((0, -1, 0)) if abs(d.y) < 0.85 else Vector((0, 0, 1))
        eb.align_roll(hint)
        if p is not None:
            eb.parent = arm.edit_bones[p]
            eb.use_connect = False
        eb.use_deform = is_deform(b)
        done.add(b)

    for b in order:
        add(b)
    bpy.ops.object.mode_set(mode='OBJECT')
    ob['sj_rig'] = 'SJ rig v1'
    return ob


def spring_chain(joints, parents, chain, points, parent):
    """Add spring bones spr_<chain>_1..n running through `points` (n+1 points), hung from `parent`.
    Returns the bone names. The runtime simulates them; here they are plain bones."""
    names = []
    prev = parent
    for i in range(len(points) - 1):
        n = 'spr_%s_%d' % (chain, i + 1)
        joints[n] = (np.asarray(points[i], dtype=float), np.asarray(points[i + 1], dtype=float))
        parents[n] = prev
        prev = n
        names.append(n)
    return names


# ------------------------------------------------------------------ weights as a matrix
def get_weights(ob, bones=None):
    """(V x B) weight matrix and the list of group names."""
    names = [g.name for g in ob.vertex_groups]
    W = np.zeros((len(ob.data.vertices), len(names)), dtype=np.float64)
    for v in ob.data.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    return W, names


def set_weights(ob, W, names):
    ob.vertex_groups.clear()
    groups = [ob.vertex_groups.new(name=n) for n in names]
    nz = W > 0
    for b, g in enumerate(groups):
        idx = np.nonzero(nz[:, b])[0]
        # group.add is per-weight; batch vertices that share a (rounded) weight
        vals = np.round(W[idx, b], 4)
        for val in np.unique(vals):
            g.add([int(i) for i in idx[vals == val]], float(val), 'REPLACE')
    for g in list(ob.vertex_groups):
        if not nz[:, names.index(g.name)].any():
            ob.vertex_groups.remove(g)


def _adjacency(ob):
    n = len(ob.data.vertices)
    e = np.zeros(len(ob.data.edges) * 2, dtype=np.int32)
    ob.data.edges.foreach_get('vertices', e)
    e = e.reshape(-1, 2)
    return n, e


def clean_weights(ob, smooth=1, factor=0.5, limit=4, prune=0.02, mask=None):
    """The standard clean-up: Laplacian-smooth the weights `smooth` times, drop tiny influences,
    keep the `limit` strongest per vertex, normalise to sum 1.

    mask: optional boolean per vertex: only those vertices are smoothed."""
    W, names = get_weights(ob)
    n, e = _adjacency(ob)
    if W.shape[1] == 0:
        return ob
    deg = np.zeros(n)
    np.add.at(deg, e[:, 0], 1)
    np.add.at(deg, e[:, 1], 1)
    deg[deg == 0] = 1
    for _ in range(smooth):
        S = np.zeros_like(W)
        np.add.at(S, e[:, 0], W[e[:, 1]])
        np.add.at(S, e[:, 1], W[e[:, 0]])
        S /= deg[:, None]
        Wn = W * (1 - factor) + S * factor
        if mask is not None:
            Wn[~mask] = W[~mask]
        W = Wn
    W[W < prune] = 0
    if W.shape[1] > limit:
        order = np.argsort(-W, axis=1)
        drop = order[:, limit:]
        np.put_along_axis(W, drop, 0.0, axis=1)
    s = W.sum(axis=1)
    lost = s <= 1e-9
    s[lost] = 1
    W /= s[:, None]
    set_weights(ob, W, names)
    ob['sj_unweighted'] = int(lost.sum())
    return ob


def bind(ob, rig):
    """Attach a mesh that already has vertex groups to the rig (armature modifier + parenting)."""
    for m in list(ob.modifiers):
        if m.type == 'ARMATURE':
            ob.modifiers.remove(m)
    m = ob.modifiers.new('rig', 'ARMATURE')
    m.object = rig
    ob.parent = rig
    return ob


def bind_rigid(ob, rig, bone):
    """Everything follows one bone (accessories, props in hand, hard hats)."""
    ob.vertex_groups.clear()
    g = ob.vertex_groups.new(name=bone)
    g.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    return bind(ob, rig)


def bind_fn(ob, rig, fn):
    """Weights from a function: fn(position) -> {bone: weight}. For shoes, hair on spring chains..."""
    ob.vertex_groups.clear()
    groups = {}
    for v in ob.data.vertices:
        w = fn(np.array(v.co))
        s = sum(w.values()) or 1.0
        for b, x in w.items():
            if x <= 0:
                continue
            g = groups.get(b) or groups.setdefault(b, ob.vertex_groups.new(name=b))
            g.add([v.index], x / s, 'REPLACE')
    return bind(ob, rig)


def autoskin(ob, rig, smooth=2):
    """Blender's automatic (bone heat) weights, then the standard clean-up. For organic meshes
    that were not built from a weighted cage. Needs a reasonably closed mesh."""
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for g in list(ob.vertex_groups):
        if not is_deform(g.name):
            ob.vertex_groups.remove(g)
    clean_weights(ob, smooth=smooth)
    if ob.get('sj_unweighted'):
        raise RuntimeError('autoskin: %d vertices of %s got no weights (mesh not closed?)' % (ob['sj_unweighted'], ob.name))
    return ob


def transfer_weights(src, dst, rig=None, smooth=1):
    """Copy skin weights from the nearest surface point of `src` (a skinned body) onto `dst`
    (clothes, hair caps). Then clean up and bind."""
    for g in src.vertex_groups:
        if g.name not in dst.vertex_groups:
            dst.vertex_groups.new(name=g.name)
    m = dst.modifiers.new('xfer', 'DATA_TRANSFER')
    m.object = src
    m.use_vert_data = True
    m.data_types_verts = {'VGROUP_WEIGHTS'}
    m.vert_mapping = 'POLYINTERP_NEAREST'
    m.layers_vgroup_select_src = 'ALL'
    m.layers_vgroup_select_dst = 'NAME'
    bl.apply_modifiers(dst)
    clean_weights(dst, smooth=smooth)
    if rig is not None:
        bind(dst, rig)
    return dst


def max_influences(ob):
    return max((len([g for g in v.groups if g.weight > 0]) for v in ob.data.vertices), default=0)


# ------------------------------------------------------------------ posing (model-space deltas)
class Poser:
    """Poses the rig the way the runtime does: each bone gets a rotation given in MODEL space
    (Blender axes: +X = character's left, -Y = front, +Z = up) AS IF ITS PARENTS WERE AT REST,
    about its own rest head; parents carry their children along. So "bend the elbow about the
    rest pose's elbow axis" stays the same instruction whatever the shoulder is doing, and no
    knowledge of bone rolls is needed.

        p = Poser(rig); p.rot('upperarm_L', (0, 1, 0), 60); p.apply(); p.key(frame)
    """

    def __init__(self, rig):
        self.rig = rig
        self.rots = {}
        self.rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}
        self.root_shift = Vector((0, 0, 0))

    def clear(self):
        self.rots = {}
        self.root_shift = Vector((0, 0, 0))
        return self

    def rot(self, bone, axis, degrees):
        """Rotate `bone` (and its children) about a model-space axis through its head.
        Successive calls on the same bone compose (later ones applied after earlier ones)."""
        from mathutils import Matrix
        import math
        if bone not in self.rest:
            return self
        m = Matrix.Rotation(math.radians(degrees), 4, Vector(axis).normalized())
        self.rots[bone] = m @ self.rots.get(bone, Matrix.Identity(4))
        return self

    def both(self, bone, axis, degrees):
        """Mirror-symmetric rotation of bone_L and bone_R."""
        ax = Vector(axis)
        self.rot(bone + '_L', ax, degrees)
        self.rot(bone + '_R', Vector((ax.x, -ax.y, -ax.z)), degrees)   # mirrored rotation: the axis is a pseudo-vector
        return self

    def lift(self, dx=0, dy=0, dz=0):
        self.root_shift = Vector((dx, dy, dz))
        return self

    def apply(self):
        from mathutils import Matrix
        rig = self.rig
        carry = {}    # per bone: the transform taking rest model space to its posed space
        world = {}

        def solve(b):
            if b.name in carry:
                return carry[b.name]
            rest = self.rest[b.name]
            c = Matrix.Translation(self.root_shift) if b.parent is None else solve(b.parent)
            r = self.rots.get(b.name)
            if r is not None:
                h = rest.to_translation()
                c = c @ Matrix.Translation(h) @ r @ Matrix.Translation(-h)
            carry[b.name] = c
            world[b.name] = c @ rest
            return c

        for b in rig.data.bones:
            solve(b)
        for pb in rig.pose.bones:
            pb.rotation_mode = 'QUATERNION'
        # set parents first so pose_bone.matrix assignments compose correctly
        def depth(b):
            d = 0
            while b.parent:
                b = b.parent
                d += 1
            return d
        for b in sorted(rig.data.bones, key=depth):
            rig.pose.bones[b.name].matrix = world[b.name]
            bpy.context.view_layer.update()
        return self

    def key(self, frame):
        for pb in self.rig.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=frame)
            pb.keyframe_insert('location', frame=frame)
        return self

    def reset(self):
        from mathutils import Matrix
        for pb in self.rig.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        return self.clear()
