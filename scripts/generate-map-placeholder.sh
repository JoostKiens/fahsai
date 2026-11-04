#!/usr/bin/env bash
# Regenerates the blurred basemap shown while the map loads
# (packages/frontend/src/assets/basemap-placeholder.jpg).
#
# Needs a Mapbox public token (pk.*) that the Static Images API accepts. If the token is
# restricted to your domain, also set MAPBOX_REFERER (e.g. https://fahsai.fyi/).
#
#   MAPBOX_TOKEN=pk.xxx scripts/generate-map-placeholder.sh
#
# The view must match the default map view: mapCenter and mapZoom in
# packages/frontend/src/store/uiStore.ts, and the style in components/Map/MapView.tsx. The image
# is fetched at 1280x1280 (CSS pixels at that zoom) and shrunk to 640x640, since it is shown blurred.
set -euo pipefail

: "${MAPBOX_TOKEN:?Set MAPBOX_TOKEN to a Mapbox public token}"
command -v sips >/dev/null || { echo "This script needs sips (macOS) to shrink the image" >&2; exit 1; }

style=joostkiens/cm30pk39v00ah01qz4n2i1ssu
view=101,15.5,5.5,0,0
out="$(dirname "$0")/../packages/frontend/src/assets/basemap-placeholder.jpg"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
tmp="$workdir/full.jpg"

mkdir -p "$(dirname "$out")"
status=$(curl -sS ${MAPBOX_REFERER:+-e "$MAPBOX_REFERER"} -o "$tmp" -w '%{http_code}' \
  "https://api.mapbox.com/styles/v1/$style/static/$view/1280x1280?access_token=$MAPBOX_TOKEN")
if [ "$status" != 200 ]; then
  echo "Mapbox answered $status: $(cat "$tmp")" >&2
  exit 1
fi
sips -Z 640 -s format jpeg -s formatOptions 40 "$tmp" --out "$out" >/dev/null
ls -l "$out"
