import { describe, it, expect } from 'vitest';
import type { CityDrivers, CityPage } from '@thailand-aq/types';
import { citySummary } from './citySummary.js';

type Input = Pick<CityPage, 'name' | 'date' | 'pm25' | 'stationCount' | 'whoMultiple' | 'drivers'>;

const DRIVERS: CityDrivers = {
  originInDataArea: true,
  upwindFireCount: 34,
  windSpeedKmh: 12.4,
  windFrom: 'NNE',
  camsPm25: 41,
  baselineCategory: 'above',
  representativeStationId: 'st1',
};

const page = (overrides: Partial<Input> = {}): Input => ({
  name: 'Chiang Mai',
  date: '2026-11-03',
  pm25: 27,
  stationCount: 3,
  whoMultiple: 1.8,
  drivers: DRIVERS,
  ...overrides,
});

const keys = (input: Input) => citySummary(input).map((sentence) => sentence.key);
const withDrivers = (overrides: Partial<CityDrivers>) =>
  page({ drivers: { ...DRIVERS, ...overrides } });

describe('citySummary', () => {
  it('is empty when no station reported, so the page has nothing to say', () => {
    expect(citySummary(page({ pm25: null, whoMultiple: null, stationCount: 0 }))).toEqual([]);
  });

  it('opens with the dated level, how many stations it rests on, and the WHO multiple', () => {
    expect(citySummary(page())[0]).toEqual({
      key: 'city.summary.level',
      params: { city: 'Chiang Mai', date: '2026-11-03', pm25: 27, count: 3, multiple: 1.8 },
    });
  });

  it('says only the level when there are no drivers', () => {
    expect(keys(page({ drivers: null }))).toEqual(['city.summary.level']);
  });

  it('reports the fires detected along the air’s path, as a count', () => {
    expect(citySummary(page())).toContainEqual({
      key: 'city.summary.fires',
      params: { count: 34 },
    });
  });

  it('says so when no fires were detected along the path', () => {
    expect(keys(withDrivers({ upwindFireCount: 0 }))).toContain('city.summary.noFires');
  });

  it('says the path left the data area, and gives no fire figure even if one is passed in', () => {
    const result = keys(withDrivers({ originInDataArea: false, upwindFireCount: 12 }));

    expect(result).toContain('city.summary.outsideArea');
    expect(result).not.toContain('city.summary.fires');
    expect(result).not.toContain('city.summary.noFires');
  });

  it('says nothing about the fires when it is not known where the air came from', () => {
    const result = keys(withDrivers({ originInDataArea: null, upwindFireCount: 12 }));

    expect(result).not.toContain('city.summary.fires');
    expect(result).not.toContain('city.summary.noFires');
    expect(result).not.toContain('city.summary.outsideArea');
  });

  it('reports the wind with the compass point and the speed in whole km/h', () => {
    expect(citySummary(page())).toContainEqual({
      key: 'city.summary.wind',
      params: { from: 'NNE', speed: 12 },
    });
  });

  it('leaves the wind out when it is not known', () => {
    expect(keys(withDrivers({ windFrom: null, windSpeedKmh: null }))).not.toContain(
      'city.summary.wind',
    );
  });

  it.each(['wellAbove', 'above', 'below', 'wellBelow'])(
    'compares with the season when the baseline is %s',
    (baselineCategory) => {
      expect(keys(withDrivers({ baselineCategory }))).toContain(
        `city.summary.baseline.${baselineCategory}`,
      );
    },
  );

  it('says nothing about the season when the baseline is normal or unknown', () => {
    expect(keys(withDrivers({ baselineCategory: null })).join()).not.toContain('baseline');
  });
});

describe('citySummary stays neutral', () => {
  const ALLOWED_PARAMS = new Set(['city', 'date', 'pm25', 'count', 'multiple', 'from', 'speed']);

  const cases: Input[] = [
    page(),
    page({ drivers: null }),
    withDrivers({ originInDataArea: false, upwindFireCount: null }),
    withDrivers({ originInDataArea: false, upwindFireCount: 12 }),
    withDrivers({ originInDataArea: null, upwindFireCount: 12 }),
    withDrivers({ upwindFireCount: 0 }),
    withDrivers({ baselineCategory: 'wellAbove' }),
  ];

  it.each(cases.map((c, i) => [i, c] as const))(
    'case %d names no place or culprit: only numbers, the city, the date and a compass point',
    (_i, input) => {
      for (const sentence of citySummary(input)) {
        for (const [name, value] of Object.entries(sentence.params)) {
          expect(ALLOWED_PARAMS.has(name), `${sentence.key} has the param ${name}`).toBe(true);
          if (typeof value === 'string') {
            expect([input.name, input.date, 'NNE']).toContain(value);
          }
        }
      }
    },
  );

  it('never gives a fire count unless the path stayed inside the data area', () => {
    for (const input of cases) {
      const hasFireCount = citySummary(input).some((s) => s.key === 'city.summary.fires');
      if (input.drivers?.originInDataArea !== true) expect(hasFireCount).toBe(false);
    }
  });
});
