import type { PM25DailySummary } from '@thailand-aq/types';
import { apiUrl } from '@/lib/api';
import { useSettingsStore } from '@/store/settingsStore';
import { dayToDate } from '@/store/uiStore';

export interface ScrubberData {
  latestDate: string;
  /** null when only the timeline request failed: the date still shows, the browser fetches the chart */
  timeline: PM25DailySummary[] | null;
}

const REQUEST_TIMEOUT_MS = 4000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface Options {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * What the scrubber shows when the server renders it: the API's latest date and the PM2.5 timeline
 * for the default range ending on it (the same range, so the same query, the browser would ask for).
 * Called while Astro renders a page, so it never throws: when the API cannot be reached the page
 * renders the scrubber's placeholders, as it did before it was server-rendered, and the browser
 * loads the data itself.
 */
export async function fetchScrubberData({
  fetchFn = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
}: Options = {}): Promise<ScrubberData | null> {
  const latest = await getJson('/latest-date', fetchFn, timeoutMs);
  if (!isLatestDate(latest)) return null;

  const days = useSettingsStore.getInitialState().scrubberDays;
  const start = dayToDate(0, latest.date, days);
  const summary = await getJson(
    `/cams/summary?start=${start}&end=${latest.date}`,
    fetchFn,
    timeoutMs,
  );

  return { latestDate: latest.date, timeline: isTimeline(summary) ? summary.data : null };
}

async function getJson(path: string, fetchFn: typeof fetch, timeoutMs: number): Promise<unknown> {
  try {
    const res = await fetchFn(apiUrl(path), { signal: AbortSignal.timeout(timeoutMs) });
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
