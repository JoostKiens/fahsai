import { createLandMaskLayer, createPM25BitmapLayer } from '../PM25Layer';
import { useCamsBitmap } from '../useCamsBitmap';
import { DeckHarness } from './DeckHarness';
import { camsPoints } from './fixture-data';

/**
 * Story-only wrapper, not an app component.
 * CAMS PM2.5 grid for 2026-10-24, painted by the real web worker and clipped to land.
 *
 * Correct output: a rectangle between 89–114°E and 1–30°N that covers land only (the sea
 * stays the dark background), with recognisable coastlines and north up. Mostly green (Good)
 * and yellow-brown (Moderate) at low opacity; the only red (Unhealthy) patches are in the
 * north-west corner (around 22–27°N, 89–95°E) and a few small spots near the southern edge.
 * The play function checks one Unhealthy cell (23°N 89.4°E) and one Good cell
 * (19.8°N 101.4°E), then that every drawn cell centre shows its own category's colour and that
 * about as many cells are drawn as the land mask covers.
 */
export function Pm25Grid() {
  const bitmap = useCamsBitmap(camsPoints);
  return <DeckHarness layers={bitmap && [createLandMaskLayer(), createPM25BitmapLayer(bitmap)]} />;
}
