import { analyzePeers } from '../../lib/analyzePeers.js';
import type { BuildRawExplainDataInput } from '../../lib/buildRawExplainData.js';
import type { PeerRow } from '../../lib/fetchExplainContext.js';

const LAT = 14;
const LNG = 100;
const LATEST_PM25 = 400;

// One degree of latitude is ~111 km, so steps of 0.05° keep up to 13 peers inside the 75 km radius
export function peerRows(values: number[]): PeerRow[] {
  return values.map((value, i) => ({
    value,
    measured_at: '2026-04-18T05:00:00Z',
    station_id: `p${i}`,
    stations: { id: `p${i}`, name: `Peer ${i}`, lat: LAT + (i + 1) * 0.05, lng: LNG },
  }));
}

export function analyzeTestPeers(rows: PeerRow[]) {
  return analyzePeers(rows, LAT, LNG, LATEST_PM25);
}

// A station with no fires, weather or trajectory, so the peers are the only signal
export function explainInputFor(rows: PeerRow[]): BuildRawExplainDataInput {
  return {
    station: { name: 'Test Station', lat: LAT, lng: LNG },
    selectedDate: '2026-04-18',
    stationReadings: [{ value: LATEST_PM25, measured_at: '2026-04-18T05:00:00Z' }],
    d0: '2026-04-18',
    d1: '2026-04-17',
    d2: '2026-04-16',
    d3: '2026-04-15',
    d4: '2026-04-14',
    stationWeatherByDate: new Map(),
    totalPrecipitationMm: 0,
    trajectoryPrecipitationMm: null,
    trajectory: null,
    firePressure: {
      pathScore: 0,
      pathFireCount: 0,
      last24h: { count: 0, totalFrpMw: 0 },
      last48h: { count: 0, totalFrpMw: 0 },
      last72h: { count: 0, totalFrpMw: 0 },
      topFires: [],
      areaScore: 0,
      areaFireCount: null,
      areaTotalFrpMw: null,
    },
    upwindSources: [],
    peers: analyzeTestPeers(rows),
    outlier: null,
    baseline: null,
    persistentWind: null,
  };
}
