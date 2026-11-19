# Audit: recognition

## Verdict
The chord classifier itself is not the problem; the real-time plumbing around it is. Offline, on synthetic guitar, the game's own judge accepts 100% of right chords and 0.2-1.2% of wrong ones across 26 chords and 3 mic types. Live, in the real game loop, Practice accepted only 4-6 of 9 correct strums and Stage accepted 2-4 of 11 chords when strummed continuously. I traced two causes. First, the mic is captured with a ScriptProcessor on the main thread, which the game itself blocks, so audio buffers are dropped (42 of 430 chunks in 20 s); swapping in a sample-exact capture and changing nothing else took Practice from 4/9 to 9/9 and phantom strums from 7/9 trials to 0/9. Second, the "is it new" DSP gate overrules the model whenever the previous chord is still ringing, which is every chord change in normal strumming. Feedback arrives about 1.1 s after the strum (0.8-1.6 s), and Stage timing verdicts wait on the same pipeline. Piano and drums through the mic are structurally broken while the model is loaded: piano scored 6/16 on time, drums 0/144, because their timing windows (0.35 s and 0.17 s) are shorter than the detection delay (0.55-0.65 s). Bass and vocals, which use fast autocorrelation pitch tracking, work. The band has no pitched instruments when the mic is on without headphones, which is a recognition-design consequence behind "the music sucks". Caveats: all audio was synthetic (no real guitar samples in the repo), and the machine was shared and loaded (load average 2.5-12 on 4 cores), so absolute timings are pessimistic for a fast idle desktop and roughly realistic for a phone or busy laptop.

## How it works
CAPTURE (src/40-mic.js)
- getUserMedia with echoCancellation off by default, noiseSuppression off, autoGainControl off, mono (40-mic.js:24). iOS audioSession set to play-and-record (:29).
- Two AnalyserNodes: anLong fftSize 32768 for the DSP ear, anSmall 2048 for level, flux onsets and voice pitch (:49-50).
- Mic.analyze runs once per animation frame (called from 70-ui.js:1062). It tracks a noise floor (:110-118) and spectral-flux onsets (:121-143). When the model is ready, raw onsets are discarded (:139).
- Bluetooth warning by label or sample rate <= 16 kHz (:65).

NEURAL PATH (src/46-listen.js)
- Spotify Basic Pitch on TF.js WASM (SIMD, single thread) in a Blob worker. Input is 43844 samples at 22050 Hz (1.99 s); output is 88 keys at 86.1 frames/s, note and onset posteriors (:11-13, :225-254).
- Audio reaches it through ScriptProcessor(2048) on the main thread, into a 3 s ring, stamped with ctx.currentTime at callback time (:58-59).
- Listen.tick (each frame, when the worker is free) copies about 2 s from the ring and resamples it on the main thread with a 16-tap windowed sinc that calls cos and sin per tap (:66-91), then posts to the worker.
- onResult stitches frames into a timeline keyed by round(t * FPS), keeping the frame with the most context (:119-135). reliableT = newest minus 15 frames (174 ms).
- findStrums: a peak in the sum of the top 3 onset probabilities over MIDI 38-88, needing max >= 0.45 and sum >= median + 0.6, 120 ms refractory, skipped while Mic.deafUntil (:138-151). Strums are forwarded to Mic.onsetListeners (70-ui.js:19).
- heard(t0, t1): mean note probability per key, onset max, and what was ringing before (:173-182).
- judge(): a pitch class with one string needs >= hear (0.2 / 0.25 / 0.3 for relaxed / normal / strict); duplicated pitch classes need best >= hear, and individual strings light at dup (0.5 / 0.55 / 0.6); any out-of-chord note 38-88 at >= wrong (0.55 / 0.45 / 0.38) fails it (:190-220). Calibration scales hear by hearK (0.6-1) and raises wrong to wrongMin (:192; 72-calib.js learn()).
- freshness(ts): Ear.analyze on the 32768 samples ending at ts-0.03 versus those ending at ts+0.5, then Ear.fresh (:162-171).
- Ear.fresh: a note "rose" if after >= 1.45 x before + 8% of max; needs max(2, 60% of notes) risen and total rise >= 1.4 (45-ear.js:225-240). Ear.semitones only counts a peak within +/-20 cents (45-ear.js:65).

