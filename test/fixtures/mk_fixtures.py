# Builds the engine's test models (ASSET SPEC v1) into test/fixtures/models/*.glb:
#   cap     a rigged capsule-person on the SJ rig: every material class, a face decal region, spring chains,
#           attachment bones, thin fingers (outline weights), one morph target ("puff")
#   guitar  a prop with gloss / metal / emit parts and *_noline strings
#   shades  a glass + gloss prop that goes on att_head
#   amp     a hard-edged prop (flat shaded: needs the _SJOUT smoothed normals to keep its outline closed)
#   club    a small venue: back wall, neon, truss with par cans, speaker stacks, a riser
# Run:  /opt/sj-bpy/bin/python test/fixtures/mk_fixtures.py        (the .glb files are committed; rerun after edits)
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector, Matrix
import sjfix
from sjfix import Model, make_rig, export, reset

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
os.makedirs(OUT, exist_ok=True)
V = Vector

INK = '#1E1B2E'; INK2 = '#3A3552'; PAPER = '#FFF7E6'; SUN = '#FFCE3A'; CORAL = '#FF5E7E'; TEAL = '#2EC4B6'
GRAPE = '#7B5CF0'; AMBER = '#FFB020'; SKY = '#6CC8FF'; PINK = '#FF8FC7'


