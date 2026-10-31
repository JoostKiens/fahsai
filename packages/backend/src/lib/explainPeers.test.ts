import { describe, expect, it } from 'vitest';
import { analyzePeers } from './analyzePeers.js';
import { buildPrompt } from './buildPrompt.js';
import { buildRawExplainData } from './buildRawExplainData.js';
import type { BuildRawExplainDataInput } from './buildRawExplainData.js';
import { buildScientificContext } from './buildScientificContext.js';
import type { PeerRow } from './fetchExplainContext.js';

const LAT = 14;
const LNG = 100;
const LATEST_PM25 = 400;
const RANGE_IN_PROMPT = /range \d+–\d+ µg\/m³ for (\d+) of them; 1 reads far outside that range/;

// One degree of latitude is ~111 km, so 0.1° steps keep every peer inside the 75 km radius
function peerRow(id: string, value: number, latOffset: number): PeerRow {
  return {
    value,
    measured_at: '2026-04-18T05:00:00Z',
    station_id: id,
    stations: { id, name: `Peer ${id}`, lat: LAT + latOffset, lng: LNG },
  };
}

function promptFor(peerRows: PeerRow[]): string {
  const input: BuildRawExplainDataInput = {
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
    peers: analyzePeers(peerRows, LAT, LNG, LATEST_PM25),
    outlier: null,
    baseline: null,
    persistentWind: null,
  };
  return buildPrompt(buildScientificContext(buildRawExplainData(input)), 'en');
}

// Seven peers between 242.5 and 564.1, as at Chalermprakiet Hospital on 2026-04-18 (JOO-90)
const CLUSTERED_PEERS = [242.5, 300, 350, 400, 450, 500, 564.1].map((value, i) =>
  peerRow(`p${i}`, value, (i + 1) * 0.08),
);

describe('explain prompt peer summary', () => {
  it('gives the count of the peers the range is taken from when a much lower reading is dropped', () => {
    const prompt = promptFor([...CLUSTERED_PEERS, peerRow('low', 67, 0.64)]);

    expect(prompt).toContain('8 stations — ');
    expect(prompt.match(RANGE_IN_PROMPT)?.[1]).toBe('7');
    expect(prompt).toContain('give the count as 7 of 8 stations. The mean covers all 8.');
  });

  it('gives the range count when more than 10 peers are summarised as a distribution', () => {
    const elevenClustered = [...CLUSTERED_PEERS, ...CLUSTERED_PEERS.slice(0, 4)].map((row, i) => ({
      ...row,
      station_id: `c${i}`,
    }));
    const prompt = promptFor([...elevenClustered, peerRow('low', 67, 0.64)]);

    expect(prompt).toContain('Distribution by AQI category');
    expect(prompt).toContain('give the count as 11 of 12 stations. The mean covers all 12.');
  });

  it('counts a severe reading as severe even when it is left out of the range', () => {
    const peers = [60, 70, 80, 300].map((value, i) => peerRow(`s${i}`, value, (i + 1) * 0.1));

    // 300 is over 2x the median (75), so it is left out of the range
    expect(analyzePeers(peers, LAT, LNG, LATEST_PM25).severePeerCount).toBe(1);
  });

  it('gives no separate count when every peer is in the range', () => {
    const prompt = promptFor(CLUSTERED_PEERS);

    expect(prompt).toContain('7 stations — ');
    expect(prompt).not.toMatch(RANGE_IN_PROMPT);
    expect(prompt).not.toContain('give the count as');
  });
});
