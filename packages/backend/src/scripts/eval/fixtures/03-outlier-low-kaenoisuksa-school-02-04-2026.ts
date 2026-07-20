import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '03-outlier-low-kaenoisuksa-school-02-04-2026',
  case: 'OUTLIER_LOW',
  description:
    'Station reads 0.1× peer median during peak burning season. 51 nearby stations average 262 µg/m³ with 24 Hazardous — the region is in crisis but this station reads Moderate at 20.6 µg/m³. Almost certainly a faulty reading or local shielding. Area fire pressure is Very High (92.8/100).',
  input: {
    station: {
      name: 'Kaenoisuksa School 1, Chiang Dao, Chiang Mai',
      lat: 19.395,
      lng: 98.929,
    },
    date: '2026-04-02',
    currentPm25: 20.6,
    sevenDayAverages: [
      { date: '2026-03-26', value: 7.3 },
      { date: '2026-03-27', value: 10.3 },
      { date: '2026-03-28', value: 8.8 },
      { date: '2026-03-29', value: 11.6 },
      { date: '2026-03-30', value: 17.1 },
      { date: '2026-03-31', value: 17.8 },
      { date: '2026-04-01', value: 20.0 },
      { date: '2026-04-02', value: 20.6 },
    ],
    weather: {
      days: [
        {
          date: '2026-04-02',
          wind: { state: 'available', directionDeg: 135, speedKmh: 10.3 },
          precipitationMm: 0.0,
          humidity: 30,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-01',
          wind: { state: 'available', directionDeg: 135, speedKmh: 10.2 },
          precipitationMm: 0.0,
          humidity: 34,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-31',
          wind: { state: 'available', directionDeg: 270, speedKmh: 2.0 },
          precipitationMm: 0.0,
          humidity: 27,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-30',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.0,
          humidity: 30,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-29',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.0,
          humidity: 22,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 0.0,
      trajectoryPrecipitationMm: null,
    },
    // Omitted for OUTLIER_LOW — regional transport data not relevant
    trajectory: null,
    firePressure: {
      // Path score omitted (trajectory omitted), area score present
      pathScore: null,
      pathFireCount: null,
      pathFiresByRecency: null,
      topFires: null,

      areaScore: 92.8,
      areaFireCount: 389,
      areaTotalFrpMw: 1556,
    },
    // Upwind sources omitted for OUTLIER_LOW
    upwindSources: null,
    peers: {
      stationCount: 51,
      weightedMean: 261.7,
      unweightedMedian: 241.0,
      range: { min: 98.5, max: 474.0 },
      stations: [], // distribution used — >10 peers
      distribution: '6 Unhealthy, 21 Very unhealthy, 24 Hazardous',
    },
    outlier: { direction: 'low', ratio: 0.1 },
    season: 'peak_burning',
    baseline: null,
    persistentWind: null, // wind shifted from W to SE — not consistent
  },
};
