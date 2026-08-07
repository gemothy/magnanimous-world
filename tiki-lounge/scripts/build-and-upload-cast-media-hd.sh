#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Build sharp day and night Google Cast MP4s and optionally upload them to Vercel
Blob. Generated track files are validated before upload and removed locally
only after their upload succeeds.

Usage:
  scripts/build-and-upload-cast-media-hd.sh

Environment:
  START_TRACK=2             First track number to process (default: 2)
  END_TRACK=65              Last track number to process (default: 65)
  DRY_RUN=1                 Print mutating commands without running them
  BUILD_ONLY=1              Build and retain files locally; do not upload
  OUTPUT_DIR=path           Persistent staging/build-only directory
  UPLOAD_PREFIX=path        Blob pathname prefix
  MASTER_SOURCE_MODE=mode   alt-only (default) or two-source
  NIGHT_PRIMARY_SOURCE=...  Override the canonical 12-second night cycle
  NIGHT_ALT_SOURCE=...      Override the alternate 15-second night cycle
  DAY_PRIMARY_SOURCE=...    Override the canonical 12-second day cycle
  DAY_ALT_SOURCE=...        Override the alternate 15-second day cycle

Examples:
  DRY_RUN=1 START_TRACK=2 END_TRACK=2 \
    scripts/build-and-upload-cast-media-hd.sh

  BUILD_ONLY=1 START_TRACK=2 END_TRACK=2 \
    scripts/build-and-upload-cast-media-hd.sh

  START_TRACK=2 END_TRACK=2 \
    scripts/build-and-upload-cast-media-hd.sh

  START_TRACK=3 END_TRACK=65 \
    scripts/build-and-upload-cast-media-hd.sh

By default, each visual master contains 30 forward-only selections from its
compositionally consistent alternate cycle. MASTER_SOURCE_MODE=two-source
enables the original 34-segment, two-source plan if its joins are later
approved. Neither plan reverses, ping-pongs, or crossfades whole videos.
EOF
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
audio_dir="$project_dir/audio-source/Beach Noir Revue"
proof_dir="$project_dir/design/cast-v4-proofs"

start_track="${START_TRACK:-2}"
end_track="${END_TRACK:-65}"
dry_run="${DRY_RUN:-0}"
build_only="${BUILD_ONLY:-0}"
output_dir="${OUTPUT_DIR:-$project_dir/audio-source/cast-media-hd-staging}"
upload_prefix="${UPLOAD_PREFIX:-lagoon-lounge-hd-proof}"
master_source_mode="${MASTER_SOURCE_MODE:-alt-only}"

night_primary_source="${NIGHT_PRIMARY_SOURCE:-$proof_dir/night-loop-seedance-2.mp4}"
night_alt_source="${NIGHT_ALT_SOURCE:-$proof_dir/night-loop-alt-15s.mp4}"
day_primary_source="${DAY_PRIMARY_SOURCE:-$proof_dir/day-loop-seedance-2.mp4}"
day_alt_source="${DAY_ALT_SOURCE:-$proof_dir/day-loop-alt-15s.mp4}"

video_bitrate="5000k"
audio_bitrate="192k"
minimum_master_duration="450"
minimum_free_bytes="2147483648"

case "$master_source_mode" in
  alt-only)
    # One geometry, 30 complete forward cycles, and about 454 seconds total.
    # The slightly slower bias gives frame-rate quantization enough headroom
    # above the required 450-second master duration.
    segment_sources=(
      alt alt alt alt alt alt alt alt alt alt
      alt alt alt alt alt alt alt alt alt alt
      alt alt alt alt alt alt alt alt alt alt
    )
    segment_speeds=(
      0.960 0.979 1.011 0.971 1.023 0.995 0.987 1.034 0.964 1.007
      0.982 1.040 0.975 0.992 0.968 1.019 0.973 0.962 1.014 0.989
      1.037 0.984 0.966 1.029 0.998 0.977 1.004 0.961 0.991 0.980
    )
    expected_segment_count="30"
    ;;
  two-source)
    # Optional, because differently generated source geometry can reveal a
    # composition jump even when both clips are independently closed cycles.
    segment_sources=(
      primary alt primary alt alt primary alt primary primary alt
      alt primary primary alt primary alt alt primary alt primary
      primary alt primary alt alt primary alt primary primary alt
      primary alt alt primary
    )
    segment_speeds=(
      0.98 1.01 0.97 1.02 1.00 0.99 1.03 0.96 1.01 0.98
      1.04 0.97 1.00 1.02 0.99 1.03 0.96 1.01 0.98 1.04
      0.97 1.00 1.02 0.99 1.03 0.96 1.01 0.98 1.04 0.97
      1.00 1.02 0.99 1.03
    )
    expected_segment_count="34"
    ;;
  *)
    echo \
      "Error: MASTER_SOURCE_MODE must be 'alt-only' or 'two-source'" \
      >&2
    exit 2
    ;;
