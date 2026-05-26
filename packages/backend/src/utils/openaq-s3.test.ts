import { describe, it, expect } from 'vitest';
import { buildS3Url, computeDailyMean } from './openaq-s3.js';

describe('buildS3Url', () => {
  it('constructs correct URL for a given location and date', () => {
    const url = buildS3Url('12345', '2026-03-28');
    expect(url).toBe(
      'https://openaq-data-archive.s3.amazonaws.com/records/csv.gz/' +
        'locationid=12345/year=2026/month=03/location-12345-20260328.csv.gz',
    );
  });

  it('zero-pads single-digit months', () => {
    const url = buildS3Url('99', '2026-02-05');
    expect(url).toContain('month=02');
    expect(url).toContain('location-99-20260205.csv.gz');
  });
});

describe('computeDailyMean', () => {
  const makeCsv = (rows: { sensors_id: number; parameter: string; value: number | string }[]) => {
    const header =
      'location_id,sensors_id,location,datetime,lat,lon,parameter,units,value,summary,coverage';
    const lines = rows.map(
      (r) =>
        `1,${r.sensors_id},loc,2026-03-28 05:00:00+00,13.7,100.5,${r.parameter},µg/m³,${r.value},"{}","{}"`,
    );
    return [header, ...lines].join('\n');
  };

  it('returns null when no pm25 rows exist', () => {
    const csv = makeCsv([{ sensors_id: 1, parameter: 'pm10', value: 50 }]);
    expect(computeDailyMean(csv, 1)).toBeNull();
  });

  it('computes mean for the primary sensor', () => {
    const csv = makeCsv([
      { sensors_id: 42, parameter: 'pm25', value: 10 },
      { sensors_id: 42, parameter: 'pm25', value: 20 },
      { sensors_id: 42, parameter: 'pm25', value: 30 },
    ]);
    const result = computeDailyMean(csv, 42);
    expect(result).toEqual({ value: 20, sensorId: 42 });
  });

  it('falls back to any pm25 sensor when primary has no rows', () => {
    const csv = makeCsv([
      { sensors_id: 99, parameter: 'pm25', value: 15 },
      { sensors_id: 99, parameter: 'pm25', value: 25 },
    ]);
    const result = computeDailyMean(csv, 42); // primary=42 not in file
    expect(result).toEqual({ value: 20, sensorId: 99 });
  });

  it('ignores rows with negative or non-finite values', () => {
    const csv = makeCsv([
      { sensors_id: 1, parameter: 'pm25', value: 10 },
      { sensors_id: 1, parameter: 'pm25', value: -5 },
      { sensors_id: 1, parameter: 'pm25', value: 'NaN' },
    ]);
    const result = computeDailyMean(csv, 1);
    expect(result).toEqual({ value: 10, sensorId: 1 });
  });

  it('returns null when all pm25 values are invalid', () => {
    const csv = makeCsv([
      { sensors_id: 1, parameter: 'pm25', value: -1 },
      { sensors_id: 1, parameter: 'pm25', value: 'NaN' },
    ]);
    expect(computeDailyMean(csv, 1)).toBeNull();
  });
});
