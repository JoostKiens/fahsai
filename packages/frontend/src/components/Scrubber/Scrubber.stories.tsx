import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw/http';
import { expect, waitFor } from 'storybook/test';
import { useSettingsStore } from '@/store/settingsStore';
import { useTimeStore } from '@/store/timeStore';
import { useUIStore } from '@/store/uiStore';
import summaryResponse from './fixtures/2026-10-24/cams-summary.json';
import { Scrubber } from './Scrubber';
import { SCRUBBER_BAR_CLS } from './scrubberLayout';

// The fixture covers the 30 days to 2026-10-24, so the stories use a 30-day range ending there.
const LATEST_DATE = '2026-10-24';
const SCRUBBER_DAYS = 30;

// The page reserves the scrubber's height before its island mounts (SCRUBBER_BAR_CLS, used in
// layouts/AppShell.astro), so the sidebar and map don't resize when it appears. The scrubber keeps
// that height as its minimum, so it only moves the page if its content is taller than the
// reservation; shorter just makes the bar a little taller than its content. This runs in a real
// browser at the story's viewport, so it fails when the scrubber's layout changes without the
// constant. The bar is found by the constant's min-height class, not by its position in the canvas.
const MIN_HEIGHT_CLASS = SCRUBBER_BAR_CLS.split(' ').find((c) => c.startsWith('min-h-'));

async function expectReservedHeight(canvasElement: HTMLElement) {
  const root = canvasElement.querySelector<HTMLElement>(`[class~="${MIN_HEIGHT_CLASS}"]`);
  if (!root)
    throw new Error(`No element with ${MIN_HEIGHT_CLASS}: the scrubber lost SCRUBBER_BAR_CLS`);
  const reserved = parseFloat(getComputedStyle(root).minHeight);
  root.style.minHeight = '0px';
  const natural = root.getBoundingClientRect().height;
  root.style.minHeight = '';
  await expect(reserved).toBeGreaterThan(0);
  await expect(natural).toBeLessThanOrEqual(reserved);
  await expect(reserved - natural).toBeLessThan(1);
}

const summaryHandler = http.get('*/api/v1/cams/summary', () => HttpResponse.json(summaryResponse));

const meta = {
  component: Scrubber,
  parameters: { msw: { handlers: [summaryHandler] } },
  beforeEach: () => {
    useSettingsStore.setState({ scrubberDays: SCRUBBER_DAYS });
    useUIStore.setState({ scrubberDay: SCRUBBER_DAYS - 1 });
    useTimeStore.setState({
      latestDate: LATEST_DATE,
      latestDateResolved: true,
      selectedDate: LATEST_DATE,
    });
  },
} satisfies Meta<typeof Scrubber>;

export default meta;
type Story = StoryObj<typeof meta>;

// The PM2.5 line comes from the mocked /api/v1/cams/summary response.
export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    // The chart's SVG stretches to the slider width; the play icon's SVG doesn't.
    const chartLine = 'svg[preserveAspectRatio="none"] path';
    await waitFor(() => expect(canvasElement.querySelector(chartLine)).not.toBeNull());
    await expectReservedHeight(canvasElement);
  },
};

// No play button or chart; the date sits above the slider.
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: ({ canvasElement }) => expectReservedHeight(canvasElement),
};

// Until the API reports its latest date, the controls are placeholders.
export const WaitingForLatestDate: Story = {
  beforeEach: () => {
    useTimeStore.setState({ latestDateResolved: false });
  },
  play: ({ canvasElement }) => expectReservedHeight(canvasElement),
};

// The summary endpoint answers a range with no data with a 200 and an empty list (routes/cams.ts):
// no line, same height.
export const NoTimelineData: Story = {
  parameters: {
    msw: { handlers: [http.get('*/api/v1/cams/summary', () => HttpResponse.json({ data: [] }))] },
  },
  play: ({ canvasElement }) => expectReservedHeight(canvasElement),
};

// Thai glyphs can give taller line boxes than Latin text, at either width.
export const Thai: Story = {
  globals: { locale: 'th' },
  play: ({ canvasElement }) => expectReservedHeight(canvasElement),
};

export const ThaiMobile: Story = {
  globals: { locale: 'th', viewport: { value: 'mobile1', isRotated: false } },
  play: ({ canvasElement }) => expectReservedHeight(canvasElement),
};

export const ArrowKeyMovesADay: Story = {
  play: async ({ canvas, userEvent }) => {
    const slider = canvas.getByRole('slider', { name: 'Select date' });
    await userEvent.click(slider);
    await userEvent.keyboard('{ArrowLeft}');
    await expect(useUIStore.getState().scrubberDay).toBe(SCRUBBER_DAYS - 2);
    await waitFor(() => expect(useTimeStore.getState().selectedDate).toBe('2026-10-23'));
  },
};

// Starts on the first day; playing advances it.
export const PlayAdvances: Story = {
  beforeEach: () => {
    useUIStore.setState({ scrubberDay: 0 });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(useUIStore.getState().scrubberDay).toBeGreaterThan(0));
    await userEvent.click(canvas.getByRole('button', { name: 'Pause' }));
    await expect(useUIStore.getState().playing).toBe(false);
  },
};
