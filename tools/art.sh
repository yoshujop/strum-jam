#!/bin/bash
# Run an art script with Blender-as-a-module (see tools/setup-art.sh).
#   tools/art.sh art/chars/mannequin.py [args]     one asset  -> vendor/models/<name>.glb + art/reports/<name>.json
#   tools/art.sh all                               every script in art/chars, art/props, art/venues
#   SJ_FBX=<dir> tools/art.sh ...                  also write <dir>/<name>.fbx (Roblox / other DCC import)
# The script fails (non-zero exit) when an asset violates art/ASSET_SPEC.md.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="${SJ_BPY:-/opt/sj-bpy}/bin/python"
if [ ! -x "$PY" ]; then echo "no bpy environment at $PY: run tools/setup-art.sh first" >&2; exit 1; fi
run() { "$PY" "$@" 2> >(grep -v -E "Draco|MeshOptimizer|^$" >&2) | grep -v -E "^$|^INFO:|Draco|MeshOptimizer"; return "${PIPESTATUS[0]}"; }
if [ "$1" = "all" ]; then
  for f in "$ROOT"/art/chars/*.py "$ROOT"/art/props/*.py "$ROOT"/art/venues/*.py; do
    [ -f "$f" ] || continue
    echo "== ${f#$ROOT/}"
    run "$f"
  done
else
  run "$@"
fi
