# Audit: gameplay

## Verdict
REPORT FILE NOT WRITTEN: the Write tool refused report.md ("Subagents should return findings as text, not write report files"), so I did not work around it; the full report is carried in this structured output, and all scripts, logs and 186 screenshots are in /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/ (report_path below is the intended path and does not exist).

The owner's verdict is correct and the cause is structural. On guitar the unit of play is the chord change, not the strum: across all 17 library songs the game asks for 325 judged actions in 1,011 s, which is 19.3 per minute (one every 3.1 s), with gaps up to 12.9 s where there is nothing to do; drums on the same charts ask for 160-300 per minute. A perfect run of the first song is 11 key presses in 48 s for an S "Legendary!". Strumming a rhythm is not asked for, not scored, and is punished: playing the exact on-screen strum pattern of Oh! Susanna (116 bpm) with the correct chords dropped hits from 6 of 12 to 1 of 12, because the up-strum before each change is captured as an early attempt at the next chord. With the mic on, the game does not register a strum until 0.5-0.9 s after it and the verdict appears 1.1-1.5 s after (measured on a loaded container with the game's own string synth injected; about 0.76 s plus one inference is the floor set by the code). The band is a drum loop: no chord or melody instrument plays in the guitar path, and in tap mode a strum makes no guitar sound. Hype, combo, multiplier and fail were built for a dense note stream that does not exist: a player who hits every chord 180 ms late never leaves "Warming up", mashing Space 10 times a second gets 0 misses and a "10 COMBO!", and doing nothing for the whole song in tap mode does not fail and is awarded "New best!". Practice is literally a card deck ("1/10 CHORD", "GOT IT", Skip) whose coaching text is written into a hidden div. Drums and vocals are real rhythm games; guitar, the headline instrument, is the least interactive of the five. Caveat: mic-path numbers use the synth, not real guitar recordings (those are not in the repo), so recognition rates are indicative only; the timing-capture bug and the latency floor are in the code.

## How it works
CHART: compileSong (src/20-songs.js:160-252) turns bars into chord events and MERGES repeats/holds of the same chord inside a section into one event (20-songs.js:193-194). So "G G C C" = 2 events.

STAGE, GUITAR (src/60-game.js):
- G.start (24-95): Stage list = one target per merged non-rest event (59); count-in of one bar (65); per event noteWin 0.35-1.1 s, earWin 0.9-1.6 s (78-79); lead = clamp(beatDur, 0.35, 0.7) s (82).
- Input: tap/Space only when no mic (src/70-ui.js:989, 1046); mic strums arrive via Mic.onsetListeners -> G.onStrum(t - Settings.latency) (92). When the note model is ready, strum times come from the model's onset peaks (src/46-listen.js:138-150, hooked at 70-ui.js:19) and the fast spectral-flux onset is discarded (src/40-mic.js:139).
- G.onStrum (489-515): nearest un-timed chord within +-0.30 s; first onset wins and locks the slot (503); grade <=70 ms perfect, <=130 great, <=220 good, <=300 ok (510); sets ev.onsetT (513), which moves the chord listening window; unmatched strums return silently (508). Tap mode praises at once (514); mic mode waits for the chord check.
- Miss: no onset by ev.t+0.3 s (+ model lag) (402).
- Chord check: model path, one look over onset+0.04..+0.59 s once Listen.reliableT passes it (370-387); DSP fallback needs 2 ok frames (425-453). reliableT trails newest audio by 15 frames = 0.17 s (46-listen.js:132).
- finalize (454-486): hit = timing not miss AND chord verified (467-468); points = timing pts (100/80/55/30) x (0.35+0.65 x strings heard) (465-469); combo; multiplier 1+floor(combo/8), max x4 (477); runs at ev.t+noteWin in tap mode, ev.t+earWin with mic (403).
- Hype (106-113, 419, 516-522): perfect +0.13, great +0.09, good +0.05, ok +0.015, miss -0.22; decay 0.012/s; levels at 0.18/0.40/0.62/0.85; level only changes the drum pattern and adds bass (src/30-audio.js:350-390) and the level-up banner (138-147).
- Danger (115-122, 420, 476): miss +0.13, wrong chord +0.08, hits -0.02..-0.11, decay 0.012/s after 2 s; x0.8 tap, x0.7 relaxed; fail at 1.0 -> BOOED OFF (123-136; visuals src/50-render.js:746-787). No HUD meter.
- End: finish (563-589) -> grade S>=92%, A>=80, B>=65, C>=45; stores best {score, grade} per song (583-586).
- Next-chord preview: neck flips `lead` before the change (346-357); ghost shows lead + 0.55..1.3 s before (409).

