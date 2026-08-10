# Gone Away — handoff

First-person browser build of the Magnanimis lounge. The environment and ambient sound are
generated at runtime with Three.js r128, with commissioned archive and material images under
`assets/`. Authored media also includes the teaser at `media/gone-away-teaser-v3.mp4` and the
soundtrack streamed from the existing Tiki Lounge public media origin. A local symlink is
retained for verification and recovery.

```bash
cd gone-away
python3 -m http.server 8791     # then open http://localhost:8791/index.html
```

Serve over http — `file://` blocks the record catalog and media fetches. There is deliberately
no generated music fallback; if the album is unavailable, the room keeps only its ambience.

The title screen offers **Watch the teaser** (the authored 14.5-second video; Return or Escape) and
**Enter the lounge**. In the lounge: WASD to walk, mouse to look, **E** to interact, **Esc** to
release the cursor. Interactive: the record player, the LP stack, three sofas, the valve, the
locked door and six independently placed archive photographs. On touch devices, a short tap
raycasts from the tap position; walking and looking remain drag gestures. The records sit on
the low console along the back-left wall, behind and left of the starting view.

---

## The motion sickness is fixed. It was one character.

The previous handoff listed five suspects for the "dizzying" report, led by frame rate.
All five were wrong. The cause was `updateStyle` in one call:

```js
renderer.setSize(innerWidth, innerHeight, false);   // <- the bug
```

A `<canvas>` is a replaced element. With no CSS width/height it lays out at its *intrinsic*
backing-store size. `updateStyle:false` tells three.js to skip setting CSS, so on a 2× display
the canvas was rendered at 2560×1440 **and displayed at 2560×1440**, anchored top-left inside
a 1280×720 window. Measured, not inferred:

| | shipped | fixed |
|---|---|---|
| canvas backing store | 2560×1440 | 2560×1440 |
| canvas displayed size | 2560×1440 | 1280×720 |
| fraction of frame on screen | **0.25** | 1.0 |

Three compounding consequences, which together are a precise recipe for nausea:

1. **Effective FOV was halved** — ~28° vertical instead of the configured 54.5°. Narrow FOV
   is the classic sim-sickness trigger, so every attempt to tune `hfovWalk` was fighting a
   symptom.
2. **The projection centre was off-screen.** The lens centre sat at the *bottom-right corner*
   of the visible area, so you viewed the world through the top-left corner of the frustum.
   Turning swung the world in a way no vestibular system can reconcile.
3. **The reticle, prompt, vignette and grain were centred on the window**, i.e. at the *edge*
   of the actual projection — the crosshair did not point where the camera pointed.

Standing at eye height in a furnished lounge, you saw ceiling and the tops of pillars. No
floor, no firepit, no sofas. Nobody could have found this by reading the code; it only
appears on screen, which is exactly what the old handoff said and why it stayed open.

### Frame rate was never the problem

Synchronous render benchmark with `gl.finish()`, 30 frames, 2560×1440, shadows on:

| configuration | ms/frame | implied fps |
|---|---|---|
| **as shipped** | **1.79** | **558** |
| shadows off | 1.27 | 787 |
| dpr 1.0 | 0.90 | 1111 |
| dpr 1.0 + shadows off | 0.33 | 3030 |
| water hidden | 0.96 | 1038 |

231 draw calls, 79k triangles, 351 meshes, 11 lights, 2 shadow casters. There is roughly
**10× headroom**. Spend it on quality — do not optimise this scene without a measurement
showing a real regression. The old advice to drop water segments and disable the fire shadow
was solving a problem that does not exist.

---

## The teaser

`media/gone-away-teaser-v3.mp4` is the primary teaser: 14.5 seconds, 1280x720 at 24 fps with its
own AAC stereo mix and baked 2.39:1 matte. It plays untouched on a black `object-fit:contain`
stage, so do not add another letterbox or crop the frame. The menu click is the unmuted play
gesture; the video volume eases in over 500 ms. Return and Escape share a short audio/visual
fade rather than a hard cut.

