import type { PM25GridPoint } from '@thailand-aq/types';
import { CAMS_LEAD_HOURS, fetchCamsGrib } from './camsAds.js';
import { dailyMean, resampleToAqGrid, toMicrograms } from './camsResample.js';
import { decodeGrib1, type Grib1Message } from './grib1.js';

/** The day's PM2.5 grid from the Copernicus ADS, on our 63 × 73 grid, in µg/m³. */
export async function fetchAdsGrid(date: string, apiKey: string): Promise<PM25GridPoint[]> {
  const grib = await fetchCamsGrib({ date, apiKey });
  return gridFromMessages(decodeGrib1(grib));
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
