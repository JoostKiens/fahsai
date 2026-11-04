// The view the map starts at. The store holds it (see uiStore.ts) so the address bar can follow it.
export const DEFAULT_CENTER: [number, number] = [101.0, 15.5]; // [lng, lat]
export const DEFAULT_ZOOM = 5.5;
export const MOBILE_CENTER: [number, number] = [102.0, 13.5];
export const MOBILE_ZOOM = 4.7;
const MOBILE_MAX_WIDTH_PX = 768;
export const MIN_ZOOM = 4.0;

/**
 * The map's starting view: the centre and zoom in the link, else the default for the screen size.
 * A centre needs both a valid lat and a valid lng; a zoom is kept to what the map allows.
 */
export function initialMapView(
  search: string,
  viewportWidthPx: number,
): { center: [number, number]; zoom: number } {
  const params = new URLSearchParams(search);
  const lat = parseFloat(params.get('lat') ?? '');
  const lng = parseFloat(params.get('lng') ?? '');
  const zoom = parseFloat(params.get('zoom') ?? '');
  const isLatValid = isFinite(lat) && lat >= -90 && lat <= 90;
  const isLngValid = isFinite(lng) && lng >= -180 && lng <= 180;
  const isZoomValid = isFinite(zoom) && zoom >= 0 && zoom <= 24;
  const isMobile = viewportWidthPx < MOBILE_MAX_WIDTH_PX;
  const fallbackCenter = isMobile ? MOBILE_CENTER : DEFAULT_CENTER;
  const fallbackZoom = isMobile ? MOBILE_ZOOM : DEFAULT_ZOOM;
  return {
    center: isLatValid && isLngValid ? [lng, lat] : fallbackCenter,
    zoom: isZoomValid ? Math.max(MIN_ZOOM, zoom) : fallbackZoom,
  };
}
