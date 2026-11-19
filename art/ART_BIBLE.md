# STRUM JAM: ART BIBLE FOR THE 3D REBUILD (v1.0, final merge)

Status: this is the merged direction from three proposals (silhouette, culture, motion) and the critic's review. Nothing here has been modelled yet. The numbers are the build targets; the tests in section 12 must be passed before any character is called final. Calls that belong to the owner are listed in section 13 with the default this bible builds to.

---

## 0. THE BAND IN ONE PAGE

**Band name:** STRUM JAM. The game title is the band.
**Logline:** Five neighbours from one block, five music scenes that should not fit together, one rehearsal room above a record shop called Side B. They get loud when you play in time.
**Tagline:** "Five scenes. One block. Loud."

| Role | Name | Shape | Owned colour | Total height | Moves on | Flaw (played straight) |
|---|---|---|---|---|---|---|
| Guitar (hero) | **Riff** | diagonal Z | teal `#2EC4B6` | 1.80 m | beats 1 and 3 | vain: checks himself in the guitar lacquer |
| Drums | **Pocket** | circle | gold on black `#FFC93C`, spot pink `#FF4FA0` | 1.72 m standing (afro top) | everything, constantly | ego about the moustache |
| Bass | **Bo** | tall column | grape `#7B5CF0` (sun-yellow bass) | 2.40 m with hat | the off-beats, a hair behind | tone snob: quietly turns everyone else down |
| Keys | **Tofu** | cube | mint `#8FE3A0` | 1.22 m (1.56 m on her crate) | eighth notes | frightening: zero patience for rushing |
| Vocals | **Mimi** | tapered capsule (a microphone) | vermilion `#FF5226`, accent cobalt `#2F6BFF` | 1.98 m | once per phrase | when her voice cracks it is the mic's fault |
| Mascot | **Pip** | triangle (a pick) | coral `#FF5E7E` | 0.50 m | the player's hits | gets dizzy, over-celebrates |

Why "Mimi": the singer could not stay "Lulu" (a WarioWare character) and "Honey" plus a hive plus yellow reads as a real pop star's fan brand. "Mi-mi-mi" is the vocal warm-up, and *mimi* is Japanese for "ear", which is what the game does: it listens. All names need a trademark and store search before printing.

**Band mark (not a lightning bolt):** "the Needle Drop". A coral pick, point down, touching the rim of an ink record with a cream label. The pick is Pip, the record is Pocket's riser, Side B's stock and the menu's vinyl. One-colour version: the pick inside a ring. The diagonal used for wipes, dividers and hype segments is 20 degrees (Riff's lean).

**Shared-world rule:** everything on stage came from the block: Bo built the speaker stacks, Tofu owns Side B and the crate she stands on, Pocket's riser is a giant record, Riff's amp is a busker amp, Mimi's mic stand is from the karaoke bar where she works nights.

---

## 1. STYLE RULES (every asset obeys these)

### 1.1 Proportion family
- Stylised humans between 2.25 and 5.7 heads tall. Heads are big, hands are big (0.40 to 0.50 head long), feet are big, necks are thin, torsos are simple primitives. No realistic anatomy: no collarbones, no knee caps, no fingernails except where specified.
- Each character is ONE dominant primitive (Z, circle, column, cube, tapered capsule, triangle). If a pose loses the primitive, the pose is wrong.
- Limbs are tapered capsules with real elbows and knees (never stick figures, never noodles). Minimum limb thickness 0.07 m so the hull outline does not swallow it at phone size.
- Nothing smaller than 4% of the character's height exists as geometry unless it is on the face decal. When in doubt, delete the accessory.

### 1.2 Line
- Ink is `#1E1B2E`, never pure black.
- Outer line: inverted hull, constant in screen space where the engine allows, 1.6% of the character's on-screen height, floor 2 px, ceiling 6 px. A 190 px character has a 3 px line.
- Inner lines only where one part overlaps another (jacket over tee, hand over guitar, lens rim): 60% of the outer weight, made with a second small hull per part or a bevel edge in ink vertex colour. No hatching, no wrinkle lines, no crease lines.
- Hull normals are smoothed and stored separately from shading normals so hard-edged shapes (Tofu's cube, Riff's hair slab) do not split their outline at corners.
- Sets: ink hull only on hero props (instruments, amps, crate, riser, mic stand, signs the eye must read). Everything else uses a dark bevel edge in vertex colour.

### 1.3 Colour
- Every material is one flat base colour plus exactly one shadow tone. Both are listed for every piece below. No gradients, no ambient occlusion, no painted textures. Vertex colours only. The single texture per character is the face decal.
- One owned colour per member (table above). That colour is at least 30% of the member's visible area and is reused for the HUD badge, the crowd's penlights and fans, the member stamp, and the flight-case stencil. No other member wears it as a block.
- Maximum five colour blocks per character including skin and hair.
- "Black" clothes are `#24222B` or `#3A3552`, never ink, so the outline still reads on them.
- Skin tones are all different and all natural. Hair colours are natural or bleached (no blue, green or teal hair on anyone).
- The fretboard finger colours (index teal, middle amber, ring coral, little finger grape) are a HUD language. Member colours never appear inside the fretboard HUD.

### 1.4 Shading and light
- Two tones with a hard terminator. The shadow terminator is driven by one key direction per venue (camera left, 35 degrees up, by default) and quantised: no soft falloff.
- Venue lights never change a character's flat colours. A venue may tint the shadow tone by at most 25% toward its fill colour and sets the rim colour.
- Rim light: optional thin hard band on the side away from the key, in the venue's rim colour; switched on from hype level 3, always on at arena.
- Hard specular blob (one fixed-shape cream or white shape that slides, never a soft highlight): only on gold, lenses, satin lapels, cymbals, patent leather, guitar lacquer and Mimi's vinyl boots.
- Contact shadows are flat ink ellipses at 35% opacity. Light beams are unlit translucent cone meshes; pools are discs on the floor.
- Port rule: the look must survive with no custom shader (flat vertex colour + hull + drawn light). Rim and specular are extras.