GUITAR PRACTICE (60-game.js:219-247)
- Takes the latest strum after chordStart - 0.25. Waits until reliableT >= ts+0.3 and lastT >= ts+0.52, then re-judges heard(ts+0.04, min(ts+0.8, reliableT)) every 50 ms of new data. Success = judge.ok and freshness.ok.

GUITAR STAGE (60-game.js:358-404, 454-515)
- onStrum(t - Settings.latency, default 80 ms) assigns timing to the nearest unjudged chord within +/-0.3 s: perfect 70 ms, great 130, good 220, ok 300 (:501-513).
- One look per chord: t0 = onset + 0.04, t1 = min(t0 + 0.55, next - 0.02); judge plus freshness(t0 - 0.04); freshness failure forces a miss (:370-387).
- A chord is marked MISS if no strum arrives by ev.t + 0.3 + max(0.3, model lag) + 0.1 (:402).

FALLBACK WITHOUT THE MODEL
- Ear.matchTarget on the 0.68-0.74 s FFT every third frame, plus Ear.fresh, needing 3 ok frames within 1.3 s in Practice (60-game.js:249-281) and earOk >= 2 in Stage (:425-453).
- Model init starts 300 ms after boot (70-ui.js:20) with a 30 s timeout (46-listen.js:34); on failure the game silently uses this path.

OTHER INSTRUMENTS
- Bass: McLeod autocorrelation on the last ~127 ms, decimated x4, 38-420 Hz; octave-free, within 60 cents, two ok frames, up to 0.28 s late (63-band.js:95-136).
- Piano: MIDI held keys, else Listen.now() (mean note probability >= 0.4 over the last 0.35 s before reliableT, 46-listen.js:222); all pitch classes (all but one of four or more), at most one stray, within 0.35 s (63-band.js:126-136).
- Drums: keyboard, pads, MIDI, or Mic.onsetListeners with Calib.classify (spectral centroid and share below 150 Hz); hit window +/-0.17 s, auto-miss at 0.17 s (63-band.js:158-181).
- Vocals: McLeod on 2048 samples, 75-1000 Hz, every second frame; octave-free, within 80 cents; score = weighted share of frames in tune (62-parts.js:73-143).
- MIDI: Web MIDI note-ons moved onto the audio clock (41-midi.js).

LEAK HANDLING
- The game's own guitar sets deafUntil to +2.45 s, or +0.4 s with headphones (30-audio.js:146).
- With the mic on and no headphones, the band drops bass and toms (30-audio.js:321, 343, 374).

MEASURED (scripts and logs in the scratch dir)
- Offline matrix (e2.json, sum_e2.js): 26 chords x 3 mics x 2 reps. Right chord accepted 52/52 on clean and laptop mics, 50/52 on a phone mic under the Stage rule. Wrong chord accepted 0.2-0.4% (clean, laptop) and 1.2% (phone). Strum detected exactly once in 184/184 clips; onset time error median +16 ms, range -77 to +27 ms.
- Robustness (e1.json, 6 chords per condition): 6/6 for nylon, bluetooth-band mic, very quiet, noisy room, +/-20 cents, strum spread 40-180 ms, upstroke, capo 2 and 5, half-step down. Weak spots: clipping 3/6, 35 cents flat 4/6, 50 cents flat 1/6, one muted middle string 4/6.
- Non-guitar sounds (e3.json): speech, claps, body knocks, snare, singing, whistling and piano all register as strums but are never accepted as a chord.
- Live (batch1.log, batch2.log, live.js, jitter2.js, spcheck.js): figures are in the problems list.
- Startup (probe.js): model ready 5.4-5.8 s after navigation, first inference 2.6-3.5 s, main-thread long tasks up to 520 ms while loading. A model look took about 200 ms at best here and 350-1500 ms under load.

## Problems

