import { haversineKm } from '../utils/geo.js';
import { pm25Cat } from './buildScientificContext.js';
import type { PeerRow } from './fetchExplainContext.js';
import { median } from '../utils/median.js';

type PeerEntry = { name: string; pm25: number; distKm: number };

export interface PeerAnalysis {
  peerList: PeerEntry[];
  peerMedian: number;
  peerWeightedMean: number;
  outlierRatio: number | null;
  isStrongOutlier: boolean;
  isHighOutlier: boolean;
  nonOutlierPeers: PeerEntry[];
  severePeerCount: number;
  filteredPeerMin: number | null;
  filteredPeerMax: number | null;
  peerDistribution: string | null;
}

// 0 for no peers: the callers compare against it
function medianOf(arr: number[]): number {
  return median(arr) ?? 0;
}

export function analyzePeers(
  peerRows: PeerRow[],
  lat: number,
  lng: number,
  latestPm25: number,
): PeerAnalysis {
  type PeerJoin = { id: string; name: string; lat: number; lng: number } | null;
  const peerMap = new Map<string, PeerEntry>();

  for (const row of peerRows) {
    const sid = row.station_id;
    if (peerMap.has(sid)) continue;
    const s = row.stations as PeerJoin;
    if (!s) continue;
    const distKm = haversineKm(lat, lng, s.lat, s.lng);
    if (distKm > 75) continue;
    if (distKm < 0.5) continue;
    peerMap.set(sid, { name: s.name, pm25: row.value, distKm });
  }

  const peerList = [...peerMap.values()];
  const peerValues = peerList.map((p) => p.pm25);
  const peerMedian = medianOf(peerValues);

  const peerWeightedMean = inverseDistanceMean(peerList) ?? 0;

  const bothLow = latestPm25 < 35 && peerWeightedMean < 35;
  const outlierRatio = peerWeightedMean > 0 ? latestPm25 / peerWeightedMean : null;
  const isStrongOutlier =
    !bothLow &&
    outlierRatio !== null &&
    (outlierRatio >= 2.0 || outlierRatio <= 0.4) &&
    Math.abs(latestPm25 - peerWeightedMean) >= 20;
  const isHighOutlier = isStrongOutlier && outlierRatio !== null && outlierRatio >= 2.0;

  const nonOutlierPeers = withoutOutliers(peerList);

  // over every peer, outliers included: dropped high readings are often the severe ones
  const severePeerCount = peerList.filter((p) =>
    ['Very unhealthy', 'Hazardous'].includes(pm25Cat(p.pm25)),
  ).length;

  const filteredPeerValues = nonOutlierPeers.map((p) => p.pm25);
  const filteredPeerMin = filteredPeerValues.length ? Math.min(...filteredPeerValues) : null;
  const filteredPeerMax = filteredPeerValues.length ? Math.max(...filteredPeerValues) : null;

  const peerDistribution =
    peerList.length > 10
      ? [
          'Good',
          'Moderate',
          'Unhealthy for sensitive groups',
          'Unhealthy',
          'Very unhealthy',
          'Hazardous',
        ]
          .map((label) => {
            const cnt = peerList.filter((p) => pm25Cat(p.pm25) === label).length;
            return cnt > 0 ? `${cnt} ${label}` : null;
          })
          .filter((s): s is string => s !== null)
          .join(', ')
      : null;

  return {
    peerList,
    peerMedian,
    peerWeightedMean,
    outlierRatio,
    isStrongOutlier,
    isHighOutlier,
    nonOutlierPeers,
    severePeerCount,
    filteredPeerMin,
    filteredPeerMax,
    peerDistribution,
  };
}

// Keeps readings within 0.4x–2x of the median. Returns the input unchanged when fewer than 3
// would survive, so a small or split group is never filtered down to one side.
export function withoutOutliers<T extends { pm25: number }>(readings: T[]): T[] {
  const center = medianOf(readings.map((r) => r.pm25));
  const kept = readings.filter((r) => r.pm25 <= center * 2 && r.pm25 >= center * 0.4);
  return center > 0 && kept.length >= 3 ? kept : readings;
}

// Weight 1/d, with d floored at 1 km so a station next to the point does not dominate.
export function inverseDistanceMean(readings: { pm25: number; distKm: number }[]): number | null {
  let totalWeight = 0;
  let sum = 0;
  for (const r of readings) {
    const weight = 1 / Math.max(r.distKm, 1);
    totalWeight += weight;
    sum += r.pm25 * weight;
  }
  return totalWeight > 0 ? sum / totalWeight : null;
}
