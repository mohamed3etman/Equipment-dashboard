#!/usr/bin/env bash
# Rebuild everything:  ./build.sh <folder with IMG_9870.mov IMG_9871.mov IMG_9872.mov> [preview]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="$1"; WORK="$HERE/work"; ASSETS="$HERE/assets"; OUT="$HERE/.."
mkdir -p "$WORK"
# 1) HDR (HLG / Dolby Vision 8.4, BT.2020) -> SDR BT.709 tone-map (Hable), 30 fps
TM="zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv444p"
for n in 9870 9871 9872; do
  [ -f "$WORK/IMG_${n}_sdr.mp4" ] || ffmpeg -v error -y -i "$SRC/IMG_$n.mov" -vf "$TM" -r 30 -c:v libx264 -crf 8 -preset fast -an "$WORK/IMG_${n}_sdr.mp4"
done
ffmpeg -v error -y -i "$SRC/IMG_9872.mov" -map 0:a:0 -vn -ac 2 -ar 48000 "$WORK/amb_9872.wav" || true
# 2) poster alignment + clean plate
python3 "$HERE/prepare_assets.py" "$ASSETS" "$WORK"
# 3) original soundtrack
python3 "$HERE/soundtrack.py" "$WORK/amb_9872.wav" "$WORK/soundtrack.wav"
# 4) render
if [ "${2:-}" = "preview" ]; then python3 "$HERE/render.py" "$WORK" "$ASSETS" "$WORK/preview.mp4" --preview
else python3 "$HERE/render.py" "$WORK" "$ASSETS" "$OUT/Final_Video_1080x1920.mp4"; fi
