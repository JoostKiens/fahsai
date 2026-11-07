import { describe, expect, it } from 'vitest';
import { AQ_LAT_COUNT, AQ_LNG_COUNT } from '@thailand-aq/consts';
import { CAMS_LEAD_HOURS } from './camsAds.js';
import { gridFromMessages } from './camsAdsGrid.js';
import type { Grib1Message } from './grib1.js';

const geometry = { ni: 64, nj: 75, lat1: 30.4, lng1: 88.8, dLat: 0.4, dLng: 0.4 };

function message(leadHour: number, kgPerM3: number): Grib1Message {
  return {
    ...geometry,
    leadHour,
    values: new Float64Array(geometry.ni * geometry.nj).fill(kgPerM3),
  };
}

const fullDay = (kgPerM3: (leadHour: number) => number) =>
  CAMS_LEAD_HOURS.map((hour) => message(hour, kgPerM3(hour)));

describe('gridFromMessages', () => {
  it('returns the full grid in µg/m³', () => {
    const points = gridFromMessages(fullDay(() => 2.5e-8));

    expect(points).toHaveLength(AQ_LNG_COUNT * AQ_LAT_COUNT);
    expect(points[0].pm25).toBe(25);
  });

  it('takes the mean over the 24 hours, whatever the file order', () => {
    // Hours 5 to 28 with values 1..24 µg/m³, fed in reverse: the mean is 12.5.
    const reversed = fullDay((hour) => (hour - 4) * 1e-9).reverse();

    expect(gridFromMessages(reversed)[0].pm25).toBe(12.5);
  });

  it('throws when an hour is missing, so a partial day is never stored', () => {
    const missingOne = fullDay(() => 1e-8).slice(1);

    expect(() => gridFromMessages(missingOne)).toThrow(/hours 5 to 28/);
  });

  it('throws when the hours are not the ones asked for', () => {
    const wrongHours = fullDay(() => 1e-8).map((m) => ({ ...m, leadHour: m.leadHour + 1 }));

    expect(() => gridFromMessages(wrongHours)).toThrow(/hours 5 to 28/);
  });
});
