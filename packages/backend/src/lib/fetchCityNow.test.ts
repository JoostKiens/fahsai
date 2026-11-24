import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ supabase: {} }));

import { cityNowFromRows } from './fetchCityNow.js';

const row = (validAt: string, pm25: number) => ({
  valid_at: validAt,
  pm25,
  station_median: pm25,
  station_count: 3,
  station_weight: 0.6,
  cams_pm25: 20,
});

describe('cityNowFromRows', () => {
  it('ends with the newest hour and means all of them', () => {
    const now = cityNowFromRows([
      row('2026-11-24T11:00:00+00:00', 20),
      row('2026-11-24T12:00:00+00:00', 40),
    ]);

    expect(now).toEqual({
      pm25: 30,
      band: 2,
      isBandRaised: false,
      hours: 2,
      latest: {
        validAt: '2026-11-24T12:00:00.000Z',
        pm25: 40,
        stationCount: 3,
        stationWeight: 0.6,
        camsPm25: 20,
      },
    });
  });

  it('is null without any hourly rows', () => {
    expect(cityNowFromRows([])).toBeNull();
  });
});
