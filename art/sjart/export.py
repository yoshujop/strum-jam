"""Export to GLB (and FBX on request) and validate the result against ASSET_SPEC.md.

`export_glb` writes the file, re-reads it and checks what is actually in it: a violation of the
spec raises SpecError with every problem listed, so a bad asset never reaches vendor/models.
"""
import json
import os
import re
import struct
import numpy as np
import bpy
from .color import CLASSES
from .rig import REQUIRED, PARENTS

NAME_RE = re.compile(r'^[A-Za-z0-9_]+$')
BUDGETS = {'character': (8000, 14000), 'prop': (200, 6000), 'venue': (500, 60000), 'test': (1, 10 ** 7)}
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


class SpecError(Exception):
    pass


def models_dir():
    return os.path.join(REPO, 'vendor', 'models')


def _select(objs):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def export_glb(path, objs, kind='character', extras=None, animations=False, budget=None, fbx=None, strict=True,
               expect=None):
    """Write `objs` (meshes, empties, the armature) to a .glb, validate it, print the report.

    kind     'character' | 'prop' | 'venue' | 'test': picks the triangle budget and the checks.
    extras   dict stored as glTF extras on the first object (e.g. the face size for the runtime).
    fbx      also write this .fbx path (Roblox / other DCC import); or set env SJ_FBX=dir.
    expect   optional dict of checks: height=(metres, tolerance).
    Returns the report dict (also saved as art/reports/<name>.json).
    """
    objs = [o for o in objs if o is not None]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    if extras:
        for k, v in extras.items():
            objs[0][k] = v
    _select(objs)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials='EXPORT', export_image_format='NONE',
        export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
        export_attributes=True, export_extras=True,
        export_skins=True, export_influence_nb=4, export_all_influences=False, export_def_bones=False,
        export_morph=False, export_animations=animations, export_animation_mode='ACTIONS',
        export_optimize_animation_size=False, export_bake_animation=False)
    rep = validate(path, kind=kind, budget=budget, expect=expect)
    print(format_report(rep))
    name = os.path.splitext(os.path.basename(path))[0]
    if os.path.abspath(os.path.dirname(path)) == models_dir():
        rdir = os.path.join(REPO, 'art', 'reports')
        os.makedirs(rdir, exist_ok=True)
        with open(os.path.join(rdir, name + '.json'), 'w') as f:
            json.dump(rep, f, indent=1, sort_keys=True)
            f.write('\n')
    fbx = fbx or (os.path.join(os.environ['SJ_FBX'], name + '.fbx') if os.environ.get('SJ_FBX') else None)
    if fbx:
        export_fbx(fbx, objs)
    if rep['errors'] and strict:
        raise SpecError('%s violates the asset spec:\n  - %s' % (os.path.basename(path), '\n  - '.join(rep['errors'])))
    return rep