### [critical] Mic capture drops audio: ScriptProcessor on a main thread the game itself blocks
- Where: src/46-listen.js:58-59 (ScriptProcessor, currentTime stamp), :66-91 (resample on main thread, cos+sin per tap), :162-171 (two 32768-point FFTs on main thread per strum)
- Evidence: VERIFIED. spcheck.js fed a known ramp through the game's capture for 20 s: 42 of 430 chunks skipped forward by 4096 samples (93 ms), timestamp error median 12 ms / p90 46 ms / max 87 ms, callback gaps up to 180 ms; 59 model looks in that time, so roughly one drop per look. Listen.tick's resampler took 45-190 ms of main-thread wall time per look (probe.js, probe2.js, spcheck.js), longer than one 46 ms capture buffer. A/B in jitter2.js, same game, same clips: game capture accepted 4/9 right chords with phantom strums in 7/9 trials (extra strums at +0.16 to +1.3 s); sample-exact capture stub accepted 9/9 with 0/9 phantoms. batch1.log Practice: 6/9 right chords at 1x, 0/6 at 3x CPU throttle. Machine was loaded, so drop rates on an idle desktop will be lower; on a phone they will not.
- Fix: Capture in an AudioWorklet that writes a ring buffer with exact sample counters (SharedArrayBuffer when cross-origin isolated, otherwise posted 128-frame blocks batched in the worklet). Do resampling and all FFT work in the worker, with a precomputed polyphase filter. Timestamps come from the sample counter, never from currentTime at callback time. Add a permanent test that feeds a ramp and asserts zero discontinuities under 4x CPU throttle.

### [critical] Practice judges the latest strum, so one phantom or re-strum cancels a correct chord
- Where: src/60-game.js:220 (takes the last strum), :223-230; src/46-listen.js:138-151
- Evidence: VERIFIED. live.js practice with debug: every rejected right chord had 3-4 detected strums for one real strum, and the last verdict had the model satisfied on 2 of 5 (no missing or wrong notes) but freshness rise 0.41-0.50 against a required 1.4, because the 'strum' being judged was a phantom in the middle of the ringing chord. The real strum cannot be judged before ts+0.52 s plus model lag, by which time a later strum has replaced it.
- Fix: Judge every strum since the chord started and accept if any passes; never let a later onset overwrite an earlier pending one. Make success sticky: once the model has heard the chord on a fresh strum, later strums cannot revoke it.

### [critical] Stage rejects correct chords during continuous strumming (freshness gate overrules the model)
- Where: src/60-game.js:381; src/46-listen.js:162-171; src/45-ear.js:225-240
- Evidence: VERIFIED. live.js stage play=pattern (D.D.D.DU, each strum cut by the next, 100 bpm, Chord Drill G-C-D): 4/11 hits in batch1.log and 2/11 in the debug rerun. In the rerun the model's judge was ok with no missing or wrong notes on all 9 logged looks, but freshness rise was 1.27, 1.07, 1.13, 0.83, 1.05, 0.91, 1.28 on the failures (needs 1.4) and 36 and 2.8 on the two hits; popups were CHECK NOTES x7 and WRONG CHORD x2. One strum per bar with the previous chord left to decay scored 11/11. The gate compares chord-partial energy over a 0.7 s window before and after the beat, so a previous chord that is still loud and shares partials (G, C, D share most) can never rise by 1.4x.
- Fix: Stop using a long-window before/after energy ratio as a veto. Use the model's own per-note onset posteriors at the strum for 'new', and judge the note set after the change. Handle leak separately by knowing what the game is playing (see the band item). With headphones on, skip freshness entirely. Also judge more than once per chord: any strum inside the chord's span that matches should count.

