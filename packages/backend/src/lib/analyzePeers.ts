import { haversineKm } from '../utils/geo.js';
import { pm25Cat } from './buildScientificContext.js';
import type { PeerRow } from './fetchExplainContext.js';

type PeerEntry = { name: string; pm25: number; distKm: number };

export interface PeerAnalysis {
  peerList: PeerEntry[];
  peerMedian: number;
  peerWeightedMean: number;
  outlierRatio: number | null;
  isStrongOutlier: boolean;
  isHighOutlier: boolean;
  nonOutlierPeers: PeerEntry[];
  filteredPeerMin: number | null;
  filteredPeerMax: number | null;
  peerDistribution: string | null;
}

function medianOf(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
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

  let totalW = 0;
  let sum = 0;
  for (const p of peerList) {
    const w = 1 / Math.max(p.distKm, 1);
    totalW += w;
    sum += p.pm25 * w;
  }
  const peerWeightedMean = totalW > 0 ? sum / totalW : 0;

  const bothLow = latestPm25 < 35 && peerWeightedMean < 35;
  const outlierRatio = peerWeightedMean > 0 ? latestPm25 / peerWeightedMean : null;
  const isStrongOutlier =
    !bothLow &&
    outlierRatio !== null &&
    (outlierRatio >= 2.0 || outlierRatio <= 0.4) &&
    Math.abs(latestPm25 - peerWeightedMean) >= 20;
  const isHighOutlier = isStrongOutlier && outlierRatio !== null && outlierRatio >= 2.0;

  const nonOutlierPeers =
    peerMedian > 0 &&
    peerList.filter((p) => p.pm25 <= peerMedian * 2 && p.pm25 >= peerMedian * 0.4).length >= 3
      ? peerList.filter((p) => p.pm25 <= peerMedian * 2 && p.pm25 >= peerMedian * 0.4)
      : peerList;

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
    filteredPeerMin,
    filteredPeerMax,
    peerDistribution,
  };
}