The WebGL loop stops rendering while the teaser is visible. This avoids decoding video and
rendering the full room simultaneously on mobile. On completion, the teaser resolves to the
live lounge with **Enter Lounge** and **Replay Teaser**, not a repeated title lockup and not an
automatic pointer-lock transition.

The older in-engine shot list remains in `LegacyTeaser` as framing reference only. It is not
connected to the interface. `Sound.startMusic()` cannot produce a substitute composition:
only the real album, an explicitly loaded file, or silence can come from the turntable.

## The title screen

It carries a title, a hairline, four words of subtitle and two buttons. Nothing else.

It previously carried seven competing blocks of text — a "vertical slice" tag, four tuning
sliders, a keybinding list, the soundtrack's running time, and a file picker. That is a dev
build wearing a menu, and it was the loudest single "cheap" signal in the project. Controls are
now taught once on entry via `#tutor` and never shown again; everything else folds behind one
quiet word (`#prefsToggle`).

The room drifts behind it on a slow arc, framed deliberately **off-axis** so the firepit and the
moon's path sit to one side rather than directly behind the type — the words need a quiet field
far more than the menu needs to show off the scene, which is also why `.screen` dims the render
hard. A frozen frame behind a menu reads as a screenshot.

## Playtest findings

Every interaction was exercised directly rather than assumed. Working: valve → fountain +
water audio, sit/stand at seat height 1.06, the locked door line, the record player (platter
measured at 33 rpm — 1.675 rad/s against 1.67 expected), the LP stack, collection persistence
across reloads, walk and strafe, and wall collision.

Two real bugs found and fixed:

- **The valve only targeted inside about a 6° pitch window** — 1 of 7 test angles hit. It is a
  thin torus with spokes, and it is the object the entire story turns on. It now has the same
  invisible-material hit proxy as the LP stack: 7 of 7.
- **The locked door corner fell to near-black**, so the door read as a hole in the wall with a
  floating brass knob. It now has its own brass sconce, which is also just what a torchlit
  resort would put beside a door it keeps locked.

One thing that looked like a bug and was not: walking north reaches z = −12.2, well past the
pavilion deck edge at z = −7.1. That is correct — `terrace` is real geometry out to z = −14.3
and `collide()`'s `zMin = -13.4` sits properly inside it. The wet stone terrace is the pitch's
"open terrace by the sea".

## The hour is blue hour, not midnight

Reference stills from the owner settled this: the Magnanimis is shot **roughly twenty minutes
after sunset**, not at midnight. The build was previously a black-sky night scene and it made
the resort look shut. This is the single most important art-direction fact in the project, and
it drives everything else.

| | was | now |
|---|---|---|
| sky zenith | `#040a14` (near black) | `#0a2247` deep saturated blue |
| sky horizon | `#16324c` | `#2f6d99` luminous |
| lagoon deep | `#061a26` | `#0a3247` rich teal |
| lagoon shallow | `#14586a` | `#2c9cb4` turquoise |
| fog | `#131f2e` @ .0043 | `#1d4468` @ .0036 |
| hemisphere fill | 0.40 | 0.62, warmer ground bounce |

The sky shader also carries a **residual sunset** — a warm band hugging the horizon on one
compass bearing (`uSunDir`), fading fast with height. That is what gives the sky a west, and
what stops it reading as a uniform dome.

**The trap to avoid:** raising the ambient without raising the practicals. When the sky started
carrying real light, the interior immediately went cold and flat, because the lanterns and fire
had been balanced against a black scene. Warm-against-cool *is* the look, so the practicals had
to climb with it — lanterns roughly tripled (0.6 → 1.65) and the record lamp reached 3.3. The
fire is now deliberately local: a fixed 3.70 shadow key with roughly ±5% irregular flutter, a
0.64 shadowless hearth fill and a nearly static 0.42 roof bounce. At blue hour the inside of the
pavilion should read amber and occupied, brighter than the water beyond it.

**Never animate `fireLight.position`.** The old ±5–7 cm three-axis motion moved every shadow in
the room and read as a light fixture swinging above the fire. Keep the shadow caster planted at
`FIRE_POS`; only its narrow intensity envelope and the visible flame particles should move. The
low table practical is intentionally steady so the drink, flower, linen and cane give the eye a
calm warm place to rest.

