# Audit: audio

## Verdict
In a default Stage run (mic on, speakers, headphones unticked) the "band" is a quiet white-noise metronome: I recorded -32.6 dBFS RMS, spectral flatness 0.92 (1.0 is pure noise), 0.9 onsets per second, no pitched content. That is 11 dB quieter than the menu music, and nearly half its energy is a sub-60 Hz thump laptop speakers cannot reproduce. The whole Stage band is 12 one-shot drum voices (a sine or triangle plus filtered white noise) and a pure sine bass; there is no backing guitar, keys or pad in guitar mode at all. The bass only plays with "I'm wearing headphones" ticked, sits at 41-78 Hz with no harmonics (inaudible on laptop and phone speakers), and when it enters at hype level 2 loudness jumps 15 dB and the output clips (float peaks up to 1.36). Arrangement is a one-bar pattern looped unchanged, with one identical tom fill per section, no humanization, no reverb, no stereo (L/R correlation 1.000), and hype levels that only switch on more noise hits mid-bar. The menu theme is the one properly composed piece (16 bars, real voicings, a lead), but it is mixed upside down: 91% of its energy is below 250 Hz and the lead, brass and pad are buried. Every SFX is a bare sine or square beep; hit feedback is 2.2-4 kHz pips at -26 to -30 dBFS peak, and each one mutes strum detection for 200 ms. The scheduler has a 120 ms lookahead on a main-thread setInterval and silently drops late steps: 3 of 107 steps were dropped in a 20 s Stage run on a loaded machine. The root cause is architectural: speaker-to-mic leakage was solved by deleting everything pitched, instead of subtracting the band's known signal in the recognizer. The fix is a real synthesized band (FM electric piano, Karplus-Strong guitar and bass, layered drums, bus effects, section-aware arranger) plus reference-aware leak handling so it can play on speakers.

## How it works
All paths are under /home/user/strum-jam/src.

**Signal graph (30-audio.js:7-29)**
- One AudioContext with latencyHint 'interactive'.
- master (gain 0.9) -> DynamicsCompressor (-14 dB, 4:1, 3 ms attack, 150 ms release) -> destination. No limiter.
- duckBus -> master; it carries drumBus (Settings.drumVol 0.8), playerBus (0.9) and the menu music bus. It dips to 0.12 during chord previews (duck(), :156).
- clickBus (0.5) and sfxBus (0.8) go straight to master. Sfx has its own bus to master plus a tanh waveshaper used only by powerOn (36-sfx.js:12-16).
- No panner anywhere. Convolvers exist only in the guitar body IR (:85-103) and the menu reverb (35-music.js:58-61).

**Voices**
- env() is exponential attack/decay (:33); noise() is a 2 s white buffer -> one biquad -> gain (:38); tone() is one oscillator with an exponential pitch ramp over 0.6 x decay (:45).
- Kit (:54-77):
  - kick: sine 165->44 Hz, 0.38 s, plus a 12 ms highpassed noise tick.
  - snare: highpassed noise at 1300 Hz plus triangle 200->170 Hz.
  - rim, brush, clap, tamb, hat, ohat, ride, crash: filtered noise, occasionally with one oscillator.
  - tom: sine drop.
  - bass (:67-74): a single sine with an 18 ms 1.5x chirp, gain 0.62.
- Leak-safe variants (leak() at :53, when Mic.on and not headphones): kick becomes sine 48->30 Hz plus lowpassed noise at 110 Hz; snare and rim become noise only.
- Guitar (:78-154): extended Karplus-Strong per string, rendered to cached buffers, through a body-mode convolver with a short room. This is the only good-sounding voice. It is used for chord previews, the tuner, menu funk chops, SFX plucks, and the Parts comp strum.
- keyNote (:187-192): triangle plus two sines; used for the player's MIDI keys only.