### [critical] Feedback arrives about a second after the strum
- Where: src/60-game.js:223, :373-377, :402; src/46-listen.js:66-76, :132, :164
- Evidence: VERIFIED. Stage: first popup after each strum median 1.08-1.17 s, range 0.75-1.4 s at 1x; 1.28 s median at 3x throttle (batch1.log). Practice accept latency median 1.1 s (0.89-1.18); with sample-exact capture still 0.8-1.2 s (jitter2.js). At 150 bpm that is 2-3 beats late. The no-model DSP path gave 0.35-0.38 s in Stage and 0.51-0.68 s in Practice. The delay is built in: freshness needs audio to ts+0.5 s, reliableT trails by 174 ms, each look costs 200 ms or more, and looks start only on animation frames.
- Fix: Split the verdict in two. Timing: a low-latency onset detector in the worklet (spectral flux or energy) gives the hit within 30-50 ms, and the game reacts immediately (sound, animation, lane flash). Chord identity: confirm 150-300 ms later from a short, fast analysis (chroma or constant-Q template against the expected chord and its nearest confusions), with the neural model as a slower background referee that can upgrade or correct. Design the scoring UI around 'hit now, quality a moment later'.

### [critical] Piano through the mic cannot be played on time
- Where: src/63-band.js:126-136; src/46-listen.js:222
- Evidence: VERIFIED. parts.js inst=piano, correct chords on the beat at 150 bpm: 6/16; played 0.1 s early: 5/16; played 0.2 s early: 15/16 (batch2.log). The chord must appear in Listen.now(), a 0.35 s average ending at reliableT (0.55-0.65 s behind real time), within 0.35 s of the beat. Wrong chords scored 2/16 'perfect'.
- Fix: Same two-stage design as guitar: onset for timing, short-window chroma for the pitch classes, judged against the audio at the note's own time rather than 'now'. Until then, the mic piano window has to be defined on audio timestamps, not wall time.

### [critical] Drums through the mic score zero whenever the model is loaded; drum calibration learns the wrong sound
- Where: src/40-mic.js:139; src/70-ui.js:19; src/63-band.js:161, :173-180; src/72-calib.js:47-48, classify()
- Evidence: VERIFIED. parts.js inst=drums play=right: 0 hits of 144 targets with the model ready (only 17 onsets reported for 144 hits, each about 0.6 s late); with the model blocked, 83/144. With the model ready, raw flux onsets are thrown away and Mic.onsetListeners is fed only by Basic Pitch onset peaks, which need a pitched onset >= 0.45 in the guitar range and arrive after targets have auto-missed at 0.17 s. By code reading, Calib's drum training and classify() read the spectrum at callback time, i.e. about 0.6 s after the hit, so they describe the room tail, not the drum.
- Fix: Drums need their own percussive onset detector in the worklet, with band energies captured at the onset sample for kick / snare / hat classification. Never route drum hits through a pitch model.

### [major] No pitched backing when the mic is on without headphones
- Where: src/30-audio.js:321, :343, :374; src/40-mic.js:24
- Evidence: VERIFIED by code. Groove.pitchedOk() is false with the mic on and headphones unticked, so the bass line and toms are dropped and only kick, snare and hats play; echoCancellation is off by default. Measured side effects of leak: with nobody playing and band leak at gain 0.5-1, 8-39 strums were detected and every chord got a MISS or WRONG CHORD popup, but 0 were accepted. The player hears a drum loop instead of a song.
- Fix: The game knows exactly what it plays. Render the band to a reference signal and either run an adaptive echo canceller in the worklet or, more simply, mask the band's known pitches and onset times in the analysis. Offer a headphones-first path (ask once, remember), and test browser echoCancellation per device in the mic check instead of leaving it as a buried toggle.

### [major] Speech, claps, knocks and singing register as strums
- Where: src/46-listen.js:138-151
- Evidence: VERIFIED offline (e3.json): speech, claps, muted 'chk' strums, body knocks, snare, sung notes, whistling and a piano chord each produced a strum in 3/3 clips; only hi-hat and silence did not. None was accepted as a chord, but in Stage each one takes the chord's timing slot and ends in WRONG CHORD or CHECK NOTES, and in Practice it restarts judging.
- Fix: Require a strum to carry at least two guitar-range note onsets consistent with a string instrument, or score candidate strums by match to the expected chord and ignore non-matching ones for timing instead of punishing them.

