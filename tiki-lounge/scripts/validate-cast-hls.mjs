#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(
  process.argv[2] ?? join(projectDir, "audio-source/cast-hls/v4"),
);
const trackId = process.argv[3] ?? "beach-noir-01";
const trackDir = join(packageRoot, trackId);
const failures = [];
const warnings = [];
const checks = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function pass(message) {
  checks.push(message);
}

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    fail(`${label} is missing: ${path}`);
    return false;
  }
  return true;
}

function readPlaylist(path, label) {
  if (!requireFile(path, label)) return null;
  const text = readFileSync(path, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines[0] !== "#EXTM3U") {
    fail(`${label} does not start with #EXTM3U`);
  }
  return { path, text, lines };
}

function attributeList(line) {
  const colon = line.indexOf(":");
  const source = colon === -1 ? "" : line.slice(colon + 1);
  const attributes = {};
  const pattern = /(?:^|,)([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    attributes[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return attributes;
}

function masterVariants(playlist) {
  const variants = [];
  playlist.lines.forEach((line, index) => {
    if (!line.startsWith("#EXT-X-STREAM-INF:")) return;
    const uri = playlist.lines[index + 1];
    if (!uri || uri.startsWith("#")) {
      fail(`Variant in ${playlist.path} has no following URI`);
      return;
    }
    variants.push({ attributes: attributeList(line), uri });
  });
  return variants;
}

function parseMediaPlaylist(playlist, label) {
  const mapLine = playlist.lines.find((line) => line.startsWith("#EXT-X-MAP:"));
  const mapUri = mapLine ? attributeList(mapLine).URI : null;
  const segments = [];

  playlist.lines.forEach((line, index) => {
    if (!line.startsWith("#EXTINF:")) return;
    const duration = Number(line.slice(8).split(",")[0]);
    const uri = playlist.lines[index + 1];
    if (!Number.isFinite(duration) || duration <= 0) {
      fail(`${label} has an invalid EXTINF duration: ${line}`);
      return;
    }
    if (!uri || uri.startsWith("#")) {
      fail(`${label} has no URI after ${line}`);
      return;
    }
    segments.push({ duration, uri });
  });

  if (!playlist.lines.includes("#EXT-X-PLAYLIST-TYPE:VOD")) {
    fail(`${label} is not marked VOD`);
  }
  if (!playlist.lines.includes("#EXT-X-ENDLIST")) {
    fail(`${label} has no #EXT-X-ENDLIST`);
  }
  if (
    label.includes("video") &&
    !playlist.lines.includes("#EXT-X-INDEPENDENT-SEGMENTS")
  ) {
    fail(`${label} is not marked independently segmented`);
  }
  if (!mapUri) {
    fail(`${label} has no fMP4 #EXT-X-MAP`);
  }
  if (segments.length === 0) {
    fail(`${label} has no media segments`);
  }

  const baseDir = dirname(playlist.path);
  if (mapUri) requireFile(join(baseDir, mapUri), `${label} init segment`);
  for (const { uri } of segments) {
    if (!uri.endsWith(".m4s")) {
      fail(`${label} segment is not fMP4/CMAF-style .m4s: ${uri}`);
    }
    requireFile(join(baseDir, uri), `${label} media segment`);
  }

  const duration = segments.reduce((total, segment) => total + segment.duration, 0);
  return { ...playlist, mapUri, segments, duration };
}

function probe(path) {
  try {
    return JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "stream=index,codec_type,codec_name,profile,level,width,height,pix_fmt,r_frame_rate,sample_rate,channels",
          "-of",
          "json",
          path,
        ],
        { encoding: "utf8" },
      ),
    );
  } catch (error) {
    fail(`ffprobe failed for ${path}: ${error.message}`);
    return { streams: [] };
  }
}

