#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/media/gone-away-teaser-v4.mp4}"

V3="$ROOT/media/gone-away-teaser-v3.mp4"
LOUNGE="$ROOT/media/seedance-2.5/lounge-v1.mp4"
ARCHIVE="$ROOT/media/seedance-2.5/garmus-archive-v1.mp4"
PLUMBING="$ROOT/media/seedance-2.5/plumbing-v1.mp4"
SCORE="$ROOT/media/score/beach-noir-06.mp3"

for source in "$V3" "$LOUNGE" "$ARCHIVE" "$PLUMBING" "$SCORE"; do
  if [[ ! -f "$source" ]]; then
    echo "Missing teaser source: $source" >&2
    exit 1
  fi
done

# The 92px matte is a 2.39:1 image inside a 1280x720 delivery frame. Applying it
# after every trim keeps the authored v3 material and new Seedance plates identical.
MATTE="drawbox=x=0:y=0:w=iw:h=92:color=black:t=fill,drawbox=x=0:y=628:w=iw:h=92:color=black:t=fill"

ffmpeg -y \
  -i "$V3" \
  -i "$LOUNGE" \
  -i "$ARCHIVE" \
  -i "$PLUMBING" \
  -i "$SCORE" \
  -filter_complex "
    [0:v]trim=start=0:end=3,setpts=PTS-STARTPTS,fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,$MATTE[v0];
    [1:v]trim=start=5.7:end=10,setpts=PTS-STARTPTS,fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.025:saturation=0.94,$MATTE[v1];
    [0:v]trim=start=3.666667:end=4.75,setpts=1.6*(PTS-STARTPTS),fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,$MATTE[v2];
    [2:v]trim=start=0.5:end=4,setpts=PTS-STARTPTS,fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.03:saturation=0.88,$MATTE[v3];
    [3:v]trim=start=0.5:end=6.375,setpts=PTS-STARTPTS,fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.03:saturation=0.90,$MATTE[v4];
    [0:v]trim=start=7.333333:end=14.5,setpts=PTS-STARTPTS,fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,$MATTE[v5];
    [v0][v1][v2][v3][v4][v5]concat=n=6:v=1:a=0,format=yuv420p[v];
    [4:a]atrim=start=109.676:end=135.251,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.2,afade=t=out:st=22.575:d=3,volume=0.85[a]
  " \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset slow -crf 16 -tune film \
  -c:a aac -b:a 320k \
  -movflags +faststart -shortest "$OUT"

echo "Built $OUT"
