import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { useUIStore } from '@/store/uiStore';
import { HintPill } from './HintPill';

// Shown after a 400 ms delay, until a point is selected or the pill is tapped; it also
// dismisses itself after 6 s (not tested: it would slow every run).
const ENTRY_WAIT_MS = 600;
const meta = {
  component: HintPill,
  // Mobile-only (hidden from md up); positioned absolutely over the map.
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  // The mobile viewport also puts it in a phone-width iframe on the Docs page; this is its height.
  parameters: { docs: { story: { iframeHeight: 340 } } },
  decorators: [
    (Story) => (
      <div className="relative h-[300px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HintPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Shown: Story = {};

export const TapDismisses: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Dismiss hint' }));
    await expect(useUIStore.getState().hintDismissed).toBe(true);
    await waitFor(() => expect(canvas.queryByRole('button')).toBeNull());
  },
};

// Once a point is selected the hint has done its job.
export const HiddenWhenPointSelected: Story = {
  beforeEach: () => {
    useUIStore.setState({ selectedPoint: { lngLat: [98.98, 18.77] } });
  },
  play: async ({ canvas }) => {
    await new Promise((resolve) => setTimeout(resolve, ENTRY_WAIT_MS));
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

export const Thai: Story = { globals: { locale: 'th' } };