PRACTICE, GUITAR: list merges same chord even across sections (40-48); each card waits forever; practiceListen (219-247) judges the latest strum once the model has >=0.52 s of it; practiceSuccess (165-201): <=4 beats "QUICK!" +0.18..0.30 hype, <=8 beats +0.09, slower +0.03; tap mode = any tap advances (494-497). Hints: practiceHint (322-343) -> UI.hint (70-ui.js:580) -> #hint, which sits inside <div hidden> (src/01-head.html:1074).

OTHER INSTRUMENTS: G hands frames to Parts (60-game.js:85-88, 599). Vocals: pitch lane, fraction of frames within 80 cents (src/62-parts.js:100-143). Bass: generated line, first frame with right pitch class (src/63-band.js:24-45, 117-139). Piano: one block chord per bar (48-58). Drums: band groove on 3 lanes, nearest target within 170 ms, unmatched hits ignored (59-69, 167-182). Shared judgeTiming (141-155).

DISPLAY: Fretboard.drawLane (50-render.js:1058-1125): chord cards sized by duration, strum arrows as triangles of min(4.5, strip*0.35) px half-size, only if the song has a strum string (1079-1086, 60-game.js:29). Popups are speech bubbles anchored to Pip (50-render.js:688-708); banner (709-728). Results: UI.showResults (70-ui.js:592-629).

AUDIO: Groove.play schedules drums only; bass only at level>=2 and only if pitchedOk (no mic, or headphones) (30-audio.js:321, 374). AudioEngine.strum is called only from Parts.compFrame (62-parts.js:150) and the tuner (70-ui.js:790). In-game SFX are sines above 2.2 kHz and each mutes flux onsets for 0.2 s (src/36-sfx.js:29, 67-73).

MEASURED TIMELINE, "Chord Drill: G, C, D" Stage, 80 bpm, 48 s: screen up 0.46 s after the click; count-in to 3.1 s; strum G at 3.1; 6.0 s of nothing; C at 9.1; D 15.1; G 21.1; G 27.1; then one strum every 3 s to 45.1; wipe to results at ~49 s. 11 actions total.

DENSITY (judged actions/min, guitar | bass | piano | drums): Down in the Valley 10.4|52|33|200; Chord Drill GCD 13.8|40|20|180; Drill Em Am C D 17.1|42|22|189; Saints 14.0|56|28|224 (max gap 12.9 s); Amazing Grace 21|49|28|168; Happy Birthday 33|63|38|200; Oh! Susanna 19.9|58|33|290; Jingle Bells 17.8|60|30|300; Twinkle 44|48|44|216; Auld Lang Syne 25|25|25|180; Greensleeves 34|62|36|192; Rising Sun 19|19|21|84; Wayfaring Stranger 10.7|11|19|171; Scarborough Fair 26|63|35|208; Drunken Sailor 23.6|63|35|284; 12-Bar Blues 14.4|46|23|184; Drill F/Bm 9|9|18|162. Only 2 of 17 songs have a strum pattern.

SCREEN BUDGET (measured): laptop 1280x665: board 43% of height, band area 44%, lane 40 px, 6.2 s visible, strum arrows 6.3 px. Phone 390x844: board 33%, band 54%, lane 63 px, 3.4 s visible, arrows 8.9 px.

## Problems

