#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const defaultOutput = join(projectDir, "audio-source/cast-dash/v2");
const audioSourceDir = join(projectDir, "audio-source/Beach Noir Revue");
const proofRoot = join(
  projectDir,
  "audio-source/cast-hls/v4/beach-noir-01",
);
const proofCatalogPath = join(proofRoot, "catalog.json");
const expectedProofSources = {
  day: "day-loop-seedance-2.mp4",
  night: "night-loop-seedance-2.mp4",
};
const themes = ["night", "day"];
const segmentSeconds = 4;
const frameRate = 24;
const cycleSeconds = 12;
const cycleFrames = cycleSeconds * frameRate;
const defaultVideoBitrate = 3_100_000;
const defaultAudioBitrate = 144_000;
const maxPackageBytes = 640_000_000;
const maxJobs = 4;

function usage() {
  console.log(`Build the complete storage-light Lagoon Lounge MPEG-DASH package.

Usage:
  scripts/build-cast-dash.mjs [options]

Options:
  --output DIR       Package root (default: audio-source/cast-dash/v2)
  --jobs N           Parallel AAC encodes (default: ${maxJobs})
  --video-bitrate N  H.264 average bitrate in bits/s (default: ${defaultVideoBitrate})
  --audio-bitrate N  AAC bitrate in bits/s (default: ${defaultAudioBitrate})
  --force            Replace an existing validated output after the new build passes
  --validate-only    Validate the selected output without rebuilding it
  -h, --help         Show this help

The output is ready to upload beneath one CDN prefix:
  night/beach-noir-01.mpd ... night/beach-noir-65.mpd
  day/beach-noir-01.mpd   ... day/beach-noir-65.mpd
  video/{night,day}/...
  audio/beach-noir-NN/...

The script extracts the first exact 288-frame, 12.000-second cycle from each
already-proven 5 Mbps HLS/fMP4 rendition, performs one constrained two-pass
H.264 encode, then stream-copies that optimized cycle into one shared,
timestamp-correct timeline per theme.
`);
}

function parseArgs(argv) {
  const options = {
    force: false,
    jobs: maxJobs,
    output: defaultOutput,
    audioBitrate: defaultAudioBitrate,
    validateOnly: false,
    videoBitrate: defaultVideoBitrate,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      const value = argv[index + 1];
      if (!value) throw new Error("--output requires a directory");
      options.output = resolve(value);
      index += 1;
    } else if (argument === "--jobs") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 16) {
        throw new Error("--jobs must be an integer from 1 through 16");
      }
      options.jobs = value;
      index += 1;
    } else if (argument === "--video-bitrate") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1_000_000 || value > 10_000_000) {
        throw new Error(
          "--video-bitrate must be an integer from 1000000 through 10000000",
        );
      }
      options.videoBitrate = value;
      index += 1;
    } else if (argument === "--audio-bitrate") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 64_000 || value > 320_000) {
        throw new Error(
          "--audio-bitrate must be an integer from 64000 through 320000",
        );
      }
      options.audioBitrate = value;
      index += 1;
    } else if (argument === "--force") {
      options.force = true;
    } else if (argument === "--validate-only") {
      options.validateOnly = true;
    } else if (argument === "-h" || argument === "--help") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function requireCommand(command) {
  return runSync("command", ["-v", command], { shell: true }).trim();
}

function runSync(command, args, options = {}) {
  const { shell = false } = options;
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    shell,
  });
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(
      `${command} failed${detail ? `:\n${detail}` : ` with status ${result.status}`}`,
    );
  }
  return result.stdout;
}

async function run(command, args) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 16 * 1024 * 1024) {
        stderr = stderr.slice(-16 * 1024 * 1024);
      }
    });
    child.on("error", rejectPromise);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(
          new Error(
            `${command} failed (${signal || code})${stderr.trim() ? `:\n${stderr.trim()}` : ""}`,
          ),
        );
      }
    });
  });
}

function ffprobeJson(path) {
  return JSON.parse(
    runSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size,bit_rate:stream=codec_type,codec_name,profile,level,width,height,pix_fmt,r_frame_rate,sample_rate,channels,nb_frames,duration",
      "-of",
      "json",
      path,
    ]),
  );
}