### [major] Out-of-tune guitars fail silently
- Where: src/45-ear.js:65; src/46-listen.js:190-220
- Evidence: VERIFIED offline (e1.json): 35 cents flat 4/6, with the two failures coming from the DSP freshness gate while the model was satisfied; 50 cents flat 1/6, with the model reporting stray notes a semitone down. Plus or minus 20 cents was 6/6. Ear.semitones only counts a peak within +/-20 cents. The player gets 'wrong chord', not 'you are flat'.
- Fix: Estimate global tuning offset continuously from spectral peaks and re-centre the analysis on it. When the offset exceeds about 25 cents, say so and offer the tuner.

### [minor] Extension chords and added open strings are accepted as the plain chord
- Where: src/46-listen.js:190-220 (wrong-note bar 0.45; duplicated pitch classes pass on any octave)
- Evidence: VERIFIED offline (e2.json, normal mode). Clean mic: G accepted when G7 was played (2/2), C when Cadd9 (1/2), Asus4 when Dsus2 (2/2). Phone mic: Am from Fmaj7, Em from Cmaj7 and Em7, C from Am7, E from E7, A from A7 (1.2% of all wrong pairs). Near-miss fingerings accepted 2/2: C with the low E string, D with the open A, Am with the low E, G with only the three bass strings. G vs Em, A vs Am, D vs Dsus4 and F vs Fmaj7 were all rejected on clean and laptop mics.
- Fix: Per-chord confusion lists: for each target, name the specific notes that separate it from its neighbours (F in G7, B in Cmaj7, low E under C) and test those with a lower bar. Decide per mode whether a stray open bass string is a fail or a coaching hint.

### [minor] Clipped input loses notes
- Where: src/40-mic.js:187-214
- Evidence: VERIFIED offline (e1.json): hard-clipped loud strums 3/6 in Practice, 2/6 in Stage (one chord tone missing each time). The mic check measures signal-to-noise but never warns about clipping.
- Fix: Detect clipping (run of samples near full scale) in the worklet and tell the player to back off or lower input gain.

### [minor] Startup cost and wasted work
- Where: src/46-listen.js:21-47; src/70-ui.js:20, :1062
- Evidence: VERIFIED. Model ready 5.4-5.8 s after navigation; first inference 2.6-3.5 s; base64 decoding on the main thread produces long tasks up to 520 ms (probe.js). Page is 8.4 MB with about 2 MB of base64 model assets. WASM runs single-threaded (not cross-origin isolated). The model and the main-thread resampler keep running during Vocals, Bass and Drums runs, which never read them (40 strums logged in those runs; Mic.analyze is called with want=true for any running game).
- Fix: Decode and load inside the worker, from separate cacheable files. Only run the model for instruments that use it. Show a clear 'ears warming up' state and what the game is using meanwhile. If hosting allows COOP/COEP headers, enable threads.

### [minor] Default timing offset is a guess
- Where: src/05-settings.js:9; src/60-game.js:92; src/70-ui.js:737
- Evidence: By code: Stage subtracts Settings.latency (default 80 ms, calibrated value clamped to 0-300 ms) from the model's onset time. In the harness, with zero device latency, strums 80 ms after the beat scored 'perfect'. SUSPECTED: Bluetooth output (150-300 ms) and phones will read as consistently LATE until the player finds the calibration in Settings.
- Fix: Make latency calibration part of first-run mic setup (clap or strum along to 8 clicks), store it per output device, and re-prompt when the output device changes.

### [major] The existing regression tests cannot run and would not have caught any of this
- Where: HANDOFF.md:39-41; test/stagetest.js, test/realtest.js, test/t5.js, test/bgtest.js, test/leak.js
- Evidence: HANDOFF.md says the regression tests need real guitar samples that are not in the repo. The offline numbers it quotes ('practice right 10/10') match what I measured offline; the failures only appear live, under main-thread load and continuous strumming, which no test covers.
- Fix: Commit a small licensed set of real recordings (guitar, phone-mic guitar, piano, voice) plus the synthetic generator from the scratch dir. Add live-loop tests: continuous strum patterns with chord changes, 4x CPU throttle, band leak, capture-continuity ramp, and strum-to-feedback latency with a budget.