**Patterns (30-audio.js:215-254)**
- P44 holds 16 styles, one bar of 16 steps each for kick, snare and hat, with velocities X=1, x=0.8, g=0.3, o=open hat.
- buildPattern() picks by time signature; all 3/4 and 6/8 styles collapse to one generic pattern each (:246-250).
- chart.song.drums can override the lanes (:251).

**Scheduler (Groove, :261-393)**
- setInterval at 25 ms, horizon currentTime + 0.12 s (:278, :292).
- timeOf(k) is the grid plus swing offsets [0, .083, .167, .083] x swing (:281-288).
- play() drops any step later than 10 ms (:324) with no catch-up.
- Song mode: crash on section starts, a one-beat descending tom fill in each section's last bar (:337-348; becomes snare hits when not pitchedOk), crash plus kick at the end.
- Hype level L is read per step:
  - L0: on-beat kick, snare, hat only (:352-356).
  - L1: full pattern.
  - L2: adds bass roots on beats 1 and 3 (:379).
  - L3: ghost hats, open hat, pickup kick, eighth-note bass root/fifth/octave (:362-366, :380-382).
  - L4: clap layered on snare, tambourine on beats, crash every 2 bars, fixed syncopated octave bass (:367-371, :383-387).
- Bass only plays if pitchedOk() (:321), meaning mic off or headphones ticked.

**How the game drives it (60-game.js)**
- Groove.start at :55 (practice loop) and :66-72 (song). Swing is 1 if the chart is swing, 0.4 for hiphop, else 0.
- bassAt looks up the current chart event; bassFor (:97-104) returns root = 28 + mod12(pc - 4), i.e. MIDI 28-39 (41-78 Hz), and which fifth.
- addHype thresholds are [0.18, 0.4, 0.62, 0.85] with 0.08 hysteresis (:106-113). setLevel (:139-144) sets Groove.level immediately, shows a popup ("BASS JOINS IN" or "MORE DRUMS") and calls Sfx.levelUp.
- Drums mode uses SILENT_KIT (30-audio.js:239). Vocals/Bass/Drums on headphones get one down-strum per chord from Parts.compFrame, scheduled from the frame loop (62-parts.js:145-152).

**Menu music (35-music.js)**
- 112 BPM, 16-bar loop in D minor / F major with real jazz voicings (:12-34).
- Four-on-the-floor sine kick, gated-noise snare, hats, square-plus-sine bass through a lowpass envelope with chromatic approach notes, Karplus-Strong funk chops, detuned-saw brass and pad, square lead with vibrato and dotted-eighth echo, noise-IR reverb (1.3 s).
- Own setInterval 25 ms / 120 ms horizon (:192-202), 8% 16th swing.
- start() always restarts from bar 0 (:205). Plays on title, play, battle, online, song, results, story (70-ui.js:1057).

**SFX (36-sfx.js)**
- About 25 effects built from T() (one oscillator) and N() (noise), plus Karplus-Strong plucks for hover, open, found.
- In-game ones call inGame(), which sets Mic.muteUntil = now + 0.2 (:28).
- The intro voice is square plus triangle through a bandpass, 75 ms per letter (73-intro.js:55-65).

**Measurement method**
- rec.js patches AudioNode.connect to tap whatever reaches ctx.destination (post-compressor) into WAV.
- an.py computes peak, RMS, crest, band energy, level change with everything under 200 Hz removed ("laptop"), spectral flatness, onsets per second, and stereo correlation.
- Scripts, WAVs and logs are in the scratch dir given as report_path.

## Problems

