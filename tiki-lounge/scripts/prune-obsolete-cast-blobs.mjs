#!/usr/bin/env node

import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const projectDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const token = process.env.BLOB_READ_WRITE_TOKEN;
const confirmed = process.argv.includes("--confirm");
const targets = [
  {
    expected: 65,
    prefix: "beach-noir-revue-cast/",
    backup: path.join(projectDir, "audio-source/cast-media"),
    backupCount: () =>
      readdirSync(path.join(projectDir, "audio-source/cast-media")).filter(
        (name) => /^beach-noir-\d{2}\.mp4$/.test(name),
      ).length,
  },
  {
    expected: 2,
    prefix: "lagoon-lounge-hd-proof/",
    backup: path.join(projectDir, "audio-source/cast-media-hd-proof"),
    backupCount: () =>
      readdirSync(
        path.join(projectDir, "audio-source/cast-media-hd-proof"),
      ).filter((name) => /^beach-noir-01-(?:night|day)\.mp4$/.test(name))
        .length,
  },
];

if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is required.");

const npmGlobalRoot = execFileSync("npm", ["root", "-g"], {
  encoding: "utf8",
}).trim();
const blobSdk = path.join(
  npmGlobalRoot,
  "vercel/node_modules/@vercel/blob/dist/index.cjs",
);
const { del, list } = require(blobSdk);

async function listPrefix(prefix) {
  const blobs = [];
  let cursor;
  do {
    const result = await list({
      token,
      prefix,
      limit: 1000,
      cursor,
    });
    blobs.push(...result.blobs);
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return blobs;
}

const resolved = [];
for (const target of targets) {
  if (!existsSync(target.backup) || target.backupCount() !== target.expected) {
    throw new Error(
      `Local recovery copy is incomplete for ${target.prefix}`,
    );
  }
  const blobs = await listPrefix(target.prefix);
  if (blobs.length !== target.expected) {
    throw new Error(
      `Refusing ${target.prefix}: expected ${target.expected} blobs, found ${blobs.length}`,
    );
  }
  resolved.push({ ...target, blobs });
}

const bytes = resolved.reduce(
  (sum, target) =>
    sum + target.blobs.reduce((subtotal, blob) => subtotal + blob.size, 0),
  0,
);
console.log(
  `Verified ${resolved.reduce((sum, target) => sum + target.blobs.length, 0)} obsolete, locally recoverable blobs (${bytes} bytes).`,
);

if (!confirmed) {
  console.log("Dry run only. Pass --confirm to delete the exact prefixes.");
  process.exit(0);
}

for (const target of resolved) {
  await del(
    target.blobs.map((blob) => blob.url),
    { token },
  );
  const remaining = await listPrefix(target.prefix);
  if (remaining.length) {
    throw new Error(
      `Deletion did not clear ${target.prefix}: ${remaining.length} remain`,
    );
  }
  console.log(`Deleted ${target.blobs.length}: ${target.prefix}`);
}
