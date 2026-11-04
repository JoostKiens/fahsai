// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { useUIStore } from '@/store/uiStore';
import { MOBILE_CENTER, MOBILE_ZOOM } from '@/utils/mapView';
import { MAP_STYLE } from './mapStyle';

// The blurred basemap is fetched by a script with the view and style written out; if they differ
// from the live map's, the map visibly jumps when it replaces the placeholder.
const script = readFileSync(
  fileURLToPath(new URL('../../../../../scripts/generate-map-placeholder.sh', import.meta.url)),
  'utf8',
);

// The images only change when the script is run, which needs a Mapbox token, so say so.
const REGENERATE =
  'The placeholder script no longer matches the map. Update its views or style, then run ' +
  'scripts/generate-map-placeholder.sh (needs a Mapbox token) and commit both new images.';

function scriptValue(name: string) {
  return new RegExp(`^${name}=(\\S+)$`, 'm').exec(script)?.[1];
}

describe('scripts/generate-map-placeholder.sh', () => {
  it('fetches the style the map uses', () => {
    expect(scriptValue('style'), REGENERATE).toBe(MAP_STYLE.replace('mapbox://styles/', ''));
  });

  it('fetches the default map view for desktops, without bearing or pitch', () => {
    const { mapCenter, mapZoom } = useUIStore.getInitialState();
    expect(scriptValue('desktop_view'), REGENERATE).toBe(
      `${mapCenter[0]},${mapCenter[1]},${mapZoom},0,0`,
    );
  });

  it('fetches the view the map starts at on a phone', () => {
    expect(scriptValue('phone_view'), REGENERATE).toBe(
      `${MOBILE_CENTER[0]},${MOBILE_CENTER[1]},${MOBILE_ZOOM},0,0`,
    );
  });
});