esac

is_true() {
  case "$1" in
    1 | true | TRUE | yes | YES | on | ON) return 0 ;;
    *) return 1 ;;
  esac
}

print_command() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
}

run_mutating() {
  if is_true "$dry_run"; then
    print_command "$@"
  else
    "$@"
  fi
}

die() {
  echo "Error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 ||
    die "Missing required command: $1"
}

positive_number() {
  awk -v value="$1" 'BEGIN { exit !(value > 0) }'
}

absolute_difference_within() {
  awk -v first="$1" -v second="$2" -v tolerance="$3" \
    'BEGIN {
      difference = first - second
      if (difference < 0) difference = -difference
      exit !(difference <= tolerance)
    }'
}

number_in_range() {
  awk -v value="$1" -v minimum="$2" -v maximum="$3" \
    'BEGIN { exit !(value >= minimum && value <= maximum) }'
}

probe_duration() {
  ffprobe \
    -v error \
    -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 \
    "$1"
}

validate_source_video() {
  local source_file="$1"
  local label="$2"
  local duration
  local codec_name=""
  local width=""
  local height=""
  local frame_rate=""

  [[ -f "$source_file" ]] ||
    die "Missing $label source: $source_file"

  duration="$(probe_duration "$source_file")"
  positive_number "$duration" ||
    die "Could not determine a positive duration for $label: $source_file"

  while IFS='=' read -r key value; do
    case "$key" in
      codec_name) codec_name="$value" ;;
      width) width="$value" ;;
      height) height="$value" ;;
      r_frame_rate) frame_rate="$value" ;;
    esac
  done < <(
    ffprobe \
      -v error \
      -select_streams v:0 \
      -show_entries stream=codec_name,width,height,r_frame_rate \
      -of default=noprint_wrappers=1 \
      "$source_file"
  )

  [[ "$codec_name" == "h264" ]] ||
    die "$label codec is '$codec_name', expected H.264"
  [[ "$width" == "1920" && "$height" == "1080" ]] ||
    die "$label is ${width}x${height}, expected 1920x1080"
  [[ "$frame_rate" == "24/1" ]] ||
    die "$label frame rate is '$frame_rate', expected 24/1"
}

validate_video_stream() {
  local media_file="$1"
  local label="$2"
  local codec_name=""
  local profile=""
  local level=""
  local width=""
  local height=""
  local pixel_format=""
  local frame_rate=""
  local bit_rate=""

  while IFS='=' read -r key value; do
    case "$key" in
      codec_name) codec_name="$value" ;;
      profile) profile="$value" ;;
      level) level="$value" ;;
      width) width="$value" ;;
      height) height="$value" ;;
      pix_fmt) pixel_format="$value" ;;
      r_frame_rate) frame_rate="$value" ;;
      bit_rate) bit_rate="$value" ;;
    esac
  done < <(
    ffprobe \
      -v error \
      -select_streams v:0 \
      -show_entries \
      stream=codec_name,profile,level,width,height,pix_fmt,r_frame_rate,bit_rate \
      -of default=noprint_wrappers=1 \
      "$media_file"
  )

  if [[ "$codec_name" != "h264" ]]; then
    echo "$label video codec is '$codec_name', expected H.264" >&2
    return 1
  fi
  if [[ "$profile" != "High" ]]; then
    echo "$label H.264 profile is '$profile', expected High" >&2
    return 1
  fi
  if [[ "$level" != "41" ]]; then
    echo "$label H.264 level is '$level', expected 41" >&2
    return 1
  fi
  if [[ "$width" != "1920" || "$height" != "1080" ]]; then
    echo "$label is ${width}x${height}, expected 1920x1080" >&2
    return 1
  fi
  if [[ "$pixel_format" != "yuv420p" ]]; then
    echo "$label pixel format is '$pixel_format', expected yuv420p" >&2
    return 1
  fi
  if [[ "$frame_rate" != "24/1" ]]; then
    echo "$label frame rate is '$frame_rate', expected 24/1" >&2
    return 1
  fi
  if ! positive_number "$bit_rate"; then
    echo "$label has no positive video bitrate" >&2
    return 1
  fi
  if ! number_in_range "$bit_rate" 4000000 6000000; then
    echo \
      "$label video bitrate is $bit_rate, expected approximately 5 Mbps" \
      >&2
    return 1
  fi
}

