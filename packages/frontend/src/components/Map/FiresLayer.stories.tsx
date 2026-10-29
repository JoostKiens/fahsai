import type { Meta, StoryObj } from '@storybook/react-vite';
import { waitForRenderReady } from './story-harness/DeckHarness';
import { firePoints } from './story-harness/fixture-data';
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
    const inBox = firePoints.filter(
      ({ lng, lat }) => lng >= west && lng <= east && lat >= south && lat <= north,
    ).length;
    // Otherwise the minimum below is 0 and the check passes without testing anything.
    if (inBox === 0) throw new Error(`Fires: the fixture has no fires in ${PROBE_BBOX.join(', ')}`);
    expectPicked({
      deck,
      bbox: PROBE_BBOX,
      layerId: 'fire-glow',
      min: Math.ceil(inBox * PICKABLE_SHARE),
      label: `Fires (${inBox} in the fixture for this box)`,
    });
  },
};
