import type { PM25DailySummary } from '@thailand-aq/types';
import { apiUrl } from '@/lib/api';
import { useSettingsStore } from '@/store/settingsStore';
import { camsSummaryPath, camsSummaryRange } from '@/utils/camsSummary';

export interface ScrubberData {
  latestDate: string;
  /** null when only the timeline request failed: the date still shows, the browser fetches the chart */
  timeline: PM25DailySummary[] | null;
}

const REQUEST_TIMEOUT_MS = 4000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface Options {
  fetchFn?: typeof fetch;
  /** Limit for both requests together */
  timeoutMs?: number;
}

/**
 * What the scrubber shows when the server renders it: the API's latest date and the PM2.5 timeline
 * for the default range ending on it (`camsSummaryRange`, the range the browser's query asks for;
 * a saved shorter range is a subset of it). One deadline covers both requests, so a slow API holds
 * the page up for `timeoutMs`, not twice that.
 * Called while Astro renders a page, so it never throws: when the API cannot be reached the page
 * renders the scrubber's placeholders, as it did before it was server-rendered, and the browser
 * loads the data itself.
 */
export async function fetchScrubberData({
  fetchFn = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
}: Options = {}): Promise<ScrubberData | null> {
  const signal = AbortSignal.timeout(timeoutMs);
  const latest = await getJson('/latest-date', fetchFn, signal);
  if (!isLatestDate(latest)) return null;

  const days = useSettingsStore.getInitialState().scrubberDays;
  const summary = await getJson(
    camsSummaryPath(camsSummaryRange(latest.date, days)),
    fetchFn,
    signal,
  );

  return { latestDate: latest.date, timeline: isTimeline(summary) ? summary.data : null };
}

async function getJson(path: string, fetchFn: typeof fetch, signal: AbortSignal): Promise<unknown> {
  try {
    const res = await fetchFn(apiUrl(path), { signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as unknown;
  } catch (error) {
    console.warn(`[scrubberData] ${path} failed, rendering without it:`, error);
    return null;
  }
}

function isLatestDate(body: unknown): body is { date: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'date' in body &&
    typeof body.date === 'string' &&
    DAY_PATTERN.test(body.date)
  );
}

function isTimeline(body: unknown): body is { data: PM25DailySummary[] } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'data' in body &&
    Array.isArray(body.data) &&
    body.data.every(isDailySummary)
  );
}

function isDailySummary(entry: unknown): entry is PM25DailySummary {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'date' in entry &&
    typeof entry.date === 'string' &&
    'pm25' in entry &&
    typeof entry.pm25 === 'number'
  );
}
