import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '04-outlier-high-kasetsart-university-03-05-2026',
  case: 'OUTLIER_HIGH',
  description:
    'Station reads 4.5× peer mean during late dry/early monsoon transition. 162 nearby stations average 15.9 µg/m³ — all Good or Moderate — while this station reads Unhealthy at 71.2 µg/m³. Most likely a sensor fault or very localised source directly at the station. Low fire pressure, no regional smoke event.',
  input: {
    station: {
      name: 'Kasetsart University',
      lat: 13.856,
      lng: 100.57,
    },
    date: '2026-05-03',
    currentPm25: 71.2,
    sevenDayAverages: [
      { date: '2026-04-29', value: 33.2 },
      { date: '2026-04-30', value: 39.0 },
      { date: '2026-05-01', value: 27.0 },
      { date: '2026-05-02', value: 50.8 },
      { date: '2026-05-03', value: 71.2 },
    ],
    weather: {
      days: [
        {
          date: '2026-05-03',
          wind: { state: 'available', directionDeg: 247, speedKmh: 8.8 },
          precipitationMm: 0.5,
          humidity: 50,
          highHumidityWarning: false,
        },
        {
          date: '2026-05-02',
          wind: { state: 'available', directionDeg: 180, speedKmh: 10.9 },
          precipitationMm: 1.7,
          humidity: 54,
          highHumidityWarning: false,
        },
        {
          date: '2026-05-01',
          wind: { state: 'available', directionDeg: 112, speedKmh: 3.6 },
          precipitationMm: 5.2,
          humidity: 55,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-30',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 6.1,
          humidity: 60,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-29',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 1.3,
          humidity: 50,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 14.8,
      trajectoryPrecipitationMm: null,
    },
    // Omitted for OUTLIER_HIGH — regional transport data not relevant
    trajectory: null,
    firePressure: {
      pathScore: null,
      pathFireCount: null,
      pathFiresByRecency: null,
      topFires: null,

      areaScore: 12.2,
      areaFireCount: 46,
      areaTotalFrpMw: 316,
    },
    // Omitted for OUTLIER_HIGH
    upwindSources: null,
    peers: {
      stationCount: 162,
      weightedMean: 15.9,
      unweightedMedian: 15.6,
      range: { min: 6.5, max: 28.5 },
      stations: [], // distribution used — >10 peers
      distribution: '32 Good, 129 Moderate',
    },
    outlier: { direction: 'high', ratio: 4.5 },
    season: 'monsoon',
    // Wind shifted ESE → S → WSW over 3 days — not consistent
    persistentWind: null,
  },
};
