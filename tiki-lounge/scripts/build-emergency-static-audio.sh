#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$project_dir/audio-source/Beach Noir Revue"
output_dir="$project_dir/public/audio/beach-noir"
bitrate="${EMERGENCY_AUDIO_BITRATE:-40k}"
jobs="${EMERGENCY_AUDIO_JOBS:-8}"

mkdir -p "$output_dir"

encode_track() {
  local source_file="$1"
  local filename
  local track_number
  local output_file

  filename="$(basename "$source_file")"
  track_number="${filename%% *}"
  output_file="$output_dir/$track_number.m4a"

  ffmpeg \
    -hide_banner \
    -loglevel error \
    -i "$source_file" \
    -vn \
    -map_metadata -1 \
    -c:a aac \
    -aac_coder twoloop \
    -b:a "$bitrate" \
    -ar 44100 \
    -ac 2 \
    -movflags +faststart \
    -y \
    "$output_file"
}

export -f encode_track
export output_dir bitrate

find "$source_dir" -maxdepth 1 -type f -name '*.mp3' -print0 |
  sort -z |
  xargs -0 -n 1 -P "$jobs" bash -c 'encode_track "$1"' _

count="$(find "$output_dir" -maxdepth 1 -type f -name '*.m4a' | wc -l | tr -d ' ')"
if [[ "$count" != "65" ]]; then
  echo "Expected 65 encoded tracks, found $count." >&2
  exit 1
fi

echo "Built 65 emergency static tracks at $bitrate."
du -sh "$output_dir"
