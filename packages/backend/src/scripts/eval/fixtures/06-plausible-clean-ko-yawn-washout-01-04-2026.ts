import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '08-plausible-clean-ko-yawn-washout',
  case: 'PLAUSIBLE_CLEAN',
  description:
    'Moderate reading despite heavily smoke-loaded origin over Strait of Malacca (CAMS 60.7 µg/m³) — strong reverse CAMS gradient driven by 76 mm of rainfall along the path. Sumatra/southern Malaysia peatland fires near Singapore visible at origin. Rain washout is the dominant story. Area fire pressure negligible.',
  input: {
    station: {
      name: 'โรงเรียนบ้านเกาะยวน',
      lat: 6.873,
      lng: 99.808,
    },
    date: '2026-04-01',
    currentPm25: 21.9,
    sevenDayAverages: [
      { date: '2026-03-25', value: 19.2 },
      { date: '2026-03-26', value: 22.3 },
      { date: '2026-03-27', value: 29.9 },
      { date: '2026-03-28', value: 24.2 },
      { date: '2026-03-29', value: 23.8 },
      { date: '2026-03-30', value: 23.7 },
      { date: '2026-03-31', value: 27.5 },
      { date: '2026-04-01', value: 21.9 },
    ],
    weather: {
      days: [
        {
          date: '2026-04-01',
          wind: { state: 'available', directionDeg: 247, speedKmh: 10.0 },
          precipitationMm: 6.6,
          humidity: 61,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-31',
          wind: { state: 'available', directionDeg: 90, speedKmh: 10.1 },
          precipitationMm: 16.2,
          humidity: 79,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-30',
          wind: { state: 'available', directionDeg: 247, speedKmh: 17.6 },
          precipitationMm: 8.1,
          humidity: 73,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-29',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 1.9,
          humidity: 45,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-28',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.0,
          humidity: 36,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 32.8,
      trajectoryOriginPrecipitationMm: null,
    },
    trajectory: {
      hoursTraced: 66,
      memberCount: 5,
      origin: {
        lat: 1.94,
        lng: 101.36,
        region: 'Strait of Malacca',
        date: '2026-03-30',
      },
      corridorWidthKm: 130,
      meanWindSpeedKmh: 10.9,
      waypoints: [
        { lat: 6.9, lng: 99.8, region: 'Thailand' },
        { lat: 5.5, lng: 98.5, region: 'Strait of Malacca' },
        { lat: 3.6, lng: 99.5, region: 'Strait of Malacca' },
        { lat: 1.9, lng: 101.4, region: 'Strait of Malacca' },
      ],
      camsAlongPath: [
        { lat: 5.8, lng: 98.4, date: '2026-04-01', pm25: 4.8 },
        { lat: 4.0, lng: 99.2, date: '2026-03-31', pm25: 24.7 },
        { lat: 1.9, lng: 101.4, date: '2026-03-30', pm25: 60.7 },
      ],
    },
    firePressure: {
      pathScore: 30,
      pathFireCount: 200,
      pathFiresByRecency: {
        last24h: { count: 123, totalFrpMw: 1147 },
        last48h: { count: 45, totalFrpMw: 324 },
        last72h: { count: 32, totalFrpMw: 57 },
      },
      areaScore: 0.0,
      areaFireCount: 1,
      areaTotalFrpMw: 4,
    },
    upwindSources: [
      // Ho Chi Minh City at 869 km — well beyond any threshold, tier 3, omit
      {
        name: 'Ho Chi Minh City',
        country: 'VN',
        distanceKm: 869,
        type: 'city',
        population: 9_000_000,
        currentlyUpwind: false,
      },
    ],
    peers: {
      stationCount: 4,
      weightedMean: 23.5,
      unweightedMedian: 26.9,
      range: { min: 11.8, max: 38.1 },
      stations: [
        { name: 'City Hall, Satun', value: 11.8, distanceKm: 40 },
        { name: 'Chumchon Banpadang School', value: 19.7, distanceKm: 62 },
        { name: 'SM SAINS TUANKU SYED PUTRA', value: 34.1, distanceKm: 67 },
        { name: 'Sadao Khanchai School สะเดาขรรค์ชัย', value: 38.1, distanceKm: 73 },
      ],
    },
    // Not a strong outlier — 21.9 vs weighted mean 23.5 = 0.93×
    outlier: null,
    season: 'peak_burning',
    // Wind shifted significantly — WSW, E, WSW — not consistent enough
    persistentWind: null,
  },
};
