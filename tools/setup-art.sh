#!/bin/bash
# Create the Python environment the art pipeline runs in: Blender as a Python module (bpy).
#   tools/setup-art.sh [venv_dir]        default /opt/sj-bpy (or $SJ_BPY)
# Needs python 3.13 (the bpy 5.x wheels are built for it). Re-running is harmless.
set -e
VENV="${1:-${SJ_BPY:-/opt/sj-bpy}}"
PY="${PYTHON:-python3.13}"
command -v "$PY" >/dev/null 2>&1 || PY=python3
if [ ! -x "$VENV/bin/python" ]; then
  "$PY" -m venv "$VENV"
fi
"$VENV/bin/python" -m pip install --quiet --upgrade pip
"$VENV/bin/python" -m pip install --quiet "bpy>=5.0" numpy
"$VENV/bin/python" - <<'EOF'
import bpy, numpy
print('bpy', bpy.app.version_string, '| numpy', numpy.__version__, '| ok')
EOF
echo "art environment ready: $VENV  (run art scripts with tools/art.sh)"
