import type { Meta, StoryObj } from '@storybook/react-vite';
import { waitForRenderReady } from './story-harness/DeckHarness';
import { GRID_BBOX } from './story-harness/fixture-data';
import { expectDrawnPixels } from './story-harness/probes';
import { WindParticles } from './story-harness/WindParticles';

// Measured at the default controls; other seeds and frames draw different amounts.
const DEFAULT_ARGS = { seed: 1, frame: 120 };
const DEFAULT_MIN_DRAWN_PX = 2000; // about 4,600 drawn

const meta = {
  title: 'Map/Wind particles',
  component: WindParticles,
  args: DEFAULT_ARGS,
  // Bounded: each frame is simulated synchronously before the first paint.
  argTypes: { frame: { control: { type: 'range', min: 0, max: 600, step: 10 } } },
  // Remount on control changes: the seed and frame are only read when the particles start.
  render: (args) => <WindParticles key={`${args.seed}-${args.frame}`} {...args} />,
} satisfies Meta<typeof WindParticles>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const deck = await waitForRenderReady(canvasElement);
    const isDefault = args.seed === DEFAULT_ARGS.seed && args.frame === DEFAULT_ARGS.frame;
    if (!isDefault) return;
    // Only checks that trails were drawn, not where or in what colour.
    expectDrawnPixels({
      deck,
      bbox: GRID_BBOX,
      min: DEFAULT_MIN_DRAWN_PX,
      label: 'Wind particle trails',
    });
  },
};
