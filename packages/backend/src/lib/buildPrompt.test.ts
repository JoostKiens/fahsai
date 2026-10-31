import { describe, expect, it } from 'vitest';
import { FULL_CONTEXT, HIGH_OUTLIER_CONTEXT } from '../test/fixtures/scientific-context.js';
import { buildPrompt } from './buildPrompt.js';

const DECIMAL_PM25 = /\d\.\d+\s*µg\/m³/;

describe('buildPrompt', () => {
  // Gemini copies decimals it is given, which breaks the "round PM2.5 to an integer" rule in Thai
  it('gives PM2.5 values to the model as integers', () => {
    const twoPeers = {
      ...FULL_CONTEXT,
      peers: {
        stationCount: 2,
        weightedMean: 84.1,
        unweightedMedian: 83.6,
        range: { min: 80.4, max: 86.8 },
        rangeStationCount: 2,
        distribution: null,
        stations: [
          { name: 'Peer One', value: 80.4, distanceKm: 12.5 },
          { name: 'Peer Two', value: 86.8, distanceKm: 30.2 },
        ],
      },
    };

    for (const ctx of [FULL_CONTEXT, twoPeers]) {
      for (const locale of ['en', 'th']) {
        expect(buildPrompt(ctx, locale)).not.toMatch(DECIMAL_PM25);
      }
    }
  });

  it('states the outlier ratio, since the model cannot compute it from the rounded mean', () => {
    expect(buildPrompt(HIGH_OUTLIER_CONTEXT, 'en')).toContain(
      'Station reading ÷ peer weighted mean: 3.10',
    );
    expect(buildPrompt(FULL_CONTEXT, 'en')).not.toContain('Station reading ÷ peer weighted mean');
  });

  describe('lowest humidity', () => {
    function promptWithHumidity(humidities: (number | null)[]): string {
      const days = humidities.map((humidity, i) => ({
        date: `2026-03-${String(14 - i).padStart(2, '0')}`,
        precipitationMm: 0,
        humidity,
        highHumidityWarning: false,
      }));
      return buildPrompt(
        { ...FULL_CONTEXT, weatherContext: { ...FULL_CONTEXT.weatherContext, days } },
        'en',
      );
    }

    it('states the lowest reading when it is not the most recent day', () => {
      expect(promptWithHumidity([34, 31, 29, 30])).toContain('Lowest RH: 29% (2026-03-12)');
    });

    it('skips days without a humidity reading', () => {
      expect(promptWithHumidity([null, 45, null, 52])).toContain('Lowest RH: 45% (2026-03-13)');
    });

    it('adds no lowest line when no day has a humidity reading', () => {
      expect(promptWithHumidity([null, null])).not.toContain('Lowest RH');
    });
  });
});
