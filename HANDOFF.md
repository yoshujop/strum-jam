# Strum Jam — handoff notes

Single-file browser game that teaches guitar chords by listening through the mic. A band on a stage:
Pip (a guitar-pick character), a funk drummer, Bo the bassist (joins at hype level 2), and a crowd of beans.
Practice mode and Stage mode, song search charted by Claude (API key stays in localStorage and is only
ever sent to api.anthropic.com).

## Standing rules from Joshua
- Progress updates while working: **bare percentages only** (e.g. "35%"), nothing else. Be efficient.
- No song lyrics anywhere. Original characters only (never copy characters from existing games).
- Keep the thick-ink cartoon look (Rhythm Heaven Groove / WarioWare: Move It! style — one continuous
  ink silhouette per character, flat colours + one shadow tone, pose-to-pose motion, smears).
- He judges results at in-game size; always check renders at real stage/menu size before shipping.

## Where things live
- Live preview artifact: https://claude.ai/artifact/VAQ8bke6yPhBQZJN1Ndx39 (publish `dist/index.html`
  to that URL; a new chat must first read it with the Artifact tool, then publish with `url`).
- Phone site: https://yoshujop.github.io/strum-jam/ (GitHub repo yoshujop/strum-jam, branch main,
  file index.html). Deploy flow: copy build to `C:\Users\joshu\Downloads\strum-jam-site\index.html`,
  open https://github.com/yoshujop/strum-jam/upload/main in the built-in browser, Joshua clicks
  "choose your files", picks that index.html and says "done", then Claude clicks "Commit changes".
  **The last several builds were saved to that folder but NOT uploaded yet — the phone site is stale.**
- Source: this zip (`src/`, `vendor/`, `build.py`, `test/*.js`, `ref/`).

## Build
`python3 build.py "https://claude.ai/artifact/VAQ8bke6yPhBQZJN1Ndx39"` →
`dist/index.html` (fragment for the artifact) and `dist/strum-jam.html` (full standalone page, ~3.46 MB).
build.py concatenates, in order: 05-settings, 10-theory, 20-songs, 30-audio, 35-music, 36-sfx, 40-mic,
45-ear, 46-listen, 50-render, 52-drummer, 60-game, 70-ui, and embeds LISTEN_ASSETS from `vendor/`
(TF.js core/cpu/converter/wasm scripts, wasm + wasm-simd binaries, Spotify Basic Pitch model + weights,
Apache-2.0 credit comment).

## Note recognition (working well now — don't regress)
- Spotify Basic Pitch via TF.js WASM in a Blob Web Worker (46-listen.js). Fixed input 43844 samples @22050 Hz.
- Model decides which notes; DSP freshness (45-ear.js `Ear.fresh`) confirms they're new at the strum;
  strums come from model onset peaks with an adaptive baseline; guitar range MIDI 38–88; octave-ghost
  handling via unique vs duplicated pitch-class thresholds.
- Leak-safe drums when mic on without headphones (pitchless kick/snare, clicks above guitar range).
- Regression tests (need real guitar samples from /home/claude/real/mkreal.js which is NOT in the zip):
  test/stagetest.js right|wrongchord|speech|claps, t5.js, realtest.js, bgtest.js, leak.js.
  Last results: practice right 10/10, nylon 10/10, wrong chord 0 advance, stage right 10/11, noise 0 hits.

## The drummer (src/52-drummer.js — `FunkDrummer`, canvas-drawn)
Replaced the old SVG puppet (src/drummer.svg is no longer used). Drawn on the stage canvas by
`Stage.drawDrummer` in 50-render.js (after the crowd), and on the menu canvas in 70-ui.js TitleArt.draw.
- Design box 500×650, floor at y=522. Identity: big afro + gold headband with pink star, pink shades,
  bulb nose, handlebar mustache, gold grill, purple starred jacket with gold trim, dark twinkly shirt,
  gold chains + star medallion, purple bell-bottoms, yellow platform shoes, red star bass drum.
  Fur collar and the black shirt collar were removed at Joshua's request. Shades are now ONE continuous
  lens (two rounds + a bridge, single gold rim) — he asked for that.
- Kit (crowd's view): snare centre-left + hi-hat centre-right just above the kick, floor tom + ride on
  the left, crash up right. Hand A (left of picture): snare, floor tom. Hand B: hi-hat, crash, and the
  crossed snare hit in fills. Count-in: sticks click to the side.
- Arms = upper-arm and forearm capsules with a real elbow (explicit elbow offsets per pose in `HIT`),
  outline-then-fill union trick so shoulders grow out of the jacket seamlessly; contour lines where
  sleeves cross the jacket. Joshua rejected the earlier curved "rubber hose" arms as wonky.
- Motion: `Groove.plan(k)` / `Groove.events(now)` in 30-audio.js predict upcoming hits so he winds up
  early. Stroke = contact hold → rebound → drift → wind-up → strike (elbow leads, hand, stick whips last),
  smears + swoosh on fast parts, impact lines, drum squash, crash wobble + star, afro/chain springs,
  kick foot + hat foot. Sync test: `node test/drumsync.js` (0–20 ms at 60 fps; outliers are headless frame drops).
- Faces (`chooseFace`): per hype level + bar slot (smirk, grin, pucker/whistle, oh, yell, grit, laugh),
  peeks over the shades, shades flip up on the headband at level 4, level-up laugh, miss wince,
  fill concentration then a release face when the fill lands, busy vs sparse patterns.
  Shades on a spring: bounce on kick/snare, creep down over 2 bars, pop off on big crashes.
- Debug hook: `st.forceFace = {mouth, shades, eyes, browAng, browUp}` forces a face (used by tests).

## TODO next (in this order)
1. **Remove the stick-out-tongue faces completely** ('tongue' and 'bite' mouths). Joshua: "terrible and
   looks completely off from all other animations". Replace: fill concentration → 'grit' (clenched gold
   grill) + fierce brows + eyes following the sticks; level-3 slot-3 tongue → 'yell'; level-4 slot-1
   tongue → 'laugh'. Delete `tongueOut`, `M.tongue`, `M.bite`.
2. **Menu art** (TitleArt.draw in 70-ui.js + `drawVinyl` in 50-render.js): the vinyl must be a true
   **circle** (currently an ellipse rx=W*0.44, ry=H*0.42), spinning at 33⅓ rpm, and design a **new band
   backdrop** on the menu to go with it (Joshua chose "Menu: redo the art" — not the in-game stage).
   Ideas: circle record centred behind the band, slow-turning retro sunburst rays, speaker stacks at the
   sides pulsing on the beat, stage lip with chase-light bulbs, crowd in front. Watch contrast: the dark
   afro on a dark record. Also update the crowd clip (it still uses the old ellipse).
3. Redesign Pip, Bo and the crowd to the same standard as the drummer (Joshua said the characters are
   "too stick figure like and amateur" and started with the drummer).
4. Older backlog: song charting ≥95% accurate with a confirm step for uncertain charts; calmer home screen.

## Test harness bits
- `test/drumshot.js` (stage screenshots at levels 1 and 4), `test/drumsync.js`.
- `ref/sheet.js`: renders drummer frames (node sheet.js out.png level t0 dt n cols [missAgo];
  env CW=frame width, FACE='{"mouth":"grin"}', CLICK=1 for count-in). `ref/faceshot.js`: in-game face crops.
- Playwright via NODE_PATH=<global node_modules>; Chromium preinstalled in the cloud container.
- Reference art: `ref/funk_drummer/` (Joshua's original drummer SVG + pose sheet).
