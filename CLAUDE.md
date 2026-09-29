# Strum Jam

Read **HANDOFF.md** first. It covers the architecture, the note-recognition pipeline, the drummer, the
test harness, and the TODO list in priority order.

## Standing rules from Joshua
- Progress updates while working: **bare percentages only** (e.g. "35%"), nothing else. Be efficient.
- Lyrics: Joshua wants real lyrics and melodies in Vocals mode. They're fetched at runtime (LRCLIB) or pasted by the
  player, cached per device, never committed to the repo. Original characters only (never copy characters from existing games).
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

- `node test/onlineshot.js <outdir>`: Online mode end to end against a mocked Supabase with Chromium's fake mic (start a jam,
  record two guitar takes and a drums take on the pads, play them together, post). `node test/battleshot.js` reaches the local battle from the Online home.

- `node test/suggestshot.js`, `node test/battleshot.js`, `node test/curatedshot.js` (needs /tmp/career.json):
  song suggestions, a two-player battle end to end, ready-made careers + career share links.

- `node test/cardshot.js <outdir>`: the mode buttons at 9 screen sizes; flags anything cut off and a menu that scrolls.
- `node test/menushot.js <outdir>`: menu backdrop close-up, each mode button's hover effect, a click burst.

## Instruments
- The song screen's instrument row (`src/71-inst.js`) picks Guitar / Vocals / Bass / Piano / Drums (Practice is guitar only). Non-guitar Stage runs
  go through `Parts` (`src/62-parts.js`): G still runs the band, hype and fail state and hands each frame to Parts, which
  judges the part and draws its lane on the rail (`Stage.draw` asks `Parts.tallRail()` / `Parts.drawRail`).
- Vocals (`src/61-lyrics.js`): LRCLIB synced lyrics -> a time map to chart beats (fitted to the bars, or from the player's
  song file via `Analyze.run` alignment), melody = Basic Pitch top voice from that file, else the chord's notes as a guide.
  Voice pitch: McLeod on the small analyser. The singer on stage is Lulu (`drawSinger` in 50-render.js).
- Bass / Piano / Drums (`src/63-band.js`): bass line from chords + style shown as tab (Bo out front, no band bass), piano block
  chords with a keyboard diagram (Tofu, `drawKeys`), drums = the band's own groove on 3 lanes (the band's kit goes quiet via
  `Groove` `noKit`; the funk drummer plays the player's hits). Input: mic, audio-interface input (Mic check: input 1/2),
  Web MIDI (`src/41-midi.js`: keys, e-kits; MIDI keys/bass are voiced on `AudioEngine.playerBus`), keyboard F/J/K + pads for drums.
- Ear calibration (`src/72-calib.js`, "Train my ears"): per instrument, per mic. Guitar/Piano may lower the heard bars or raise
  the wrong-note bar (`Listen.cal`; an untrained or clean mic keeps the defaults), Bass/Vocals set the level gate, Drums learn
  kick/snare/hat so mic hits count for the right drum.
- `node test/bandshot.js <outdir>` (`QUICK=1` skips waiting for results): Bass, Piano, Drums with simulated playing, desktop + phone.
  `node test/calibshot.js <outdir>`: the calibration modal and what it learns from simulated readings.
- `node test/voxshot.js <outdir>`: Vocals end to end with a mocked LRCLIB, a synthetic song file (`test/mkvoxwav.js`) and a
  simulated voice; checks the lyric fit, the melody + time map from the file, pause/resume, results.

## Story intros
- `src/73-intro.js`: before the first Stage run of each Story song (per session; Settings toggle; "▶ Backstage" replays it),
  a backstage scene: the artist as a band-style bean (`drawStar`, look from a hash of the name + the era palette) says a few
  lines, typed out with a burbly made-up voice (`Intro.blip`). Lines come from Claude when a key / the claude.ai viewer is
  available (prompt: first person, real public history of that song and era, no lyrics), cached per song; otherwise a
  built-in script by career stage (debut, rise, peak, legacy) with the song, album and year.
- `node test/introshot.js <outdir>` (needs /tmp/career.json): the scene with a mocked Claude line and the built-in script,
  desktop + phone, and the real flow (Take the stage -> intro -> run).

## Online mode
`src/69-online.js` talks to Supabase over plain REST (project `mlkpttzklcdlupwldjii`, publishable key at the top of the file;
the schema is
`supabase/setup.sql`, already run). With the constants empty, the Online button offers the local battle instead.
Every instrument can record takes; drums (and MIDI keys/bass) record the game's player bus instead of the mic.

## Build
`python3 build.py [hosted_url]` writes `dist/index.html` (fragment) and `dist/strum-jam.html`
(full standalone page). `dist/` is gitignored.
