import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '09-plausible-urban-industrial-hana',
  case: 'PLAUSIBLE_URBAN_INDUSTRIAL',
  description:
    'Unhealthy for sensitive groups reading with Gulf of Thailand marine origin. CAMS flat and low (11.5–15.5 µg/m³) — no gradient story. Map Ta Phut/Rayong industrial cluster and eastern seaboard power plants within 131–133 km along wind path are the most plausible cause. Station reads 2× its only peer (Hua Hin 18.8 µg/m³). Fire pressure Moderate at 24/100 but below the threshold for fire transport story.',
  input: {
    station: {
      name: 'Hana',
      lat: 12.335,
      lng: 99.98,
    },
    date: '2026-04-01',
    currentPm25: 37.1,
    sevenDayAverages: [
      { date: '2026-03-25', value: 27.6 },
      { date: '2026-03-26', value: 33.5 },
      { date: '2026-03-27', value: 36.2 },
      { date: '2026-03-28', value: 38.2 },
      { date: '2026-03-29', value: 30.1 },
      { date: '2026-03-30', value: 27.2 },
      { date: '2026-03-31', value: 26.6 },
      { date: '2026-04-01', value: 37.1 },
    ],
    weather: {
      days: [
        {
          date: '2026-04-01',
          wind: { state: 'available', directionDeg: 112, speedKmh: 11.7 },
          precipitationMm: 0.0,
          humidity: 36,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-31',
          wind: { state: 'available', directionDeg: 135, speedKmh: 15.9 },
          precipitationMm: 0.7,
          humidity: 37,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-30',
          wind: { state: 'available', directionDeg: 135, speedKmh: 15.7 },
          precipitationMm: 0.0,
          humidity: 42,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-29',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.3,
          humidity: 47,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-28',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.0,
          humidity: 40,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 1.0,
      trajectoryOriginPrecipitationMm: null,
    },
    trajectory: {
      hoursTraced: 66,
      memberCount: 5,
      origin: {
        lat: 8.26,
        lng: 104.15,
        region: 'Gulf of Thailand',
        date: '2026-03-30',
      },
      corridorWidthKm: 130,
      meanWindSpeedKmh: 10.9,
      waypoints: [
        { lat: 12.3, lng: 100.0, region: 'Thailand' },
        { lat: 10.1, lng: 101.0, region: 'Gulf of Thailand' },
        { lat: 8.7, lng: 102.5, region: 'Gulf of Thailand' },
        { lat: 8.3, lng: 104.1, region: 'Gulf of Thailand' },
      ],
      camsAlongPath: [
        { lat: 10.6, lng: 100.8, date: '2026-04-01', pm25: 13.5 },
        { lat: 9.3, lng: 101.7, date: '2026-03-31', pm25: 11.5 },
        { lat: 8.3, lng: 104.1, date: '2026-03-30', pm25: 15.5 },
      ],
    },
    firePressure: {
      pathScore: 27,
      pathFireCount: 181,
      pathFiresByRecency: {
        last24h: { count: 93, totalFrpMw: 566 },
        last48h: { count: 57, totalFrpMw: 562 },
        last72h: { count: 31, totalFrpMw: 64 },
      },
      areaScore: 2.1,
      areaFireCount: 10,
      areaTotalFrpMw: 88,
    },
    upwindSources: [
      // Tier 1: [along wind path] and within 150 km — ordered by proximity
      {
        name: 'Gheco One power station',
        country: 'TH',
        distanceKm: 131,
        type: 'coal_plant',
        capacityMw: 660,
        currentlyUpwind: true,
      },
      {
        name: 'Glow Energy power complex',
        country: 'TH',
        distanceKm: 131,
        type: 'coal_plant',
        capacityMw: 526,
        currentlyUpwind: true,
      },
      {
        name: 'BLCP Power',
        country: 'TH',
        distanceKm: 133,
        type: 'coal_plant',
        capacityMw: 1346,
        currentlyUpwind: true,
      },
      {
        name: 'Map Ta Phut / Rayong',
        country: 'TH',
        distanceKm: 133,
        type: 'industrial',
        currentlyUpwind: true,
      },
      // Beyond 150 km
      {
        name: 'Samut Prakan',
        country: 'TH',
        distanceKm: 156,
        type: 'industrial',
        currentlyUpwind: true,
      },
      {
        name: 'Bangkok',
        country: 'TH',
        distanceKm: 168,
        type: 'city',
        population: 10_500_000,
        currentlyUpwind: true,
      },
      {
        name: 'Tha Tum power station',
        country: 'TH',
        distanceKm: 249,
        type: 'coal_plant',
        capacityMw: 328,
        currentlyUpwind: false,
      },
      {
        name: 'Mae Mah',
        country: 'TH',
        distanceKm: 663,
        type: 'coal_plant',
        capacityMw: 2400,
        currentlyUpwind: false,
      },
    ],
    peers: {
      stationCount: 1,
      weightedMean: 18.8,
      unweightedMedian: 18.8,
      range: { min: 18.8, max: 18.8 },
      stations: [
        {
          name: 'Hua Hin Weather Station Prachuap Khiri Khan Meteorological Station',
          value: 18.8,
          distanceKm: 27,
        },
      ],
    },
    // 37.1 ÷ 18.8 = 1.97× — elevated outlier note present but below 2.0× strong threshold
    outlier: null,
    season: 'peak_burning',
    persistentWind: {
      directionDeg: 128, // circular mean of ESE(112), SE(135), SE(135) ≈ SE
      label: 'SE',
      dayCount: 5,
      sourcesBeyondWindow: [], // no major sources identified beyond window in SE direction
    },
  },
};