def smooth(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ cap: the rigged capsule-person
def cap():
    reset()
    B = [('root', (0, 0, 0), (0, 0.12, 0), None),
         ('hips', (0, 0, 0.98), (0, 0, 1.10), 'root'), ('spine', (0, 0, 1.10), (0, 0, 1.26), 'hips'),
         ('chest', (0, 0, 1.26), (0, 0, 1.46), 'spine'), ('neck', (0, 0, 1.46), (0, 0, 1.55), 'chest'),
         ('head', (0, 0, 1.55), (0, 0, 1.88), 'neck')]
    J = {}
    for s, n in ((1, 'L'), (-1, 'R')):
        d = V((s * math.cos(math.radians(40)), 0, -math.sin(math.radians(40))))      # arm direction (A-pose)
        pn = V((-s * math.sin(math.radians(40)), 0, -math.cos(math.radians(40))))    # palm normal (toward the thigh)
        sh0 = V((s * 0.03, 0, 1.42)); sh1 = V((s * 0.175, 0, 1.43)); el = sh1 + d * 0.26; wr = el + d * 0.24; kn = wr + d * 0.075
        J[n] = dict(d=d, pn=pn, sh1=sh1, el=el, wr=wr, kn=kn)
        B += [('shoulder_' + n, sh0, sh1, 'chest'), ('upperarm_' + n, sh1, el, 'shoulder_' + n),
              ('forearm_' + n, el, wr, 'upperarm_' + n), ('hand_' + n, wr, kn, 'forearm_' + n)]
        fy = {'index': -0.024, 'middle': 0.0, 'pinky': 0.024}
        for f, y in fy.items():
            a = kn + V((0, y, 0)) - d * 0.008; b = a + d * 0.034; c = b + d * 0.03
            B += [(f + '1_' + n, a, b, 'hand_' + n), (f + '2_' + n, b, c, f + '1_' + n)]
            J[n][f] = (a, b, c)
        td = (d * 0.55 + V((0, -0.83, 0))).normalized()
        a = wr + d * 0.025 + V((0, -0.03, 0)); b = a + td * 0.032; c = b + td * 0.028
        B += [('thumb1_' + n, a, b, 'hand_' + n), ('thumb2_' + n, b, c, 'thumb1_' + n)]
        J[n]['thumb'] = (a, b, c)
        B += [('att_hand_' + n, wr + d * 0.045 + pn * 0.03, wr + d * 0.045 + pn * 0.07, 'hand_' + n)]
        x = s * 0.092
        B += [('thigh_' + n, (x, 0, 0.96), (x, 0, 0.52), 'hips'), ('shin_' + n, (x, 0, 0.52), (x, 0, 0.09), 'thigh_' + n),
              ('foot_' + n, (x, 0, 0.09), (x, -0.13, 0.03), 'shin_' + n), ('toe_' + n, (x, -0.13, 0.03), (x, -0.23, 0.03), 'foot_' + n)]
    hair = [V((0, -0.07, 1.86)), V((0, -0.15, 1.935)), V((0, -0.235, 1.95)), V((0, -0.30, 1.90))]
    scarf = [V((0, 0.105, 1.44)), V((0, 0.165, 1.31)), V((0, 0.19, 1.17)), V((0, 0.20, 1.03))]
    for i in range(3):
        B.append(('spr_hair_%d' % (i + 1), hair[i], hair[i + 1], 'spr_hair_%d' % i if i else 'head'))
        B.append(('spr_scarf_%d' % (i + 1), scarf[i], scarf[i + 1], 'spr_scarf_%d' % i if i else 'chest'))
    B += [('att_back', (0, 0.12, 1.34), (0, 0.18, 1.34), 'chest'), ('att_head', (0, 0, 1.71), (0, 0, 1.78), 'head'),
          ('att_hip', (0, -0.02, 1.0), (0, -0.10, 1.0), 'hips')]
    rig = make_rig('cap_rig', B)
    m = Model('cap_body', [b[0] for b in B])

    SKIN = '#E9A57B'; HAIR = '#2B2440'; JACKET = CORAL; PANTS = '#2D2A4A'; BOOT = '#F4F1FF'

    def torso_w(co):
        a = smooth((co.z - 1.04) / 0.12); b = smooth((co.z - 1.20) / 0.12)
        return {'hips': 1 - a, 'spine': a * (1 - b), 'chest': a * b}
    m.capsule((0, 0, 1.05), (0, 0, 1.39), 0.15, 0.168, segs=24, mid=5, scale=(1, 0.72, 1), mat='sj_cloth', color=JACKET, weight=torso_w)
    m.sphere((0, 0, 0.985), 0.158, scale=(1, 0.76, 0.78), segs=24, mat='sj_cloth', color=PANTS, weight='hips')
    m.cyl((0, 0, 1.015), (0, 0, 1.06), 0.162, bevel=0.008, segs=24, scale=(1, 0.74, 1), mat='sj_toon', color=INK, weight='hips', smooth=True)
    m.box((0, -0.122, 1.038), (0.075, 0.022, 0.055), bevel=0.007, mat='sj_metal', color=SUN, weight='hips')
    m.cyl((0.075, -0.108, 1.31), (0.075, -0.128, 1.31), 0.026, bevel=0.004, segs=14, mat='sj_emit', color='#6CFFE9', weight='chest')
    # head: a sphere whose front faces are the sj_face decal region (UV0 = a 0.30 m square centred between the eyes)
    hc = V((0, 0, 1.71))
    hv, hf = m.sphere(hc, 0.17, scale=(1, 0.96, 1.04), segs=28, rings=18, mat='sj_skin', color=SKIN, weight='head')
    face = [f for f in hf if f.normal.y < -0.45 and all(abs(v.co.x) < 0.135 and abs(v.co.z - hc.z) < 0.135 for v in f.verts)]
    m.retag(face, 'sj_face')
    for f in face:
        for l in f.loops:
            l[m.uv].uv = (0.5 + l.vert.co.x / 0.30, 0.5 + (l.vert.co.z - hc.z) / 0.30)
    for s in (1, -1):
        m.sphere((s * 0.168, 0.012, 1.70), 0.036, scale=(0.6, 1, 1.15), segs=10, rings=6, mat='sj_skin', color=SKIN, weight='head', ow=0.7)
    m.sphere((0.172, 0.012, 1.655), 0.016, segs=8, rings=5, mat='sj_metal', color=SUN, weight='head', ow=0.5)
    m.sphere((0, 0.04, 1.765), 0.178, scale=(1.04, 1.0, 0.84), segs=24, rings=12, mat='sj_hair', color=HAIR, weight='head')
    for i, (r0, r1, col) in enumerate(((0.075, 0.062, HAIR), (0.062, 0.046, HAIR), (0.046, 0.02, CORAL))):
        m.capsule(hair[i], hair[i + 1], r0, r1, segs=14, mat='sj_hair', color=col, weight='spr_hair_%d' % (i + 1))
    m.capsule((0, 0, 1.44), (0, 0, 1.58), 0.052, segs=14, mat='sj_skin', color=SKIN, weight='neck')
    m.cyl((0, 0, 1.445), (0, 0, 1.505), 0.085, 0.07, bevel=0.02, segs=18, mat='sj_cloth', color=AMBER, weight='chest', smooth=True)
    for i in range(3):
        m.capsule(scarf[i], scarf[i + 1], 0.04, 0.036, segs=10, scale=(1.5, 0.45, 1), mat='sj_cloth', color=AMBER, weight='spr_scarf_%d' % (i + 1))
    for s, n in ((1, 'L'), (-1, 'R')):
        j = J[n]; d = j['d']
        m.sphere(j['sh1'], 0.07, segs=14, rings=8, mat='sj_cloth', color=JACKET, weight='upperarm_' + n)
        m.capsule(j['sh1'], j['el'], 0.062, 0.053, segs=14, mat='sj_cloth', color=JACKET, weight='upperarm_' + n)
        m.capsule(j['el'], j['wr'] - d * 0.03, 0.053, 0.046, segs=14, mat='sj_cloth', color=JACKET, weight='forearm_' + n)
        m.cyl(j['wr'] - d * 0.05, j['wr'] - d * 0.005, 0.052, bevel=0.008, segs=14, mat='sj_cloth', color=PAPER, weight='forearm_' + n, smooth=True)
        m.capsule(j['wr'] + d * 0.012, j['kn'] - d * 0.012, 0.037, 0.036, segs=12, scale=(1, 1.08, 1), mat='sj_skin', color=SKIN, weight='hand_' + n, ow=0.8)
        for f in ('index', 'middle', 'pinky', 'thumb'):
            a, b, c = j[f]; r = 0.0145 if f == 'thumb' else 0.013
            m.capsule(a, b, r, r, cap=3, mid=0, segs=8, mat='sj_skin', color=SKIN, weight=f + '1_' + n, ow=0.5)
            m.capsule(b, c - (c - b).normalized() * r, r, r * 0.9, cap=3, mid=0, segs=8, mat='sj_skin', color=SKIN, weight=f + '2_' + n, ow=0.5)
        x = s * 0.092
        m.capsule((x, 0, 0.95), (x, 0, 0.52), 0.088, 0.068, segs=16, mat='sj_cloth', color=PANTS, weight='thigh_' + n)
        m.capsule((x, 0, 0.52), (x, 0, 0.20), 0.067, 0.058, segs=16, mat='sj_cloth', color=PANTS, weight='shin_' + n)
        m.cyl((x, 0, 0.065), (x, 0, 0.25), 0.066, 0.07, bevel=0.012, segs=16, mat='sj_gloss', color=BOOT, weight='shin_' + n, smooth=True)
        m.capsule((x, 0.0, 0.058), (x, -0.13, 0.052), 0.064, 0.058, segs=14, scale=(1, 1, 0.9), mat='sj_gloss', color=BOOT, weight='foot_' + n)
        m.sphere((x, -0.16, 0.054), 0.06, scale=(1, 1.25, 0.9), segs=14, rings=8, mat='sj_gloss', color=BOOT, weight='toe_' + n)
        m.cyl((x, 0.035, 0.0), (x, 0.035, 0.03), 0.05, bevel=0.004, segs=12, mat='sj_toon', color=INK, weight='foot_' + n)
    ob = m.build(rig)
    # one morph target: "puff" (the head and hair swell), to test morphs + outlines together
    ob.shape_key_add(name='Basis')
    sk = ob.shape_key_add(name='puff')
    gi = {g.index: g.name for g in ob.vertex_groups}
    for v in ob.data.vertices:
        w = sum(g.weight for g in v.groups if gi[g.group] in ('head', 'spr_hair_1', 'spr_hair_2', 'spr_hair_3'))
        if w > 0.5:
            sk.data[v.index].co = hc + (v.co - hc) * 1.22
    export(os.path.join(OUT, 'cap.glb'), [rig, ob])


# ------------------------------------------------------------------ guitar (neck along +X, front toward -Y)
def guitar():
    reset()
    m = Model('guitar_body')
    m.cyl((-0.10, 0.024, 0), (-0.10, -0.024, 0), 0.175, bevel=0.014, segs=28, mat='sj_gloss', color=TEAL, smooth=True)
    m.cyl((0.085, 0.024, 0.012), (0.085, -0.024, 0.012), 0.132, bevel=0.014, segs=24, mat='sj_gloss', color=TEAL, smooth=True)
    m.cyl((-0.03, -0.022, -0.035), (-0.03, -0.029, -0.035), 0.105, bevel=0.002, segs=24, mat='sj_toon', color=PAPER)
    m.box((0.42, -0.010, 0.012), (0.52, 0.024, 0.046), bevel=0.006, mat='sj_toon', color='#8A5A3C')
    m.box((0.42, -0.026, 0.012), (0.52, 0.008, 0.042), mat='sj_toon', color=INK2)
    m.box((0.735, -0.006, 0.02), (0.15, 0.022, 0.08), bevel=0.01, mat='sj_gloss', color=TEAL)
    for i in range(3):
        for s in (1, -1):
            m.cyl((0.69 + i * 0.045, -0.004, 0.02 + s * 0.04), (0.69 + i * 0.045, -0.004, 0.02 + s * 0.066), 0.011, bevel=0.003, segs=8, mat='sj_metal', color='#D9DCE8', ow=0.6)
    m.box((-0.15, -0.031, 0.0), (0.03, 0.014, 0.075), bevel=0.003, mat='sj_metal', color='#D9DCE8', ow=0.7)
    for x in (-0.06, 0.04):
        m.box((x, -0.03, 0.01), (0.026, 0.01, 0.07), bevel=0.003, mat='sj_metal', color=SUN, ow=0.7)
    for x in (-0.20, -0.155):
        m.cyl((x, -0.024, -0.085), (x, -0.04, -0.085), 0.014, bevel=0.003, segs=10, mat='sj_metal', color='#D9DCE8', ow=0.6)
    m.sphere((-0.105, -0.03, -0.10), 0.009, segs=8, rings=5, mat='sj_emit', color='#FF3B6B', ow=0.0)
    body = m.build()
    st = Model('guitar_strings_noline')
    for i in range(6):
        z = 0.012 + (i - 2.5) * 0.0068
        st.box((0.26, -0.033, z), (0.84, 0.0016, 0.0016 + 0.0003 * (5 - i)), mat='sj_metal', color='#F1F3FA', ow=0.0)
    strings = st.build()
    export(os.path.join(OUT, 'guitar.glb'), [body, strings])


# ------------------------------------------------------------------ shades (origin between the eyes, on att_head)
def shades():
    reset()
    m = Model('shades')
    for s in (1, -1):
        m.cyl((s * 0.068, -0.156, 0.0), (s * 0.068, -0.166, 0.0), 0.056, bevel=0.002, segs=20, mat='sj_glass', color=PINK)
        m.cyl((s * 0.068, -0.150, 0.0), (s * 0.068, -0.158, 0.0), 0.064, bevel=0.003, segs=20, mat='sj_gloss', color=INK)
        m.box((s * 0.148, -0.07, 0.012), (0.01, 0.18, 0.012), mat='sj_gloss', color=INK, ow=0.6)
    m.box((0, -0.156, 0.016), (0.05, 0.012, 0.014), bevel=0.003, mat='sj_gloss', color=INK)
    export(os.path.join(OUT, 'shades.glb'), [m.build()])


# ------------------------------------------------------------------ amp (hard edges, flat shaded)
def amp():
    reset()
    m = Model('amp')
    m.box((0, 0, 0.30), (0.66, 0.32, 0.56), bevel=0.02, mat='sj_toon', color='#2D2A4A')
    m.box((0, -0.156, 0.245), (0.56, 0.02, 0.36), bevel=0.006, mat='sj_cloth', color='#CDB894')
    m.box((0, -0.158, 0.50), (0.56, 0.02, 0.07), bevel=0.004, mat='sj_metal', color='#D9DCE8')
    for i in range(4):
        m.cyl((-0.16 + i * 0.09, -0.165, 0.50), (-0.16 + i * 0.09, -0.19, 0.50), 0.02, bevel=0.004, segs=10, mat='sj_gloss', color=INK, ow=0.6)
    m.sphere((0.21, -0.172, 0.50), 0.014, segs=8, rings=5, mat='sj_emit', color='#FF3B6B', ow=0.0)
    for x in (-0.33, 0.33):
        for y in (-0.16, 0.16):
            for z in (0.02, 0.58):
                m.sphere((x * 0.97, y * 0.97, 0.30 + (z - 0.30) * 0.97), 0.034, segs=8, rings=5, mat='sj_metal', color='#D9DCE8', ow=0.6)
    m.box((0, 0, 0.60), (0.20, 0.04, 0.03), bevel=0.01, mat='sj_toon', color=INK)
    export(os.path.join(OUT, 'amp.glb'), [m.build()])


# ------------------------------------------------------------------ club (a small venue; the floor is StageKit.floor)
def club():
    reset()
    m = Model('club')
    m.box((0, 5.0, 3.5), (18, 0.3, 7.6), mat='sj_toon', color='#2A2350')
    for i in range(-4, 5):
        m.box((i * 2.0, 4.82, 3.5), (0.16, 0.08, 7.6), mat='sj_toon', color='#3A3170')
    m.box((0, 4.8, 0.5), (18, 0.14, 1.0), mat='sj_toon', color='#1F1A3D')
    # neon: a ring and bars
    ring = [(0.0, 0.0)]  # placeholder so the profile reads top-down below
    R, r = 1.15, 0.07
    prof = [(R + r * math.cos(a), r * math.sin(a)) for a in (2 * math.pi * i / 10 for i in range(10))]
    # torus via lathe around the Y axis: built by hand (radius profile needs a non-pole revolve)
    import bmesh
    bm = m.bm; vs = []; fs = []
    segs = 40
    for i in range(segs):
        A = 2 * math.pi * i / segs
        vs.append([bm.verts.new((prof[k][0] * math.cos(A), 4.70 + prof[k][1], 4.3 + prof[k][0] * math.sin(A))) for k in range(10)])
    for i in range(segs):
        a = vs[i]; b = vs[(i + 1) % segs]
        for k in range(10):
            fs.append(bm.faces.new((a[k], a[(k + 1) % 10], b[(k + 1) % 10], b[k])))
    bmesh.ops.recalc_face_normals(bm, faces=fs)
    m._finish([v for row in vs for v in row], fs, 'sj_emit', CORAL, None, 0.0, True)
    for (x, z, w, col) in ((-4.2, 4.9, 2.4, TEAL), (-4.2, 4.4, 1.6, TEAL), (4.2, 4.9, 2.4, SUN), (4.2, 4.4, 1.6, SUN), (0, 4.3, 1.2, '#F4F1FF')):
        m.capsule((x - w / 2, 4.70, z), (x + w / 2, 4.70, z), 0.06, segs=8, cap=2, mid=0, mat='sj_emit', color=col, ow=0.0)
    # riser
    m.box((0, 2.6, 0.17), (3.4, 2.2, 0.34), bevel=0.03, mat='sj_toon', color='#3B3360')
    m.box((0, 1.49, 0.30), (3.4, 0.04, 0.05), mat='sj_metal', color=SUN)
    # truss + par cans
    for y in (1.2, 1.6):
        for z in (5.6, 6.0):
            m.cyl((-6.5, y, z), (6.5, y, z), 0.04, segs=8, mat='sj_metal', color='#8E8AA8', ow=0.6)
    for i in range(-6, 7):
        m.cyl((i * 1.0, 1.2, 5.6), (i * 1.0 + 0.5, 1.6, 6.0), 0.022, segs=6, mat='sj_metal', color='#8E8AA8', ow=0.4)
        m.cyl((i * 1.0 + 0.5, 1.2, 6.0), (i * 1.0 + 1.0, 1.6, 5.6), 0.022, segs=6, mat='sj_metal', color='#8E8AA8', ow=0.4) if i < 6 else None
    cols = [CORAL, TEAL, SUN, GRAPE, PINK, SKY]
    for i, x in enumerate((-5, -3, -1, 1, 3, 5)):
        top = V((x, 1.4, 5.55)); d = V((-x * 0.10, -0.35, -1)).normalized()
        m.cyl(top, top + d * 0.42, 0.13, 0.17, bevel=0.02, segs=12, mat='sj_toon', color=INK2)
        m.cyl(top + d * 0.415, top + d * 0.44, 0.145, bevel=0.004, segs=12, mat='sj_emit', color=cols[i], ow=0.0)
    # speaker stacks
    for s in (1, -1):
        m.box((s * 5.6, 2.2, 1.0), (1.1, 0.9, 2.0), bevel=0.04, mat='sj_toon', color=INK2)
        for z, rr in ((0.55, 0.36), (1.45, 0.30)):
            m.cyl((s * 5.6, 1.76, z), (s * 5.6, 1.72, z), rr, bevel=0.01, segs=20, mat='sj_gloss', color=INK)
            m.cyl((s * 5.6, 1.73, z), (s * 5.6, 1.69, z), rr * 0.35, bevel=0.01, segs=12, mat='sj_metal', color='#8E8AA8')
    export(os.path.join(OUT, 'club.glb'), [m.build()])


if __name__ == '__main__':
    which = sys.argv[1:] or ['cap', 'guitar', 'shades', 'amp', 'club']
    for w in which:
        globals()[w]()