## Keep
- Basic Pitch note posteriors plus the judge() thresholds: offline, 100% of right chords and 0.2-0.4% of wrong chords on clean and laptop mics across 26 chords. The 'unique pitch class vs duplicated pitch class' rule (hear 0.25, dup 0.55, wrong 0.45 in normal mode) is load-bearing; do not retune it without the matrix.
- The guitar range limit, MIDI 38-88, in strum detection and wrong-note checks.
- Model onset timing accuracy: median +16 ms, worst -77 ms, exactly one strum per clip when the audio is intact.
- Raw mic constraints: noiseSuppression and autoGainControl off, mono, and the iOS play-and-record audio session hint.
- Robustness that already holds offline: nylon, very quiet input (rms 0.006), noisy room, +/-20 cents, slow strums up to 180 ms spread, upstrokes on the top four strings, capo and half-step-down tunings, phone and Bluetooth band-limited mics.
- Rejection of non-guitar sounds as chords: speech, claps, knocks, singing, whistling and piano were never accepted.
- The no-model fallback (Ear.matchTarget + Ear.fresh): in live runs it scored 11/11 right and 0/11 wrong in Stage and 9/9 in Practice with 0.35-0.68 s latency. It is the faster path today and a good basis for the quick-confirm stage. Not verified on real guitars.
- Bass pitch tracking (McLeod, octave-free, within 60 cents): 32/32 right on clean and phone mics, 0 accepted wrong, no false hits from band leak.
- Vocal pitch tracking and scoring (within 80 cents, octave-free): 29/32 perfect in tune; flat, tritone-off and speech all rejected.
- Per-mic profiles (noise floor, calibration results) keyed by device and interface input.
- MIDI input with event timestamps moved onto the audio clock.
- Three strictness modes and the per-string heard / missing / stray-note feedback model, which is the teaching value of the game.

## Overhaul ideas
- (M) Move capture to an AudioWorklet with sample-exact ring buffer and timestamps; move resampling and FFT work to the worker. — Verified root cause of rejected right chords and phantom strums: 4/9 became 9/9 with exact capture and nothing else changed.
- (L) Two-stage judgement: instant onset from the worklet for timing and game feel, then a fast chord confirm (150-300 ms), with the neural model as background referee. — Feedback is 0.8-1.6 s late today; a rhythm game needs the hit acknowledged within about 50 ms and the quality verdict within one beat.
- (M) Replace the before/after energy 'freshness' veto with per-note onset evidence from the model, and judge every strum within a chord's span. — The veto fails 7-9 of 11 correct chords under continuous strumming, which is how songs are played.
- (S) Never let a later strum cancel an earlier pending or successful one in Practice. — One phantom or re-strum currently throws away a correct chord.
- (L) Reference-aware leak handling: the game subtracts or masks what the band is playing, so pitched backing can play through speakers. — Today the band is drums-only without headphones, which makes the music thin and the mode feel like a metronome.
- (M) Dedicated percussive onset and classification path for drums, with features captured at the onset sample. — Mic drums score 0/144 with the model loaded and calibration learns the wrong moment.
- (M) Judge piano (and any polyphonic part) on audio timestamps with a short-window chroma check instead of a 0.35 s average of 'now'. — Mic piano is only playable about 0.2 s early.
- (S) Continuous tuning-offset estimate, with a 'you are flat, tune up' prompt and re-centred analysis. — 35-50 cents flat fails as 'wrong chord' with no explanation.
- (M) Per-chord confusion tests for the notes that separate neighbours (7ths, add9, sus, stray bass strings). — Closes the remaining false accepts without touching the general thresholds.
- (M) First-run setup that measures round-trip latency, clipping, level and echo-cancellation suitability per device. — Timing offset is a default guess and clipping goes unreported.
- (S) Load the model in the worker from cacheable files, run it only for instruments that use it, and show a clear warm-up state. — 5-6 s to ready with main-thread stalls up to 520 ms, and it burns CPU during vocals, bass and drums.
- (M) A live-loop regression suite in the repo: real recordings plus the synthetic generator, continuous strum patterns, CPU throttle, band leak, capture continuity, and a latency budget. — The current tests cannot run and only cover the offline case that already works.
