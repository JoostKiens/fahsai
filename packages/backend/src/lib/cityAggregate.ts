import type { CityStationDay, CityTrendDay } from '@thailand-aq/types';
import { WHO_PM25_24H_UGM3 } from '@thailand-aq/consts';
import { bangkokDateString } from '../utils/bkkDate.js';
import { median } from '../utils/median.js';
import { offsetDate } from '../utils/trajectory.js';

export interface Reading {
  stationId: string;
  measuredAt: string;
  value: number;
}

export type StationDayMeans = Map<string, Map<string, { mean: number; count: number }>>;

/** Each station's mean reading on each Bangkok day: station id, then date. */
export function stationDayMeans(readings: Reading[]): StationDayMeans {
  const sums = new Map<string, Map<string, { sum: number; count: number }>>();
  for (const { stationId, measuredAt, value } of readings) {
    const date = bangkokDateString(new Date(measuredAt));
    const days = sums.get(stationId) ?? new Map<string, { sum: number; count: number }>();
    const day = days.get(date) ?? { sum: 0, count: 0 };
    days.set(date, { sum: day.sum + value, count: day.count + 1 });
    sums.set(stationId, days);
  }
  const means: StationDayMeans = new Map();
  for (const [stationId, days] of sums) {
    means.set(
      stationId,
      new Map([...days].map(([date, { sum, count }]) => [date, { mean: sum / count, count }])),
    );
  }
  return means;
}

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** The city's figure for one day: the median of the stations that reported, as a whole number. */
function dayFigure(
  stationIds: string[],
  means: StationDayMeans,
  date: string,
): { pm25: number | null; stationCount: number } {
  const reported = stationIds.flatMap((id) => means.get(id)?.get(date)?.mean ?? []);
  const cityMedian = median(reported);
  return {
    pm25: cityMedian === null ? null : Math.round(cityMedian),
    stationCount: reported.length,
  };
}

export function cityDay(
  stations: { id: string; name: string; lat: number; lng: number }[],
  means: StationDayMeans,
  date: string,
): { pm25: number | null; stationCount: number; stations: CityStationDay[] } {
  const rows: CityStationDay[] = stations.map((station) => {
    const day = means.get(station.id)?.get(date);
    return {
      id: station.id,
      name: station.name,
      lat: station.lat,
      lng: station.lng,
      pm25: day ? oneDecimal(day.mean) : null,
      readingCount: day?.count ?? 0,
    };
  });
  return {
    ...dayFigure(
      stations.map((station) => station.id),
      means,
      date,
    ),
    stations: rows,
  };
}

/** One entry per date, in the order of `dates`, null where no station reported. */
export function cityTrend(
  stationIds: string[],
  means: StationDayMeans,
  dates: string[],
): CityTrendDay[] {
  return dates.map((date) => ({ date, ...dayFigure(stationIds, means, date) }));
}

/** How many times the WHO 24-hour guideline a PM2.5 value is, to one decimal. */
export function whoMultiple(pm25: number | null): number | null {
  return pm25 === null ? null : oneDecimal(pm25 / WHO_PM25_24H_UGM3);
}

/** `count` calendar days ending on `date` (YYYY-MM-DD), oldest first. */
export function lastDays(date: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => offsetDate(date, -(count - 1 - i)));
}
