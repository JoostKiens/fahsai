import type { Meta, StoryObj } from '@storybook/react-vite';
import type { BaselineDay } from '@thailand-aq/types';
import { expect } from 'storybook/test';
import fangResponse from './fixtures/2026-10-24/baseline-fang.json';
import saraphiResponse from './fixtures/2026-10-24/baseline-saraphi.json';
import { YearCurve } from './YearCurve';

// Production API responses. Saraphi has all 365 days; Fang has gaps (308 days).
const saraphiBaseline: BaselineDay[] = saraphiResponse.data;
const fangBaseline: BaselineDay[] = fangResponse.data;

const meta = {
  component: YearCurve,
  args: { data: saraphiBaseline, currentPm25: 22.1, selectedDate: '2026-10-24' },
  argTypes: {
    data: { control: false },
    // A 'YYYY-MM-DD' string; the preview's date matcher would pass a timestamp instead.
    selectedDate: { control: 'text' },
  },
  // The info panel's content width.
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof YearCurve>;

export default meta;
type Story = StoryObj<typeof meta>;

// The day's reading (dot) on the typical year: median line, p25–p75 band.
export const WithinBand: Story = {};

// A reading far above the usual for the date; the y-axis grows to fit it.
export const WellAboveBand: Story = { args: { currentPm25: 140 } };

// Peak burning season, where the band itself is high.
export const BurningSeason: Story = { args: { currentPm25: 95, selectedDate: '2026-03-20' } };

// No reading for the selected day: the date marker stays, the dot goes.
export const NoReading: Story = {
  args: { currentPm25: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('circle')).toBeNull();
  },
};

// Fang's baseline is missing 2 days in July and 55 days from late August to mid-October. The
// line and band break there instead of bridging the gaps with made-up values.
export const BaselineWithGaps: Story = {
  args: { data: fangBaseline, currentPm25: 18 },
  play: async ({ canvas }) => {
    const medianLine = canvas.getByTestId('median-line');
    const segmentCount = medianLine.getAttribute('d')?.match(/M/g)?.length;
    await expect(segmentCount).toBe(3);
  },
};

// Days with no neighbour on either side (1 January, 15 June), as a newly filled-in station can
// have. Each still shows as a dot on the median line.
export const SingleDayIslands: Story = {
  args: {
    data: saraphiBaseline.filter(
      ({ month, day }) => !(month === 1 && day >= 2 && day <= 10) && !(month === 6 && day !== 15),
    ),
  },
  play: async ({ canvasElement }) => {
    // querySelector, not getByTestId: Testing Library's queries are typed for HTML elements.
    const medianLine = canvasElement.querySelector<SVGPathElement>('[data-testid="median-line"]');
    if (!medianLine) throw new Error('Median line not rendered');
    // A lone day is a zero-length segment: "M x,y L x,y", followed by the next "M" or the end.
    const islands = [
      ...(medianLine.getAttribute('d') ?? '').matchAll(/M([\d.]+),([\d.]+)L\1,\2(?=M|$)/g),
    ];
    await expect(islands).toHaveLength(2);
    for (const [, x, y] of islands) {
      await expect(medianLine.isPointInStroke(new DOMPoint(Number(x), Number(y)))).toBe(true);
    }
  },
};
