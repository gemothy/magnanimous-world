export type Track = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  streamUrl: string;
  streamContentType?: string;
  castContentId?: string;
  castUrl?: string;
  castDayUrl?: string;
  castLegacyUrl?: string;
  castContentType?: string;
  castHlsUrl?: string;
  castHlsContentType?: string;
  startAt?: number;
  endAt?: number;
  artwork?: string;
};

export type Library = {
  title: string;
  subtitle: string;
  version: string;
  tracks: Track[];
};

const DEMO_STREAM = "/audio/midnight-lagoon-demo.mp3";

export const demoLibrary: Library = {
  title: "Lagoon Lounge",
  subtitle: "The listening room is ready for your Drive library",
  version: "demo-1",
  tracks: [
    {
      id: "demo-arrival",
      title: "I. Arrival",
      artist: "Magnanimis Nocturne",
      duration: 31.3,
      streamUrl: DEMO_STREAM,
      startAt: 0,
      endAt: 31.3
    },
    {
      id: "demo-lanterns",
      title: "II. Lanterns",
      artist: "Magnanimis Nocturne",
      duration: 31.3,
      streamUrl: DEMO_STREAM,
      startAt: 31.3,
      endAt: 62.6
    },
    {
      id: "demo-still-water",
      title: "III. Still Water",
      artist: "Magnanimis Nocturne",
      duration: 31.3,
      streamUrl: DEMO_STREAM,
      startAt: 62.6,
      endAt: 93.9
    },
    {
      id: "demo-after-midnight",
      title: "IV. After Midnight",
      artist: "Magnanimis Nocturne",
      duration: 31.26,
      streamUrl: DEMO_STREAM,
      startAt: 93.9,
      endAt: 125.16
    }
  ]
};

const BEACH_NOIR_TRACKS = [
  ["01 Midnight Case on Kalakaua.mp3", 216.519979],
  ["02 Specters on the Breakwater.mp3", 323.119979],
  ["03 When the Reef Remembers.mp3", 182.839979],
  ["04 Obsidian Glow.mp3", 158.679979],
  ["05 The Day Slips Quietly Away.mp3", 210.959979],
  ["06 Second Tide of the Unseen.mp3", 228.079979],
  ["07 Unspoken Currents.mp3", 170.639979],
  ["08 Vanishing Meridian.mp3", 263.159979],
  ["09 Shoreline Secrets After Dark.mp3", 278.199979],
  ["10 Stakeout at Breakers Cove.mp3", 137.679979],
  ["11 Footsteps in the Fog.mp3", 217.319979],
  ["12 Dimming Horizons of a Hidden World.mp3", 207.999979],
  ["13 Amber Waves.mp3", 172.559979],
  ["14 Undertow.mp3", 185.519979],
  ["15 Breakers Point Confidential.mp3", 218.599979],
  ["16 Crescent Whispers.mp3", 188.159979],
  ["17 Quiet Witness.mp3", 189.079979],
  ["18 Gentle Drift.mp3", 249.279979],
  ["19 Lantern Haze on the Bay.mp3", 188.839979],
  ["20 Ghost Current.mp3", 185.879979],
  ["21 The Final Sunset.mp3", 184.959979],
  ["22 A Distant Heart.mp3", 171.999979],
  ["23 Black Sand.mp3", 186.719979],
  ["24 Orchid Perfume.mp3", 259.599979],
  ["25 Hidden Desires.mp3", 399.999979],
  ["26 Twilights Quiet Embrace.mp3", 189.959979],
  ["27 An Undoubtedly Peculiar String of Events.mp3", 189.919979],
  ["28 The Waves Remember.mp3", 170.599979],
  ["29 Silent Clues in the Trade Winds.mp3", 193.999979],
  ["30 Sunset with a Side of Shenanigans.mp3", 265.439979],
  ["31 Moonlit Drift Over Hidden Reefs.mp3", 256.879979],
  ["32 Palms Promises and Poor Decisions.mp3", 447.999979],
  ["33 The Confession.mp3", 182.639979],
  ["34 Fading Horizon of Untold Stories.mp3", 189.719979],
  ["35 Forgotten Kisses.mp3", 190.239979],
  ["36 Undercurrents of the Forgotten.mp3", 242.799979],
  ["37 Phosphor Trails Through Brine.mp3", 184.959979],
  ["38 Contraband.mp3", 223.719979],
  ["39 Lies Larceny and Late Night Mai Tais.mp3", 248.599979],
  ["40 Beneath the Coral Rim.mp3", 200.479979],
  ["41 Eternal Signals.mp3", 407.519979],
  ["42 The Kalua Files.mp3", 162.079979],
  ["43 Cipher in a Bamboo Backroom.mp3", 234.559979],
  ["44 The Phantom Surfer of Molokai.mp3", 214.679979],
  ["45 Shadows Beneath the Pier.mp3", 231.799979],
  ["46 Lagoon.mp3", 229.999979],
  ["47 Specter on the Midnight Break.mp3", 229.999979],
  ["48 The Private Eye of Waikiki.mp3", 191.679979],
  ["49 Waning Moon.mp3", 167.919979],
  ["50 Forbidden Sands.mp3", 306.919979],
  ["51 Frangipani Evidence.mp3", 248.399979],
  ["52 The Bay Where Maps Give Up.mp3", 212.359979],
  ["53 The Night Holds Its Breath.mp3", 188.079979],
  ["54 Saltwind Apparitions.mp3", 256.999979],
  ["55 Ashen Waves.mp3", 189.919979],
  ["56 Tideglass Reverie.mp3", 245.239979],
  ["57 On the Dark Shore.mp3", 157.279979],
  ["58 Salt in the Wind.mp3", 222.959979],
  ["59 Two Clues.mp3", 148.319979],
  ["60 Deception.mp3", 205.999979],
  ["61 Quietude.mp3", 341.679979],
  ["62 Forgotten Voices.mp3", 361.959979],
  ["63 Currents That Never Confess.mp3", 214.599979],
  ["64 Under the Surf.mp3", 224.519979],
  ["65 Last Sunset Over Tabu Island.mp3", 181.639979]
] as const;

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.mp3$/i, "")
    .replace(/^\d+\s+/, "")
    .trim();
}

export const beachNoirLibrary: Library = {
  title: "Lagoon Lounge",
  subtitle: "Beach Noir Revue · 65 selections · 4 hours 2 minutes",
  version: "beach-noir-revue-2026-07-24-hls-v2",
  tracks: BEACH_NOIR_TRACKS.map(([filename, duration], index) => {
    const trackNumber = String(index + 1).padStart(2, "0");
    const staticAudioUrl = `/audio/beach-noir/${trackNumber}.m4a`;
    const trackId = `beach-noir-${trackNumber}`;

    return {
      id: trackId,
      title: titleFromFilename(filename),
      artist: "mellokitty",
      duration,
      streamUrl: staticAudioUrl,
      streamContentType: 'audio/mp4; codecs="mp4a.40.2"',
      castUrl: `/cast-hls/v1/night/${trackId}.m3u8`,
      castDayUrl: `/cast-hls/v1/day/${trackId}.m3u8`,
      castLegacyUrl: staticAudioUrl,
      castContentType: "application/x-mpegurl",
      artwork: "/lagoon-lounge-icon-512.png"
    };
  })
};
