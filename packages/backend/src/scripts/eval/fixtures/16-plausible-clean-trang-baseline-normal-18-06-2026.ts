import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '16-plausible-clean-trang-baseline-normal-18-06-2026',
  case: 'PLAUSIBLE_CLEAN',
  description:
    "Good air during monsoon season, clean Andaman Sea origin, consistent westerly winds. Reading (7.5) sits inside the station's own baseline range (5-9 µg/m³, n=120) — classifyReading returns normal, so stationBaseline is null and no STATION SEASONAL BASELINE line should reach the prompt. Regression fixture for the null-on-normal gate, not a content test.",
  input: {
    station: {
      name: 'Trang Provincial Hall',
      lat: 7.559,
      lng: 99.616,
    },
    date: '2026-06-18',
    currentPm25: 7.5,
    sevenDayAverages: [
      { date: '2026-06-11', value: 8.0 },
      { date: '2026-06-12', value: 6.5 },
      { date: '2026-06-13', value: 9.1 },
      { date: '2026-06-14', value: 7.8 },
      { date: '2026-06-15', value: 6.9 },
      { date: '2026-06-16', value: 8.4 },
      { date: '2026-06-17', value: 7.0 },
      { date: '2026-06-18', value: 7.5 },
    ],
    weather: {
      days: [
        {
          date: '2026-06-18',
          wind: { state: 'available', directionDeg: 260, speedKmh: 14.2 },
          precipitationMm: 0.0,
          humidity: 68,
          highHumidityWarning: false,
        },
        {
          date: '2026-06-17',
          wind: { state: 'available', directionDeg: 255, speedKmh: 13.8 },
          precipitationMm: 0.0,
          humidity: 66,
          highHumidityWarning: false,
        },
        {
          date: '2026-06-16',
          wind: { state: 'available', directionDeg: 265, speedKmh: 15.0 },
          precipitationMm: 0.2,
          humidity: 70,
          highHumidityWarning: false,
        },
        {
          date: '2026-06-15',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.0,
          humidity: 64,
          highHumidityWarning: false,
        },
        {
          date: '2026-06-14',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.0,
          humidity: 65,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 0.2,
      trajectoryPrecipitationMm: 0.5,
    },
    trajectory: {
      hoursTraced: 66,
      memberCount: 5,
      origin: {
        lat: 8.1,
        lng: 96.5,
        region: 'Andaman Sea',
        date: '2026-06-16',
      },
      corridorWidthKm: 135,
      meanWindSpeedKmh: 14.5,
      waypoints: [
        { lat: 7.6, lng: 99.6, region: 'Thailand' },
        { lat: 7.8, lng: 98.0, region: 'Andaman Sea' },
        { lat: 8.0, lng: 97.0, region: 'Andaman Sea' },
        { lat: 8.1, lng: 96.5, region: 'Andaman Sea' },
      ],
      camsAlongPath: [
        { lat: 7.8, lng: 98.0, date: '2026-06-18', pm25: 9.8 },
        { lat: 8.0, lng: 97.0, date: '2026-06-17', pm25: 8.9 },
        { lat: 8.1, lng: 96.5, date: '2026-06-16', pm25: 8.2 },
      ],
    },
    firePressure: {
      pathScore: 4,
      pathFireCount: 3,
      pathFiresByRecency: {
        last24h: { count: 0, totalFrpMw: 0 },
        last48h: { count: 1, totalFrpMw: 2 },
        last72h: { count: 2, totalFrpMw: 5 },
      },
      topFires: null,

      areaScore: 0.2,
      areaFireCount: 0,
      areaTotalFrpMw: 0,
    },
    upwindSources: [],
    peers: {
      stationCount: 1,
      weightedMean: 7.8,
      unweightedMedian: 7.8,
      range: { min: 7.8, max: 7.8 },
      stations: [{ name: 'Kantang District Office', value: 7.8, distanceKm: 24 }],
    },
    outlier: null,
    season: 'monsoon',
    baseline: { medianPm25: 7.5, p25Pm25: 5, p75Pm25: 10, n: 120 },
    persistentWind: {
      directionDeg: 260,
      label: 'W',
      dayCount: 5,
      sourcesBeyondWindow: [],
    },
  },
};
