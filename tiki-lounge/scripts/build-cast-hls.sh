#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Build one track as a local HLS/CMAF Cast proof.

Usage:
  scripts/build-cast-hls.sh [options]

Options:
  --track FILE          MP3 source (default: Beach Noir Revue track 01)
  --track-id ID         Output identifier (default: beach-noir-01)
  --night FILE          Night loop video
  --day FILE            Day loop video or still image
  --output DIR          Package root (default: audio-source/cast-hls/v4)
  --video-bitrate RATE  H.264 average bitrate (default: 5000k)
  --preset NAME         x264 preset (default: slow)
  --force               Replace this track's existing generated package
  -h, --help            Show this help

The package exposes:
  <track-id>/night.m3u8  Stable night-only master
  <track-id>/day.m3u8    Stable day-only master
  <track-id>/master.m3u8 Experimental dual-theme master

The dual-theme master is useful for player testing, but a receiver should load
night.m3u8 or day.m3u8 explicitly. An adaptive player may otherwise treat the
two visually different but technically equivalent variants as interchangeable.
EOF
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"

track_file="$project_dir/audio-source/Beach Noir Revue/01 Midnight Case on Kalakaua.mp3"
track_id="beach-noir-01"
night_source="$project_dir/design/cast-v4-proofs/night-loop-seedance-2.mp4"
preferred_day_loop="$project_dir/design/cast-v4-proofs/day-loop-seedance-2.mp4"
day_fallback="$project_dir/design/cast-v4-proofs/day-anchor-from-dawn.png"
output_root="$project_dir/audio-source/cast-hls/v4"
video_bitrate="5000k"
x264_preset="slow"
replace_existing="false"
day_was_explicit="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --track)
      [[ $# -ge 2 ]] || { echo "Missing value for --track" >&2; exit 2; }
      track_file="$2"
      shift 2
      ;;
    --track-id)
      [[ $# -ge 2 ]] || { echo "Missing value for --track-id" >&2; exit 2; }
      track_id="$2"
      shift 2
      ;;
    --night)
      [[ $# -ge 2 ]] || { echo "Missing value for --night" >&2; exit 2; }
      night_source="$2"
      shift 2
      ;;
    --day)
      [[ $# -ge 2 ]] || { echo "Missing value for --day" >&2; exit 2; }
      day_source="$2"
      day_was_explicit="true"
      shift 2
      ;;
    --output)
      [[ $# -ge 2 ]] || { echo "Missing value for --output" >&2; exit 2; }
      output_root="$2"
      shift 2
      ;;
    --video-bitrate)
      [[ $# -ge 2 ]] || { echo "Missing value for --video-bitrate" >&2; exit 2; }
      video_bitrate="$2"
      shift 2
      ;;
    --preset)
      [[ $# -ge 2 ]] || { echo "Missing value for --preset" >&2; exit 2; }
      x264_preset="$2"
      shift 2
      ;;
    --force)
      replace_existing="true"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$day_was_explicit" == "false" ]]; then
  if [[ -f "$preferred_day_loop" ]]; then
    day_source="$preferred_day_loop"
  else
    day_source="$day_fallback"
  fi
fi

for command_name in ffmpeg ffprobe awk sed find wc tr mktemp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

if [[ ! "$track_id" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Invalid --track-id '$track_id'; use lowercase letters, numbers, and hyphens." >&2
  exit 2
fi

for required_file in "$track_file" "$night_source" "$day_source"; do
  if [[ ! -f "$required_file" ]]; then
    echo "Missing required source: $required_file" >&2
    exit 1
  fi
done

track_duration="$(
  ffprobe \
    -v error \
    -select_streams a:0 \
    -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 \
    "$track_file"
)"

if ! awk -v duration="$track_duration" 'BEGIN { exit !(duration > 0) }'; then
  echo "Could not determine a positive duration for: $track_file" >&2
  exit 1
fi

output_root="$(mkdir -p "$output_root" && cd "$output_root" && pwd)"
track_output="$output_root/$track_id"

if [[ -e "$track_output" && "$replace_existing" != "true" ]]; then
  echo "Output already exists: $track_output" >&2
  echo "Re-run with --force to replace this generated track package." >&2
  exit 1
fi

build_root="$(mktemp -d "$output_root/.build-$track_id.XXXXXX")"
build_track="$build_root/$track_id"
mkdir -p \
  "$build_track/audio" \
  "$build_track/video/night" \
  "$build_track/video/day"

cleanup() {
  if [[ -d "$build_root" ]]; then
    rm -rf "$build_root"
  fi
}
trap cleanup EXIT

is_still_image() {
  case "${1##*.}" in
    jpg | JPG | jpeg | JPEG | png | PNG | webp | WEBP) return 0 ;;
    *) return 1 ;;
  esac
}

playlist_duration() {
  awk -F '[:,]' '/^#EXTINF:/ { total += $2 } END { printf "%.6f", total }' "$1"
}

directory_bytes() {
  local directory="$1"
  local total_bytes=0
  local file_size
  local media_file

  while IFS= read -r media_file; do
    file_size="$(wc -c < "$media_file" | tr -d '[:space:]')"
    total_bytes=$((total_bytes + file_size))
  done < <(find "$directory" -type f \( -name '*.mp4' -o -name '*.m4s' \) -print)

  printf '%s\n' "$total_bytes"
}

average_bitrate() {
  local directory="$1"
  local duration="$2"
  local bytes
  bytes="$(directory_bytes "$directory")"
  awk -v bytes="$bytes" -v duration="$duration" \
    'BEGIN { if (duration <= 0) print 0; else printf "%.0f", (bytes * 8) / duration }'
}

peak_segment_bitrate() {
  local playlist="$1"
  local playlist_dir
  local duration
  local segment_uri
  local segment_bytes
  local segment_bitrate
  local peak=0

  playlist_dir="$(cd "$(dirname "$playlist")" && pwd)"
  while IFS=' ' read -r duration segment_uri; do
    segment_bytes="$(wc -c < "$playlist_dir/$segment_uri" | tr -d '[:space:]')"
    segment_bitrate="$(
      awk -v bytes="$segment_bytes" -v seconds="$duration" \
        'BEGIN { printf "%.0f", (bytes * 8) / seconds }'
    )"
    if (( segment_bitrate > peak )); then
      peak="$segment_bitrate"
    fi
  done < <(
    awk '
      /^#EXTINF:/ {
        duration = $0
        sub(/^#EXTINF:/, "", duration)
        sub(/,.*/, "", duration)
        getline uri
        print duration, uri
      }
    ' "$playlist"
  )

  printf '%s\n' "$peak"
}

normalization_filter() {
  local source_file="$1"
  local source_duration
  local cycle_duration
  local pts_scale

  source_duration="$(
    ffprobe \
      -v error \
      -select_streams v:0 \
      -show_entries format=duration \
      -of default=noprint_wrappers=1:nokey=1 \
      "$source_file"
  )"

  if ! awk -v duration="$source_duration" 'BEGIN { exit !(duration >= 4) }'; then
    echo "Video loop must be at least four seconds: $source_file" >&2
    return 1
  fi

  cycle_duration="$(awk -v duration="$source_duration" 'BEGIN { printf "%.0f", int(duration / 4) * 4 }')"
  pts_scale="$(awk -v source="$source_duration" -v cycle="$cycle_duration" \
    'BEGIN { printf "%.10f", cycle / source }')"

  printf 'setpts=PTS*%s,fps=24,scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p' "$pts_scale"
}

encode_video_rendition() {
  local theme="$1"
  local source_file="$2"
  local destination="$build_track/video/$theme"
  local video_filter
  local -a input_options

  if is_still_image "$source_file"; then
    input_options=( -loop 1 -framerate 24 -i "$source_file" )
    video_filter="fps=24,scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p"
  else
    input_options=( -stream_loop -1 -i "$source_file" )
    video_filter="$(normalization_filter "$source_file")"
  fi

  echo "Encoding $theme video rendition from: $source_file"
  ffmpeg \
    -y \
    -hide_banner \
    -loglevel warning \
    "${input_options[@]}" \
    -map 0:v:0 \
    -an \
    -t "$track_duration" \
    -vf "$video_filter" \
    -c:v libx264 \
    -preset "$x264_preset" \
    -profile:v high \
    -level:v 4.1 \
    -b:v "$video_bitrate" \
    -minrate "$video_bitrate" \
    -maxrate "$video_bitrate" \
    -bufsize 10000k \
    -x264-params "nal-hrd=cbr:force-cfr=1" \
    -g 96 \
    -keyint_min 96 \
    -sc_threshold 0 \
    -force_key_frames "expr:gte(t,n_forced*4)" \
    -pix_fmt yuv420p \
    -fps_mode cfr \
    -tag:v avc1 \
    -map_metadata -1 \
    -map_chapters -1 \
    -f hls \
    -hls_time 4 \
    -hls_playlist_type vod \
    -hls_segment_type fmp4 \
    -hls_fmp4_init_filename init.mp4 \
    -hls_segment_filename "$destination/segment-%05d.m4s" \
    -hls_flags independent_segments \
    "$destination/index.m3u8"
}

echo "Encoding shared audio rendition from: $track_file"
ffmpeg \
  -y \
  -hide_banner \
  -loglevel warning \
  -i "$track_file" \
  -map 0:a:0 \
  -vn \
  -map_metadata -1 \
  -map_chapters -1 \
  -c:a aac \
  -profile:a aac_low \
  -b:a 192k \
  -ar 48000 \
  -ac 2 \
  -af "aresample=async=1:first_pts=0" \
  -f hls \
  -hls_time 4 \
  -hls_playlist_type vod \
  -hls_segment_type fmp4 \
  -hls_fmp4_init_filename init.mp4 \
  -hls_segment_filename "$build_track/audio/segment-%05d.m4s" \
  -hls_flags independent_segments \
  "$build_track/audio/index.m3u8"

encode_video_rendition "night" "$night_source"
encode_video_rendition "day" "$day_source"

audio_duration="$(playlist_duration "$build_track/audio/index.m3u8")"
night_duration="$(playlist_duration "$build_track/video/night/index.m3u8")"
day_duration="$(playlist_duration "$build_track/video/day/index.m3u8")"

audio_average="$(average_bitrate "$build_track/audio" "$audio_duration")"
night_average="$(average_bitrate "$build_track/video/night" "$night_duration")"
day_average="$(average_bitrate "$build_track/video/day" "$day_duration")"
audio_peak="$(peak_segment_bitrate "$build_track/audio/index.m3u8")"
night_peak="$(peak_segment_bitrate "$build_track/video/night/index.m3u8")"
day_peak="$(peak_segment_bitrate "$build_track/video/day/index.m3u8")"
night_combined_average=$((night_average + audio_average))
day_combined_average=$((day_average + audio_average))
night_bandwidth=$(( (night_peak + audio_peak) * 105 / 100 ))
day_bandwidth=$(( (day_peak + audio_peak) * 105 / 100 ))

write_master_header() {
  printf '%s\n' \
    '#EXTM3U' \
    '#EXT-X-VERSION:7' \
    '#EXT-X-INDEPENDENT-SEGMENTS' \
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="music",NAME="Beach Noir Revue",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="zxx",URI="audio/index.m3u8"'
}

write_variant() {
  local theme="$1"
  local average="$2"
  local bandwidth="$3"
  printf '#EXT-X-STREAM-INF:BANDWIDTH=%s,AVERAGE-BANDWIDTH=%s,CODECS="avc1.640029,mp4a.40.2",RESOLUTION=1920x1080,FRAME-RATE=24.000,VIDEO-RANGE=SDR,AUDIO="music"\n' "$bandwidth" "$average"
  printf 'video/%s/index.m3u8\n' "$theme"
}

{
  write_master_header
  write_variant "night" "$night_combined_average" "$night_bandwidth"
} > "$build_track/night.m3u8"

{
  write_master_header
  write_variant "day" "$day_combined_average" "$day_bandwidth"
} > "$build_track/day.m3u8"

{
  write_master_header
  printf '%s\n' '#EXT-X-SESSION-DATA:DATA-ID="com.magnanimis.midnight-lagoon.warning",VALUE="EXPERIMENTAL_DUAL_THEME_DO_NOT_USE_FOR_ABR"'
  write_variant "night" "$night_combined_average" "$night_bandwidth"
  write_variant "day" "$day_combined_average" "$day_bandwidth"
} > "$build_track/master.m3u8"

day_placeholder="false"
if is_still_image "$day_source"; then
  day_placeholder="true"
fi

cat > "$build_track/catalog.json" <<EOF
{
  "schemaVersion": 1,
  "trackId": "$track_id",
  "contentId": "magnanimis:midnight-lagoon:$track_id",
  "contentType": "application/x-mpegURL",
  "durationSeconds": $audio_duration,
  "audio": "audio/index.m3u8",
  "themes": {
    "night": {
      "url": "night.m3u8",
      "video": "video/night/index.m3u8",
      "source": "$(basename "$night_source")",
      "placeholder": false
    },
    "day": {
      "url": "day.m3u8",
      "video": "video/day/index.m3u8",
      "source": "$(basename "$day_source")",
      "placeholder": $day_placeholder
    }
  },
  "experimentalDualThemeMaster": "master.m3u8"
}
EOF

if [[ -e "$track_output" ]]; then
  rm -rf "$track_output"
fi
mv "$build_track" "$track_output"

root_catalog_tmp="$build_root/catalog.json"
cat > "$root_catalog_tmp" <<EOF
{
  "schemaVersion": 1,
  "contentType": "application/x-mpegURL",
  "tracks": [
    {
      "id": "$track_id",
      "contentId": "magnanimis:midnight-lagoon:$track_id",
      "night": "$track_id/night.m3u8",
      "day": "$track_id/day.m3u8",
      "experimentalMaster": "$track_id/master.m3u8"
    }
  ]
}
EOF
mv "$root_catalog_tmp" "$output_root/catalog.json"

trap - EXIT
rm -rf "$build_root"

echo
echo "Created Cast HLS/CMAF proof:"
echo "  $track_output"
echo "  Night URL: $track_id/night.m3u8"
echo "  Day URL:   $track_id/day.m3u8"
echo "  Test only: $track_id/master.m3u8"
if [[ "$day_placeholder" == "true" ]]; then
  echo "  Note: the day rendition is a static placeholder; rebuild after the day loop is available."
fi
