import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '11-plausible-regional-background-chanthaburi-06-04-2026',
  case: 'PLAUSIBLE_REGIONAL_BACKGROUND',
  description:
    'Moderate reading from Chanthaburi on 2026-04-06. Air arrived from the Gulf of Thailand with moderately polluted origin — regional smoke accumulation during peak burning season. 52 local fires within 75 km as background factor. No dominant upwind source. Three peer stations confirm consistent regional pattern (27–43 µg/m³). Stable trend (latest 28, yesterday 27, ratio 1.04).',
  input: {
    station: {
      name: 'Chanthaburi Meteorological Station',
      lat: 12.61,
      lng: 102.104,
    },
    date: '2026-04-06',
    currentPm25: 27.9,
    sevenDayAverages: [
      { date: '2026-03-30', value: 18.0 },
      { date: '2026-03-31', value: 14.0 },
      { date: '2026-04-01', value: 16.0 },
      { date: '2026-04-02', value: 17.0 },
      { date: '2026-04-03', value: 20.0 },
      { date: '2026-04-04', value: 29.0 },
      { date: '2026-04-05', value: 27.0 },
      { date: '2026-04-06', value: 27.9 },
    ],
    weather: {
      days: [
        {
          date: '2026-04-06',
          wind: { state: 'available', directionDeg: 202, speedKmh: 12.6 },
          precipitationMm: 0.2,
          humidity: 52,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-05',
          wind: { state: 'available', directionDeg: 225, speedKmh: 12.8 },
          precipitationMm: 0.0,
          humidity: 53,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-04',
          wind: { state: 'available', directionDeg: 225, speedKmh: 12.0 },
          precipitationMm: 0.3,
          humidity: 56,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-03',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 1.8,
          humidity: 64,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-02',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.4,
          humidity: 48,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 2.7,
      trajectoryPrecipitationMm: 1.6,
    },
    trajectory: {
      hoursTraced: 66,
      memberCount: 5,
      origin: {
        lat: 9.74,
        lng: 99.85,
        region: 'Gulf of Thailand',
        date: '2026-04-04',
      },
      corridorWidthKm: 149,
      meanWindSpeedKmh: 12.4,
      waypoints: [
        { lat: 12.6, lng: 102.1, region: 'Thailand' },
        { lat: 10.3, lng: 100.4, region: 'Gulf of Thailand' },
        { lat: 9.3, lng: 99.9, region: 'Gulf of Thailand' },
        { lat: 9.7, lng: 99.8, region: 'Gulf of Thailand' },
      ],
      camsAlongPath: [
        { lat: 11.5, lng: 101.2, date: '2026-04-06', pm25: 21.0 },
        { lat: 10.3, lng: 100.4, date: '2026-04-05', pm25: 19.2 },
        { lat: 9.7, lng: 99.8, date: '2026-04-04', pm25: 22.4 },
      ],
    },
    firePressure: {
      // Path fires present but score low — Gulf of Thailand origin has low fire activity
      pathScore: 12,
      pathFireCount: 150,
      pathFiresByRecency: {
        last24h: { count: 40, totalFrpMw: 180 },
        last48h: { count: 60, totalFrpMw: 270 },
        last72h: { count: 50, totalFrpMw: 210 },
      },
      topFires: null,

      // Area score < 40 — significant but not dominant; produces 52 fire count
      areaScore: 29,
      areaFireCount: 52,
      areaTotalFrpMw: 620,
    },
    upwindSources: [],
    peers: {
      stationCount: 3,
      weightedMean: 36.1,
      unweightedMedian: 35.5,
      range: { min: 27.0, max: 42.7 },
      stations: [
        { name: 'Khlung', value: 27.0, distanceKm: 18 },
        { name: 'Trat', value: 38.2, distanceKm: 59 },
        { name: 'Laem Ngop', value: 42.7, distanceKm: 68 },
      ],
    },
    outlier: null,
    season: 'peak_burning',
    persistentWind: {
      directionDeg: 225,
      label: 'SW',
      dayCount: 5,
      sourcesBeyondWindow: [],
    },
  },
};
