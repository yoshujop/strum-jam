"""Cage: a low-resolution all-quad control mesh that Catmull-Clark turns into the final surface.

Why a cage and not finished geometry: one subdivision step gives smooth, deliberate forms and
seamless joins (arm into torso, finger into palm) from very little data, the edge loops end up
where joints need them, and everything attached to a cage vertex (skin weights, part tags) is
interpolated onto the final mesh for free. Building the same cage with levels=2 is the close-up LOD.

A cage holds, per vertex: position, skin weights {bone: weight}, free-form metadata (part, s, r ...);
per face: tags (part=..., hide=...). Faces wind counter-clockwise seen from outside.
"""
import math
import numpy as np
from .util import vec, unit, resample, Curve


def cc_comp(n):
    """Catmull-Clark shrink compensation for a closed ring of n cage points.

    The limit surface of a regular n-gon tube has radius r * (2 + cos(2pi/n)) / 3, so scale the
    cage ring by the inverse to land the finished surface on the radius you asked for."""
    return 3.0 / (2.0 + math.cos(2 * math.pi / n))


def _quadrant(a, b, e, m=40):
    """Dense superellipse arc from (0, -b) [front] to (a, 0) [side] as (m+1, 2)."""
    t = np.linspace(0, math.pi / 2, m + 1)
    return np.stack([a * np.sin(t) ** (2.0 / e), -b * np.cos(t) ** (2.0 / e)], axis=1)


def ring2d(n, rx, ryf, ryb=None, ef=2.0, eb=None, phase=0.0):
    """Cross-section ring: n points (x, y), column 0 at the front (0, -ryf), going round to +x
    (the character's left), the back (0, +ryb) at column n/2.

    rx: half width; ryf / ryb: front and back depth (so chests and bellies can be asymmetric);
    ef / eb: superellipse exponents (2 = ellipse, 2.6 = soft box, 4 = box, <2 = diamond-ish).
    Points are evenly spaced by arc length inside each quadrant, which keeps the four cardinal
    columns pinned (centre lines stay centre lines) and the quads even.
    phase: slide every point round the ring by this fraction of a column (0.5 puts an edge,
    not a vertex, on the centre lines: what a hand's wrist ring wants)."""
    ryb = ryf if ryb is None else ryb
    eb = ef if eb is None else eb
    m = 8
    if n % 4 == 0:
        q = n // 4
        f = resample(_quadrant(rx, ryf, ef), q * m + 1)             # front -> left side
        b = resample(_quadrant(rx, ryb, eb), q * m + 1)[::-1].copy()  # left side -> back (mirror y)
        b[:, 1] *= -1
        half = np.vstack([f[:-1], b])                                # cols 0 .. n/2
        other = half[1:-1][::-1].copy()
        other[:, 0] *= -1
        dense = np.vstack([half, other])
    else:
        f = _quadrant(rx, ryf, ef)
        b = _quadrant(rx, ryb, eb)[::-1].copy()
        b[:, 1] *= -1
        half = np.vstack([f[:-1], b])
        other = half[1:-1][::-1].copy()
        other[:, 0] *= -1
        dense = resample(np.vstack([half, other]), n * m, closed=True)
    k = int(round(phase * m))
    return dense[(np.arange(n) * m + k) % (n * m)]


def place(p2, o, ex, ey):
    """Lift 2D ring points into 3D: o + x*ex + y*ey."""
    p2 = np.asarray(p2)
    return np.asarray(o)[None, :] + p2[:, :1] * np.asarray(ex)[None, :] + p2[:, 1:2] * np.asarray(ey)[None, :]


