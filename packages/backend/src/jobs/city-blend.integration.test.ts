import { beforeEach, describe, expect, it } from 'vitest';
import { clearTables, seed } from '../test/integration/db.js';
import { supabaseCityBlendSource } from './city-blend.js';
import { supabaseCityForecastSource } from './city-forecast.js';

const VALID_AT = new Date('2026-11-24T12:00:00Z');

describe('supabaseCityBlendSource against a real database', () => {
  beforeEach(async () => {
    await clearTables();
    await seed(
      'stations',
      ['on-hour', 'off-hour', 'twice', 'early', 'late'].map((id) => ({ id, name: id })),
    );
  });

  it('takes each station’s newest reading in the hour ending at validAt', async () => {
    await seed('station_readings_hourly', [
      { station_id: 'on-hour', measured_at: '2026-11-24T12:00:00Z', pm25: 10, sensor_id: 1 },
      // a stamp that is not on the hour still counts for its hour
      { station_id: 'off-hour', measured_at: '2026-11-24T11:38:00Z', pm25: 20, sensor_id: 2 },
      { station_id: 'twice', measured_at: '2026-11-24T11:10:00Z', pm25: 30, sensor_id: 3 },
      { station_id: 'twice', measured_at: '2026-11-24T11:50:00Z', pm25: 35, sensor_id: 3 },
      // the window is (11:00, 12:00]
      { station_id: 'early', measured_at: '2026-11-24T11:00:00Z', pm25: 40, sensor_id: 4 },
      { station_id: 'late', measured_at: '2026-11-24T12:01:00Z', pm25: 50, sensor_id: 5 },
    ]);

    const values = await supabaseCityBlendSource.stationValues(
      ['on-hour', 'off-hour', 'twice', 'early', 'late'],
      VALID_AT,
    );

    expect(Object.fromEntries(values)).toEqual({ 'on-hour': 10, 'off-hour': 20, twice: 35 });
  });

  it('gives the CAMS value with the run that wrote it', async () => {
    await seed('city_cams_hourly', [
      {
        city_slug: 'chiang-mai',
        valid_at: VALID_AT.toISOString(),
        pm25: 25,
        run_at: '2026-11-24T00:00:00Z',
        lead_hour: 12,
      },
    ]);

    const cams = await supabaseCityBlendSource.camsAt('chiang-mai', VALID_AT);

    expect(cams?.pm25).toBe(25);
    expect(new Date(cams?.runAt ?? '').toISOString()).toBe('2026-11-24T00:00:00.000Z');
    expect(await supabaseCityBlendSource.camsAt('lampang', VALID_AT)).toBeNull();
  });

  it('gives the CAMS hours after the issue hour, in order', async () => {
    const hour = (validAt: string, pm25: number) => ({
      city_slug: 'chiang-mai',
      valid_at: validAt,
      pm25,
      run_at: '2026-11-24T00:00:00Z',
      lead_hour: 0,
    });
    await seed('city_cams_hourly', [
      hour('2026-11-24T14:00:00Z', 1),
      hour('2026-11-24T12:00:00Z', 2), // the issue hour itself is not a forecast
      hour('2026-11-24T13:00:00Z', 3),
    ]);

    const hours = await supabaseCityForecastSource.camsHoursAfter('chiang-mai', VALID_AT);

    expect(hours.map((h) => [new Date(h.validAt).toISOString(), h.pm25])).toEqual([
      ['2026-11-24T13:00:00.000Z', 3],
      ['2026-11-24T14:00:00.000Z', 1],
    ]);
  });
});
