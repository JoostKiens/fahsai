import type { Deck } from '@deck.gl/core';
import { pm25ToRgb } from '@/utils/aqiColors';
import { HARNESS_BACKGROUND_RGB } from './DeckHarness';

// Checks that look inside the Deck canvas. Failure messages say what was expected where, and
// what was found, so they can be acted on without seeing the canvas.

type Rgb = [number, number, number];
type LngLat = [number, number];
/** [west, south, east, north] in degrees. */
type Bbox = [number, number, number, number];

// shortcut: mirrors HEATMAP_ALPHA in camsCanvas.worker.ts (importing the worker would run it);
// if the two drift, the PM2.5 probes fail with a colour mismatch.
const HEATMAP_ALPHA = 55;

// Largest per-channel drift measured under headless SwiftShader was 4 (bitmap texture
// filtering). After blending, the closest pair of AQI categories (Moderate vs Unhealthy for
// sensitive groups) differs by 18, so a wrong category is never within tolerance.
export const PIXEL_TOLERANCE = 8;

/** The colour a PM2.5 value is drawn in on the story background, after alpha blending. */
export function pm25ColorOnBackground(pm25: number): Rgb {
  const alpha = HEATMAP_ALPHA / 255;
  const rgb = pm25ToRgb(pm25);
  return [0, 1, 2].map((i) =>
    Math.round(rgb[i] * alpha + HARNESS_BACKGROUND_RGB[i] * (1 - alpha)),
  ) as Rgb;
}

/** Throws unless the canvas pixel at `lngLat` is within `tolerance` (per channel) of `expected`. */
export function expectPixelNear({
  deck,
  lngLat,
  expected,
  tolerance,
  label,
}: {
  deck: Deck;
  lngLat: LngLat;
  expected: Rgb;
  tolerance: number;
  label: string;
}): void {
  const [x, y] = toCanvasPoint(deck, lngLat);
  const actual = readPixel(deck, x, y);
  const delta = Math.max(...actual.map((channel, i) => Math.abs(channel - expected[i])));
  if (delta <= tolerance) return;
  throw new Error(
    `${label}: expected ~${toHex(expected)} at (${x}, ${y}) [${formatLngLat(lngLat)}], ` +
      `got ${toHex(actual)} (max channel difference ${delta}, tolerance ${tolerance})`,
  );
}

/** Throws unless picking finds at least `min` distinct objects of `layerId` inside `bbox`. */
export function expectPicked({
  deck,
  bbox,
  layerId,
  min,
  label,
}: {
  deck: Deck;
  bbox: Bbox;
  layerId: string;
  min: number;
  label: string;
}): number {
  const [west, south, east, north] = bbox;
  const [left, top] = toCanvasPoint(deck, [west, north]);
  const [right, bottom] = toCanvasPoint(deck, [east, south]);
  const count = deck.pickObjects({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    layerIds: [layerId],
  }).length;
  if (count >= min) return count;
  throw new Error(
    `${label}: expected at least ${min} '${layerId}' objects picked in ` +
      `[${formatLngLat([west, south])} – ${formatLngLat([east, north])}], got ${count}`,
  );
}

/** Throws unless at least `min` pixels inside `bbox` differ from the story background. */
export function expectDrawnPixels({
  deck,
  bbox,
  min,
  label,
}: {
  deck: Deck;
  bbox: Bbox;
  min: number;
  label: string;
}): number {
  const [west, south, east, north] = bbox;
  const [left, top] = toCanvasPoint(deck, [west, north]);
  const [right, bottom] = toCanvasPoint(deck, [east, south]);
  const pixels = readPixels(deck, left, top, right - left, bottom - top);
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const isBackground = HARNESS_BACKGROUND_RGB.every((channel, c) => pixels[i + c] === channel);
    if (!isBackground) count++;
  }
  if (count >= min) return count;
  throw new Error(
    `${label}: expected at least ${min} drawn (non-background) pixels in ` +
      `[${formatLngLat([west, south])} – ${formatLngLat([east, north])}], got ${count}`,
  );
}

function toCanvasPoint(deck: Deck, lngLat: LngLat): [number, number] {
  const [x, y] = deck.getViewports()[0].project(lngLat);
  return [Math.round(x), Math.round(y)];
}

function readPixel(deck: Deck, x: number, y: number): Rgb {
  const [r, g, b] = readPixels(deck, x, y, 1, 1);
  return [r, g, b];
}

// The harness renders at 1 device pixel per CSS pixel, so canvas and CSS coordinates match.
function readPixels(deck: Deck, x: number, y: number, width: number, height: number) {
  const canvas = deck.getCanvas();
  if (!canvas) throw new Error('Deck has no canvas to read from');
  const copy = document.createElement('canvas');
  copy.width = width;
  copy.height = height;
  const context = copy.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  context.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function formatLngLat([lng, lat]: LngLat): string {
  return `${lng}°E ${lat}°N`;
}
