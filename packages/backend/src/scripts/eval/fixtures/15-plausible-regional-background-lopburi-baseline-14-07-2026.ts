import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '15-plausible-regional-background-lopburi-baseline-14-07-2026',
  case: 'PLAUSIBLE_REGIONAL_BACKGROUND',
  description:
    "Moderate reading (18.4) during monsoon season, well above the station's own mid-July baseline (typically 5-9 µg/m³), but consistent with four peer stations (14-21 µg/m³) and not a peer outlier. Low fire pressure and no upwind sources — exercises the new STATION SEASONAL BASELINE signal on a case the calendar SEASONAL CONTEXT alone would call unremarkable.",
  input: {
    station: {
      name: 'Lopburi City Hall',
      lat: 14.799,
      lng: 100.654,
    },
    date: '2026-07-14',
    currentPm25: 18.4,
    sevenDayAverages: [
      { date: '2026-07-07', value: 15.2 },
      { date: '2026-07-08', value: 16.0 },
      { date: '2026-07-09', value: 14.8 },
      { date: '2026-07-10', value: 17.5 },
      { date: '2026-07-11', value: 16.9 },
      { date: '2026-07-12', value: 18.0 },
      { date: '2026-07-13', value: 18.0 },
      { date: '2026-07-14', value: 18.4 },
    ],
    weather: {
      days: [
        {
          date: '2026-07-14',
          wind: { state: 'available', directionDeg: 200, speedKmh: 8.4 },
          precipitationMm: 0.6,
          humidity: 78,
          highHumidityWarning: false,
        },
        {
          date: '2026-07-13',
          wind: { state: 'available', directionDeg: 210, speedKmh: 9.1 },
          precipitationMm: 1.2,
          humidity: 80,
          highHumidityWarning: false,
        },
        {
          date: '2026-07-12',
          wind: { state: 'available', directionDeg: 195, speedKmh: 7.8 },
          precipitationMm: 2.0,
          humidity: 76,
          highHumidityWarning: false,
        },
        {
          date: '2026-07-11',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 3.5,
          humidity: 74,
          highHumidityWarning: false,
        },
        {
          date: '2026-07-10',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 4.1,
          humidity: 73,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 11.4,
      trajectoryPrecipitationMm: 9.8,
    },
    trajectory: {
      hoursTraced: 66,
      memberCount: 5,
      origin: {
        lat: 18.9,
        lng: 102.6,
        region: 'Laos',
        date: '2026-07-12',
      },
      corridorWidthKm: 130,
      meanWindSpeedKmh: 9.5,
      waypoints: [
        { lat: 14.8, lng: 100.65, region: 'Thailand' },
        { lat: 16.5, lng: 101.5, region: 'Thailand' },
        { lat: 18.0, lng: 102.1, region: 'Laos' },
        { lat: 18.9, lng: 102.6, region: 'Laos' },
      ],
      camsAlongPath: [
        { lat: 16.5, lng: 101.5, date: '2026-07-14', pm25: 16.2 },
        { lat: 17.8, lng: 102.0, date: '2026-07-13', pm25: 15.0 },
        { lat: 18.9, lng: 102.6, date: '2026-07-12', pm25: 14.5 },
      ],
    },
    firePressure: {
      // Monsoon season — negligible fire activity, well under the fire-transport thresholds
      pathScore: 3,
      pathFireCount: 2,
      pathFiresByRecency: {
        last24h: { count: 1, totalFrpMw: 4 },
        last48h: { count: 1, totalFrpMw: 3 },
        last72h: { count: 0, totalFrpMw: 0 },
      },
      topFires: null,

      areaScore: 1,
      areaFireCount: 1,
      areaTotalFrpMw: 3,
    },
    upwindSources: [],
    peers: {
      stationCount: 4,
      weightedMean: 17.6,
      unweightedMedian: 17.55,
      range: { min: 14.0, max: 21.3 },
      stations: [
        { name: 'Ban Mi District Office', value: 21.3, distanceKm: 22 },
        { name: 'Khok Samrong Health Center', value: 14.0, distanceKm: 35 },
        { name: 'Tha Wung Community Hall', value: 18.5, distanceKm: 41 },
        { name: 'Phatthana Nikhom School', value: 16.6, distanceKm: 58 },
      ],
    },
    // 18.4 vs weightedMean 17.6 = within 5% — consistent with peers, not a strong outlier
    outlier: null,
    season: 'monsoon',
    baseline: { medianPm25: 7, p25Pm25: 5, p75Pm25: 9, n: 140 },
    persistentWind: null,
  },
};
