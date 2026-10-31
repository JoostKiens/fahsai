import { dayToDate } from '@/store/uiStore';

/**
 * The days the scrubber's timeline covers: `days` ending on `latestDate`. Shared by the query in
 * `usePm25Timeline` and the server's `fetchScrubberData`, so the server's data is the data the
 * browser's query would load.
 */
export function camsSummaryRange(latestDate: string, days: number) {
  return { start: dayToDate(0, latestDate, days), end: latestDate };
}

export function camsSummaryPath({ start, end }: { start: string; end: string }): string {
  return `/cams/summary?start=${start}&end=${end}`;
}
