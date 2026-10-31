import type { ExplainFixture } from '../types.js';

// Semi-synthetic. The station, date and the peer count, range and dropped peer (Phiang, 67 µg/m³,
// 71 km) are real, from GET /api/explain/context on 2026-10-09 (JOO-90). That date has since
// passed the 140-day retention, so weather, trajectory and fires are modelled on fixture 02 and
// the other peers' values and distances are filled in to match the real range.
export const fixture: ExplainFixture = {
  id: '17-plausible-fire-transport-chalermprakiet-18-04-2026',
  case: 'PLAUSIBLE_FIRE_TRANSPORT',
  description:
    'Hazardous reading (312 µg/m³) in Sainyabuli, Laos, during peak burning season. 8 peers within 75 km, but one far-low peer (Phiang, 67 µg/m³) is dropped from the range, which comes from the other 7 (243–564 µg/m³). Guards JOO-90: the answer must not say "eight stations" with that range.',
  input: {
    station: {
      name: 'Chalermprakiet Hospital',
      lat: 19.576,
      lng: 101.082,
    },
    date: '2026-04-18',
    currentPm25: 312.0,
    sevenDayAverages: [
      { date: '2026-04-11', value: 118.4 },
      { date: '2026-04-12', value: 142.0 },
      { date: '2026-04-13', value: 176.5 },
      { date: '2026-04-14', value: 203.1 },
      { date: '2026-04-15', value: 248.7 },
      { date: '2026-04-16', value: 271.2 },
      { date: '2026-04-17', value: 296.4 },
      { date: '2026-04-18', value: 312.0 },
    ],
    weather: {
      days: [
        {
          date: '2026-04-18',
          wind: { state: 'available', directionDeg: 258, speedKmh: 6.8 },
          precipitationMm: 0.0,
          humidity: 34,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-17',
          wind: { state: 'available', directionDeg: 266, speedKmh: 7.4 },
          precipitationMm: 0.0,
          humidity: 31,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-16',
          wind: { state: 'available', directionDeg: 271, speedKmh: 9.9 },
          precipitationMm: 0.0,
          humidity: 29,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-15',
          wind: { state: 'available', directionDeg: 262, speedKmh: 8.2 },
          precipitationMm: 0.0,
          humidity: 30,
          highHumidityWarning: false,
        },
        {
          date: '2026-04-14',
          wind: { state: 'available', directionDeg: 255, speedKmh: 7.0 },
          precipitationMm: 0.0,
          humidity: 33,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 0.0,
      trajectoryPrecipitationMm: 0.0,
    },
    trajectory: {
      hoursTraced: 66,
      memberCount: 5,
      origin: {
        lat: 19.2,
        lng: 97.6,
        region: 'Myanmar',
        date: '2026-04-15',
      },
      corridorWidthKm: 130,
      meanWindSpeedKmh: 8.1,
      waypoints: [
        { lat: 19.6, lng: 101.1, region: 'Laos' }, // station
        { lat: 19.0, lng: 100.4, region: 'Thailand' },
        { lat: 19.0, lng: 99.0, region: 'Thailand' },
        { lat: 19.2, lng: 97.6, region: 'Myanmar' },
      ],
      camsAlongPath: [
        { lat: 19.0, lng: 100.4, date: '2026-04-18', pm25: 96.3 },
        { lat: 19.0, lng: 99.0, date: '2026-04-17', pm25: 118.7 },
        { lat: 19.2, lng: 97.6, date: '2026-04-15', pm25: 84.2 },
      ],
    },
    firePressure: {
      pathScore: 92,
      pathFireCount: 8417,
      pathFiresByRecency: {
        last24h: { count: 3912, totalFrpMw: 28406 },
        last48h: { count: 2873, totalFrpMw: 21130 },
        last72h: { count: 1632, totalFrpMw: 9874 },
      },
      topFires: null,

      areaScore: 88,
      areaFireCount: 436,
      areaTotalFrpMw: 1512,
    },
    upwindSources: [],
    peers: {
      stationCount: 8,
      weightedMean: 363.7,
      unweightedMedian: 375.1,
      range: { min: 242.5, max: 564.1 },
      rangeStationCount: 7,
      severeStationCount: 7,
      // Phiang (67 µg/m³, 71 km) is under 0.4x the median, so analyzePeers leaves it out here
      stations: [
        { name: 'Nearby station A', value: 398.4, distanceKm: 9 },
        { name: 'Nearby station B', value: 300.2, distanceKm: 12 },
        { name: 'Nearby station C', value: 351.8, distanceKm: 22 },
        { name: 'Nearby station D', value: 452.7, distanceKm: 31 },
        { name: 'Nearby station E', value: 242.5, distanceKm: 38 },
        { name: 'Nearby station F', value: 497.3, distanceKm: 47 },
        { name: 'Nearby station G', value: 564.1, distanceKm: 55 },
      ],
      distribution: null,
    },
    outlier: null,
    season: 'peak_burning',
    baseline: null,
    persistentWind: {
      directionDeg: 262,
      label: 'W',
      dayCount: 5,
      sourcesBeyondWindow: [],
    },
  },
};
