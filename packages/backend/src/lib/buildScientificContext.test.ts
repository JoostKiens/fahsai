import { describe, expect, it } from 'vitest';
import { fixture } from '../scripts/eval/fixtures/10-plausible-fire-transport-ratchapracha-31-03-2026.js';
import type { RawExplainData } from '../scripts/eval/types.js';
import { explainInputFor, peerRows } from '../test/fixtures/explain-input.js';
import { buildRawExplainData } from './buildRawExplainData.js';
import { buildScientificContext } from './buildScientificContext.js';

// Fixture 10 supplies a fire-transport case with a significant rising trend; areaScore 50 makes
// its fires local. The peers come from analyzePeers and buildRawExplainData, as in production.
function withPeerValues(values: number[]): RawExplainData {
  const { input } = fixture;
  return {
    ...input,
    firePressure: input.firePressure && { ...input.firePressure, areaScore: 50 },
    peers: buildRawExplainData(explainInputFor(peerRows(values))).peers,
  };
}

describe('buildScientificContext regional crisis', () => {
  it('counts severe readings left out of the range when deciding on a regional crisis', () => {
    // median 140: 300, 320 and 330 are over 2x it and left out of the range, so 5 of 7 are
    // severe, though only 2 of the kept peers are
    const ctx = buildScientificContext(withPeerValues([60, 70, 130, 140, 300, 320, 330]));

    expect(ctx.trend?.isSignificant).toBe(false);
  });

  // Also guards the setup: if fixture 10 stops giving a significant trend, this fails first
  it('keeps the trend when only half of the nearby stations read Very unhealthy or worse', () => {
    const ctx = buildScientificContext(withPeerValues([10, 20, 30, 200, 210, 220]));

    expect(ctx.explainCase).toBe('PLAUSIBLE_FIRE_TRANSPORT');
    expect(ctx.trend?.isSignificant).toBe(true);
  });
});
