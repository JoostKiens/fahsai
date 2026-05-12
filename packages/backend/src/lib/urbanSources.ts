import { URBAN_SOURCES, type UrbanSource } from '../data/urbanSources.js';
import { haversineKm, bearingDeg, compassFromDeg8 } from './geo.js';

export interface RelevantUrbanSource extends UrbanSource {
  distanceKm: number;
  bearingDeg: number; // bearing FROM station TO source (0–360)
  bearingCardinal: string; // 8-point: N, NE, E, SE, S, SW, W, NW
  influenceScore: number; // population / distanceKm²
  isUpwind: boolean;
}

export function getRelevantUrbanSources(
  stationLat: number,
  stationLng: number,
  windDirectionDeg: number | null, // meteorological: direction wind is coming FROM
  options?: {
    maxDistanceKm?: number; // default 300
    toleranceDeg?: number; // default 60
    minInfluenceScore?: number; // default 50
  },
): RelevantUrbanSource[] {
  const maxDistanceKm = options?.maxDistanceKm ?? 300;
  const toleranceDeg = options?.toleranceDeg ?? 60;
  const minInfluenceScore = options?.minInfluenceScore ?? 50;

  return URBAN_SOURCES.map((source) => {
    const distanceKm = haversineKm(stationLat, stationLng, source.lat, source.lng);
    const bearing = bearingDeg(stationLat, stationLng, source.lat, source.lng);
    const influenceScore = source.population / distanceKm ** 2;

    // A source is upwind if the wind is blowing FROM its direction toward the station.
    // windDirectionDeg is meteorological: the direction the wind is coming FROM.
    // bearing is the direction from the station to the source.
    // If they align within toleranceDeg, smoke from the source reaches this station.
    let isUpwind = false;
    if (windDirectionDeg !== null) {
      const diff = Math.abs(((bearing - windDirectionDeg + 540) % 360) - 180);
      isUpwind = diff <= toleranceDeg;
    }

    return {
      ...source,
      distanceKm,
      bearingDeg: bearing,
      bearingCardinal: compassFromDeg8(bearing),
      influenceScore,
      isUpwind,
    };
  })
    .filter((s) => s.distanceKm <= maxDistanceKm && s.influenceScore >= minInfluenceScore)
    .sort((a, b) => b.influenceScore - a.influenceScore);
}