### [critical] Default Stage run has no music: unpitched noise drums only, very quiet
- Where: src/30-audio.js:53-58 (leak kit), :321 (pitchedOk), :374 (bass gated); src/01-head.html:1175 (headphones toggle text); src/60-game.js:142
- Evidence: Real UI run (Chord Drill G,C,D, default settings, fake mic) recorded to stage-default.wav: Mic.on=true, headphones=false, pitchedOk=false, level 0. Measured RMS -32.6 dBFS, crest 29 dB, spectral flatness 0.92 (1.0 = white noise), 0.9 onsets/s, 46% of energy below 60 Hz. The menu music measures -21.9 dBFS, so the game is 11 dB quieter than its own menu. The forced leak-mode recording (rock80-leak-levels.wav) stays at flatness 0.82-0.90 and -27.6 to -33 dBFS at every hype level L0-L4, so a player on speakers never hears a pitched band note at any hype level.
- Fix: Stop solving leakage by deleting the music. (1) Ask speakers vs headphones as a first-run step and auto-detect it (play a 2 s pitched probe and measure it at the mic). (2) On speakers, play the full band and make the recognizer reference-aware: the band signal is known, so render its chroma and onset schedule and subtract or mask those bins in Listen/Ear; also keep the band's chordal parts out of the guitar's core register. (3) Sidechain-duck pitched band parts by about 6-9 dB inside the judging window around each expected strum.

### [critical] The band has no harmonic instrument, and its bass is an inaudible sub sine
- Where: src/30-audio.js:67-74, :322-392; src/60-game.js:97-104
- Evidence: Groove.play only calls kit drums and kit.bass; nothing plays chords in guitar mode. Bass roots are MIDI 28-39 (41-78 Hz) as a pure sine. Measured for a single E1 note (sfx.wav 'bassE1'): 98.5% of energy below 60 Hz, and -25.8 dB once everything under 200 Hz is removed, so laptop and phone speakers reproduce essentially nothing. In rock L2-L4, 90-99% of energy is below 250 Hz and the laptop-filtered level drops 15-20 dB.
- Fix: Build a real rhythm section. Karplus-Strong or FM bass in E1-G2 with a 2nd/3rd harmonic layer (saturation plus a 700 Hz-1.5 kHz pick click) so it reads on small speakers. Add a chordal comp instrument chosen by style (FM electric piano, organ, muted Karplus-Strong electric, pad) with voice-led 3-4 note voicings in C4-C5. Add an optional melodic hook or lead per section.

### [major] 15 dB loudness jump and digital clipping when the bass enters
- Where: src/30-audio.js:11-14, :56, :70
- Evidence: rock80-levels.wav: L1 RMS -26.8 dBFS, L2 RMS -12.0 dBFS. Float peaks after the compressor reach 1.25 (204 samples at or above 1.0); styles1.wav peaks 1.22 (214 samples), styles2.wav 1.36 (317 samples). Cause: a sine at gain 0.62 plus a kick at 1.1 into a 4:1 compressor with a 3 ms attack and no limiter. The leak-mode run does not clip (peak 0.91).
- Fix: Proper gain staging: per-instrument buses mixed to about -14 LUFS, a glue compressor on the drum bus, kick-to-bass sidechain, then a brick-wall stage on master (fast compressor at 20:1 with 1 ms attack plus a soft-clip waveshaper). Match menu and game loudness.

### [critical] Arrangement is a one-bar loop with no development
- Where: src/30-audio.js:215-254, :337-348, :350-388
- Evidence: Code: each style is one 16-step bar repeated for the whole song (P44). The only variation is one fixed descending-tom beat at the end of each section and a crash at each start. No velocity or timing humanization exists (velocities are the three constants 1, 0.8, 0.3). No intro, breakdown, build, drop or ending beyond crash plus kick. All 3/4 and 6/8 songs share one generic pattern per metre regardless of style. Hype level changes apply mid-bar with no transition fill. 'Walking eighths' at L3 is a fixed root/root/5th/root/octave cell with no approach notes; L4 is a fixed octave map.
- Fix: A section-aware arranger: per style, 2-4 bar pattern variants for verse, chorus and bridge; a fill library of 6-8 fills per style, chosen by section boundary and hype; builds (snare roll plus riser) into choruses; drops; a stop-time bar before the final hit. Add velocity curves, plus or minus 5-10 ms micro-timing, and ghost-note probability. Quantize hype level changes to bar boundaries and announce each with a fill or stinger in key.

