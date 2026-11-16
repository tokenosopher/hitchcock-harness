"""The previz kit: a film's grey Blender previz from its own config (previz/film.json or brief.md), rooms from plans, plain
grey mannequins, props, lights and cameras by shot. A scene script:
    import os, sys; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); from kit import *
(adjust the path to reach tools/previz/), then setup(...), room(...), figure(...), shot(...), run(...). Guide: tools/previz/README.md.
Outside Blender only kit.film is usable (storyboard.py, assemble_film.py)."""
try:
    import bpy  # noqa: F401
except ImportError:
    bpy = None
if bpy is not None:
    from .core import *
    from .lights import *
    from .rooms import *
    from .figures import *
    from .props import *
    from .cameras import *
    from .output import *
    from .shared import location
    from . import core as _core, lights as _lights, rooms as _rooms, figures as _figures, props as _props, cameras as _cameras
    from .film import Film
    for _m in (_lights, _rooms, _figures, _props, _cameras):
        if _m._reset not in _core.RESET: _core.RESET.append(_m._reset)
    from mathutils import Vector, Matrix, Euler
    import math
