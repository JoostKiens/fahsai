import { describe, expect, it } from 'vitest';
import {
  blendCityValue,
  cityRollingValue,
  mergeCoLocated,
  MIN_ROLLING_HOURS,
  type StationValue,
} from './cityBlend.js';

const CENTRE = { lat: 18.79, lng: 98.98 };
// about 1.1 km north of the centre per 0.01 degree
const station = (pm25: number, northDeg: number): StationValue => ({
  lat: CENTRE.lat + northDeg,
  lng: CENTRE.lng,
  distanceKm: Math.abs(northDeg) * 111.2,
  pm25,
});

describe('blendCityValue', () => {
  it('uses CAMS only when no station reports', () => {
    expect(blendCityValue([], 30)).toEqual({
      pm25: 30,
      stationPm25: null,
      stationMedian: null,
      stationCount: 0,
      stationWeight: 0,
    });
  });

  it('uses the stations only when CAMS has no value', () => {
    expect(blendCityValue([station(50, 0.01)], null)).toMatchObject({
      pm25: 50,
      stationWeight: 1,
    });
  });

  it('returns null when neither has a value', () => {
    expect(blendCityValue([], null)).toBeNull();
  });

  it('gives one station a third of the weight', () => {
    const blend = blendCityValue([station(60, 0.01)], 30);
    expect(blend?.stationWeight).toBeCloseTo(1 / 3);
    expect(blend?.pm25).toBeCloseTo(40);
  });

  it('gives the stations more weight as more report', () => {
    const three = [station(60, 0.01), station(60, 0.05), station(60, 0.1)];
    const blend = blendCityValue(three, 30);
    expect(blend?.stationWeight).toBeCloseTo(0.6);
    expect(blend?.pm25).toBeCloseTo(48);
  });

  it('drops an outlying station before blending', () => {
    const stations = [station(40, 0.01), station(44, 0.05), station(42, 0.1), station(400, 0.15)];
    const blend = blendCityValue(stations, null);
    expect(blend?.stationCount).toBe(3);
    expect(blend?.pm25).toBeLessThan(45);
  });
});

describe('mergeCoLocated', () => {
  it('counts stations within 0.5 km of each other once, at their median', () => {
    const merged = mergeCoLocated([station(40, 0.01), station(50, 0.012), station(30, 0.1)]);
    expect(merged.map((s) => s.pm25)).toEqual([45, 30]);
  });

  it('keeps stations further apart separate', () => {
    expect(mergeCoLocated([station(40, 0.01), station(50, 0.02)])).toHaveLength(2);
  });
});

describe('cityRollingValue', () => {
  const hour = (pm25: number, stationMedian: number | null = null) => ({ pm25, stationMedian });
  // a full day of the same hour, so each test is about one rule
  const day = (pm25: number, stationMedian: number | null = null) =>
    Array.from({ length: 24 }, () => hour(pm25, stationMedian));

  it('bands the mean of the hourly blends', () => {
    // mean 30: Moderate (25.1–37.5)
    expect(cityRollingValue([...day(20).slice(12), ...day(40).slice(12)])).toEqual({
      pm25: 30,
      band: 2,
      hours: 24,
      isBandRaised: false,
    });
  });

  it("raises the band to the stations' median band", () => {
    // blend mean 30 is Moderate; station median mean 60 is Unhealthy
    expect(cityRollingValue(day(30, 60))).toMatchObject({ pm25: 30, band: 3, isBandRaised: true });
  });

  it("never lowers the band below the blend's own", () => {
    expect(cityRollingValue(day(60, 10))).toMatchObject({ band: 3, isBandRaised: false });
  });

  it('ignores hours without stations for the safety rule', () => {
    const hours = [...day(30, null).slice(0, 12), ...day(30, 80).slice(0, 12)];
    expect(cityRollingValue(hours)?.band).toBe(4);
  });

  it(`needs ${MIN_ROLLING_HOURS} hours to be a 24-hour value`, () => {
    expect(cityRollingValue(day(30).slice(0, MIN_ROLLING_HOURS))).not.toBeNull();
    expect(cityRollingValue(day(30).slice(0, MIN_ROLLING_HOURS - 1))).toBeNull();
  });

  it('returns null without any hours', () => {
    expect(cityRollingValue([])).toBeNull();
  });
});