## The rest of the resort

Eleven guest villas arc across the bay, each with a lit window and an additive reflection
streak trailing toward the eye. Two of the three reference stills are essentially this shot,
and it is what says the hotel is *full* rather than abandoned.

**They hang off a jetty.** Overwater bungalows are always strung along a single timber
boardwalk with posts into the water. Without it they were eleven huts standing in open sea with
no way to reach them — which is exactly why they read as abstract shapes rather than a hotel.
The walkway also ties them into one silhouette instead of a scatter of boxes.

**Reflections must never show an edge.** The first version was flat untextured quads and looked
precisely like what it was: pale rectangles lying on the water with hard borders and a visible
end. They now carry a gradient that is brightest directly beneath the villa, is chopped into
broken glints rather than a continuous ribbon, tapers on both sides so there is no straight
vertical edge, and dissolves before it reaches the viewer.

Three things learned placing them, in order of how badly each got it wrong:

- **Never in the sightline. Privacy is the product.** The first arc swept from dead ahead to
  the right, which put a row of lit windows straight down the lounge's view out to sea. You
  look out from here and there should be *nobody* — that is what the Magnanimis sells, and it
  is the premise the whole mystery runs on. Concretely: the lounge's ~90° view frames
  `|x| < |z|`, so every villa is placed with `|x|` comfortably greater than `|z|` — currently
  66–73° off axis. Look straight out and the horizon is empty; turn your head and the resort
  is there. If you move them, re-check that angle.
- **Distance is the other half.** At radius ~26 they read as neighbours crowding the terrace.
  They now run from 52 to 170 units out, small and hazed.
- **Unlit materials do not attenuate.** `MeshBasicMaterial` sits at full brightness regardless
  of distance, so the first pass blew the windows out into white slabs that read as lightboxes.
  Deep amber (`#c98139`) and a much narrower window keep them warm once bloom and the grade
  have had their way with them. A lit room seen across a bay is a narrow slot, not a glowing
  wall.

## Art direction: timeless luxury, not "past its prime"

**This overrides the pitch's stated look, on the owner's instruction.** The pitch says
"immaculate but slightly past its prime" in every image prompt. The direction now is *timeless
luxury*: no wear, no fading, no patina on visible surfaces.

These reconcile better than they look. Real luxury does not read as wear — it reads as
impeccable materials, perfectly maintained. And the pitch's own line is "the paint is perfect
but the empire underneath is not." So the decay belongs where the story puts it: in the failing
water system underground, in the maintenance tunnels, in the pipes. Not on the mahogany.

What that meant concretely, because "luxury" in a renderer is specific:

- **Linen, not cream plastic.** `T.fabric`'s base was a saturated tan (`#b4a07b`) that lit up
  to bright cream — the single cheapest-looking surface in frame. Now a low-chroma greige
  (`#8b8578`) with tonal slub in both axes. Luxury textiles are lower-chroma and a step darker
  than you expect; the richness comes from weave catching light, not from bright colour.
- **The rug was the worst offender.** A hard two-tone checkerboard that read as vinyl flooring.
  Now near-tonal flat-woven sisal — the weave only shows where light rakes across it.
- **Satin hardwood deck.** `M.floor` roughness 0.70 → 0.42 with envMapIntensity 0.34 → 0.62, so
  the deck carries a soft reflection of the firepit and the moon path. This is the biggest single
  luxury win in the room: a dark floor that reflects stops being a flat brown plane.
- **Mahogany, not terracotta.** `T.carve`'s field was light and orange enough to read as
  terracotta. Deeper base, restrained relief highlight — polished wood, not gilding.
- **Restraint in the grade.** Saturation pulled back (1.12 → 1.03) and a filmic S-curve added.
  Heavy saturation reads cheap; contrast reads expensive.

### Commissioned archive and house materials

The lounge now has authored image assets under `assets/`, generated specifically for the
Magnanimis rather than used as generic period decoration:

- `assets/archive/` contains six pristine 1965 silver-gelatin lore photographs: Garmus
  Campoza's portrait, Garmus among guests at the Magnanimis, the spring-fed pool, arrivals at
  the jetty, the original lounge with Garmus's turntable and records, and Garmus's water
  system. Garmus uses one consistent fictional identity across the set.
