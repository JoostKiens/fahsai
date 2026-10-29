import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import summaryResponse from './fixtures/2026-10-24/cams-summary.json';
import { TimelineChart } from './TimelineChart';

// Production API response: daily p95 PM2.5 across the grid, 30 days to 2026-10-24, shaped
// the way usePm25Timeline's `select` returns it.
const timeline = new Map(summaryResponse.data.map((d) => [d.date, d.pm25]));

const meta = {
  component: TimelineChart,
  args: { timeline, latestDate: '2026-10-24', scrubberDays: 30, scrubberDay: 29 },
  argTypes: { timeline: { control: false } },
  // Roughly the scrubber's width on desktop.
  decorators: [
    (Story) => (
      <div className="w-[480px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimelineChart>;

export default meta;
type Story = StoryObj<typeof meta>;

// The marker sits on the latest day.
export const LatestDay: Story = {};

export const FirstDay: Story = { args: { scrubberDay: 0 } };

// Missing days break the line instead of joining across them.
export const WithGap: Story = {
  args: {
    timeline: new Map([...timeline].filter(([date]) => date < '2026-10-08' || date > '2026-10-12')),
  },
};

// No data yet: an empty placeholder of the same height, so the scrubber doesn't jump.
export const Empty: Story = {
  args: { timeline: undefined },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('svg')).toBeNull();
  },
};
