import { describe, expect, it } from 'vitest';
import { analyzeTestPeers, explainInputFor, peerRows } from '../test/fixtures/explain-input.js';
import { buildPrompt } from './buildPrompt.js';
import { buildRawExplainData } from './buildRawExplainData.js';
import { buildScientificContext } from './buildScientificContext.js';

const RANGE_IN_PROMPT = /range \d+–\d+ µg\/m³ for (\d+) of them; 1 outlying reading is left out/;

function promptFor(values: number[]): string {
  const raw = buildRawExplainData(explainInputFor(peerRows(values)));
  return buildPrompt(buildScientificContext(raw), 'en');
}

// Seven peers between 242.5 and 564.1, as at Chalermprakiet Hospital on 2026-04-18 (JOO-90)
const CLUSTERED = [242.5, 300, 350, 400, 450, 500, 564.1];
// Under 0.4x the median of the clustered peers, so left out of the range
const MUCH_LOWER = 67;

describe('explain prompt peer summary', () => {
  it('gives the count of the peers the range is taken from when a much lower reading is dropped', () => {
    const prompt = promptFor([...CLUSTERED, MUCH_LOWER]);

    expect(prompt).toContain('8 stations — ');
    expect(prompt.match(RANGE_IN_PROMPT)?.[1]).toBe('7');
    expect(prompt).toContain('give the count as 7 of 8 stations. The mean and median cover all 8.');
  });

  it('gives the range count when more than 10 peers are summarised as a distribution', () => {
    const prompt = promptFor([...CLUSTERED, ...CLUSTERED.slice(0, 4), MUCH_LOWER]);

    expect(prompt).toContain('Distribution by AQI category');
    expect(prompt).toContain(
      'give the count as 11 of 12 stations. The mean and median cover all 12.',
    );
  });

  it('counts a severe reading as severe even when it is left out of the range', () => {
    // 300 is over 2x the median (75), so it is left out of the range
    expect(analyzeTestPeers(peerRows([60, 70, 80, 300])).severePeerCount).toBe(1);
  });

  it('gives no separate count when every peer is in the range', () => {
    const prompt = promptFor(CLUSTERED);

    expect(prompt).toContain('7 stations — ');
    expect(prompt).not.toMatch(RANGE_IN_PROMPT);
    expect(prompt).not.toContain('give the count as');
  });
});
