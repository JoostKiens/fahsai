import type { Meta, StoryObj } from '@storybook/react-vite';
import firesResponse from './story-harness/fixtures/2026-10-24/fires.json';
import { DeckHarness, waitForRenderReady } from './story-harness/DeckHarness';
import { createFiresLayer } from './FiresLayer';

/** NASA FIRMS fire detections for 2026-10-24 (556 points), as the map draws them. */
function Fires() {
  return <DeckHarness layers={[createFiresLayer(firesResponse.data, 1, () => {})]} />;
}

const meta = {
  title: 'Map/Fires layer',
  component: Fires,
} satisfies Meta<typeof Fires>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await waitForRenderReady(canvasElement);
  },
};