function checkMaster(path, label, expectedThemes) {
  const playlist = readPlaylist(path, label);
  if (!playlist) return null;
  const variants = masterVariants(playlist);
  const audioTag = playlist.lines.find((line) =>
    line.startsWith("#EXT-X-MEDIA:TYPE=AUDIO"),
  );

  if (!playlist.lines.includes("#EXT-X-INDEPENDENT-SEGMENTS")) {
    fail(`${label} has no #EXT-X-INDEPENDENT-SEGMENTS`);
  }
  if (!audioTag) {
    fail(`${label} has no separate audio rendition`);
  } else {
    const audio = attributeList(audioTag);
    if (audio.URI !== "audio/index.m3u8") {
      fail(`${label} audio URI is ${audio.URI}, expected audio/index.m3u8`);
    }
    if (audio["GROUP-ID"] !== "music") {
      fail(`${label} audio group is ${audio["GROUP-ID"]}, expected music`);
    }
  }
  if (variants.length !== expectedThemes.length) {
    fail(
      `${label} has ${variants.length} variants, expected ${expectedThemes.length}`,
    );
  }

  variants.forEach((variant, index) => {
    const expectedTheme = expectedThemes[index];
    const expectedUri = `video/${expectedTheme}/index.m3u8`;
    if (variant.uri !== expectedUri) {
      fail(`${label} variant ${index + 1} is ${variant.uri}, expected ${expectedUri}`);
    }
    if (variant.attributes.CODECS !== "avc1.640029,mp4a.40.2") {
      fail(`${label} declares unexpected CODECS: ${variant.attributes.CODECS}`);
    }
    if (variant.attributes.RESOLUTION !== "1920x1080") {
      fail(`${label} declares unexpected resolution: ${variant.attributes.RESOLUTION}`);
    }
    if (variant.attributes["FRAME-RATE"] !== "24.000") {
      fail(`${label} declares unexpected frame rate: ${variant.attributes["FRAME-RATE"]}`);
    }
    if (variant.attributes.AUDIO !== "music") {
      fail(`${label} variant does not reference the music audio group`);
    }
    requireFile(join(dirname(path), variant.uri), `${label} variant playlist`);
  });

  pass(`${label}: ${variants.length} expected variant(s) and separate audio`);
  return playlist;
}

function checkVideoProbe(playlistPath, label) {
  const data = probe(playlistPath);
  const stream = data.streams?.find((entry) => entry.codec_type === "video");
  if (!stream) {
    fail(`${label} has no probed video stream`);
    return;
  }
  if (stream.codec_name !== "h264") fail(`${label} codec is ${stream.codec_name}, not h264`);
  if (stream.profile !== "High") fail(`${label} profile is ${stream.profile}, not High`);
  if (stream.level !== 41) fail(`${label} level is ${stream.level}, not 4.1`);
  if (stream.width !== 1920 || stream.height !== 1080) {
    fail(`${label} size is ${stream.width}x${stream.height}, not 1920x1080`);
  }
  if (stream.pix_fmt !== "yuv420p") {
    fail(`${label} pixel format is ${stream.pix_fmt}, not yuv420p`);
  }
  if (stream.r_frame_rate !== "24/1") {
    fail(`${label} frame rate is ${stream.r_frame_rate}, not 24/1`);
  }
  pass(`${label}: H.264 High 4.1, 1920x1080, 24 fps, yuv420p`);
}

function checkAudioProbe(playlistPath) {
  const data = probe(playlistPath);
  const stream = data.streams?.find((entry) => entry.codec_type === "audio");
  if (!stream) {
    fail("Audio playlist has no probed audio stream");
    return;
  }
  if (stream.codec_name !== "aac") fail(`Audio codec is ${stream.codec_name}, not AAC`);
  if (stream.profile !== "LC") fail(`Audio profile is ${stream.profile}, not LC`);
  if (stream.sample_rate !== "48000") {
    fail(`Audio sample rate is ${stream.sample_rate}, not 48000`);
  }
  if (stream.channels !== 2) fail(`Audio channel count is ${stream.channels}, not 2`);
  pass("Audio: AAC-LC, 48 kHz, stereo");
}