### [major] Drum voices are a bare oscillator plus white noise; the kick is really a tom
- Where: src/30-audio.js:33-66
- Evidence: rock L0/L1 recordings put 79-83% of energy in 120-250 Hz, because the kick's 165->44 Hz sweep takes 0.23 s (tone() ramps over 0.6 x decay), giving a 'boing' with no click or punch. Snare is a single highpassed noise burst plus an 80 ms triangle. Cymbals are highpassed white noise with no metallic partials. No reverb or room on any band drum; no panning.
- Fix: Layered recipes. Kick: sine 120->50 Hz in 40 ms plus a 3 ms click plus short saturation. Snare: two detuned body tones (180/330 Hz), bandpassed noise with separate snap and tail envelopes, a room send. Hats and cymbals: 6 inharmonic square oscillators (808 style) through bandpass and highpass, or about 40 KB of embedded short samples. Add a drum-bus compressor, saturation, a generated-IR room, and stereo placement of hats and toms.

### [major] Everything is mono and dry
- Where: src/30-audio.js:7-29; src/35-music.js:58-61
- Evidence: L/R correlation is 1.000 with zero side signal in every band recording. Menu side level is -40.9 dB relative to mid. The only stereo source in the game is the guitar-preview body IR (corr 0.75-0.80). No panner exists in the source; reverb exists only in the menu music.
- Fix: A mixer module with per-channel pan, two shared sends (short room and plate, generated IRs with early reflections and frequency-dependent decay), and a tempo-synced delay. Give instruments a stereo stage that mirrors where the characters stand.

### [major] Menu theme is mixed upside down and is one 34 s loop for every menu
- Where: src/35-music.js:76-146 (levels), :203-211 (restart), src/70-ui.js:1057
- Evidence: menu.wav: 90.8% of energy below 250 Hz, 1.6% in 1-4 kHz, crest 19 dB, -8.5 dB when under 200 Hz is removed. Code peaks: kick 0.85 and bass 0.38 against lead 0.055, brass 0.035, pad 0.012, so harmony and melody sit about 24-37 dB under the kick. The same 16 bars play on title, play, song, story, results, battle and online, and restart from bar 0 after every game.
- Fix: Keep the composition and remix it: lead and comp up 12-15 dB, kick down, bass with harmonics. Make it adaptive: stems (drums, bass, comp, lead) that add or drop per screen, a B theme for Story, short variations for results (win and lose), and a resume position instead of a restart.

### [major] Hit feedback is tiny sine pips, and each one mutes strum detection for 200 ms
- Where: src/36-sfx.js:28, :65-93; src/40-mic.js:136
- Evidence: sfx.wav peaks: perfect -25.9 dBFS, great -27.9, good -30.5, gotIt -26.6, combo -35.2, against drum peaks around -3. All are 2.2-4.4 kHz sines or squares, chosen to sit above the guitar range, with no relation to the song's key. Verified in code: every in-game effect sets Mic.muteUntil = now + 0.2, and onset detection requires now > muteUntil. Suspicion, not measured: at eighth notes at 120 BPM (250 ms apart) the reward for one strum can swallow the next strum's onset.
- Fix: Make feedback musical and in key: a hit triggers a band accent (cymbal choke, horn stab, crowd 'hey!') quantized to the grid, with a short key-aware mallet or vocal-chop stinger per grade. Remove the blanket 200 ms mute; with a reference-aware recognizer the game knows which onsets are its own.