class Loft:
    """Key cross-sections along a path, smoothly interpolated.

    keys: list of dicts with
      t      position along the loft (any increasing number)
      c      centre (x, y, z)
      rx, ry (or ryf / ryb), e (or ef / eb)   see ring2d
      pitch  optional tilt of the ring about its ex axis, radians (front edge dips when > 0)
    Ring frames: by default ex=(1,0,0), ey=(0,1,0) (horizontal rings, for torsos and heads).
    Pass `axis='path'` to keep rings perpendicular to the centre line (limbs), with `front`
    naming the direction the ring's front column should face.
    """
    FIELDS = ('rx', 'ryf', 'ryb', 'ef', 'eb', 'pitch')

    def __init__(self, keys, axis='z', front=(0, -1, 0), kind='pchip'):
        ks = []
        for k in keys:
            k = dict(k)
            ry = k.pop('ry', None)
            e = k.pop('e', None)
            if 'ryf' not in k:
                k['ryf'] = ry
            if 'ryb' not in k:
                k['ryb'] = ry if ry is not None else k['ryf']
            if 'ef' not in k:
                k['ef'] = e if e is not None else 2.0
            if 'eb' not in k:
                k['eb'] = e if e is not None else k['ef']
            k.setdefault('pitch', 0.0)
            ks.append(k)
        self.keys = ks
        self.axis = axis
        self.front = vec(front)
        self.cc = Curve([(k['t'], k['c']) for k in ks], kind)
        self.cv = {f: Curve([(k['t'], k[f]) for k in ks], kind) for f in self.FIELDS}
        self.t0, self.t1 = ks[0]['t'], ks[-1]['t']

    def centre(self, t):
        return self.cc(t)

    def tangent(self, t):
        h = (self.t1 - self.t0) * 1e-3
        return unit(self.cc(min(t + h, self.t1)) - self.cc(max(t - h, self.t0)))

    def frame(self, t):
        if self.axis == 'path':
            T = self.tangent(t)
            f = self.front - T * np.dot(self.front, T)
            f = unit(f)
            ey = -f                      # ring +y is "back"
            ex = np.cross(ey, T)         # so that (ex, ey, T) is right-handed
            return ex, ey, T
        ex, ey, T = vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)
        p = self.cv['pitch'](t)
        if p:
            c, s = math.cos(p), math.sin(p)
            ey = vec(0, c, s)            # back rises, front dips
            T = vec(0, -s, c)
        return ex, ey, T

    def params(self, t):
        return {f: self.cv[f](t) for f in self.FIELDS}

    def ring(self, t, n, comp=True, scale=1.0, phase=0.0):
        """n 3D points of the cross-section at t (comp: pre-compensate Catmull-Clark shrink)."""
        p = self.params(t)
        k = (cc_comp(n) if comp else 1.0) * scale
        p2 = ring2d(n, p['rx'] * k, p['ryf'] * k, p['ryb'] * k, p['ef'], p['eb'], phase)
        ex, ey, _ = self.frame(t)
        return place(p2, self.cc(t), ex, ey)

    def radius(self, t):
        p = self.params(t)
        return (p['rx'] + 0.5 * (p['ryf'] + p['ryb'])) * 0.5