function bytesForMedia(media) {
  const baseDir = dirname(media.path);
  const paths = [
    ...(media.mapUri ? [join(baseDir, media.mapUri)] : []),
    ...media.segments.map(({ uri }) => join(baseDir, uri)),
  ];
  return paths.reduce(
    (total, path) => total + (existsSync(path) ? statSync(path).size : 0),
    0,
  );
}

function bitrate(media) {
  return media.duration > 0 ? (bytesForMedia(media) * 8) / media.duration : 0;
}

function peakSegmentBitrate(media) {
  const baseDir = dirname(media.path);
  return Math.max(
    ...media.segments.map(
      ({ duration, uri }) => (statSync(join(baseDir, uri)).size * 8) / duration,
    ),
  );
}

function compareAlignment(audio, video, label) {
  if (audio.segments.length !== video.segments.length) {
    fail(
      `${label} has ${video.segments.length} segments; audio has ${audio.segments.length}`,
    );
    return;
  }

  let audioBoundary = 0;
  let videoBoundary = 0;
  let maximumDelta = 0;
  for (let index = 0; index < audio.segments.length - 1; index += 1) {
    audioBoundary += audio.segments[index].duration;
    videoBoundary += video.segments[index].duration;
    maximumDelta = Math.max(maximumDelta, Math.abs(audioBoundary - videoBoundary));
  }

  if (maximumDelta > 0.075) {
    fail(`${label}/audio boundary drift reaches ${maximumDelta.toFixed(3)}s`);
  } else {
    pass(`${label}/audio boundaries aligned within ${maximumDelta.toFixed(3)}s`);
  }
}

const rootCatalogPath = join(packageRoot, "catalog.json");
const trackCatalogPath = join(trackDir, "catalog.json");
requireFile(rootCatalogPath, "Root catalog");
requireFile(trackCatalogPath, "Track catalog");

let trackCatalog = null;
if (existsSync(trackCatalogPath)) {
  try {
    trackCatalog = JSON.parse(readFileSync(trackCatalogPath, "utf8"));
  } catch (error) {
    fail(`Track catalog is not valid JSON: ${error.message}`);
  }
}

checkMaster(join(trackDir, "night.m3u8"), "Night master", ["night"]);
checkMaster(join(trackDir, "day.m3u8"), "Day master", ["day"]);
const dualMaster = checkMaster(
  join(trackDir, "master.m3u8"),
  "Experimental dual-theme master",
  ["night", "day"],
);
if (
  dualMaster &&
  !dualMaster.text.includes("EXPERIMENTAL_DUAL_THEME_DO_NOT_USE_FOR_ABR")
) {
  fail("Dual-theme master is not marked experimental");
}

const audioPlaylist = readPlaylist(join(trackDir, "audio/index.m3u8"), "Audio media");
const nightPlaylist = readPlaylist(
  join(trackDir, "video/night/index.m3u8"),
  "Night video media",
);
const dayPlaylist = readPlaylist(
  join(trackDir, "video/day/index.m3u8"),
  "Day video media",
);

const audio = audioPlaylist
  ? parseMediaPlaylist(audioPlaylist, "Audio media")
  : null;
const night = nightPlaylist
  ? parseMediaPlaylist(nightPlaylist, "Night video media")
  : null;
const day = dayPlaylist
  ? parseMediaPlaylist(dayPlaylist, "Day video media")
  : null;

