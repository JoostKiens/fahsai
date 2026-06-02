import type { ExplainFixture } from '../types.js';

export const fixture: ExplainFixture = {
  id: '02-plausible-fire-transport-wiang-nuea-01-04-2026',
  case: 'PLAUSIBLE_FIRE_TRANSPORT',
  description:
    'Peak burning season, Hazardous reading (286 µg/m³), 12,334 fires along path with 100/100 fire pressure on both path and area scores. Air originates in Myanmar, westerly winds, zero rainfall, week-long escalation. The canonical cross-border fire transport case.',
  input: {
    station: {
      name: 'Wiang Nuea: Mon Far Pai Cottages',
      lat: 19.37,
      lng: 98.45,
    },
    date: '2026-04-01',
    currentPm25: 286.0,
    sevenDayAverages: [
      { date: '2026-03-25', value: 75.8 },
      { date: '2026-03-26', value: 102.8 },
      { date: '2026-03-27', value: 154.6 },
      { date: '2026-03-28', value: 141.8 },
      { date: '2026-03-29', value: 218.0 },
      { date: '2026-03-30', value: 282.0 },
      { date: '2026-03-31', value: 287.0 },
      { date: '2026-04-01', value: 286.0 },
    ],
    weather: {
      days: [
        {
          date: '2026-04-01',
          wind: { state: 'available', directionDeg: 247, speedKmh: 7.1 },
          precipitationMm: 0.0,
          humidity: 33,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-31',
          wind: { state: 'available', directionDeg: 270, speedKmh: 8.5 },
          precipitationMm: 0.0,
          humidity: 30,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-30',
          wind: { state: 'available', directionDeg: 270, speedKmh: 13.7 },
          precipitationMm: 0.0,
          humidity: 26,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-29',
          wind: { state: 'not_fetched', directionDeg: null, speedKmh: null },
          precipitationMm: 0.0,
          humidity: 22,
          highHumidityWarning: false,
        },
        {
          date: '2026-03-28',
          wind: { state: 'available', directionDeg: null, speedKmh: null },
          precipitationMm: 0.0,
          humidity: 23,
          highHumidityWarning: false,
        },
      ],
      totalPrecipitationMm: 0.0,
      trajectoryOriginPrecipitationMm: null,
    },
    trajectory: {
      hoursTraced: 66,
      memberCount: 5,
      origin: {
        lat: 17.6,
        lng: 95.13,
        region: 'Myanmar',
        date: '2026-03-30',
      },
      corridorWidthKm: 130,
      meanWindSpeedKmh: 10.9,
      waypoints: [
        { lat: 19.4, lng: 98.4, region: 'Thailand' }, // station
        { lat: 18.6, lng: 97.2, region: 'Myanmar' },
        { lat: 18.2, lng: 95.9, region: 'Myanmar' },
        { lat: 17.6, lng: 95.1, region: 'Myanmar' },
      ],
      camsAlongPath: [
        { lat: 18.7, lng: 97.3, date: '2026-04-01', pm25: 62.4 },
        { lat: 18.3, lng: 96.2, date: '2026-03-31', pm25: 87.6 },
        { lat: 17.6, lng: 95.1, date: '2026-03-30', pm25: 39.9 },
      ],
    },
    firePressure: {
      pathScore: 97,
      pathFireCount: 12334,
      pathFiresByRecency: {
        last24h: { count: 6754, totalFrpMw: 45801 },
        last48h: { count: 3796, totalFrpMw: 49814 },
        last72h: { count: 1784, totalFrpMw: 3711 },
      },
      areaScore: 100,
      areaFireCount: 614,
      areaTotalFrpMw: 1909,
    },
    upwindSources: [
      {
        name: 'Chiang Mai',
        country: 'TH',
        distanceKm: 86,
        type: 'city',
        population: 1_200_000,
        currentlyUpwind: true,
      },
      {
        name: 'Mae Mah',
        country: 'TH',
        distanceKm: 182,
        type: 'coal_plant',
        capacityMw: 2400,
        currentlyUpwind: true,
      },
      {
        name: 'Tigyit',
        country: 'MM',
        distanceKm: 217,
        type: 'coal_plant',
        capacityMw: 120,
        currentlyUpwind: true,
      },
      {
        name: 'Yangon',
        country: 'MM',
        distanceKm: 366,
        type: 'city',
        population: 7_400_000,
        currentlyUpwind: true,
      },
      {
        name: 'Hongsa',
        country: 'LA',
        distanceKm: 299,
        type: 'coal_plant',
        capacityMw: 1878,
        currentlyUpwind: false,
      },
    ],
    peers: {
      stationCount: 41,
      weightedMean: 306.5,
      unweightedMedian: 249.0,
      range: { min: 142.0, max: 440.0 },
      stations: [], // distribution used instead — >10 peers
    },
    outlier: null,
    season: 'peak_burning',
    persistentWind: {
      directionDeg: 256, // circular mean of WSW(247), W(270), W(270), W(270), W(270) ≈ W/WSW
      label: 'WSW',
      dayCount: 5,
      sourcesBeyondWindow: [
        {
          name: 'Yangon',
          country: 'MM',
          distanceKm: 366,
          type: 'city',
          population: 7_400_000,
          currentlyUpwind: true,
        },
      ],
    },
  },
};
