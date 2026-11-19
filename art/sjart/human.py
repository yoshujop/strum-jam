"""The parametric human: a spec of proportions -> one seamless all-quad body with skin weights.

Every band member is `Human(HumanSpec(...))` + hair + outfit + props. The body is one cage
(see cage.py): torso, neck and head are a single 16-column loft; arms and legs are 8-column
lofts joined through holes cut in it; hands and feet are joined the same way; one Catmull-Clark
step makes the final surface. Skin weights are authored on the cage (so they are deterministic
and clean: a finger only ever follows its own bones) and interpolated by the subdivision.

Blender space: metres, Z up, the character faces -Y, its left is +X, feet on the ground at the origin.
"""
from dataclasses import dataclass, field, replace
import math
import numpy as np
from .util import vec, unit, lerp, smoothstep, clamp
from .cage import Cage, Loft, ring2d, place, cc_comp

NT = 16  # columns round the torso, neck and head
NL = 8   # columns round a limb
FINGERS = ('pinky', 'middle', 'index')  # palm order, pinky side -> thumb side


@dataclass
class HumanSpec:
    """Proportions of a character, in metres (angles in degrees). Defaults: the neutral mannequin."""
    height: float = 1.80
    # --- head (chin to crown; the face is a 2D decal, see face.py)
    head_h: float = 0.300
    head_w: float = 0.262
    head_d: float = 0.272
    jaw: float = 0.80          # jaw width / head width: 0.6 pointed chin .. 1.0 square
    chin: float = 0.5          # 0 = round, short chin .. 1 = long chin
    cheek: float = 0.5         # 0 = lean .. 1 = full cheeks
    face_e: float = 2.5        # superellipse exponent of the face (higher = flatter face plane)
    skull_e: float = 2.1       # ... of the back of the head
    ear: float = 1.0           # ear size factor (0 = no ears)
    nose: float = 1.0          # nose size factor (0 = no nose: draw it on the face decal instead)
    # --- neck
    neck_len: float = 0.09     # shoulder joint height -> chin
    neck_r: float = 0.045
    # --- torso (hip joint -> shoulder joint)
    torso_len: float = 0.455
    shoulder_w: float = 0.372   # between the shoulder joints
    chest_w: float = 0.30
    chest_d: float = 0.195
    waist_w: float = 0.245
    waist_d: float = 0.165
    hip_w: float = 0.315
    hip_d: float = 0.20
    belly: float = 0.0         # extra depth pushed out in front of the waist
    bust: float = 0.0          # extra depth in front of the chest
    butt: float = 0.012        # extra depth behind the hips
    torso_e: float = 2.35      # cross-section boxiness of the torso
    trap: float = 0.0          # 0 = square shoulders .. 1 = heavy sloping trapezius up to the neck
    # --- arms (rest pose: A-pose, `apose` degrees below horizontal)
    apose: float = 40.0
    elbow_bend: float = 9.0    # relaxed forward bend at the elbow in the rest pose
    upperarm_len: float = 0.275
    forearm_len: float = 0.255
    r_shoulder: float = 0.046
    r_bicep: float = 0.039
    r_elbow: float = 0.032
    r_forearm: float = 0.038
    r_wrist: float = 0.0255
    upperarm_rings: tuple = (0.20, 0.44, 0.66, 0.86)   # ring positions along the bone (0..1)
    forearm_rings: tuple = (0.14, 0.36, 0.62, 0.86)
    # --- hands (wrist -> tip of the middle finger). 4-finger cartoon hand.
    hand_len: float = 0.228
    hand_w: float = 0.122
    hand_t: float = 0.041      # palm thickness
    palm: float = 0.50         # palm length / hand length
    finger_r: float = 0.0188
    finger_splay: float = 8.0  # fan between neighbouring fingers at rest
    finger_curl: float = 7.0   # relaxed curl at rest
    finger_len: tuple = (0.80, 1.0, 0.93)   # pinky, middle, index (relative)
    thumb_len: float = 0.74    # relative to the middle finger
    # --- legs
    knee: float = 0.50         # knee position, as a fraction of hip joint -> ankle
    stance: float = 1.0        # 1 = feet under the hip joints
    r_thigh: float = 0.076
    r_midthigh: float = 0.066
    r_knee: float = 0.047
    r_calf: float = 0.054
    r_ankle: float = 0.033
    thigh_rings: tuple = (0.50, 0.74, 0.90)            # after the automatic top ring
    shin_rings: tuple = (0.10, 0.30, 0.62, 0.88)
    # --- feet (bare foot form; shoes are built round it by outfit.py)
    foot_len: float = 0.280
    foot_w: float = 0.108
    foot_h: float = 0.088      # ankle joint height
    # --- build
    levels: int = 1            # Catmull-Clark levels (1 = game mesh, 2 = close-up LOD)

    def but(self, **kw):
        """A copy with some fields changed: spec.but(height=1.9, r_thigh=0.06)."""
        return replace(self, **kw)

    def scaled(self, k):
        """Every length multiplied by k (a uniformly bigger or smaller person)."""
        d = {}
        for f in self.__dataclass_fields__:
            v = getattr(self, f)
            if f in ('jaw', 'chin', 'cheek', 'face_e', 'skull_e', 'ear', 'nose', 'apose', 'elbow_bend', 'palm',
                     'finger_splay', 'finger_curl', 'thumb_len', 'knee', 'stance', 'torso_e', 'trap', 'levels'):
                continue
            if isinstance(v, float):
                d[f] = v * k
        return replace(self, **d)


