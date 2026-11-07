import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AQ_LAT_COUNT, AQ_LNG_COUNT } from '@thailand-aq/consts';

// The network and the file format are the boundaries: mock them, keep the assembly real.
vi.mock('./camsAds.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./camsAds.js')>()),
  fetchCamsGrib: vi.fn(),
}));
vi.mock('./grib1.js', () => ({ decodeGrib1: vi.fn() }));

import { CAMS_LEAD_HOURS, CAMS_RUNS, fetchCamsGrib } from './camsAds.js';
import { fetchAdsGrid, gridFromMessages } from './camsAdsGrid.js';
import { decodeGrib1, type Grib1Message } from './grib1.js';

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

describe('fetchAdsGrid', () => {
  beforeEach(() => {
    vi.mocked(fetchCamsGrib).mockReset();
    vi.mocked(decodeGrib1).mockReset();
    // The "file" is just the run's time; the decoder returns what that run holds.
    vi.mocked(fetchCamsGrib).mockImplementation(({ run }) =>
      Promise.resolve(Buffer.from(run.time)),
    );
    vi.mocked(decodeGrib1).mockImplementation((buf) => {
      const run = CAMS_RUNS.find((r) => r.time === buf.toString());
      return (run?.leadHours ?? []).map((hour) => message(hour, 1e-8));
    });
  });

  it('requests each run once, with the date and the key', async () => {
    await fetchAdsGrid('2026-11-06', 'secret-key');

    expect(fetchCamsGrib).toHaveBeenCalledTimes(CAMS_RUNS.length);
    CAMS_RUNS.forEach((run) =>
      expect(fetchCamsGrib).toHaveBeenCalledWith({ date: '2026-11-06', run, apiKey: 'secret-key' }),
    );
  });

  it('numbers the hours of the second run after the first, so the day has hours 5 to 28', async () => {
    // Without the lead shift the runs would repeat hours 5 to 11 and gridFromMessages would throw.
    const points = await fetchAdsGrid('2026-11-06', 'secret-key');

    expect(points).toHaveLength(AQ_LNG_COUNT * AQ_LAT_COUNT);
    expect(points[0].pm25).toBe(10);
  });

  it('fails when one run fails, so a partial day is never stored', async () => {
    vi.mocked(fetchCamsGrib).mockImplementation(({ run }) =>
      run.time === '00:00'
        ? Promise.reject(new Error('ADS job failed'))
        : Promise.resolve(Buffer.from(run.time)),
    );

    await expect(fetchAdsGrid('2026-11-06', 'secret-key')).rejects.toThrow('ADS job failed');
  });
});
