#!/bin/bash
# Render an asset the way the game will (cel shading, ink hull, face decal) into a contact sheet.
#   tools/artshot.sh <model.glb> <out.png> [turn|hands|game|poses|closeups|prop|one] [key=value ...]
# See art/preview/artshot.js for the sheets and options. Uses vendor/three.bundle.min.js when the
# runtime has built it; otherwise builds a private three.js bundle once into $SJ_ART_CACHE
# (default ~/.cache/sj-art; needs npm + network the first time).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
if [ -z "$SJ_THREE_BUNDLE" ] && [ ! -f "$ROOT/vendor/three.bundle.min.js" ]; then
  C="${SJ_ART_CACHE:-$HOME/.cache/sj-art}"
  if [ ! -f "$C/three.bundle.js" ]; then
    mkdir -p "$C"
    ( cd "$C"
      [ -f package.json ] || npm init -y >/dev/null
      npm install --silent three@0.187 esbuild >/dev/null
      cat > entry.js <<'EOF'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
window.THREE = Object.assign({}, THREE, { GLTFLoader });
EOF
      npx esbuild entry.js --bundle --minify --format=iife --outfile=three.bundle.js >/dev/null 2>&1 )
  fi
  export SJ_THREE_BUNDLE="$C/three.bundle.js"
fi
node "$ROOT/art/preview/artshot.js" "$@" 2>&1 | grep -v "GPU stall"