- `assets/materials/` contains the Magnanimis jacquard, fine furniture cane and an invented
  wave-and-leaf carved-teak house pattern. The jacquard is confined to loose accent cushions;
  the carved finish belongs to the pillars and manager's-door inserts.

All nine files are 1024px JPEGs. They load asynchronously over the complete procedural
materials, so a missing asset logs a warning and leaves a finished fallback rather than a
blank wall or white surface. The six photographs are distributed through the room: Garmus
above the record console, the gathering above the bar, lounge and pool on opposite side walls,
and the water-system and jetty images on the lagoon-facing pillars. Each frame opens only its
own image and lore copy in a full-screen, no-carousel inspection view. The Return control is
touch-sized and always visible; portrait orientation is suggested, never enforced. Image,
title, caption, alt text and placement stay joined in `ARCHIVE_ENTRIES` so the lore cannot
drift out of order again. Do not repopulate the set with invented staff biographies or suspect
claims.

### The S-curve trap

The contrast curve is `col * col * (3 - 2 * col)`, which is only valid on [0,1]. **It goes
negative above 1.5**, and the composer's HalfFloat buffer holds HDR values well past that where
bloom hits the firepit — which inverted the brightest channel and turned the fire *blue* with a
red slick on the lagoon. `GRADE` now clamps to [0,1] before grading. The screen clips superwhites
anyway, so nothing is lost. If you add any polynomial curve to that shader, clamp first.

## Nothing may float

The single most damaging class of bug in this scene, because it converts "a place" into "a
dream" instantly and the eye catches it before it catches anything else.

**Palms rooted in open water.** Half the palms stood at z = -19 to -27, well past the terrace
edge at z = -14.3, with the trunk base at y = -0.3 — trees growing out of the sea with nothing
underneath. Each over-water palm now gets a `palmIslet()`: a low matte sand bank and a few
rocks at its foot. Small vegetated outcrops are exactly what a lagoon like this has, and it
grounds the trees without inventing a coastline that would fight the pavilion's own footprint.
Build the banks flat (y-scale ~0.15) and matte — at 0.30 with the wet-stone material they read
as big polished boulders rather than sand.

**Check this whenever anything is placed outside the deck.** The deck runs z = -7.1 to 8.3; the
terrace runs to z = -14.3. Anything beyond that is water and needs ground built under it.

## Camera paths must be checked against geometry

The teaser's valve shot ended at (-7.45, -4.75) with a 5.4m pillar at (-7.7, -4.6) — the camera
finished the shot **inside the pillar**. It is easy to author a dolly that looks fine in a still
and passes through a column in motion.

`BLOCKERS` already knows where every solid object is, so this is checkable rather than
eyeballed. Walk each shot at ~0.02 steps, measure `hypot(cam.x-B.x, cam.z-B.z) - B.r` against
every blocker, and flag anything under ~0.3m. Re-run it after touching any shot path.

One known false positive: shot 3 (the turntable) reports -0.41 against the record console's
blocker. Blockers are infinite-height cylinders; the console is ~1.1m tall and that camera sits
at y = 1.86, safely above it. A height-aware check would clear it.

## Realism: bevels, contact shadows, and why SSAO is off

Three things separate this from a good realtime demo. Two are fixed cheaply; the third is
measured and deferred with a known remedy.

**1. Sharp edges — fixed.** Every box in the scene had a true 90° corner, and nothing in the
real world does. A real edge is a narrow chamfer that catches a bright line of light, and the
eye reads those highlights as evidence that a thing is solid and manufactured. `roundedBoxGeo()`
gives every box a one-segment bevel, sized from the object's smallest dimension so thin slats
get a proportionate chamfer rather than a broken one, falling back to a plain box below ~4mm.
It is wired into both `box()` and the sofa builder, so all 30-odd call sites upgraded at once.
Cost: **8k triangles**, about 9%.

**2. Nothing darkened where surfaces met — fixed cheaply.** Objects with no darkening beneath
them read as floating. `contactShadow()` lays a soft radial decal under each heavy object — the
sofas, firepit, console, bar, LP stack and pillar bases. One draw call each.

