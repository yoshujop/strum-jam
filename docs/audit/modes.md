# Audit: modes

## Verdict
Every mode other than Play & Learn is a thin wrapper around the same Stage run on a chord chart; none adds a mechanic, a character, a reward or teaching. Story is a server-dependent playlist generator: three eras of three songs, with fixed Easy/Medium/Hard rules by era index, a letter-grade gate, and a 170-character template monologue from a hash-coloured bean. It has no unlocks, no venue or band progression and no fail stakes, it is guitar-only, and it cannot be started without network (iTunes, MusicBrainz, Hugging Face) even for the seven "ready-made" careers. With no microphone the game silently falls into tap mode and Story progress still counts: tapping Space in time cleared a Story song with an A and 2 stars, and Practice "completed" 10 chords in 3.9 s with LEGENDARY hype. Battle is hot-seat score comparison on 17 public-domain or drill songs; an idle player sits through a 60 s song and gets "D – Keep Jamming". Setlist challenge is a self-assigned checklist with no reward. Online is asynchronous take-layering on Supabase with client-reported scores, no auth, no moderation, and a leaderboard ranked by the sum of take scores, so more takes always wins. All seven existing mode tests pass, but they mock every service and inject scores via G.finish(), so they prove screens render, not that modes work. From this sandbox iTunes, MusicBrainz, LRCLIB and Supabase all returned proxy 403, so their live state is unverified; in headless Chromium every online path dead-ended within about 1 s with a generic message. Recommendation: replace artist-career Story with an original-band campaign built on a chord and technique skill graph, demote the artist career to an optional tour generator, fold Battle and Challenge into the campaign and a daily gig, and cut the Online jam down to seeded score boards until there is an auth and moderation story.

## How it works
All modes funnel into `UI.startGame(mode)` (src/70-ui.js:506-529), then `G.start(chart, mode, opts)` (src/60-game.js:24), then `G.finish()` (60-game.js:563), then `UI.showResults`. There each mode's `record(r)` hook is called in turn (70-ui.js:615-621): `Story.record`, `Online.record`, `Battle.record`, `Challenge.record`.

**Story (src/65-story.js)**
- `Story.build` (379-440):
  1. `Lookup.discography` fetches MusicBrainz and iTunes.
  2. The plan comes from Claude (`careerPrompt`, 50-74) or from `CURATED` (src/64-curated.js, 7 real artists) via `curatedPlan` (102).
  3. `Career.verify` (252-295) probes every song against Chordonomicon rows on datasets-server.huggingface.co, then Hooktheory, then up to 3 web lookups (`Story.probe`, 443-460).
  4. It keeps 3 picks plus 3 alternates per era, sorted by `Career.stats().score` (206-225).
- The career is stored in localStorage `strumjam.careers`, at most 12 (307).
- Progress is `{grade, score, tap}` per slot. `passed` means grade >= the tier's pass grade (314). Stars are 1 for a pass, 2 for A, 3 for S (315). `levelOpen` means the previous level is fully passed (317).
- `STORY_TIERS` (15-19) are fixed by era index: Easy (85% tempo, relaxed check, pass C), Medium (pass B), Hard (real shapes, pass A).
- `playSong` (755-793) builds the chart lazily on first play via `Chart.make`, which needs network again.
- `songStrip` (798-825) is the "gig" screen. `record` and `resultsHtml` (827-849) show text banners only.
- Story Stage runs are forced to guitar (70-ui.js:522).
- Extras: Swap and Pick (565-640), Build-it-yourself (655-754), career share codes `SJC1.` as gzip+base64 (107-140).

**Intro (src/73-intro.js)**
- `Intro.words` (32-52) returns a Claude monologue if a key or the viewer is available, otherwise one of 8 template strings chosen by career stage (17-31).
- Text is typed at 32 ms per character with oscillator blips (55-65, 117-122).
- `drawStar` (141-194) draws a bean whose skin, hair and coat come from an FNV hash of the artist name (68-73).
- Shown once per song per session (`seen` Set, 12-14).

