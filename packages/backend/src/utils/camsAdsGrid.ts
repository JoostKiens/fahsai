import type { PM25GridPoint } from '@thailand-aq/types';
import { CAMS_LEAD_HOURS, CAMS_RUNS, fetchCamsGrib } from './camsAds.js';
import { dailyMean, resampleToAqGrid, toMicrograms } from './camsResample.js';
import { decodeGrib1, type Grib1Message } from './grib1.js';

/** The day's PM2.5 grid from the Copernicus ADS, on our 63 × 73 grid, in µg/m³. */
export async function fetchAdsGrid(date: string, apiKey: string): Promise<PM25GridPoint[]> {
  const perRun = await Promise.all(
    CAMS_RUNS.map(async (run) => {
      const grib = await fetchCamsGrib({ date, run, apiKey });
      return decodeGrib1(grib).map((m) => ({ ...m, leadHour: m.leadHour + run.leadShift }));
    }),
  );
  return gridFromMessages(perRun.flat());
}

export function gridFromMessages(messages: Grib1Message[]): PM25GridPoint[] {
  // A day with a missing hour would give a mean that looks fine and is wrong.
  const hours = new Set(messages.map((m) => m.leadHour));
  const isFullDay =
    messages.length === CAMS_LEAD_HOURS.length && CAMS_LEAD_HOURS.every((h) => hours.has(h));
  if (!isFullDay) {
    throw new Error(
      `[cams-ads] expected one message for each of hours 5 to 28, got ${[...hours].sort((a, b) => a - b).join(', ')}`,
    );
  }
  return resampleToAqGrid(toMicrograms(dailyMean(messages)));
}
