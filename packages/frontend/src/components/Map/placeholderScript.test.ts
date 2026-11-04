// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { useUIStore } from '@/store/uiStore';
import { MAP_STYLE } from './mapStyle';

// The blurred basemap is fetched by a script with the view and style written out; if they differ
// from the live map's, the map visibly jumps when it replaces the placeholder.
const script = readFileSync(
  fileURLToPath(new URL('../../../../../scripts/generate-map-placeholder.sh', import.meta.url)),
  'utf8',
);

function scriptValue(name: string) {
  return new RegExp(`^${name}=(\\S+)$`, 'm').exec(script)?.[1];
}

describe('scripts/generate-map-placeholder.sh', () => {
  it('fetches the style the map uses', () => {
    expect(scriptValue('style')).toBe(MAP_STYLE.replace('mapbox://styles/', ''));
  });

  it('fetches the default map view, without bearing or pitch', () => {
    const { mapCenter, mapZoom } = useUIStore.getInitialState();
    expect(scriptValue('view')).toBe(`${mapCenter[0]},${mapCenter[1]},${mapZoom},0,0`);
  });
});
