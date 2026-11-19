"""Small maths helpers shared by the whole toolkit (numpy only, no bpy)."""
import math
import numpy as np


def vec(*a):
    """vec(1, 2, 3) or vec([1, 2, 3]) -> float64 array."""
    return np.array(a[0] if len(a) == 1 else a, dtype=np.float64)


def unit(v):
    v = np.asarray(v, dtype=np.float64)
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def smoothstep(e0, e1, x):
    """0 below e0, 1 above e1, smooth in between (works with e0 > e1 too)."""
    if e0 == e1:
        return 1.0 if x >= e1 else 0.0
    t = clamp((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)


def rot(axis, ang):
    """3x3 rotation matrix about `axis` by `ang` radians (right-handed)."""
    a = unit(axis)
    c, s = math.cos(ang), math.sin(ang)
    x, y, z = a
    return np.array([
        [c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
        [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
        [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])


def perp(v, hint=(0, 0, 1)):
    """A unit vector perpendicular to v, as close to `hint` as possible."""
    v = unit(v)
    h = np.asarray(hint, dtype=np.float64)
    p = h - v * np.dot(h, v)
    if np.linalg.norm(p) < 1e-6:
        h = np.array([1.0, 0, 0]) if abs(v[0]) < 0.9 else np.array([0, 1.0, 0])
        p = h - v * np.dot(h, v)
    return unit(p)


# ---------------------------------------------------------------- colour
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear_to_srgb(c):
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def hex_srgb(h):
    """'#FFB020' -> (r, g, b) in 0..1, still sRGB."""
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(ch * 2 for ch in h)
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def hex_linear(h):
    """'#FFB020' -> linear (r, g, b), what glTF COLOR_0 stores."""
    return tuple(srgb_to_linear(c) for c in hex_srgb(h))


# ---------------------------------------------------------------- curves
class Curve:
    """Smooth interpolation through keys [(t, value), ...]; value is a number or a tuple.

    kind='pchip'  monotone cubic: never overshoots, flat at local extrema. Right for
                  radius / thickness profiles, where an overshoot reads as a lump.
    kind='cr'     Catmull-Rom (non-uniform): rounder, may overshoot. Right for centre lines.
    kind='linear'
    Outside the key range the curve is clamped to the end values.
    """

    def __init__(self, keys, kind='pchip'):
        keys = sorted(keys, key=lambda k: k[0])
        self.t = np.array([k[0] for k in keys], dtype=np.float64)
        self.v = np.array([np.atleast_1d(np.asarray(k[1], dtype=np.float64)) for k in keys])
        self.scalar = np.ndim(keys[0][1]) == 0
        self.kind = kind
        n = len(keys)
        self.d = np.zeros_like(self.v)
        if n > 1 and kind != 'linear':
            h = np.diff(self.t)
            delta = np.diff(self.v, axis=0) / h[:, None]
            if kind == 'pchip':
                for i in range(1, n - 1):
                    for c in range(self.v.shape[1]):
                        a, b = delta[i - 1, c], delta[i, c]
                        if a * b > 0:
                            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
                            self.d[i, c] = (w1 + w2) / (w1 / a + w2 / b)
                self.d[0] = delta[0]
                self.d[-1] = delta[-1]
            else:
                for i in range(1, n - 1):
                    self.d[i] = (self.v[i + 1] - self.v[i - 1]) / (self.t[i + 1] - self.t[i - 1])
                self.d[0] = delta[0]
                self.d[-1] = delta[-1]

    def __call__(self, t):
        t = float(t)
        n = len(self.t)
        if n == 1 or t <= self.t[0]:
            r = self.v[0]
        elif t >= self.t[-1]:
            r = self.v[-1]
        else:
            i = int(np.searchsorted(self.t, t, side='right') - 1)
            h = self.t[i + 1] - self.t[i]
            s = (t - self.t[i]) / h
            if self.kind == 'linear':
                r = self.v[i] + (self.v[i + 1] - self.v[i]) * s
            else:
                h00 = 2 * s ** 3 - 3 * s ** 2 + 1
                h10 = s ** 3 - 2 * s ** 2 + s
                h01 = -2 * s ** 3 + 3 * s ** 2
                h11 = s ** 3 - s ** 2
                r = h00 * self.v[i] + h10 * h * self.d[i] + h01 * self.v[i + 1] + h11 * h * self.d[i + 1]
        return float(r[0]) if self.scalar else r.copy()


def polyline_lengths(pts):
    pts = np.asarray(pts, dtype=np.float64)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    return np.concatenate([[0.0], np.cumsum(seg)])


def resample(pts, n, closed=False):
    """n points evenly spaced by arc length along a polyline (closed: n points, no repeat)."""
    pts = np.asarray(pts, dtype=np.float64)
    if closed:
        pts = np.vstack([pts, pts[:1]])
    L = polyline_lengths(pts)
    targets = np.linspace(0, L[-1], n + 1)[:-1] if closed else np.linspace(0, L[-1], n)
    out = np.zeros((len(targets), pts.shape[1]))
    for c in range(pts.shape[1]):
        out[:, c] = np.interp(targets, L, pts[:, c])
    return out


def smooth_closed(points, n, tension=0.5):
    """A closed Catmull-Rom curve through 2D/3D `points`, returned as n arc-length-even samples."""
    P = np.asarray(points, dtype=np.float64)
    m = len(P)
    dense = []
    for i in range(m):
        p0, p1, p2, p3 = P[(i - 1) % m], P[i], P[(i + 1) % m], P[(i + 2) % m]
        for k in range(24):
            s = k / 24.0
            a = 2 * s ** 3 - 3 * s ** 2 + 1
            b = s ** 3 - 2 * s ** 2 + s
            c = -2 * s ** 3 + 3 * s ** 2
            d = s ** 3 - s ** 2
            dense.append(a * p1 + b * tension * (p2 - p0) + c * p2 + d * tension * (p3 - p1))
    return resample(np.array(dense), n, closed=True)


def bezier(p0, p1, p2, p3, n=16):
    """n+1 points along a cubic bezier (any dimension)."""
    p0, p1, p2, p3 = (np.asarray(p, dtype=np.float64) for p in (p0, p1, p2, p3))
    out = []
    for k in range(n + 1):
        s = k / n
        out.append((1 - s) ** 3 * p0 + 3 * (1 - s) ** 2 * s * p1 + 3 * (1 - s) * s ** 2 * p2 + s ** 3 * p3)
    return np.array(out)
