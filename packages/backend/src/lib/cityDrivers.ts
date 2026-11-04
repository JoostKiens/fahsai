import type { CityDrivers, CityStationDay } from '@thailand-aq/types';
import type { ScientificContext } from './buildScientificContext.js';

/**
 * The station whose reading says most about the city: the one closest to the city figure, so an
 * outlier does not stand for it. The stations come nearest first, so a tie goes to the nearest.
 * Null when none reported.
 */
export function pickRepresentativeStation(
  stations: CityStationDay[],
  cityPm25: number | null,
): CityStationDay | null {
  let best: CityStationDay | null = null;
  let bestGap = Infinity;
  for (const station of stations) {
    if (station.pm25 === null || cityPm25 === null) continue;
    const gap = Math.abs(station.pm25 - cityPm25);
    if (gap < bestGap) {
      best = station;
      bestGap = gap;
    }
  }
  return best;
}

/** What the day's context says about the city, from its representative station. */
export function driversFromContext(
  context: ScientificContext,
  representativeStationId: string,
  camsPm25: number | null,
): CityDrivers {
  const { transport, wind, stationBaseline } = context;
  const leftArea = transport?.trajectory.leftDataArea ?? null;
  // days come newest first; only the day itself counts, not an older one
  const day = wind.days[0]?.date === context.date ? wind.days[0] : undefined;
  return {
    originInDataArea: leftArea === null ? null : !leftArea,
    // a count of 0 would claim there were no fires when the fire data was never read
    upwindFireCount:
      transport && !transport.trajectory.leftDataArea && transport.fire.dataAvailable
        ? transport.fire.pathFireCount
        : null,
    windSpeedKmh: day?.speedKmh ?? null,
    windFrom: day?.directionLabel ?? null,
    camsPm25,
    baselineCategory: stationBaseline?.category ?? null,
    representativeStationId,
  };
}
