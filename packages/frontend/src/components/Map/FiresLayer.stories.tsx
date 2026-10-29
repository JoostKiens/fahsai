import type { Meta, StoryObj } from '@storybook/react-vite';
import firesResponse from './story-harness/fixtures/2026-10-24/fires.json';
import { waitForRenderReady } from './story-harness/DeckHarness';
import { Fires } from './story-harness/Fires';
import { expectPicked } from './story-harness/probes';

// Mainland box with spread-out fires; overlapping glows hide some from picking (48 of 57 found).
const PROBE_BBOX: [number, number, number, number] = [97, 14, 106, 23];
const PICKABLE_SHARE = 0.75;

const meta = {
  title: 'Map/Fires layer',
  component: Fires,
} satisfies Meta<typeof Fires>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const deck = await waitForRenderReady(canvasElement);
    const [west, south, east, north] = PROBE_BBOX;
    const inBox = firesResponse.data.filter(
      ({ lng, lat }) => lng >= west && lng <= east && lat >= south && lat <= north,
    ).length;
    expectPicked({
      deck,
      bbox: PROBE_BBOX,
      layerId: 'fire-glow',
      min: Math.ceil(inBox * PICKABLE_SHARE),
      label: `Fires (${inBox} in the fixture for this box)`,
    });
  },
};
