import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw/http';
import { expect, waitFor } from 'storybook/test';
import { useSettingsStore } from '@/store/settingsStore';
import { useTimeStore } from '@/store/timeStore';
import { useUIStore } from '@/store/uiStore';
import summaryResponse from './fixtures/2026-10-24/cams-summary.json';
import { Scrubber } from './Scrubber';

// The fixture covers the 30 days to 2026-10-24, so the stories use a 30-day range ending there.
const LATEST_DATE = '2026-10-24';
const SCRUBBER_DAYS = 30;
// The play interval is 800 ms and the date is committed 300 ms after the last change.
const STEP_TIMEOUT_MS = 2000;

const summaryHandler = http.get('*/api/cams/summary', () => HttpResponse.json(summaryResponse));

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

// The PM2.5 line comes from the mocked /api/cams/summary response.
export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    // The chart's SVG stretches to the slider width; the play icon's SVG doesn't.
    const chartLine = 'svg[preserveAspectRatio="none"] path';
    await waitFor(() => expect(canvasElement.querySelector(chartLine)).not.toBeNull());
  },
};

// No play button or chart; the date sits above the slider.
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

// Until the API reports its latest date, the controls are placeholders.
export const WaitingForLatestDate: Story = {
  beforeEach: () => {
    useTimeStore.setState({ latestDateResolved: false });
  },
};

// The summary endpoint returns 404 when there is no data for the range: no line, same height.
export const NoTimelineData: Story = {
  parameters: {
    msw: {
      handlers: [http.get('*/api/cams/summary', () => new HttpResponse(null, { status: 404 }))],
    },
  },
};

export const Thai: Story = { globals: { locale: 'th' } };

export const ArrowKeyMovesADay: Story = {
  play: async ({ canvas, userEvent }) => {
    const slider = canvas.getByRole('slider', { name: 'Select date' });
    await userEvent.click(slider);
    await userEvent.keyboard('{ArrowLeft}');
    await expect(useUIStore.getState().scrubberDay).toBe(SCRUBBER_DAYS - 2);
    await waitFor(() => expect(useTimeStore.getState().selectedDate).toBe('2026-10-23'), {
      timeout: STEP_TIMEOUT_MS,
    });
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
      timeout: STEP_TIMEOUT_MS,
    });
    await userEvent.click(canvas.getByRole('button', { name: 'Pause' }));
    await expect(useUIStore.getState().playing).toBe(false);
  },
};