### [critical] The unit of play is the chord change, not the strum: 19 judged actions per minute
- Where: src/20-songs.js:193-194 (merge repeats); src/60-game.js:59 (one target per merged event); src/60-game.js:489-515
- Evidence: MEASURED with the game's own compiler over all 17 library songs: 325 guitar targets in 1,011 s = 19.3/min, mean gap 3.1 s, max gap 12.9 s (When the Saints), 9/min on the barre drill. Drums on the same charts: 160-300/min. A perfect Stage run of Chord Drill G,C,D is 11 key presses in 48 s -> S 'Legendary!'. Script /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/density.js, output density.txt in the same folder. Frames: shots/laptop-perfect-04.png (lane = one card 'G' across the full width), shots/laptop-perfect-06.png (same card 3 s later), shots/phone-perfect-04.png.
- Fix: Expand each chord span into strum targets from chart.song.strum or a per-style default (tiers: beat 1 only, quarters, 8th pattern, syncopation/mutes). Judge every strum on timing; verify the chord once per span. Parts.drumTargets/drumHit/judgeTiming (src/63-band.js:59-69, 141-182) is already a lane-agnostic onset judge to reuse.

### [critical] Strumming a rhythm is punished: the strum before a change is captured as the next chord
- Where: src/60-game.js:503 (first onset locks), :505-506 (+-0.3 s), :513 (onsetT), :374 (window follows onsetT)
- Evidence: MEASURED, mic path, game's own string synth injected, every strum the correct chord. Oh! Susanna 116 bpm: one strum per change = 6 of 12 hit; playing the on-screen pattern D.DUD.DU = 1 of 12 hit, 11x 'CHECK NOTES', danger 0.81 after 36 s; logged offsets -267..-290 ms on 9 of 11 chords. Jingle Bells 120 bpm: changes only 6/10, quarters 1/10, eighths 1/10. Logs out-pattern-susanna-change.txt, out-pattern-susanna-pattern.txt, out-pattern-jingle-*.txt; script run_pattern.js (all in /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/). Mechanism is deterministic code: +-300 ms window takes the 8th-note up-strum (250-260 ms early), locks the slot, and moves the listening window onto the old chord. Affects 8ths from about 110 bpm and 16ths at any tempo. Caveat: the 6-of-12 baseline (G7 failing) is synth/recognition and belongs to the recognition audit; the drop to 1 is the gameplay bug.
- Fix: Per-strum targets with a window of at most half the strum spacing; let a closer onset replace an earlier one until the window closes; choose the chord-check window from the span (best 0.5 s after the change), never from an early onset.

### [critical] Mic feedback is 1.1-1.5 s late; the game does not register a strum for 0.5-0.9 s
- Where: src/40-mic.js:139 (flux onset discarded when the model is ready); src/60-game.js:374-377 (needs reliableT >= onset+0.59 s); src/46-listen.js:132 (reliableT lags 0.17 s); src/60-game.js:471, :514 (praise withheld until verified); src/60-game.js:222-223 (practice)
- Evidence: MEASURED: 'PERFECT!' popup 1,121-1,500 ms after the strum on 11 chords (out-mic-change.txt); wrong-chord verdicts 991-1,702 ms (out-mic-wrongbetween.txt); Practice 'GOT IT' 959-1,216 ms after the strum (out-mic-practice.txt). Strum awareness: median 688 ms, range 529-868 ms for isolated strums, up to 1,760 ms under load (out-jitter-1500.txt, out-jitter-500.txt, out-jitter-250.txt; script onset_jitter.js). Container was loaded (inference 230-670 ms); the floor by code is ~0.76 s + one inference. All in /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/.
- Fix: Two-stage feedback. Stage A within one frame of the flux onset: strike-line flash, string pulse, Pip strums, thump, timing colour, score tick. Stage B 0.6-0.9 s later: chord stamp (CLEAN / BUZZ / WRONG) on the plate. Flux for time, model for content.

### [critical] There is no music: the band is a drum loop and tap strums are silent
- Where: src/30-audio.js:321, :350-390; src/62-parts.js:150 and src/70-ui.js:790 are the only AudioEngine.strum call sites; src/60-game.js:489-515
- Evidence: MEASURED by wrapping AudioEngine.kit during a guitar Stage run of Jingle Bells: level 0 = kick, brush, hat, sticks; level 4 adds clap, open hat, crash; bass only in tap mode (37 notes at L4) and never with the mic on without headphones. /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/out-audio.txt (script audio_count.js). CODE: no chord or melody voice exists in the guitar path; tap branch of onStrum plays no chord.
- Fix: Tap mode: sound the chord on every tap and drop it on a miss (your input is the guitar track). Headphones: bass from bar 1, pad or rhythm double, a simple lead so songs are recognisable. No headphones: a quiet lead above guitar range. Bring layers in by section, not only by hype.

