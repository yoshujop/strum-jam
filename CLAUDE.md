# Strum Jam

Read **HANDOFF.md** first. It covers the architecture, the note-recognition pipeline, the drummer, the
test harness, and the TODO list in priority order.

## Standing rules from Joshua
- Progress updates while working: **bare percentages only** (e.g. "35%"), nothing else. Be efficient.
- No song lyrics anywhere. Original characters only (never copy characters from existing games).
- Keep the thick-ink cartoon look (Rhythm Heaven Groove / WarioWare: Move It! style: one continuous
  ink silhouette per character, flat colours + one shadow tone, pose-to-pose motion, smears).
- He judges results at in-game size, so always check renders at real stage/menu size before shipping.
- Note recognition works well now. Don't regress it (see HANDOFF.md).

## Layout
- `src/`: game source, concatenated by `build.py` in a fixed order (`01-head.html` + numbered JS files).
  `src/drummer.svg` is no longer used.
- `vendor/`: TF.js + Spotify Basic Pitch model, embedded into the build.
- `test/`, `ref/`: Playwright/Node test and render scripts (see HANDOFF.md "Test harness bits").
- `index.html` at the root is what GitHub Pages serves (https://yoshujop.github.io/strum-jam/).

## Build
`python3 build.py [hosted_url]` writes `dist/index.html` (fragment) and `dist/strum-jam.html`
(full standalone page). `dist/` is gitignored.