if (audio && night && day) {
  const durationSpread =
    Math.max(audio.duration, night.duration, day.duration) -
    Math.min(audio.duration, night.duration, day.duration);
  if (durationSpread > 0.1) {
    fail(`Rendition durations differ by ${durationSpread.toFixed(3)}s`);
  } else {
    pass(
      `Rendition durations aligned: audio ${audio.duration.toFixed(3)}s, ` +
        `night ${night.duration.toFixed(3)}s, day ${day.duration.toFixed(3)}s`,
    );
  }

  compareAlignment(audio, night, "Night video");
  compareAlignment(audio, day, "Day video");

  const nightBitrate = bitrate(night);
  const dayBitrate = bitrate(day);
  const audioBitrate = bitrate(audio);
  const audioPeakBitrate = peakSegmentBitrate(audio);
  if (nightBitrate < 4_000_000 || nightBitrate > 6_000_000) {
    fail(`Night video average bitrate is ${(nightBitrate / 1e6).toFixed(2)} Mbps`);
  } else {
    pass(`Night video average bitrate: ${(nightBitrate / 1e6).toFixed(2)} Mbps`);
  }

  const dayIsPlaceholder = trackCatalog?.themes?.day?.placeholder === true;
  if (dayBitrate < 4_000_000 || dayBitrate > 6_000_000) {
    const message = `Day video average bitrate is ${(dayBitrate / 1e6).toFixed(2)} Mbps`;
    if (dayIsPlaceholder) warn(`${message}; accepted only because it is a static placeholder`);
    else fail(message);
  } else {
    pass(`Day video average bitrate: ${(dayBitrate / 1e6).toFixed(2)} Mbps`);
  }
  if (audioBitrate < 175_000 || audioBitrate > 215_000) {
    fail(`Audio average bitrate is ${(audioBitrate / 1000).toFixed(1)} kbps`);
  } else {
    pass(`Audio average bitrate: ${(audioBitrate / 1000).toFixed(1)} kbps`);
  }

  for (const [theme, media] of [
    ["night", night],
    ["day", day],
  ]) {
    const master = readPlaylist(join(trackDir, `${theme}.m3u8`), `${theme} master`);
    const declared = master ? Number(masterVariants(master)[0]?.attributes.BANDWIDTH) : 0;
    const observed = peakSegmentBitrate(media) + audioPeakBitrate;
    if (!Number.isFinite(declared) || declared < observed) {
      fail(
        `${theme} master BANDWIDTH ${declared} is below observed peak ` +
          `${Math.ceil(observed)}`,
      );
    } else {
      pass(
        `${theme} master BANDWIDTH covers the observed audio/video segment peak`,
      );
    }
  }

  for (const [label, media] of [
    ["Audio", audio],
    ["Night video", night],
    ["Day video", day],
  ]) {
    const nonFinalSegments = media.segments.slice(0, -1);
    const badSegment = nonFinalSegments.find(
      ({ duration }) => Math.abs(duration - 4) > 0.025,
    );
    if (badSegment) {
      fail(`${label} has a non-final segment lasting ${badSegment.duration.toFixed(3)}s`);
    } else {
      pass(`${label}: four-second segment cadence`);
    }
  }
}

checkAudioProbe(join(trackDir, "audio/index.m3u8"));
checkVideoProbe(join(trackDir, "video/night/index.m3u8"), "Night video");
checkVideoProbe(join(trackDir, "video/day/index.m3u8"), "Day video");

console.log(`Cast HLS validation: ${trackDir}`);
for (const message of checks) console.log(`  PASS  ${message}`);
for (const message of warnings) console.log(`  WARN  ${message}`);
for (const message of failures) console.error(`  FAIL  ${message}`);

if (failures.length > 0) {
  console.error(`\nValidation failed with ${failures.length} error(s).`);
  process.exit(1);
}

console.log(
  `\nValidation passed with ${checks.length} checks and ${warnings.length} warning(s).`,
);
console.log(
  "Player caveat: master.m3u8 deliberately exposes night/day as equivalent " +
    "variants. Use the theme-specific night.m3u8 or day.m3u8 until selection " +
    "behavior is proven on the target Cast receiver.",
);
