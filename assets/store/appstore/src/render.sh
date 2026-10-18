#!/bin/bash
# Renders the App Store screenshots + header art to ../ (and the site share image to landing/) with headless Chrome. Usage: ./render.sh
set -e
cd "$(dirname "$0")"
SRC="$PWD"; OUT="$(cd .. && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
shot() { # url w h out
  "$CHROME" --headless=new --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 \
    --virtual-time-budget=3000 --window-size="$2,$3" --screenshot="$4" "$1" >/dev/null 2>&1
}
for size in 1206x2622 1179x2556; do
  w=${size%x*}; h=${size#*x}
  mkdir -p "$OUT/iphone-$size"
  for f in 0 1 2 3 4 5; do
    shot "file://$SRC/screenshots.html#frame=$f&w=$w&h=$h" $w $h "$OUT/iphone-$size/0$((f+1)).png"
  done
done
mkdir -p "$OUT/google-play-1080x1920"
for f in 0 1 2 3 4 5; do
  shot "file://$SRC/screenshots.html#play=1&frame=$f&w=1080&h=1920" 1080 1920 "$OUT/google-play-1080x1920/0$((f+1)).png"
done
shot "file://$SRC/screenshots.html#play=1&pano=1" 7236 2144 "$OUT/google-play-panorama-preview.png"
shot "file://$SRC/screenshots.html#pano=1" 7236 2622 "$OUT/panorama-preview.png"
mkdir -p "$OUT/header"
shot "file://$SRC/header.html#w=3840&h=1646" 3840 1646 "$OUT/header/header-3840x1646.png"
shot "file://$SRC/header.html#w=5244&h=2950" 5244 2950 "$OUT/header/universal-5244x2950.png"
shot "file://$SRC/header.html#feature=1&w=1024&h=500" 1024 500 "$OUT/google-play-feature-graphic-1024x500.png"
# Link-preview (Open Graph) image for pinch-app.io, as a JPEG to stay well under WhatsApp's 300 KB limit
shot "file://$SRC/header.html#feature=1&w=1200&h=630" 1200 630 /tmp/pinch-og-image.png
sips -s format jpeg -s formatOptions 85 /tmp/pinch-og-image.png --out "$OUT/../../../landing/og-image.jpg" >/dev/null
echo done