**3. SSAO works, looks right, and is OFF BY DEFAULT because it costs too much.**

| | ms/frame | fps |
|---|---|---|
| scene, no AO | 1.9 | 536 |
| **+ SSAO full res** | **33.4** | 30 |
| + SSAO half res | 24.7 | 41 |
| + SSAO third res | 23.4 | 43 |
| shipping preset (bevels + contact shadows) | 6.8 | 147 |

Dropping the AO resolution barely helped, which is the tell: **the cost is draw-call bound, not
pixel bound.** `SSAOPass` re-renders the whole scene three times (beauty, depth, normals) on top
of our `RenderPass`, and at 233 draw calls per scene pass that is ~930 calls a frame.

**The remedy is not a smaller AO buffer, it is fewer draw calls.** Most of the 498 meshes are
static and share a handful of materials; merging them by material would cut the count by an
order of magnitude and bring SSAO comfortably into budget. That is the highest-value performance
work left, and it unlocks the effect rather than replacing it.

Note also that `RenderPass` is deliberately kept in front of `SSAOPass` even though SSAO renders
its own beauty. Without it, switching SSAO off left nothing drawing the scene at all and the
chain read a stale buffer and blew out to white. One extra scene draw is the price of AO being a
safe toggle.

## The half-resolution bug — read this before touching the composer

For a stretch, **every post-processed frame was rendered at 1280×720 and upscaled to a
2560×1440 canvas.** This was by far the largest reason the game looked soft and "not AAA",
and it also made anti-aliasing pointless, because SMAA was cleaning up an already-blurred blit.

`EffectComposer` only adopts the renderer's pixel ratio when it *creates its own* render
target. We hand it one (we need HalfFloat and an sRGB tag), so it silently assumed a ratio of
1. The fix is one line in `resize()`:

```js
COMPOSER.setPixelRatio(renderer.getPixelRatio());
COMPOSER.setSize(w, h);
```

`setSize` then forwards the ratio-multiplied size to every pass, so passes must **not** be
resized separately afterwards with hand-computed numbers — that was how the two got out of
step in the first place (SMAA's internal targets were at 2560 while the colour buffer was at
1280). Full resolution costs almost nothing here: 1.68 ms in play, 2.69 ms with depth of
field, against a 16.7 ms budget.

**Pass order matters and is not arbitrary:**

```
Render > Bokeh > UnrealBloom > Grade > SMAA (renderToScreen)
```

`SMAAPass` declares `needsSwap = false` and writes to the write buffer, so anything placed
after it reads the un-antialiased read buffer and throws the work away — measured at exactly
0.0% effect until it was moved last. It only functions as the final pass. Running it after the
grade is correct on its own terms anyway: you antialias the image you actually ship.

## Rendering pipeline

Three things carry the look now. All three are optional at runtime: if the post-processing
scripts fail to load, `COMPOSER` stays null and the scene renders straight to the canvas.

**1. Image-based lighting.** `buildEnvironment()` at the bottom of the file captures the
finished room into a 256px cubemap once at boot, runs it through `PMREMGenerator`, and assigns
it to `scene.environment`. This was the single largest upgrade available: the brass, bronze and
copper were all authored with high metalness and had *nothing to reflect*, and a metal with no
environment renders very nearly black. Per-material `envMapIntensity` keeps the metals shiny
(1.15–1.55) and the matte surfaces matte (thatch 0.10, fabric 0.12) — uniform IBL flattens
everything. Sprites, particles and additive meshes are hidden during the capture so they don't
bake in as blobs and then get reflected by every metal in the room.

Measured contribution: about 1.6% of mean frame luminance. It is not there to brighten the
scene, it is there to give specular surfaces something to be.

**2. Post-processing** — `RenderPass` → `UnrealBloomPass` → `GRADE`, into a HalfFloat buffer
(HalfFloat because this scene is very dark and 8-bit bloom bands badly in the shadows).