class Cage:
    def __init__(self):
        self.v = []       # positions (np arrays)
        self.w = []       # per vertex {bone: weight}
        self.meta = []    # per vertex dict
        self.f = []       # per face tuple of vertex ids
        self.ft = []      # per face dict of tags
        self.crease = {}  # (lo, hi) vertex pair -> 0..1

    # ------------------------------------------------------------ building
    def add(self, pts, w=None, **meta):
        """Add points; returns their indices. `w` is one weight dict for all of them."""
        pts = np.atleast_2d(np.asarray(pts, dtype=np.float64))
        ids = []
        for p in pts:
            ids.append(len(self.v))
            self.v.append(p.copy())
            self.w.append(dict(w) if w else {})
            self.meta.append(dict(meta))
        return ids

    def face(self, ids, **tag):
        self.f.append(tuple(int(i) for i in ids))
        self.ft.append(dict(tag))
        return len(self.f) - 1

    def bridge(self, A, B, closed=True, skip=(), **tag):
        """Quads between two rings of equal length (A below / before B, both counter-clockwise
        seen from the loft's +T). `skip`: column indices to leave open (for branch holes)."""
        n = len(A)
        assert n == len(B), 'bridge: rings differ in length (%d vs %d)' % (n, len(B))
        out = []
        for i in range(n if closed else n - 1):
            if i in skip:
                continue
            j = (i + 1) % n
            out.append(self.face((A[i], A[j], B[j], B[i]), **tag))
        return out

    def bridge_auto(self, A, B, **tag):
        """Bridge two closed loops of equal length whose start points and directions are unknown:
        tries every rotation of B in both directions and keeps the least twisted match."""
        n = len(A)
        assert n == len(B), 'bridge_auto: loops differ in length (%d vs %d)' % (n, len(B))
        PA = np.array([self.v[i] for i in A])
        best = None
        for rev in (False, True):
            Bm = list(B[::-1]) if rev else list(B)
            PB = np.array([self.v[i] for i in Bm])
            for s in range(n):
                d = float(((PA - np.roll(PB, -s, axis=0)) ** 2).sum())
                if best is None or d < best[0]:
                    best = (d, Bm[s:] + Bm[:s])
        return self.bridge(A, best[1], **tag), best[1]

    def fill(self, loop, bulge=0.0, start=None, a=None, **tag):
        """Close a loop of even length with a grid of quads (a Coons patch): no pole, no fan.

        loop: vertex ids in order. The loop is read as the border of an a x b rectangle
        (2(a+b) = len(loop)); `start` is the index of its first corner (default puts loop[0]
        in the middle of a side). bulge: push the middle out along the loop normal by this much.
        Returns the grid of vertex ids, (b+1) rows of (a+1)."""
        n = len(loop)
        assert n % 2 == 0 and n >= 4, 'fill needs an even loop'
        if a is None:
            a = n // 4 if n % 4 == 0 else (n // 2) // 2
        b = n // 2 - a
        if start is None:
            start = (-(a // 2)) % n
        L = [loop[(start + i) % n] for i in range(n)]
        P = [self.v[i] for i in L]
        bottom = L[0:a + 1]
        right = L[a:a + b + 1]
        top = L[a + b:2 * a + b + 1][::-1]
        left = (L[2 * a + b:] + [L[0]])[::-1]
        ctr = np.mean(P, axis=0)
        nrm = np.zeros(3)
        for i in range(n):
            nrm += np.cross(P[i] - ctr, P[(i + 1) % n] - ctr)
        nrm = unit(nrm)
        grid = [[None] * (a + 1) for _ in range(b + 1)]
        for i in range(a + 1):
            grid[0][i] = bottom[i]
            grid[b][i] = top[i]
        for j in range(b + 1):
            grid[j][0] = left[j]
            grid[j][a] = right[j]
        c00, c10, c01, c11 = (self.v[grid[0][0]], self.v[grid[0][a]], self.v[grid[b][0]], self.v[grid[b][a]])
        wsum = {}
        for i in L:
            for k, x in self.w[i].items():
                wsum[k] = wsum.get(k, 0.0) + x / n
        meta = dict(self.meta[L[0]])
        for j in range(1, b):
            for i in range(1, a):
                u, v = i / a, j / b
                p = ((1 - v) * self.v[bottom[i]] + v * self.v[top[i]] + (1 - u) * self.v[left[j]] + u * self.v[right[j]]
                     - ((1 - u) * (1 - v) * c00 + u * (1 - v) * c10 + (1 - u) * v * c01 + u * v * c11))
                bump = (1 - (2 * u - 1) ** 2) * (1 - (2 * v - 1) ** 2)
                p = p + nrm * bulge * bump
                grid[j][i] = self.add([p], w=wsum, **meta)[0]
        for j in range(b):
            for i in range(a):
                self.face((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]), **tag)
        return grid

    def join(self, other):
        """Append another cage; returns the index offset of its vertices."""
        off = len(self.v)
        self.v += [p.copy() for p in other.v]
        self.w += [dict(x) for x in other.w]
        self.meta += [dict(m) for m in other.meta]
        fo = len(self.f)
        self.f += [tuple(i + off for i in f) for f in other.f]
        self.ft += [dict(t) for t in other.ft]
        for (a, b), c in other.crease.items():
            self.crease[(a + off, b + off)] = c
        return off, fo

    def set_crease(self, loop, value=1.0, closed=True):
        n = len(loop)
        for i in range(n if closed else n - 1):
            a, b = loop[i], loop[(i + 1) % n]
            self.crease[(min(a, b), max(a, b))] = value

    def mirrored(self, swap=(('_L', '_R'),)):
        """A copy mirrored in x, windings reversed, with _L/_R swapped in weights, parts and tags."""
        def sw(name):
            if not isinstance(name, str):
                return name
            for a, b in swap:
                if name.endswith(a):
                    return name[:-len(a)] + b
                if name.endswith(b):
                    return name[:-len(b)] + a
            return name
        c = Cage()
        c.v = [p * vec(-1, 1, 1) for p in self.v]
        c.w = [{sw(k): x for k, x in w.items()} for w in self.w]
        c.meta = [{k: sw(x) for k, x in m.items()} for m in self.meta]
        c.f = [tuple(reversed(f)) for f in self.f]
        c.ft = [{k: sw(x) for k, x in t.items()} for t in self.ft]
        c.crease = dict(self.crease)
        return c

    # ------------------------------------------------------------ queries
    def P(self, ids):
        return np.array([self.v[i] for i in ids])

    def faces_where(self, pred):
        return [i for i, t in enumerate(self.ft) if pred(t)]

    def edge_faces(self, faces=None):
        ef = {}
        for fi in (range(len(self.f)) if faces is None else faces):
            f = self.f[fi]
            for k in range(len(f)):
                a, b = f[k], f[(k + 1) % len(f)]
                ef.setdefault((min(a, b), max(a, b)), []).append(fi)
        return ef

    def boundary_loops(self, faces=None):
        """Ordered boundary loops (lists of vertex ids) of the whole cage or of a face subset.
        Each loop runs in the direction of its faces' winding."""
        nxt = {}
        ef = self.edge_faces(faces)
        for fi in (range(len(self.f)) if faces is None else faces):
            f = self.f[fi]
            for k in range(len(f)):
                a, b = f[k], f[(k + 1) % len(f)]
                if len(ef[(min(a, b), max(a, b))]) == 1:
                    nxt[a] = b
        loops = []
        while nxt:
            s = next(iter(nxt))
            loop = [s]
            cur = nxt.pop(s)
            while cur != s:
                loop.append(cur)
                cur = nxt.pop(cur)
            loops.append(loop)
        return loops

    def orient(self):
        """Make windings consistent and outward-facing (per connected component; closed
        components by signed volume, open ones are left as their first face has them)."""
        ef = self.edge_faces()
        nf = len(self.f)
        seen = [False] * nf
        for s in range(nf):
            if seen[s]:
                continue
            comp = [s]
            seen[s] = True
            stack = [s]
            closed = True
            while stack:
                fi = stack.pop()
                f = self.f[fi]
                for k in range(len(f)):
                    a, b = f[k], f[(k + 1) % len(f)]
                    fs = ef[(min(a, b), max(a, b))]
                    if len(fs) != 2:
                        closed = False
                        continue
                    o = fs[0] if fs[1] == fi else fs[1]
                    if seen[o]:
                        continue
                    g = self.f[o]
                    same = any(g[m] == a and g[(m + 1) % len(g)] == b for m in range(len(g)))
                    if same:  # neighbour runs the shared edge the same way: flip it
                        self.f[o] = tuple(reversed(g))
                    seen[o] = True
                    comp.append(o)
                    stack.append(o)
            if closed:
                vol = 0.0
                for fi in comp:
                    f = self.f[fi]
                    p0 = self.v[f[0]]
                    for k in range(1, len(f) - 1):
                        vol += np.dot(p0, np.cross(self.v[f[k]], self.v[f[k + 1]]))
                if vol < 0:
                    for fi in comp:
                        self.f[fi] = tuple(reversed(self.f[fi]))
        return self

    def vnormals(self):
        N = np.zeros((len(self.v), 3))
        for f in self.f:
            P = [self.v[i] for i in f]
            n = np.zeros(3)
            for k in range(len(P)):
                a, b = P[k], P[(k + 1) % len(P)]
                n += np.array([(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
            for i in f:
                N[i] += n
        ln = np.linalg.norm(N, axis=1)
        ln[ln < 1e-12] = 1
        return N / ln[:, None]

    # ------------------------------------------------------------ clothing
    def shell(self, faces, offset=0.012, lip=0.012, part='shell', crease=0.6, extend=None, tags=None, wall=0.7):
        """A garment cage: copies `faces`, pushes them out along the body's normals and folds
        a lip in at every open edge so the hem has thickness.

        offset: metres, or f(position, meta, normal) -> metres (looser where you want drape).
        lip:    how far the hem folds back in towards the body (0 = no fold).
        extend: f(position, meta) -> extra metres to slide the hem verts away from the garment
                along the surface (lengthen a sleeve, drop a shirt tail). Optional.
        The shell keeps the body's skin weights, so it deforms exactly like the skin under it.
        Returns the new Cage; shell.src maps its vertices back to body vertex ids."""
        N = self.vnormals()
        used = sorted({i for fi in faces for i in self.f[fi]})
        remap = {}
        sh = Cage()
        sh.src = {}
        offs = {}
        for i in used:
            d = offset(self.v[i], self.meta[i], N[i]) if callable(offset) else offset
            offs[i] = d
            remap[i] = sh.add([self.v[i] + N[i] * d], w=self.w[i], **self.meta[i])[0]
            sh.src[remap[i]] = i
        for fi in faces:
            t = dict(self.ft[fi])
            t['src_part'] = t.get('part')
            t['part'] = part
            if tags:
                t.update(tags)
            sh.face([remap[i] for i in self.f[fi]], **t)
        loops = sh.boundary_loops()
        inv = {v: k for k, v in remap.items()}
        if extend is not None:
            # slide hem vertices outward along the surface, away from the garment's interior
            nb = {}
            for f in sh.f:
                for k in range(len(f)):
                    a, b = f[k], f[(k + 1) % len(f)]
                    nb.setdefault(a, set()).add(b)
                    nb.setdefault(b, set()).add(a)
            for loop in loops:
                on = set(loop)
                moves = {}
                for i in loop:
                    ins = [j for j in nb[i] if j not in on]
                    if not ins:
                        continue
                    d = unit(sh.v[i] - np.mean([sh.v[j] for j in ins], axis=0))
                    moves[i] = d * extend(sh.v[i], sh.meta[i])
                for i, m in moves.items():
                    sh.v[i] = sh.v[i] + m
        sh.hems = []
        nb = {}
        for f in sh.f:
            for k in range(len(f)):
                a, b = f[k], f[(k + 1) % len(f)]
                nb.setdefault(a, set()).add(b)
                nb.setdefault(b, set()).add(a)
        for loop in loops:
            sh.hems.append(list(loop))
            if lip <= 0:
                continue
            on = set(loop)
            n = len(loop)
            inner = []
            for i in loop:
                inner.append(sh.add([sh.v[i] - N[inv[i]] * lip], w=sh.w[i], lip=1, **sh.meta[i])[0])
            for k in range(n):
                j = (k + 1) % n
                sh.face((loop[j], loop[k], inner[k], inner[j]), part=part, lip=True, **(tags or {}))
            # a short inner wall running back up inside the garment, so an open sleeve or
            # trouser leg shows cloth, not a see-through back face, when you look into it
            ins = [[j for j in nb[i] if j not in on] for i in loop]
            if wall > 0 and all(ins):
                wallr = []
                for k, i in enumerate(loop):
                    q = np.mean([sh.v[j] for j in ins[k]], axis=0)
                    nq = np.mean([N[inv[j]] for j in ins[k]], axis=0)
                    p = sh.v[i] + (q - sh.v[i]) * wall - nq * lip
                    wallr.append(sh.add([p], w=sh.w[i], lip=2, **sh.meta[i])[0])
                for k in range(n):
                    j = (k + 1) % n
                    sh.face((inner[j], inner[k], wallr[k], wallr[j]), part=part, lip=True, **(tags or {}))
            if crease:
                sh.set_crease(loop, crease)
        return sh

    def interior(self, faces):
        """The faces of a selection that do not touch its border: what a garment made from
        `faces` hides completely (safe to delete from the body)."""
        sel = set(faces)
        vf = {}
        for fi, f in enumerate(self.f):
            for i in f:
                vf.setdefault(i, []).append(fi)
        edge_v = {i for fi in faces for i in self.f[fi] if any(o not in sel for o in vf[i])}
        return [fi for fi in faces if not any(i in edge_v for i in self.f[fi])]

    # ------------------------------------------------------------ to Blender
    def to_object(self, name, levels=1, orient=True, smooth=True):
        """Create the Blender mesh object: Catmull-Clark subdivided `levels` times, vertex groups
        from the cage weights, FACE int attributes sj_cf (source cage face) so tags can be
        looked up on the final faces with `cage.ft[sj_cf]`."""
        import bpy
        if orient:
            self.orient()
        used = sorted({i for f in self.f for i in f})      # vertices no face uses are dropped
        vmap = {i: k for k, i in enumerate(used)}
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(float(x) for x in self.v[i]) for i in used], [],
                       [tuple(vmap[i] for i in f) for f in self.f])
        me.update(calc_edges=True)
        a = me.attributes.new('sj_cf', 'INT', 'FACE')
        a.data.foreach_set('value', list(range(len(self.f))))
        if self.crease:
            ca = me.attributes.new('crease_edge', 'FLOAT', 'EDGE')
            vals = [0.0] * len(me.edges)
            cr = {(min(vmap[a_], vmap[b_]), max(vmap[a_], vmap[b_])): c for (a_, b_), c in self.crease.items()
                  if a_ in vmap and b_ in vmap}
            for e in me.edges:
                k = (min(e.vertices), max(e.vertices))
                if k in cr:
                    vals[e.index] = cr[k]
            ca.data.foreach_set('value', vals)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        groups = {}
        for i in used:
            for b, x in self.w[i].items():
                if x <= 0:
                    continue
                g = groups.get(b)
                if g is None:
                    g = groups[b] = ob.vertex_groups.new(name=b)
                g.add([vmap[i]], float(x), 'REPLACE')
        if levels > 0:
            m = ob.modifiers.new('sub', 'SUBSURF')
            m.subdivision_type = 'CATMULL_CLARK'
            m.levels = levels
            m.render_levels = levels
            m.use_limit_surface = True
            m.boundary_smooth = 'ALL'
            dg = bpy.context.evaluated_depsgraph_get()
            new = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
            ob.modifiers.clear()
            old = ob.data
            ob.data = new
            bpy.data.meshes.remove(old)
            new.name = name
        if smooth:
            ob.data.shade_smooth()
        ob['sj_cage'] = name
        return ob
