import { describe, it, expect } from 'vitest';
import type { CityStationDay } from '@thailand-aq/types';
import { FULL_CONTEXT, SPARSE_CONTEXT } from '../test/fixtures/scientific-context.js';
import type { ScientificContext } from './buildScientificContext.js';
import { driversFromContext, pickRepresentativeStation } from './cityDrivers.js';

function station(id: string, pm25: number | null): CityStationDay {
  return { id, name: id, lat: 18.8, lng: 99, pm25, readingCount: pm25 === null ? 0 : 1 };
}

describe('pickRepresentativeStation', () => {
  it('takes the reporting station closest to the city figure', () => {
    const stations = [station('a', 10), station('b', 21), station('c', 40)];

    expect(pickRepresentativeStation(stations, 20)?.id).toBe('b');
  });

  it('skips a station that did not report', () => {
    const stations = [station('a', null), station('b', 33)];

    expect(pickRepresentativeStation(stations, 20)?.id).toBe('b');
  });

  it('goes to the one listed first, the nearest to the centre, on a tie', () => {
    const stations = [station('near', 10), station('far', 30)];

    expect(pickRepresentativeStation(stations, 20)?.id).toBe('near');
  });

  it('is null when no station reported', () => {
    expect(pickRepresentativeStation([station('a', null)], null)).toBeNull();
    expect(pickRepresentativeStation([], null)).toBeNull();
  });
});

describe('driversFromContext', () => {
  it('reads the figures off the day’s context', () => {
    expect(driversFromContext(FULL_CONTEXT, 's1', 41)).toEqual({
      originInDataArea: true,
      upwindFireCount: 34,
      windSpeedKmh: 12.4,
      windFrom: 'NNE',
      camsPm25: 41,
      baselineCategory: 'above',
      representativeStationId: 's1',
    });
  });

  it('drops the fire count, and says so, when the path left the data area', () => {
    const transport = FULL_CONTEXT.transport!;
    const left: ScientificContext = {
      ...FULL_CONTEXT,
      transport: {
        ...transport,
        trajectory: { ...transport.trajectory, leftDataArea: true, leftDataAreaAfterHours: 24 },
      },
    };

    expect(driversFromContext(left, 's1', null)).toMatchObject({
      originInDataArea: false,
      upwindFireCount: null,
    });
  });

  it('does not know where the air came from when the context has no transport', () => {
    expect(driversFromContext(SPARSE_CONTEXT, 's1', null)).toMatchObject({
      originInDataArea: null,
      upwindFireCount: null,
      baselineCategory: null,
    });
  });

  it('uses the wind of the day itself, not another day’s', () => {
    const otherDay: ScientificContext = {
      ...FULL_CONTEXT,
      wind: { days: [{ date: '2026-03-13', directionLabel: 'S', speedKmh: 5 }] },
    };

    expect(driversFromContext(otherDay, 's1', null)).toMatchObject({
      windSpeedKmh: null,
      windFrom: null,
    });
    expect(driversFromContext({ ...FULL_CONTEXT, wind: { days: [] } }, 's1', null)).toMatchObject({
      windSpeedKmh: null,
      windFrom: null,
    });
  });
});
