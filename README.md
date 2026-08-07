# Magnanimous

Monorepo for the Magnanimis world — a tiki resort that is currently a party game, a
narrative mystery, and a listening room.

```bash
git clone https://github.com/gemothy/magnanimous-world.git
cd magnanimous-world
```

## What's here

| | |
|---|---|
| **`lounge-party/`** | **Liar's Lounge** — cast-to-TV party game. Phones are hands, the television is the table. Node + websockets. |
| **`gone-away/`** | **Gone Away** — first-person narrative mystery. Single-file Three.js, an in-engine teaser, and a long handoff. |
| **`tiki-lounge/`** | **Lagoon Lounge** — Next.js listening room with a working Chromecast receiver and the 65-track Beach Noir Revue. |
| root `app/`, `components/` | The Magnanimous brand site (Next.js). |

### Start here

```bash
cd lounge-party && npm install && npm start
# television:  http://localhost:7777/tv
# phone:       http://localhost:7777/play   (use your LAN IP from a real phone)
npm test                      # rules engine, 32 assertions
node server/test-e2e.mjs      # full socket protocol, 26 assertions
```

`gone-away` needs no install — serve it and open it:

```bash
cd gone-away && python3 -m http.server 8791     # then /index.html
```

It must be served over http; on `file://` the soundtrack fetch is blocked and it falls
back to a generative loop.

## Shared media

`gone-away` and `lounge-party` both **symlink** into `tiki-lounge/public/` rather than
copying, so the audio and video exist once. The links are relative and survive being
cloned to any path.

- `tiki-lounge/public/audio/beach-noir/` — 65 tracks, 4h 02m
- `tiki-lounge/public/video/` — the midnight-lagoon loops

`gone-away/audio/library.json` is generated from `tiki-lounge/lib/library.ts`, which stays
the single source of truth for the catalogue:

```bash
cd gone-away && node scripts/build-library.mjs
```

## Not in this repo, on purpose

- **`magnanimis/` and `magnanimis-labels/`** — already their own repository at
  [gemothy/magnanimis](https://github.com/gemothy/magnanimis) (the second is a linked
  worktree of it). Clone that separately alongside this one.
- **`tiki-lounge/audio-source/`** — 3.2 GB of masters and encode ladders. Lives in Drive
  and Vercel Blob; regenerate deployables with `tiki-lounge/scripts/build-cast-*.sh`.
- **`tiki-lounge/design/`** — 315 MB of video masters and proofs.
- **`.env*` and `.vercel/`** — every app has a committed `.env.example`; copy and fill it.
- **`node_modules/`, `.next/`** — obviously.

## Where each project stands

- **Liar's Lounge** — playable end to end. Not yet wired to the Cast receiver, no host
  controls, and it runs on a local websocket server (Vercel can't hold sockets, so the
  transport is deliberately isolated to one file). See its README.
- **Gone Away** — one room, atmospheric, with a 72-second teaser. No characters, no
  dialogue, and the core "repair is investigation" verb is not built. See its HANDOFF.md,
  which is long and worth reading before touching the renderer.
- **Lagoon Lounge** — shipping at `tiki-lounge-beta.vercel.app`.
