import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StationDayHistory } from '@thailand-aq/types';
import { expect, within } from 'storybook/test';
import historyResponse from './fixtures/2026-10-24/history-saraphi.json';
import { PmBarChart } from './PmBarChart';

const saraphiWeek: StationDayHistory[] = historyResponse.days;

const meta = {
  component: PmBarChart,
  args: { days: saraphiWeek },
} satisfies Meta<typeof PmBarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

// The info panel's content width and bar height.
export const Panel: Story = {
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

// The city page's chart: taller bars, in the page's content width.
export const CityPage: Story = {
  args: { barHeight: 140 },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas, userEvent }) => {
    const [lastBarLabel] = canvas.getAllByText('24 Oct');
    await userEvent.hover(lastBarLabel);
    await expect(await within(document.body).findByText('22')).toHaveTextContent('22 µg/m³');
  },
};