The one thing to understand before touching it: **the composer's buffer is tagged
`sRGBEncoding`**. The scene mixes standard materials, which write linear, with three
hand-written shaders — sky, water, point sprites — which write display-referred colour and have
no encoding chunk. Tagging the buffer makes three encode the standard materials on the way in so
both kinds agree, and the grade pass can then hand the result straight to the screen. Encoding
once, at the buffer, is what stops the lagoon being gamma-corrected twice.

Two consequences worth knowing:

- **Bloom threshold is high (0.86) on purpose.** It is measured against sRGB values, where a
  linear 0.2 reads as 0.48. At 0.62 it caught the cream cushions and hazed half the room.
- **Grain must be added in display space**, which is where `GRADE` does it. Added in linear
  space the sRGB curve stretches it near black and it reads as sensor noise lifting the
  shadows rather than as film grain. That mistake cost one debugging cycle; don't repeat it.

`GRADE` is one shader doing four jobs so the whole film look costs a single fullscreen draw:
radial chromatic aberration (anamorphic, nothing at centre), a warm/teal split tone (firelight
highlights, moonlit shadows), vignette, and grain. Its `uVigDepth` is the mood dial — it
replaced a CSS overlay that darkened the corners to ~25%, and restoring that depth is most of
what makes the room feel moody rather than merely lit. The CSS `#vig` and `#grain` overlays are
switched off when the composer is active so the effects don't double.

**3. Light shafts.** Every lantern hangs a hollow additive cone (`shaftMat`, `SHAFTS`) —
depth-write off, no shadow interaction, denser near the shade. The facing-ratio term in the
fragment shader is what softens the silhouette: a hollow double-sided cone is crossed by exactly
two surfaces from any angle, so without it the alpha is flat and the cone reads as a hard
triangle. This is the cheapest thing in the scene that reads as expensive, and it gives bloom
something soft to catch.

### Cost

Measured at 1804×1428 (dpr 2), 25-frame `gl.finish()` benchmark:

| | ms/frame | fps |
|---|---|---|
| full — bloom + grade + shafts + IBL | **1.86** | 538 |
| no post at all (direct render) | 1.47 | 681 |

The entire post chain costs about **0.4 ms**. There is still roughly 9× headroom against a
60fps budget. These micro-benchmarks are noisy — changing a light's `visible` flag forces three
to recompile every material, which is why an "effect off" measurement can come out *slower* —
so treat them as orders of magnitude, not precision figures.

## Also fixed

- **`resize()` NaN guard.** A zero-height window (hidden tab, collapsed pane, some window
  managers) made `aspect = 0/0 = NaN`, which poisons the projection matrix *permanently* —
  the scene never returns even after the window is restored. Now clamped to ≥1px.
- **Four of six lanterns emitted no light.** They were glowing `MeshBasicMaterial` props. The
  whole west end — including the record player, the room's main interaction — sat in near
  darkness under a visibly lit lamp. Every lantern now carries a real unshadowed point light
  via `lanternLight()`, plus a dedicated lamp over the record console. Lantern flicker is now
  two detuned sines per lamp, phase-offset, so they breathe independently instead of in unison.
- **Interaction proxy on the LP stack.** The sleeves are small and low; aiming at real geometry
  needed a 31° downward look before the prompt appeared. An invisible-material hit box (mesh
  visible to the raycaster, material never drawn) brings that to 17°.

---

## The soundtrack is real now

The record player plays the **Beach Noir Revue** — 65 tracks, 4h 02m, by mellokitty — shared
from the `tiki-lounge` app.

- Runtime track URLs use
  `https://tiki-lounge-beta.vercel.app/audio/beach-noir/NN.m4a`. The origin supports CORS
  and byte-range delivery, and all 65 URLs were verified before wiring the catalog to it.
- `audio/beach-noir` remains a **symlink** to `tiki-lounge/public/audio/beach-noir` (74 MB
  of `.m4a`) for local verification and recovery. No duplication; `tiki-lounge` stays the
  source of truth.
- `scripts/build-library.mjs` parses `tiki-lounge/lib/library.ts` and emits `audio/library.json`.
  Re-run it whenever the album changes. It verifies every file exists and refuses to write an
  empty library.
