# Gone Away — renderer upgrade

Companion to `HANDOFF.md`, which stays the authority on what the build *is* and why the art
direction is what it is. This file only covers the move off three.js r128 and the render work
that unlocks.

The goal is not "be on a newer three". The goal is `reference/target.png` — a moonlit open-air
lounge, warm and occupied inside, cool and empty out to sea. Every phase below is justified by
something in that image the current build cannot draw.

---

## How to run it

```powershell
powershell -File gone-away/scripts/serve.ps1        # http://localhost:8791/
```

or, from Claude Code, `preview_start` with the `gone-away` configuration in
`.claude/launch.json`, which runs the same script.

There is no node and no python on the development machine, so `python3 -m http.server` from
HANDOFF.md is not available — and neither is anything npm-based, which is why `launch.json` does
not point at the monorepo's `next dev`. `serve.ps1` is a static server built on .NET's
`HttpListener`, which needs no install. Serve over http — on `file://` the library fetch fails
silently and the build drops to the generative audio loop.

## How a frame gets reviewed

```
http://localhost:8791/index.html?shot=hero&t=6&as=my-frame
        -> renders/my-frame.png
```

The capture block at the bottom of `index.html` reads `shot`, `t`, `w`, `h`, `as` from the URL,
renders one fixed framing and POSTs the PNG to `/__shot`, which `serve.ps1` writes into
`renders/`. One framing per page load, so every frame boots from an identical state.

This roundabout route is not decoration. Three of the four obvious ways to get a frame out are
shut on this machine:

| route | why it fails |
|---|---|
| puppeteer / headless | no node |
| MCP screenshot of the preview pane | the pane is never displayed, so it never composites and the capture times out |
| `<a download>` of the canvas | Chrome allows one automatic download per origin, then asks a permission question nothing can answer with no UI |
| **POST to a local server** | **works, unlimited** |

Fixed framings live in `SHOTS` in the capture block. Do not move them casually — comparing two
lighting passes is meaningless if the camera moved too. `hero` is the pitch's signature shot and
matches the framing of `reference/target.png`.

`t` is a fixed timestep warm-up, not wall clock. Fire, water, motes and lanterns are all
time-driven, so a frame is only reproducible if the phase is.

---

## Where the baseline actually stands

`renders/p1-baseline-hero.png`, r128, against `reference/target.png`. Ordered by how much each
costs the image, not by how hard it is to fix.

1. **The value structure is inverted.** The target is roughly three-quarters dark, with small
   pools of warm light doing all the work. The baseline is uniformly mid-bright and the *water
   is brighter than the interior* — which directly contradicts HANDOFF's own rule that at blue
   hour the inside should read amber and occupied, brighter than the water beyond it. This is
   the single largest miss and it is mostly a tuning problem, not a renderer problem.
2. **No moon.** The target's moon is the compositional anchor and the source of the whole cool
   half of the palette. The baseline has an undifferentiated bright patch upper-left.
3. **The moon's path on the water is a hard specular blob.** Already flagged in HANDOFF. The
   target has a broad, dim, broken glitter path running to the horizon.
4. **The sky is a bare vertical gradient.** The target has moonlit cumulus with real internal
   contrast — lit tops, dark bases.
5. **The water is flat cyan.** No wave normals, no fresnel, no depth falloff. It reads as
   coloured plastic rather than as sea.
6. **Nothing frames the opening.** The target frames its view with palm silhouettes and carved
   posts. The baseline's opening is a bare rectangle, so the eye falls straight out of frame.
7. **The peak is two flat triangles.** Already flagged in HANDOFF.
8. **The terrace is matte.** In the target the wet stone carries the moonpath indoors, which is
   what ties the two halves of the image together.
9. **Every box is hard-edged.** Bevels catching a highlight are a large part of why real
   furniture reads as expensive. Also already flagged in HANDOFF.
10. **No foliage indoors.** The target is full of plants; they are most of its silhouette detail.

Items 1, 6, 9 and 10 are achievable on r128 today. Items 2–5, 7 and 8 are what the upgrade is
for.

---

## Phases

### P0 — capture loop *(done)*

Server, in-page capture block, fixed framings, baseline frame on disk.

### P1 — r128 → r185

`three@0.185.1` is current. This is a five-year jump and the file is 3,200 lines of a single
document, so it goes in one careful pass with a frame captured after each step.

The changes that will actually bite:

- **Globals are gone.** r128 ships `examples/js/*` as scripts that attach to `THREE`; that
  directory no longer exists. The page becomes `<script type="importmap">` plus one
  `type="module"`, and every pass is imported from `three/addons/`.
- **Lighting units changed.** r155 made physically-correct lighting the default and r165 removed
  the `useLegacyLights` escape hatch. Every one of the twelve lights in this scene will change
  meaning. Expect the first r185 frame to be wrong, and expect to re-derive the
  `fireLight` / `moonLight` balance that HANDOFF calls the whole look.
- **Colour management.** `outputEncoding` / `sRGBEncoding` / `texture.encoding` are all removed
  in favour of `outputColorSpace` / `SRGBColorSpace` / `texture.colorSpace`, and
  `ColorManagement` is on by default. The build has three hand-written shaders and a
  deliberately sRGB-tagged composer target, all of which encode assumptions here.
- **The grade pass does its own linear→sRGB conversion.** That stays correct, but it has to be
  re-checked against the new default rather than assumed.

Success condition: an r185 frame from `?shot=hero` that is *perceptually the same image* as the
r128 baseline. Not better — the same. Any look change at this stage is a migration bug wearing a
costume, and the review loop exists to catch exactly that.

### P2 — WebGPU + TSL, and the sky and sea

`WebGPURenderer` with the WebGL2 fallback, post-processing moved to TSL nodes.

