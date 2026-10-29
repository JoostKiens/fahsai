import type { Meta, StoryObj } from '@storybook/react-vite';
import { waitForRenderReady } from './story-harness/DeckHarness';
import { expectDrawnPixels } from './story-harness/probes';
import { WindParticles } from './story-harness/WindParticles';

const meta = {
  title: 'Map/Wind particles',
  component: WindParticles,
  args: { seed: 1, frame: 120 },
  // Bounded: each frame is simulated synchronously before the first paint.
  argTypes: { frame: { control: { type: 'range', min: 0, max: 600, step: 10 } } },
  // Remount on control changes: the seed and frame are only read when the particles start.
  render: (args) => <WindParticles key={`${args.seed}-${args.frame}`} {...args} />,
} satisfies Meta<typeof WindParticles>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const deck = await waitForRenderReady(canvasElement);
    // About 4,600 drawn pixels at seed 1, frame 120.
    expectDrawnPixels({ deck, bbox: [89, 1, 114, 30], min: 2000, label: 'Wind particle trails' });
  },
};
