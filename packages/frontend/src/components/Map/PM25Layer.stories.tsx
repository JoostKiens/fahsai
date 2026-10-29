import type { Meta, StoryObj } from '@storybook/react-vite';
import { parseCamsGridResponse } from '@/utils/camsColumns';
import camsResponse from './story-harness/fixtures/2026-10-24/cams.json';
import { DeckHarness, waitForRenderReady } from './story-harness/DeckHarness';
import { createLandMaskLayer, createPM25BitmapLayer } from './PM25Layer';
import { useCamsBitmap } from './useCamsBitmap';

const points = parseCamsGridResponse(camsResponse.data);

/** CAMS PM2.5 grid for 2026-10-24, painted by the real web worker and clipped to land. */
function Pm25Grid() {
  const bitmap = useCamsBitmap(points);
  return <DeckHarness layers={bitmap && [createLandMaskLayer(), createPM25BitmapLayer(bitmap)]} />;
}

const meta = {
  title: 'Map/PM2.5 grid layer',
  component: Pm25Grid,
} satisfies Meta<typeof Pm25Grid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await waitForRenderReady(canvasElement);
  },
};
