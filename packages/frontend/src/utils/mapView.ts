// The view the map starts at. The store holds it (see uiStore.ts) so the address bar can follow it.
export const DEFAULT_CENTER: [number, number] = [101.0, 15.5]; // [lng, lat]
export const DEFAULT_ZOOM = 5.5;
export const MOBILE_CENTER: [number, number] = [102.0, 13.5];
export const MOBILE_ZOOM = 4.7;
const MOBILE_MIN_WIDTH_PX = 768; // below this the map starts at the phone view
// The same split as media queries, to pick the placeholder that matches the view the map starts at.
export const PHONE_MEDIA_QUERY = `(max-width: ${MOBILE_MIN_WIDTH_PX - 1}px)`;
export const DESKTOP_MEDIA_QUERY = `(min-width: ${MOBILE_MIN_WIDTH_PX}px)`;
export const MIN_ZOOM = 4.0;
const MAX_ZOOM = 22; // the deepest zoom Mapbox shows

// Plain decimals only: parseFloat would take 13.7abc, Number would take '' as 0.
const DECIMAL = /^-?\d+(\.\d+)?$/;
function parseDecimal(value: string | null): number {
  return value !== null && DECIMAL.test(value) ? Number(value) : NaN;
}

/**
 * The map's starting view: the centre and zoom in the link, else the default for the screen size.
 * A centre needs both a valid lat and a valid lng; a zoom is kept to what the map allows.
 */
export function initialMapView(
  search: string,
  viewportWidthPx: number,
): { center: [number, number]; zoom: number } {
  const params = new URLSearchParams(search);
  const lat = parseDecimal(params.get('lat'));
  const lng = parseDecimal(params.get('lng'));
  const zoom = parseDecimal(params.get('zoom'));
  const isLatValid = Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const isLngValid = Number.isFinite(lng) && lng >= -180 && lng <= 180;
  const isZoomValid = Number.isFinite(zoom) && zoom >= 0 && zoom <= MAX_ZOOM;
  const isMobile = viewportWidthPx < MOBILE_MIN_WIDTH_PX;
  const fallbackCenter = isMobile ? MOBILE_CENTER : DEFAULT_CENTER;
  const fallbackZoom = isMobile ? MOBILE_ZOOM : DEFAULT_ZOOM;
  return {
    // a copy, so nobody who changes the centre changes the defaults
    center: isLatValid && isLngValid ? [lng, lat] : [...fallbackCenter],
    zoom: isZoomValid ? Math.max(MIN_ZOOM, zoom) : fallbackZoom,
  };
}
