#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const projectDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  ".."
);
const packageRoot = path.resolve(
  process.argv[2] || path.join(projectDir, "audio-source/cast-dash/v1")
);
const blobPrefix = (process.env.BLOB_PREFIX || "lagoon-lounge-dash-v1")
  .replace(/^\/+|\/+$/g, "");
const concurrency = Math.max(
  1,
  Math.min(24, Number.parseInt(process.env.UPLOAD_CONCURRENCY || "12", 10))
);
const refreshAudioMetadata =
  process.env.REFRESH_AUDIO_METADATA === "1";
const token = process.env.BLOB_READ_WRITE_TOKEN;

if (!token) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required.");
}

const npmGlobalRoot = execFileSync("npm", ["root", "-g"], {
  encoding: "utf8"
}).trim();
const blobSdk = path.join(
  npmGlobalRoot,
  "vercel/node_modules/@vercel/blob/dist/index.cjs"
);
const { list, put } = require(blobSdk);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files;
}

function contentType(relativePath) {
  const isAudio = relativePath.startsWith("audio/");
  if (relativePath.endsWith(".mpd")) return "application/dash+xml";
  if (relativePath.endsWith(".m4s")) {
    return isAudio ? "audio/iso.segment" : "video/iso.segment";
  }
  if (relativePath.endsWith(".mp4")) {
    return isAudio ? "audio/mp4" : "video/mp4";
  }
  return "application/octet-stream";
}

async function remoteFiles() {
  const remote = new Map();
  let cursor;

  do {
    const result = await list({
      token,
      prefix: `${blobPrefix}/`,
      limit: 1000,
      cursor
    });
    for (const blob of result.blobs) {
      remote.set(blob.pathname, blob.size);
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  return remote;
}

async function uploadWithRetry(file, pathname, relativePath) {
  const fileStat = await stat(file);
  let attempt = 0;

  while (attempt < 10) {
    attempt += 1;
    try {
      await put(pathname, createReadStream(file), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 31_536_000,
        contentType: contentType(relativePath),
        multipart: fileStat.size >= 10 * 1024 * 1024,
        token
      });
      return fileStat.size;
    } catch (error) {
      if (attempt >= 10) throw error;
      const retryAfterSeconds =
        typeof error === "object" &&
        error !== null &&
        "retryAfter" in error &&
        typeof error.retryAfter === "number"
          ? error.retryAfter
          : 0;
      const delay = retryAfterSeconds > 0
        ? (retryAfterSeconds * 1_000) + 1_000
        : Math.min(15_000, 750 * (2 ** (attempt - 1)));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return 0;
}

const rootStat = await stat(packageRoot);
if (!rootStat.isDirectory()) {
  throw new Error(`Not a directory: ${packageRoot}`);
}

const allFiles = (await walk(packageRoot)).sort();
if (!allFiles.length) {
  throw new Error(`No DASH files found in: ${packageRoot}`);
}

const existing = await remoteFiles();
const pending = [];
let skippedFiles = 0;
let skippedBytes = 0;

for (const file of allFiles) {
  const relativePath = path.relative(packageRoot, file).split(path.sep).join("/");
  const pathname = `${blobPrefix}/${relativePath}`;
  const fileStat = await stat(file);

  const mustRefreshMetadata =
    refreshAudioMetadata && relativePath.startsWith("audio/");

  if (existing.get(pathname) === fileStat.size && !mustRefreshMetadata) {
    skippedFiles += 1;
    skippedBytes += fileStat.size;
  } else {
    pending.push({ file, pathname, relativePath });
  }
}

console.log(
  `Uploading ${pending.length} DASH files with concurrency ${concurrency}` +
  ` (${skippedFiles} already verified remotely).`
);

let cursor = 0;
let uploadedFiles = 0;
let uploadedBytes = 0;

async function worker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= pending.length) return;

    const item = pending[index];
    uploadedBytes += await uploadWithRetry(
      item.file,
      item.pathname,
      item.relativePath
    );
    uploadedFiles += 1;

    if (uploadedFiles % 100 === 0 || uploadedFiles === pending.length) {
      console.log(`Uploaded ${uploadedFiles}/${pending.length} files.`);
    }
  }
}

await Promise.all(
  Array.from(
    { length: Math.min(concurrency, Math.max(1, pending.length)) },
    () => worker()
  )
);

console.log(
  `DASH upload complete: ${uploadedFiles} new files` +
  ` (${uploadedBytes} bytes), ${skippedFiles} reused` +
  ` (${skippedBytes} bytes).`
);
