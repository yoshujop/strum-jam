# Audit: research

## Verdict
Strum Jam feels like a flashcard game because its core loop is "show a chord name and diagram, wait, grade it afterwards": there is no audio cue, no call-and-response, no single-verb stage and no musical reward for playing well. The largest verified gap is audio. For the default player (mic on, no headphones) the in-game band is drums only, starting as kick/snare/hat on the beat, and all pitched backing is disabled to protect recognition. The player is strumming along to a metronome while an illustration animates.

Feedback lands too late to feel like a hit. Timing praise fires on the onset, but the chord verdict is finalised only after the listening window closes: at least 0.5 s after the strum by construction, and not measured end to end. The confirm sounds are fixed 2.3-3.9 kHz sine blips, out of key and off the grid; there is no hit-stop, and screen shake exists only for misses and failure.

Structure is a library plus a song-length run with S/A/B/C/D accuracy grades and five timing tiers. Nothing is short, hosted, escalating or surprising, and the menu theme is one hand-coded 16-bar loop. Onboarding is four clicks plus a tuner gate plus a mic prompt before the first strum.

The recognition pipeline, lookahead scheduler, Karplus-Strong guitar and hype-level idea are worth keeping; the overhaul should wrap them in a Rhythm Heaven / WarioWare structure. That means 20-40 s one-verb stages with audio call-and-response, a band whose layers the player unlocks, in-key quantised confirm sounds, Try Again/OK/Superb grading and a first strum in the first 15 seconds.

