import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ supabase: {} }));

import { cityNowFromRows } from './fetchCityNow.js';

const HOUR_MS = 3_600_000;
const NOW = new Date('2026-11-24T12:50:00Z');
const TOP_OF_HOUR = Date.parse('2026-11-24T12:00:00Z');

const row = (hoursAgo: number, pm25: number) => ({
  valid_at: new Date(TOP_OF_HOUR - hoursAgo * HOUR_MS).toISOString().replace('.000Z', '+00:00'),
  pm25,
  station_median: pm25,
  station_count: 3,
  station_weight: 0.6,
  cams_pm25: 20,
});
// hours 23 to 0 ago, oldest first, as the query orders them
const day = (pm25: (hoursAgo: number) => number, newestHoursAgo = 0) =>
  Array.from({ length: 24 }, (_, i) => row(23 - i + newestHoursAgo, pm25(23 - i)));

describe('cityNowFromRows', () => {
  it('ends with the newest hour and means all of them', () => {
    const now = cityNowFromRows(
      day((hoursAgo) => (hoursAgo < 12 ? 40 : 20)),
      NOW,
    );

    expect(now).toEqual({
      pm25: 30,
      band: 2,
      isBandRaised: false,
      hours: 24,
      latest: {
        validAt: '2026-11-24T12:00:00.000Z',
        pm25: 40,
        stationCount: 3,
        stationWeight: 0.6,
        camsPm25: 20,
      },
    });
  });

  it('is null when the newest hour is more than 2 h old, so it cannot pass for today', () => {
    expect(
      cityNowFromRows(
        day(() => 30, 3),
        NOW,
      ),
    ).toBeNull();
  });

  it('is null with too few hours for a 24-hour value', () => {
    expect(cityNowFromRows(day(() => 30).slice(-6), NOW)).toBeNull();
  });

  it('is null without any hourly rows', () => {
    expect(cityNowFromRows([], NOW)).toBeNull();
  });
});