validate_master() {
  local master_file="$1"
  local theme="$2"
  local duration
  local audio_stream_count

  [[ -s "$master_file" ]] ||
    die "The $theme master is missing or empty: $master_file"
  ffprobe -v error "$master_file" >/dev/null ||
    die "ffprobe could not read the $theme master"

  validate_video_stream "$master_file" "$theme master" ||
    die "The $theme master video stream failed validation"
  audio_stream_count="$(
    ffprobe \
      -v error \
      -select_streams a \
      -show_entries stream=index \
      -of csv=p=0 \
      "$master_file" |
      awk 'NF { count += 1 } END { print count + 0 }'
  )"
  [[ "$audio_stream_count" == "0" ]] ||
    die "The $theme master unexpectedly contains audio"

  duration="$(probe_duration "$master_file")"
  number_in_range "$duration" "$minimum_master_duration" 480 ||
    die "$theme master duration is ${duration}s; expected 450-480s"
}

validate_track_output() {
  local media_file="$1"
  local expected_duration="$2"
  local label="$3"
  local actual_duration
  local video_stream_count
  local audio_stream_count
  local audio_codec=""
  local audio_profile=""
  local audio_sample_rate=""
  local audio_channels=""
  local audio_bit_rate=""

  [[ -s "$media_file" ]] || return 1
  ffprobe -v error "$media_file" >/dev/null || return 1

  video_stream_count="$(
    ffprobe \
      -v error \
      -select_streams v \
      -show_entries stream=index \
      -of csv=p=0 \
      "$media_file" |
      awk 'NF { count += 1 } END { print count + 0 }'
  )"
  audio_stream_count="$(
    ffprobe \
      -v error \
      -select_streams a \
      -show_entries stream=index \
      -of csv=p=0 \
      "$media_file" |
      awk 'NF { count += 1 } END { print count + 0 }'
  )"
  [[ "$video_stream_count" == "1" && "$audio_stream_count" == "1" ]] ||
    return 1

  validate_video_stream "$media_file" "$label" || return 1

  while IFS='=' read -r key value; do
    case "$key" in
      codec_name) audio_codec="$value" ;;
      profile) audio_profile="$value" ;;
      sample_rate) audio_sample_rate="$value" ;;
      channels) audio_channels="$value" ;;
      bit_rate) audio_bit_rate="$value" ;;
    esac
  done < <(
    ffprobe \
      -v error \
      -select_streams a:0 \
      -show_entries stream=codec_name,profile,sample_rate,channels,bit_rate \
      -of default=noprint_wrappers=1 \
      "$media_file"
  )

  [[ "$audio_codec" == "aac" ]] || return 1
  [[ "$audio_profile" == "LC" ]] || return 1
  [[ "$audio_sample_rate" == "48000" ]] || return 1
  [[ "$audio_channels" == "2" ]] || return 1
  positive_number "$audio_bit_rate" || return 1
  number_in_range "$audio_bit_rate" 160000 224000 || return 1

  actual_duration="$(probe_duration "$media_file")"
  absolute_difference_within "$actual_duration" "$expected_duration" 0.25 ||
    return 1
}

