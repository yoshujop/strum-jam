#!/usr/bin/env bash
# Rebuilds vendor/three.bundle.min.js: three r187 + GLTFLoader + SkeletonUtils as ONE classic script that sets
# window.THREE (the game is a single HTML file, no ES modules over file://).
# Only needed when the three version (tools/package.json) or the addon list (tools/three-entry.js) changes;
# the bundle itself is committed, so building the game needs no node.
#   tools/build-three.sh
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules/three ] || [ ! -d node_modules/esbuild ]; then npm install --no-audit --no-fund; fi
VER=$(node -p "JSON.parse(require('fs').readFileSync('node_modules/three/package.json','utf8')).version")
node_modules/.bin/esbuild three-entry.js --bundle --minify --format=iife --target=es2020 --legal-comments=none \
  --banner:js="/* three.js r${VER#0.} (c) 2010-2026 three.js authors, MIT License (https://github.com/mrdoob/three.js), with GLTFLoader and SkeletonUtils. Built by tools/build-three.sh. */" \
  --outfile=../vendor/three.bundle.min.js
ls -l ../vendor/three.bundle.min.js