**Battle (src/66-battle.js)**
- 2 to 4 names, one song from `pool()` (LIBRARY plus the player's saved songs, 13).
- Sequential Stage runs with `UI.battleOpts` (60). `record` (64-73) stores the score and the highest wins.
- Only reachable through Online, then "Battle on this device" (69-online.js:64).

**Challenge (src/67-challenge.js)**
- Pick 3 to 5 songs and a required grade; stored in localStorage `challenge`.
- `record` (46-55) ticks songs off.
- Rendered inside the Play & Learn list (70-ui.js:157).

**Online (src/69-online.js)**
- Plain REST to Supabase (`Sb`, 22-37) using the publishable key (13).
- Tables are jams, takes and performances, plus a public `takes` audio bucket (supabase/setup.sql). RLS allows select and insert for anyone, with check (true) (setup.sql:44-52, 58-61).
- Flow: `newJam` (86) inserts a jam carrying the song code. `recordPrompt` (151) starts a Stage run with MediaRecorder on the mic or the player bus (171-188). `record` (195-213) uploads the audio and inserts a take with the client's score, grade and offset_ms. `playTogether` (221-235) decodes all takes and aligns them by offset_ms. `post` (241-249) inserts a performance with total_score = sum of the chosen takes.

**Practice (src/60-game.js)**
- 40-56: consecutive duplicate chords are collapsed and the band loops.
- `practiceListen` and `practiceFrame` (219-280) wait until the chord is heard. `practiceHint` (322-341) gives per-string text advice.
- Results (567-575) show average time per chord and the 3 slowest changes.
- With no mic, `tapMode = !Mic.on` (27) and Space or a tap calls `practiceSuccess` (493-497).

**Network dependencies**
- itunes.apple.com, musicbrainz.org, datasets-server.huggingface.co, labs.api.listenbrainz.org, open.spotify.com (src/25-lookup.js:18 and following), lrclib.net, api.anthropic.com, and the Supabase project.
- `SHARED_URL` is empty (70-ui.js:5), so Claude features need the player's own API key outside the claude.ai viewer.

## Problems

### [critical] Story cannot be started or continued without network, including the seven ready-made careers
- Where: src/65-story.js:379-440 (build), 443-460 (probe), 755-793 (playSong); src/64-curated.js:1-9; src/25-lookup.js:18
- Evidence: Fresh profile, headless Chromium with no network. Clicking the Oasis ready-made card gave "Couldn't reach the music databases. Check your internet connection and try again." in 1.1 s (failed request: itunes.apple.com/search). "Build it yourself" gave the same message. Typing an artist with no key does nothing except play a fail sound; the status line stays empty. With a saved career, pressing Play on a song failed in 2.6 s, because the chart is built lazily on first play. CURATED holds only names and hints: albums, tracks and chords are all fetched at build time. Screenshots: play/ph-story-curated-fail.png, play/lap-career-playfail.png. From this sandbox itunes, musicbrainz, lrclib and supabase all returned proxy 403, so their live availability is unverified.
- Fix: Ship campaign content in the build: charts embedded as data, no runtime lookups for the core campaign. Keep artist careers as an optional online "tour generator" that pre-fetches and stores every chart at build time, so a saved career is fully offline afterwards.

### [major] Offline or network failure is reported as "not in the chord dataset, add your API key"
- Where: src/26-chart.js:36, 53; src/70-ui.js:261-263
- Evidence: In the saved-career run above, the error shown was "This song isn't in the chord dataset. Add your Anthropic API key in Settings so Claude can read chord sources on the web for it, or paste a chord sheet. Tap to retry." although the cause was a failed fetch. Chart.make catches the findRows error into `{rows: [], error}` and then throws `not_in_dataset`. Caveat: the test career's tracks are mock IDs, but the code path is the same for any network error.
- Fix: Propagate TypeError and network errors from findRows separately (code `offline`), and show a retry message instead of asking for an API key.

### [critical] Story progress, stars and unlocks can be earned in tap mode with no instrument
- Where: src/60-game.js:27, 457, 467; src/65-story.js:314-315, 833-834
- Evidence: With no mic, the Story Stage run starts with `tap=true mic=false tempo=85 strict=relaxed`. Feeding on-time taps (the same call the Space key makes) gave grade A, `Story.passed = true`, 2 stars, and the banner "Passed … 2 more in The College Dropout to unlock the next level". `progress` stores `tap: true` but `passed` and `stars` ignore it. A is also the pass grade for Hard, so the whole career can be "mastered" on the spacebar. Blind mashing (Space every 110 ms) gets D at 44%, so timing does matter, but no note is ever checked (`frac = 1` in tap mode). Screenshot: play/lap-story-results.png. Battle likewise accepts tap runs silently.
- Fix: Make tap mode an explicit "no instrument / rhythm only" assist. Its runs should be capped at a bronze medal or excluded from campaign and battle clears. Show a mic-required gate before a counted run.

### [major] Practice with no mic is a Space-bar clicker that reports success
- Where: src/60-game.js:493-497 (tap success), 40-56 (list), 567-575 (results, nothing persisted)
- Evidence: Chord Drill G, C, D in Practice with no mic: 10 chords "played" by pressing Space 10 times in 3.9 s. Results: "YES! Practice complete", average 0.3 s per chord, best streak 10, Top hype LEGENDARY. Even with a mic, Practice has no curriculum: it replays the song's chord list once, the result is not stored anywhere, and the "slowest changes" do not feed any later session. Screenshot: play/lap-practice-results.png.
- Fix: Replace with a lesson engine that keeps per-chord and per-transition mastery (Leitner or SM-2 boxes) updated from mic-verified time-to-clean-chord. Tap-through should be labelled "look only" and earn nothing. See overhaul ideas.

### [major] Story has no game structure: difficulty is the era index, rewards are text
- Where: src/65-story.js:15-19, 314-323, 472-530, 838-849; src/70-ui.js:519-522
- Evidence: STORY_TIERS is three fixed rows keyed by era position, so an artist's first album is always Easy and their late work always Hard, whatever the songs are. Songs are only sorted easy-to-hard inside an era. Each era has exactly 3 songs, so a whole career is at most 9 Stage runs. The rewards are a star string and a banner (resultsHtml); nothing is unlocked beyond the next list section. The career screen is 3209 px tall at 1280x665 and 3762 px at 390x844, for 9 nodes. There is no fail consequence (retry at once), no setlist, no boss, no gear, and no other instruments (forced guitar). The Hard tier switches from easy shapes to real shapes with no lesson in between.
- Fix: Drive difficulty from a chord and technique skill graph, not era index. Use setlist gigs (2 to 4 songs or sections with a shared crowd meter), medals with thresholds, persistent unlocks, and a short lesson before any new chord or technique.

### [major] The Story "narrative" is 8 template strings spoken by a hash-coloured bean
- Where: src/73-intro.js:17-31, 38-43, 68-73, 12-14
- Evidence: Without a key, the monologue is one of 2 strings per career stage with the title, album and year substituted. Measured: 169 characters typed in about 6.8 s. It is the same for every artist, e.g. "First real stage. For years it was cramped rooms and people who didn't listen...". With a key, Claude writes first-person speech for a real, named artist, which is a likeness and defamation risk and sits badly with the "original characters only" rule. The character has no relation to the band on stage, never reappears, and does not react to the result. It is shown before every song's first run each session.
- Fix: Cut real-artist monologues. Write an original cast (the player's band, a manager, rivals) with authored before/after beats per gig, reacting to the medal earned. Keep the typewriter-and-blip presenter as the dialogue system.

### [major] Battle is hot-seat score comparison with no battle mechanics, on 17 non-famous songs
- Where: src/66-battle.js:13, 56-62, 64-73; src/69-online.js:62-64; test/battleshot.js:17-18
- Evidence: The pool is LIBRARY plus saved songs: 17 on a fresh install, default "Down in the Valley". Players alternate full runs; a full song is 56 s of chord events plus count-in each. An idle player was not booed off: after about 61 s the results showed grade "D – Keep Jamming" and "Player 1: 0". Instrument is fixed to guitar (battleOpts.inst), with no per-player handicap or tempo and no head-to-head. Battle is hidden under the Online button, then a small footer button. The existing test injects scores via G.finish() and never plays.
- Fix: Rebuild as a short-round party mode: 8-bar call-and-response rounds, alternating every phrase, per-player difficulty and instrument, best-of-3, a sudden-death chord-change race. Give it its own entry in the menu.

### [major] Online leaderboard is forgeable and structurally meaningless; public anonymous audio upload
- Where: supabase/setup.sql:44-61; src/69-online.js:195-213, 241-249, 234, 243
- Evidence: RLS allows any anonymous insert into jams, takes and performances with check (true), and anonymous upload to a public bucket (15 MB audio). score, grade and accuracy are client-reported. A performance's total_score is the sum of the chosen takes (up to 8), so more takes ranks higher, and it is not checked against the takes or the jam. There are no accounts, no delete, no report and no rate limit, so it is an open file host for arbitrary audio with player-typed names. `post()` uses window.prompt and playback failure uses alert(). Offline, the feed, join and create each show "Couldn't reach the online service" within about 1 s. The test runs against a mocked Supabase; the live project was unreachable from here (proxy 403), so its current contents are unknown.
- Fix: Either cut it, or put an edge function in front that validates score against chart maximum, ranks per song and per instrument by accuracy rather than a sum, adds auth (anonymous sign-in with device ID at minimum), rate limits, an audio duration cap, and report/remove.

### [minor] Take alignment in Online ignores input and output latency
- Where: src/69-online.js:185-187, 228-231
- Evidence: offset_ms is Groove startTime minus the AudioEngine.now() taken when the recorder starts; MediaRecorder start latency and each device's mic/output latency are not compensated. The mocked test recorded offsets of 1890, 1974 and 2000 ms for identical runs, an 84 to 110 ms spread on one machine. Across real devices, especially Bluetooth, layered takes will flam. This is a suspicion from the code and that spread; it was not measured on real hardware.
- Fix: Record a click or count-in marker into the take and align by onset detection, or store the calibrated latency per device and subtract it.

### [minor] Setlist challenge is a self-assigned checklist with no reward or time pressure
- Where: src/67-challenge.js:8-11, 26, 46-55
- Evidence: The player picks their own 3 to 5 songs and their own pass grade. Winning shows "Challenge won!" and confetti; nothing is unlocked. It lives as a card inside the Play & Learn list. Songs can be cleared one at a time across sessions, so it is not a setlist performance. Tap-mode runs count.
- Fix: Cut it as a mode. Its idea becomes the campaign gig format (a setlist played back-to-back with a carried crowd meter) and the Daily Gig.

### [minor] Mode tests give false confidence
- Where: test/battleshot.js:17-18; test/storyshot.js:12; test/introshot.js:18-20
- Evidence: All seven mode scripts exit 0 with "no page errors", but storyshot injects a career into localStorage, battleshot sets G.score and calls G.finish(), onlineshot mocks Supabase, introshot mocks Claude, and storytest mocks every service. None plays a run with audio or hits a real endpoint. Logs are in the scratch dir (*.log).
- Fix: Add offline-first smoke tests that run the real flows with network blocked, plus one audio-driven run per mode using a synthesized guitar WAV on Chromium's fake mic.

## Keep
- Career.stats difficulty scoring (distinct chords, shape difficulty with best capo, barre share, changes per bar, tempo) at src/65-story.js:206-225. It is the right basis for auto-grading any chart and placing songs on a skill graph.
- The plan-then-verify pipeline (Career.eras, queue, verify, locate; covered by test/storytest.js, all 21 checks pass). Reuse it for an optional "artist tour" generator; it is solid, just not a campaign.
- Scenes vocabulary and Scenes.validate: data-driven venue description (setting, time, weather, palette, props, motif, sign). Keep it as the venue data format for the 3D rebuild.
- Share codes: careerToCode/careerFromCode (gzip + base64url, every field revalidated) at src/65-story.js:107-140, and song codes. Use them for sharing setlists and daily seeds.
- The single results hook pattern (each mode's record(r) at src/70-ui.js:615-621) and UI.battleOpts for fixing run rules. It is a clean seam for new modes.
- Practice's wait-for-chord detection and per-string hints (src/60-game.js:219-341). This is the actual teaching asset; note recognition must not regress.
- Intro's typewriter and per-letter blip voice (src/73-intro.js:55-65, 113-124) as the dialogue presenter for an original cast.
- Online's take recording on the player bus or mic with beat-0 offset (src/69-online.js:171-193). Reusable for a local "record my performance / replay" feature without a server.
- Stage fail state (danger meter to BOOED OFF, test/failshot.js passes): the only real stakes mechanic that exists.

## Overhaul ideas
- (L) CAMPAIGN "Street to Arena". An original band (player plus Bo, Lulu, Tofu and the funk drummer as bandmates with their own arcs) across 6 venues: street corner, garage, club, theatre, festival, arena. Each venue has 5 or 6 gigs: 3 skill microgigs (20 to 40 s, one new chord, change or strum pattern each), 1 setlist gig (2 or 3 song sections back-to-back with a carried crowd meter), 1 remix stage (earlier material faster, reordered or swung), and 1 rival boss (call-and-response against a rival band who plays a phrase you must answer). Bronze, silver and gold medals come from mic-verified accuracy; the venue gate needs N medals, not all clears. — The fantasy is being in a band that climbs, which the current Story lacks entirely. Loop: learn one thing, use it in a gig, earn a medal, unlock a venue, gear or bandmate scene. Content: about 35 authored gigs on embedded public-domain or original charts (so it is offline and has no licensing risk), about 60 dialogue beats, 6 venue Scenes, 5 rivals. Reuse: G Stage run, danger/fail, Career.stats to grade charts, Scenes data, Intro presenter, results hook, STORY_TIERS-style rule objects per gig.
- (M) Skill graph as the spine: nodes are chords (Em, G, C, D, Am, then F, Bm barre), transitions (G to C, C to D and so on), and techniques (downstrokes, down-up, mute, a specific strum pattern, capo). Each node has a mastery state driven by mic-verified time-to-clean-chord and Stage note accuracy. Campaign gigs, daily gigs and unlockable songs all declare the nodes they require and train. — This is what turns flashcards into progression. Difficulty follows what the player can actually do, not era index, and it tells the player why a song is locked and what to practise. Reuse: G.chordStats and the practice stats arrays already produce per-chord data; persist them in Store.
- (M) LESSON / PRACTICE mode with spaced repetition: 3-minute sessions generated from the skill graph. Phase 1, shape: wait-mode with per-string feedback (existing Practice). Phase 2, change drill: two chords alternating to a click, counting clean changes per minute, with a target of 30+. Phase 3, strum pattern over a held chord with arrows. Phase 4, an 8-bar musical application. Leitner boxes per chord and per transition decide what comes back tomorrow. Tap-through is "look only" and earns nothing. — The current Practice replays a song's chord list once and forgets everything. One-minute changes plus spaced review is the proven method for chord changes. Content: drill templates only, since the graph generates the sessions. Reuse: practiceListen/practiceFrame, practiceHint, Fretboard ghost.
- (L) QUICK-PLAY MICROGAME GAUNTLET (WarioWare style): 5 to 8 s microgames with a one-word command and rising speed, 3 lives, a boss every 10. Examples: "CHANGE!" (hit the shown chord before the fuse burns), "MUTE!", "ECHO!" (repeat a 1-bar rhythm), "TUNE!" (is this string flat or sharp), "SPOT IT!" (which chord did the band play), "HOLD!" (let a chord ring cleanly for 2 s), "DOWN-UP!". Draws only from mastered and learning nodes. — It directly answers "boring flashcard game": the same recognition engine, with surprise, tempo and comedy instead of a static card. Content: 12 to 15 microgames at launch. Reuse: Listen chord verification, onset detection, the Groove clock, bursts and popups.
- (S) DAILY GIG: one date-seeded setlist of 3 short sections for everyone (seed, then chart picks from the embedded library filtered by the player's graph tier), one attempt that counts plus free retries for practice, a streak counter, a local personal-best history, and a share code for the result. — It gives a reason to come back and replaces the Setlist challenge. It needs no server: seed from the date, share via the existing code format. Reuse: Challenge.record shape, song codes, Career.stats for tiering.
- (M) Artist-career Story becomes "Tour Generator", a side mode: keep the discography, verify and Scenes pipeline, but pre-build and store every chart at creation, drop the real-artist first-person monologues (the player's own band plays a tribute night with an authored MC line), let the player pick the instrument, and tier each song by Career.stats against the skill graph instead of era index. — Playing real songs is a genuine draw and the pipeline is the most engineered part of the area, but it cannot be the campaign: it is network- and API-dependent, guitar-only and narratively empty. Reuse: nearly all of 65-story.js except STORY_TIERS and the Intro prompt.
- (M) Battle becomes "Band Duel" party mode: phrase-by-phrase alternation (4 or 8 bars each) on one device, per-player instrument and difficulty handicap, best-of-3 rounds, a sudden-death chord-change race, and tap mode allowed only if both players agree. Top-level menu entry. The same call-and-response engine powers campaign rival bosses. — The current Battle is two solo runs and a table. Short alternating phrases create real head-to-head tension and halve the waiting. Reuse: Battle setup and board, battleOpts, section and loop options in G.start.
- (S) Online: cut the public jam and feed from v1. Keep local "record my take and replay with the band" (no server). If online returns later: per-song, per-instrument boards ranked by accuracy, validated by an edge function, with anonymous auth, rate limits and report/remove. Daily Gig boards are the first candidate. — The current design is forgeable, unmoderated, and ranks by number of takes. An open anonymous audio bucket is a liability for a game aimed at learners. Reuse: Sb REST wrapper, recording and offset code.
- (M) Rewards economy: medals, then stickers and gear (guitar skins, amp, stage props, bandmate outfits) placed on the player's stage. A venue-clear cutscene. A "songbook" that fills with each chord and song mastered. Results always state one next action ("G to C is your slowest change: 2-minute drill"). — Today the only reward is a star string, and the results advice ("Try them in Practice") is not actionable or tracked. Content: about 40 cosmetics; reuse the Scenes props list and the results hook.
- (S) Make no-mic an explicit "rhythm-only assist" profile across all modes: clearly labelled, medals capped at bronze, excluded from duels and boards unless both sides opt in, with a mic gate before counted runs. — This fixes the measured exploit (Story A-grade and Practice LEGENDARY on the spacebar) while keeping the accessibility path.