- Playback is a streamed `<audio>` element through a `MediaElementAudioSourceNode`, **not** a
  decoded `AudioBuffer`. One 4-minute track is ~85 MB of float PCM; a 4-hour album is not
  going in memory. Streaming also starts instantly and seeks.
- It routes through the existing `musicFilter` → `musicBus`, so the distance mix applies
  unchanged. Verified: at the record player **gain 0.86 / 6280 Hz**; out on the terrace
  **gain 0.32 / 1313 Hz**.
- Vinyl surface noise is scheduled only while a record turns. That, not wow/flutter, is what
  makes a clean digital master read as a record in a room — and it avoids touching
  `playbackRate` on a media element, which artefacts in some browsers.
- Tracks auto-advance on `ended`, so the room keeps playing unattended.

Interactions: **record player** drops/lifts the needle; **LP stack** takes the next side off the
pile and announces the label. Playback is deliberately limited to the current record, the
album, or a file the player explicitly loads—never a generated substitute. Dropping a file
still works. If the initial catalog request loses a race or the preview server was briefly
offline, touching either the platter or sleeves retries the real catalog instead of declaring
the sleeves empty.

### The collection is the collectible loop

The pitch calls playing a dead man's records in his own room "both the game's collectible loop
and its emotional core", so which sides you have heard now persists. `Collection` (localStorage,
key `goneaway.collection.v1`) records every side played and the label read shows side number,
a `never played` marker on a first play, and a running `n of 65 heard`. Verified surviving a
reload. This is the build's first real save state.

The shelf prompt is deliberately "Flip through the records", not "Garmus's records" — the
plumber has just landed and does not know whose shelf it is. That is a discovery, not a label.

---

## Canon (from the pitch)

The player is a **plumber** flown to a private **Caribbean** island to repair the failing water
system of the Magnanimis Resort, built in the early 1960s by **Garmus Campoza** and preserved
in 1965 by the private-equity group that now owns it. Garmus vanished; no body. The Group's
title depends entirely on his death-in-absentia ruling — so when a guest re-examining that
ruling drowns in the spring-fed pool, everyone has the same motive: the deed.

Design pillars that bear directly on this build:

- **Repair is investigation.** Valves, pumps and maintenance passages gate the island. The
  slice's valve → fountain → locked door chain is already this pattern in miniature.
- **The resort is a social instrument.** Sitting down is an interaction that "settles the scene
  and puts nearby conversation in play" — the slice's three seats are a designed pillar, not
  furniture.
- **The prime is a discoverable layer**, physically present as records, photographs, guest
  books and menus. The player never visits 1965; they stand in what is left of it.
- **No combat, no timer, no fail state.** Player-owned deduction; the case can be closed wrong.
- **The ending is the job** — the finale is a repair configuration, not a dialogue choice.

### Setting: resolved, and the soundtrack is not a contradiction

The pitch says **Caribbean**, so the original handoff was right. The Hawaiian place names in the
tracklist (Kalakaua, Waikiki, Molokai) are *not* an error: exotica is Polynesian-themed music by
genre — Denny and Lyman recorded in Hawaii — and tiki architecture is Polynesian pastiche
regardless of where it stands. A Caribbean tiki resort whose founder collected Hawaiian-titled
exotica is period-correct. The pitch makes it diegetic: the soundtrack *is* "Garmus's
collection, found and played by the player on the resort's original equipment."

The tracklist is also a usable story spine: *Midnight Case on Kalakaua · Stakeout at Breakers
Cove · Footsteps in the Fog · Quiet Witness · Two Clues · Frangipani Evidence · The Kalua Files
· Cipher in a Bamboo Backroom · The Confession · Deception · Currents That Never Confess · Last
Sunset Over Tabu Island.*

### The lounge is the signature shot

Pitch prompt #3 describes this exact room. Current fidelity:

| pitch | build |
|---|---|
| carved mahogany pillars, Polynesian patterns | done |
| low rattan sofas, **sun-faded** cushions | sofas yes, fading no |
| bronze firepit | done |
| paper lanterns | done |
| open wall to moonlit lagoon | done |
| **distant volcanic peak** (single jagged) | flat triangular silhouettes |
| empty cocktail with an orchid | orchid present |
| no people, no wall art | done |

