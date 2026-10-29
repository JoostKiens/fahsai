import type { Meta, StoryObj } from '@storybook/react-vite';
import { waitForRenderReady } from './story-harness/DeckHarness';
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
  return CATEGORIES.find(({ upTo }) => pm25 <= upTo) ?? CATEGORIES[CATEGORIES.length - 1];
}

// Two cells inside blocks of one category: a readable first check. Robust to small shifts, so
// the full-grid check below is what catches a misplaced grid.
const PROBE_CELLS: [number, number][] = [
  [89.4, 23],
  [101.4, 19.8],
];

// Every land cell centre shows its own colour on a correct render: 2,320 of 2,320 on the
// 2026-10-24 fixture. 1% slack for mask-edge differences between GPUs; the 0.8° Mercator shift
// fixed in #65 left only 1,931.
const MIN_MATCHING_LAND_CELLS = Math.floor(2320 * 0.99);

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
    for (const cell of PROBE_CELLS) {
      const pm25 = pm25At(cell);
      const { name, rgb } = categoryOf(pm25);
      expectPixelNear({
        deck,
        lngLat: cell,
        expected: heatmapColorOnBackground(rgb),
        tolerance: PIXEL_TOLERANCE,
        label: `PM2.5 cell (${pm25} µg/m³, ${name})`,
      });
    }
    expectCellColors({
      deck,
      cells: camsPoints.map(({ lng, lat, pm25 }) => ({
        lngLat: [lng, lat],
        expected: heatmapColorOnBackground(categoryOf(pm25).rgb),
      })),
      tolerance: PIXEL_TOLERANCE,
      min: MIN_MATCHING_LAND_CELLS,
      label: 'PM2.5 grid',
    });
  },
};
