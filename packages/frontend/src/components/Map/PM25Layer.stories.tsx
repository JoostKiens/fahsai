import type { Meta, StoryObj } from '@storybook/react-vite';
import { waitForRenderReady } from './story-harness/DeckHarness';
import { Pm25Grid, camsPoints } from './story-harness/Pm25Grid';
import { PIXEL_TOLERANCE, expectPixelNear, pm25ColorOnBackground } from './story-harness/probes';

// Probe cells sit inside blocks of one AQI category, so the drawn colour is that category's.
const UNHEALTHY_CELL: [number, number] = [89.4, 23];
const CLEAN_CELL: [number, number] = [101.4, 19.8];

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
    for (const cell of [UNHEALTHY_CELL, CLEAN_CELL]) {
      const pm25 = pm25At(cell);
      expectPixelNear({
        deck,
        lngLat: cell,
        expected: pm25ColorOnBackground(pm25),
        tolerance: PIXEL_TOLERANCE,
        label: `PM2.5 cell (${pm25} µg/m³)`,
      });
    }
  },
};
