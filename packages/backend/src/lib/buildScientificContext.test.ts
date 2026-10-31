import { describe, expect, it } from 'vitest';
import { fixture } from '../scripts/eval/fixtures/10-plausible-fire-transport-ratchapracha-31-03-2026.js';
import type { RawExplainData } from '../scripts/eval/types.js';
import { buildScientificContext } from './buildScientificContext.js';

// Fixture 10 is fire transport with a significant rising trend; areaScore 50 makes its fires local
function withPeers(stationCount: number, values: number[]): RawExplainData {
  const { input } = fixture;
  return {
    ...input,
    firePressure: input.firePressure && { ...input.firePressure, areaScore: 50 },
    peers: input.peers && {
      ...input.peers,
      stationCount,
      rangeStationCount: values.length,
      distribution: null,
      stations: values.map((value, i) => ({ name: `Peer ${i}`, value, distanceKm: 10 + i })),
    },
  };
}

describe('buildScientificContext regional crisis', () => {
  it('drops the trend when most kept peers are very unhealthy, counting only kept peers', () => {
    // 7 peers, 4 dropped as far off: 3 of the 3 kept peers are severe, not 3 of 7
    const ctx = buildScientificContext(withPeers(7, [200, 210, 220]));

    expect(ctx.trend?.isSignificant).toBe(false);
  });

  it('keeps the trend when fewer than half of the kept peers are very unhealthy', () => {
    const ctx = buildScientificContext(withPeers(7, [200, 60, 70]));

    expect(ctx.trend?.isSignificant).toBe(true);
  });
});
