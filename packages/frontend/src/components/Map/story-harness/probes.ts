import type { Deck } from '@deck.gl/core';
import { HEATMAP_ALPHA } from '@/utils/aqiColors';
import { HARNESS_BACKGROUND_RGB } from './DeckHarness';

// Checks that look inside the Deck canvas. Failure messages say what was expected where, and
// what was found, so they can be acted on without seeing the canvas.

export type Rgb = [number, number, number];
type LngLat = [number, number];
/** [west, south, east, north] in degrees. */
type Bbox = [number, number, number, number];

// Largest per-channel drift measured under headless SwiftShader was 4 (bitmap texture
// filtering). After blending, the closest pair of AQI categories (Moderate vs Unhealthy for
// sensitive groups) differs by 18, so a wrong category is never within tolerance.
export const PIXEL_TOLERANCE = 8;

/**
 * How a heatmap colour looks on the story background after alpha blending. Pass the category
 * colour as a literal, not from the app's colour functions, so a broken ramp can't change both
 * sides of the check.
 */
export function heatmapColorOnBackground(rgb: Rgb): Rgb {
  const alpha = HEATMAP_ALPHA / 255;
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
  const delta = maxChannelDifference(actual, expected);
  if (delta <= tolerance) return;
  throw new Error(
    `${label}: expected ~${toHex(expected)} at (${x}, ${y}) [${formatLngLat(lngLat)}], ` +
      `got ${toHex(actual)} (max channel difference ${delta}, tolerance ${tolerance})`,
  );
}

/**
 * Throws unless at least `min` of `cells` show their expected colour at their own position.
 * Cells drawn as background (sea under the land mask) are skipped, so `min` must come from a
 * known-good render: a bug that blanks cells shows up as too few matches.
 */
export function expectCellColors({
  deck,
  cells,
  tolerance,
  min,
  label,
}: {
  deck: Deck;
  cells: { lngLat: LngLat; expected: Rgb }[];
  tolerance: number;
  min: number;
  label: string;
}): void {
  const canvas = deck.getCanvas();
  if (!canvas) throw new Error('Deck has no canvas to read from');
  const { width, height } = canvas;
  const pixels = readPixels(deck, 0, 0, width, height);
  let matching = 0;
  const mismatches: string[] = [];
  for (const { lngLat, expected } of cells) {
    const [x, y] = toCanvasPoint(deck, lngLat);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = (y * width + x) * 4;
    const actual: Rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    if (isBackground(actual)) continue;
    if (maxChannelDifference(actual, expected) <= tolerance) {
      matching++;
    } else if (mismatches.length < 3) {
      mismatches.push(
        `${formatLngLat(lngLat)}: expected ~${toHex(expected)}, got ${toHex(actual)}`,
      );
    }
  }
  if (matching >= min) return;
  throw new Error(
    `${label}: expected at least ${min} cells to show their own colour, ${matching} did ` +
      `(cells drawn as background don't count). First mismatches: ${mismatches.join('; ') || 'none'}`,
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
}): void {
  const { x, y, width, height } = toCanvasRect(deck, bbox, label);
  const count = deck.pickObjects({ x, y, width, height, layerIds: [layerId] }).length;
  if (count >= min) return;
  throw new Error(
    `${label}: expected at least ${min} '${layerId}' objects picked in ${formatBbox(bbox)}, ` +
      `got ${count}`,
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
}): void {
  const { x, y, width, height } = toCanvasRect(deck, bbox, label);
  const pixels = readPixels(deck, x, y, width, height);
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (!isBackground([pixels[i], pixels[i + 1], pixels[i + 2]])) count++;
  }
  if (count >= min) return;
  throw new Error(
    `${label}: expected at least ${min} drawn (non-background) pixels in ${formatBbox(bbox)}, ` +
      `got ${count}`,
  );
}

// The box's screen rectangle, clipped to the canvas: pixels outside it read as transparent, and an
// empty rectangle would make getImageData throw an unhelpful IndexSizeError.
function toCanvasRect(deck: Deck, [west, south, east, north]: Bbox, label: string) {
  const canvas = deck.getCanvas();
  if (!canvas) throw new Error('Deck has no canvas to read from');
  const [left, top] = toCanvasPoint(deck, [west, north]);
  const [right, bottom] = toCanvasPoint(deck, [east, south]);
  const x = Math.max(0, left);
  const y = Math.max(0, top);
  const width = Math.min(canvas.width, right) - x;
  const height = Math.min(canvas.height, bottom) - y;
  if (width <= 0 || height <= 0) {
    throw new Error(`${label}: ${formatBbox([west, south, east, north])} is not on the canvas`);
  }
  return { x, y, width, height };
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

function isBackground(rgb: Rgb): boolean {
  return HARNESS_BACKGROUND_RGB.every((channel, i) => rgb[i] === channel);
}

function maxChannelDifference(actual: Rgb, expected: Rgb): number {
  return Math.max(...actual.map((channel, i) => Math.abs(channel - expected[i])));
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function formatLngLat([lng, lat]: LngLat): string {
  return `${+lng.toFixed(2)}°E ${+lat.toFixed(2)}°N`;
}

function formatBbox([west, south, east, north]: Bbox): string {
  return `[${formatLngLat([west, south])} – ${formatLngLat([east, north])}]`;
}
