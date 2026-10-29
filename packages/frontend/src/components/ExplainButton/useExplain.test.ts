import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExplain } from './useExplain';

// act() needs to know it runs in a test
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type ExplainResult = ReturnType<typeof useExplain>;

const OPTIONS = { stationId: '1205', lat: 13.78, lng: 100.63, date: '2026-10-18' };
const NOW_MS = 1_800_000_000_000;

describe('useExplain', () => {
  let root: Root;
  let results: ExplainResult[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    results = [];
    root = createRoot(document.createElement('div'));
    function Probe() {
      results.push(useExplain());
      return null;
    }
    act(() => root.render(createElement(Probe)));
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const latest = () => results[results.length - 1];

  async function explainWith(response: Response) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await act(async () => {
      await latest().explain(OPTIONS);
    });
  }

  // A streamed body that arrives in the given chunks.
  function streamOf(...chunks: string[]): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }

  // each chunk gets its own act(), so React renders after it, as it would in the browser
  const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

  const errorLine = (error: object) => `\n[ERROR_JSON:${JSON.stringify(error)}]`;

  it('reads the reason and reset time of an HTTP 429', async () => {
    const body = {
      error: 'Rate limit exceeded',
      code: 'rate_limited',
      reason: 'ip_ratelimit',
      resetAtMs: 5,
    };

    await explainWith(Response.json(body, { status: 429 }));

    expect(latest()).toMatchObject({
      rateLimit: { reason: 'ip_ratelimit', resetAtMs: 5 },
      error: null,
      loading: false,
      text: '',
    });
  });

  it('falls back to the daily quota, an hour away, when a 429 has no readable body', async () => {
    await explainWith(new Response('not json', { status: 429 }));

    expect(latest().rateLimit).toEqual({ reason: 'quota_exceeded', resetAtMs: NOW_MS + 3_600_000 });
  });

  it('shows the streamed explanation when the stream completes', async () => {
    await explainWith(streamOf('The PM2.5 ', 'is high.'));

    expect(latest()).toMatchObject({
      text: 'The PM2.5 is high.',
      error: null,
      rateLimit: null,
      loading: false,
    });
  });

  it('turns a rate-limit error at the end of the stream into a rate limit and clears the text', async () => {
    const limited = {
      error: 'Gemini rate limit reached',
      code: 'rate_limited',
      reason: 'gemini_rpd',
      resetAtMs: 42,
    };

    await explainWith(streamOf('Some words', errorLine(limited)));

    expect(latest()).toMatchObject({
      text: '',
      rateLimit: { reason: 'gemini_rpd', resetAtMs: 42 },
      error: null,
    });
  });

  it('keeps the part of the answer that arrived when any other error ends the stream', async () => {
    await explainWith(
      streamOf(
        'Partial words',
        errorLine({ error: 'Explanation unavailable', code: 'unavailable' }),
      ),
    );

    expect(latest()).toMatchObject({
      text: 'Partial words',
      error: 'interrupted',
      rateLimit: null,
    });
  });

  it('is unavailable when any other error ends a stream that gave no text', async () => {
    await explainWith(
      streamOf(errorLine({ error: 'Explanation unavailable', code: 'unavailable' })),
    );

    expect(latest()).toMatchObject({ text: '', error: 'unavailable', rateLimit: null });
  });

  it.each([
    ['inside its opening', 4],
    ['halfway through it', 25],
  ])('never shows the error line, even when a chunk ends %s', async (_where, cut) => {
    const encoder = new TextEncoder();
    const line = errorLine({ error: 'Explanation unavailable', code: 'unavailable' });
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        stream = controller;
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    let finished: Promise<void> | undefined;
    await act(async () => {
      finished = latest().explain(OPTIONS);
      await nextTick();
    });
    await act(async () => {
      stream.enqueue(encoder.encode('Some words'));
      await nextTick();
    });
    expect(latest().text).toBe('Some words');

    await act(async () => {
      stream.enqueue(encoder.encode(line.slice(0, cut)));
      await nextTick();
    });
    expect(latest().text).toBe('Some words');

    await act(async () => {
      stream.enqueue(encoder.encode(line.slice(cut)));
      stream.close();
      await finished;
    });
    expect(latest()).toMatchObject({ text: 'Some words', error: 'interrupted' });
  });
  it('resolves quietly when a reset aborts the stream that is being read', async () => {
    const encoder = new TextEncoder();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        stream = controller;
      },
    });
    // like a real fetch, aborting the request errors the body that is being read
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        init.signal?.addEventListener('abort', () =>
          stream.error(new DOMException('The operation was aborted.', 'AbortError')),
        );
        return Promise.resolve(new Response(body, { status: 200 }));
      }),
    );

    let finished: Promise<void> | undefined;
    await act(async () => {
      finished = latest().explain(OPTIONS);
      await nextTick();
    });
    await act(async () => {
      stream.enqueue(encoder.encode('Some words'));
      await nextTick();
    });
    await act(async () => {
      latest().reset();
      await nextTick();
    });

    await expect(finished).resolves.toBeUndefined();
    expect(latest()).toMatchObject({ text: '', loading: false, error: null, rateLimit: null });
  });

  it('keeps the part that arrived when the connection drops in the middle of the stream', async () => {
    const encoder = new TextEncoder();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        stream = controller;
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    let finished: Promise<void> | undefined;
    await act(async () => {
      finished = latest().explain(OPTIONS);
      await nextTick();
    });
    await act(async () => {
      stream.enqueue(encoder.encode('Some words'));
      await nextTick();
    });
    await act(async () => {
      stream.error(new TypeError('network error'));
      await finished;
    });

    expect(latest()).toMatchObject({ text: 'Some words', loading: false, error: 'interrupted' });
  });
});
