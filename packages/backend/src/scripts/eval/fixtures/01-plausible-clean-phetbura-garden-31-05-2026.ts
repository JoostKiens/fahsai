import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '02-plausible-clean-le-thai',
  case: 'PLAUSIBLE_CLEAN',
  description:
    'Good air during monsoon, origin in Laos, low fire pressure, reading below most peers but not a strong outlier.',
  input: {
    station: {
      name: 'Le Thai Community Park',
      lat: 17.006,
      lng: 99.819,
    },
    date: '2026-05-31',
    currentPm25: 8.6,
    sevenDayAverages: [
      { date: '2026-05-24', value: 13.6 },
      { date: '2026-05-25', value: 6.2 },
      { date: '2026-05-26', value: 7.3 },
      { date: '2026-05-27', value: 8.0 },
      { date: '2026-05-28', value: 7.8 },
      { date: '2026-05-29', value: 6.5 },
      { date: '2026-05-30', value: 9.3 },
      { date: '2026-05-31', value: 8.6 },
    ],
    weather: {
      days: [
        {
          date: '2026-05-31',
          wind: { state: 'available', directionDeg: 157, speedKmh: 3.6 },
          precipitationMm: 5.6,
          humidity: 52,
          highHumidityWarning: false,
        },
        {
          date: '2026-05-30',
          wind: { state: 'available', directionDeg: 135, speedKmh: 6.2 },
          precipitationMm: 3.5,
          humidity: 60,
          highHumidityWarning: false,
        },
        {
          date: '2026-05-29',
          wind: { state: 'available', directionDeg: 180, speedKmh: 8.5 },
          precipitationMm: 15.9,
          humidity: 58,
          highHumidityWarning: false,
        },
        {
          date: '2026-05-28',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 3.8,
          humidity: 56,
          highHumidityWarning: false,
        },
        {
          date: '2026-05-27',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 16.6,
          humidity: 53,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 45.4,
      trajectoryOriginPrecipitationMm: 2.6,
    },
    trajectory: {
      hoursTraced: 66,
      memberCount: 5,
      origin: {
        lat: 15.14,
        lng: 100.69,
        region: 'Laos',
        date: '2026-05-29',
      },
      corridorWidthKm: 147,
      meanWindSpeedKmh: 12.3,
      waypoints: [
        { lat: 17.0, lng: 99.8, region: 'Thailand' },
        { lat: 16.5, lng: 100.1, region: 'Thailand' },
        { lat: 15.5, lng: 100.7, region: 'Laos' },
        { lat: 15.1, lng: 100.7, region: 'Laos' },
      ],
      camsAlongPath: [
        { lat: 16.5, lng: 99.8, date: '2026-05-31', pm25: 12.9 },
        { lat: 15.8, lng: 100.8, date: '2026-05-30', pm25: 18.4 },
        { lat: 15.1, lng: 100.7, date: '2026-05-29', pm25: 25.7 },
      ],
    },
    firePressure: {
      pathScore: 10,
      pathFireCount: 59,
      pathFiresByRecency: {
        last24h: { count: 14, totalFrpMw: 80 },
        last48h: { count: 3, totalFrpMw: 13 },
        last72h: { count: 42, totalFrpMw: 270 },
      },
      areaScore: 0.9,
      areaFireCount: 7,
      areaTotalFrpMw: 45,
    },
    /*
    Mae Mah, TH — 99 km — 2400 MW coal plant [along wind path]
  Bangkok, TH — 120 km — pop. 10.5M [along wind path]
  BLCP Power, TH — 245 km — 1346 MW coal plant
  Hongsa, LA — 297 km — 1878 MW coal plant
  Tha Tum power station, TH — 128 km — 328 MW coal plant [along wind path]
  Gheco One power station, TH — 241 km — 660 MW coal plant
  Nonthaburi, TH — 109 km — pop. 1.1M [along wind path]
  Glow Energy power complex, TH — 241 km — 526 MW coal plant
    */
    upwindSources: [
      // [along wind path] sources — within corridorKm (147 km) of any ensemble waypoint
      {
        name: 'Mae Mah',
        country: 'TH',
        distanceKm: 99,
        type: 'coal_plant',
        capacityMw: 2400,
        currentlyUpwind: true,
      },
      {
        name: 'Bangkok',
        country: 'TH',
        distanceKm: 120,
        type: 'city',
        population: 10_500_000,
        currentlyUpwind: false,
      },
      {
        name: 'BLCP Power',
        country: 'TH',
        distanceKm: 245,
        type: 'coal_plant',
        capacityMw: 1346,
        currentlyUpwind: false,
      },
      {
        name: 'Hongsa',
        country: 'LA',
        distanceKm: 297,
        type: 'coal_plant',
        capacityMw: 1878,
        currentlyUpwind: false,
      },
      {
        name: 'Tha Tum power station',
        country: 'TH',
        distanceKm: 128,
        type: 'coal_plant',
        capacityMw: 328,
        currentlyUpwind: true,
      },
      {
        name: 'Gheco One power station',
        country: 'TH',
        distanceKm: 241,
        type: 'coal_plant',
        capacityMw: 660,
        currentlyUpwind: false,
      },
      {
        name: 'Nonthaburi',
        country: 'TH',
        distanceKm: 109,
        type: 'city',
        population: 1_100_000,
        currentlyUpwind: true,
      },
      {
        name: 'Glow Energy power complex',
        country: 'TH',
        distanceKm: 241,
        type: 'coal_plant',
        capacityMw: 526,
        currentlyUpwind: false,
      },
    ],
    peers: {
      stationCount: 5,
      weightedMean: 15.2,
      unweightedMedian: 15.5,
      range: { min: 9.1, max: 20.9 },
      stations: [
        { name: 'Chom Nan Chaloem Phrakiat Public Park', value: 16.5, distanceKm: 51 },
        { name: 'Sirichit Thai Cultural Conservation Ground', value: 9.1, distanceKm: 67 },
        { name: 'Pa-Yang Wang Kaphi', value: 20.9, distanceKm: 71 },
        { name: 'ถนนพาดวารี-บขส', value: 15.5, distanceKm: 73 },
        { name: 'หนองผา', value: 14.0, distanceKm: 74 },
      ],
    },
    // 8.6 ÷ 15.2 = 0.57× — below peers but above the 0.4× strong outlier threshold
    outlier: null,
    season: 'monsoon',
    persistentWind: {
      directionDeg: 164,
      label: 'SSE',
      dayCount: 5,
      sourcesBeyondWindow: [
        // Bangkok and Nonthaburi lie SSE of the station at 358–369 km —
        // beyond corridorKm (147 km) but in the persistent wind direction
        {
          name: 'Nonthaburi',
          country: 'TH',
          distanceKm: 358,
          type: 'city',
          population: 1_100_000,
          currentlyUpwind: true,
        },
        {
          name: 'Bangkok',
          country: 'TH',
          distanceKm: 369,
          type: 'city',
          population: 10_500_000,
          currentlyUpwind: true,
        },
      ],
    },
  },
};