### [major] Feedback is small and in the wrong place
- Where: src/50-render.js:688-708 (popups), :709-728 (banner); src/36-sfx.js:67-69
- Evidence: Verdict is a 22-30 px speech bubble beside Pip, 250-500 px above the neck diagram the player watches; the level-up banner is drawn over it in the same frame (/tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/shots/laptop-perfect-07.png). Hit sound is a 0.045-0.07 gain sine above 2.2 kHz. No haptics: no 'vibrate' anywhere in src/. A real guitarist looks at their own hand, so feedback must be audio-first and readable in peripheral vision.
- Fix: Put verdicts on the strike line and plate; full-width colour pulse of the lane/neck border per strum; a percussive, low hit sound per strum and distinct miss sound; navigator.vibrate on phones; banners only at phrase ends.

### [major] Hype never rises for an ordinary player and is free in Practice
- Where: src/60-game.js:106-113, :419, :516-522, :175-181
- Evidence: MEASURED: hitting every chord 180 ms late (11x 'GOOD - LATE', combo 11) stays at 'Warming up' for the whole song, hype max 0.12 (log-laptop-sloppy.json). GOOD = +0.05 vs decay 0.012/s x 6 s. Practice: 5 quick taps -> LEGENDARY in 12 s with four level-up banners on consecutive cards (out-practice-laptop.txt, shots/laptop-practice-08.png). Folder: /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/.
- Fix: Scale hype per judged action to the song's density, reward consistency (any hit builds, misses drain), and make each level change what the player is asked to do (pattern tier, sections), not just the hats.

### [major] Combo and multiplier are dead on guitar
- Where: src/60-game.js:477
- Evidence: x2 needs combo 8, x4 needs 24. Library songs have 8-34 guitar targets; only Greensleeves (34) and Rising Sun (29) can reach x4. In the perfect run x2 arrived at target 8 of 11.
- Fix: Follows from per-strum targets; then multiplier steps at 10/20/30 strums and a visible combo counter on the lane.

### [major] No stakes, and fail rules differ by instrument
- Where: src/60-game.js:115-122, :420, :476; src/63-band.js:146; src/62-parts.js:133; src/50-render.js:746-787
- Evidence: MEASURED: guitar tap mode with zero input for the whole song does not fail (danger peaks 0.985) -> 'D Keep Jamming' (out-idle.txt, shots/laptop-idle-14.png). With the mic, zero input fails at the 10th miss, 39 s into 48 s (computed from the constants). Bass idle: booed off at 41% (~20 s). Drums idle: at 16% (~8 s). Danger has no meter, only a red vignette. Logs out-band-drums-idle.txt, out-band-bass-phone-idle.txt in /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/.
- Fix: One visible crowd meter (hype and danger on one axis); phrase-based lives; idle fail in 8-10 s on every instrument and in tap mode; Story tiers tune the drain.

### [major] No penalty for extra input: mashing never misses
- Where: src/60-game.js:508; src/63-band.js:173-175
- Evidence: MEASURED: Space 10x/s (478 presses) -> 0 misses, combo 11, '10 COMBO!' cheer, never fails (out-mash.txt). Drums, all three pads every ~80 ms -> A 'Tight Groove!', 82%, LEGENDARY, combo 72 (out-band-drums-mash.txt). Folder: /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/.
- Fix: Ghost hits break combo and drain the meter on tiers 3-4 and on drums; tiers 1-2 on guitar stay forgiving so a beginner can strum freely.

