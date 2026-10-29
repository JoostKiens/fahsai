import type { Meta, StoryObj } from '@storybook/react-vite';
import { waitForRenderReady } from './story-harness/DeckHarness';
import { camsPoints } from './story-harness/fixture-data';
import { Pm25Grid } from './story-harness/Pm25Grid';
import { PIXEL_TOLERANCE, expectPixelNear, heatmapColorOnBackground } from './story-harness/probes';

// Probe cells sit inside blocks of one AQI category, so the drawn colour is that category's.
// The colours are the legend's, written out here rather than imported from aqiColors.ts.
const PROBES = [
  { cell: [89.4, 23], category: 'Unhealthy', rgb: [255, 0, 0] },
  { cell: [101.4, 19.8], category: 'Good', rgb: [88, 196, 88] },
] as const satisfies {
  cell: [number, number];
  category: string;
  rgb: [number, number, number];
}[];

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
    for (const { cell, category, rgb } of PROBES) {
      expectPixelNear({
        deck,
        lngLat: [...cell],
        expected: heatmapColorOnBackground([...rgb]),
        tolerance: PIXEL_TOLERANCE,
        label: `PM2.5 cell (${pm25At([...cell])} µg/m³, ${category})`,
      });
    }
  },
};
