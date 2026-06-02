import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '08-plausible-unclear-usu-13-05-2026',
  case: 'PLAUSIBLE_UNCLEAR',
  description:
    'Low Moderate reading with no identifiable cause. CAMS flat and Good along entire path, fire pressure negligible, no upwind sources, no peer stations. Air originated over Indonesia/Strait of Malacca after heavy rainfall. Sensor over-reading possible — RH hit 86% on May 10. The canonical PLAUSIBLE_UNCLEAR case.',
  input: {
    station: {
      name: 'USU',
      lat: 3.539,
      lng: 98.615,
    },
    date: '2026-05-13',
    currentPm25: 14.4,
    sevenDayAverages: [
      { date: '2026-05-06', value: 27.8 },
      { date: '2026-05-07', value: 14.7 },
      { date: '2026-05-08', value: 12.8 },
      { date: '2026-05-09', value: 11.5 },
      { date: '2026-05-10', value: 11.1 },
      { date: '2026-05-11', value: 7.3 },
      { date: '2026-05-12', value: 8.4 },
      { date: '2026-05-13', value: 14.4 },
    ],
    weather: {
      days: [
        {
          date: '2026-05-13',
          wind: { state: 'available', directionDeg: 90, speedKmh: 6.3 },
          precipitationMm: 5.7,
          humidity: 78,
          highHumidityWarning: false,
        },
        {
          date: '2026-05-12',
          wind: { state: 'missing', directionDeg: null, speedKmh: null },
          precipitationMm: 20.4,
          humidity: null,
          highHumidityWarning: false,
        },
        {
          date: '2026-05-11',
          wind: { state: 'available', directionDeg: 67, speedKmh: 5.4 },
          precipitationMm: 10.2,
          humidity: 64,
          highHumidityWarning: false,
        },
        {
          date: '2026-05-10',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 27.0,
          humidity: 86,
          highHumidityWarning: true,
        },
        {
          date: '2026-05-09',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.7,
          humidity: 71,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 64.0,
      trajectoryPrecipitationMm: 88.0,
    },
    trajectory: {
      hoursTraced: 66,
      memberCount: 5,
      origin: {
        lat: 2.12,
        lng: 100.19,
        region: 'Indonesia',
        date: '2026-05-11',
      },
      corridorWidthKm: 147,
      meanWindSpeedKmh: 12.2,
      waypoints: [
        { lat: 3.5, lng: 98.6, region: 'Thailand' }, // station is in Indonesia/Malaysia border area
        { lat: 3.3, lng: 99.7, region: 'Strait of Malacca' },
        { lat: 3.0, lng: 100.3, region: 'Strait of Malacca' },
        { lat: 2.1, lng: 100.2, region: 'Indonesia' },
      ],
      camsAlongPath: [
        { lat: 3.3, lng: 99.7, date: '2026-05-13', pm25: 11.4 },
        { lat: 3.3, lng: 99.7, date: '2026-05-12', pm25: 10.5 },
        { lat: 2.1, lng: 100.2, date: '2026-05-11', pm25: 10.3 },
      ],
    },
    firePressure: {
      pathScore: 2,
      pathFireCount: 3,
      pathFiresByRecency: {
        last24h: { count: 2, totalFrpMw: 25 },
        last48h: { count: 0, totalFrpMw: 0 },
        last72h: { count: 1, totalFrpMw: 4 },
      },
      topFires: null,

      areaScore: 0,
      areaFireCount: null,
      areaTotalFrpMw: null,
    },
    upwindSources: [],
    peers: null,
    outlier: null,
    season: 'monsoon',
    persistentWind: null, // wind data missing for May 12, insufficient for consistency check
  },
};
