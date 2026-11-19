// Bundle entry for vendor/three.bundle.min.js (built by tools/build-three.sh).
// The game is one HTML file of classic scripts, so three.js is bundled to a single IIFE that sets window.THREE:
// the whole core (so later modules can use any three class) plus the few addons the engine needs.
// Post-processing, toon materials, outlines and particles are the engine's own (src/50-gfx*.js), not three addons.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
window.THREE = Object.assign({}, THREE, { GLTFLoader, SkeletonUtils });
