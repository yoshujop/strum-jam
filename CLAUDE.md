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

## Shipping changes (the protocol, every time)
1. Work from a fresh clone of this repo (main). Never copy the old `strum-jam/` files from the claude.ai Project over it.
2. Build (`python3 build.py "https://claude.ai/artifact/VAQ8bke6yPhBQZJN1Ndx39"`) and check at in-game size, including
   Joshua's laptop (Chrome viewport 1280x665) and a phone (390x844).
3. Ask Joshua before publishing or committing anything.
4. Preview: publish `dist/index.html` to https://claude.ai/artifact/VAQ8bke6yPhBQZJN1Ndx39.
5. GitHub: always a **pull request from a `claude/<topic>` branch**, never a commit straight to main, so the history reads
   "Merge pull request #N from yoshujop/claude/<topic>". In Joshua's Chrome (Claude in Chrome, signed in):
   - open `https://github.com/yoshujop/strum-jam/upload/main/<folder>` (e.g. `src`), attach the changed files with the
     `file_upload` tool using their paths in the cloud workspace (e.g. `/home/claude/strumjam-repo/src/50-render.js`;
     paths on the laptop are refused), write the commit message, pick "Create a new branch for this commit and start a
     pull request", name it `claude/<topic>`, click "Propose changes";
   - files in other folders: `https://github.com/yoshujop/strum-jam/upload/claude/<topic>/<folder>`, commit to that branch;
   - on the "Open a pull request" page: a title saying what changed, a short description, then "Create pull request".