function positiveDuration(path) {
  const duration = Number(ffprobeJson(path).format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine a positive duration: ${path}`);
  }
  return duration;
}

function listTracks() {
  const files = readdirSync(audioSourceDir)
    .filter((name) => /^\d{2} .+\.mp3$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (files.length !== 65) {
    throw new Error(`Expected 65 MP3 sources, found ${files.length}`);
  }
  return files.map((filename, index) => ({
    filename,
    id: `beach-noir-${String(index + 1).padStart(2, "0")}`,
    path: join(audioSourceDir, filename),
    sourceDuration: positiveDuration(join(audioSourceDir, filename)),
  }));
}

function readProofCatalog() {
  if (!existsSync(proofCatalogPath)) {
    throw new Error(`Missing proven HLS catalog: ${proofCatalogPath}`);
  }
  const catalog = JSON.parse(readFileSync(proofCatalogPath, "utf8"));
  for (const theme of themes) {
    const actual = catalog.themes?.[theme]?.source;
    if (actual !== expectedProofSources[theme]) {
      throw new Error(
        `Refusing unexpected ${theme} proof source: ${actual || "(missing)"}`,
      );
    }
    const original = join(
      projectDir,
      "design/cast-v4-proofs",
      expectedProofSources[theme],
    );
    const duration = positiveDuration(original);
    if (Math.abs(duration - 12.041667) > 0.01) {
      throw new Error(
        `${theme} approved source is ${duration.toFixed(6)}s, expected 12.041667s`,
      );
    }
  }
  return catalog;
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([A-Za-z][A-Za-z0-9:]*)="([^"]*)"/g)) {
    result[match[1]] = match[2];
  }
  return result;
}

function parseAudioMpd(mpdPath) {
  const xml = readFileSync(mpdPath, "utf8");
  const representationTag = xml.match(/<Representation\b[^>]*>/)?.[0];
  const templateTag = xml.match(/<SegmentTemplate\b[^>]*>/)?.[0];
  const timelineBody = xml.match(
    /<SegmentTimeline>([\s\S]*?)<\/SegmentTimeline>/,
  )?.[1];
  if (!representationTag || !templateTag || !timelineBody) {
    throw new Error(`Could not parse generated audio MPD: ${mpdPath}`);
  }
  const representation = attributes(representationTag);
  const template = attributes(templateTag);
  const timescale = Number(template.timescale);
  const startNumber = Number(template.startNumber || 1);
  if (!Number.isInteger(timescale) || timescale <= 0 || startNumber !== 1) {
    throw new Error(`Unexpected audio SegmentTemplate in ${mpdPath}`);
  }

  const entries = [];
  let nextStart = 0;
  for (const match of timelineBody.matchAll(/<S\b[^>]*\/>/g)) {
    const entryAttributes = attributes(match[0]);
    const duration = Number(entryAttributes.d);
    const repeat = Number(entryAttributes.r || 0);
    const start =
      entryAttributes.t === undefined ? nextStart : Number(entryAttributes.t);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(duration) ||
      duration <= 0 ||
      !Number.isInteger(repeat) ||
      repeat < 0
    ) {
      throw new Error(`Invalid audio SegmentTimeline entry in ${mpdPath}`);
    }
    entries.push({ duration, repeat, start });
    nextStart = start + duration * (repeat + 1);
  }
  if (!entries.length) {
    throw new Error(`Empty audio SegmentTimeline: ${mpdPath}`);
  }

  const segmentStarts = [];
  for (const entry of entries) {
    for (let offset = 0; offset <= entry.repeat; offset += 1) {
      segmentStarts.push(entry.start + entry.duration * offset);
    }
  }
  const durationTicks = nextStart;
  return {
    bandwidth: Number(representation.bandwidth || defaultAudioBitrate),
    codec: representation.codecs || "mp4a.40.2",
    durationSeconds: durationTicks / timescale,
    entries,
    segmentStarts,
    timescale,
  };
}

function timelineXml(entries, indent) {
  return entries
    .map((entry) => {
      const repeat = entry.repeat > 0 ? ` r="${entry.repeat}"` : "";
      return `${indent}<S t="${entry.start}" d="${entry.duration}"${repeat} />`;
    })
    .join("\n");
}

function isoDuration(seconds) {
  return `PT${seconds.toFixed(6)}S`;
}

function writeCombinedMpd({
  audio,
  outputPath,
  theme,
  trackId,
  videoBandwidth,
}) {
  const duration = isoDuration(audio.durationSeconds);
  const relativeAudio = `../audio/${trackId}`;
  const relativeVideo = `../video/${theme}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-live:2011"
     type="static"
     mediaPresentationDuration="${duration}"
     maxSegmentDuration="PT4.1S"
     minBufferTime="PT8S">
  <Period id="p0" start="PT0S" duration="${duration}">
    <AdaptationSet id="1" contentType="video" mimeType="video/mp4" startWithSAP="1" segmentAlignment="true">
      <Representation id="${theme}-1080p" codecs="avc1.640029" bandwidth="${videoBandwidth}" width="1920" height="1080" frameRate="24/1" sar="1:1">
        <SegmentTemplate timescale="12288"
                         duration="49152"
                         startNumber="1"
                         initialization="${relativeVideo}/init.mp4"
                         media="${relativeVideo}/segment-$Number%05d$.m4s" />
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="2" contentType="audio" mimeType="audio/mp4" lang="zxx" startWithSAP="1" segmentAlignment="true">
      <Representation id="${trackId}-audio" codecs="${audio.codec}" bandwidth="${audio.bandwidth}" audioSamplingRate="48000">
        <AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="2" />
        <SegmentTemplate timescale="${audio.timescale}"
                         startNumber="1"
                         initialization="${relativeAudio}/init.mp4"
                         media="${relativeAudio}/segment-$Number%05d$.m4s">
          <SegmentTimeline>
${timelineXml(audio.entries, "            ")}
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
`;
  writeFileSync(outputPath, xml);
}

function mediaSegmentNames(directory) {
  return readdirSync(directory)
    .filter((name) => /^segment-\d{5}\.m4s$/.test(name))
    .sort();
}

function directorySizeBytes(directory) {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    total += entry.isDirectory()
      ? directorySizeBytes(path)
      : statSync(path).size;
  }
  return total;
}

function peakVideoBandwidth(directory) {
  const segments = mediaSegmentNames(directory);
  if (!segments.length) throw new Error(`No video segments in ${directory}`);
  const peak = Math.max(
    ...segments.map(
      (name) => (statSync(join(directory, name)).size * 8) / segmentSeconds,
    ),
  );
  return Math.ceil(peak * 1.05);
}

function findTfdt(path) {
  const data = readFileSync(path);
  for (let index = 4; index + 16 <= data.length; index += 1) {
    if (
      data[index] !== 0x74 ||
      data[index + 1] !== 0x66 ||
      data[index + 2] !== 0x64 ||
      data[index + 3] !== 0x74
    ) {
      continue;
    }
    const version = data[index + 4];
    if (version === 0 && index + 12 <= data.length) {
      return BigInt(data.readUInt32BE(index + 8));
    }
    if (version === 1 && index + 16 <= data.length) {
      return data.readBigUInt64BE(index + 8);
    }
  }
  throw new Error(`No tfdt box found: ${path}`);
}

function requireMediaFile(path) {
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size <= 0) {
    throw new Error(`Missing or empty media file: ${path}`);
  }
}

function probeFragment(initPath, firstSegmentPath, expectedType) {
  const data = ffprobeJson(`concat:${initPath}|${firstSegmentPath}`);
  const stream = data.streams?.find(
    (candidate) => candidate.codec_type === expectedType,
  );
  if (!stream) {
    throw new Error(`No ${expectedType} stream in ${firstSegmentPath}`);
  }
  if (expectedType === "video") {
    if (
      stream.codec_name !== "h264" ||
      stream.profile !== "High" ||
      stream.level !== 41 ||
      stream.width !== 1920 ||
      stream.height !== 1080 ||
      stream.pix_fmt !== "yuv420p" ||
      stream.r_frame_rate !== "24/1"
    ) {
      throw new Error(`Unexpected shared video format in ${firstSegmentPath}`);
    }
  } else if (
    stream.codec_name !== "aac" ||
    stream.profile !== "LC" ||
    stream.sample_rate !== "48000" ||
    stream.channels !== 2
  ) {
    throw new Error(`Unexpected audio format in ${firstSegmentPath}`);
  }
}

function validatePackage(packageRoot, expectedTrackCount = 65) {
  const catalogPath = join(packageRoot, "catalog.json");
  requireMediaFile(catalogPath);
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (
    catalog.contentType !== "application/dash+xml" ||
    catalog.tracks?.length !== expectedTrackCount
  ) {
    throw new Error(`Invalid DASH catalog: ${catalogPath}`);
  }
  const sharedSeconds = Number(catalog.sharedVideoDurationSeconds);
  const expectedVideoSegments = sharedSeconds / segmentSeconds;
  if (
    !Number.isInteger(expectedVideoSegments) ||
    expectedVideoSegments < 1
  ) {
    throw new Error("Invalid shared video duration in catalog");
  }

  for (const theme of themes) {
    const directory = join(packageRoot, "video", theme);
    const initPath = join(directory, "init.mp4");
    requireMediaFile(initPath);
    const segments = mediaSegmentNames(directory);
    if (segments.length !== expectedVideoSegments) {
      throw new Error(
        `${theme} has ${segments.length} video segments, expected ${expectedVideoSegments}`,
      );
    }
    for (let index = 0; index < segments.length; index += 1) {
      const path = join(directory, segments[index]);
      requireMediaFile(path);
      const expectedTimestamp = BigInt(index * 49_152);
      const actualTimestamp = findTfdt(path);
      if (actualTimestamp !== expectedTimestamp) {
        throw new Error(
          `${theme} ${segments[index]} tfdt ${actualTimestamp}, expected ${expectedTimestamp}`,
        );
      }
    }
    probeFragment(initPath, join(directory, segments[0]), "video");
  }

  const allMpds = [];
  for (const track of catalog.tracks) {
    if (!/^beach-noir-\d{2}$/.test(track.id)) {
      throw new Error(`Invalid track id in catalog: ${track.id}`);
    }
    const audioDirectory = join(packageRoot, "audio", track.id);
    const audioInit = join(audioDirectory, "init.mp4");
    requireMediaFile(audioInit);
    const segments = mediaSegmentNames(audioDirectory);
    if (segments.length !== track.audioSegmentCount) {
      throw new Error(
        `${track.id} has ${segments.length} audio segments, expected ${track.audioSegmentCount}`,
      );
    }
    if (track.audioSegmentStarts.length !== segments.length) {
      throw new Error(`${track.id} has an invalid timestamp catalog`);
    }
    let aacDecodeOffset = 0n;
    if (segments.length > 1) {
      aacDecodeOffset =
        findTfdt(join(audioDirectory, segments[1])) -
        BigInt(track.audioSegmentStarts[1]);
      if (aacDecodeOffset < 0n || aacDecodeOffset > 4_096n) {
        throw new Error(
          `${track.id} has an unexpected AAC decode-time offset: ${aacDecodeOffset}`,
        );
      }
    }
    for (let index = 0; index < segments.length; index += 1) {
      const path = join(audioDirectory, segments[index]);
      requireMediaFile(path);
      // FFmpeg's AAC encoder signals one priming frame through the init edit.
      // Fragment 1 starts at tfdt 0; later decode times retain that small,
      // constant offset from the MPD presentation timeline.
      const expectedTimestamp =
        BigInt(track.audioSegmentStarts[index]) +
        (index === 0 ? 0n : aacDecodeOffset);
      const actualTimestamp = findTfdt(path);
      if (actualTimestamp !== expectedTimestamp) {
        throw new Error(
          `${track.id} ${segments[index]} tfdt ${actualTimestamp}, expected ${expectedTimestamp}`,
        );
      }
    }
    probeFragment(audioInit, join(audioDirectory, segments[0]), "audio");

    const requiredVideoSegments = Math.ceil(
      track.durationSeconds / segmentSeconds,
    );
    if (requiredVideoSegments > expectedVideoSegments) {
      throw new Error(`${track.id} exceeds the shared video timeline`);
    }
    for (const theme of themes) {
      const expectedRelativePath = `${theme}/${track.id}.mpd`;
      if (track[theme] !== expectedRelativePath) {
        throw new Error(`${track.id} has an invalid ${theme} manifest path`);
      }
      const mpdPath = join(packageRoot, expectedRelativePath);
      requireMediaFile(mpdPath);
      const xml = readFileSync(mpdPath, "utf8");
      const duration = isoDuration(track.durationSeconds);
      const requiredSnippets = [
        `mediaPresentationDuration="${duration}"`,
        `<Period id="p0" start="PT0S" duration="${duration}">`,
        `initialization="../video/${theme}/init.mp4"`,
        `media="../video/${theme}/segment-$Number%05d$.m4s"`,
        `initialization="../audio/${track.id}/init.mp4"`,
        `media="../audio/${track.id}/segment-$Number%05d$.m4s"`,
      ];
      for (const snippet of requiredSnippets) {
        if (!xml.includes(snippet)) {
          throw new Error(`${mpdPath} is missing ${snippet}`);
        }
      }
      allMpds.push(mpdPath);
    }
  }

  if (allMpds.length !== expectedTrackCount * themes.length) {
    throw new Error(`Expected 130 combined MPDs, found ${allMpds.length}`);
  }
  runSync("xmllint", ["--noout", ...allMpds]);

  const unexpectedMpds = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".mpd") && !allMpds.includes(path)) {
        unexpectedMpds.push(path);
      }
    }
  };
  walk(packageRoot);
  if (unexpectedMpds.length) {
    throw new Error(`Unexpected extra MPDs: ${unexpectedMpds.join(", ")}`);
  }

  return {
    audioSegments: catalog.tracks.reduce(
      (total, track) => total + track.audioSegmentCount,
      0,
    ),
    mpds: allMpds.length,
    videoSegments: expectedVideoSegments * themes.length,
  };
}

async function mapConcurrent(items, concurrency, task) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        await task(items[index], index);
      }
    },
  );
  await Promise.all(workers);
}

async function buildSharedVideo(
  theme,
  buildRoot,
  timelineSeconds,
  videoBitrate,
) {
  const proofPlaylist = join(proofRoot, "video", theme, "index.m3u8");
  requireMediaFile(proofPlaylist);
  const workDirectory = mkdtempSync(
    join(tmpdir(), `lagoon-dash-${theme}-cycle-`),
  );
  const cyclePath = join(workDirectory, "cycle.mp4");
  const optimizedCyclePath = join(workDirectory, "cycle-optimized.mp4");
  const passOnePath = join(workDirectory, "cycle-pass-1.mp4");
  const passLogPath = join(workDirectory, "x264-pass");
  const destination = join(buildRoot, "video", theme);
  mkdirSync(destination, { recursive: true });
  try {
    console.log(`Video ${theme}: extracting the proven 12-second cycle`);
    await run("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      proofPlaylist,
      "-map",
      "0:v:0",
      "-an",
      "-c:v",
      "copy",
      "-frames:v",
      String(cycleFrames),
      cyclePath,
    ]);
    const cycleProbe = ffprobeJson(cyclePath);
    const video = cycleProbe.streams?.find(
      (stream) => stream.codec_type === "video",
    );
    if (
      Number(cycleProbe.format?.duration) !== cycleSeconds ||
      Number(video?.nb_frames) !== cycleFrames
    ) {
      throw new Error(
        `${theme} proof cycle did not resolve to exactly ${cycleFrames} frames / ${cycleSeconds}s`,
      );
    }

    const gopFrames = segmentSeconds * frameRate;
    const maxRate = Math.ceil((videoBitrate * 36) / 31);
    const bufferSize = maxRate * 2;
    const encodeArguments = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      cyclePath,
      "-map",
      "0:v:0",
      "-an",
      "-frames:v",
      String(cycleFrames),
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-profile:v",
      "high",
      "-level:v",
      "4.1",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(frameRate),
      "-g",
      String(gopFrames),
      "-keyint_min",
      String(gopFrames),
      "-sc_threshold",
      "0",
      "-b:v",
      String(videoBitrate),
      "-maxrate",
      String(maxRate),
      "-bufsize",
      String(bufferSize),
      "-x264-params",
      "open-gop=0:force-cfr=1",
      "-passlogfile",
      passLogPath,
    ];
    console.log(
      `Video ${theme}: two-pass H.264 encode at ${videoBitrate} bits/s`,
    );
    await run("ffmpeg", [
      "-y",
      ...encodeArguments,
      "-pass",
      "1",
      passOnePath,
    ]);
    await run("ffmpeg", [
      "-y",
      ...encodeArguments,
      "-pass",
      "2",
      "-movflags",
      "+faststart",
      optimizedCyclePath,
    ]);
    const optimizedProbe = ffprobeJson(optimizedCyclePath);
    const optimizedVideo = optimizedProbe.streams?.find(
      (stream) => stream.codec_type === "video",
    );
    if (
      Number(optimizedProbe.format?.duration) !== cycleSeconds ||
      Number(optimizedVideo?.nb_frames) !== cycleFrames ||
      optimizedVideo?.codec_name !== "h264" ||
      optimizedVideo?.profile !== "High" ||
      optimizedVideo?.level !== 41 ||
      optimizedVideo?.width !== 1920 ||
      optimizedVideo?.height !== 1080 ||
      optimizedVideo?.pix_fmt !== "yuv420p" ||
      optimizedVideo?.r_frame_rate !== "24/1"
    ) {
      throw new Error(`Unexpected optimized ${theme} video cycle`);
    }

    console.log(
      `Video ${theme}: stream-copying one ${timelineSeconds}-second shared timeline`,
    );
    await run("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-stream_loop",
      "-1",
      "-i",
      optimizedCyclePath,
      "-map",
      "0:v:0",
      "-an",
      "-c:v",
      "copy",
      "-frames:v",
      String(timelineSeconds * frameRate),
      "-tag:v",
      "avc1",
      "-f",
      "dash",
      "-seg_duration",
      String(segmentSeconds),
      "-use_template",
      "1",
      "-use_timeline",
      "1",
      "-init_seg_name",
      "init.mp4",
      "-media_seg_name",
      "segment-$Number%05d$.m4s",
      join(destination, "index.mpd"),
    ]);
    unlinkSync(join(destination, "index.mpd"));
  } finally {
    rmSync(workDirectory, { force: true, recursive: true });
  }
}

async function buildAudioTrack(track, buildRoot, audioBitrate) {
  const destination = join(buildRoot, "audio", track.id);
  mkdirSync(destination, { recursive: true });
  const generatedMpd = join(destination, "index.mpd");
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    track.path,
    "-map",
    "0:a:0",
    "-vn",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-c:a",
    "aac",
    "-profile:a",
    "aac_low",
    "-b:a",
    String(audioBitrate),
    "-ar",
    "48000",
    "-ac",
    "2",
    "-af",
    "aresample=async=1:first_pts=0",
    "-f",
    "dash",
    "-seg_duration",
    String(segmentSeconds),
    "-use_template",
    "1",
    "-use_timeline",
    "1",
    "-init_seg_name",
    "init.mp4",
    "-media_seg_name",
    "segment-$Number%05d$.m4s",
    generatedMpd,
  ]);
  const audio = parseAudioMpd(generatedMpd);
  unlinkSync(generatedMpd);
  return audio;
}

async function buildPackage(options) {
  readProofCatalog();
  const tracks = listTracks();
  const maxDuration = Math.max(...tracks.map((track) => track.sourceDuration));
  const timelineSeconds =
    Math.ceil(maxDuration / segmentSeconds) * segmentSeconds;
  if (timelineSeconds !== 448) {
    throw new Error(
      `Expected the shared timeline to resolve to 448s, got ${timelineSeconds}s`,
    );
  }

  const outputParent = dirname(options.output);
  mkdirSync(outputParent, { recursive: true });
  if (existsSync(options.output) && !options.force) {
    throw new Error(
      `Output already exists: ${options.output}\nUse --validate-only or --force.`,
    );
  }
  const buildRoot = mkdtempSync(join(outputParent, ".cast-dash-build-"));
  let published = false;
  const cleanup = () => {
    if (!published && existsSync(buildRoot)) {
      rmSync(buildRoot, { force: true, recursive: true });
    }
  };
  process.once("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    for (const theme of themes) {
      await buildSharedVideo(
        theme,
        buildRoot,
        timelineSeconds,
        options.videoBitrate,
      );
    }
    const videoBandwidth = Object.fromEntries(
      themes.map((theme) => [
        theme,
        peakVideoBandwidth(join(buildRoot, "video", theme)),
      ]),
    );

    const builtAudio = new Array(tracks.length);
    let completedAudio = 0;
    console.log(
      `Audio: encoding 65 AAC-LC renditions at ${options.audioBitrate} bits/s with ${options.jobs} parallel job(s)`,
    );
    await mapConcurrent(tracks, options.jobs, async (track, index) => {
      builtAudio[index] = await buildAudioTrack(
        track,
        buildRoot,
        options.audioBitrate,
      );
      completedAudio += 1;
      console.log(`Audio ${completedAudio}/65: ${track.id}`);
    });

    for (const theme of themes) {
      mkdirSync(join(buildRoot, theme), { recursive: true });
    }
    const catalogTracks = tracks.map((track, index) => {
      const audio = builtAudio[index];
      for (const theme of themes) {
        writeCombinedMpd({
          audio,
          outputPath: join(buildRoot, theme, `${track.id}.mpd`),
          theme,
          trackId: track.id,
          videoBandwidth: videoBandwidth[theme],
        });
      }
      return {
        id: track.id,
        source: track.filename,
        durationSeconds: audio.durationSeconds,
        audioSegmentCount: audio.segmentStarts.length,
        audioSegmentStarts: audio.segmentStarts,
        night: `night/${track.id}.mpd`,
        day: `day/${track.id}.mpd`,
      };
    });
    writeFileSync(
      join(buildRoot, "catalog.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          contentType: "application/dash+xml",
          sharedVideoDurationSeconds: timelineSeconds,
          segmentDurationSeconds: segmentSeconds,
          packageMaxBytes: maxPackageBytes,
          targetAudioBitrate: options.audioBitrate,
          targetVideoBitrate: options.videoBitrate,
          video: {
            night: {
              bandwidth: videoBandwidth.night,
              path: "video/night",
              source: expectedProofSources.night,
            },
            day: {
              bandwidth: videoBandwidth.day,
              path: "video/day",
              source: expectedProofSources.day,
            },
          },
          tracks: catalogTracks,
        },
        null,
        2,
      )}\n`,
    );

    console.log("Validation: checking every MPD, init segment, media segment, and tfdt");
    const result = validatePackage(buildRoot);
    const packageBytes = directorySizeBytes(buildRoot);
    if (packageBytes > maxPackageBytes) {
      throw new Error(
        `Package is ${packageBytes} bytes, exceeding the ${maxPackageBytes}-byte limit`,
      );
    }
    if (existsSync(options.output)) {
      rmSync(options.output, { force: true, recursive: true });
    }
    renameSync(buildRoot, options.output);
    published = true;
    console.log(
      `Validation passed: ${result.mpds} MPDs, ${result.videoSegments} shared video segments, ${result.audioSegments} audio segments`,
    );
    console.log(
      `Package size: ${packageBytes} bytes (${(packageBytes / 1_000_000).toFixed(3)} MB)`,
    );
    console.log(`Created: ${options.output}`);
  } finally {
    cleanup();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  for (const command of ["ffmpeg", "ffprobe", "xmllint"]) {
    requireCommand(command);
  }
  if (options.validateOnly) {
    const result = validatePackage(options.output);
    const packageBytes = directorySizeBytes(options.output);
    if (packageBytes > maxPackageBytes) {
      throw new Error(
        `Package is ${packageBytes} bytes, exceeding the ${maxPackageBytes}-byte limit`,
      );
    }
    console.log(
      `Validation passed: ${result.mpds} MPDs, ${result.videoSegments} shared video segments, ${result.audioSegments} audio segments`,
    );
    console.log(
      `Package size: ${packageBytes} bytes (${(packageBytes / 1_000_000).toFixed(3)} MB)`,
    );
    return;
  }
  await buildPackage(options);
}

main().catch((error) => {
  console.error(`DASH build failed: ${error.message}`);
  process.exitCode = 1;
});
