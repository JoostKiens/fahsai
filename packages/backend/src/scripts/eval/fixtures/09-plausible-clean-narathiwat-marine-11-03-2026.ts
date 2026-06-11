import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '09-plausible-clean-narathiwat-marine-11-03-2026',
  case: 'PLAUSIBLE_CLEAN',
  description:
    'Good air during early dry season, deep South China Sea origin 1,600 km away. CAMS flat at 13.5–14.7 µg/m³ across entire path — no gradient, no fire story, no sources. One peer confirms regional picture. Clean maritime air with no land sources encountered.',
  input: {
    station: {
      name: 'City Hall, Narathiwat',
      lat: 6.427,
      lng: 101.823,
    },
    date: '2026-03-11',
    currentPm25: 11.6,
    sevenDayAverages: [
      { date: '2026-03-04', value: 14.8 },
      { date: '2026-03-05', value: 17.8 },
      { date: '2026-03-06', value: 19.0 },
      { date: '2026-03-07', value: 11.4 },
      { date: '2026-03-08', value: 9.7 },
      { date: '2026-03-09', value: 12.5 },
      { date: '2026-03-10', value: 14.2 },
      { date: '2026-03-11', value: 11.6 },
    ],
    weather: {
      days: [
        {
          date: '2026-03-11',
          wind: { state: 'available', directionDeg: 90, speedKmh: 22.8 },
          precipitationMm: 0.1,
          humidity: 71,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-10',
          wind: { state: 'available', directionDeg: 90, speedKmh: 21.2 },
          precipitationMm: 0.0,
          humidity: 66,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-09',
          wind: { state: 'available', directionDeg: 90, speedKmh: 18.8 },
          precipitationMm: 0.0,
          humidity: 65,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-08',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.0,
          humidity: 71,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-07',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.0,
          humidity: 67,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 0.1,
      trajectoryPrecipitationMm: 0.8,
    },
    trajectory: {
      hoursTraced: 66,
      memberCount: 5,
      origin: {
        lat: 16.26,
        lng: 114.68,
        region: 'South China Sea',
        date: '2026-03-09',
      },
      corridorWidthKm: 140,
      meanWindSpeedKmh: 11.6,
      waypoints: [
        { lat: 6.4, lng: 101.8, region: 'Thailand' },
        { lat: 7.3, lng: 106.1, region: 'South China Sea' },
        { lat: 12.9, lng: 110.9, region: 'South China Sea' },
        { lat: 16.3, lng: 114.7, region: 'South China Sea' },
      ],
      camsAlongPath: [
        { lat: 6.7, lng: 105.1, date: '2026-03-11', pm25: 14.7 },
        { lat: 11.4, lng: 110.3, date: '2026-03-10', pm25: 13.5 },
        { lat: 16.3, lng: 114.7, date: '2026-03-09', pm25: 14.4 },
      ],
    },
    firePressure: {
      pathScore: 11,
      pathFireCount: 91,
      pathFiresByRecency: {
        last24h: { count: 15, totalFrpMw: 83 },
        last48h: { count: 39, totalFrpMw: 237 },
        last72h: { count: 37, totalFrpMw: 185 },
      },
      topFires: null,

      areaScore: 0.3,
      areaFireCount: 4,
      areaTotalFrpMw: 20,
    },
    upwindSources: [
      // Ho Chi Minh City at 720 km — well beyond any threshold, tier 3
      {
        name: 'Ho Chi Minh City',
        country: 'VN',
        distanceKm: 720,
        type: 'city',
        population: 9_000_000,
        currentlyUpwind: false,
      },
    ],
    peers: {
      stationCount: 1,
      weightedMean: 11.8,
      unweightedMedian: 11.8,
      range: { min: 11.8, max: 11.8 },
      stations: [{ name: 'White Elephant Park', value: 11.8, distanceKm: 61 }],
    },
    outlier: null,
    season: 'peak_burning',
    persistentWind: {
      directionDeg: 90,
      label: 'E',
      dayCount: 5,
      sourcesBeyondWindow: [], // no sources identified in E direction beyond window
    },
  },
};
