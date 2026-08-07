#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const publicDir = join(projectDir, "public");
const audioDir = join(publicDir, "audio", "beach-noir");
const packageDir = join(publicDir, "cast-hls", "v1");
const castVideoDir = join(publicDir, "cast-media");
const sources = {
  night: join(
    projectDir,
    "design",
    "cast-v4-proofs",
    "night-loop-seedance-2.mp4",
  ),
  day: join(
    projectDir,
    "design",
    "cast-v4-proofs",
    "day-loop-seedance-2.mp4",
  ),
};
const publishedVideo = {
  night: "midnight-lagoon-cast.ts",
  day: "midnight-lagoon-day-cast.ts",
};
const cycleSeconds = 12;
const segmentSeconds = 2;

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed:\n${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
  return result.stdout;
}

function requireFile(path) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Missing file: ${path}`);
  }
}

function parseSingleFilePlaylist(
  path,
  { requireMap = true } = {},
) {
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const mapLine = lines.find((line) => line.startsWith("#EXT-X-MAP:"));
  const mapRange = mapLine?.match(/BYTERANGE="([^"]+)"/)?.[1];
  if (requireMap && !mapRange) {
    throw new Error(`Missing single-file init byte range: ${path}`);
  }

  const segments = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("#EXTINF:")) continue;
    const duration = Number(lines[index].slice(8).split(",")[0]);
    const rangeLine = lines[index + 1];
    const uri = lines[index + 2];
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !rangeLine?.startsWith("#EXT-X-BYTERANGE:") ||
      !uri ||
      uri.startsWith("#")
    ) {
      throw new Error(`Invalid single-file segment near line ${index + 1}: ${path}`);
    }
    segments.push({
      duration,
      range: rangeLine.slice("#EXT-X-BYTERANGE:".length),
    });
  }
  if (!segments.length) throw new Error(`No segments in ${path}`);
  return { mapRange, segments };
}

function playlist({
  mapRange,
  mediaUri,
  segments,
  discontinuityEvery = 0,
}) {
  const mapLine = mapRange
    ? `#EXT-X-MAP:URI="${mediaUri}",BYTERANGE="${mapRange}"`
    : null;
  const targetDuration = Math.ceil(
    Math.max(...segments.map((segment) => segment.duration)),
  );
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    ...(mapLine ? [mapLine] : []),
  ];
  segments.forEach((segment, index) => {
    if (
      discontinuityEvery > 0 &&
      index > 0 &&
      index % discontinuityEvery === 0
    ) {
      lines.push("#EXT-X-DISCONTINUITY");
      if (mapLine) lines.push(mapLine);
    }
    lines.push(
      `#EXTINF:${segment.duration.toFixed(6)},`,
      `#EXT-X-BYTERANGE:${segment.range}`,
      mediaUri,
    );
  });
  lines.push("#EXT-X-ENDLIST", "");
  return lines.join("\n");
}

function repeatedVideoSegments(template, requiredDuration) {
  const segments = [];
  let duration = 0;
  while (duration + 0.05 < requiredDuration) {
    for (const segment of template) {
      segments.push(segment);
      duration += segment.duration;
      if (duration + 0.05 >= requiredDuration) break;
    }
  }
  return segments;
}

function addCycleDiscontinuities(segments) {
  const result = [];
  let nextBoundary = cycleSeconds;
  let elapsed = 0;
  for (const segment of segments) {
    if (
      result.length > 0 &&
      elapsed >= nextBoundary - (segmentSeconds / 2)
    ) {
      result.push({ discontinuity: true });
      nextBoundary += cycleSeconds;
    }
    result.push(segment);
    elapsed += segment.duration;
  }
  return result;
}