The reference the owner supplied — @techartist_'s tropical resort demo — is this stack. Their
post says the demo exposes *time, sun, wind, water clarity and lighting* as live controls, and
that parameterisation is the idea worth stealing, independent of any specific shader: the look
should be a set of named uniforms that can be swept, not constants edited by hand. It makes the
review loop a search instead of a guess.

Concretely, from `three/addons`:

- **`SkyMesh`** — now carries `cloudCoverage` / `cloudDensity` / `cloudElevation` on top of the
  usual turbidity/rayleigh/mie. That is baseline gaps 4 and, with the sun driven below the
  horizon, the residual sunset band HANDOFF already wants.
- **`WaterMesh`** — `sunDirection` / `sunColor` / `waterColor` / `distortionScale` with animated
  normals. Driven from the *moon* rather than the sun, this is gaps 3 and 5 in one object.
- **`bloom`** from `three/addons/tsl/display/BloomNode.js`, replacing `UnrealBloomPass`.

The trap: both of those objects are built for a daylit sun. Everything here is a moon at low
elevation and low intensity, and the exposure has to come down with it (the official ocean
example runs exposure at 0.1). Expect to fight them.

### P3 — the modern render features

In value order for this specific image:

- **SSR** on the wet terrace and the lagoon shallows — gap 8, and the thing that welds the warm
  interior to the cool exterior.
- **Volumetrics** — light shafts through the palms and from the lanterns. The target's air is
  visibly thick; the baseline's `FogExp2` cannot do shafts.
- **GTAO** replacing the disabled `SSAOPass`. HANDOFF turned SSAO off because it cost three full
  scene re-renders; GTAO is depth-normal based and far cheaper.
- **SSGI** last. Warm bounce from the firepit onto the deck and the cushions is exactly what the
  target has and what a direct-lighting-only build cannot fake.

### P3.5 — the island is part of the product

Scope note from the owner, after a reference showing an explorable Three.js tropical island
(waterfall, palms, hut, boat, free camera). The demo itself is crude — grey blocky rocks and
billboard trees, well behind where this build already is — so there is nothing to copy
technically. What matters is the *intent*: the thing worth building is a cozy, explorable
**island**, not only a lounge interior with a view out of it.

`reference/target.png` remains the visual bar. This adds reach, not a new look.

The first exterior frames ever captured of this build (`renders/p8-01-arrival.png`,
`renders/p8-01-island.png`) show why this had gone unnoticed: every framing in the review loop
pointed *out* from inside the pavilion, so nothing ever pointed at the pavilion. Three
`SHOTS` entries — `arrival`, `island`, `beach` — now exist so the exterior cannot rot unseen.

What those frames show:

- **There is no island.** The pavilion stands on a flat slab in open water, and the palms stand
  on small floating discs. This is the single biggest gap in the build.
- The back and sides are an unlit box with a flat back, exactly as HANDOFF says.
- The waterline is a hard straight edge — no beach, no surf, no transition from sea to land.
- A stray cyan element (the fountain stream) is visible from outside and reads as a glitch.

In value order: terrain first (a real island with a beach, land under the pavilion, and ground
for the planting to be rooted in), then the exterior shell of the pavilion, then the jagged peak
as a landmass you can see from the water rather than a distant silhouette, then a free-exploration
camera so the island can actually be walked.

The camera work is last on purpose — there is no point being able to walk somewhere that has not
been built yet.

### P5 — the interaction layer

From a 36-second recording of the same island demo. The owner's read, in order of impact:

1. **A slow aerial orbit** establishing the whole island — crater lake, jungle ring, beach ring —
   before dropping the camera in.
2. **Numbered waypoints floating in the world**, click to fly between them. A guided tour.
3. **A working time-of-day control.** One click to night, and the scene relights.
4. **Cohesive stylized vegetation everywhere**, plus set dressing: stilted hut, rope bridges,
   boulders.

The conclusion worth keeping: *cozy and explorable* comes from the establishing orbit, the
waypoints and the time-of-day control — **not** from asset fidelity. That demo's assets are well
behind this build's and it still reads better as a place, because it tells you what it is and
then lets you move through it.

Both of the first two are nearly free here. `Teaser` already authors camera moves as eased
dollies between framings, and the teaser's shot list is already a tour of the good views — it
needs a click target and a fly-to, not a camera system.

**One of these should not wait for the visual phases: the time-of-day control.**

It is filed here as an interaction feature, but it is really a development tool. The same note
came out of the @techartist_ reference — that demo exposes time, sun, wind and water clarity as
live controls — and the argument is the same in both cases: the look should be a set of named
uniforms that can be swept, not constants edited by hand and recompiled. Every lighting fix this
session has been edit-reload-measure, one value at a time, and several of them (the terrace
specular, the grain weighting, the sand albedo) were only found because a number happened to get
pushed far enough to expose the real cause. A slider turns that search from a guess into a sweep,
and it is the difference between checking one value per reload and checking twenty.

It also protects the work. The blue-hour palette in HANDOFF was thrown away to reach the target's
night; with a time-of-day parameter both are positions on one axis rather than one overwriting
the other.

### P4 — the art direction, throughout

Not a phase so much as the loop that runs across all of them: render `hero`, compare to
`reference/target.png`, fix the largest remaining gap, repeat. The items above that need no new
renderer (value structure, framing, bevels, foliage) should be picked up whenever the pipeline is
in a stable state, rather than saved for the end.

---

## Rules carried over

From HANDOFF, and reinforced by everything above:

**Verify against the screen. Never mark anything done on reasoning alone.** The `setSize` bug
survived a full development cycle and five wrong hypotheses because nobody looked at a rendered
frame.

Keep it procedural and keep it in one file until that genuinely stops being practical.