"Immaculate but slightly past its prime" is the whole art direction and appears in every image
prompt. The build is currently immaculate and *not* tired at the seams — no fading, no wear, no
patina. That gap is the highest-value art task remaining.

## Open question: engine

The pitch specifies **Unreal Engine 5, PC**. This build is browser Three.js. Before more effort
goes in, settle which this is: a prototype to be rebuilt in UE5, the actual shipping target, or
a pitch/marketing demo. It changes where the work should go — a browser target argues for
polishing this scene, a UE5 target argues for using it to lock art direction and mechanics
cheaply and porting the decisions rather than the code.

### Next tasks

Art direction, in value order (see the luxury direction above — do **not** add wear):

- [ ] **Hero props.** The pitch's signature shot calls for "an empty cocktail with an orchid on
      the table". Glass, a little liquid, a single bloom. One good prop in the foreground does
      more for a screenshot than another lighting pass.
- [ ] **Volcanic peak.** The pitch wants one jagged peak; the build still has flat triangles.
- [ ] Push the cushions a touch deeper still if they read light against the dark deck — the
      texture is right but the value could drop another few percent.
- [ ] Chamfer the big boxes. Everything is a hard-edged `BoxGeometry`, and bevels catching a
      highlight is a large part of why real furniture reads as expensive.
- [ ] Exterior shell — from outside the pavilion is an unlit black slab (pitch prompts #1, #2).
- [ ] **Volcanic peak.** The pitch wants one jagged peak; the build has flat triangles.
- [ ] Exterior shell — from outside the pavilion is an unlit black slab with a flat back. Fine
      for an interior slice, wrong for the arrival shot (pitch prompts #1 and #2).
- [ ] Moon specular on the lagoon is a hard blob; wants a broader, dimmer glitter path.
- [ ] Soft shadow blotching on the upper back wall (moon shadow map is 1024 over a 44-unit
      frustum). Tighten the frustum or raise the map.
- [ ] Empty cocktail with an orchid on the table, per prompt #3.

Systems:

- [ ] Now-playing readout — `Sound.position()` already returns time/duration/ctx/gain/cutoff.
- [ ] **Analog repair tools**: pressure gauge, dye test, listening rod held against the pipe.
      This is the core verb of the whole game and the slice has none of it yet.
- [ ] Bartender NPC at the bar: look-at plus one line.
- [ ] Case-board UI shell. Now unblocked: it pins the drowned guest, the six named suspects,
      and the title chain (death ruling → forced sale → the Group's deed).
- [ ] Second room through the back passage, to test level streaming.
- [ ] Settings persistence and graphics presets (the collection already proves the pattern).
- [ ] Consider Cast support: `tiki-lounge` already ships a receiver, so the lounge could run on
      a television as a playable ambient scene.

### Known gaps

- No collision on the fountain spout or bar stools beyond a circle radius.
- Shadows disabled on touch devices (`LOW`).
- The generative exotica loop remains as the offline fallback; it is pacing, not a composition.

---

## Working rules

**Verify against the screen. Never mark anything done on reasoning alone.** The `setSize` bug
survived a whole development cycle and five wrong hypotheses because nobody looked at a
rendered frame. Screenshot it, or measure it, before believing it.

Two useful notes for driving this thing from a headless/hidden browser: `requestAnimationFrame`
does not fire when the pane is hidden, so `tick()` stops and `updateTarget()` never runs —
call `renderer.render()` and `updateTarget()` directly instead of concluding the game is
broken. And `tick()` overwrites `camera` from `player` every frame, so set `player.pos` /
`player.yaw` / `player.pitch`, not the camera.

Keep it procedural and keep it in one file until that genuinely stops being practical. The
moment it takes on an asset pipeline it stops being editable from a terminal.

## Tuning

`CFG` at the top: walk speed, head bob (off — it is *not* the sickness cause, but it does not
help), look sensitivity, FOV walking vs seated, fog, reach, eye height, `libraryUrl`.

The look lives in the balance between the fixed fire key plus its short-range hearth fill
(warm, inside) and `moonLight.intensity` (cool, outside). Change that local/cool balance before
raising global ambient light.
