#!/usr/bin/env node
// Generates audio/library.json for Gone Away from tiki-lounge's lib/library.ts.
//
// tiki-lounge stays the single source of truth for the Beach Noir Revue catalog:
// this script reads the track tuples out of its TypeScript and emits the plain
// JSON the game fetches at runtime. Re-run it whenever the album changes.
//
//   node scripts/build-library.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const SOURCE = resolve(root, '../tiki-lounge/lib/library.ts');
const AUDIO_DIR = resolve(root, 'audio/beach-noir');
const OUT = resolve(root, 'audio/library.json');

if (!existsSync(SOURCE)) {
  console.error(`Cannot find tiki-lounge library at:\n  ${SOURCE}`);
  process.exit(1);
}

const ts = await readFile(SOURCE, 'utf8');

// Pull the BEACH_NOIR_TRACKS tuple list: ["01 Title.mp3", 216.51],
const block = ts.match(/const BEACH_NOIR_TRACKS\s*=\s*\[([\s\S]*?)\]\s*as const;/);
if (!block) {
  console.error('Could not locate BEACH_NOIR_TRACKS in library.ts — did its shape change?');
  process.exit(1);
}

const tuple = /\[\s*"([^"]+)"\s*,\s*([0-9.]+)\s*\]/g;
const tracks = [];
let m;
while ((m = tuple.exec(block[1])) !== null) {
  const [, filename, duration] = m;
  const n = String(tracks.length + 1).padStart(2, '0');
  tracks.push({
    id: `beach-noir-${n}`,
    n: tracks.length + 1,
    // strip the leading track number and the extension: what's printed on the label
    title: filename.replace(/\.mp3$/i, '').replace(/^\d+\s+/, '').trim(),
    artist: 'mellokitty',
    duration: Number(duration),
    src: `./audio/beach-noir/${n}.m4a`
  });
}

if (!tracks.length) {
  console.error('Parsed zero tracks — aborting rather than writing an empty library.');
  process.exit(1);
}

// Verify the audio actually exists before claiming a working library.
const missing = tracks.filter((t) => !existsSync(resolve(root, t.src))).map((t) => t.src);

const library = {
  title: 'Beach Noir Revue',
  artist: 'mellokitty',
  generatedFrom: 'tiki-lounge/lib/library.ts',
  count: tracks.length,
  totalSeconds: Math.round(tracks.reduce((a, t) => a + t.duration, 0)),
  tracks
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(library, null, 2) + '\n');

const mins = Math.floor(library.totalSeconds / 60);
console.log(`Wrote ${OUT}`);
console.log(`  ${tracks.length} tracks · ${Math.floor(mins / 60)}h ${mins % 60}m`);
if (missing.length) {
  console.warn(`  WARNING: ${missing.length} audio file(s) missing, first: ${missing[0]}`);
  console.warn(`  Expected them under ${AUDIO_DIR}`);
} else {
  console.log(`  all ${tracks.length} audio files present`);
}
