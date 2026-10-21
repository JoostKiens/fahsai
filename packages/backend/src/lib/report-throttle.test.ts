import { describe, expect, it, vi } from 'vitest';
import type { ErrorReporters } from './error-handler.js';
import { createReportThrottle, throttleWarnings } from './report-throttle.js';

const WINDOW_MS = 1000;

function buildThrottle() {
  const clock = { now: 0 };
  const mayReport = createReportThrottle({ windowMs: WINDOW_MS, nowMs: () => clock.now });
  return { clock, mayReport };
}

describe('createReportThrottle', () => {
  it('lets the first report for a key through', () => {
    expect(buildThrottle().mayReport('a')).toBe(true);
  });

  it('holds back the same key inside the window', () => {
    const { clock, mayReport } = buildThrottle();
    mayReport('a');

    clock.now = WINDOW_MS - 1;

    expect(mayReport('a')).toBe(false);
  });

  it('when full, forgets only the key reported longest ago', () => {
    const { clock, mayReport } = buildThrottle();
    for (let i = 0; i < 100; i++) {
      clock.now = i;
      mayReport(`key-${i}`);
    }

    clock.now = 200;
    mayReport('one-more');

    expect(mayReport('key-0')).toBe(true);
    expect(mayReport('key-99')).toBe(false);
  });

  it('lets the key through again once the window has passed', () => {
    const { clock, mayReport } = buildThrottle();
    mayReport('a');

    clock.now = WINDOW_MS;

    expect(mayReport('a')).toBe(true);
  });

  it('keeps separate windows for separate keys', () => {
    const { mayReport } = buildThrottle();
    mayReport('a');

    expect(mayReport('b')).toBe(true);
  });

  it('does not extend the window when a report is held back', () => {
    const { clock, mayReport } = buildThrottle();
    mayReport('a');
    clock.now = WINDOW_MS - 1;
    mayReport('a');

    clock.now = WINDOW_MS;

    expect(mayReport('a')).toBe(true);
  });

  it('keeps working after more distinct keys than it tracks', () => {
    const { clock, mayReport } = buildThrottle();
    for (let i = 0; i < 250; i++) mayReport(`key-${i}`);

    clock.now = WINDOW_MS;

    expect(mayReport('key-0')).toBe(true);
    expect(mayReport('key-0')).toBe(false);
  });
});

describe('throttleWarnings', () => {
  function build() {
    const reportError = vi.fn();
    const reportWarning = vi.fn<ErrorReporters['reportWarning']>();
    const { clock, mayReport } = buildThrottle();
    const reporters = throttleWarnings({ reportError, reportWarning }, mayReport);
    return { clock, reporters, reportError, reportWarning };
  }

  it('sends the same warning once per window', () => {
    const { clock, reporters, reportWarning } = build();

    reporters.reportWarning('Power plant data unavailable', { path: '/a' });
    reporters.reportWarning('Power plant data unavailable', { path: '/b' });
    clock.now = WINDOW_MS;
    reporters.reportWarning('Power plant data unavailable', { path: '/c' });

    expect(reportWarning.mock.calls.map(([, extra]) => extra)).toEqual([
      { path: '/a' },
      { path: '/c' },
    ]);
  });

  it('sends different warnings independently', () => {
    const { reporters, reportWarning } = build();

    reporters.reportWarning('one');
    reporters.reportWarning('two');

    expect(reportWarning).toHaveBeenCalledTimes(2);
  });

  it('never holds back an error', () => {
    const { reporters, reportError } = build();
    const failure = new Error('boom');

    reporters.reportError(failure);
    reporters.reportError(failure);

    expect(reportError).toHaveBeenCalledTimes(2);
  });
});