encode_segment_variant() {
  local source_file="$1"
  local source_label="$2"
  local source_target_duration="$3"
  local speed="$4"
  local destination="$5"
  local source_duration
  local segment_duration
  local pts_scale
  local video_filter

  source_duration="$(probe_duration "$source_file")"
  segment_duration="$(
    awk -v duration="$source_target_duration" -v rate="$speed" \
      'BEGIN { printf "%.9f", duration / rate }'
  )"
  pts_scale="$(
    awk \
      -v source="$source_duration" \
      -v target="$source_target_duration" \
      -v rate="$speed" \
      'BEGIN { printf "%.12f", target / source / rate }'
  )"
  video_filter="$(
    printf '%s' \
      "setpts=(PTS-STARTPTS)*$pts_scale," \
      "fps=24," \
      "scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos," \
      "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black," \
      "format=yuv420p"
  )"

  echo "Encoding $source_label at ${speed}x (${segment_duration}s)"
  run_mutating \
    ffmpeg \
    -y \
    -hide_banner \
    -loglevel warning \
    -i "$source_file" \
    -map 0:v:0 \
    -an \
    -t "$segment_duration" \
    -vf "$video_filter" \
    -c:v libx264 \
    -preset slow \
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
    -movflags +faststart \
    "$destination"
}

build_theme_master() {
  local theme="$1"
  local primary_source="$2"
  local alt_source="$3"
  local theme_work_dir="$work_dir/$theme"
  local concat_manifest="$theme_work_dir/concat.txt"
  local master_file="$work_dir/$theme-master.mp4"
  local index
  local source_kind
  local source_file
  local target_duration
  local speed
  local speed_key
  local variant_name
  local variant_path
  local encoded_key
  local encoded_keys=" "
  local planned_duration="0"

  if ! is_true "$dry_run"; then
    mkdir -p "$theme_work_dir"
    : > "$concat_manifest"
  fi

  echo "Planning $theme master:"
  for index in "${!segment_sources[@]}"; do
    source_kind="${segment_sources[$index]}"
    speed="${segment_speeds[$index]}"
    number_in_range "$speed" 0.96 1.04 ||
      die "Segment $((index + 1)) uses invalid speed: $speed"

    case "$source_kind" in
      primary)
        source_file="$primary_source"
        target_duration="12"
        ;;
      alt)
        source_file="$alt_source"
        target_duration="15"
        ;;
      *)
        die "Segment $((index + 1)) has unknown source type: $source_kind"
        ;;
    esac

    planned_duration="$(
      awk \
        -v total="$planned_duration" \
        -v duration="$target_duration" \
        -v rate="$speed" \
        'BEGIN { printf "%.9f", total + duration / rate }'
    )"
    speed_key="${speed/./}"
    variant_name="${source_kind}-${speed_key}.mp4"
    variant_path="$theme_work_dir/$variant_name"
    encoded_key=" $source_kind:$speed "

    case "$encoded_keys" in
      *"$encoded_key"*) ;;
      *)
        encode_segment_variant \
          "$source_file" \
          "$theme $source_kind cycle" \
          "$target_duration" \
          "$speed" \
          "$variant_path"
        encoded_keys="${encoded_keys}${source_kind}:${speed} "
        ;;
    esac

    if is_true "$dry_run"; then
      printf "  %02d  %-7s  %sx  %s\n" \
        "$((index + 1))" "$source_kind" "$speed" "$variant_name"
    else
      printf "file '%s'\n" "$variant_name" >> "$concat_manifest"
    fi
  done

  [[ "${#segment_sources[@]}" == "$expected_segment_count" ]] ||
    die "The master plan must contain exactly $expected_segment_count segments"
  number_in_range "$planned_duration" "$minimum_master_duration" 480 ||
    die "Planned $theme duration is ${planned_duration}s; expected 450-480s"
  echo \
    "  Planned duration: ${planned_duration}s across" \
    "$expected_segment_count forward-only segments"

  run_mutating \
    ffmpeg \
    -y \
    -hide_banner \
    -loglevel warning \
    -f concat \
    -safe 0 \
    -i "$concat_manifest" \
    -map 0:v:0 \
    -an \
    -c:v copy \
    -map_metadata -1 \
    -map_chapters -1 \
    -movflags +faststart \
    "$master_file"

  if ! is_true "$dry_run"; then
    validate_master "$master_file" "$theme"
  fi
}

