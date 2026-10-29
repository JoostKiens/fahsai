import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StationDayHistory } from '@thailand-aq/types';
import { expect } from 'storybook/test';
import historyResponse from './fixtures/2026-10-24/history-saraphi.json';
import { History, ShimmerHistory } from './History';

// Production API response: Saraphi, Chiang Mai, the week ending 2026-10-24.
const saraphiWeek: StationDayHistory[] = historyResponse.days;

const meta = {
  component: History,
  args: { days: saraphiWeek },
  // The info panel's content width.
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof History>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Week: Story = {};

// Hovering a bar shows its rounded value in the #tooltip portal.
export const HoverShowsValue: Story = {
  play: async ({ canvas, userEvent }) => {
    const [lastBarLabel] = canvas.getAllByText('24 Oct');
    await userEvent.hover(lastBarLabel);
    await expect(document.getElementById('tooltip')).toHaveTextContent('22 µg/m³');
  },
};

// A day with a high reading rescales the y-axis and gets its own category colour.
export const OneUnhealthyDay: Story = {
  args: {
    days: saraphiWeek.map((day, i) => (i === 3 ? { ...day, pm25: 140 } : day)),
  },
};

// Days without readings keep their date label but draw no bar; missing weather shows dashes.
export const MissingDays: Story = {
  args: {
    days: saraphiWeek.map((day, i) =>
      i === 2 || i === 3 ? { ...day, pm25: 0, readingCount: 0, weather: null } : day,
    ),
  },
};

// A station that reported nothing all week, as some stations in the API do.
export const NoReadings: Story = {
  args: { days: saraphiWeek.map((day) => ({ ...day, pm25: 0, readingCount: 0 })) },
};

// What the info panel shows while the history loads.
export const Loading: Story = {
  render: () => <ShimmerHistory />,
};