function playlistWithTimedDiscontinuities({
  mapRange,
  mediaUri,
  segments,
}) {
  const mapLine =
    `#EXT-X-MAP:URI="${mediaUri}",BYTERANGE="${mapRange}"`;
  const decorated = addCycleDiscontinuities(segments);
  const mediaSegments = decorated.filter((entry) => !entry.discontinuity);
  const targetDuration = Math.ceil(
    Math.max(...mediaSegments.map((segment) => segment.duration)),
  );
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    mapLine,
  ];
  for (const entry of decorated) {
    if (entry.discontinuity) {
      lines.push("#EXT-X-DISCONTINUITY", mapLine);
      continue;
    }
    lines.push(
      `#EXTINF:${entry.duration.toFixed(6)},`,
      `#EXT-X-BYTERANGE:${entry.range}`,
      mediaUri,
    );
  }
  lines.push("#EXT-X-ENDLIST", "");
  return lines.join("\n");
}

function master(theme, trackId) {
  return [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="music",NAME="Lagoon Lounge",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="zxx",URI="../audio/${trackId}.m3u8"`,
    '#EXT-X-STREAM-INF:BANDWIDTH=5800000,AVERAGE-BANDWIDTH=5200000,CODECS="avc1.640029,mp4a.40.2",RESOLUTION=1920x1080,FRAME-RATE=24.000,AUDIO="music"',
    `../video/${theme}/${trackId}.m3u8`,
    "",
  ].join("\n");
}

function directoryBytes(directory) {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    total += entry.isDirectory() ? directoryBytes(path) : statSync(path).size;
  }
  return total;
}

for (const command of ["ffmpeg", "ffprobe"]) run(command, ["-version"]);
for (const path of Object.values(sources)) requireFile(path);

const audioFiles = readdirSync(audioDir)
  .filter((name) => /^\d{2}\.m4a$/.test(name))
  .sort();
if (audioFiles.length !== 65) {
  throw new Error(`Expected 65 public M4A files, found ${audioFiles.length}`);
}

const workRoot = mkdtempSync(join(tmpdir(), "lagoon-compact-hls-"));
const buildPublic = join(workRoot, "public");
const buildAudio = join(buildPublic, "audio", "beach-noir");
const buildVideo = join(buildPublic, "cast-media");
const buildPackage = join(buildPublic, "cast-hls", "v1");
mkdirSync(buildAudio, { recursive: true });
mkdirSync(buildVideo, { recursive: true });

const videoTemplates = {};
for (const theme of ["night", "day"]) {
  const themeWork = join(workRoot, `video-${theme}`);
  mkdirSync(themeWork, { recursive: true });
  const outputVideo = join(buildVideo, publishedVideo[theme]);
  const rawPlaylist = join(themeWork, "index.m3u8");
  run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    sources[theme],
    "-t",
    String(cycleSeconds),
    "-map",
    "0:v:0",
    "-an",
    "-vf",
    "fps=24",
    "-frames:v",
    "288",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-level:v",
    "4.1",
    "-g",
    "48",
    "-keyint_min",
    "48",
    "-sc_threshold",
    "0",
    "-f",
    "hls",
    "-hls_time",
    String(segmentSeconds),
    "-hls_playlist_type",
    "vod",
    "-hls_segment_type",
    "mpegts",
    "-hls_segment_options",
    "mpegts_flags=+initial_discontinuity",
    "-hls_flags",
    "single_file+independent_segments",
    "-hls_segment_filename",
    outputVideo,
    rawPlaylist,
  ]);
  const parsedVideo = parseSingleFilePlaylist(rawPlaylist, {
    requireMap: false,
  });
  parsedVideo.segments = parsedVideo.segments.filter(
    (segment) => segment.duration >= 0.1,
  );
  const parsedDuration = parsedVideo.segments.reduce(
    (total, segment) => total + segment.duration,
    0,
  );
  if (Math.abs(parsedDuration - cycleSeconds) > 0.05) {
    throw new Error(
      `${theme} loop is ${parsedDuration}s after removing unsupported sub-0.1s fragments`,
    );
  }
  videoTemplates[theme] = parsedVideo;
}

const trackData = [];
for (const filename of audioFiles) {
  const trackNumber = filename.slice(0, 2);
  const trackId = `beach-noir-${trackNumber}`;
  const audioWork = join(workRoot, `audio-${trackNumber}`);
  mkdirSync(audioWork, { recursive: true });
  const outputAudio = join(buildAudio, filename);
  const rawPlaylist = join(audioWork, "index.m3u8");
  run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    join(audioDir, filename),
    "-map",
    "0:a:0",
    "-c:a",
    "copy",
    "-f",
    "hls",
    "-hls_time",
    String(segmentSeconds),
    "-hls_playlist_type",
    "vod",
    "-hls_segment_type",
    "fmp4",
    "-hls_flags",
    "single_file+independent_segments",
    "-hls_segment_filename",
    outputAudio,
    rawPlaylist,
  ]);

  const parsedAudio = parseSingleFilePlaylist(rawPlaylist);
  parsedAudio.segments = parsedAudio.segments.filter(
    (segment) => segment.duration >= 0.1,
  );
  const duration = parsedAudio.segments.reduce(
    (total, segment) => total + segment.duration,
    0,
  );
  trackData.push({
    duration,
    id: trackId,
    number: trackNumber,
    parsedAudio,
  });
}

for (const track of trackData) {
  const audioPlaylistDir = join(buildPackage, "audio");
  mkdirSync(audioPlaylistDir, { recursive: true });
  writeFileSync(
    join(audioPlaylistDir, `${track.id}.m3u8`),
    playlistWithTimedDiscontinuities({
      mapRange: track.parsedAudio.mapRange,
      mediaUri: `../../../audio/beach-noir/${track.number}.m4a`,
      segments: track.parsedAudio.segments,
    }),
  );

  for (const theme of ["night", "day"]) {
    const videoPlaylistDir = join(buildPackage, "video", theme);
    const masterDir = join(buildPackage, theme);
    mkdirSync(videoPlaylistDir, { recursive: true });
    mkdirSync(masterDir, { recursive: true });
    const template = videoTemplates[theme];
    const repeated = repeatedVideoSegments(
      template.segments,
      track.duration,
    );
    writeFileSync(
      join(videoPlaylistDir, `${track.id}.m3u8`),
      playlist({
        discontinuityEvery: template.segments.length,
        mapRange: template.mapRange,
        mediaUri: `../../../../cast-media/${publishedVideo[theme]}`,
        segments: repeated,
      }),
    );
    writeFileSync(
      join(masterDir, `${track.id}.m3u8`),
      master(theme, track.id),
    );
  }
}

for (const proof of [
  join(buildPackage, "night", "beach-noir-01.m3u8"),
  join(buildPackage, "day", "beach-noir-01.m3u8"),
  join(buildPackage, "night", "beach-noir-32.m3u8"),
  join(buildPackage, "day", "beach-noir-32.m3u8"),
]) {
  run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_name,profile,level,width,height,sample_rate,channels",
    "-of",
    "json",
    proof,
  ]);
}

const packageBytes = directoryBytes(buildPackage);
const audioBytes = directoryBytes(buildAudio);
const videoBytes = directoryBytes(buildVideo);
if (packageBytes + audioBytes + videoBytes > 95_000_000) {
  throw new Error(
    `Compact media exceeds 95MB: ${packageBytes + audioBytes + videoBytes}`,
  );
}

const priorPackage = `${packageDir}.previous`;
const nextPackage = `${packageDir}.next`;
rmSync(priorPackage, { force: true, recursive: true });
rmSync(nextPackage, { force: true, recursive: true });
mkdirSync(dirname(packageDir), { recursive: true });
cpSync(buildPackage, nextPackage, { recursive: true });
if (existsSync(packageDir)) renameSync(packageDir, priorPackage);
renameSync(nextPackage, packageDir);
for (const filename of audioFiles) {
  copyFileSync(join(buildAudio, filename), join(audioDir, filename));
}
for (const theme of ["night", "day"]) {
  mkdirSync(castVideoDir, { recursive: true });
  copyFileSync(
    join(buildVideo, publishedVideo[theme]),
    join(castVideoDir, publishedVideo[theme]),
  );
}
rmSync(priorPackage, { force: true, recursive: true });
rmSync(workRoot, { force: true, recursive: true });

console.log(
  `Compact HLS ready: 130 masters, 65 shared audio files, 2 shared video loops`,
);
console.log(
  `Media bytes: package=${packageBytes}, audio=${audioBytes}, video=${videoBytes}, total=${packageBytes + audioBytes + videoBytes}`,
);
