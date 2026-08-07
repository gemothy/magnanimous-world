# Gone Away — vertical slice handoff

A single-file, first-person browser build of the Magnanimis lounge. No external assets: all
geometry, textures, and audio are generated at runtime. Three.js r128 loads from a CDN.

## Run it

Open `gone-away-slice.html` directly in a browser. Everything works from `file://` except
loading a soundtrack by URL, which needs a server:

```
python3 -m http.server 8000     # then open http://localhost:8000/gone-away-slice.html
```

Click **Enter** to lock the cursor. WASD to walk, mouse to look, **E** to interact, **Esc** to
release. Touch is supported: drag the left half to walk, the right half to look, tap to interact.

## Soundtrack

Three ways to get your music in, in order of convenience:

1. Drag an audio file anywhere onto the page.
2. Use "choose a track" on the title screen.
3. Set `CFG.musicUrl` to a path (e.g. `'./music/theme.mp3'`) and serve over http.

Until a track is loaded, the record player runs a generative exotica loop so the room isn't
silent. Music is filtered and attenuated by distance from the record player, with a slow wow on
playback rate — it should sound like a record playing in a room, not like a menu track.

## What's in the slice

| System | Where | Notes |
|---|---|---|
| Pavilion | `the pavilion` section | Floor, back/side walls, carved pillars, beams, thatch roof, terrace |
| Firepit | `firepit` | Bronze bowl, 150-particle flame, flickering shadow-casting point light |
| Seating | `sofa()` | Three sofas; each registers a seat and a "Sit" interaction |
| Record player | `record player` | Spinning platter, tonearm swings in on play, drives the music bus |
| Valve + fountain | `valve, pipes, fountain` | Turning the wheel reveals the fountain water, spray particles, and water audio |
| Locked door | `locked door` | Story tease; rattles and prints a line |
| Lagoon | `water` | Custom shader: 4 analytic wave sets, moon specular path, firelight spill, manual exp2 fog |
| Sky | `sky` | Gradient dome, 900 stars, moon sprite, drifting clouds, island silhouette, shore lights |
| Audio | `Sound` | Procedural surf, wind, insects, fire bed, random crackles, footsteps; all distance-mixed |

## Tuning

Everything worth adjusting is in `CFG` at the top: walk speed, head bob, look sensitivity, FOV
(walking vs seated), fog color and density, interaction reach, eye height.

Light levels are in the `lights` section. The look lives almost entirely in the balance between
`fireLight.intensity` (warm, flickering, inside) and `moonLight.intensity` (cool, outside) —
change those two before changing anything else.

## Open issue: motion comfort (start here)

Reported as dizzying in testing. Everything below was changed blind — none of it has been
looked at. Verify against the screen before trusting any of it.

Comfort settings are exposed on the title screen: head bob (off by default), film grain,
view width, and look sensitivity. The underlying values are `CFG.bobAmp`, `CFG.hfovWalk`,
`CFG.lookGainMouse` / `CFG.lookGainTouch`.

Suspects, in the order worth testing:

1. **Frame rate.** Anything under ~50fps is nauseating in first person. Profile before tuning
   anything else — the water plane and the fire's point-light shadow are the two costs.
2. **Field of view.** Too narrow causes sim sickness; too wide distorts the edges. `vFov()`
   derives vertical from a target horizontal fov and clamps to 48–68.
3. **Head bob.** Off by default now. Confirm it stays off.
4. **Movement smoothing.** `CFG.accel` / `CFG.damping` — if the camera keeps drifting after
   the key is released, raise both.
5. **Overlays.** The grain and vignette divs composite over the canvas every frame. Delete
   both temporarily to rule them out.

## Known gaps

- No collision on the fountain spout or the bar stools beyond a circle radius.
- Shadows are disabled on touch devices; the fire's point-light shadow is the expensive one.
- The generative music loop is a placeholder for pacing, not a composition.
- No save state, no menu options, no graphics settings.

## Next tasks

- [ ] Fix motion comfort — see the section above; this blocks everything else
- [ ] Swap the placeholder loop for the real soundtrack and mix levels against the ambience
- [ ] Add the bartender: a static NPC at the bar with a look-at and one line of dialogue
- [ ] Second interaction pass: the vinyl stack should be selectable, one record per track
- [ ] Add a second room (the passage behind the back wall) to test level streaming
- [ ] Build the case-board UI shell — no logic, just the frame the deduction system will use
- [ ] Performance pass: instance the rafters and palms, drop water plane segments on low-end

## Continuing in Claude Code

Claude Code is a terminal agent that can edit these files directly, which suits a build this
size better than a chat window.

```
npm install -g @anthropic-ai/claude-code
mkdir gone-away && cd gone-away
# copy gone-away-slice.md, HANDOFF.md, and gone-away-pitch.md in here
git init && git add -A && git commit -m "vertical slice"
claude
```

Then paste this as the first message:

> Read HANDOFF.md and gone-away-pitch.md, then open gone-away-slice.html. It's a single-file
> Three.js first-person scene — the lounge of a Caribbean resort at night, for a narrative
> mystery game. Everything is procedural; there are no assets.
>
> The scene was built without anyone able to see it render, and it currently feels dizzying to
> play. Your first job is to actually look at it: open it in a headless browser, screenshot it
> at several camera angles, and measure the frame rate. Report what you see before changing
> anything. Then write a plan to tasks/todo.md and check it with me.
>
> After that, work the "Next tasks" list one item at a time, and verify every change with a
> screenshot before marking it done. Do not mark anything complete on reasoning alone.

Two things worth telling it up front: keep the build single-file until it stops being
practical, and keep everything procedural — the moment the project takes on binary assets, it
stops being editable from a terminal.