def export_fbx(path, objs):
    """FBX twin of the asset (same scripts, same data): Y up, -Z forward as most engines'
    importers expect, no leaf bones, vertex colours kept (sRGB), metres."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    _select(objs)
    bpy.ops.export_scene.fbx(
        filepath=path, use_selection=True, object_types={'ARMATURE', 'MESH', 'EMPTY'},
        axis_forward='-Z', axis_up='Y', apply_unit_scale=True, apply_scale_options='FBX_SCALE_ALL',
        add_leaf_bones=False, primary_bone_axis='Y', secondary_bone_axis='X', use_armature_deform_only=False,
        mesh_smooth_type='FACE', colors_type='SRGB', use_custom_props=True, bake_anim=False)
    print('fbx: %s (%d bytes)' % (path, os.path.getsize(path)))
    return path


# ------------------------------------------------------------------ reading a GLB back
_CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, 'not a GLB file'
    off = 12
    js, binc = None, b''
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            binc = chunk
        off += 8 + clen
    return js, binc


def accessor(js, binc, idx):
    a = js['accessors'][idx]
    bv = js['bufferViews'][a['bufferView']]
    dt = np.dtype(_CT[a['componentType']])
    nc = _NC[a['type']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride') or dt.itemsize * nc
    if stride == dt.itemsize * nc:
        arr = np.frombuffer(binc, dtype=dt, count=a['count'] * nc, offset=start).reshape(a['count'], nc)
    else:
        arr = np.zeros((a['count'], nc), dtype=dt)
        for i in range(a['count']):
            arr[i] = np.frombuffer(binc, dtype=dt, count=nc, offset=start + i * stride)
    if a.get('normalized'):
        arr = arr.astype(np.float64) / np.iinfo(dt).max
    return arr


def validate(path, kind='character', budget=None, expect=None):
    """Check a .glb against the asset spec. Returns a report dict with 'errors' and 'warnings'."""
    js, binc = read_glb(path)
    err, warn = [], []
    nodes = js.get('nodes', [])
    meshes = js.get('meshes', [])
    mats = js.get('materials', [])
    skins = js.get('skins', [])
    rep = {'file': os.path.basename(path), 'bytes': os.path.getsize(path), 'kind': kind, 'errors': err, 'warnings': warn}

    # names
    for what, items in (('node', nodes), ('mesh', meshes), ('material', mats)):
        seen = set()
        for it in items:
            n = it.get('name', '')
            if not NAME_RE.match(n or ''):
                err.append('%s name %r: only [A-Za-z0-9_] allowed' % (what, n))
            if what == 'node' and n in seen:
                err.append('duplicate node name %r' % n)
            seen.add(n)
    for m in mats:
        base = re.sub(r'_\d+$', '', m.get('name', ''))
        if m.get('name') not in CLASSES:
            err.append('material %r is not a shading class (%s)' % (m.get('name'), ', '.join(CLASSES)))
    if js.get('images') or js.get('textures'):
        err.append('asset has textures: flat colours go in COLOR_0')

    # geometry
    tris = 0
    verts = 0
    lo = np.array([1e9] * 3)
    hi = -lo
    prim_report = []
    max_inf = 0
    for mi, m in enumerate(meshes):
        for p in m['primitives']:
            at = p['attributes']
            pos = accessor(js, binc, at['POSITION'])
            n = len(pos)
            verts += n
            t = (js['accessors'][p['indices']]['count'] if 'indices' in p else n) // 3
            tris += t
            # bounds in model space: static meshes need their node transform (props are built at the origin)
            lo = np.minimum(lo, pos.min(axis=0))
            hi = np.maximum(hi, pos.max(axis=0))
            mat = mats[p['material']]['name'] if 'material' in p else None
            pr = {'mesh': m.get('name'), 'material': mat, 'tris': int(t), 'verts': int(n)}
            prim_report.append(pr)
            if mat is None:
                err.append('mesh %s has a primitive without a material' % m.get('name'))
            if 'COLOR_0' not in at:
                err.append('mesh %s (%s) has no COLOR_0' % (m.get('name'), mat))
            else:
                col = accessor(js, binc, at['COLOR_0'])
                if col.min() < -1e-4 or col.max() > 1.0001:
                    err.append('mesh %s COLOR_0 outside 0..1' % m.get('name'))
            if '_SJOUT' not in at or '_SJOUTW' not in at:
                if not (m.get('name') or '').endswith('_noline'):
                    warn.append('mesh %s (%s) has no _SJOUT/_SJOUTW: the runtime will weld and smooth normals itself' % (m.get('name'), mat))
            else:
                o = accessor(js, binc, at['_SJOUT']).astype(np.float64)
                nrm = accessor(js, binc, at['NORMAL']).astype(np.float64)
                ln = np.linalg.norm(o, axis=1)
                if np.abs(ln - 1).max() > 0.02:
                    err.append('mesh %s _SJOUT is not unit length' % m.get('name'))
                agree = float((o * nrm).sum(axis=1).mean())
                pr['outline_agree'] = round(agree, 3)
                if agree < 0.5:
                    err.append('mesh %s _SJOUT disagrees with NORMAL (mean dot %.2f): wrong axes?' % (m.get('name'), agree))
                ow = accessor(js, binc, at['_SJOUTW'])
                if ow.min() < -1e-4 or ow.max() > 1.0001:
                    err.append('mesh %s _SJOUTW outside 0..1' % m.get('name'))
            if mat == 'sj_face':
                if 'TEXCOORD_0' not in at:
                    err.append('sj_face primitive without TEXCOORD_0')
                else:
                    uv = accessor(js, binc, at['TEXCOORD_0'])
                    if uv.min() < -1e-3 or uv.max() > 1.001:
                        err.append('sj_face UVs leave the unit square (%.3f..%.3f)' % (uv.min(), uv.max()))
                    pr['uv'] = [round(float(uv[:, 0].min()), 3), round(float(uv[:, 0].max()), 3),
                                round(float(uv[:, 1].min()), 3), round(float(uv[:, 1].max()), 3)]
            if 'JOINTS_1' in at:
                err.append('mesh %s has more than 4 influences (JOINTS_1 present)' % m.get('name'))
            if 'WEIGHTS_0' in at:
                w = accessor(js, binc, at['WEIGHTS_0']).astype(np.float64)
                s = w.sum(axis=1)
                if np.abs(s - 1).max() > 0.01:
                    err.append('mesh %s weights not normalised (sum %.3f..%.3f)' % (m.get('name'), s.min(), s.max()))
                max_inf = max(max_inf, int((w > 1e-5).sum(axis=1).max()))
            elif kind == 'character':
                err.append('mesh %s is not skinned' % m.get('name'))
    rep.update(triangles=int(tris), vertices=int(verts), primitives=prim_report, max_influences=max_inf,
               bounds={'min': [round(float(x), 4) for x in lo], 'max': [round(float(x), 4) for x in hi]},
               materials=sorted({p['material'] for p in prim_report if p['material']}),
               draw_calls=len(prim_report))
    b0, b1 = budget or BUDGETS[kind]
    if not (b0 <= tris <= b1):
        err.append('%d triangles, budget for a %s is %d..%d' % (tris, kind, b0, b1))

    # skeleton
    names = [n.get('name') for n in nodes]
    if kind == 'character':
        if len(skins) != 1:
            err.append('expected exactly one skin, found %d' % len(skins))
        else:
            joints = [names[j] for j in skins[0]['joints']]
            rep['bones'] = len(joints)
            missing = [b for b in REQUIRED if b not in joints]
            if missing:
                err.append('missing SJ rig bones: ' + ', '.join(missing))
            parent = {}
            for i, nd in enumerate(nodes):
                for ch in nd.get('children', []):
                    parent[names[ch]] = names[i]
            for b, p in PARENTS.items():
                if b in joints and p is not None and parent.get(b) != p:
                    err.append('bone %s should be a child of %s, is under %s' % (b, p, parent.get(b)))
            extra = [b for b in joints if b not in PARENTS and not b.startswith('spr_')]
            if extra:
                warn.append('extra bones (allowed, the runtime leaves them at rest): ' + ', '.join(extra))
            for b in joints:
                if b.startswith('spr_') and not re.match(r'^spr_[A-Za-z0-9]+_\d+$', b):
                    err.append('spring bone %r must be spr_<chain>_<n>' % b)
            rep['spring_chains'] = sorted({b.rsplit('_', 1)[0][4:] for b in joints if b.startswith('spr_')})
            # world rest positions of the joints (to check facing and handedness)
            world = {}

            def mat_of(i):
                nd = nodes[i]
                if 'matrix' in nd:
                    return np.array(nd['matrix'], dtype=np.float64).reshape(4, 4).T
                T = np.eye(4)
                if 'translation' in nd:
                    T[:3, 3] = nd['translation']
                if 'rotation' in nd:
                    x, y, z, w = nd['rotation']
                    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
                    T[:3, :3] = R
                if 'scale' in nd:
                    T[:3, :3] = T[:3, :3] * np.array(nd['scale'])[None, :]
                return T

            pidx = {}
            for i, nd in enumerate(nodes):
                for ch in nd.get('children', []):
                    pidx[ch] = i

            def wm(i):
                if i not in world:
                    world[i] = (wm(pidx[i]) @ mat_of(i)) if i in pidx else mat_of(i)
                return world[i]

            pos = {names[j]: wm(j)[:3, 3] for j in skins[0]['joints']}
            rep['joints'] = {k: [round(float(x), 4) for x in v] for k, v in pos.items()}
            if 'hand_L' in pos and pos['hand_L'][0] <= 0:
                err.append("hand_L is on -X: the character's left must be +X")
            if 'toe_L' in pos and 'foot_L' in pos and pos['toe_L'][2] <= pos['foot_L'][2]:
                err.append('toes point to -Z: the character must face +Z')
            if 'head' in pos and pos['head'][1] < pos['hips'][1]:
                err.append('head below hips: Y must be up')
            for a in ('att_back', 'att_head', 'att_hip'):
                if a in pos:
                    R = wm(names.index(a))[:3, :3]
                    if np.abs(R - np.eye(3)).max() > 1e-3:
                        err.append('%s must have identity world orientation at rest' % a)
        if lo[1] < -0.005 or lo[1] > 0.005:
            err.append('feet are not on the ground: lowest point y = %.4f' % lo[1])
        if abs(lo[0] + hi[0]) > 0.03:
            warn.append('model is not centred in x (%.3f..%.3f)' % (lo[0], hi[0]))
        if expect and 'height' in expect:
            h, tol = expect['height']
            if abs(hi[1] - h) > tol:
                err.append('height %.3f m, expected %.3f +- %.3f' % (hi[1], h, tol))
    extras = {}
    for nd in nodes:
        if 'extras' in nd:
            extras[nd.get('name')] = nd['extras']
    if extras:
        rep['extras'] = extras
    rep['nodes'] = len(nodes)
    rep['animations'] = [a.get('name') for a in js.get('animations', [])]
    return rep


def format_report(rep):
    L = ['--- %s  (%s, %.0f kB)' % (rep['file'], rep['kind'], rep['bytes'] / 1024.0),
         '    triangles %d  vertices %d  draw calls %d  nodes %d  bones %s  max influences %d' % (
             rep['triangles'], rep['vertices'], rep['draw_calls'], rep['nodes'], rep.get('bones', '-'), rep['max_influences']),
         '    bounds x %.3f..%.3f  y %.3f..%.3f  z %.3f..%.3f' % (
             rep['bounds']['min'][0], rep['bounds']['max'][0], rep['bounds']['min'][1], rep['bounds']['max'][1],
             rep['bounds']['min'][2], rep['bounds']['max'][2])]
    for p in rep['primitives']:
        L.append('    %-22s %-9s %6d tris' % (p['mesh'], p['material'], p['tris']))
    for w in rep['warnings']:
        L.append('    warning: ' + w)
    for e in rep['errors']:
        L.append('    ERROR: ' + e)
    L.append('    %s' % ('OK' if not rep['errors'] else 'FAILED (%d errors)' % len(rep['errors'])))
    return '\n'.join(L)
