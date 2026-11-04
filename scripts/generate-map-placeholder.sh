#!/usr/bin/env bash
# Regenerates the blurred basemaps shown while the map loads: one for desktops
# (packages/frontend/src/assets/basemap-placeholder.jpg) and one for phones (…-phone.jpg), which
# the map starts further out on.
#
# Needs a Mapbox public token (pk.*) that the Static Images API accepts. If the token is
# restricted to your domain, also set MAPBOX_REFERER (e.g. https://fahsai.fyi/).
#
#   MAPBOX_TOKEN=pk.xxx scripts/generate-map-placeholder.sh
#
# The views must match the map's start views: desktop_view is mapCenter and mapZoom in
# packages/frontend/src/store/uiStore.ts, phone_view is MOBILE_CENTER and MOBILE_ZOOM in
# packages/frontend/src/utils/mapView.ts, and the style is in components/Map/mapStyle.ts (a test
# checks all three). Each image is fetched at 1280x1280 (CSS pixels at that zoom) and shrunk to
# 640x640, since it is shown blurred.
set -euo pipefail

: "${MAPBOX_TOKEN:?Set MAPBOX_TOKEN to a Mapbox public token}"
command -v sips >/dev/null || { echo "This script needs sips (macOS) to shrink the image" >&2; exit 1; }

style=joostkiens/cm30pk39v00ah01qz4n2i1ssu
desktop_view=101,15.5,5.5,0,0
phone_view=102,13.5,4.7,0,0
assets="$(dirname "$0")/../packages/frontend/src/assets"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

mkdir -p "$assets"

# fetch_placeholder <view> <output file>
fetch_placeholder() {
  local tmp="$workdir/full.jpg" status
  status=$(curl -sS ${MAPBOX_REFERER:+-e "$MAPBOX_REFERER"} -o "$tmp" -w '%{http_code}' \
    "https://api.mapbox.com/styles/v1/$style/static/$1/1280x1280?access_token=$MAPBOX_TOKEN")
  if [ "$status" != 200 ]; then
    echo "Mapbox answered $status: $(cat "$tmp")" >&2
    exit 1
  fi
  sips -Z 640 -s format jpeg -s formatOptions 40 "$tmp" --out "$2" >/dev/null
  ls -l "$2"
}

fetch_placeholder "$desktop_view" "$assets/basemap-placeholder.jpg"
fetch_placeholder "$phone_view" "$assets/basemap-placeholder-phone.jpg"
