import type { ErrorReporters } from './error-handler.js';

const MAX_TRACKED_KEYS = 100;

export const REPORT_THROTTLE_WINDOW_MS = 10 * 60 * 1000;

type ThrottleOptions = {
  windowMs: number;
  nowMs?: () => number;
};

// Says whether a report with this key may go out now: once per key per window. A condition that
// lasts (a missing dataset, a Gemini outage) would otherwise send one report per request and use up
// the Rollbar free tier. In-process, so every server instance has its own window.
export function createReportThrottle({
  windowMs,
  nowMs = Date.now,
}: ThrottleOptions): (key: string) => boolean {
  const lastReportedAt = new Map<string, number>();

  return (key) => {
    const now = nowMs();
    const last = lastReportedAt.get(key);
    if (last !== undefined && now - last < windowMs) return false;

    if (lastReportedAt.size >= MAX_TRACKED_KEYS) {
      forgetExpired(lastReportedAt, now, windowMs);
      if (lastReportedAt.size >= MAX_TRACKED_KEYS) {
        // a Map iterates in insertion order and a reported key is re-inserted below, so the first is the one reported longest ago
        const [oldest] = lastReportedAt.keys();
        if (oldest !== undefined) lastReportedAt.delete(oldest);
      }
    }
    lastReportedAt.delete(key); // set() alone would keep an expired key at its old place in the order
    lastReportedAt.set(key, now);
    return true;
  };
}

// Errors always go through; warnings are limited to once per message per window.
export function throttleWarnings(
  reporters: ErrorReporters,
  mayReport: (key: string) => boolean,
): ErrorReporters {
  return {
    reportError: reporters.reportError,
    reportWarning: (message, extra) => {
      if (mayReport(message)) reporters.reportWarning(message, extra);
    },
  };
}

function forgetExpired(lastReportedAt: Map<string, number>, now: number, windowMs: number): void {
  for (const [key, reportedAt] of lastReportedAt) {
    if (now - reportedAt >= windowMs) lastReportedAt.delete(key);
  }
}