### [major] Scheduler silently drops notes when the main thread stalls
- Where: src/30-audio.js:278, :290-294, :324; src/35-music.js:192-200; src/70-ui.js:1051; src/62-parts.js:145-152 (comp strum scheduled from the frame loop)
- Evidence: sched.js on this machine (load average about 7, headless; treat as a stress case): during a real Stage run the 25 ms timer had median 44 ms, p99 217 ms, max 282 ms, with 15 gaps over 120 ms, and 3 of 107 groove steps were dropped. stall.wav: a forced 400 ms block produced 430 ms and 720 ms holes; a 1 s block produced a 1160 ms hole. Dropped steps are skipped, not caught up. Only Stage auto-pauses on tab hide; Practice and the menu keep relying on throttled timers (not tested in a real hidden tab).
- Fix: One shared transport. Run the scheduling tick from an AudioWorklet or a Worker timer, with a 300-400 ms lookahead for band parts (they are deterministic) and a short path only for player-triggered sounds. On an underrun, re-sync to the next bar instead of dropping silently. Pause or fade on visibilitychange in every mode. Move heavy recognition work off the main thread.

### [major] Hype levels are barely audible as musical change
- Where: src/30-audio.js:352-371; src/60-game.js:106-113, :139-144
- Evidence: On speakers, levels 2 and 3 are both labelled 'MORE DRUMS' and add only ghost hats, an open hat and a pickup kick (leak run: 2.0 -> 3.0 -> 4.1 onsets/s, RMS within 3 dB, flatness unchanged around 0.9). On headphones the only new timbre across five levels is the sine bass; L4 adds a clap and tambourine. Level 0, where beginners spend most of their time (the run above stayed at hype 0), is kick, snare and hat on the beat only.
- Fix: Tie hype to arrangement layers that are obvious on any speaker: L0 drums plus bass; L1 adds comp; L2 adds a second rhythm part or percussion; L3 adds a horn or lead hook and crowd claps on 2 and 4; L4 adds a key-change-style lift, doubled chorus, crowd singing 'whoa' and a cymbal wash. Losing hype should strip layers with a filter sweep, not just thin the hats.

### [major] Song style has almost no sonic identity
- Where: src/30-audio.js:215-232
- Evidence: Sixteen styles share the same kit timbres, the same bass sine and the same fill; only the kick/snare/hat step strings differ, plus one substitute voice (rim, clap, brush, tamb, ride). At L3 the style recordings are spectrally near-identical: 60-120 Hz holds 41-78% of energy in every style. 'Metal' is 16th-note sine kicks (13.9 onsets/s) with no guitar.
- Fix: Style packs: each style defines a kit variant (tuning, decay, room), bass articulation, comp instrument and rhythm, tempo-feel and swing map, fill set and ending. Start with 6 well-made packs (rock, pop/funk, ballad, country/folk, shuffle/blues, reggae/bossa) and map the other styles onto them.