if [[ $# -gt 0 ]]; then
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
fi

for command_name in ffmpeg ffprobe awk sed find wc tr mktemp vercel; do
  if [[ "$command_name" == "vercel" ]] &&
    { is_true "$build_only" || is_true "$dry_run"; }; then
    continue
  fi
  require_command "$command_name"
done

[[ "$start_track" =~ ^[0-9]+$ ]] ||
  die "START_TRACK must be an integer"
[[ "$end_track" =~ ^[0-9]+$ ]] ||
  die "END_TRACK must be an integer"
(( start_track >= 1 && start_track <= 65 )) ||
  die "START_TRACK must be between 1 and 65"
(( end_track >= 1 && end_track <= 65 )) ||
  die "END_TRACK must be between 1 and 65"
(( start_track <= end_track )) ||
  die "START_TRACK cannot be greater than END_TRACK"
[[ "${#segment_sources[@]}" == "${#segment_speeds[@]}" ]] ||
  die "Segment source and speed plans have different lengths"

[[ -d "$audio_dir" ]] || die "Missing audio directory: $audio_dir"
validate_source_video "$night_alt_source" "night alternate"
validate_source_video "$day_alt_source" "day alternate"
if [[ "$master_source_mode" == "two-source" ]]; then
  validate_source_video "$night_primary_source" "night primary"
  validate_source_video "$day_primary_source" "day primary"
fi

shopt -s nullglob
audio_files=("$audio_dir"/*.mp3)
[[ "${#audio_files[@]}" == "65" ]] ||
  die "Expected 65 MP3 files in $audio_dir; found ${#audio_files[@]}"

selected_files=()
selected_track_numbers=()
selected_durations=()
selected_duration_total="0"
longest_library_track="0"

for audio_file in "${audio_files[@]}"; do
  base_name="$(basename "$audio_file")"
  track_text="${base_name%% *}"
  [[ "$track_text" =~ ^[0-9][0-9]$ ]] ||
    die "Audio filename does not begin with a two-digit track number: $base_name"
  track_number=$((10#$track_text))
  track_duration="$(probe_duration "$audio_file")"
  positive_number "$track_duration" ||
    die "Could not determine a positive duration for: $audio_file"

  longest_library_track="$(
    awk \
      -v current="$longest_library_track" \
      -v candidate="$track_duration" \
      'BEGIN { print (candidate > current ? candidate : current) }'
  )"

  if (( track_number >= start_track && track_number <= end_track )); then
    selected_files[${#selected_files[@]}]="$audio_file"
    selected_track_numbers[${#selected_track_numbers[@]}]="$track_text"
    selected_durations[${#selected_durations[@]}]="$track_duration"
    selected_duration_total="$(
      awk \
        -v total="$selected_duration_total" \
        -v duration="$track_duration" \
        'BEGIN { printf "%.9f", total + duration }'
    )"
  fi
done

[[ "${#selected_files[@]}" -gt 0 ]] ||
  die "No audio tracks matched START_TRACK=$start_track END_TRACK=$end_track"
number_in_range "$longest_library_track" 0 "$minimum_master_duration" ||
  die "The longest library track exceeds the 450-second master"

estimated_output_bytes="$(
  awk \
    -v seconds="$selected_duration_total" \
    'BEGIN {
      combined_bitrate = 5000000 + 192000
      printf "%.0f", seconds * 2 * combined_bitrate / 8 * 1.05
    }'
)"

if ! is_true "$dry_run"; then
  mkdir -p "$output_dir"
fi

if is_true "$build_only" && ! is_true "$dry_run"; then
  available_bytes="$(
    df -Pk "$output_dir" |
      awk 'NR == 2 { printf "%.0f", $4 * 1024 }'
  )"
  if ! awk \
    -v required="$estimated_output_bytes" \
    -v available="$available_bytes" \
    'BEGIN { exit !(required < available * 0.9) }'; then
    die \
      "BUILD_ONLY needs approximately $estimated_output_bytes bytes, but only" \
      "$available_bytes bytes are free. Narrow START_TRACK/END_TRACK or use" \
      "rolling upload mode."
  fi
elif ! is_true "$dry_run"; then
  available_bytes="$(
    df -Pk "$output_dir" |
      awk 'NR == 2 { printf "%.0f", $4 * 1024 }'
  )"
  (( available_bytes >= minimum_free_bytes )) ||
    die "Rolling mode requires at least 2 GiB free in the output volume"
fi

upload_token=""
if ! is_true "$build_only"; then
  if is_true "$dry_run"; then
    upload_token="<redacted>"
  else
    set -a
    # shellcheck disable=SC1091
    source "$project_dir/.env.local"
    set +a
    : "${BLOB_READ_WRITE_TOKEN:?Missing BLOB_READ_WRITE_TOKEN in .env.local}"
    upload_token="$BLOB_READ_WRITE_TOKEN"
  fi
fi

echo
echo "Lagoon Lounge HD Cast batch"
echo "  Track range:       $start_track-$end_track"
echo "  Selected tracks:   ${#selected_files[@]}"
echo "  Master sources:    $master_source_mode"
echo "  Master segments:   $expected_segment_count"
echo "  Estimated outputs: $estimated_output_bytes bytes"
echo "  Staging directory: $output_dir"
if is_true "$dry_run"; then
  echo "  Mode:              dry run"
elif is_true "$build_only"; then
  echo "  Mode:              build only"
else
  echo "  Mode:              rolling build/upload"
fi
echo

if is_true "$dry_run"; then
  work_dir="$project_dir/audio-source/.cast-hd-master.DRY_RUN"
else
  work_dir="$(mktemp -d "$project_dir/audio-source/.cast-hd-master.XXXXXX")"
  cleanup() {
    rm -rf -- "$work_dir"
  }
  trap cleanup EXIT
fi

build_theme_master \
  "night" \
  "$night_primary_source" \
  "$night_alt_source"
build_theme_master \
  "day" \
  "$day_primary_source" \
  "$day_alt_source"

for index in "${!selected_files[@]}"; do
  audio_file="${selected_files[$index]}"
  track_text="${selected_track_numbers[$index]}"
  track_duration="${selected_durations[$index]}"

  for theme in night day; do
    filename="beach-noir-${track_text}-${theme}.mp4"
    output_file="$output_dir/$filename"
    output_label="track $track_text $theme"

    echo
    echo "Preparing $output_label"
    reuse_existing="false"
    if ! is_true "$dry_run" && [[ -f "$output_file" ]]; then
      if validate_track_output \
        "$output_file" \
        "$track_duration" \
        "$output_label"; then
        echo "Reusing validated staged file: $output_file"
        reuse_existing="true"
      else
        echo "Replacing incomplete or invalid staged file: $output_file"
      fi
    fi

    if [[ "$reuse_existing" != "true" ]]; then
      run_mutating \
        ffmpeg \
        -y \
        -hide_banner \
        -loglevel warning \
        -i "$work_dir/$theme-master.mp4" \
        -i "$audio_file" \
        -map 0:v:0 \
        -map 1:a:0 \
        -map_metadata -1 \
        -map_chapters -1 \
        -c:v copy \
        -c:a aac \
        -profile:a aac_low \
        -b:a "$audio_bitrate" \
        -ar 48000 \
        -ac 2 \
        -t "$track_duration" \
        -shortest \
        -movflags +faststart \
        "$output_file"
    fi

    if ! is_true "$dry_run"; then
      validate_track_output \
        "$output_file" \
        "$track_duration" \
        "$output_label" ||
        die "Validation failed for $output_file"
      echo "Validated $output_file"
    fi

    if is_true "$build_only"; then
      continue
    fi

    run_mutating \
      vercel blob put "$output_file" \
      --pathname "$upload_prefix/$filename" \
      --access public \
      --allow-overwrite true \
      --content-type video/mp4 \
      --cache-control-max-age 31536000 \
      --rw-token "$upload_token" \
      --no-color

    # With set -e, this is reached only after a successful upload. A failed
    # upload leaves the validated file in staging for a safe retry.
    run_mutating rm -f -- "$output_file"
  done
done

echo
if is_true "$dry_run"; then
  echo "Dry run complete. No media was built, uploaded, or removed."
elif is_true "$build_only"; then
  echo "Build complete. Validated outputs remain in: $output_dir"
else
  echo "Rolling build/upload complete. Successful outputs were removed locally."
fi
