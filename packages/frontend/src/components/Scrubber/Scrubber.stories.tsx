import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw/http';
import { expect, waitFor } from 'storybook/test';
import { useSettingsStore } from '@/store/settingsStore';
import { useTimeStore } from '@/store/timeStore';
import { dayToDate, useUIStore } from '@/store/uiStore';
import summaryResponse from './fixtures/2026-10-24/cams-summary.json';
import { Scrubber } from './Scrubber';
import { SCRUBBER_BAR_CLS } from './scrubberLayout';

// The fixture covers the 30 days to 2026-10-24, so the stories use a 30-day range ending there.
const LATEST_DATE = '2026-10-24';
const SCRUBBER_DAYS = 30;

// The scrubber's bar keeps SCRUBBER_BAR_CLS's height as a minimum, and its error fallback uses the
// same classes, so the sidebar and map keep their size in every state. It only moves the page if
// its content is taller than that; shorter just makes the bar a little taller than its content.
// This runs in a real browser at the story's viewport, so it fails when the scrubber's layout
// changes without the constant. The bar is found by the constant's min-height class, not by its
// position in the canvas.
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

function isShown(element: Element) {
  return element.checkVisibility();
}

function visibleShimmers(canvasElement: HTMLElement) {
  return [...canvasElement.querySelectorAll('.animate-pulse')].filter(isShown);
}

const summaryHandler = http.get('*/api/v1/cams/summary', () => HttpResponse.json(summaryResponse));

const meta = {
  component: Scrubber,
  parameters: { msw: { handlers: [summaryHandler] } },
  beforeEach: () => {
    useSettingsStore.setState({ scrubberDays: SCRUBBER_DAYS });
    useUIStore.setState({ scrubberDay: SCRUBBER_DAYS - 1, mapDataLoading: false });
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
  play: async ({ canvas, canvasElement }) => {
    // The chart's SVG stretches to the slider width; the play icon's SVG doesn't.
    const chartLine = 'svg[preserveAspectRatio="none"] path';
    await waitFor(() => expect(canvasElement.querySelector(chartLine)).not.toBeNull());
    await expect(canvas.getByRole('slider', { name: 'Select date' })).toBeEnabled();
    await expect(canvas.getByRole('button', { name: 'Play' })).toBeEnabled();
    await expectReservedHeight(canvasElement);
  },
};

// What the server renders: the date and the chart come from the data it fetched, before the browser
// has asked for the latest date (the store still says unresolved) and without any request.
export const FromServerData: Story = {
  args: { initialData: { latestDate: LATEST_DATE, timeline: summaryResponse.data } },
  beforeEach: () => {
    useTimeStore.setState({ latestDateResolved: false });
  },
  play: async ({ canvas, canvasElement }) => {
    await expect((await canvas.findAllByText('24 Oct 2026')).length).toBeGreaterThan(0);
    await expect(
      canvasElement.querySelector('svg[preserveAspectRatio="none"] path'),
    ).not.toBeNull();
    await expect(visibleShimmers(canvasElement)).toHaveLength(0);
    // Looks real, but nothing is wired to the map until the browser has the latest date.
    await expect(canvas.getByRole('slider', { name: 'Select date' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Play' })).toBeDisabled();
    await expectReservedHeight(canvasElement);
  },
};

// A link to a date: until the latest date is known the scrubber may still be on the latest day the
// server rendered, so urlDateGuard.ts flags <html> and placeholders show instead of that day.
export const LinkToADate: Story = {
  args: { initialData: { latestDate: LATEST_DATE, timeline: summaryResponse.data } },
  beforeEach: () => {
    useTimeStore.setState({ latestDateResolved: false });
    document.documentElement.setAttribute('data-url-date', '');
    return () => document.documentElement.removeAttribute('data-url-date');
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(visibleShimmers(canvasElement).length).toBeGreaterThan(0);
    await expect(canvas.queryByRole('slider', { name: 'Select date' })).toBeNull();
    await expect(canvas.queryAllByText('24 Oct 2026').filter(isShown)).toHaveLength(0);
    await expectReservedHeight(canvasElement);

    useUIStore.setState({ scrubberDay: 9 });
    useTimeStore.getState().setLatestDate(LATEST_DATE);

    await waitFor(() => expect(visibleShimmers(canvasElement)).toHaveLength(0));
    await expect(canvas.getAllByText('4 Oct 2026').filter(isShown).length).toBeGreaterThan(0);
    await expect(canvas.getByRole('slider', { name: 'Select date' })).toBeEnabled();
  },
};

// A page the server cached a while ago: once the browser has the real latest date it wins over the
// date the server rendered with.
export const LiveDateWinsOverServerData: Story = {
  args: { initialData: { latestDate: '2026-10-20', timeline: [] } },
  play: async ({ canvas }) => {
    await expect((await canvas.findAllByText('24 Oct 2026')).length).toBeGreaterThan(0);
    await expect(canvas.queryAllByText('20 Oct 2026')).toHaveLength(0);
  },
};

// No play button or chart; the date sits above the slider.
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: ({ canvasElement }) => expectReservedHeight(canvasElement),
};

// The map is still loading the selected date: a spinner fades in beside the date.
export const LoadingDate: Story = {
  beforeEach: () => {
    useUIStore.setState({ mapDataLoading: true });
  },
  play: async ({ canvas, canvasElement }) => {
    // Both date labels carry one; CSS hides the one for the other layout.
    await expect((await canvas.findAllByText('Loading data for this date')).length).toBe(2);
    await expectReservedHeight(canvasElement);
  },
};

export const LoadingDateMobile: Story = {
  ...LoadingDate,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
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

// Play waits while the map is still loading the day, so it never runs ahead of the map.
export const PlayWaitsForTheMap: Story = {
  beforeEach: () => {
    useUIStore.setState({ scrubberDay: 0, mapDataLoading: true });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Play' }));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await expect(useUIStore.getState().scrubberDay).toBe(0);
    useUIStore.setState({ mapDataLoading: false });
    await waitFor(() => expect(useUIStore.getState().scrubberDay).toBe(1), { timeout: 2000 });
    // A play step sets the date on the next render, without the drag debounce (300 ms).
    await waitFor(
      () =>
        expect(useTimeStore.getState().selectedDate).toBe(dayToDate(1, LATEST_DATE, SCRUBBER_DAYS)),
      { timeout: 200 },
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Pause' }));
  },
};

// Starts on the first day; playing advances it.
export const PlayAdvances: Story = {
  beforeEach: () => {
    useUIStore.setState({ scrubberDay: 0 });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(useUIStore.getState().scrubberDay).toBeGreaterThan(0), {
      timeout: 2000,
    });
    await userEvent.click(canvas.getByRole('button', { name: 'Pause' }));
    await expect(useUIStore.getState().playing).toBe(false);
  },
};