### 1.5 Faces (2D ink on a live canvas, projected)
- Each head has a low-curvature face plate (at most 70 degrees of curvature across it). The decal is projected from the front and may cheat up to 25 degrees toward the camera. Past 50 degrees of head turn switch to the three-quarter parts set; past 80 degrees to profile.
- Faces are assembled from a finite parts list per character (about 8 eye states, 8 mouths, 4 brow sets, 3 specials) so the same art exports as a sprite atlas (8 x 8 cells, 128 px each) for iOS and Roblox.
- Line weights on the face match the body's inner line. Eyes are always visible: no fringe, brim or lens ever hides both eyes with nothing drawn in their place (Pocket's brows above the visor and Tofu's eyes on her lenses are the two designed exceptions).
- Mouth interiors are `#5A0F1E`, teeth are one cream bar (no individual teeth, except Pocket's grill dividers), tongues are coral `#FF5E7E`.
- Expressions change on beats and hold. Blinks are 2 frames. No tweening between face states: at most one in-between ("anticipation") frame.
- Only two sculpted facial features exist in the whole cast: Pocket's bulb nose and moustache, and Bo's wedge nose and goatee. Everything else is drawn.

### 1.6 Motion
- Stepped, pose to pose. Bodies animate on twos at 24 fps equivalent; holds of 4 to 12 frames; snaps of 1 to 2 frames with a smear. Never a linear in-between.
- Smears are swap-in meshes shown for 1 to 2 frames (fans of ghost hands, arcs, rings), in the moving part's colour.
- Follow-through lives in spring chains (hair, chains, cables, tie). Every silhouette must read with all springs frozen in their default shape.
- No bone scaling and no blend shapes, ever. Squash, hair growth and coat ripples are bone translation (telescoping pieces), bone rotation or mesh swap.
- Each member moves on a different subdivision (table above). On any game event one character reacts big (the player's part first), one bandmate reacts small, everyone else holds.
- The hair is the hype meter: every member's hair or hat changes with hype level 0 to 4, so the band's skyline tells the state of the gig on a phone.

### 1.7 Forbidden
Gradients, soft shadows, painted textures, normal maps, realistic cloth simulation, wrinkles, thin or tapering outlines, floaty tweened motion, bone scale, coloured afros, star-shaped lenses, fringes over eyes, blank or black-hole eyes, tongue-out faces on Pocket, noodle limbs, real brand logos, alcohol or smoking props, lightning-bolt glyphs as branding, anything that needs a custom shader to be readable, cardboard-flat scenery (sets are volumetric).

---

## 2. SHARED RIG AND BUDGETS

**Units:** metres, Y up, characters face +Z, origin between the feet on the floor.

**Skeleton (one for all five humans, bone lengths per character):** root, hips, spine, chest, neck, head; per side: shoulder, upperarm, forearm, hand, thumb (2), index (2), middle (2), ring (2), little (2); thigh, shin, foot, toe. 53 deform bones before extras.

**Hands decision (resolves the critic's open item):** the skeleton always carries a thumb and four finger chains. Riff, Bo and Tofu (the three whose hands teach fingering) are modelled with a thumb and four fingers. Pocket and Mimi are modelled with a thumb and three fat fingers; their little-finger bones carry no weights. For Roblox R15 all fingers collapse to a mitten.

**Extras (optional springs, all bakeable):** listed per character. Hard cap 24 extra bones per character.

**Budgets (triangles, body including hull LOD0 / instrument):** Riff 13k / 2.2k. Pocket 13k / kit 6k. Bo 9k / 1.8k. Tofu 8k / keyboard, stand, crate 3k. Mimi 11k / mic, stand 0.6k. Pip 2.5k. Four vertex influences, at most four materials (flat, specular, face decal, hull). LODs at 100%, 45%, 15%.

**Stage constants:** see section 10.1.

---

## 3. RIFF (guitar, the hero)

**Hook:** a teal bomber, an ink slab of hair with an orange top leaning one way and an orange guitar stabbing the other, and a three-dot chord tattooed in freckles under one eye. The only diagonal in the band, and he knows it.

**Personality:** self-taught busker from the pavement outside Side B. Unbothered until the count-in, then all in. Teaches by showing off slowly. Looks at the player, not the fretboard, because Riff is the player's stand-in. Flaw: vanity. He checks his hair in the guitar's lacquer, and a miss is funny because it ruins the pose. Chews a cream pick (never coral: coral picks are Pip).

### 3.1 Modelling brief

**Height:** 1.80 m to the hair's high step; 3.5 heads to the skull top. Head 0.45 m tall.

**Landmarks from the floor (m):** sole 0.04, shoe top 0.19, knee 0.36, crotch 0.60, jacket hem 0.66, shoulders and chin 1.13, skull top 1.58, hair low step 1.72, hair high step 1.80.

**Widths and thicknesses:** shoulders 0.68 in the jacket (1.5 heads), hips 0.34, waist hidden. Thigh 0.11 diameter tapering to knee 0.095, calf 0.09, ankle 0.075 (bare ankle shows for 0.07 m). Upper arm 0.09, forearm 0.085 tapering to wrist 0.07. Hands 0.19 long, 0.13 wide (thumb + four fingers). Shoes 0.40 long, 0.17 wide, 0.19 tall: the biggest feet in the band. Neck 0.10 diameter, 0.05 visible.

**Forms:**
- Head: loft of 7 rings shaped as a soft guitar pick seen from the front (Pip's shape hidden in the hero): 0.50 wide at the temples, 0.45 tall, 0.42 deep, narrowing to a rounded chin of radius 0.07. Face plate flattened. Ears: half discs 0.07, set low. Nose: none in geometry (one ink tick on the decal).
- Torso: loft, inverted trapezoid 0.56 wide at the chest, 0.32 at the waist, 0.26 deep. Tee is the torso surface.
- Jacket: shell offset 0.025 from the torso, cropped, boxy, drop shoulders, open 0.14 at the front. Ribbed stand collar as a 0.09 tall half torus, popped to the earlobes. Sleeves pushed to just below the elbow, ending in a fat cuff torus (0.11 diameter tube), bare forearms.
- Chest yoke: a pick-shaped cream panel across the tee from shoulder seam to shoulder seam, point at the bottom of the sternum (gives the torso a centre line so turns read at phone size). Vertex colour only.
- Trousers: tapered loft, cropped 0.07 above the ankle.
- Shoes: extruded side outline (0.40 x 0.19), 0.17 wide, 0.02 bevel, 0.04 sole as a separate colour band.

**Hair, explicit chunks:**
1. *Undercut cap:* shell 0.012 over the skull from the hairline to the ear tops and round the back. `#3A3552` / `#2B2740`. It must stay visible on both sides below the slab or the slab reads as a hat.
2. *The Slab:* one extruded 2D outline, 0.36 deep, 0.02 hard bevel. It is flat-topped, wider than it is tall (0.66 wide, 0.24 tall), with near-parallel sides and one right-angle step in the top edge. It never converges to a point. Front outline in metres, origin at the centre of the hairline, +x toward the fretting hand, +y up:
 `(-0.32, 0.00) (-0.36, 0.22) (0.06, 0.24) (0.06, 0.15) (0.30, 0.16) (0.28, 0.00)`.
 The whole slab leans 8 degrees toward the strumming side (away from the guitar neck) and overhangs the forehead 0.04 as a blunt fringe that stops 0.03 above the brows.
 Colour: sides `#2B2740` / `#1E1B2E`; the top planes and a 0.04 band down the front edge ("the dip") tangerine `#FF8A1F` / `#D9641A`. Orange is under 8% of his area in the hair, so he is not an orange-and-teal character.
3. *Hype plates:* the high step is four nested plates, each 0.05 tall, that telescope up one per hype level (high step at 1.80 m at level 0, 2.00 m at level 4), like a level meter. Each new plate shows a fresh orange edge. Still flat-topped at every level.
Rig: 1 wobble bone at the slab root (jelly lag), 4 plate sliders.

**Outfit and colours (base / shadow):**
- Bomber: teal `#2EC4B6` / `#1F9A90`. Collar, hem band, cuffs `#3A3552` / `#2B2740`. Cream zip line. On the back: the Needle Drop mark as a cream patch 0.22 across.
- Tee and yoke: paper `#FFF7E6` / `#D8D0EC`.
- Trousers: `#3A3552` / `#2B2740`. Socks: paper with two teal bands.
- High-tops: paper body, teal toe cap and heel tab, tangerine sole `#FF8A1F` / `#D9641A`.
- Sweatband on the strumming wrist only: sun `#FFCE3A` / `#E0A82A`, 0.07 wide. It is the eye magnet for the strum.
- Strap: 0.08 wide, paper with six ink squares, from strumming-side hip to fretting-side shoulder.
- One coral pick-shaped earring (0.06) on the fretting-side ear, 1 spring bone.
- Fretting-hand fingernails in the HUD finger colours: index teal `#2EC4B6`, middle amber `#FFB020`, ring coral `#FF5E7E`, little finger grape `#7B5CF0`. His hand is the legend for the fretboard diagram. Nails are 0.02 flat quads, visible only in close-ups and the tutorial.
- Skin: `#E3A26B` / `#C07E50`.
- Area: teal 34%, dark 26%, paper 16%, orange 12% (guitar, soles, hair dip), skin and sun 12%.

**Face spec (the signature that survives with the hair removed):**
- *Eyes, permanently asymmetric:* two D shapes, flat side up, 0.12 tall and 0.095 wide, centres 0.19 apart, tilted 6 degrees down at the outer corners. The strumming-side eye is always two-thirds open under a double-weight flat lid; the fretting-side eye is fully open and 10% larger. Paper whites, a thin teal iris ring, and **pick-shaped ink pupils** (rounded triangle, point down, 50% of eye height) with one square paper highlight. The pick pupils are his trademark: nobody else in the cast has shaped pupils.
- *The chord:* three ink dots (0.012 each) under the wide eye arranged as a D-chord fingering (a small triangle, point down). This is the mark fans draw.
- *Brows:* thick ink parallelograms, 0.10 long, drawn below the fringe; the strumming-side brow has a shaved slit.
- *Mouth:* off-centre diagonal dash hooked up on the fretting side. The cream pick juts from the low corner when idle. Open mouth is a lopsided trapezoid with one cream tooth bar.
- *Default:* half-lid on one side, wide eye on the other, hooked smirk, pick in the corner.
- *Named expressions:*
 1. **Smirk** (default).
 2. **Locked in:** both lids flat and level, pupils down-left at the neck, mouth a short straight dash; the pick is gone.
 3. **Grin:** eyes become upward crescents, wide wedge mouth with the tooth bar.
 4. **Yell:** tall rounded trapezoid mouth with tongue, brows up into the fringe, pupils shrink 30%.
 5. **Flinch (miss):** eyes become `> <`, mouth a small zigzag, the chord dots jump 0.01.
 6. **Flat (second miss):** eyes two flat lines, mouth a flat line, one sweat drop.
 7. **Mirror check (vanity):** eyes slide down to the guitar body, one brow up, lips pursed to a dot.
 8. **To camera:** both pupils straight at the lens, wide eye winks.
 9. **Awe (level-up):** pupils become small picks with two highlights, mouth a small o.
 10. **Sheepish (lose):** one eye closed, crooked grin, brows tilted up in the middle.

**Instrument: "The Offcut"** (original outline). Total length 1.08 m.
- Body: extruded 2D outline 0.42 long, 0.35 wide, 0.055 thick, 0.012 soft bevel. An offset teardrop with a round belly and ONE long upper horn on the neck side; no lower horn. Lacquer tangerine `#FF8A1F` / `#D9641A` with one cream specular blob.
- Pick-shaped paper pickguard, two ink soapbar pickups (0.09 x 0.035), two sun-yellow knobs (0.045 diameter), ink bridge block.
- Neck 0.47 long, 0.075 wide (30% chunkier than real), maple `#F2D6A2` / `#D4B27A`; fretboard `#5A3825` with 7 cream fret bars and cream dots at frets 3, 5, 7. Three cream string strips at LOD0, none below.
- Headstock 0.23 x 0.13: tangerine with a cream plate, six chunky ink pegs in a line, tip cut at 20 degrees. It is the HUD guitar's headstock, so the UI neck is visibly Riff's guitar; the cream plate can show the current chord in close-ups.
- Cable: coral coil `#FF5E7E`, 9 coils, 5-bone spring chain, to a small busker amp (0.50 x 0.45 x 0.28, `#3A3552` with a paper grille and a sun-yellow stomp box 0.20 x 0.12 beside it). Pip sits on this amp.
- Hold: slung low, body centre at hip height (0.70 m), neck 27 degrees above horizontal, headstock at shoulder height, thumb over the neck. Lefty mode mirrors the whole character.

**Spring chains:** slab wobble (1), plate sliders (4, driven not physical), earring (1), cable (5), strap tail (1). Total 12.

### 3.2 Motion brief
- **Rule:** Riff never stands up straight. Rest pose is "the Lean": feet 0.85 apart, knees slightly in, weight on the back foot, hips forward, torso back 12 degrees, head tilted 6 degrees toward the neck. Hair, guitar and legs make a Z.
- **Idle:** bounces on the heels on 1 and 3; rolls the pick across his knuckles; every 8 bars flips it past the hair and catches it without looking; every 16 bars the mirror check (tilts the guitar, fixes the slab with a flat palm). Blows the fringe off the brow.
- **Groove levels:** L1 heel bounce only, head nod against the strum. L2 knees drop on 1 and 3, shoulders roll. L3 a side-step per bar, the slab wobbling a beat late, cable bouncing. L4 the full Lean rocking front to back foot, a lunge on every downbeat, jacket hem flapping.
- **Playing:** strums when the player strums. Down and up strokes are two held poses with a 2-frame forearm smear between (a teal wedge with three ghost hands and the sun sweatband streak), 0.26 m of travel from the elbow, a 4 degree recoil of the whole Z. Chord changes snap the fretting hand in 2 frames with a small star on the neck and a nod. In the tutorial the fretting hand holds real chord shapes with the coloured nails to camera.
- **PERFECT:** "the Kickstand": 1-frame snap to a 35 degree back lean, headstock to the sky, front leg straight out, held 6 frames; the slab lags and cracks forward; a coral spark off the pick. On a 10 streak, a knee slide toward camera.
- **Miss (escalating):** first miss, a broken-string curl springs up from the bridge, the top hype plate drops with a clack, flinch face, the pick pops out of his hand and is caught on the next beat. Second miss in a row, the jacket slides off one shoulder and he gets the flat face. Third, he looks at the camera, sheepish, and shrugs it back on.
- **Level-up gag:** stomps the yellow pedal, ink speed lines converge on the amp, the next hair plate clicks up, the coil cable goes ruler-straight for 3 frames and boings back.
- **Intro pose:** walks on backwards waving at the crowd, trips on the cable, lands in the Lean as if he meant it, mirror check.
- **Results:** win, the Kickstand held with Pip landing on the headstock; lose, sitting on the amp with the guitar across his knees, sheepish face, blowing the fringe up.
- **Signature smear, "the Zag":** a 3-frame lunge that folds the body into a Z, strum arm smeared into a three-hand fan with a coral arc from the pick. It is the logo pose and the app's splash.

---

## 4. POCKET (drums, the owner's drummer, kept and pushed)

**Hook:** the biggest afro in show business, one pink visor, a gold grin, in a tuxedo. A disco ball of a man who never stops moving. "In the pocket" is the highest praise a drummer gets, and he never plays without his pocket square.

**Personality:** the veteran showman who has played every room in town twice and founded the band. Warm, loud laugh, plays to the back row on a street corner. Flaw: ego about the moustache; he combs it mid-song and is hurt if it is not noticed. He does not call people "baby". Tofu calls him "kid".

Everything the owner designed stays: afro, gold headband with a pink star, pink one-piece shades with black rims, bulb nose, handlebar moustache, gold grill, black suit with satin lapels and a white pocket square, white shirt, black tie, gold chains with a medallion, gold hoops and ring. Nothing he removed returns (no fur collar, no black shirt collar). Never a coloured afro. Never star-shaped lenses: the star lives on the headband only.

### 4.1 Modelling brief

**Height:** 2.4 heads to the skull top. Head 0.50 m tall, 0.52 wide. Skull top 1.20 m, afro top 1.72 m. Round and short, never hulking.

**Landmarks (m):** shoe top 0.10, crotch 0.34 (legs 28% of body height), belt 0.48, shoulders 0.96, chin 0.72 (the head sits down into the shoulders, no visible neck), skull top 1.20.

**Widths:** shoulders 1.00 in the padded jacket (2 heads), barrel torso 0.80 wide and 0.62 deep at the belly. Arms long for his height (upper arm 0.30, forearm 0.30, 0.12 thick) so he reaches the crash. Hands 0.23 long (the biggest relative to body; thumb + three fat fingers). Thighs 0.17, shins 0.14, shoes 0.34 long.

**Forms:**
- Head: wide potato oval loft, big jaw, flat face plate on the lower two thirds.
- Afro: an ellipsoid core 1.24 wide, 1.14 tall, 1.10 deep, centred 0.14 above the ear line, merged with 14 rim lobes (spheres of radius 0.15) and 10 top and front lobes so the outline is scalloped. `#2A1712` / `#1A0E0A`. Nine raised C-shaped curl patches in `#5A3424` as vertex colour.
- Headband: a gold band 0.06 wide, low across the afro at brow height, tilted 8 degrees, with nine cream studs and an extruded five-point star 0.11 across in hot pink at the front, on its own bone so it can spin.
- Shades: ONE continuous lens (two rounds of radius 0.10 plus a bridge, extruded 0.015 and bent to the head). Lens `#FF4FA0` with a glint band `#FF8FC7` and a white specular blob that slides across once per bar. Rim `#15131B`, 0.014 thick. Own bone: two rotation axes plus a slide down the nose.
- Nose: a sphere 0.14 across, `#C98A5C`, with a specular dot.
- Moustache: lofted handlebar, 0.18 a side, tips curling up, `#2A1712`. Two bones a side; it acts as a second pair of eyebrows.
- Hoops: gold tori 0.07.
- Jacket: shell over the barrel, peaked lapels as a separate extruded panel, one straining button.
- Tie: flat extruded strip 0.05 wide on a 3-bone spring so it flies over his shoulder in fills.
- Chains: two tori arcs on springs; medallion a 0.10 gold disc with a pink star.
- Trousers: straight (no flares, to stay distinct from the 1970s costume read), satin side stripe.
- Shoes: black patent loafers with a gold bit and a specular blob (default). Owner's alternative from his own sheet: gold platforms with a pink sole stripe.

**Colours (base / shadow):** skin `#A8683F` / `#87502B`. Suit `#24222B` / `#121117`, lit plane accent `#3E3B4A`. Lapels `#121117` with a hard specular stripe `#5B5870`. Shirt `#FAF9FD` / `#D9D6E4`. Tie `#141219`. Pocket square white, three points. Gold `#FFC93C` / `#C98A1E`, specular `#FFF0A8` (kept slightly orange and small so it never reads as a yellow block). Hot pink `#FF4FA0` / `#D9357F`. Loafers `#26222F` / `#121117`.
Area: suit 40%, afro 28%, shirt 8%, skin 10%, gold 8%, pink 6%.

**Face spec:**
- *Brows:* thick, short, drawn ABOVE the rim so they act while the eyes are hidden. They and the moustache carry the emotion.
- *Eyes (seen only when the shades peek, slip or flip):* small round whites 0.07 across, ink dot pupils, heavy lids.
- *Mouth:* wide, under the moustache. The big grin shows the gold grill: the upper teeth as one gold bar with five ink dividers and a four-point "ting" star that flashes once. The smaller mouths show a cream tooth bar (so gold is an event, not a constant). No tongue-out faces.
- *Default:* closed-mouth smile, brows relaxed, shades up.
- *Named expressions (the existing 2D set carried over, plus two):*
 1. **Cool** (default).
 2. **Smirk:** one moustache tip up, one brow up.
 3. **Grin + ting:** grill, star glint, both brows clear the rim.
 4. **Pucker:** mouth a small ring, brows knitted (concentration in a fill).
 5. **Oh:** round mouth, shades bounce up 0.02.
 6. **Yell:** tall mouth, moustache spread flat like wings.
 7. **Grit:** tooth bar clenched, brows down into the rim.
 8. **Laugh:** head back, grill, shades hop on every "ha".
 9. **Peek:** shades slid to the nose tip, heavy-lidded eyes over the top, brows waggling (his signature).
 10. **Wince (miss):** shades slipped, eyes wide dots, moustache drooping.

**Instrument: the kit.** Layout exactly as the current game because the animation data depends on it. From the crowd's view: snare centre-left and hi-hat centre-right just above the kick, floor tom and ride on the left, crash up right.
- Kick 0.62 diameter, 0.42 deep; snare 0.38 x 0.16; floor tom 0.42 x 0.40; rack tom 0.32 x 0.24; hi-hat 0.38; crash 0.46; ride 0.52.
- Shells paper `#FFF7E6` / `#D8D0EC` with gold hoops and lugs. Heads cream `#FFF4D6`. Cymbals gold with a specular streak. Hardware chrome `#D9DDE6` / `#B7BCC8`. Kick head: the Needle Drop mark in ink with a pink star at the label.
- Sticks: maple `#F6DCA8`, 0.48 long, 1.3 times real thickness, with **hot-pink tips** so stick smears read as pink arcs on dark stages.
- Throne: round, black with gold piping, seat at 0.50.
- Riser: a giant record, 2.3 across and 0.34 high, ink with a cream label and chase bulbs on the rim. Seated, his afro top is about 2.35 above the stage floor.

**Spring chains:** afro lag and squash (3), shades (1, driven), star (1, driven), moustache (4), medallion and chains (3), tie (3), hoops (2). Total 17.

### 4.2 Motion brief
Everything in `src/52-drummer.js` carries over: the stroke (contact hold, rebound, drift, wind-up from predicted hits, strike with the elbow leading, the wrist following and the stick whipping last), looking ahead to the next hit, faces per hype level and bar, shades bouncing on kick and snare, creeping down over two bars, popping off on big crashes, fill concentration then the release face.
- **Idle:** twirls a moustache tip with the free hand; spins a stick over the knuckles in the count-in; straightens the pocket square.
- **Groove levels:** L1 shoulders tick with the hat, head still. L2 head rolls in a figure of eight, afro half a beat late. L3 the whole barrel bounces on the throne, tie starts to fly, chains swing. L4 standing hits on crashes, shades flipped up on the headband, star spinning, laugh face on the turnaround.
- **Playing:** matched grip. One hand keeps the hat, the other cracks the snare from a high wind-up, the foot works the kick. The headband star flashes paper-white on every snare. The lens specular slides across once per bar.
- **PERFECT:** the Peek with a waggle and the grill ting. On a streak, a stick toss caught on the downbeat.
- **Miss:** the wince; he pushes the shades back up with a stick.
- **Level-up gag:** pulls a fresh pair of sticks out of the afro. At level 3 he throws one stick out of frame, plays one-handed and catches it on a downbeat two bars later. At level 4 the shades flip up and the star spins.
- **Hype hair:** the afro's rim lobes slide outward 3% per level (bone translation).
- **Intro pose:** already seated, back to the crowd; spins the throne round on the count of four with sticks crossed overhead.
- **Results:** win, standing on the riser, arms wide, tie over the shoulder, grill; lose, chin on the snare, shades at the nose tip, combing the moustache with a stick for comfort.
- **Signature smear, "the Crash Stretch":** arm fully extended to the crash in a pink-tipped arc of three ghost sticks, shades leaving his face, afro stretched into an ellipse behind the head.

---

## 5. BO (bass)

**Hook:** the tallest, calmest man alive, in a puffer coat whose four fat rings ripple like a speaker cone with every bass note. If you lose the beat, look at Bo.

**Personality:** a sound engineer raised on soundsystem culture; he built the speaker stacks in every venue on the block and can hear a loose cable from the street. Says four words a night. Slow and warm (Tofu is the fast, sharp one). Written as a craftsman, never as a sleepy stereotype: his lids are calm and focused, and his eyes open sharp when he listens. Flaw: tone snobbery. He will reach over and turn your amp down mid-song without looking at you.

### 5.1 Modelling brief

**Height:** 2.40 m to the hat top; 5.7 heads to the skull top (2.28 m). Head 0.40 tall, 0.31 wide: a long oval, small for his body.

**Landmarks (m):** boot sole 0.03, ankle 0.14, coat hem 0.62, shoulders 1.80, chin 1.88, skull top 2.28, hat crown top 2.40.

**Widths:** shoulders 0.52 under the coat (narrow), coat up to 0.84 across. Neck 0.09 diameter and 0.08 long, with 0.14 of forward travel for the beat tick. Shins 0.10, boots 0.46 long and flat. Arms long: upper arm 0.44, forearm 0.42. Hands 0.20 long with long fingers (thumb + four).

**Forms:**
- Coat: FOUR fat, uneven lathed rings (not six even ones, so he is never a stack of tyres). From the top: collar ring 0.74 across and 0.20 tall, zipped to the jaw; chest ring 0.78 x 0.36; belly ring 0.84 x 0.42 (the fattest); hem ring 0.72 x 0.26. Rings overlap 0.02 with a deep ink groove between. Each ring is rigid and rides its own spine slider so the ripple is bone translation.
- Sleeves: three rings each (0.20, 0.18, 0.16 across).
- Hat: bucket hat, crown 0.22 tall and slightly tapered, brim 0.60 across sloping down 35 degrees. The under-brim is mint so the low stage camera sees his face framed in a light colour.
- Locs: five short chunky capsules (0.14 long, 0.045 thick) fanning out at the nape on 2 spring bones.
- Nose: a long wedge 0.12, geometry. Goatee: a small cone 0.05.
- Ear defenders worn round the neck: two cups (0.11) on a band.
- Legs: straight track trousers with one mint side stripe. Boots: soft moccasin boots with a crepe sole.

**Colours (base / shadow):** skin `#6B4226` / `#4A2B17`. Coat and hat grape `#7B5CF0` / `#5A3FC4`. Hat band, trousers and locs `#3A3552` / `#2B2740`. Under-brim, ear defenders and trouser stripe mint `#8FE3A0` / `#5FC47E`. Boots tan `#D9A066` / `#B47B45`, sole `#F0C987`. Goatee ink.
Area: grape 55%, dark 18%, sun-yellow bass 12%, mint 6%, skin and tan 9%.

**Face spec** (small on screen; the coat does most of the acting, and that is accepted):
- *Eyes:* horizontal capsules 0.075 wide and 0.035 tall, 0.14 apart. The upper lid is a dead-level thick ink line covering the top third: calm, not droopy. Pupils centred and steady. When he listens the lids lift clear and the pupils snap to the source.
- *Brows:* two short flat dashes parked high.
- *Mouth:* a wide thin line with a slight curl. His rare grin shows a gap between the front teeth.
- A brim-shadow band across the top third of the plate in the skin shadow tone.
- *Default:* level lids, steady pupils, the curl.
- *Named expressions:*
 1. **Level** (default).
 2. **Listening:** lids fully up, pupils to one side, head tilted, one ear toward the sound.
 3. **Approve:** lids rise 30%, one mouth corner lifts. This is him ecstatic.
 4. **The grin:** gap teeth, eyes become two short upward arcs. Once per gig.
 5. **Eyebrow:** one brow rises 2 mm. Everything else holds.
 6. **Side-eye (miss):** pupils slide to the camera for one beat, slow blink.
 7. **Fixing it:** pupils down at a knob only he can see, mouth a short straight dash.
 8. **Wide open (level 4):** full round eyes for the only time, small o mouth.
 9. **Tone snob:** one lid lower than the other, mouth corner down 1 mm, looking at someone's amp.

**Instrument: "The Sub."** Total length 1.55 m.
- Body: rounded-rectangle slab 0.58 x 0.42 x 0.05, corner radius 0.10, one shallow cutaway, and a flat base so it stands on its own beside him. Sun `#FFCE3A` / `#D9A514`: yellow on violet, the loudest contrast on stage.
- Circular pickguard 0.26 in `#3A3552` with a paper dust-cap disc, so the body reads as a woofer. Two paper knobs.
- Neck 1.00 clear of the body, 0.07 wide, ink fretboard with five paper fret bars and paper dots. 2 + 2 paddle headstock in sun with four ink disc tuners (0.08). Four FAT strings in `#CFC6E8` (the only instrument with always-visible strings); they wobble by a 2-frame mesh swap on each note.
- Strap: thin, `#3A3552`.
- Hold: neck 55 degrees above horizontal, body on the plucking-side hip, headstock above his head. Two-finger plucking with the thumb anchored on the guard; the fretting hand slides.

**Spring chains:** coat ring sliders (4, driven by notes), neck slide (1, driven by the beat), locs (2), ear-defender cups (1), hat brim (1). Total 9.

### 5.2 Motion brief
- **Rule:** Bo is a metronome made of a person. Two things mark time: the **pigeon neck** (the head slides forward 0.14 and back on every beat with zero body movement, one bone translation) and the **coat ripple** (each bass note sends one wave up the four rings, bottom to top, 2 frames a ring).
- **Idle:** still, except the neck tick at half size. Pulls the brim down with two fingers. Turns an invisible EQ knob in the air and tilts an ear to it.
- **Groove levels:** L1 neck tick only. L2 knees dip on the off-beats. L3 ripple amplitude doubles and the locs swing. L4 the whole column sways from the ankles, ear defenders on over the hat, eyes wide open.
- **Playing:** only the plucking fingers walk (2-pose cycle). The fretting hand does not travel between positions: it jumps there with a one-frame streak up the neck.
- **PERFECT:** one slow nod and "the rewind": an index finger draws a circle in the air like a selector pulling the record back, drawn as a mint ring smear. On a 10 streak, the Approve face.
- **Miss:** no flinch. The coat sags by a ring and reinflates, the neck tick double-ticks once, and his eyes slide to the camera for one beat.
- **Level-up gag:** puts the ear defenders on over the hat because it is about to get loud; the stacks behind him punch out. On later level-ups, one shockingly high knee-up stomp, then stillness.
- **Hype hat:** the brim tilts up 8 degrees per level, showing more mint and more face.
- **Intro pose:** three enormous steps from the wings, ducking under the truss, stands the bass on its flat base, and leans down to turn Riff's amp down a notch.
- **Results:** win, the rewind with the grin; lose, he takes the hat off (the only time), holds it to his chest, level face.
- **Signature smear, "the Slide":** the bass neck sweeps a 3-frame yellow arc while the four rings offset sideways like a slinky and the head leaves three after-images.

---

## 6. TOFU (keys)

**Hook:** a tiny, ancient, terrifyingly good grandma built out of three soft cubes, behind a keyboard longer than she is tall, who sips tea mid-solo.

**Personality:** a session legend who played on half the records in her own shop. She owns Side B and the rehearsal room above it, and she is the band's actual boss. "Tofu" because tofu takes the flavour of whatever it is cooked with: she can play any genre. Fast, sharp and strict where Bo is slow and warm. Calls everyone "kid", including Pocket. Flaw, played straight: she is frightening. Rush the tempo and you get the stare.

### 6.1 Modelling brief

**Height:** 1.22 m to the hair top; 2.2 heads to the skull top (1.02 m). Head 0.46 wide, 0.44 tall, 0.42 deep. On her crate her hair top is at 1.56 m.

**Landmarks (m):** sole 0.03, skirt hem 0.08, body cube 0.14 to 0.60, chin 0.60, skull top 1.02, hair top 1.22.

**Widths:** body cube 0.55 wide, 0.46 tall, 0.46 deep, corner radius 0.12. Stump legs 0.11 thick showing for 0.06. Arms short and thick (upper arm 0.17, forearm 0.17, 0.10 thick). Hands big and square, 0.21 long (thumb + four fingers). Sneakers 0.24 long, 0.14 tall.

**Forms (three stacked cubes, softened so she reads as a person, not a robot):**
- Head: rounded cube, corner radius 0.14, with soft jowls (two 0.08 bulges at the lower corners), **visible ears** (half discs 0.07 poking out below the hair) and a short visible neck (0.10 across, 0.03 tall). Button nose, a 0.035 sphere.
- Hair, "the Loaf": a rounded cube 0.66 wide, 0.40 tall, 0.56 deep, corner radius 0.11, sitting on and around the head to mid-ear. Each visible face is quilted 3 x 3 (nine shallow pillows, 0.017 relief) so the two tones draw a grid of soft squares. The top third is a separate tier on a slider.
- Glasses: two rounded-square lenses 0.27 x 0.20, ink frames 0.018 thick, 0.60 wide overall so they stick out 0.04 past the face each side. Glass `#CFF5DA` with a white diagonal specular bar. On their own bone (slide down the nose, tilt).
- Cardigan: shell over the body cube with three fat cable ridges down each front panel and three big buttons.
- Skirt: a short rounded box under the cardigan.

**Colours (base / shadow):** skin `#F6C9A8` / `#E0A58A`. Hair paper `#FFF7E6` / `#CFC6E8` (white is for the hair only). Cardigan mint `#8FE3A0` / `#5FC47E`, buttons sun `#FFCE3A`. Roll-neck under it paper. Skirt and tights `#3A3552` / `#2B2740`. Sneakers paper with mint soles. Frames ink.
Area: mint 38%, white hair 26%, dark 14%, skin 12%, paper and sun 10%. She now has a saturated body colour and holds on pale venues and the cream UI.

**Face spec:**
- *Eyes are drawn ON the lenses* (their own decal layer), so they are magnified: ink dots 0.08 across with one highlight, centred in each lens. The lenses can blank to white.
- *Brows:* small ink wedges in the 0.045 gap between the frames and the hair. They are fast and do a lot.
- *Mouth:* small and low; a flat line that curls into a tiny w.
- *Age is drawn, not sculpted:* two crow's-feet ticks at each outer lens corner, one cheek line a side.
- *Default:* dots steady, flat mouth, brows level. Not sleepy, not smiling: watching you.
- *Named expressions:*
 1. **Watching** (default).
 2. **Lens flash:** both lenses blank white with one four-point star, mouth flat. Her signature.
 3. **Teacher stare:** glasses slid down, small flat half-lidded eyes drawn on the face ABOVE the frames, straight at the camera, mouth a short line. Used on a miss.
 4. **Pleased:** the w mouth, eyes become two short upward arcs on the lenses.
 5. **Tea:** eyes closed as two flat dashes, mouth hidden by the cup.
 6. **On fire:** brows steep, dots shrink 30%, mouth a tight wedge. Fast passages.
 7. **Counting:** one brow up, dots flick to the offender (usually Riff) on each beat.
 8. **Slipped:** glasses hang crooked on the end of her nose, eyes tiny dots above the frames, mouth a small o.
 9. **Proud (rare):** lenses show two big sparkle circles, blush discs `#FF9DB0` appear, w mouth.
 10. **Welder (level 4):** lenses go solid ink with two white dots.

**Instrument: "The Slab"** and her crate.
- One stage keyboard 1.50 wide, 0.34 deep, 0.11 thick. Case paper `#FFF7E6` / `#D8D0EC`, maple end cheeks `#F0C987`, a `#3A3552` control panel with eight fat slider caps (teal, amber, coral, grape, twice) and two big sun knobs. 37 fat keys (three octaves): a cream strip with ink black-key blocks in twos and threes as geometry. Keys light in the chord colour where her hands land in Piano mode. Front panel toward the crowd carries her stamp (a mint rounded square).
- A handleless cream tea cup on the right cheek.
- Z stand in `#3A3552`; key surface at 0.98 m above the stage.
- The crate: a record crate 0.50 x 0.50 x 0.34, maple slats, record spines in the member colours. **The scarf lives here:** a fat knitted scarf in stripes of the member colours (teal, gold, grape, mint, vermilion, coral) sits coiled in the crate with her needles through it. It gains one stripe set per venue cleared and is unrolled across the results screen as the tour's progress bar. It never trails across the stage floor.
- Hold: shoulders still, hands flat and wide; the whole stack drops 0.04 on each chord.

**Spring chains:** hair tier slider (1, driven), glasses (1, driven), cup (1). Total 3. She is the cheapest character and the stillest.

### 6.2 Motion brief
- **Rule:** the body is a statue, the hands are a blur. The head ticks eighth notes.
- **Idle:** knits two stitches on the beat and drops the work in the crate; pushes the glasses up with one knuckle; reorders the records with her foot.
- **Groove levels:** L1 head ticks eighths. L2 the cube stack drops on each chord. L3 on tiptoe for the top octave, one foot tapping double time. L4 she plays one-handed with the cup in the other, little finger out, and kicks a heel onto the low keys on the downbeat.
- **Playing:** chord stabs pose to pose. Fast runs replace the hands with a 3-frame cycle of smear fans (mint arcs with finger ticks) that widen with tempo. A back-of-the-hand glissando is a paper streak along the keys. One finger held high for a full beat, dropping exactly on the downbeat.
- **PERFECT:** sips tea with one hand without dropping a note. On a streak, the lens flash and a tiny fist pump with the face unchanged.
- **Miss:** the cup rattles, the glasses slip, the hair tier sags, and she gives the teacher stare straight at the camera for two beats, then knuckles the glasses back up.
- **Level-up gag:** cracks her knuckles (ink impact marks) and the hair tier pops up like toast. At level 4 she snaps the glasses down like a welder's mask and all eight sliders slam to the top.
- **Hype hair:** the top tier rises 0.08 per level: a double-decker loaf by level 4 (top at 1.54 m, 1.88 m on the crate).
- **Intro pose:** carries her own crate on, sets it down, steps up, pours tea, raises one finger; the band does not start until it drops.
- **Results:** win, Proud face, unrolling the scarf to show the new stripes; lose, the teacher stare over the frames with the needles clicking.
- **Signature smear, "the Stab":** both hands slam down while the three cubes squash 30% like a marshmallow for 2 frames (bone translation of the three cube pieces toward each other).

---

## 7. MIMI (vocals)

**Hook:** she is shaped like the microphone she is holding. She whispers until the mic is live, then her mouth takes over half her face and the rings of her hair fan out like a slinky.

**Personality:** night attendant at the block's karaoke bar; holds the high score on every machine. Off-mic she whispers, in tiny type, and apologises to the mic stand. On-mic she is a storm front and a full diva. Mother hen to Riff, banter with Pocket. Flaw: a cracked note is always the microphone's fault; she glares at it and taps it.

No bee coding anywhere: no "hive", no black and yellow, no honey jokes. Her hair is "the Stack" and it is a microphone grille.

### 7.1 Modelling brief

**Height:** 1.98 m to the top of the Stack at hype 0; 3.8 heads to the skull top (1.60 m). Head 0.42 tall, 0.43 wide: a round moon face with a tiny chin point.

**Landmarks (m):** boot sole 0.03, ankle 0.11, knee 0.50, crotch 0.80, waist 0.96, shoulders 1.12, chin 1.18, skull top 1.60, Stack top 1.98.

**Widths:** shoulders 0.58 with rounded caps (1.4 heads), tapering in one unbroken line through hips 0.40 to the ankles. **Real, separate legs** (the critic's fix): thighs 0.15, knees 0.11, calves 0.10, ankles 0.08; standing with feet together they read as the mic's tapered handle, and they can step, lunge and spin. Arms long and slim (upper arm 0.30, forearm 0.30, 0.075 thick). Gloved hands 0.19 (thumb + three fingers). Pointed boots 0.28 long.

**Forms:**
- Head: sphere loft with a flat face plate; nose is two ink ticks.
- The Stack: a lathe of FOUR squashed rings and a cap at hype 0. Ring radii from the bottom 0.27, 0.28, 0.26, 0.21; cap radius 0.12. Each ring 0.10 tall, overlapping 0.02; the Stack rises 0.38 above the skull. It is short and wide (0.56 across, 0.38 tall), never tall and narrow. Every ring is its own rigid piece on a telescoping slider so the Stack can compress, stretch, slip and fan.
- Fringe: half a ring rolled from temple to temple. Two flat comma curls on the cheeks.
- Collar: an ink ring 0.08 tall and 0.30 across: the band between a microphone's grille and its handle.
- Jumpsuit: one sleeveless tapered form from the shoulder caps to the ankles, no waist seam. Structured rounded shoulders.
- Gloves: opera gloves to above the elbow, so her gestures read from the back row.
- Earrings: flat discs 0.11.

**Colours (base / shadow):** skin `#8A5636` / `#683C24`. Stack pale butter `#FFE3A0` / `#E8B45A`, grooves `#C98A2E` (clearly paler and yellower than Riff's tangerine and with no orange in it). Jumpsuit vermilion `#FF5226` / `#C93A14` (pushed toward orange, away from Pip's coral and Pocket's pink). Collar and boots `#3A3552` / `#2B2740`, boot soles cobalt. Gloves paper `#FFF7E6` / `#D8D0EC`. Earrings, eye shadow and mic cable cobalt `#2F6BFF` / `#1E49C4`: the cast's one blue, used only as her accent.
Area: vermilion 46%, butter 16%, paper 12%, skin 12%, dark 9%, cobalt 5%.
Alternative B for the owner: jumpsuit cobalt with vermilion accents. Default is vermilion because five of six venues are indigo or violet behind her and cobalt sinks into them.

**Face spec:**
- *Eyes:* large almonds 0.10 wide, 0.17 apart, with flat cobalt lids. **Signature: three graded ink arcs at each outer corner, like the "volume" waves of a speaker icon**, in place of lashes. They grow from one arc (whisper) to three (belt) with the mic level. Nobody else has them.
- *Brows:* thin, high, very mobile arcs.
- *Beauty dot* under the mic-side eye.
- *Mouth, driven by the mic level (the player's own voice in Vocals mode):* at rest a tiny vermilion bud. Then small o, tall O, then the megaphone: a rounded-square mouth 50% of the face height with ink-red interior, one cream tooth bar and a coral tongue; the outline wobbles on vibrato. Five vowel shapes (A, E, I, O, U) can follow the lyric line.
- Off-mic lines appear beside her in tiny type (Baloo 2 at half size) with one volume arc.
- *Default:* lids half down, one arc, the bud, one brow slightly up: polite and waiting.
- *Named expressions:*
 1. **Whisper** (default).
 2. **Megaphone:** eyes squeezed shut as two rising wing lines, three arcs, the square mouth. Her signature.
 3. **Long note:** eyes shut, brows climbing over 8 frames, tall O.
 4. **Star:** star highlights in open eyes, wide closed smile.
 5. **Crack (miss):** mouth a zigzag, one eye wide and one shut, arcs scribbled.
 6. **Blame:** flat lids, pupils on the mic, bud mouth pushed to one side.
 7. **Hen:** soft arcs for eyes, small smile, looking at Riff.
 8. **Banter:** one brow up, mouth a slanted wedge, pupils on Pocket.
 9. **Yawn:** hidden behind a glove, eyes as two commas.
 10. **Diva:** chin up, lids heavy, mouth a satisfied curve, three arcs steady.

**Instrument: the mic.**
- Handheld: a chrome ridged capsule `#D9DDE6` / `#B7BCC8` with three rings (a miniature of her own Stack) on an ink handle with a vermilion band. 0.24 long, head 0.085 across. Hard specular blob.
- Cable: cobalt, 2.8 m, 6-bone spring chain, always on the floor and off to one side; she whips, lassos and steps over it.
- Stand: straight, ink, round base 0.30, at her mark, to park the mic when she needs both arms.
- Hold: in the mic-side hand close to the mouth with the elbow high. **The free hand is a live pitch meter:** it rises and falls with the player's sung pitch (chest height at the bottom of the song's range, above the Stack at the top), so in Vocals mode her glove shows the player where their voice is.

**Spring chains:** Stack ring sliders (4 to 6, driven with a spring layer), comma curls (2), earrings (2), cable (6). Total up to 16.

### 7.2 Motion brief
- **Rule:** one big shape change per phrase. Arms down she is a mic; one arm out, a tick mark; both up, a Y. She moves once a bar while everyone else subdivides.
- **Idle:** pats the Stack with a flat palm (the rings compress one after another); taps the mic twice, politely; hides a yawn behind a glove; whispers an apology to the stand in tiny type.
- **Groove levels:** L1 one sway per bar, rings bounce bottom to top on each beat as a travelling wave. L2 side-steps and cable flicks on the off-beat. L3 phrase poses (point to the sky, hand on chest, reach to the crowd, lean on the stand, back bend), one per phrase. L4 boot on the monitor, stand tilted to 45 degrees, the Stack fanning on every accent.
- **Playing (Vocals mode):** the mouth follows the mic level, the free hand follows the pitch, the chin lifts on high notes. On a long in-tune note the eyes squeeze shut.
- **PERFECT:** the long note: the Stack stretches up 25% and snaps back, star eyes. On a streak, a spin: the rings fan out like a slinky and the cable draws a cobalt ring around her.
- **Miss:** one ring slips sideways out of the Stack; the Crack face, then Blame: she glares at the mic and taps it, and pushes the ring back with one finger.
- **Level-up gag:** throws the mic straight up, spins, catches it behind her back on the downbeat. Hype hair: the rings spread at level 1, a fifth ring at level 2 (she produces it from behind her back and drops it on like a hoopla ring), spread at 3, a sixth at level 4 (Stack top 2.14 m). Each new ring is smaller.
- **Intro pose:** walks on bowing to each bandmate and to the mic stand, whispers "sorry, sorry" in tiny type, lifts the mic, and the first note blows the Stack back.
- **Results:** win, the Diva face with the mic held out to the crowd; lose, holding the mic at arm's length, glaring at it, Stack one ring askew.
- **Signature smear, "the Belt":** back arched, mic high, free arm thrown wide, the Stack bent in a banana curve lagging behind, the megaphone mouth, three ghost gloves.

---

## 8. PIP (mascot)

**Hook:** a guitar pick that stands on its point and spins like a top, so the loading spinner, the needle on the record and the hit marker are all one character.

**Personality:** the band's only fan who is also in the band. Pure encouragement: never judges a wrong note, only points at the next right one. Slightly too loud. Gets dizzy.

### 8.1 Modelling brief
**Size:** 0.50 m tall, 0.46 wide, 0.17 thick beside the band (below Riff's knee); any size in the UI. One head is the whole body.

**Forms:** the classic pick outline (nearly flat top edge, big rounded shoulders, sides curving to a rounded point) as an extruded outline with a full pillow bevel, so it is puffy, never a card. Keep the flat top edge strong: it is what stops the shape reading as a heart. **No legs, no feet, no noodle limbs.** It stands on its point and is always balancing (2 to 4 degrees of wobble).
**Mitts:** two cream mitten hands (0.11), not attached. At rest they are hidden (tucked flush against the back). They pop out only to point, clap or hold a card, never further than 0.06 from the body edge, and never both at head height at once (that is what read as ears in the test sheet).

**Colours:** coral `#FF5E7E` / `#E03A62`, with a cream crescent specular at the top left like celluloid. Mitts paper `#FFF7E6` / `#D8D0EC`. The Needle Drop mark embossed 2 mm on the back.

**Face spec:** on the upper 55% of the front. Eyes: two tall ink ovals 0.05 x 0.085, 0.16 apart (wide) and low, one white highlight each. Brows only for emotion. Mouth a tiny v. Blush: two flat ovals `#FF8FA3`.
- *Default:* open eyes, small v smile.
- *Named expressions:* 1. **Bright** (default). 2. **Wink.** 3. **Sparkle gasp:** eyes with four-point stars, mouth a small o. 4. **Cheer:** eyes as upward arcs, open D mouth. 5. **Dizzy:** eyes as two spirals, wavy mouth. 6. **Oof (miss):** eyes `> <`, flat mouth. 7. **Point:** both pupils hard to one side, brows up. 8. **Determined:** brows down, mouth a short line. 9. **Sleepy (loading for long):** eyes as two dashes, a small bubble.

**Rig:** root, squash top, squash bottom, spin, 2 mitts. No springs.

### 8.2 Jobs and motion brief
- **Logo:** Pip is the pick in the Needle Drop mark; alone he is the app icon.
- **Needle:** choosing a song slides the record out of its sleeve onto the turntable (Pocket's riser); the count-in is Pip dropping point-first onto the groove.
- **Hit marker:** his point is the strike marker on the lane. He stabs down on every hit, flashes cream on PERFECT, wobbles on a miss and spins faster as the combo grows. Bursts are pick-shaped.
- **Riff's pick:** in the intro he dives into Riff's hand and shrinks to pick size; in close-ups the pick in Riff's fingers blinks.
- **On stage:** he sits on Riff's amp only, never on the stage floor (coral competes with Mimi's vermilion).
- **UI guide:** leans in from a screen edge 45 degrees, aims his point at the thing, one mitt out.
- **Transition:** a Pip-shaped iris wipe.
- **Idle:** slow wobble like a spun coin settling; blinks.
- **Groove levels (on the amp):** L1 wobble. L2 hops on the beat. L3 quarter-turn hops. L4 continuous spin with ink speed arcs, then Dizzy.
- **PERFECT:** squash onto the point for one frame, quarter-turn hop with a star. **GREAT:** one mitt thumbs-up. **OK:** tilt and shrug of the top edge.
- **Miss:** falls flat like a dropped pick (with the clatter), peels himself up.
- **Level-up gag:** Riff flips him like a coin; he lands point-first on the next venue's sign.
- **Intro pose:** spins in and settles as the load finishes. **Results:** win, stamps the grade onto the ticket stub with his point; lose, holds the torn ticket with both mitts, Determined face.
- **Signature smear:** the top spin: 6 frames smeared into a coral disc with two ink speed arcs, ending in a ta-da with both mitts out.

---

## 9. THE BAND AS A SET

- **Height ladder (m):** Pip 0.50, Tofu 1.22 (1.56 on her crate), Pocket 1.72 standing (about 2.35 seated on the riser), Riff 1.80, Mimi 1.98, Bo 2.40.
- **Shapes:** Z, circle, column, cube, tapered capsule, triangle.
- **Ring collision guard:** Bo's rings are four, fat, dark, on the body, stage left. Mimi's are four to six, small, light, on the head, stage right. They never stand next to each other.
- **Hair skyline at hype 4:** Riff's plates up, the afro puffed with the shades on the headband, Bo's brim up with ear defenders on, the double-decker loaf, six rings.
- **Member stamps (HUD badge, instrument picker, penlights, flight cases, fans):** Riff = the stepped slab; Pocket = the pink star in a ring; Bo = four stacked ovals; Tofu = a rounded square with a 3 x 3 grid; Mimi = three volume arcs; Pip = the pick.
- **Energy:** three loud (Riff, Pocket, Mimi), two quiet (Bo slow and warm, Tofu fast and strict).
- **Greyscale order (light to dark):** Tofu's hair, Mimi's Stack, Riff's teal, Mimi's vermilion, Bo's grape, Pocket's suit. No two neighbours on stage share a value.

---

## 10. THE WORLD

### 10.1 What never changes
- **Stage footprint:** the playing area is 7.0 m wide and 3.8 m deep in every venue, whatever the set around it. Stage floor height varies (0.15 to 1.6 m).
- **Marks (x across from stage centre, +x = camera right; z depth, +z = toward the crowd; metres):** Bo (-2.6, -0.4). **The Spot** (-0.9, +1.2): a cream pick-shaped pool of light; whoever the player is playing stands here and swaps with Riff. Pocket (0.0, -1.3) on the record riser. Mimi (+1.3, +1.0). Tofu (+2.7, -0.2) on her crate. Riff's amp with Pip at (-1.9, -1.1).
- **Phone layout (390x844):** the band closes into a V with about 25% overlap; Bo and Tofu move in 0.6 m.
- **The Halo:** a bright circle directly behind the drum riser in every venue. It keeps Pocket's dark afro and suit readable and it is his shape.
- **The value pocket:** behind the band the backdrop stays between 15% and 45% brightness and low saturation. Saturated set colour lives at the edges and top of the frame.
- **Hype pop:** each hype level brings one more layer of the set to life with a snap (2 to 4 frames, with overshoot). These are real volumetric props that light up, open, rise or unfold, not card flats.
- **The obi sign:** every venue has one tall 1:4.5 sign (the paper strip on a Japanese record sleeve) that carries the same words as the UI ("ON A ROLL", the song title, the grade).
- **Default camera:** low three-quarter, 1.2 m high, 9 m back, 32 degrees vertical field of view, tilted up 3 degrees so the band is seen from the front row. Per venue cameras are listed below. All camera moves are cuts or 6-frame whip moves on bar lines, never slow drifts during play.
- **Sets:** flat vertex colours, shading baked into vertex colour, dark bevel edges, ink hull on hero props only. Sign lettering is geometry. Invented brands only; no alcohol or smoking props.

### 10.2 Crowd: the Beans (instanced)
Capsule people 1.6 heads tall (0.9 to 1.1 m), two paper dot eyes, a small mouth, tube arms with mitten hands; three body types (round, tall, small). Bodies only in desaturated night violets (`#2B2740`, `#3A3552`, `#4B4470`, `#5B5390`) so they never compete with the band; colour arrives in what they hold. Three tiers: up to 12 rigged front-row beans (400 triangles), up to 80 rigid instanced beans that bob and raise arms by vertex animation (200 triangles), and ranks of low-poly bean shells (40 triangles) or billboard clusters at arena distance. One prop per venue in member colours. They bob on the beat, raise hands on a streak, wave from level 3, gasp and freeze on a miss (one bean facepalms), turn their backs on a fail. On a PERFECT streak their props turn the colour of the member being played. Fame is told in silhouettes: at the Block nobody knows the band; by the Dome the crowd wears slab hats, afro wigs, bucket hats, cube wigs and ring stacks. The old 2D bean, block and speech-bubble characters stand in the front row as an easter egg.

### 10.3 Hub: SIDE B RECORDS (menu and Practice; not one of the six)
The shop at street level (crates, a listening booth, Tofu's tea counter, the striped awning) and the rehearsal room above it (egg-box walls, a couch, Bo's half-built speaker, tour posters for the six venues). The menu's vinyl record on the back wall is the first Halo. Palette slate `#56607A`, amber `#FFB020`, paper. One warm work lamp; no crowd; a cat on the amp.

### 10.4 Venue 1 — `street`: THE BLOCK (ザ・ブロック)
- **Layout:** the pavement outside Side B under a railway arch at night. The "stage" is a 7.0 x 3.8 m patch of black asphalt edged with a painted kerb line; Pocket's riser is the record on top of six soda crates; floor height 0.
- **Backdrop layers:** (1) the brick arch and Side B's shopfront with its striped awning, 4 m behind the marks; (2) a side street running back with shuttered shops; (3) two layers of apartment blocks with windows; (4) the sky with a low moon.
- **Set pieces:** a glowing vending machine "POPPO ポッポ" (teal), a ramen stall "MEN-TEN 麺天" with a steaming curtain, a string of nine red lanterns, a convex traffic mirror that reflects the band, Riff's open guitar case for coins, a bicycle, the cat.
- **Signage:** the obi is a vertical neon, "SIDE B レコード". Shutter posters for the later venues.
- **Halo:** the moon between two buildings, exactly behind the riser.
- **Palette:** indigo `#2B2456`, building violet `#4B3F7A`, asphalt `#12101E`, lantern red `#E5484D`, neon coral, teal and sun.
- **Light:** key warm cream street lamp `#FFE9B0` from camera left; fill grape `#7B5CF0`; rim neon coral from the left and teal from the right.
- **Beat and hype:** lanterns sway on the beat; a train crosses the arch every 16 bars and its windows strobe across the band. L1 the lanterns light. L2 the vending machine and neon come on, shutters roll up. L3 windows open with neighbours leaning out. L4 every window lit, fireworks over the roofs. Coins land in the case on PERFECT.
- **Crowd:** 8 to 20 passers-by with umbrellas and shopping bags; prop umbrellas.
- **Cameras:** default; a low angle from inside the guitar case; the traffic-mirror shot (the band seen in the mirror) for level-ups; a high shot from the train on the 16-bar pass.

### 10.5 Venue 2 — `club`: SUDS (サッズ ライブハウス)
- **Layout:** a 90-capacity live house in a converted coin laundry in the basement next door. Stage 0.35 m high, 7.0 x 3.8 m, checker floor in the room. Ceiling at 3.0 m with pipes.
- **Backdrop layers:** (1) the back wall of the stage: a row of six industrial washers with porthole doors, three each side of the Halo; (2) side walls solid with stickers and flyers; (3) the stairwell down from the street, papered in flyers; (4) a soda counter "FIZZ" at the back of the room.
- **Set pieces:** Bo's PA stacks either side (grape and mint cabinets, hand-painted), a row of four dryers along camera-right that the crowd sit on, a folding table of merch, a detergent-box drum riser skirt.
- **Signage:** obi neon "SUDS 生演奏 LIVE"; a flip sign over the stairs, WASH / LOUD.
- **Halo:** the largest washer door, centre back, a lit porthole ring; from L2 a mirror ball hangs in front of it.
- **Palette:** plum-black `#1A1633`, checker `#2B2456` / `#3A3552`, washer mint `#BDF5E0`, hot pink `#FF4FA0`, cyan `#4FE3FF`.
- **Light:** key hot pink par cans from above left; fill cyan from the right; rim white from the washer doors behind.
- **Beat and hype:** porthole drums turn a notch on every beat and spin on drum fills; pipes shake dust on the kick. L1 the pars come on. L2 the mirror ball drops. L3 confetti from the dryers and strobes on fills. L4 a washer overflows with pink foam across the back of the stage, pipes blow steam, the sign flips from WASH to LOUD.
- **Crowd:** 60 to 90, packed to the stage lip, fists up, a mosh ripple travelling out from the stage on streaks; prop: fists and phones.
- **Cameras:** default (tighter, 7 m back); over-the-crowd from the dryers; a fisheye from inside a washer door looking out; a floor-level shot along the monitors.

### 10.6 Venue 3 — `rooftop`: RADIO KUMO (ラジオ雲 88.8)
- **Layout:** a pirate-radio session on a rooftop at golden hour, the one day venue. The stage is a timber deck 0.20 m high, 7.0 x 3.8 m, on a roof 12 x 9 m.
- **Backdrop layers:** (1) a wall of Bo's hand-painted speaker stacks in grape, mint and sun behind the band, with a gap for the Halo; (2) water tanks, a radio mast with a blinking lamp, washing lines with tees in member colours; (3) neighbouring roofs and fire escapes; (4) three layers of skyline; (5) a sky in five flat bands, no gradient: `#FFCE3A`, `#FFB020`, `#FF5E7E`, `#7B5CF0`, `#2B2456`.
- **Set pieces:** a billboard "MOCHI COLA もちコーラ", the radio shack with an ON AIR lamp, satellite dishes, string lights, a paddling pool with a fan.
- **Signage:** obi is the mast's banner, "88.8 KUMO".
- **Halo:** the setting sun, exactly behind the riser, framed by the speaker stacks.
- **Palette:** peach `#FFB199`, sun, amber, teal shadow `#2A6F7F`.
- **Light:** key low gold `#FFCE3A` from behind (a long rim on everyone); fill peach `#FFB199` from the front; rim amber. Characters are front-lit by a bounce so faces stay readable.
- **Beat and hype:** speaker cones punch on the kick; washing swings on the beat; the mast lamp blinks on beat 1. L1 string lights. L2 the other roofs fill. L3 kites and paper lanterns rise. L4 the sun drops in four stepped frames, the sky flips to magenta and indigo, the city lights come on and the ON AIR lamp turns red.
- **Crowd:** 150 on this roof, the roofs opposite and the fire escapes; prop: round hand fans.
- **Cameras:** default; a long lens from the opposite roof; a crane shot from the mast; a profile shot along the deck with the skyline behind.

### 10.7 Venue 4 — `theater`: THE GOLDEN HOUR (ゴールデンアワー)
- **Layout:** a live TV music show broadcast from an old theatre. The band stands on a revolving stage that is a giant record 8.4 m across (the 7.0 x 3.8 area sits inside it), 0.60 m high, under a proscenium arch 12 m wide and 7 m tall.
- **Backdrop layers:** (1) a sunburst backdrop of gold fins that can turn; (2) a lit staircase either side; (3) grape velvet swags and the gold arch with chase bulbs; (4) three balconies of the theatre curving round.
- **Set pieces:** two camera dollies with bean operators, an applause sign, a light-up floor grid on the record's label, footlights along the lip, a host's podium (empty: Pip takes it on results).
- **Signage:** obi is the marquee column, "TONIGHT 今夜 STRUM JAM"; ON AIR lamps.
- **Halo:** the hub of the sunburst.
- **Palette:** velvet `#8E1B3D`, grape `#5A3FC4`, gold `#FFCE3A`, paper `#FFF7E6`, hot pink `#FF4FA0`. The brightest venue: the value pocket here is the velvet, with the gold kept to the arch and fins.
- **Light:** key flat warm `#FFF1C9` from the front (TV lighting); fill blush `#FFB199`; rim gold from the footlights below.
- **Beat and hype:** chase bulbs step on the beat; the floor grid lights under whoever is in the Spot; the record turns 15 degrees every 8 bars. L1 footlights chase. L2 the curtain flies higher and the staircases light. L3 the balconies stand. L4 gold glitter drop, the sunburst turns, the record does a full revolution.
- **Crowd:** 300 seated beans clapping in unison; prop: round paper fans printed with the member stamps; roses thrown on streaks.
- **Cameras:** default; the two dolly cameras (left and right three-quarters); a top shot looking straight down on the record; a balcony wide.

### 10.8 Venue 5 — `festival`: MOUNT JAM (マウントジャム)
- **Layout:** festival main stage at dusk into night. A timber-and-truss stage 14 m wide, 9 m deep, 1.4 m high, roof at 8 m; the 7.0 x 3.8 area is at its front centre.
- **Backdrop layers:** (1) the upstage wall of Bo's stacks, now 4 m tall, and side screens showing the live 2D faces; (2) truss towers with striped banners; (3) the field with food stalls, lantern strings, tall crowd flags; (4) a ferris wheel; (5) a mountain ridge; (6) the sky.
- **Set pieces:** a giant inflatable Pip 6 m tall beside the stage, stalls "TAKO TAKO たこ" and "KAKI-GO かき氷", a hot-air balloon, flight cases with member stamps.
- **Signage:** obi banners down both truss towers, "MOUNT JAM 山ジャム".
- **Halo:** the ferris wheel's lit ring, lined up behind the riser.
- **Palette:** deep teal sky `#1F5C73` to indigo `#2B2456`, ridge `#12101E` / `#3A3552`, amber lanterns `#FFB020`, mint beams `#8FE3A0`, tangerine `#FF8A5B`.
- **Light:** key sunset tangerine from camera left (hype 0 to 2), switching to mint stage beams; fill teal; rim amber.
- **Beat and hype:** the inflatable Pip nods on the beat; flags wave on the bar; beach balls bounce on the beat. L1 flags up. L2 the wheel's lights chase. L3 balloons rise and beams come on. L4 fireworks, a crowd wave from front to ridge.
- **Crowd:** 400 instanced plus shells to the ridge; prop: towels in member colours, spun on choruses.
- **Cameras:** default (12 m back); a crane sweeping up from the crowd; a shot from the wheel; a side-stage shot past the flight cases with the crowd beyond.

### 10.9 Venue 6 — `arena`: THE DOME (ザ・ドーム)
- **Layout:** sold out. A main stage 20 m wide and 1.6 m high, with a **thrust stage shaped like a guitar neck** running 14 m out into the crowd: 2.2 m wide, with fret lines in light and dot inlays at frets 3, 5, 7, 9 and 12, drawn so the HUD neck at the bottom of the screen appears to continue into the stage. The 7.0 x 3.8 area is where the neck meets the body; the Spot can travel down the neck on streaks.
- **Backdrop layers:** (1) an LED wall 18 x 8 m showing giant live close-ups of the band's 2D face canvases (free: the same canvas, re-used); (2) a ring of screens overhead; (3) laser fans and truss; (4) three tiers of seating; (5) a roof that opens to stars.
- **Set pieces:** Pocket's riser on a lift (rises 2 m at L4), fire columns (stepped flame meshes), confetti cannons firing pick-shaped confetti, side screens showing the player's character.
- **Signage:** obi light columns either side, "SOLD OUT 満員御礼".
- **Halo:** an LED ring playing the member stamps; a spinning gold record at L4.
- **Palette:** black-indigo `#12101E`, navy `#1A1633`, plus the six member colours as light.
- **Light:** key hard white spots with visible cones; fill cyan `#4FE3FF`; rim coral `#FF5E7E`; rim always on.
- **Beat and hype:** fret lines pulse toward the crowd on each beat; the LED wall cuts to whoever just scored. L1 the ring lights. L2 lasers. L3 pyro on downbeats, the riser lift arms. L4 the riser rises, the roof opens, confetti storm, the whole neck lights.
- **Crowd:** 20,000 as a sea of penlights (instanced quads on bean shells), one colour per supported member, forming waves, the Needle Drop mark and Pip's face on streaks. The front rows wear the band's hair.
- **Cameras:** default (14 m back, slightly higher); a cable-cam down the neck; behind Pocket looking out at the penlights; a top shot showing the guitar-shaped stage; the LED wall as a cutaway.

### 10.10 UI motif: THE SLEEVE (one metaphor)
Every menu card is a square record sleeve with a thick ink border and a hard offset shadow; an obi strip on its left edge carries the label. Choosing a song flips through Tofu's crate; the record slides out and drops onto the riser; the count-in is Pip's needle drop. Member stamps are the instrument picker and HUD badges. A song card's receipt is a ticket stub: the result is the stub stamped with the grade by Pip; a fail is a torn stub under BOOED OFF. The pick shape is the iris wipe, the rating burst, the Spot and the confetti. Kept: Bagel Fat One and Baloo 2, the wave pattern, halftone dots. Dropped: the scrapbook cover, the guitar-case menu, lightning bolts.

---

## 11. ORIGINALITY CHECK

General: none of the genre reference's archetypes is used. Nobody is a lanky blue-haired singer with blacked-out eyes, a green-skinned bassist, a helmeted or fringe-hidden child guitarist, or a hulking blank-eyed drummer. Every pair of eyes is visible and expressive, all hair colours are natural or bleached, and the finish is clean flat vinyl, not scratchy linework.

- **Riff:** his hooks are pick-shaped pupils, permanently mismatched eye openings, a D-chord of freckles and a flat-topped stepped slab that works as a level meter. The slab is hard-edged, wider than tall and ink with an orange dip, so it is not a pompadour (Josuke, Johnny Bravo), not spikes or tentacles (Inklings), and not a zigzag with a yellow tip (Pikachu-coded heroes). Teal with a dark slab removes the orange-and-teal Splatoon read. No fang, no nose plaster, no headphones, goggles, cap or scarf (Beat, Chai, Boyfriend). He is a young adult with fully visible eyes, not a child guitarist behind a fringe.
- **Pocket:** the owner's own design. Guards against Jimmy T. (natural dark afro, tuxedo, bulb nose, visor), Dr. Teeth (he is a drummer in black tie, with the grill shown only on the big grin), Disco Kid, and Bootsy Collins's real-life star glasses (round one-piece lens; the star stays on the headband). The tux, pocket square, loafers and warmth keep him a showman and not a costume. Short and round at 2.4 heads, never hulking.
- **Bo:** a very tall engineer in a four-ring puffer and a bucket hat with a yellow woofer bass. Four uneven grape rings with a hat, a face and a bass are not the Michelin Man. Brown skin, level focused eyes, craftsman characterisation: not a green or sleepy bassist, not Lurch or Frankenstein's monster (no flat-top, no stomping walk as his default), not Tinky Winky (no antenna).
- **Tofu:** three soft cubes with a white quilted loaf of hair, square glasses with the eyes on the lenses and a mint cardigan. Not Edna Mode (white hair, square frames, knitwear, never a black bob), not the Fourth Doctor (the scarf is coiled in a crate and is a progress bar), no soft-serve bun (Arale, the emoji). Her strictness and the fact that she is the best player keep her out of the "funny granny" trope.
- **Mimi:** a microphone-shaped woman with a short, wide stack of butter-blonde rings, volume-arc lashes, a megaphone mouth and cobalt accents. Not Marge Simpson (short, wide, pale, ridged, never blue or green), not a real pop star's bee brand (no bee coding, renamed, vermilion and cobalt), not Ariana Grande or Shantae (no ponytail), not Elvis or ABBA (no white flares), not a hime-cut shrine figure (no kimono elements at all).
- **Pip:** a legless puffy pick balancing on its point with hidden mitts. Not a rubber-hose food mascot (no limbs or shoes), and the floating mitts are used sparingly and close to the body so they do not read as Rayman's device.
- **World:** every sign is an invented brand. Sets are volumetric, so nothing reads as Paper Mario's card scenery.

---

## 12. TESTS REQUIRED BEFORE A CHARACTER IS FINAL (none of these has been run on the merged cast)
1. 64 px black silhouettes, with and without instruments, all six in a row. Riff's slab must not read as a hat; Tofu must read as a person; Pip must not read as a heart; Bo must not read as stacked tyres.
2. Greyscale and the three common colour-blind simulations of the line-up.
3. All five on stage at 120 to 250 px tall on 390x844 and at 1280x665, against The Block (night) and Radio Kumo (day).
4. Springs frozen: every key pose still reads.
5. Face decal at 0, 35 and 60 degrees of head turn.
6. Hull outline at 120 px: no breaks at Tofu's corners or Riff's slab edges.
7. Roblox and iOS limits (per-mesh triangle cap, vertex colours on skinned meshes, face texture swapping) checked against current documentation; not verified here.

## 13. OPEN ITEMS AND OWNER DECISIONS
Built-to defaults are in brackets.
1. Pocket: gold grill on the big grin only [yes]; loafers or gold platforms [loafers]; the name Pocket [yes]; pink stick tips [yes].
2. Tofu as a grandma [yes].
3. Mimi's colour: vermilion or cobalt [vermilion with cobalt accents]; the name Mimi [yes, pending search].
4. Riff's hair: ink slab with an orange dip, or all orange [ink with orange dip].
5. Band name Strum Jam and the Needle Drop mark [yes].
6. A rival act for Battle mode is not designed yet. Placeholder brief: a two-piece called DEAD AIR (a human beatboxer and a keytar player in grey and acid green `#C6F432`, the one colour the band never uses), with a heckler bean in the crowd. Needs its own round.
7. A second exploration round on Riff's and Mimi's heads (five variants each at 64 px) is still worth doing before modelling starts; this bible fixes the brief, not the final drawing.
