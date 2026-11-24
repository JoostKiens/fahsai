import { haversineKm } from '../utils/geo.js';
import { median } from '../utils/median.js';
import { inverseDistanceMean, withoutOutliers } from './analyzePeers.js';

// Explain's co-location threshold: stations this close measure the same air.
const CO_LOCATED_KM = 0.5;
// Station weight n / (n + PRIOR_STATIONS): CAMS counts as two stations' worth (decided 24 Nov).
const PRIOR_STATIONS = 2;

export type StationValue = {
  lat: number;
  lng: number;
  /** from the city centre */
  distanceKm: number;
  pm25: number;
};

export type CityBlend = {
  pm25: number;
  /** null when no station reported */
  stationPm25: number | null;
  /** stations after merging co-located ones and dropping outliers */
  stationCount: number;
  /** share of the station value in pm25, 0 to 1 */
  stationWeight: number;
};

/**
 * One city's PM2.5 for one time step, from its stations' values and CAMS. The station value is
 * the distance-weighted mean of the stations left after merging co-located ones and dropping
 * outliers. The station share grows with the number of stations; with no stations it is CAMS
 * only, without CAMS it is stations only. Null when neither has a value.
 */
export function blendCityValue(
  stations: readonly StationValue[],
  camsPm25: number | null,
): CityBlend | null {
  const kept = withoutOutliers(mergeCoLocated(stations));
  const stationPm25 = inverseDistanceMean(
    kept.map((s) => ({ pm25: s.pm25, distKm: s.distanceKm })),
  );
  const stationCount = stationPm25 === null ? 0 : kept.length;

  if (stationPm25 === null) {
    return camsPm25 === null
      ? null
      : { pm25: camsPm25, stationPm25, stationCount, stationWeight: 0 };
  }
  if (camsPm25 === null) return { pm25: stationPm25, stationPm25, stationCount, stationWeight: 1 };

  const stationWeight = stationCount / (stationCount + PRIOR_STATIONS);
  return {
    pm25: stationWeight * stationPm25 + (1 - stationWeight) * camsPm25,
    stationPm25,
    stationCount,
    stationWeight,
  };
}

/**
 * Counts co-located stations once: each group is the stations within CO_LOCATED_KM of its nearest
 * member (nearest to the centre first), valued at their median.
 */
export function mergeCoLocated(stations: readonly StationValue[]): StationValue[] {
  const groups: StationValue[][] = [];
  for (const station of [...stations].sort((a, b) => a.distanceKm - b.distanceKm)) {
    const group = groups.find(
      ([first]) => haversineKm(first.lat, first.lng, station.lat, station.lng) < CO_LOCATED_KM,
    );
    if (group) group.push(station);
    else groups.push([station]);
  }
  return groups.map((group) => ({
    ...group[0],
    pm25: median(group.map((s) => s.pm25)) ?? group[0].pm25,
  }));
}