## Keep
- The Karplus-Strong guitar (src/30-audio.js:78-154): tuned with an all-pass fractional delay, pluck-position comb, body-mode convolver IR, cached buffers. It is the only voice that sounds like an instrument (and the only stereo one); reuse the engine for band guitar and bass.
- Sample-accurate scheduling on the AudioContext clock with Groove.timeOf/beatAt as the single time base for judging and animation, plus smoothNow() for drawing (src/30-audio.js:285-289, :202-208). Keep the model, harden the tick.
- Groove.plan()/events() exposing upcoming hits so characters can wind up before a hit (src/30-audio.js:296-319). The new band should publish the same look-ahead event stream for every instrument.
- The menu theme's composition: chord voicings, bass approach notes, lead melody (src/35-music.js:12-51). Keep the notes; replace the mix and timbres.
- The bus split: playerBus separate from the band so Online takes record only the player; duckBus dipping the music under chord previews; a separate click bus (src/30-audio.js:16-26, :156-160).
- Leak awareness as a concept (leak(), pitchedOk(), Mic.deafUntil after the game's own guitar): the constraint is real and note recognition must not regress. Change the remedy, not the awareness.
- iOS context wake-up handling (src/30-audio.js:20-24) and per-song drum overrides via chart.song.drums (src/30-audio.js:251).
- Swing implemented as a grid warp in timeOf, so judging and audio agree (src/30-audio.js:281-288).

## Overhaul ideas
- (L) Speaker-safe full band: first-run speakers/headphones choice with an automatic probe, a reference-aware recognizer mask (the band's known chroma and onset schedule fed to Listen/Ear), and sidechain ducking of pitched parts inside judging windows. — This removes the root cause. Today every pitched sound is deleted for speaker players, who are the default and the majority. Without it, any new band is headphones-only.
- (S) Mixer and master chain: per-instrument channel strips (gain, pan, EQ, two sends), drum-bus glue compressor and saturation, kick-to-bass sidechain, generated room and plate IRs (early reflections plus filtered decaying noise), tempo-synced delay, master limiter plus soft clip, a loudness target shared by menu and game. — Fixes the measured clipping, the 15 dB jump, the mono/dry sound and the 11 dB menu-to-game mismatch in one module. Cheap, and audible immediately.
- (M) New drum kit: layered synthesis recipes (click + body + noise with separate envelopes, inharmonic-oscillator cymbals), or a roughly 40-80 KB embedded one-shot set (kick, snare, 2 hats, crash, ride, 3 toms, clap as short mono base64), with velocity layers done by filter and envelope, plus per-style tuning. — Drums are the only thing every player hears now and they are white-noise bursts. The build is already 7.9 MB, so 80 KB of samples is negligible.
- (M) Bass and comp instruments in pure synthesis: Karplus-Strong or FM bass with a harmonic layer; 2-operator FM electric piano (1:1 body plus 14:1 tine, velocity-scaled index, tremolo, chorus); muted Karplus-Strong electric guitar chops through the existing body or amp IR; drawbar organ; simple pad. Voice-led 3-4 note voicings from the chart's chords. — Gives the band harmony and a low end audible on laptop speakers. Reuses the existing string model.
- (L) Section-aware arranger: style packs with verse/chorus/bridge pattern variants, a fill library, builds into choruses, drops, stop-time endings, bar-quantized hype layers (L0 drums+bass up to L4 full band with hook and crowd), humanized velocity and micro-timing. — Turns a one-bar loop into a song with an arc, and makes hype something the player hears and wants. This is the biggest 'gameplay feels alive' lever on the audio side.
- (M) Robust transport: one scheduler in an AudioWorklet or Worker, 300-400 ms lookahead for deterministic parts, bar re-sync on underrun, pause or fade on visibilitychange in all modes, comp scheduling moved out of the frame loop. — Dropped steps were measured under load. A rhythm game whose backing drops beats on a slow phone is broken at the core.
- (M) Musical feedback and WarioWare-style stingers: in-key hit accents quantized to the grid, call-and-response 'hey!' from the crowd, a 1-2 bar jingle per event (level up, combo, section clear, fail, results rank) with a signature instrument such as marimba, slap bass, whistle or kazoo-like formant lead; UI sounds as a pitched family that follows the menu key. — Current rewards are -26 dB sine pips. Rhythm Heaven's charm comes from feedback that is part of the music. Also lets the blanket 200 ms onset mute be removed.
- (S) Adaptive menu and meta music: remix the existing theme (melody forward), split it into stems that change per screen, add a Story theme, win and lose result cues, per-venue ambience (crowd bed, room tone), and resume instead of restart. — The one decent composition is inaudible on laptop speakers and repeats every 34 s on every screen.
- (S) Automated audio regression harness: keep rec.js and an.py as tests that render each style and level and assert a loudness window, no samples at or above 1.0, at least 15% of energy above 250 Hz, stereo side level above a floor, and zero dropped steps under a simulated 300 ms stall. — These failures were all measurable in minutes and none were caught; the owner judges by ear and the team needs numbers.
