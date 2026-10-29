import type { Meta, StoryObj } from '@storybook/react-vite';
import { waitForRenderReady } from './story-harness/DeckHarness';
import seaLandMask from './sea-land-mask.json';
import { camsPoints } from './story-harness/fixture-data';
import { Pm25Grid } from './story-harness/Pm25Grid';
import {
  PIXEL_TOLERANCE,
  expectCellColors,
  expectPixelNear,
  heatmapColorOnBackground,
} from './story-harness/probes';
import type { Rgb } from './story-harness/probes';

// The legend's AQI categories (upper bound in µg/m³), written out here rather than imported
// from aqiColors.ts, so a broken colour ramp in the app can't change both sides of a check.
const CATEGORIES: { name: string; upTo: number; rgb: Rgb }[] = [
  { name: 'Good', upTo: 9.0, rgb: [88, 196, 88] },
  { name: 'Moderate', upTo: 35.4, rgb: [240, 210, 50] },
  { name: 'Unhealthy for sensitive groups', upTo: 55.4, rgb: [255, 126, 0] },
  { name: 'Unhealthy', upTo: 125.4, rgb: [255, 0, 0] },
  { name: 'Very unhealthy', upTo: 225.4, rgb: [143, 63, 151] },
  { name: 'Hazardous', upTo: Infinity, rgb: [126, 0, 35] },
];

function categoryOf(pm25: number) {
  const category = CATEGORIES.find(({ upTo }) => pm25 <= upTo);
  if (!category) throw new Error(`Not a PM2.5 value: ${pm25}`);
  return category;
}

// Two cells inside blocks of one category: a readable first check. Robust to small shifts, so
// the full-grid check below is what catches a misplaced grid.
const PROBE_CELLS: { cell: [number, number]; category: string }[] = [
  { cell: [89.4, 23], category: 'Unhealthy' },
  { cell: [101.4, 19.8], category: 'Good' },
];

// How many cells should be drawn, from the land mask's geometry rather than a render: 2,347 on
// the 2026-10-24 fixture vs 2,320 drawn (cells right on a coastline can go either way). A broken
// mask draws all 4,599; the swap and the Mercator shift blank or recolour hundreds.
const DRAWN_CELL_SLACK = 0.02;
type MaskGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };
const LAND_RINGS = (seaLandMask as { features: { geometry: MaskGeometry }[] }).features.flatMap(
  ({ geometry }) =>
    geometry.type === 'Polygon'
      ? [geometry.coordinates[0]]
      : geometry.coordinates.map((polygon) => polygon[0]),
);

// Even-odd ray casting against the mask's outer rings, as createLandMaskLayer draws them.
function isOnLand([lng, lat]: [number, number]): boolean {
  return LAND_RINGS.some((ring) => {
    let isInside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (crosses) isInside = !isInside;
    }
    return isInside;
  });
}

function pm25At([lng, lat]: [number, number]): number {
  const point = camsPoints.find(
    (p) => Math.abs(p.lng - lng) < 0.01 && Math.abs(p.lat - lat) < 0.01,
  );
  if (!point) throw new Error(`No CAMS fixture point at ${lng}°E ${lat}°N`);
  return point.pm25;
}

const meta = {
  title: 'Map/PM2.5 grid layer',
  component: Pm25Grid,
} satisfies Meta<typeof Pm25Grid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const deck = await waitForRenderReady(canvasElement);
    for (const { cell, category } of PROBE_CELLS) {
      const pm25 = pm25At(cell);
      const { name, rgb } = categoryOf(pm25);
      if (name !== category) {
        throw new Error(`Probe cell ${cell.join(', ')} is ${name} in the fixture, not ${category}`);
      }
      expectPixelNear({
        deck,
        lngLat: cell,
        expected: heatmapColorOnBackground(rgb),
        tolerance: PIXEL_TOLERANCE,
        label: `PM2.5 cell (${pm25} µg/m³, ${name})`,
      });
    }
    const landCellCount = camsPoints.filter(({ lng, lat }) => isOnLand([lng, lat])).length;
    expectCellColors({
      deck,
      cells: camsPoints.map(({ lng, lat, pm25 }) => ({
        lngLat: [lng, lat],
        expected: heatmapColorOnBackground(categoryOf(pm25).rgb),
      })),
      tolerance: PIXEL_TOLERANCE,
      drawn: {
        min: Math.floor(landCellCount * (1 - DRAWN_CELL_SLACK)),
        max: Math.ceil(landCellCount * (1 + DRAWN_CELL_SLACK)),
      },
      label: 'PM2.5 grid',
    });
  },
};
