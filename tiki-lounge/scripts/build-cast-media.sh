#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: $0 (--sample | --all) [output-directory]"
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 2
fi

mode="$1"
case "$mode" in
  --sample | --all) ;;
  *)
    usage
    exit 2
    ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
loop_video="$project_dir/public/video/midnight-lagoon-loop.mp4"
audio_dir="$project_dir/audio-source/Beach Noir Revue"
output_dir="${2:-$project_dir/audio-source/cast-media}"
master_video="$output_dir/.midnight-lagoon-cast-video.mp4"
passlog_prefix="$output_dir/.midnight-lagoon-cast-pass"

for command_name in ffmpeg ffprobe; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

if [[ ! -f "$loop_video" ]]; then
  echo "Missing loop video: $loop_video" >&2
  exit 1
fi

if [[ ! -d "$audio_dir" ]]; then
  echo "Missing audio directory: $audio_dir" >&2
  exit 1
fi

shopt -s nullglob
audio_files=( "$audio_dir"/*.mp3 )
if [[ ${#audio_files[@]} -eq 0 ]]; then
  echo "No MP3 files found in: $audio_dir" >&2
  exit 1
fi

mkdir -p "$output_dir"

if [[ "$mode" == "--sample" ]]; then
  master_duration="34"
  selected_audio=( "${audio_files[0]}" )
else
  longest_duration="0"
  for audio_file in "${audio_files[@]}"; do
    track_duration="$(
      ffprobe \
        -v error \
        -show_entries format=duration \
        -of default=noprint_wrappers=1:nokey=1 \
        "$audio_file"
    )"
    longest_duration="$(
      awk \
        -v current="$longest_duration" \
        -v candidate="$track_duration" \
        'BEGIN { if (candidate > current) print candidate; else print current }'
    )"
  done
  master_duration="$(awk -v duration="$longest_duration" 'BEGIN { print int(duration) + 2 }')"
  selected_audio=( "${audio_files[@]}" )
fi

video_filter="scale=1280:720:flags=lanczos,fps=15,hqdn3d=2.5:2:5:4,format=yuv420p"
video_options=(
  -an
  -vf "$video_filter"
  -c:v libx264
  -preset slow
  -profile:v high
  -level:v 3.1
  -b:v 160k
  -maxrate 192k
  -bufsize 384k
  -g 30
  -keyint_min 30
  -sc_threshold 0
  -tag:v avc1
  -passlogfile "$passlog_prefix"
)

ffmpeg \
  -y \
  -hide_banner \
  -loglevel warning \
  -stream_loop -1 \
  -i "$loop_video" \
  -t "$master_duration" \
  "${video_options[@]}" \
  -pass 1 \
  -f null \
  /dev/null

ffmpeg \
  -y \
  -hide_banner \
  -loglevel warning \
  -stream_loop -1 \
  -i "$loop_video" \
  -t "$master_duration" \
  "${video_options[@]}" \
  -pass 2 \
  -movflags +faststart \
  "$master_video"

track_number=1
for audio_file in "${selected_audio[@]}"; do
  output_name="$(printf 'beach-noir-%02d.mp4' "$track_number")"
  track_duration="$(
    ffprobe \
      -v error \
      -show_entries format=duration \
      -of default=noprint_wrappers=1:nokey=1 \
      "$audio_file"
  )"

  ffmpeg \
    -y \
    -hide_banner \
    -loglevel warning \
    -i "$master_video" \
    -i "$audio_file" \
    -map 0:v:0 \
    -map 1:a:0 \
    -map_metadata -1 \
    -map_chapters -1 \
    -c:v copy \
    -bsf:v h264_metadata=level=4 \
    -c:a aac \
    -profile:a aac_low \
    -b:a 160k \
    -ar 48000 \
    -ac 2 \
    -t "$track_duration" \
    -shortest \
    -movflags +faststart \
    "$output_dir/$output_name"

  track_number=$((track_number + 1))
done

echo "Created ${#selected_audio[@]} Cast media file(s) in: $output_dir"
