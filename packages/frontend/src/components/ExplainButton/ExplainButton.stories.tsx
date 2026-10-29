import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw/http';
import { expect, fn } from 'storybook/test';
import { useTimeStore } from '@/store/timeStore';
import { ExplainButton } from './ExplainButton';

// /api/explain is rate-limited and every call costs a Gemini request, so these responses are
// written by hand in the format useExplain parses: a "__PROMPT__" debug line, then plain text
// streamed in chunks (bold as **…**), with "[ERROR_JSON:{…}]" for a mid-stream failure.
const EXPLANATION_CHUNKS = [
  '__PROMPT__"(prompt omitted)"\n',
  '**PM2.5 is moderate** at this station today, close to the usual level for late October.\n\n',
  'Winds were light, so local emissions such as traffic were slow to disperse. ',
  'Few fires were detected within 75 km over the past week.',
];

const RESET_IN_MS = 5 * 60_000;

// The line a failed stream ends with (routes/explain.ts): the shared ApiError, as one line of JSON.
const STREAM_ERROR_LINE = '\n[ERROR_JSON:{"error":"Explanation unavailable","code":"unavailable"}]';

// The 429 body of POST /api/explain: the shared ApiError with the limit that was hit.
const rateLimitBody = (reason: 'ip_ratelimit' | 'quota_exceeded') => ({
  error: 'Rate limit exceeded',
  code: 'rate_limited',
  reason,
  resetAtMs: Date.now() + RESET_IN_MS,
});

function streamOf(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

const answerHandler = http.post(
  '*/api/explain',
  () => new HttpResponse(streamOf(EXPLANATION_CHUNKS)),
);

const meta = {
  component: ExplainButton,
  args: {
    stationId: '2827389',
    lat: 18.69,
    lng: 99.05,
    // In the app this is the UI store's shared rate limit; the button also keeps its own.
    rateLimitControl: { value: null, onSet: fn(), onClear: fn() },
    className:
      'block w-full text-center text-[13px] font-semibold text-teal-300 bg-teal-950 border border-teal-800 hover:bg-teal-900 rounded py-1.5 mt-1.5 transition-colors ease-out hover:duration-175',
  },
  parameters: { msw: { handlers: [answerHandler] } },
  beforeEach: () => {
    useTimeStore.setState({ selectedDate: '2026-10-24' });
  },
  // The info panel's content width.
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExplainButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

// The answer streams in; the button turns into Refresh and an AI disclaimer appears.
export const StreamedAnswer: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: "What's causing this?" }));
    await expect(await canvas.findByText('PM2.5 is moderate')).toHaveProperty('tagName', 'STRONG');
    await expect(canvas.queryByText(/__PROMPT__/)).toBeNull();
    await expect(canvas.getByText('AI-generated — may contain errors')).toBeVisible();
    await expect(await canvas.findByRole('button', { name: 'Refresh' })).toBeEnabled();
  },
};

// The request never answers, so the button stays in its first loading state.
export const Fetching: Story = {
  parameters: {
    msw: { handlers: [http.post('*/api/explain', () => new Promise<never>(() => {}))] },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: "What's causing this?" }));
    await expect(await canvas.findByRole('button', { name: 'Fetching data…' })).toBeDisabled();
  },
};

// Per-IP limit: a countdown, and the button stays disabled until it runs out.
export const RateLimited: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('*/api/explain', () =>
          HttpResponse.json(rateLimitBody('ip_ratelimit'), { status: 429 }),
        ),
      ],
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: "What's causing this?" });
    await userEvent.click(button);
    await expect(
      await canvas.findByText('Too many requests. Try again in 5 minutes.'),
    ).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(args.rateLimitControl.onSet).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'ip_ratelimit' }),
    );
  },
};

export const DailyLimitReached: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('*/api/explain', () =>
          HttpResponse.json(rateLimitBody('quota_exceeded'), { status: 429 }),
        ),
      ],
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: "What's causing this?" }));
    await expect(await canvas.findByText(/^Daily limit reached\./)).toBeVisible();
  },
};

export const Unavailable: Story = {
  parameters: {
    msw: { handlers: [http.post('*/api/explain', () => new HttpResponse(null, { status: 500 }))] },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: "What's causing this?" }));
    await expect(
      await canvas.findByText('Explanation unavailable. Try again later.'),
    ).toBeVisible();
  },
};

// The model failed part-way. The backend ends the stream with an "[ERROR_JSON:…]" line
// (routes/explain.ts): the partial text stays, without the line, with a note that it was cut off.
export const FailsMidStream: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post(
          '*/api/explain',
          () =>
            new HttpResponse(
              streamOf([EXPLANATION_CHUNKS[0], EXPLANATION_CHUNKS[1], STREAM_ERROR_LINE]),
            ),
        ),
      ],
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: "What's causing this?" }));
    await expect(
      await canvas.findByText('The explanation was cut off. Try again later.'),
    ).toBeVisible();
    await expect(canvas.getByText('PM2.5 is moderate')).toBeVisible();
    await expect(canvas.queryByText(/\[ERROR/)).toBeNull();
    await expect(canvas.queryByText('Explanation unavailable. Try again later.')).toBeNull();
  },
};

// The model failed before any text arrived: nothing to keep, so it's simply unavailable.
export const FailsBeforeAnyText: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post(
          '*/api/explain',
          () => new HttpResponse(streamOf([EXPLANATION_CHUNKS[0], STREAM_ERROR_LINE])),
        ),
      ],
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: "What's causing this?" }));
    await expect(
      await canvas.findByText('Explanation unavailable. Try again later.'),
    ).toBeVisible();
    await expect(canvas.queryByText(/\[ERROR/)).toBeNull();
  },
};

export const Thai: Story = { globals: { locale: 'th' } };
