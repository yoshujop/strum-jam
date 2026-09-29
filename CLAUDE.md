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
- `vendor/`: TF.js + Spotify Basic Pitch model, plus the chord data read by `25-lookup.js`/`26-chart.js`
  (`chord-index.bin`: Chordonomicon title index; `hooktheory.json.gz`) and the fonts (`fonts/`: Bagel Fat One +
  Baloo 2, SIL OFL; the logo's DejaVu Sans subset), all embedded into the build.
- `test/`, `ref/`: Playwright/Node test and render scripts (see HANDOFF.md "Test harness bits").
- `.github/workflows/pages.yml` builds `src/` on every push to `main` and publishes `dist/strum-jam.html` as the
  site (https://yoshujop.github.io/strum-jam/). The root `index.html` is the old hand-uploaded build, kept for reference.
  `src/` was recovered from it (Story mode, the chart pipeline); at that commit it rebuilt it byte-for-byte
  with `python3 build.py "https://claude.ai/artifact/VAQ8bke6yPhBQZJN1Ndx39"`. The source zip was older
  than the live build; HANDOFF.md predates Story mode and the chart pipeline.

## Tests
- `node test/storytest.js`: Story mode's discography lookup and era/song checks, with mocked services.
- `OUT=/tmp/career.json node test/storytest.js && python3 build.py && node test/storyshot.js <outdir>`: career
  screen and swap sheet screenshots at desktop and phone size (Playwright; `NODE_PATH=$(npm root -g)`).

- `node test/customshot.js <outdir>`: Build it yourself + the song picker, services stubbed (needs /tmp/career.json).
- `node test/failshot.js <outdir>`: a Stage run going wrong, up to BOOED OFF.
- `node test/drumsheet.js out.png <level>`: drummer frames of the real in-game groove; `node test/drumgame.js`
  checks his clock is smooth in a real run.

- `node test/suggestshot.js`, `node test/battleshot.js`, `node test/curatedshot.js` (needs /tmp/career.json):
  song suggestions, a two-player battle end to end, ready-made careers + career share links.

- `node test/cardshot.js <outdir>`: the mode buttons at 9 screen sizes; flags anything cut off and a menu that scrolls.
- `node test/menushot.js <outdir>`: menu backdrop close-up, each mode button's hover effect, a click burst.

## Build
`python3 build.py [hosted_url]` writes `dist/index.html` (fragment) and `dist/strum-jam.html`
(full standalone page). `dist/` is gitignored.
