#!/usr/bin/env node

import { readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const projectDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const packageRoot = path.join(projectDir, "audio-source/cast-dash/v2");
const prefix = "lagoon-lounge-dash-v2/";
const expectedFiles = 4_077;
const token = process.env.BLOB_READ_WRITE_TOKEN;
const confirmed = process.argv.includes("--confirm");

if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is required.");

async function countFiles(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      count += await countFiles(absolute);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

if (!(await stat(packageRoot)).isDirectory()) {
  throw new Error(`Local recovery package is missing: ${packageRoot}`);
}
const localFiles = await countFiles(packageRoot);
if (localFiles !== expectedFiles) {
  throw new Error(
    `Local recovery package is incomplete: expected ${expectedFiles}, found ${localFiles}`,
  );
}

const npmGlobalRoot = execFileSync("npm", ["root", "-g"], {
  encoding: "utf8",
}).trim();
const blobSdk = path.join(
  npmGlobalRoot,
  "vercel/node_modules/@vercel/blob/dist/index.cjs",
);
const { del, list } = require(blobSdk);

async function listPrefix() {
  const blobs = [];
  let cursor;
  do {
    const result = await list({
      token,
      prefix,
      limit: 1_000,
      cursor,
    });
    blobs.push(...result.blobs);
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return blobs;
}

const blobs = await listPrefix();
if (blobs.length > expectedFiles) {
  throw new Error(
    `Refusing deletion: expected at most ${expectedFiles} remote blobs, found ${blobs.length}`,
  );
}
const bytes = blobs.reduce((sum, blob) => sum + blob.size, 0);
console.log(
  `Verified ${blobs.length}/${expectedFiles} remaining remote DASH blobs (${bytes} bytes) and a complete local recovery package.`,
);

if (!confirmed) {
  console.log("Dry run only. Pass --confirm to delete the exact DASH prefix.");
  process.exit(0);
}

async function deleteWithRetry(urls) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      await del(urls, { token });
      return;
    } catch (error) {
      if (attempt === 10) throw error;
      const retryAfterSeconds =
        typeof error === "object" &&
        error !== null &&
        "retryAfter" in error &&
        typeof error.retryAfter === "number"
          ? error.retryAfter
          : 5;
      await new Promise((resolve) =>
        setTimeout(resolve, (retryAfterSeconds * 1_000) + 1_000),
      );
    }
  }
}

for (let index = 0; index < blobs.length; index += 250) {
  const chunk = blobs.slice(index, index + 250);
  await deleteWithRetry(chunk.map((blob) => blob.url));
  console.log(`Deleted ${Math.min(index + chunk.length, blobs.length)}/${blobs.length}.`);
}

const remaining = await listPrefix();
if (remaining.length) {
  throw new Error(`Deletion left ${remaining.length} blobs under ${prefix}`);
}
console.log(`Deleted the exact recoverable prefix: ${prefix}`);