Method limits: web search was available but returned only one usable number (Ubisoft's roughly 25 ms optimised round trip for Rocksmith+). Every other genre latency or window figure below is from my own knowledge and is not freshly sourced. I skimmed the code and took four screenshots; I did not play the game with a real instrument.

## How it works
Grounding map of the current mechanisms the design brief has to work with. Paths are under /home/user/strum-jam/src.

**Timing judgement**
- `G.onStrum` (60-game.js:~501-514) matches an onset to the nearest unjudged event within ±300 ms.
- Tiers: perfect ≤70 ms, great ≤130 ms, good ≤220 ms, ok ≤300 ms (60-game.js:510).
- Mic onsets are shifted by a fixed `Settings.latency`, default 80 ms (05-settings.js:9, 60-game.js:92).
- A strum-along calibration exists but is buried in Settings (70-ui.js:737).

**Chord correctness**
- Judged after the fact from the Basic Pitch timeline: window is t0 = onset + 0.04 to t1 = t0 + 0.25..0.55 s.
- The verdict waits for `Listen.reliableT >= t1` and `Listen.lastT >= t0 + 0.5` (60-game.js:374-386).
- `reliableT` trails the newest model frame by 15 × 256 samples (46-listen.js:132), about 174 ms if the model runs at 22.05 kHz (my assumption), plus worker time.
- By construction the note verdict lands at least 0.5 s after the strum; I did not measure the real figure.
- A miss is declared at t + 0.3 s plus model lag (60-game.js:402).

**Hype, combo and grades**
- `addHype` moves `Groove.level` between 0 and 4 (60-game.js:105-111).
- Multiplier is 1 + floor(combo/8), capped at ×4 (60-game.js:477); a popup fires every 10 combo (60-game.js:484).
- Praise words are picked at random (60-game.js:178-185).
- Final grade is S/A/B/C/D from accuracy at 0.92/0.80/0.65/0.45 (60-game.js:578); failing shows "Booed Off" (60-game.js:133).

**In-game band**
- `Groove` is a lookahead step sequencer with swing offsets (30-audio.js:281-287).
- Level 0 plays kick/snare/hat on beats only (30-audio.js:307, 352-356); level 3+ adds ghost hats and kicks; level 4 adds crashes.
- The bass line needs level ≥2 and `pitchedOk()`, which is false when the mic is on without headphones (30-audio.js:321, 374).
- In leak mode kick and snare become pitchless thump and noise (30-audio.js:52-53).

**Menu music**
- 35-music.js is one hand-written 16-bar D-minor funk loop at 112 BPM, with a 25 ms tick and 120 ms horizon (35-music.js:7, 31-34, 192-200).
- It has a generated-impulse convolver (35-music.js:60) and saw/square voices.

**SFX and juice**
- `perfect` and `great` are fixed sine blips at 2349-3951 Hz (36-sfx.js:65-66).
- `Stage.burst` particles and `Stage.ring` exist; shake is set only on miss (5) and fail (16) (60-game.js:402, 127; 50-render.js:558-559).
- No hit-stop or freeze exists anywhere in 50-render.js, 60-game.js or 36-sfx.js (grep).

**Mic**
- `getUserMedia` runs with noise suppression and auto gain off; echo cancellation is optional (40-mic.js:24).
- Chord preview playback deafens the mic for 0.4 s with headphones and 2.45 s without (30-audio.js:146).

**Onboarding path**
- `#btn-start` → `#btn-play` → pick a song → `#btn-stage`, then a tuner gate that defaults on (`tuneFirst`, 05-settings.js:9; 70-ui.js:510), then the mic permission.

**Screenshots** (in /tmp/claude-0/-home-user-strum-jam/bfa410c2-f824-5051-9a3c-70f51a4346d2/scratchpad/audit/research/)
- menu-1280x665.png, menu-390x844.png, stage-1280x665.png, stage-390x844.png
- The stage is a "PLAY G" plate, a fretboard diagram and a bar-long grey/red lane card (G then C).

## Problems

### [critical] No audio-first cueing: the game is read, not heard
- Where: src/60-game.js:360-405, src/30-audio.js:146, src/50-render.js (lane)
- Evidence: stage-1280x665.png: the only instruction is a 'PLAY G' plate, a fretboard diagram and a bar-long lane card. The code has no call phrase, no cue sound before a chord change and no demonstration of the strum pattern by the band. The chord preview is a manual HEAR button, and using it deafens the mic for 0.4-2.45 s (30-audio.js:146). Rhythm Heaven's core rule, from my own knowledge, is that every input is predictable from sound alone and visuals are secondary; this game is the inverse, which is exactly the flashcard feeling.
- Fix: Make every stage a call-and-response: a band member plays or sings the cue (a chord stab plus a spoken or blipped command such as 'G! two, three, four'), then the player answers in the gap. Cue sounds must be distinct per chord and per pattern so the stage is passable with eyes closed. Schedule cues in the same lookahead scheduler as Groove.

### [critical] For the default player the music is a drum machine
- Where: src/30-audio.js:52-53, 300-390; src/35-music.js
- Evidence: pitchedOk() returns false when the mic is on without headphones (30-audio.js:321), so the bass never plays (30-audio.js:374) and kick/snare become a pitchless thump (30-audio.js:52-53). Level 0 is kick/snare/hat on the beat only (30-audio.js:307, 352-356). There is no harmony, melody or song identity while playing, even in Story mode about real artists. The menu theme is one hard-coded 16-bar loop (35-music.js:31-34).
- Fix: Three-way audio route chosen in the first 10 s: headphones (full band), speakers with echo cancellation (full band, and test what AEC does to recognition), bare speakers (band restricted to spectral regions the recogniser ignores, plus full band in the gaps). Run a subtract-the-known-backing test: the game knows exactly what it is playing, so the scheduled notes can be masked out of the model's posteriorgram instead of muting the band.

### [critical] Hit confirmation is late, split in two, and not musical
- Where: src/60-game.js:374-386, 510-519; src/36-sfx.js:65-70; src/46-listen.js:132
- Evidence: Timing praise fires on the onset (60-game.js:517-519), but chord correctness is finalised only when Listen.reliableT passes t1 and Listen.lastT >= t0 + 0.5 (60-game.js:374-386, 46-listen.js:132). By construction the 'you played the right chord' verdict is at least 0.5 s after the strum; I did not measure the actual delay. The confirm sounds are fixed 2349-3951 Hz sine arpeggios regardless of key or beat (36-sfx.js:65-66).
- Fix: Two-stage feedback by design. (1) Instant, onset-driven and optimistic: flash, squash, a drum accent and an in-key stab within one frame of the onset. (2) Verdict on the next beat boundary: quantise the chord result to the following beat so the delay reads as musical call-and-answer (a band shout, crowd 'hey', the character's reaction pose). A wrong chord takes back the layer rather than playing a buzzer.

### [major] No hit-stop, no shake on success, no escalation: weak game feel
- Where: src/60-game.js:127, 178-186, 402, 484, 518-519; src/50-render.js:501, 558
- Evidence: grep over 50-render.js, 60-game.js and 36-sfx.js finds no hit-stop or freeze. Stage.shake is set only for a miss (5) and a fail (16) (60-game.js:402, 127), so the only screen impact a player ever feels is punishment. Perfect is 22 particles plus a ring (60-game.js:518). Praise words are random (60-game.js:178), so they carry no information.
- Fix: A feedback ladder tied to the grade: 2-4 frames of hit-stop on Perfect, directional camera kick on the downstroke, character squash on anticipation and stretch on the hit, particles in the chord's colour, deterministic words per grade. Escalate with combo (camera closer, lights, crowd layer). Misses get a small limp reaction, not the biggest effect in the game.

### [major] Structure is a song-length exam, not a set of short hosted stages
- Where: src/60-game.js:560-590; src/20-songs.js; src/65-story.js
- Evidence: One mode runs a whole chart with a 5-tier timing count and S/A/B/C/D by accuracy (60-game.js:578), with 'Booed Off' on failure (60-game.js:133). Nothing is under 30 s, no stage teaches exactly one thing, and there are no remixes, boss stages, speed-ups or hosts. The 'Chord Drill: G, C, D' stage is literally a drill.
- Fix: Restructure into sets of 5-6 one-verb stages (20-40 s each) plus a Remix that chains them over one tune, hosted by a band character. Grade Try Again / OK / Superb, with a later no-miss Perfect invitation. Full songs become the 'gig' at the end of a set, not the unit of play.

### [major] Timing windows and latency handling are generic, not tuned to mic strumming
- Where: src/60-game.js:92, 510; src/05-settings.js:9; src/30-audio.js:210; src/70-ui.js:737
- Evidence: Windows are ±70/130/220/300 ms (60-game.js:510) around a fixed 80 ms offset (05-settings.js:9). Bluetooth output (commonly 150-300 ms, from my own knowledge) or a phone mic path can exceed the Perfect window on its own, and calibration is a hidden Settings tool (70-ui.js:737). AudioContext output latency is read (30-audio.js:210), but line 92 of 60-game.js applies only Settings.latency.
- Fix: Fold calibration into the first stage: the first 8 strums of 'strum with the drummer' set the offset from their median, and it keeps adapting slowly from the running median error of confident hits. Warn on and compensate for Bluetooth using outputLatency. Use three tiers only, with a wide OK.

### [major] Performance does not change the music enough to be a reward
- Where: src/30-audio.js:300-390; src/60-game.js:105-146
- Evidence: Groove.level (0-4) only thickens the drum pattern (30-audio.js:307-311) and adds bass at level 2+ when not in leak mode (30-audio.js:374). There is no harmony layer, no arrangement lift, no filter or sidechain movement and no stinger on level-up beyond Sfx.levelUp (60-game.js:144).
- Fix: Vertical layering as the core reward. L0 drummer only, L1 bass, L2 keys comping, L3 lead/horn hook plus crowd claps, L4 key lift or double-time feel with a full-bar fill on transition. Dropping a level removes a layer with a tape-stop or filter sweep. The player should hear their streak.

### [major] Time to first note is long and front-loaded with admin
- Where: src/70-ui.js:510, 1119; src/05-settings.js:9
- Evidence: Path is #btn-start, then #btn-play, then the song list, then #btn-stage (test/uishot.js flow), then a tuner gate that defaults on (05-settings.js:9 tuneFirst, 70-ui.js:510), then the mic permission. The menu shows three modes and four utility buttons before any play (menu-1280x665.png). In the no-mic screenshot the stage falls back to 'tap here or press Space'.
- Fix: First run goes straight into a hosted 'strum anything' stage: one tap grants the mic, any strum makes the band hit, with tuning and headphone detection folded in as later stages. The menu appears only after the first Superb/OK.

### [minor] Punishing failure state contradicts the genre's forgiving loop
- Where: src/60-game.js:120-135
- Evidence: Danger and fail lead to 'Booed Off!' with grade F and shake 16 (60-game.js:127-133), in a game whose recogniser can be wrong. Rhythm Heaven never ejects the player mid-stage, and Rocksmith, from my own knowledge, lowers difficulty instead.
- Fix: Never end a run early. On struggle the band simplifies (half-time, fewer changes, an easier voicing) and the host mimes help. Grade at the end; Try Again is one tap and restarts in under 2 s.

## Keep
- Recognition pipeline: Basic Pitch decides the notes, Ear.fresh confirms they are new, strums come from model onset peaks (src/46-listen.js, src/45-ear.js). CLAUDE.md says do not regress it; redesign feedback around its lag instead of changing it.
- After-the-fact judging against the audio clock (60-game.js:374-386). This is the correct way to hide latency; it only needs presenting as a beat-quantised reply.
- Web Audio lookahead scheduler with swing (30-audio.js:281-287; 35-music.js:192-200). Use it for all cues, stabs and quantised SFX.
- Extended Karplus-Strong guitar with a generated-impulse body convolver (30-audio.js:78-150). It is the best-sounding voice and should carry the call phrases.
- The hype-to-Groove.level idea (60-game.js:105-111). Right concept, too little audible payload.
- Leak awareness: mic deafening during previews and the headphones flag (30-audio.js:53, 146, 321). Keep it as a routing decision, not a silent degradation.
- Strum-along latency calibration maths, median of offsets (70-ui.js:737). Move it into the first stage.
- Tap/Space fallback when there is no mic (60-game.js:501). It makes onboarding and testing possible without an instrument.
- Single-HTML build with embedded model and fonts. It loads anywhere; keep the constraint and budget new assets against it.

## Overhaul ideas
- (L) P1 Core loop: call-and-response stages. A band character plays a 1-2 bar phrase with a spoken or blipped command; the player answers in the next bars. The notation highway becomes secondary (a small 'next' plate). — Rhythm Heaven: audio-first cues, passable with eyes closed. In this game: the drummer counts 'G! 2, 3, 4', the guitarist strums the pattern, the player repeats it. Risk: the player's answer overlaps band sound in the mic; keep answer bars drums-only unless on headphones, and schedule the call with the mic deafened (the existing deafUntil).
- (L) P2 One verb per stage, 20-40 s, in hosted sets of 5 plus a Remix. Examples: 'Mute!' (palm mute on the off-beat), 'Switch!' (G to C on the 1), 'Down-up!' (strum pattern on one chord), 'Hold!' (let it ring 4 beats), 'Stop!' (silence on the break). — WarioWare (one verb, a command word, a host per set) and Rhythm Heaven (one mechanic per stage, a remix every fifth). It breaks the song-length exam into things the recogniser is good at: onset timing, one chord, silence. Risk: content authoring; make stages data-driven as verb + chord set + groove + cue set.
- (M) P3 Two-stage hit confirmation. Instant onset juice (under 50 ms after detection), then the chord verdict quantised to the next beat as a band or crowd answer. — Mic-based learning games judge after the fact, and this recogniser needs at least 0.5 s by construction. A quantised reply turns that lag into rhythm instead of delay. Risk: the optimistic flash followed by 'wrong chord' can feel like a take-back; make stage 1 neutral-positive ('strum!') and stage 2 the coloured verdict.
- (L) P4 Vertical-layered adaptive band. Five stems generated live (drums, bass, keys comp, hook, crowd), unlocked by streak and dropped with a filter or tape-stop on misses; the level-up lands on a bar line with a fill. — Guitar Hero's crowd meter and star power, and Rhythm Heaven's music-is-the-reward. The current level only thickens the drums (30-audio.js:307). Risk: pitched layers leak into the mic; needs idea P5. On phones cap polyphony at about 24 voices and pre-render one-bar loops with an OfflineAudioContext.
- (L) P5 Audio routing decided in the first 10 s (headphones, echo-cancelled speakers, or leak-safe), plus a 'known backing' mask: remove the notes the band is scheduled to play from the recogniser's evidence instead of muting the band. — Root cause of 'the music sucks' is pitchedOk() (30-audio.js:321). Risk: masking hides a player's note when it equals a band note; voice the band away from the target chord tones (bass an octave below MIDI 38, keys above 88, both outside the 38-88 recognition range). Must be validated against the existing recognition tests before shipping.
- (S) P6 In-key, beat-snapped confirm sounds. Each grade triggers a stab from the current chord (Perfect = full chord hit with horn, OK = root only) and a drum accent; the player's strum is 'completed' by the band. — Rhythm Heaven and Taiko: the hit sound is part of the music. It replaces the fixed 2.3-3.9 kHz sine blips (36-sfx.js:65-66). Risk: the stab must not land in the next listening window; keep it shorter than 150 ms and outside the 38-88 MIDI range when in leak mode.
- (M) P7 Three grades only: per hit, miss / OK / Perfect (asymmetric windows, generous late side); per stage, Try Again / OK / Superb with a one-line host verdict. After a Superb, occasionally offer a 'Go for Perfect' no-miss attempt with 3 tries. — Rhythm Heaven grading. Five tiers plus S-D letters (60-game.js:510, 578) is spreadsheet feedback. Risk: a Perfect campaign with a fallible recogniser is unfair; count only timing misses and confident wrong chords, never 'unsure'.
- (M) P8 Never fail mid-stage: adaptive difficulty per phrase. On two missed phrases the band drops to half-time or a simpler pattern or easy voicing; on clean phrases it adds changes. Replace 'Booed Off'. — Rocksmith's dynamic difficulty and riff repeater (auto slow-down, loop the hard bar, speed back up). The danger/fail state (60-game.js:127-133) punishes recogniser errors. Risk: tempo changes mid-run need Groove to re-time on a bar line; do changes only at phrase boundaries.
- (M) P9 Riff-repeater micro-loop inside every stage: a missed phrase immediately replays as call-and-response at 80% tempo, then returns to full speed; the stage timer pauses. — Rocksmith and Yousician practice loops, delivered without a menu. It teaches where the current game only grades. Risk: stage length becomes variable; cap at two repeats, then move on.
- (M) P10 Onboarding in under 30 s. Launch into the 'Strum!' stage: mic prompt, 'play any strum' (the first 8 strums calibrate latency and level and detect speaker leak), a Superb sting, and only then the set select. Tuning becomes stage 2, hosted ('Tune up with Bo'). — Simply Guitar and Yousician onboard by having you make a sound first, and WarioWare has no tutorial. The current path is four clicks plus a tuner gate (70-ui.js:510). Risk: Basic Pitch loads after the page; stage 1 must use onset detection only, which works before Listen.ready.
- (S) P11 Continuous latency self-calibration: keep a running median of timing error on confident hits and slew the offset by at most 5 ms per phrase; read AudioContext.outputLatency and flag Bluetooth (over 120 ms) with a one-line host warning. — Rhythm games ship calibration, and mic paths vary roughly 30-300 ms (my own estimate, not measured here). A fixed 80 ms default (05-settings.js:9) silently turns good players into 'LATE'. Risk: players who really do rush or drag get auto-corrected; clamp to ±60 ms around the calibrated base.
- (M) P12 Juice ladder tied to the grade: anticipation squash on the cue beat, 2-4 frame hit-stop plus a 6-10 px directional kick on Perfect, stretch and smear on the strum arm, chord-coloured particles, crowd sprite pop; combo tiers at 4/8/16 change lighting, camera distance and crowd audio. — Standard game-feel practice (hit-stop, shake, squash/stretch, escalation). Success currently has no shake or freeze (60-game.js:402 is the only gameplay shake). Risk: hit-stop must freeze visuals only, never the audio clock or scheduler; honour reduceMotion; on phones cap particles at about 150.
- (M) P13 Speed-up and boss structure per set: stages 1-4 at base tempo, then a 'Faster!' card and +8% BPM replays, then a boss (a full 60-90 s song section using all the set's verbs), with a 2 s host interstitial between stages. — WarioWare pacing: comedic timing comes from the interstitial and the speed-up. It gives drills stakes and rhythm. Risk: faster strumming shortens chord windows below the 0.25 s minimum (60-game.js:375); cap tempo so every chord gets at least two beats.
- (L) P14 Rebuild procedural music as a small engine: FM e-piano (2-operator, ratio 1:1 body plus 14:1 tine, index decaying over 80 ms), FM/saw bass with a filter envelope, KS guitar (keep), synthesised kit (sine kick 150 to 50 Hz, band-passed noise snare plus 180 Hz body, high-passed noise hats), generated exponential-noise impulse reverb, kick-triggered gain ducking on keys and bass, 54-58% swing, per-set style presets and chord progressions as data. — One hard-coded loop (35-music.js) and saw/square voices read as 'chiptune demo'. A style-preset engine gives each host their own genre. Risk: CPU on phones; pre-render bars with OfflineAudioContext and loop buffers, with live synthesis only for reactive layers.
- (M) P15 Songs become 'gigs': real songs (Story or library) are the end-of-set performance, using the same verbs, with the adaptive band and simplification tiers (roots only, then full chords, then pattern). — Rocksmith and Yousician: real songs motivate, micro-stages teach. This keeps the chart pipeline and Story mode but gates them behind competence. Risk: chart accuracy (HANDOFF backlog item 4); show a confidence level and let the player fix a chord in one tap.
- (L) P16 Hosts with mechanical identity: the drummer hosts rhythm verbs (strum patterns, mutes, stops), Pip hosts chord shapes, Bo hosts changes and bass notes, Lulu hosts sing-and-strum. Each has a call sound, an OK/Superb/Try Again reaction pose and a short interstitial gag. — WarioWare character-hosted sets and Taiko's mascot reactions. Characters today are decoration reacting to a mood enum. Risk: animation scope in the 3D rebuild; specify 6 poses per host (idle, cue, hit, miss, superb, fail) played pose-to-pose with smears.
- (S) P17 Silence and muting as first-class inputs: stages that judge 'no sound on beat 4' and 'choke the chord'. — Rhythm Heaven's best stages are about rests. Level-gate and onset detection are the most reliable signals this game has, far more than chord identity. Risk: room noise; use the per-mic calibration gate (72-calib.js).
- (M) P18 One-screen play UI: host and band fill the frame; one command word (Bagel Fat One, 1 s), one 'next' chord plate with a fingering that fades after two correct plays, a 4-beat pulse ring instead of a scrolling lane; all settings behind pause. — WarioWare typographic command plus reduced reading load; the fretboard-and-lane layout in stage-1280x665.png is the flashcard. Risk: beginners need the diagram longer; fade it by per-chord mastery (chordStats already exists, 60-game.js:64).
