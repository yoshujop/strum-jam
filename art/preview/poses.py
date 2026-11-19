"""Deformation proof: pose a character in demanding poses (one per frame of an action) and export
it to a scratch .glb for art/preview/artshot.js (sheets `poses` and `closeups`).

    tools/art.sh art/preview/poses.py out.glb [module]      module: art/chars/<module>.py with build() (default mannequin)

Poses are authored the way the runtime does it: model-space rotations about each bone's rest head
(sjart.rig.Poser), so this also documents the pose convention.  Blender axes: +X = the character's
left, -Y = front, +Z = up.
"""
import importlib.util
import math
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from sjart import rig, export     # noqa: E402

X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
NAMES = ['rest', 'arms overhead', 'deep elbows', 'deep squat', 'fists', 'open hands', 'waist twist', 'head turn',
         'guitar hold', 'big jump', 'forearm twist', 'high kick']


def pose_all(ch):
    """Key every test pose on the character's rig; returns the pose names (frame i = pose i)."""
    h = ch.h
    U, V, D = (tuple(float(x) for x in v) for v in (h.U, h.V, h.D))
    nV = tuple(-x for x in V)
    A = math.radians(h.spec.apose)
    elbow = (-math.sin(A), 0, -math.cos(A))        # flexes the left forearm towards the front
    p = rig.Poser(ch.rig)

    def curl(amount, digits=('index', 'middle', 'pinky'), thumb=True):
        for d in digits:
            p.both(d + '1', nV, 82 * amount)
            p.both(d + '2', nV, 96 * amount)
        if thumb:
            p.both('thumb1', U, 42 * amount)
            p.both('thumb2', U, 30 * amount)
            p.both('thumb2', nV, 40 * amount)

    def twist(deg):
        p.both('twist_forearm', U, deg * 0.5)
        p.both('hand', U, deg)

    poses = []

    def pose(fn):
        p.reset()
        fn()
        p.apply()
        p.key(len(poses))
        poses.append(1)

    pose(lambda: None)

    def overhead():
        p.both('shoulder', Y, -16); p.both('upperarm', Y, -104); p.both('forearm', elbow, 14)
    pose(overhead)

    def elbows():
        p.both('upperarm', X, -42); p.both('forearm', elbow, 142); curl(0.35)
    pose(elbows)

    def squat():
        p.lift(dz=-0.36, dy=0.05); p.rot('hips', X, -14); p.rot('spine', X, -8)
        p.both('thigh', X, -108); p.both('thigh', Z, 14); p.both('shin', X, 128); p.both('foot', X, -6)
        p.both('upperarm', X, -70); p.both('forearm', elbow, 40)
    pose(squat)

    def fists():
        p.both('upperarm', X, -30); p.both('forearm', elbow, 95); curl(1.0)
    pose(fists)

    def open_hands():
        p.both('upperarm', Y, -40); p.both('upperarm', X, -20); p.both('forearm', elbow, 30); p.both('hand', nV, -55)
        p.both('index1', D, -16); p.both('pinky1', D, 18); p.both('thumb1', D, -26)
        for d in ('index', 'middle', 'pinky'):
            p.both(d + '1', nV, -12)
    pose(open_hands)

    def waist():
        p.rot('hips', Z, -14); p.rot('spine', Z, 30); p.rot('chest', Z, 30); p.rot('spine', X, -8); p.rot('chest', Y, 8)
        p.rot('upperarm_L', X, -50); p.rot('upperarm_R', X, 36); p.both('forearm', elbow, 40)
    pose(waist)

    def head():
        p.rot('neck', Z, 28); p.rot('head', Z, 44); p.rot('head', X, 14); p.rot('neck', Y, 8)
        p.both('shoulder', Y, -14)
    pose(head)

    def strum():
        # fretting hand (left) out along the neck, strumming hand (right) across the body
        p.rot('spine', Z, -8); p.rot('chest', Y, -5); p.rot('hips', Y, 4)
        p.rot('upperarm_L', X, -34); p.rot('upperarm_L', Y, -8); p.rot('forearm_L', elbow, 104)
        p.rot('hand_L', nV, 28); p.rot('hand_L', U, -50); p.rot('twist_forearm_L', U, -25)
        for d in ('index', 'middle', 'pinky'):
            p.rot(d + '1_L', nV, 62); p.rot(d + '2_L', nV, 70)
        p.rot('thumb1_L', U, 30)
        er = (elbow[0], -elbow[1], -elbow[2])
        vr = (V[0], -V[1], -V[2])
        p.rot('upperarm_R', X, -16); p.rot('upperarm_R', Y, 6); p.rot('forearm_R', er, 96)
        p.rot('hand_R', vr, -20)
        for d in ('index', 'middle', 'pinky'):
            p.rot(d + '1_R', vr, -38); p.rot(d + '2_R', vr, -46)
        p.rot('thigh_L', Y, 7); p.rot('thigh_R', Y, -7); p.rot('head', Z, 18); p.rot('head', X, 8)
    pose(strum)

    def jump():
        p.lift(dz=0.34); p.rot('hips', X, 10); p.rot('chest', X, 16); p.rot('head', X, 12)
        p.both('shoulder', Y, -20); p.both('upperarm', Y, -104); p.both('upperarm', X, 16); p.both('forearm', elbow, 34)
        p.rot('thigh_L', X, -94); p.rot('shin_L', X, 112); p.rot('thigh_R', X, 34); p.rot('shin_R', X, 84)
        p.rot('thigh_L', Y, 14); p.rot('thigh_R', Y, -8); p.both('foot', X, 34); p.both('toe', X, 20)
        curl(0.9, thumb=False); p.both('index1', nV, -74); p.both('index2', nV, -86)
    pose(jump)

    def tw():
        p.both('upperarm', X, -64); p.both('forearm', elbow, 26); twist(86)
    pose(tw)

    def kick():
        p.rot('hips', X, 12); p.rot('spine', X, -10)
        p.rot('thigh_L', X, -118); p.rot('shin_L', X, 10); p.rot('foot_L', X, 30)
        p.rot('thigh_R', X, 8); p.rot('upperarm_L', X, 40); p.rot('upperarm_R', X, -60); p.rot('upperarm_R', Y, 30)
        p.both('thigh', Y, 6)
    pose(kick)
    return NAMES[:len(poses)]


if __name__ == '__main__':
    out = sys.argv[1]
    mod = sys.argv[2] if len(sys.argv) > 2 else 'mannequin'
    path = mod if mod.endswith('.py') else os.path.join(HERE, '..', 'chars', mod + '.py')
    sp = importlib.util.spec_from_file_location('charmod', path)
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    ch = m.build()
    ch.build()
    names = pose_all(ch)
    export.export_glb(out, [ch.rig, ch.mesh], kind='test', animations=True, strict=False)
    print('poses: ' + ','.join(names))