class Human:
    """Builds the body cage and the joint positions from a HumanSpec.

    After construction:
      .cage     the body Cage (faces tagged part=torso|neck|head|upperarm_L|forearm_L|hand_L|
                thigh_L|shin_L|foot_L|ear_L|nose ..., plus lo/hi ring names on the torso and
                d0/d1 (0..1 along the bone) on limbs)
      .joints   {bone: (head, tail)} in Blender space, for rig.build_armature
      .lm       landmarks: named points and sizes (eye line, face size, crown ...)
    """

    def __init__(self, spec=None, **kw):
        self.spec = sp = (spec or HumanSpec()).but(**kw) if kw else (spec or HumanSpec())
        self.lm = {}
        self.joints = {}
        self._landmarks()
        self.cage = c = Cage()
        self._torso()
        arm, arm_root = self._arm()
        leg, leg_root = self._leg()
        for side in ('L', 'R'):
            for limb, root, hole, part in ((arm, arm_root, self._armhole, 'shoulder'), (leg, leg_root, self._leghole, 'hipjoint')):
                src = limb if side == 'L' else limb.mirrored()
                off, _ = c.join(src)
                loop = hole[side]
                c.bridge_auto(loop, [i + off for i in root], part='%s_%s' % ('upperarm' if part == 'shoulder' else 'thigh', side),
                              d0=0.0, d1=(sp.upperarm_rings[0] if part == 'shoulder' else self._thigh_top), join=part)
        if sp.ear > 0:
            e = self._ear()
            c.join(e)
            c.join(e.mirrored())
        if sp.nose > 0:
            c.join(self._nose())
        self._mirror_joints()
        c.orient()

    # ------------------------------------------------------------------ landmarks
    def _landmarks(self):
        sp = self.spec
        A = math.radians(sp.apose)
        self.chin_z = sp.height - sp.head_h
        self.sz = self.chin_z - sp.neck_len
        self.hz = self.sz - sp.torso_len
        TL = sp.torso_len
        self.crotch_z = self.hz - 0.17 * TL
        self.ankle_z = sp.foot_h
        self.leg_len = self.hz - self.ankle_z
        self.Lt = self.leg_len * sp.knee
        self.Ls = self.leg_len - self.Lt
        self.hjx = sp.hip_w * 0.275
        # arm chain (left)
        self.S = vec(sp.shoulder_w / 2, 0.006, self.sz)
        a = vec(math.cos(A), 0, -math.sin(A))
        self.E = self.S + a * sp.upperarm_len
        b = math.radians(sp.elbow_bend)
        self.adir = a
        self.fdir = unit(a * math.cos(b) + vec(0, -1, 0) * math.sin(b))
        self.W = self.E + self.fdir * sp.forearm_len
        # hand frame: U along the fingers, V towards the thumb (front), D out of the back of the hand
        self.U = self.fdir
        self.V = unit(vec(0, -1, 0) - self.U * np.dot(self.U, vec(0, -1, 0)))
        self.D = np.cross(self.V, self.U)
        # leg chain (left)
        self.H = vec(self.hjx, 0.004, self.hz)
        self.A = vec(self.hjx * sp.stance, 0.012, self.ankle_z)
        self.K = lerp(self.H, self.A, sp.knee) + vec(0, -0.006, 0)
        # head
        Hh = sp.head_h
        self.head_cy = -0.012
        self.eye_z = self.chin_z + 0.44 * Hh
        self.lm.update(chin_z=self.chin_z, shoulder_z=self.sz, hip_z=self.hz, crotch_z=self.crotch_z,
                       eye_z=self.eye_z, crown_z=sp.height, face_size=0.86 * Hh,
                       face_y=self.head_cy - sp.head_d * 0.5)

    # ------------------------------------------------------------------ torso, neck, head
    def torso_rows(self):
        """The cross-sections of torso, neck and head, bottom to top."""
        sp = self.spec
        TL, hz, sz, cz = sp.torso_len, self.hz, self.sz, self.chin_z
        Hh, hw, hd, hc = sp.head_h, sp.head_w / 2, sp.head_d, self.head_cy
        e = sp.torso_e
        hip, waist, chest = sp.hip_w / 2, sp.waist_w / 2, sp.chest_w / 2
        nr = sp.neck_r
        jw = hw * sp.jaw
        ck = sp.cheek
        R = lambda name, z, rx, ryf, ryb, cy=0.0, ef=e, eb=None, pitch=0.0, part='torso': dict(
            name=name, z=z, rx=rx, ryf=ryf, ryb=ryb, cy=cy, ef=ef, eb=ef if eb is None else eb, pitch=pitch, part=part)
        rows = [
            R('crotch', self.crotch_z + 0.07 * TL, hip * 0.985, sp.hip_d * 0.455 + sp.belly * 0.15, sp.hip_d * 0.50 + sp.butt * 0.8, 0.004),
            R('hip', hz + 0.05 * TL, hip, sp.hip_d * 0.47 + sp.belly * 0.4, sp.hip_d * 0.53 + sp.butt, 0.004),
            R('pelvis', hz + 0.20 * TL, lerp(hip, waist, 0.5), lerp(sp.hip_d, sp.waist_d, 0.55) * 0.49 + sp.belly * 0.85,
              lerp(sp.hip_d, sp.waist_d, 0.6) * 0.51 + sp.butt * 0.35, 0.002),
            R('waist', hz + 0.36 * TL, waist, sp.waist_d * 0.5 + sp.belly, sp.waist_d * 0.5, 0.0),
            R('ribs', hz + 0.55 * TL, lerp(waist, chest, 0.7), lerp(sp.waist_d, sp.chest_d, 0.7) * 0.51 + sp.belly * 0.5 + sp.bust * 0.35,
              lerp(sp.waist_d, sp.chest_d, 0.75) * 0.49, 0.0),
            R('chest', hz + 0.735 * TL, chest, sp.chest_d * 0.52 + sp.bust, sp.chest_d * 0.48, 0.0),
            R('upchest', hz + 0.885 * TL, lerp(chest, sp.shoulder_w / 2, 0.55), sp.chest_d * 0.47 + sp.bust * 0.3, sp.chest_d * 0.47, 0.002),
            R('shoulder', sz + 0.040, sp.shoulder_w / 2 - 0.016, sp.chest_d * 0.34, sp.chest_d * 0.40, 0.006, ef=2.2),
            R('neckbase', sz + 0.066 + 0.035 * sp.trap, nr * (1.62 + 0.7 * sp.trap), nr * (1.22 + 0.25 * sp.trap), nr * (1.42 + 0.5 * sp.trap), 0.012, ef=2.0, part='neck'),
            R('neck', lerp(sz + 0.066, cz + 0.03, 0.55), nr, nr, nr * 1.02, 0.016, ef=2.0, part='neck'),
            R('necktop', cz + 0.034, nr * 1.04, nr * 1.05, nr * 1.05, 0.022, ef=2.0, part='neck'),
            # head: jaw ring is pitched so the chin dips and the skull base rises
            R('jaw', cz + (0.105 - 0.02 * sp.chin) * Hh, jw * 0.80, hd * (0.385 + 0.02 * sp.chin), hd * 0.30, hc, ef=2.15, eb=2.0,
              pitch=0.26 + 0.10 * sp.chin, part='head'),
            R('mouth', cz + 0.245 * Hh, lerp(jw, hw, 0.42 + 0.3 * ck), hd * 0.468, hd * 0.43, hc, ef=sp.face_e * 0.92, eb=sp.skull_e,
              pitch=0.12, part='head'),
            R('eye', cz + 0.46 * Hh, hw, hd * 0.50, hd * 0.50, hc, ef=sp.face_e, eb=sp.skull_e, pitch=0.03, part='head'),
            R('brow', cz + 0.66 * Hh, hw * 0.992, hd * 0.492, hd * 0.508, hc, ef=sp.face_e, eb=sp.skull_e, part='head'),
            R('forehead', cz + 0.825 * Hh, hw * 0.90, hd * 0.44, hd * 0.465, hc + 0.002, ef=2.2, eb=2.05, part='head'),
            R('crown', cz + 0.945 * Hh, hw * 0.64, hd * 0.305, hd * 0.325, hc + 0.004, ef=2.05, part='head'),
            R('top', cz + 1.005 * Hh, hw * 0.30, hd * 0.142, hd * 0.150, hc + 0.004, ef=2.0, part='head'),
        ]
        return rows

    def _chain_w(self, z):
        TL, hz = self.spec.torso_len, self.hz
        zs, zc, a = hz + 0.30 * TL, hz + 0.60 * TL, 0.075
        s1 = smoothstep(zs - a, zs + a, z)
        s2 = smoothstep(zc - a, zc + a, z)
        return {'hips': 1 - s1, 'spine': s1 * (1 - s2), 'chest': s1 * s2}

    def _row_w(self, row, j):
        """Skin weights of torso column j (0 = front centre, 4 = left side, 8 = back, 12 = right side)."""
        name = row['name']
        fixed = {'neckbase': {'chest': 0.62, 'neck': 0.38}, 'neck': {'neck': 0.9, 'head': 0.1},
                 'necktop': {'neck': 0.55, 'head': 0.45}}
        if row['part'] == 'head':
            return {'head': 1.0}
        if name in fixed:
            w = dict(fixed[name])
        else:
            w = self._chain_w(row['z'])
        side = 'L' if 0 < j < NT // 2 else 'R' if j > NT // 2 else ''
        k = j if j <= NT // 2 else NT - j     # 0..8 from the front centre round to the back centre
        extra = {}
        if side:
            if name == 'crotch':
                extra['thigh_' + side] = (0.0, 0.30, 0.42, 0.46, 0.46, 0.46, 0.42, 0.30, 0.0)[k]
            elif name == 'hip':
                extra['thigh_' + side] = (0.0, 0.05, 0.12, 0.18, 0.20, 0.18, 0.12, 0.05, 0.0)[k]
            elif name == 'chest':
                extra['upperarm_' + side] = (0, 0, 0.04, 0.16, 0.20, 0.16, 0.04, 0, 0)[k]
                extra['shoulder_' + side] = (0, 0, 0.06, 0.10, 0.10, 0.10, 0.06, 0, 0)[k]
            elif name == 'upchest':
                extra['upperarm_' + side] = (0, 0, 0.06, 0.30, 0.0, 0.30, 0.06, 0, 0)[k]
                extra['shoulder_' + side] = (0, 0.10, 0.28, 0.32, 0.0, 0.32, 0.28, 0.10, 0)[k]
            elif name == 'shoulder':
                extra['upperarm_' + side] = (0, 0, 0.05, 0.30, 0.38, 0.30, 0.05, 0, 0)[k]
                extra['shoulder_' + side] = (0, 0.18, 0.42, 0.48, 0.48, 0.48, 0.42, 0.18, 0)[k]
            elif name == 'neckbase':
                extra['shoulder_' + side] = (0, 0.04, 0.10, 0.14, 0.14, 0.14, 0.10, 0.04, 0)[k]
        rest = 1.0 - sum(extra.values())
        w = {b: x * rest for b, x in w.items()}
        w.update({b: x for b, x in extra.items() if x > 0})
        return w

    def _torso(self):
        c, sp = self.cage, self.spec
        rows = self.torso_rows()
        comp = cc_comp(NT)
        ring = {}
        for r in rows:
            p2 = ring2d(NT, r['rx'] * comp, r['ryf'] * comp, r['ryb'] * comp, r['ef'], r['eb'])
            p = r['pitch']
            pts = place(p2, vec(0, r['cy'], r['z']), vec(1, 0, 0), vec(0, math.cos(p), math.sin(p)))
            ring[r['name']] = [c.add([pts[j]], w=self._row_w(r, j), part=r['part'], ring=r['name'], col=j,
                                     r=0.5 * (r['rx'] + 0.5 * (r['ryf'] + r['ryb'])))[0] for j in range(NT)]
        self.ring = ring
        names = [r['name'] for r in rows]
        hole_cols = {3, 4, 11, 12}
        for a, b in zip(rows[:-1], rows[1:]):
            skip = hole_cols if a['name'] in ('chest', 'upchest') else ()
            part = a['part']
            if a['name'] == 'necktop':
                part = 'head'
            c.bridge(ring[a['name']], ring[b['name']], skip=skip, part=part, lo=a['name'], hi=b['name'],
                     li=names.index(a['name']))
        c.fill(ring['top'], bulge=0.012 * sp.head_h / 0.3, part='head', lo='top', hi='cap', li=len(names) - 1)
        self._armhole = {}
        for side, (c0, c1, c2) in (('L', (3, 4, 5)), ('R', (13, 12, 11))):
            ch, up, sh = ring['chest'], ring['upchest'], ring['shoulder']
            self._armhole[side] = [ch[c0], ch[c1], ch[c2], up[c2], sh[c2], sh[c1], sh[c0], up[c0]]
        # crotch: a strip two quads wide runs from the front centre under to the back centre;
        # what is left on each side of it is the top loop of a leg
        cr = ring['crotch']
        z = self.crotch_z
        gap = 0.016 + 0.05 * sp.hip_w
        x0 = c.add([vec(0, 0.006, z)], w={'hips': 1.0}, part='torso', ring='under', col=0)[0]
        xl = c.add([vec(gap, 0.006, z + 0.012)], w={'hips': 0.62, 'thigh_L': 0.38}, part='torso', ring='under', col=1)[0]
        xr = c.add([vec(-gap, 0.006, z + 0.012)], w={'hips': 0.62, 'thigh_R': 0.38}, part='torso', ring='under', col=-1)[0]
        tag = dict(part='torso', lo='under', hi='crotch', li=-1)
        c.face((cr[15], cr[0], x0, xr), **tag)
        c.face((cr[0], cr[1], xl, x0), **tag)
        c.face((xr, x0, cr[8], cr[9]), **tag)
        c.face((x0, xl, cr[7], cr[8]), **tag)
        self._leghole = {'L': [cr[j] for j in range(1, 8)] + [xl], 'R': [cr[j] for j in range(15, 8, -1)] + [xr]}
        self._leg_gap = gap
        # spine joints
        TL, hz = sp.torso_len, self.hz
        J = self.joints
        hy = 0.012
        J['root'] = (vec(0, 0, 0), vec(0, 0, 0.12))
        J['hips'] = (vec(0, hy, hz + 0.08 * TL), vec(0, hy, hz + 0.30 * TL))
        J['spine'] = (vec(0, hy, hz + 0.30 * TL), vec(0, hy, hz + 0.60 * TL))
        J['chest'] = (vec(0, hy, hz + 0.60 * TL), vec(0, 0.016, self.sz + 0.05))
        J['neck'] = (vec(0, 0.016, self.sz + 0.05), vec(0, 0.020, self.chin_z + 0.045))
        J['head'] = (vec(0, 0.020, self.chin_z + 0.045), vec(0, 0.020, sp.height))

    # ------------------------------------------------------------------ arm + hand (left)
    def _arm(self):
        sp = self.spec
        c = Cage()
        Lu, Lf = sp.upperarm_len, sp.forearm_len
        S, E, W = self.S, self.E, self.W
        keys = [
            dict(t=-0.03, c=S - self.adir * 0.03, rx=sp.r_shoulder, ry=sp.r_shoulder),
            dict(t=0.0, c=S, rx=sp.r_shoulder, ry=sp.r_shoulder),
            dict(t=0.22 * Lu, c=lerp(S, E, 0.22), rx=sp.r_shoulder * 0.99, ry=sp.r_shoulder * 1.0),
            dict(t=0.52 * Lu, c=lerp(S, E, 0.52), rx=sp.r_bicep, ry=sp.r_bicep * 1.03),
            dict(t=0.9 * Lu, c=lerp(S, E, 0.9), rx=lerp(sp.r_bicep, sp.r_elbow, 0.9), ry=lerp(sp.r_bicep, sp.r_elbow, 0.9)),
            dict(t=Lu, c=E, rx=sp.r_elbow, ry=sp.r_elbow),
            dict(t=Lu + 0.1 * Lf, c=lerp(E, W, 0.1), rx=lerp(sp.r_elbow, sp.r_forearm, 0.6), ry=lerp(sp.r_elbow, sp.r_forearm, 0.6)),
            dict(t=Lu + 0.27 * Lf, c=lerp(E, W, 0.27), rx=sp.r_forearm, ry=sp.r_forearm * 1.02),
            dict(t=Lu + 0.72 * Lf, c=lerp(E, W, 0.72), rx=lerp(sp.r_forearm, sp.r_wrist, 0.68) * 0.94, ry=lerp(sp.r_forearm, sp.r_wrist, 0.68) * 1.06),
            dict(t=Lu + Lf, c=W, rx=sp.r_wrist * 0.84, ry=sp.r_wrist * 1.18),
        ]
        loft = Loft(keys, axis='path', front=(0, -1, 0))
        rows = [(f * Lu, 'upperarm', f) for f in sp.upperarm_rings] + [(Lu, 'upperarm', 1.0)] + \
               [(Lu + f * Lf, 'forearm', f) for f in sp.forearm_rings]
        rings = []
        for d, bone, f in rows:
            wf = smoothstep(Lu - 0.065, Lu + 0.065, d)
            wh = smoothstep(Lu + Lf - 0.055, Lu + Lf + 0.035, d)
            tw = clamp((d - Lu - 0.22 * Lf) / (0.66 * Lf)) if d > Lu else 0.0
            w = {'upperarm_L': 1 - wf, 'forearm_L': wf * (1 - wh) * (1 - tw), 'twist_forearm_L': wf * (1 - wh) * tw, 'hand_L': wf * wh}
            if bone == 'upperarm' and f <= 0.3:
                w = {'upperarm_L': 0.86, 'shoulder_L': 0.14}
            ph = 0.5 * smoothstep(0.15 * Lu, 0.9 * Lu, d)
            pts = loft.ring(d, NL, phase=ph)
            rings.append((c.add(pts, w=w, part=bone + '_L', bone=bone, s=f, r=loft.radius(d)), bone, f))
        for (a, ba, fa), (b, bb, fb) in zip(rings[:-1], rings[1:]):
            part = ba if fa < 1.0 else 'forearm'
            c.bridge(a, b, part=part + '_L', d0=(fa if part == ba else 0.0), d1=(fb if bb == part else 1.0))
        self._hand(c, rings[-1][0], sp.forearm_rings[-1])
        J = self.joints
        J['shoulder_L'] = (vec(0.022, 0.012, self.sz + 0.012), S.copy())
        J['upperarm_L'] = (S.copy(), E.copy())
        J['forearm_L'] = (E.copy(), W.copy())
        J['twist_forearm_L'] = (lerp(E, W, 0.6), W.copy())
        return c, rings[0][0]

    def _hand(self, c, arm_ring, f_last):
        """4-finger cartoon hand on the end of the forearm. Rings of 8: T0..T3 across the back
        of the hand (pinky side -> thumb side), then B3..B0 back across the palm."""
        sp = self.spec
        O, U, V, D = self.W, self.U, self.V, self.D
        a, b = sp.hand_w / 2, sp.hand_t / 2
        HL = sp.hand_len
        PL = HL * sp.palm
        fr = sp.finger_r
        k = HL / 0.20

        def P(u, v, w):
            return O + U * u + V * v + D * w

        def palm_ring(u, aw, bw, box, du=(0, 0, 0, 0), dv=0.0, arch=0.0, pad=0.0, wgt=None, name=''):
            pts = []
            for side in (1, -1):
                idx = range(4) if side == 1 else range(3, -1, -1)
                for i in idx:
                    ang = math.radians(157.5 - 45 * i)
                    ve, we = aw * 1.09 * math.cos(ang), bw * 1.09 * math.sin(ang)
                    vb = aw * 1.04 * (-1 + 2 * i / 3.0)
                    wb = bw * 1.10 * (0.74 if i in (0, 3) else 1.0)
                    v = lerp(ve, vb, box) + dv
                    w = lerp(we, wb, box)
                    if side == 1:
                        w += arch * (1.0 if i in (1, 2) else 0.2)
                    else:
                        w = -w - pad * (1.0 if i == 3 else 0.5 if i == 2 else 0.2 if i == 1 else 0.6)
                    pts.append(P(u + du[i], v, w))
            return c.add(pts, w=wgt or {'hand_L': 1.0}, part='hand_L', ring=name)

        wrist = palm_ring(0.0, sp.r_wrist * 1.20, sp.r_wrist * 0.86, 0.0, wgt={'forearm_L': 0.12, 'twist_forearm_L': 0.30, 'hand_L': 0.58}, name='wrist')
        p1 = palm_ring(0.27 * PL, lerp(sp.r_wrist * 1.2, a, 0.74), b * 0.98, 0.72, dv=0.004 * k, arch=0.002 * k, pad=0.004 * k, name='heel')
        p2 = palm_ring(0.62 * PL, a * 1.0, b * 1.0, 1.0, dv=0.003 * k, arch=0.003 * k, pad=0.003 * k, name='palm')
        kn = palm_ring(PL, a * 0.99, b * 0.90, 1.0, du=(-0.017 * k, -0.003 * k, 0.0, -0.010 * k), arch=0.002 * k, name='knuckle')
        c.bridge_auto(arm_ring, wrist, part='forearm_L', d0=f_last, d1=1.0)
        c.bridge(wrist, p1, part='hand_L', zone='palm')
        c.bridge(p1, p2, skip={3}, part='hand_L', zone='palm')       # column 3 = the thumb side edge (T3 -> B3)
        c.bridge(p2, kn, part='hand_L', zone='palm')
        # knuckle weights: each knuckle vertex is shared by the fingers either side of it
        T = kn[0:4]
        B = kn[7:3:-1]            # B0..B3
        for i in range(4):
            fs = [FINGERS[j] for j in (i - 1, i) if 0 <= j < 3]
            w = {'hand_L': 0.72}
            for f in fs:
                w[f + '1_L'] = 0.28 / len(fs)
            c.w[T[i]] = dict(w)
            c.w[B[i]] = dict(w)
        J = self.joints
        mid_base = None
        splay = math.radians(sp.finger_splay)
        curl = math.radians(sp.finger_curl)
        for i, name in enumerate(FINGERS):
            base = [T[i], T[i + 1], B[i + 1], B[i]]
            bc = np.mean(c.P(base), axis=0)
            FL = (HL - PL) * sp.finger_len[i]
            fu = unit(U * math.cos((i - 1) * splay) + V * math.sin((i - 1) * splay))
            fu = unit(fu * math.cos(curl) - D * math.sin(curl))
            fv = unit(V - fu * np.dot(V, fu))
            fw = np.cross(fv, fu)
            r = fr * (0.94 if name == 'pinky' else 1.0)
            self._digit(c, base, bc, fu, fv, fw, FL, r, name, curl2=curl * 1.3)
            if name == 'middle':
                mid_base = bc
        J['hand_L'] = (O.copy(), mid_base.copy())
        # thumb: out of the hole left on the thumb side between the heel and palm rings
        hole = [p1[3], p2[3], p2[4], p1[4]]
        for i in hole:
            c.w[i] = {'hand_L': 0.6, 'thumb1_L': 0.4}
        hc = np.mean(c.P(hole), axis=0)
        tu = unit(U * 0.60 + V * 0.76 - D * 0.24)
        tw_ = unit(D - tu * np.dot(D, tu))
        tv = np.cross(tu, tw_)
        TLn = (HL - PL) * sp.thumb_len
        cmc = P(0.20 * PL, a * 0.42, -b * 0.25)
        self._digit(c, hole, hc, tu, tv, tw_, TLn, fr * 1.10, 'thumb', curl2=math.radians(12), cmc=cmc, auto=True)
        J['att_hand_L'] = (P(0.58 * PL, 0.0, -b * 1.0), P(0.58 * PL, 0.0, -b * 1.0) + U * 0.05, D.copy())

    def _digit(self, c, base, bc, fu, fv, fw, FL, r, name, curl2=0.0, cmc=None, auto=False):
        """One finger: rings of 4 from a base loop out to a rounded tip; two bones."""
        h = r * 1.07
        jf = 0.50 if name != 'thumb' else 0.48
        # second phalanx bends a little more (relaxed curl)
        fu2 = unit(fu * math.cos(curl2) - fw * math.sin(curl2))
        fw2 = np.cross(fv, fu2)
        joint = bc + fu * FL * jf

        def centre(f):
            return bc + fu * FL * f if f <= jf else joint + fu2 * FL * (f - jf)

        b1, b2 = name + '1_L', name + '2_L'
        rows = [(0.13, 1.04, {b1: 0.88, 'hand_L': 0.12}), (0.33, 0.99, {b1: 1.0}), (jf, 0.96, {b1: 0.5, b2: 0.5}),
                (0.68, 0.97, {b2: 1.0}), (0.88, 0.93, {b2: 1.0}), (0.985, 0.60, {b2: 1.0})]
        prev = base
        first = True
        perm = [0, 1, 2, 3]
        for f, s, w in rows:
            u_, w_ = (fu, fw) if f < jf else (unit(fu + fu2), unit(fw + fw2)) if f == jf else (fu2, fw2)
            ce = centre(f)
            hh = h * s
            pts = [ce - fv * hh + w_ * hh, ce + fv * hh + w_ * hh, ce + fv * hh - w_ * hh, ce - fv * hh - w_ * hh]
            ring = c.add([pts[i] for i in perm], w=w, part='hand_L', digit=name, s=f)
            if first and auto:
                _, ring2 = c.bridge_auto(prev, ring, part='hand_L', digit=name, zone='web')
                perm = [ring.index(i) for i in ring2]
                ring = ring2
            else:
                c.bridge(prev, ring, part='hand_L', digit=name, zone='web' if first else 'digit')
            prev = ring
            first = False
        c.fill(prev, bulge=r * 0.25, part='hand_L', digit=name, zone='tip')
        J = self.joints
        tip = centre(1.0)
        J[b1] = ((cmc if cmc is not None else bc).copy(), joint.copy())
        J[b2] = (joint.copy(), tip.copy())

    # ------------------------------------------------------------------ leg + foot (left)
    def _leg(self):
        sp = self.spec
        c = Cage()
        Lt, Ls = self.Lt, self.Ls
        H, K, A = self.H, self.K, self.A
        z_top = self.crotch_z - 0.012
        t_top = self.hz - z_top
        self._thigh_top = t_top / Lt
        x_top = self._leg_gap * 0.55 + sp.r_thigh
        top_c = vec(max(x_top, lerp(H, K, t_top / Lt)[0]), 0.004, z_top)
        dn = lambda p0, p1, f: lerp(p0, p1, f)
        keys = [
            dict(t=t_top - 0.05, c=top_c + vec(0, 0, 0.05), rx=sp.r_thigh, ryf=sp.r_thigh * 1.02, ryb=sp.r_thigh * 1.06),
            dict(t=t_top, c=top_c, rx=sp.r_thigh, ryf=sp.r_thigh * 1.02, ryb=sp.r_thigh * 1.06),
            dict(t=0.52 * Lt, c=dn(H, K, 0.52) + vec(0.004, -0.004, 0), rx=sp.r_midthigh, ryf=sp.r_midthigh * 1.06, ryb=sp.r_midthigh * 1.0),
            dict(t=0.9 * Lt, c=dn(H, K, 0.9), rx=lerp(sp.r_midthigh, sp.r_knee, 0.86), ryf=lerp(sp.r_midthigh, sp.r_knee, 0.86) * 1.03,
                 ryb=lerp(sp.r_midthigh, sp.r_knee, 0.86)),
            dict(t=Lt, c=K, rx=sp.r_knee, ryf=sp.r_knee * 1.05, ryb=sp.r_knee * 0.98),
            dict(t=Lt + 0.11 * Ls, c=dn(K, A, 0.11), rx=lerp(sp.r_knee, sp.r_calf, 0.55), ryf=sp.r_knee * 0.98, ryb=lerp(sp.r_knee, sp.r_calf, 0.7) * 1.08),
            dict(t=Lt + 0.30 * Ls, c=dn(K, A, 0.30) + vec(0, 0.004, 0), rx=sp.r_calf, ryf=sp.r_calf * 0.90, ryb=sp.r_calf * 1.20),
            dict(t=Lt + 0.72 * Ls, c=dn(K, A, 0.72), rx=lerp(sp.r_calf, sp.r_ankle, 0.78), ryf=lerp(sp.r_calf, sp.r_ankle, 0.78) * 0.98,
                 ryb=lerp(sp.r_calf, sp.r_ankle, 0.78) * 1.08),
            dict(t=Lt + Ls, c=A, rx=sp.r_ankle, ryf=sp.r_ankle * 1.02, ryb=sp.r_ankle * 1.12),
        ]
        loft = Loft(keys, axis='path', front=(0, -1, 0))
        rows = [(t_top, 'thigh', t_top / Lt)] + [(f * Lt, 'thigh', f) for f in sp.thigh_rings] + [(Lt, 'thigh', 1.0)] + \
               [(Lt + f * Ls, 'shin', f) for f in sp.shin_rings]
        rings = []
        for d, bone, f in rows:
            wk = smoothstep(Lt - 0.07, Lt + 0.07, d)
            w = {'thigh_L': 1 - wk, 'shin_L': wk}
            if d == t_top:
                w = {'thigh_L': 0.84, 'hips': 0.16}
            pts = loft.ring(d, NL)
            rings.append((c.add(pts, w=w, part=bone + '_L', bone=bone, s=f, r=loft.radius(d)), bone, f))
        # inner top vertex follows the hips a little more (crotch stays put when a leg lifts)
        for i in rings[0][0]:
            if c.v[i][0] < top_c[0] - sp.r_thigh * 0.6:
                c.w[i] = {'thigh_L': 0.66, 'hips': 0.34}
        for (a, ba, fa), (b, bb, fb) in zip(rings[:-1], rings[1:]):
            part = ba if fa < 1.0 else 'shin'
            c.bridge(a, b, part=part + '_L', d0=(fa if part == ba else 0.0), d1=(fb if bb == part else 1.0))
        self._foot(c, rings[-1][0], sp.shin_rings[-1])
        J = self.joints
        J['thigh_L'] = (H.copy(), K.copy())
        J['shin_L'] = (K.copy(), A.copy())
        return c, rings[0][0]

    def _foot(self, c, leg_ring, f_last):
        sp = self.spec
        L, Wd, fh = sp.foot_len, sp.foot_w / 2, sp.foot_h
        A = self.A
        heel_y = A[1] + 0.27 * L
        table = [  # f along the foot, half width, top height, x drift (toes sit a touch outward)
            (0.045, 0.56, 0.60, 0.0), (0.135, 0.80, 1.00, 0.0), (0.27, 0.88, 1.12, 0.0), (0.405, 0.94, 0.98, 0.001),
            (0.58, 1.00, 0.66, 0.003), (0.76, 0.99, 0.50, 0.005), (0.91, 0.86, 0.43, 0.006), (0.985, 0.50, 0.33, 0.006)]
        keys = []
        for f, hw, top, dx in table:
            t = top * fh
            zc = t * 0.42
            keys.append(dict(t=f, c=vec(A[0] + dx, heel_y - f * L, zc), rx=hw * Wd, ryf=zc, ryb=t - zc, ef=3.4, eb=2.0))
        loft = Loft(keys, axis='path', front=(0, 0, -1), kind='pchip')
        rings = []
        for f, hw, top, dx in table:
            wt = smoothstep(0.62, 0.86, f)
            pts = loft.ring(f, NL)
            rings.append(c.add(pts, w={'foot_L': 1 - wt, 'toe_L': wt}, part='foot_L', s=f))
        hole_rings = (1, 2, 3)
        for i in range(len(rings) - 1):
            skip = {3, 4} if i in (1, 2) else ()
            c.bridge(rings[i], rings[i + 1], skip=skip, part='foot_L', d0=table[i][0], d1=table[i + 1][0])
        c.fill(rings[0][::-1], bulge=0.008, part='foot_L', d0=0.0, d1=table[0][0])
        c.fill(rings[-1], bulge=0.008, part='foot_L', d0=table[-1][0], d1=1.0)
        ra, rb, rc = (rings[i] for i in hole_rings)
        hole = [ra[3], ra[4], ra[5], rb[5], rc[5], rc[4], rc[3], rb[3]]
        for i in hole:
            c.w[i] = {'foot_L': 0.62, 'shin_L': 0.38}
        for i in leg_ring:
            c.w[i] = {'shin_L': 0.9, 'foot_L': 0.1}
        c.bridge_auto(leg_ring, hole, part='shin_L', d0=f_last, d1=1.0)
        J = self.joints
        ball = vec(A[0] + 0.004, heel_y - 0.74 * L, 0.022)
        J['foot_L'] = (A.copy(), ball)
        J['toe_L'] = (ball.copy(), vec(A[0] + 0.006, heel_y - L, 0.022))

    # ------------------------------------------------------------------ ears, nose
    def _ear(self):
        sp = self.spec
        c = Cage()
        k = sp.ear * sp.head_h / 0.305
        hw = sp.head_w / 2
        o = vec(hw * 0.955, self.head_cy + sp.head_d * 0.07, self.chin_z + 0.445 * sp.head_h)
        out = unit(vec(1.0, 0.55, 0.0))                 # ears lean back
        up = vec(0, 0, 1)
        fwd = unit(np.cross(up, out))
        rows = [(-0.012, 0.74, 0.80), (0.006, 1.0, 1.0), (0.022, 1.12, 1.06), (0.030, 0.92, 0.86)]
        prev = None
        for d, sh, sw in rows:
            p2 = ring2d(NL, 0.0135 * k * sw * cc_comp(NL), 0.034 * k * sh * cc_comp(NL), ef=2.3)
            ce = o + out * d * k + up * 0.004 * k * (d > 0.01)
            pts = place(p2, ce, fwd, up)
            ring = c.add(pts, w={'head': 1.0}, part='ear_L')
            if prev is not None:
                c.bridge(prev, ring, part='ear_L')
            prev = ring
        c.fill(prev, bulge=0.002 * k, part='ear_L')
        return c

    def _nose(self):
        sp = self.spec
        c = Cage()
        k = sp.nose * sp.head_h / 0.305
        face_y = self.head_cy - sp.head_d * 0.5
        o = vec(0, face_y + 0.012, self.chin_z + 0.385 * sp.head_h)
        out = unit(vec(0, -1.0, -0.38))
        ex = vec(1, 0, 0)
        ey = unit(np.cross(out, ex))
        rows = [(-0.016, 0.9, 1.0), (0.006, 1.0, 1.0), (0.020, 0.86, 0.80), (0.028, 0.55, 0.5)]
        prev = None
        for d, sw, shh in rows:
            p2 = ring2d(NL, 0.0125 * k * sw * cc_comp(NL), 0.0115 * k * shh * cc_comp(NL), ef=2.2)
            pts = place(p2, o + out * d * k, ex, ey)
            ring = c.add(pts, w={'head': 1.0}, part='nose')
            if prev is not None:
                c.bridge(prev, ring, part='nose')
            prev = ring
        c.fill(prev, bulge=0.003 * k, part='nose')
        return c

    # ------------------------------------------------------------------ joints
    def _mirror_joints(self):
        J = self.joints
        m = vec(-1, 1, 1)
        for name in list(J):
            if name.endswith('_L'):
                j = J[name]
                J[name[:-2] + '_R'] = (j[0] * m, j[1] * m) + ((-(j[2] * m),) if len(j) > 2 else ())
        sp = self.spec
        J['att_head'] = (vec(0, self.head_cy + 0.004, sp.height), vec(0, self.head_cy + 0.004, sp.height + 0.05))
        J['att_back'] = (vec(0, sp.chest_d * 0.50, self.sz - 0.10), vec(0, sp.chest_d * 0.50, self.sz - 0.05))
        J['att_hip'] = (vec(0, -sp.hip_d * 0.48, self.hz + 0.05), vec(0, -sp.hip_d * 0.48, self.hz + 0.10))

    # ------------------------------------------------------------------ selections
    def select(self, torso=None, upperarm=None, forearm=None, thigh=None, shin=None, hand=False, foot=False,
               head=None, neck=False, sides='LR', where=None):
        """Cage face ids of a body region, for shells (clothes) and hiding.

        torso=('hip', 'neckbase')   the torso between two named rings (see torso_rows)
        head=('brow', 'cap')        same, on the head rings
        upperarm=(0.0, 0.66)        a stretch of a limb, as fractions along the bone
        hand / foot / neck          whole parts
        where                        extra predicate on the face tags
        """
        c = self.cage
        names = [r['name'] for r in self.torso_rows()] + ['cap']
        out = []

        def span(t, lo, hi):
            a, b = names.index(lo), names.index(hi)
            li = t.get('li')
            return li is not None and li >= 0 and a <= li < b

        for fi, t in enumerate(c.ft):
            p = t.get('part', '')
            ok = False
            if torso and p == 'torso':
                ok = span(t, *torso) or (t.get('lo') == 'under' and names.index(torso[0]) == 0)
            if torso and p == 'neck' and t.get('li') is not None:
                ok = ok or span(t, *torso)
            if head and p == 'head':
                ok = ok or span(t, *head)
            if neck and p == 'neck':
                ok = True
            for limb, rng in (('upperarm', upperarm), ('forearm', forearm), ('thigh', thigh), ('shin', shin)):
                if rng and p[:-2] == limb and p[-1] in sides:
                    ok = ok or (t['d0'] >= rng[0] - 1e-6 and t['d1'] <= rng[1] + 1e-6)
            if hand and p[:-2] == 'hand' and p[-1] in sides:
                ok = True
            if foot and p[:-2] == 'foot' and p[-1] in sides:
                ok = True
            if ok and (where is None or where(t)):
                out.append(fi)
        return out