### [major] Practice coaching text goes to a hidden div
- Where: src/01-head.html:1074 (<div hidden>); src/60-game.js:163, :322-343; src/70-ui.js:580
- Evidence: MEASURED hidden in Practice and Stage at 1280x665 and 390x844 (#hint, #steps, #str-chips: vis.txt in /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/). The messages ('I hear a stray F# from the low E string...', 'Not ringing yet: ...') are composed every 0.9 s and never seen. Only the '2 of 6 ringing' sticker shows.
- Fix: Show one short coaching line on the plate or as Pip's speech bubble in Practice; keep the long text for a pause/help sheet.

### [major] Practice is a card deck
- Where: src/60-game.js:40-57, :150-201; src/70-ui.js:534-538
- Evidence: HUD '1/10 CHORD', 'GOT IT', 'Skip >' button, no clock or rhythm; screen is identical to Stage. /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/shots/laptop-practice-03-idle13s.png, shots/phone-practice-02-idle7s.png, shots/laptop-practice-08.png. Guitar only.
- Fix: Replace with a phrase trainer: loop 2-4 bars, the band waits on the change then resumes in time, tempo steps up as the phrase is cleaned; reuse opts.loop/tempo/section and practiceListen.

### [major] The lane communicates nothing
- Where: src/50-render.js:1058-1125 (drawLane), :1079-1086 (arrows), :1104-1106 (label)
- Evidence: 40 px high on the laptop (6% of the screen), usually one or two grey cards; strum arrows 6.3 px (8.9 px on phone), on 2 of 17 songs, never judged; the chord letter is hidden behind the strike line while the card docks (shots/laptop-perfect-07.png, shots/phone-perfect-04.png in /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/; numbers in vis.txt).
- Fix: Make the lane the main play surface: strum gems at least 28-36 px, down/up shapes, beat grid, chord colour bands behind them; the diagram shrinks once a chord is known (mastery-driven).

### [major] Timing grades are noisier than the windows; first onset wins
- Where: src/46-listen.js:138-150 (findStrums); src/60-game.js:510; src/40-mic.js:121-143
- Evidence: MEASURED over 120 injected strums: detected minus true sd 38-41 ms, range -84..+81 ms, bimodal (about +30 ms and about -60 ms). PERFECT is +-70 ms. Constant +20 ms strums were reported as -8..-73 ms (out-mic-change.txt). The model also reported 50 extra strums for 20 real ones on chords ringing 1.5 s (out-jitter-1500.txt). SUSPECT for real guitars (synth used; HANDOFF reports clean real-sample results). Folder: /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/.
- Fix: Take strum time from the flux onset (frame-accurate), use the model onset only to confirm; widen PERFECT to about +-90 ms for mic input; add a strum-along latency calibration; re-run the jitter test with real recordings.

### [major] Nothing to come back for; flat results screen
- Where: src/60-game.js:481-482, :583-586; src/70-ui.js:592-629
- Evidence: Persistent gameplay state is best = {score, grade} per song plus Story stars. chordStats is computed per run then dropped. Results: a letter and eight tiles on a yellow page, no characters, no stars, no next step; 'LEGENDARY' overflows its tile (/tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/shots/laptop-perfect-results.png).
- Fix: Persist per-chord and per-pattern mastery, 3 stars per song and tier, unlockable strum patterns, daily set, results with the band reacting, per-phrase breakdown and a 'next' button.

### [major] The song has no shape and no ending
- Where: src/50-render.js:565, :577; src/60-game.js:421-423; src/30-audio.js:303-305
- Evidence: Section change = a crash and a 10% background tint; same demand from first bar to last; the run ends in a wipe (/tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/shots/laptop-perfect-30.png).
- Fix: Phrases with verdict stamps on the fill, section-specific mechanics (intro call and response, chorus full pattern, break = mutes), a final big strum with a held pose.

### [minor] Scores are not comparable across instruments
- Where: src/60-game.js:465-478; src/63-band.js:148-149; src/62-parts.js:136-137
- Evidence: Same 48 s song, perfect or near-perfect: guitar 1,500, piano 1,550 (84%), bass 3,280 (85%), drums 26,550. out-band-*.txt in /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/.
- Fix: Normalise to a per-song maximum (e.g. 100,000) and show stars.

### [minor] 'New best!' for a score of 0; tap score lags 1.06 s
- Where: src/60-game.js:585; src/60-game.js:78, :403
- Evidence: Idle run: '0 Score ... New best!' (out-idle.txt). Tap: popup 4 ms after the press, score/combo 1,061 ms after (vis.txt). Folder: /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/.
- Fix: newBest only when score > 0 and > previous; in tap mode finalize at the tap.

### [minor] Drum lane labels clipped; drum panel wastes a third of the screen
- Where: src/63-band.js:216-217 (x=4 inside a clip starting at x=10); src/63-band.js:250-254
- Evidence: Labels read 'AT / NARE / ICK'; the panel is the word 'Drums' in display type above three pads (/tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/gameplay/shots/band-drums-laptop-perfect-2.png, shots/band-drums-phone-perfect-2.png).
- Fix: Draw labels inside the clip; on desktop drop the pads panel and give the height to the lane and the band.

### [minor] SFX and band chords deafen the mic, which blocks dense strum judging
- Where: src/36-sfx.js:29; src/30-audio.js:146
- Evidence: CODE: every in-game SFX sets Mic.muteUntil = now + 0.2 s; AudioEngine.strum sets Mic.deafUntil +2.45 s without headphones. At 120 bpm 8ths are 0.25 s apart.
- Fix: Keep hit sounds out of the onset band or subtract them (they are known signals); shorten the deaf window to the chord's attack for call and response.

## Keep
- compileSong and chooseVoicings (src/20-songs.js:160-252, src/10-theory.js:392-420): the chart and hand-movement-aware voicing choice are solid, and strum targets can be generated from their events.
- The neck diagram with per-string green/red and wrong-note placement, plus the next-chord ghost (src/50-render.js Fretboard, src/60-game.js:284-321, :409): the right teaching tool; it should stop being the whole game, not disappear.
- Groove: count-in, section crashes, end-of-section fills and the look-ahead plan/events API (src/30-audio.js:261-392), with the drummer synced to it. Fills are the natural place for phrase verdicts.
- Drums and vocals lanes (src/63-band.js:213-223, src/62-parts.js:205-237): these already play like rhythm games and set the target density for guitar.
- Parts.judgeTiming / drumHit / drumFrame (src/63-band.js:141-182): a working per-hit timing judge that takes mic onsets with no lane; the basis for a guitar strum lane.
- Practice's 'it waits for you' behaviour and practiceListen (src/60-game.js:219-247), as a mode inside a phrase loop.
- Pause and resume from the bar with a fresh count-in (src/60-game.js:528-562).
- The BOOED OFF sequence: vignette, cracks, shatter, sad trombone (src/50-render.js:746-787, src/36-sfx.js:49-53). Good drama that is currently almost unreachable.
- Note recognition as it stands (do not regress): the redesign adds a fast timing path beside it rather than replacing it.

## Overhaul ideas
- (L) Strum lane: expand every chord span into strum gems from chart.song.strum or a per-style default table. Tier 1 = downstroke on beat 1 of each bar, tier 2 = quarters, tier 3 = the 8th pattern with ups, tier 4 = syncopation and mutes. Judge each gem on timing from the flux onset; verify the chord once per span on the best 0.5 s window and stamp the result back onto the gems. Extra strums are free on tiers 1-2, break combo on 3-4. Reuse G.strumSteps (src/60-game.js:29), the arrow placement in Fretboard.drawLane (src/50-render.js:1079-1086), Parts.drumTargets/drumHit/judgeTiming (src/63-band.js:59-69, 141-182), Listen.judge and G.stageFrame for the span check. Remove the first-onset lock and moving onsetT window (60-game.js:503, :513). — Takes guitar from 19 to 60-240 judged actions per minute and makes the game about rhythm guitar, which is what the player is actually doing with their hands. Fixes the bug that punishes strumming.
- (M) Two-stage feedback. Within one frame of the spectral-flux onset: strike-line flash, Fretboard.pulse, Pip strums, a low thump, the gem pops in its timing colour, score ticks. 0.6-0.9 s later: a chord stamp (CLEAN / BUZZ / WRONG) on the plate where the eyes are. Stop discarding flux onsets when the model is ready (src/40-mic.js:139). Reuse Mic.onsetListeners, Stage.ring/burst, Fretboard.feedback. — Chord identity needs about half a second of sound and cannot be made faster, but timing can be acknowledged instantly. Today the first reaction to a strum is 0.5-1.5 s late.
- (M) Make the band a band. Tap mode: AudioEngine.strum(ev.notes) on each tap in the tap branch of G.onStrum (src/60-game.js:494-500), dropped on a miss. Headphones: bass from bar 1, a pad or rhythm double and a simple lead voice. No headphones: leak-safe drums plus a quiet lead above the guitar range. Layers enter by section. — Right now the songs are unrecognisable drum loops and the player's input makes no musical sound.
- (M) Phrases with verdicts: cut each song into 2- or 4-bar phrases that end on the existing drum fill (Groove.fillBars, src/60-game.js:69). Rhythm Heaven stamp per phrase (TRY AGAIN / OK / SUPERB) and a one-beat character gag when the player can look up. Per-phrase results drive stars, dynamic tier and a riff repeater that loops the failed phrase slower (opts.loop / opts.tempo / opts.section already exist). — Gives the song shape, a reason to look at the characters, and Rocksmith-style adaptive practice inside the run.
- (M) Call and response: Pip plays a one-bar rhythm on the held chord (AudioEngine.strum scheduled like Parts.compFrame, src/62-parts.js:145-153), the player echoes it in the next bar; only onset timing is judged. Use for intros, bridges and to teach each new strum pattern. Needs a shorter mic-deaf window than 2.45 s (src/30-audio.js:146). — The Rhythm Heaven core, and the most robust mechanic available on any mic because it needs no chord recognition.
- (L) Micro-challenge mode ('Jam Tapes'): 4-8 s games with a one-word command, faster every four games, four lives shown as crowd beans leaving. Verbs the current detection already supports: STRUM! (n strums in time), STOP! (silence on the beat), SWITCH! (two chords inside two beats, G.practiceListen), HOLD! (let it ring), ECHO! (call and response), ONE STRING! (single note via Listen.judge), TUNE! (McLeod tuner), LOUD / soft (Mic.rms). — Delivers the WarioWare identity, surprise and pace the owner asked for, and each game is a real technique drill.
- (M) One crowd meter and real stakes: merge hype and danger into a single visible meter; gains scaled to the song's action density so GOOD players still build; phrase-based lives; idle fail in 8-10 s on every instrument and in tap mode; ghost-hit penalties on higher tiers. Reuse G.addHype/addDanger and Stage.drawDanger. — Today the meter is unreachable for average players, free in Practice, and failure is either impossible (tap) or arbitrary (8 s on drums, 39 s on guitar).
- (M) Star power the player fires: fill a meter with clean phrases, trigger it with a marked 'power strum' at a phrase start (one loud strum, read from Mic.rms). Double points, crowd sings, lights. Reuse G.level visuals, Scenes.drawLive, camera flashes (src/50-render.js:652). — Adds player agency and a peak moment per song; currently the player has no decisions to make.
- (S) Boss bars: flag the hardest change in the song (voicing diff from finishVoicing, src/10-theory.js:154-174, or the player's stored chord stats) with a warning two bars ahead, an enlarged ghost preview, and a big payoff or a life lost. — Turns the thing beginners dread (F, Bm) into the dramatic beat of the song instead of a silent miss.
- (M) Phrase trainer replaces card-deck Practice: loop 2-4 bars, the band holds on the change until the chord rings, then resumes in time; tempo steps up as the phrase gets clean. Show the existing coaching text (src/60-game.js:322-343) on the plate or as Pip's speech bubble instead of the hidden div (src/01-head.html:1074). Open it to bass, piano and drums. — Keeps 'it waits for you' but teaches changes in rhythm, which is the actual skill, and surfaces coaching that is already written.
- (M) Retention layer: persist per-chord and per-pattern mastery (chordStats, src/60-game.js:481-482), 3 stars per song and tier, strum patterns as unlocks, a chord sticker book, a daily three-song set; results screen with the band reacting, per-phrase breakdown, one normalised score scale across instruments, and a 'next' button. — The only persistent reward today is a letter grade per song.
- (S) Latency and timing hygiene: strum-along calibration minigame (strum with the click, compare flux onsets to Groove beats), PERFECT widened to about +-90 ms for mic input, hit sounds kept out of the onset band so they need not mute the mic (src/36-sfx.js:29), and a regression test for strum-time error using real recordings. — Measured strum-time spread is +-80 ms against a +-70 ms PERFECT window, so grades are partly random; dense strum judging will not work while every SFX mutes detection for 0.2 s.
