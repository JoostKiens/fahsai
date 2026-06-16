import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '12-plausible-clean-coastal-nakhon-nayok-06-04-2026',
  case: 'PLAUSIBLE_CLEAN',
  description:
    'Moderate reading (29 µg/m³) close to the Gulf of Thailand during peak burning season. ' +
    '1,741 path fires (Very high pressure) and 572 local fires within 75 km, but station ' +
    'benefits from a short maritime path — air arriving from the Gulf of Thailand before ' +
    'accumulating heavy smoke. CAMS: 18.7 µg/m³ at origin rising to 26.1 µg/m³ near station ' +
    '(Moderately polluted origin, gap < 20 µg/m³). Peers range 22–56 µg/m³ with 34/47 at USG. ' +
    'Classified PLAUSIBLE_CLEAN by coastal override (originIsWater && latestPm25 <= 35.4).',
  input: {
    station: {
      name: 'Nakhon Nayok Municipality Public Health Service Center',
      lat: 14.20422,
      lng: 101.21509,
    },
    date: '2026-04-06',
    currentPm25: 28.6,
    sevenDayAverages: [
      { date: '2026-03-30', value: 20.0 },
      { date: '2026-03-31', value: 19.0 },
      { date: '2026-04-01', value: 27.0 },
      { date: '2026-04-02', value: 34.0 },
      { date: '2026-04-03', value: 28.0 },
      { date: '2026-04-04', value: 31.0 },
      { date: '2026-04-05', value: 35.0 },
      { date: '2026-04-06', value: 28.6 },
    ],
    weather: {
      days: [
        {
          date: '2026-04-06',
          wind: { state: 'available', directionDeg: 247, speedKmh: 7.2 },
          precipitationMm: 0.1,
          humidity: 51,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-05',
          wind: { state: 'available', directionDeg: 225, speedKmh: 7.9 },
          precipitationMm: 0.4,
          humidity: 47,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-04',
          wind: { state: 'available', directionDeg: 247, speedKmh: 9.8 },
          precipitationMm: 0.3,
          humidity: 42,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-03',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.0,
          humidity: 51,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-02',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.0,
          humidity: 46,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 0.8,
      trajectoryPrecipitationMm: 0.1,
    },
    trajectory: {
      hoursTraced: 66,
      memberCount: 5,
      origin: {
        lat: 9.212918374423909,
        lng: 100.67861201831514,
        region: 'Gulf of Thailand',
        date: '2026-04-04',
      },
      corridorWidthKm: 149.02752772341847,
      meanWindSpeedKmh: 12.418960643618206,
      waypoints: [
        { lat: 14.2, lng: 101.2, region: 'Thailand' },
        { lat: 12.8, lng: 101.0, region: 'Thailand' },
        { lat: 10.1, lng: 100.2, region: 'Gulf of Thailand' },
        { lat: 9.2, lng: 100.7, region: 'Gulf of Thailand' },
      ],
      camsAlongPath: [
        { lat: 13.45, lng: 100.35, date: '2026-04-06', pm25: 26.1 },
        { lat: 10.71, lng: 100.48, date: '2026-04-05', pm25: 17.5 },
        { lat: 9.21, lng: 100.68, date: '2026-04-04', pm25: 18.7 },
      ],
    },
    firePressure: {
      pathScore: 78,
      pathFireCount: 1741,
      pathFiresByRecency: {
        last24h: { count: 789, totalFrpMw: 5711 },
        last48h: { count: 540, totalFrpMw: 3518 },
        last72h: { count: 412, totalFrpMw: 2778 },
      },
      topFires: [
        { lat: 13.82, lng: 100.68, distKm: 4.0, frpMw: 18.0, ageH: 2 },
        { lat: 13.65, lng: 100.52, distKm: 4.0, frpMw: 12.0, ageH: 3 },
        { lat: 14.01, lng: 100.83, distKm: 6.0, frpMw: 25.0, ageH: 1 },
        { lat: 13.44, lng: 100.29, distKm: 7.0, frpMw: 8.0, ageH: 5 },
        { lat: 12.95, lng: 100.74, distKm: 9.0, frpMw: 15.0, ageH: 8 },
        { lat: 13.21, lng: 100.41, distKm: 11.0, frpMw: 32.0, ageH: 12 },
        { lat: 14.38, lng: 101.05, distKm: 14.0, frpMw: 9.0, ageH: 18 },
        { lat: 12.61, lng: 100.91, distKm: 16.0, frpMw: 21.0, ageH: 24 },
        { lat: 13.78, lng: 100.15, distKm: 19.0, frpMw: 14.0, ageH: 36 },
        { lat: 12.33, lng: 100.63, distKm: 22.0, frpMw: 11.0, ageH: 48 },
      ],
      areaScore: 82,
      areaFireCount: 572,
      areaTotalFrpMw: 4830,
    },
    upwindSources: [
      {
        name: 'Nonthaburi',
        country: 'TH',
        distanceKm: 84,
        type: 'city',
        population: 1_100_000,
        currentlyUpwind: true,
      },
      {
        name: 'Bangkok',
        country: 'TH',
        distanceKm: 92,
        type: 'city',
        population: 10_500_000,
        currentlyUpwind: true,
      },
      {
        name: 'Samut Prakan',
        country: 'TH',
        distanceKm: 95,
        type: 'industrial',
        population: 1_000_000,
        currentlyUpwind: true,
      },
    ],
    peers: {
      stationCount: 47,
      weightedMean: 38.7,
      unweightedMedian: 39.3,
      range: { min: 22.3, max: 56.0 },
      stations: [],
      distribution: '12 Moderate, 34 Unhealthy for sensitive groups, 1 Unhealthy',
    },
    outlier: null,
    season: 'peak_burning',
    persistentWind: {
      directionDeg: 240,
      label: 'WSW',
      dayCount: 3,
      sourcesBeyondWindow: [],
    },
  },
};
