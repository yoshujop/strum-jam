"""sjart: the Strum Jam art toolkit. Code-authored stylised models, built with Blender as a
Python module (tools/setup-art.sh), exported as rigged glTF per art/ASSET_SPEC.md.

    from sjart import *        # in an art script, run with tools/art.sh
"""
from .util import vec, unit, lerp, clamp, smoothstep, rot, perp, Curve, hex_linear, hex_srgb, resample, smooth_closed, bezier
from .cage import Cage, Loft, ring2d, place, cc_comp
from .human import Human, HumanSpec

__version__ = '1.0'

try:  # everything below needs Blender
    import bpy as _bpy  # noqa: F401
    from . import bl, color, rig, outline, export, shapes, outfit
    from .character import Character
    from .bl import reset
    from .color import paint
    from .export import export_glb, export_fbx, validate, SpecError
except ImportError:  # pure-geometry use (tests, tooling) still works without bpy
    pass