6. Send Joshua the pull request as a clickable link labelled with its number, e.g. [#16](https://github.com/yoshujop/strum-jam/pull/16).
   He merges it; "Deploy to Pages" rebuilds https://yoshujop.github.io/strum-jam/ in about a minute. Check it's live.
7. If GitHub shows him signed out, stop and tell him. Never type passwords or tokens.

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
- `node test/uishot.js <outdir>` (`SIZES=1280x665,...`, `NOSTAGE=1` for the menu only): menu + Stage at laptop, desktop and phone sizes.
  Joshua's laptop Chrome is 1280x665 (screen 1280x800 at 200%).
- `node test/ghostshot.js <outdir> [WxH] [lefty] [practice]`: the game overlay over time (lane cards, the next chord's ghost).
- `node test/iconshot.js <outdir>`: every scene of the Play & Learn and Online icons, blown up.
- `node test/menushot.js <outdir>`: menu backdrop close-up, each mode button's hover effect, a click burst.

## Game screen (2026-09-30)
- The venue canvas (`#stage`) fills the whole screen. The HUD (`#hud`: pause + song, the hype bar in the middle, the score)
  floats over its top; the guitar (`#board` > `.fb-card`) floats over its bottom with no frame round it. `Stage.lay()`
  measures the HUD's bottom and the board's top (every 10 frames) and puts the band's floor just above the board, the crowd
  in front of the stage with their bodies going down behind the guitar. The street stage floor is black (`streetSVG`).
- The guitar is one SVG (`Fretboard.render(ev, capo, lefty, next)`): an orange headstock with a cream plate showing the chord to
  play, the timing lane along the top of the neck, the neck. Wide screens: a tall plate beside the neck. Phones and upright
  tablets (`Fretboard.isNarrow()`): the plate sits in the lane's row, 4 frets. `metrics()` holds the geometry; `fretsToShow()`
  picks the most frets that fit the height budget (`avail()`), and render sets the svg's pixel size so the HTML laid over it
  (hear stamp, capo note, status sticker, skip) is placed in % of the viewBox.
- The lane's cards are drawn every frame on `#fb-lane`, a canvas laid over the lane (`Fretboard.drawLane`): the chord being
  played is in colour, the ones coming up are grey, they slide into the plate at the strike line, beat ticks + strum arrows
  along the bottom edge. `Stage.hitPt` (bursts) comes from there.
- The next chord's ghost (grey dashed dots, and "→ C" on the plate): `Fretboard.ghost(on)`. Stage: from about a beat and a half
  before the neck switches (G.updateStage); Practice: once half the chord's strings ring (Fretboard.feedback). The strings
  flash as a card reaches the strike line (`Fretboard.pulse`).
- Bass / Piano / Drums / Vocals keep their lane on the stage canvas, floating just above their panel.
- Menu icons (68-menubg.js `ModeIcons`): Play & Learn swings between guitar, vocals, bass, keys, drums; Online between battle,
  record, share (`swing()`, 2.6 s per scene, like Story's tour).
- The drummer wears a black suit (satin lapels, white pocket square), a white shirt with a black tie, gold chains with a
  medallion, gold hoops and ring, black rims on his pink shades.

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

## 3D engine (foundation for the 3D rebuild; the 2D game does not use it yet)
- Start with `docs/3D_PIPELINE.md` (art script -> glb -> engine -> rig / face, commands, budgets, iOS / Roblox) and
  `art/ASSET_SPEC.md` (the contract). `tools/art.sh all` rebuilds `vendor/models/*.glb` from `art/` (needs `tools/setup-art.sh`).
- `src/50-gfx.js` (`GFX`: renderer, tiers low/medium/high with auto-degrade, shadow map, floor mirror, bloom/grade/vignette),
  `src/50-gfx-toon.js` (`Toon`: the cel shader keyed by ASSET SPEC material names + inverted-hull ink outlines),
  `src/51-assets.js` (`Assets`: embedded `vendor/models/*.glb` -> templates -> `spawn()` instances with bones, face canvas),
  `src/53-stagekit.js` (`StageKit`: light rigs, spots + cones, floor, backdrop, blob shadows), `src/54-vfx.js` (`VFX`).
  Each file starts with its API and a usage example. Nothing runs at load; `GFX.init(canvas)` starts it.
- `vendor/three.bundle.min.js` = three r187 + GLTFLoader + SkeletonUtils as one classic script (`tools/build-three.sh`,
  only when the three version or `tools/three-entry.js` changes). `build.py` embeds it and every `vendor/models/*.glb`.
- `node test/modelshot.js <name-or-path.glb> <outdir>`: any model through the real engine (turntable sheet, close-ups,
  in-game size on a lit stage at 1280x665 and 390x844, spec warnings). `node test/gfxdemo.js [outdir]`: writes
  `dist/gfxdemo.html` (band, crowd, lights, VFX) and screenshots it per tier. Both are slow (software GL): give them minutes.
- Character animation: `src/53-rig.js` (`Rig`: plain-data poses as model-space deltas, layers + masks, pose-to-pose keys
  on the music clock in BEATS with snap / hit easing, anticipation, overshoot, follow-through and `lead`, two-bone IK with
  poles, foot plants, look-at, aim, hand presets, `spr_*` spring chains, squash & stretch, smears + `Rig.Trails` ribbons,
  `Rig.channel` for single numbers) and `src/54-face.js` (`FaceDecal`: face spec + expression parameters drawn in ink on
  the `sj_face` canvas, presets, blinks, 2-frame expression changes, stepped pupils; redraws only on change).
  `node test/rigshot.js <outdir> [faces,sheet,stage,poses,perf]`: expression sheets, a 24-frame contact sheet of the
  demo band (`test/rigdemo.js`, 120 bpm), in-game size stage shots, the pose library, cost + stability; writes `dist/rigdemo.html`.
- The cast: `src/55-cast.js` (`Cast.riff`: model, guitar, face spec + 10 named expressions, the guitar hold, the poses
  lean / lean_dip / kickstand, the hair's hype meter; `Cast.spawn('riff')` -> an actor with `pose()`, `strum()`, `express()`,
  `hype()`, `update(beat, dt)`; expression `rock` = the Kickstand's lazy open grin; `linePx` = the hero's thicker ink). Riff = `art/chars/riff.py` + his guitar `art/props/offcut.py`: a lanky 6-head frontman
  (1.67 m to the crown, 1.88 with the quiff; `HumanSpec.posture` gives him the slouch), hair = big swept chunks
  (`wardrobe.lock`, listed in `LOCKS`), up to 18k triangles. Outfit pieces (bomber, `slacks`, `chunky` high-tops, strap,
  patches) are in `art/sjart/wardrobe.py`. `node test/castshot.js <outdir> [faces,turn,hair,heads,hold,poses,sil,stage]`
  renders him through the engine (`MODELS=a.glb,b.glb` for scratch builds; the stage shots frame him as the hero,
  `FRAME=wide` for the old band distance).
- Test models: `/opt/sj-bpy/bin/python test/fixtures/mk_fixtures.py` -> `test/fixtures/models/*.glb` (not shipped).

## Hearing (mic recognition, 2026-11)
- `src/42-hearcore.js` (`HearCore`: onset detector, resampler, tuning estimate, sample-exact ring; plain maths, no DOM, also runs
  under Node and is pasted into the worklet and the model worker), `src/43-capture.js` (`Capture`: AudioWorklet from an inline
  Blob / data: module, ScriptProcessor fallback; counts every sample frame), `src/44-hear.js` (`Hear`: the API gameplay calls).
  The file headers list the API. Two speeds: `Hear.onOnset(cb)` fires a few tens of ms after a strum / hit (timing, feel);
  `Hear.chordVerdict` / `Hear.spanVerdict` / `Hear.timed` say which notes it was once the note model has heard it.
- The mic's audio goes worklet -> model worker over a MessagePort (resampling + Basic Pitch + tuning in the worker); the page's
  main thread is not in that path. `Listen.freshness` asks the model's own onsets (the old spectrum test is `freshnessDsp`).
- Keep `Listen.judge`'s thresholds as they are (measured); `Mic.onsetListeners` / `Listen.strumListeners` still work.
- Tests: `node test/hear/core.js` (Node only, 1 min), `bash test/hear/suite.sh <outdir> [quick]` (the live suite in the built game:
  dropped audio, onset latency, Practice / Stage right + wrong chords, D-DU-UDU at 80-140 bpm, piano, drums, bass, a flat guitar;
  `HEAR_PAGE=old.html` runs it against another build), `node test/hear/offline.js quick` (26-chord accept / reject matrix, 4 min).
