import { describe, expect, it } from 'vitest';
import { fixture } from '../scripts/eval/fixtures/10-plausible-fire-transport-ratchapracha-31-03-2026.js';
import type { RawExplainData } from '../scripts/eval/types.js';
import { buildScientificContext } from './buildScientificContext.js';

// Fixture 10 supplies a fire-transport case with a significant rising trend; areaScore 50 makes
// its fires local. Peers get their own values, with every summary field derived from them.
function withPeerValues(values: number[]): RawExplainData {
  const { input } = fixture;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  // the same 0.4x–2x of the median cut as analyzePeers, which keeps everything if under 3 remain
  const inBand = sorted.filter((v) => v >= median * 0.4 && v <= median * 2);
  const kept = inBand.length >= 3 ? inBand : sorted;
  return {
    ...input,
    firePressure: input.firePressure && { ...input.firePressure, areaScore: 50 },
    peers: {
      stationCount: values.length,
      weightedMean: values.reduce((sum, v) => sum + v, 0) / values.length,
      unweightedMedian: median,
      range: { min: kept[0], max: kept[kept.length - 1] },
      rangeStationCount: kept.length,
      severeStationCount: values.filter((v) => v > 125.4).length,
      stations: kept.map((value, i) => ({ name: `Peer ${i}`, value, distanceKm: 10 + i })),
      distribution: null,
    },
  };
}

describe('buildScientificContext regional crisis', () => {
  it('drops the trend when most nearby stations read Very unhealthy or worse', () => {
    const ctx = buildScientificContext(withPeerValues([30, 200, 210, 220]));

    expect(ctx.trend?.isSignificant).toBe(false);
  });

  // Also guards the setup: if fixture 10 stops giving a significant trend, this fails first
  it('keeps the trend when only half of the nearby stations read Very unhealthy or worse', () => {
    // 10, 20 and 30 fall under 0.4x the median and are left out of the range, but still count
    const ctx = buildScientificContext(withPeerValues([10, 20, 30, 200, 210, 220]));

    expect(ctx.explainCase).toBe('PLAUSIBLE_FIRE_TRANSPORT');
    expect(ctx.trend?.isSignificant).toBe(true);
  });
});
