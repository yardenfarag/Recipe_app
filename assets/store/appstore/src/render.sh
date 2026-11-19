#!/bin/bash
# Renders the store screenshots with headless Chrome.
#   ./render.sh          English screenshots, header art and the site share image (macOS: needs the New York font and sips)
#   ./render.sh he       Hebrew screenshots into ../he/ (works on macOS, Linux and Windows Git Bash)
#   ./render.sh ar       Arabic screenshots into ../ar/
# Hebrew and Arabic copy lives in i18n.js. Those renders load Google Fonts, so they need a network connection.
set -e
cd "$(dirname "$0")"
LANG_CODE="${1:-en}"
SRC="$PWD"; OUT="$(cd .. && pwd)"
[ "$LANG_CODE" != en ] && OUT="$OUT/$LANG_CODE"

for c in "$CHROME" "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  "$(command -v google-chrome || true)" "$(command -v chromium || true)"; do
  [ -n "$c" ] && [ -x "$c" ] && CHROME="$c" && break
done
[ -x "$CHROME" ] || { echo "Chrome not found; set CHROME=/path/to/chrome" >&2; exit 1; }

# Windows Chrome wants file:///C:/... rather than /c/...
if command -v cygpath >/dev/null; then BASE="file:///$(cygpath -m "$SRC")"; else BASE="file://$SRC"; fi
native() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else echo "$1"; fi; }

shot() { # page#hash w h out
  "$CHROME" --headless=new --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 \
    --virtual-time-budget=5000 --window-size="$2,$3" --screenshot="$(native "$4")" "$BASE/$1" >/dev/null 2>&1
}

L="lang=$LANG_CODE"
for size in 1206x2622 1179x2556; do
  w=${size%x*}; h=${size#*x}
  mkdir -p "$OUT/iphone-$size"
  for f in 0 1 2 3 4 5; do
    shot "screenshots.html#$L&frame=$f&w=$w&h=$h" $w $h "$OUT/iphone-$size/0$((f+1)).png"
  done
done
mkdir -p "$OUT/google-play-1080x1920"
for f in 0 1 2 3 4 5; do
  shot "screenshots.html#$L&play=1&frame=$f&w=1080&h=1920" 1080 1920 "$OUT/google-play-1080x1920/0$((f+1)).png"
done
shot "screenshots.html#$L&play=1&pano=1" 7236 2144 "$OUT/google-play-panorama-preview.png"
shot "screenshots.html#$L&pano=1" 7236 2622 "$OUT/panorama-preview.png"

# Header art, the Play feature graphic and the site share image are English only.
if [ "$LANG_CODE" = en ]; then
  mkdir -p "$OUT/header"
  shot "header.html#w=3840&h=1646" 3840 1646 "$OUT/header/header-3840x1646.png"
  shot "header.html#w=5244&h=2950" 5244 2950 "$OUT/header/universal-5244x2950.png"
  shot "header.html#feature=1&w=1024&h=500" 1024 500 "$OUT/google-play-feature-graphic-1024x500.png"
  # Link-preview (Open Graph) image for pinch-app.io, as a JPEG to stay well under WhatsApp's 300 KB limit
  if command -v sips >/dev/null; then
    shot "header.html#feature=1&w=1200&h=630" 1200 630 /tmp/pinch-og-image.png
    sips -s format jpeg -s formatOptions 85 /tmp/pinch-og-image.png --out "$OUT/../../../landing/og-image.jpg" >/dev/null
  else
    echo "skipped landing/og-image.jpg (needs macOS sips)"
  fi
fi
echo done
