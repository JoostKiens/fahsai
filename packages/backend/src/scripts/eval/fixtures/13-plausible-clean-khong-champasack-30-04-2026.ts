import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '13-plausible-clean-khong-champasack-30-04-2026',
  case: 'PLAUSIBLE_CLEAN',
  description:
    'Good reading (9.3 µg/m³) during peak fire season with high path and area fire pressure. ' +
    '503 fires along path (pathScore 78), 476 area fires (areaScore 75) — classifier previously ' +
    'assigned PLAUSIBLE_FIRE_TRANSPORT before the latestPm25<=12 guard could fire. ' +
    '27.4 mm of trajectory precipitation explains the clean arrival. ' +
    'Origin: Cambodia (Moderately polluted). One peer (Sukhuma, 20.5 µg/m³, 68 km) confirms ' +
    'this station is running cleaner than the wider area.',
  input: {
    station: {
      name: 'Khong - Champasack',
      lat: 14.048,
      lng: 105.896,
    },
    date: '2026-04-30',
    currentPm25: 9.3,
    sevenDayAverages: [
      { date: '2026-04-23', value: 23 },
      { date: '2026-04-24', value: 34 },
      { date: '2026-04-25', value: 38 },
      { date: '2026-04-26', value: 24 },
      { date: '2026-04-27', value: 34 },
      { date: '2026-04-28', value: 15 },
      { date: '2026-04-29', value: 19 },
      { date: '2026-04-30', value: 9 },
    ],
    weather: {
      days: [
        {
          date: '2026-04-30',
          wind: { state: 'available', directionDeg: 180, speedKmh: 4.4 },
          precipitationMm: 0.0,
          humidity: 47,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-29',
          wind: { state: 'available', directionDeg: 180, speedKmh: 3.1 },
          precipitationMm: 8.3,
          humidity: 53,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-28',
          wind: { state: 'available', directionDeg: 158, speedKmh: 6.6 },
          precipitationMm: 0.8,
          humidity: 56,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-27',
          wind: { state: 'available', directionDeg: 180, speedKmh: 2.5 },
          precipitationMm: 2.5,
          humidity: 48,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-26',
          wind: { state: 'available', directionDeg: 180, speedKmh: 3.6 },
          precipitationMm: 0.6,
          humidity: 48,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 12.2,
      trajectoryPrecipitationMm: 27.4,
    },
    trajectory: {
      hoursTraced: 66,
      memberCount: 5,
      origin: {
        lat: 13.12,
        lng: 105.69,
        region: 'Cambodia',
        date: '2026-04-28',
      },
      corridorWidthKm: 141,
      meanWindSpeedKmh: 11.7,
      waypoints: [
        { lat: 14.0, lng: 105.9, region: 'Laos' },
        { lat: 13.5, lng: 106.6, region: 'Cambodia' },
        { lat: 13.1, lng: 105.8, region: 'Cambodia' },
        { lat: 13.1, lng: 105.7, region: 'Cambodia' },
      ],
      // camsMaxPm25 = max(18.1, 25.3, 22.0) = 25.3 — above 25 so CAMS suppression does not fire
      camsAlongPath: [
        { lat: 13.8, lng: 105.9, date: '2026-04-30', pm25: 18.1 },
        { lat: 13.4, lng: 106.0, date: '2026-04-29', pm25: 25.3 },
        { lat: 13.1, lng: 105.7, date: '2026-04-28', pm25: 22.0 },
      ],
    },
    firePressure: {
      pathScore: 78,
      pathFireCount: 503,
      pathFiresByRecency: {
        last24h: { count: 172, totalFrpMw: 1023 },
        last48h: { count: 145, totalFrpMw: 1058 },
        last72h: { count: 186, totalFrpMw: 1835 },
      },
      topFires: null,
      areaScore: 75,
      areaFireCount: 476,
      areaTotalFrpMw: null,
    },
    upwindSources: [],
    peers: {
      stationCount: 1,
      weightedMean: 20.5,
      unweightedMedian: 20.5,
      range: { min: 20.5, max: 20.5 },
      stations: [
        {
          name: 'Sukhuma Secondary School - Sukhuma, Champasack',
          value: 20.5,
          distanceKm: 68,
        },
      ],
    },
    outlier: null,
    season: 'peak_burning',
    persistentWind: {
      directionDeg: 180,
      label: 'S',
      dayCount: 5,
      sourcesBeyondWindow: [
        {
          name: 'Phnom Penh',
          country: 'KH',
          distanceKm: 296,
          type: 'city',
          population: 2_200_000,
          currentlyUpwind: true,
        },
        {
          name: 'Ho Chi Minh City',
          country: 'VN',
          distanceKm: 367,
          type: 'city',
          population: 9_000_000,
          currentlyUpwind: true,
        },
      ],
    },
  },
};
