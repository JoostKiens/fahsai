import { describe, it, expect } from 'vitest';
import Fuse from 'fuse.js';
import type { LatestMeasurement } from '../../hooks/useStationReadings';
import { FUSE_KEYS, FUSE_THRESHOLD, buildGeocodeUrl } from './searchConfig';

const STATIONS: LatestMeasurement[] = [
  {
    stationId: '2174592',
    stationName: 'Chiang Mai City Hall',
    lat: 18.79,
    lng: 98.98,
    country: 'TH',
    value: 42,
    measuredAt: '2024-03-01T12:00:00Z',
  },
  {
    stationId: '225599',
    stationName: 'Bangrak Lovely Plaza',
    lat: 13.73,
    lng: 100.52,
    country: 'TH',
    value: 27,
    measuredAt: '2024-03-01T12:00:00Z',
  },
  {
    stationId: '5894629',
    stationName: 'Yangon',
    lat: 16.87,
    lng: 96.19,
    country: 'MM',
    value: 55,
    measuredAt: '2024-03-01T12:00:00Z',
  },
];

function search(query: string) {
  const fuse = new Fuse<LatestMeasurement>(STATIONS, {
    keys: FUSE_KEYS,
    threshold: FUSE_THRESHOLD,
  });
  return fuse.search(query).map((r) => r.item);
}

describe('station fuzzy search', () => {
  it('finds by partial name', () => {
    const results = search('chiang');
    expect(results).toHaveLength(1);
    expect(results[0].stationName).toBe('Chiang Mai City Hall');
  });

  it('finds by station ID', () => {
    const results = search('2174592');
    expect(results).toHaveLength(1);
    expect(results[0].stationId).toBe('2174592');
  });

  it('finds by partial station ID', () => {
    const results = search('225599');
    expect(results).toHaveLength(1);
    expect(results[0].stationName).toBe('Bangrak Lovely Plaza');
  });

  it('tolerates minor typos', () => {
    const results = search('chiag mai');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].stationName).toContain('Chiang');
  });

  it('returns empty for unrelated queries', () => {
    const results = search('xyznotastation');
    expect(results).toHaveLength(0);
  });

  it('results include both name and ID fields', () => {
    const results = search('Yangon');
    expect(results[0]).toHaveProperty('stationName', 'Yangon');
    expect(results[0]).toHaveProperty('stationId', '5894629');
  });

  it('returns all for empty query (component guards with min length)', () => {
    const results = search('');
    expect(results).toHaveLength(STATIONS.length);
  });
});

describe('buildGeocodeUrl', () => {
  it('encodes query and includes bbox, language, types', () => {
    const url = buildGeocodeUrl('Chiang Mai', 'en');
    expect(url).toContain('Chiang%20Mai');
    expect(url).toContain('bbox=89,1,114,30');
    expect(url).toContain('language=en');
    expect(url).toContain('types=locality,place,district,region');
  });

  it('passes Thai language param', () => {
    const url = buildGeocodeUrl('กรุงเทพ', 'th');
    expect(url).toContain('language=th');
    expect(url).toContain(encodeURIComponent('กรุงเทพ'));
  });

  it('encodes special characters', () => {
    const url = buildGeocodeUrl('test&foo=bar', 'en');
    expect(url).toContain('test%26foo%3Dbar');
  });
});
