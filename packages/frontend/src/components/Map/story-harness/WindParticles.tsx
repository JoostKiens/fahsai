import { useState } from 'react';
import { WebMercatorViewport } from '@deck.gl/core';
import type { Layer } from '@deck.gl/core';
import { useWindParticles } from '../useWindParticles';
import { DeckHarness, HARNESS_HEIGHT_PX, HARNESS_WIDTH_PX, STORY_VIEW_STATE } from './DeckHarness';
import { camsPoints, windReadings } from './fixture-data';
import { seededRandom } from './seeded-random';

// Stand-in for the Mapbox map: reports the harness's fixed view, never moves.
const [west, south, east, north] = new WebMercatorViewport({
  ...STORY_VIEW_STATE,
  width: HARNESS_WIDTH_PX,
  height: HARNESS_HEIGHT_PX,
}).getBounds();
const storyMap = {
  getBounds: () => ({
    getWest: () => west,
    getSouth: () => south,
    getEast: () => east,
    getNorth: () => north,
  }),
  getContainer: () => ({ clientWidth: HARNESS_WIDTH_PX }),
  on: () => undefined,
  off: () => undefined,
};

export type WindParticlesProps = {
  /** Seed for particle spawning; same seed and frame give the same picture. */
  seed: number;
  /** Number of fixed 60 Hz steps simulated before the animation is frozen. */
  frame: number;
};

/**
 * Story-only wrapper, not an app component.
 * Wind particles for 2026-10-24, coloured by the CAMS PM2.5 they spawn in, frozen at one frame.
 *
 * Correct output: hundreds of short, thin, tapered trails spread over 89–114°E and 1–30°N,
 * mostly pale grey-green and yellow (spawned in Good or Moderate air), with a small tight loop
 * near 16°N 90°E. Nothing outside that area. The play function checks that trails were drawn.
 */
export function WindParticles({ seed, frame }: WindParticlesProps) {
  const [layers, setLayers] = useState<Layer[] | null>(null);
  const [overlay] = useState(() => ({
    setProps: (props: { layers: Layer[] }) => setLayers(props.layers),
  }));
  const [random] = useState(() => seededRandom(seed));
  useWindParticles(overlay, storyMap, windReadings, { visible: true, opacity: 1 }, camsPoints, {
    random,
    freezeAtFrame: frame,
  });
  return <DeckHarness layers={layers} />;
}
