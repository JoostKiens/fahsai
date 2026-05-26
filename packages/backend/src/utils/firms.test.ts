// packages/backend/src/utils/firms.test.ts
import { describe, it, expect } from 'vitest';
import { parseFirmsCsv } from './firms.js';

// Realistic VIIRS NOAA-21 NRT header (confirmed from live API response)
const HEADER =
  'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,' +
  'instrument,confidence,version,bright_ti5,frp,daynight';

function makeRow(overrides: {
  lat?: string;
  lng?: string;
  acq_date?: string;
  acq_time?: string;
  confidence?: string;
  daynight?: string;
  frp?: string;
}): string {
  const {
    lat = '18.5',
    lng = '98.9',
    acq_date = '2024-03-15',
    acq_time = '0630',
    confidence = 'n',
    daynight = 'D',
    frp = '12.5',
  } = overrides;
  // Columns: latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,
  //          instrument,confidence,version,bright_ti5,frp,daynight
  return `${lat},${lng},330.1,0.38,0.36,${acq_date},${acq_time},N21,VIIRS,${confidence},2.0NRT,290.2,${frp},${daynight}`;
}

describe('parseFirmsCsv', () => {
  it('returns an empty array for a header-only string', () => {
    expect(parseFirmsCsv(HEADER)).toEqual([]);
  });

  it('parses a single valid row', () => {
    const csv = [HEADER, makeRow({})].join('\n');
    const rows = parseFirmsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      lat: 18.5,
      lng: 98.9,
      frp: 12.5,
      confidence: 'n',
      daynight: 'D',
      detectedAt: '2024-03-15T06:30:00Z',
    });
  });

  it('zero-pads a single-digit acq_time (e.g. "630" → "0630")', () => {
    const csv = [HEADER, makeRow({ acq_time: '630' })].join('\n');
    const rows = parseFirmsCsv(csv);
    expect(rows[0].detectedAt).toBe('2024-03-15T06:30:00Z');
  });

  it('sets frp to null when value is "nan"', () => {
    const csv = [HEADER, makeRow({ frp: 'nan' })].join('\n');
    const rows = parseFirmsCsv(csv);
    expect(rows[0].frp).toBeNull();
  });

  it('sets frp to null when value is empty', () => {
    const csv = [HEADER, makeRow({ frp: '' })].join('\n');
    const rows = parseFirmsCsv(csv);
    expect(rows[0].frp).toBeNull();
  });

  it('skips blank lines between rows', () => {
    const csv = [HEADER, makeRow({}), '', makeRow({ lat: '19.0' })].join('\n');
    const rows = parseFirmsCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1].lat).toBe(19.0);
  });

  it('parses multiple rows', () => {
    const csv = [
      HEADER,
      makeRow({ lat: '18.5', daynight: 'D' }),
      makeRow({ lat: '19.0', daynight: 'N' }),
    ].join('\n');
    const rows = parseFirmsCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].daynight).toBe('D');
    expect(rows[1].daynight).toBe('N');
  });
});
