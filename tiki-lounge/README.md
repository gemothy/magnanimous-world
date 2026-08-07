# Lagoon Lounge

A minimal, television-first listening room for the Magnanimis world.

The app is a Vercel-ready Next.js experience with a full-screen moving lagoon
scene, deliberately hidden settings, and a 65-track music library. Track titles
remain internal metadata and are never rendered in the lounge.

## Experience

- Seamless 12-second 1080p lagoon loop with a still-image fallback
- Classic order, shuffle, repeat all, repeat one, seek, and volume
- Minimal previous, play/pause, and next controls that fade while listening
- Hidden room settings for scene strength, playback order, and TV actions
- `/tv` route with overscan-safe controls and optional screen wake lock
- Media Session, keyboard, audio-only AirPlay, and native Google Cast
- Native Cast hands playback to the television; the sender becomes a remote

## Music library

`Beach Noir Revue` contains 65 MP3s and runs for 4:02:11.

The original ZIP and extracted masters stay outside the deployment in
`audio-source/` and are ignored by both Git and Vercel. A matching private
Google Drive folder is the master copy. Public streaming copies live in the
project's Vercel Blob store, which provides direct CDN delivery and byte-range
requests without a separate server or Google Cloud service.

The catalog and exact durations are defined in `lib/library.ts`. The browser
loads catalog metadata from `/api/library`, then requests only the current MP3.
It never preloads the four-hour collection.

## Television playback

The normal lounge automatically looks for Google Cast receivers. When one is
available, the official Cast control appears beside the hidden-settings button.
Choosing a screen launches the custom Lagoon Lounge receiver, loads the
current selection first, then adds the rest of the 65-selection queue in small
batches. The television streams the MP3 audio and one reusable 1080p scene
independently, so the image stays sharp without duplicating the large video
inside every track. The computer or Android device is only a remote.

The receiver is hosted at
`https://tiki-lounge-beta.vercel.app/cast-receiver/index.html`. It keeps the
Cast media player visually hidden for audio playback and renders exactly one
full-screen ambient video. Day and night changes cover the scene, swap that
single video source, wait for a ready frame, and then reveal it.

Set `NEXT_PUBLIC_CAST_RECEIVER_APP_ID` to the Application ID assigned in the
Google Cast SDK Developer Console. Without that variable, the sender deliberately
falls back to Google's Default Media Receiver and the legacy combined 720p MP4
files.

Web Sender requires desktop or Android Chrome and a Cast receiver on the same
Wi-Fi. It is not supported from an iPhone browser. `/tv` remains the fallback
for televisions with a usable web browser and now focuses the Enter control for
remote navigation.

The legacy fallback Cast copies can be rebuilt with:

```bash
./scripts/build-cast-media.sh --all
```

The 65 deployable files are written to ignored
`audio-source/cast-media/`. Do not upload the hidden video master or x264 pass
logs. The existing MP3s plus the Cast library use about 918 MB of Blob storage,
so the 1 GB free allowance has roughly 82 MB of headroom.

## Run locally

```bash
npm install
npm run dev
```

Open the printed local address. The normal experience is at `/`; the
television experience is at `/tv`.

## Verify

```bash
npm run lint
npm run build
vercel blob list --prefix beach-noir-revue/ --limit 100
vercel blob list --prefix beach-noir-revue-cast/ --limit 100
```

A correct Blob response to a range request returns `206`, `Accept-Ranges:
bytes`, and `Content-Range`. Music files return `audio/mpeg`; Cast files return
`video/mp4`.

## Deploy

The project is linked to the `tiki-lounge` Vercel project. Deploy with:

```bash
vercel --prod
```

The current production alias is:

```text
https://tiki-lounge-beta.vercel.app
```

Vercel Blob is the zero-infrastructure streaming path for this private,
small-audience room. Keep an eye on the Vercel usage dashboard if the lounge is
shared broadly; the free allowance is intended for light personal use.

## Add or replace music

1. Keep the original MP3s in the private Google Drive master folder.
2. Validate filenames, duration, and decoding locally.
3. Upload streaming copies to the public Blob store:

   ```bash
   vercel blob put "path/to/track.mp3" \
     --pathname "beach-noir-revue/01 Track Name.mp3" \
     --content-type audio/mpeg \
     --cache-control-max-age 31536000
   ```

4. Update the filename and duration tuple in `lib/library.ts`.
5. Run lint, build, and a byte-range playback check before deploying.
