import type { ScientificContext } from '../../lib/buildScientificContext.js';

const FULL_PEERS = {
  stationCount: 3,
  weightedMean: 84.1,
  unweightedMedian: 83,
  range: { min: 70, max: 95 },
  distribution: 'tight',
  stations: [{ name: 'Peer One', value: 80, distanceKm: 12.5 }],
};

// A context with every branch filled in: transport, persistent wind, sources of each kind (a city
// with a population, a plant with a capacity), peers, a trend and a baseline.
export const FULL_CONTEXT: ScientificContext = {
  station: { name: 'Test Station', lat: 18.79, lng: 98.98 },
  currentPm25: 87.5,
  aqiCategory: 'Unhealthy',
  explainCase: 'PLAUSIBLE_FIRE_TRANSPORT',
  date: '2026-03-14',
  sevenDayAverages: [
    { date: '2026-03-13', value: 80.2, category: 'Unhealthy' },
    { date: '2026-03-12', value: 64, category: 'Unhealthy for sensitive groups' },
  ],
  wind: { days: [{ date: '2026-03-14', directionLabel: 'NNE', speedKmh: 12.4 }] },
  weatherContext: {
    days: [
      { date: '2026-03-14', precipitationMm: 0, humidity: 41, highHumidityWarning: false },
      { date: '2026-03-13', precipitationMm: 1.2, humidity: null, highHumidityWarning: false },
    ],
    totalPrecipitationMm: 1.2,
    trajectoryPrecipitationMm: 0,
    availableDayCount: 2,
  },
  persistentWind: {
    label: 'NNE',
    dayCount: 3,
    sourcesBeyondWindow: [
      {
        name: 'Mae Moh',
        country: 'TH',
        distanceKm: 120,
        type: 'coal_plant',
        capacityMw: 2400,
        currentlyUpwind: false,
      },
    ],
  },
  transport: {
    trajectory: {
      hoursTraced: 48,
      origin: { lat: 20.5, lng: 99.5, region: 'Shan State, Myanmar', date: '2026-03-12' },
      corridorWidthKm: 60,
      meanWindSpeedKmh: 11.8,
      waypoints: [
        { lat: 19.9, lng: 99.2, region: 'Chiang Rai, Thailand' },
        { lat: 19.2, lng: 99, region: 'Chiang Mai, Thailand' },
      ],
      originIsWater: false,
    },
    cams: {
      samples: [{ lat: 19.5, lng: 99.2, date: '2026-03-13', pm25: 92.3, category: 'Unhealthy' }],
      maxPm25: 92.3,
      suppressionActive: false,
      stationExceedsCamsMax: false,
    },
    fire: {
      pathScore: 51.2,
      pathFireCount: 34,
      recency: {
        last24h: { count: 12, totalFrpMw: 210.5 },
        last48h: { count: 25, totalFrpMw: 420 },
        last72h: { count: 31, totalFrpMw: 540.2 },
      },
      nearestFireDistKm: 18.4,
      areaScore: 42.1,
      areaFireCount: 12,
      areaTotalFrpMw: 310.5,
      firesAreLocal: false,
      areaFireRadiusKm: 75,
    },
  },
  upwindSources: {
    tier1: [
      {
        name: 'Chiang Mai',
        country: 'TH',
        distanceKm: 40,
        type: 'city',
        population: 127000,
        currentlyUpwind: true,
      },
    ],
    tier2: [],
  },
  areaFirePressure: { score: 42.1, fireCount: 12, totalFrpMw: 310.5 },
  trend: { direction: 'rising', isSignificant: true },
  peers: FULL_PEERS,
  outlier: null,
  seasonContext: 'peak burning season',
  stationBaseline: {
    category: 'above',
    typicalLow: 30,
    typicalHigh: 55,
    periodLabel: 'mid-March',
  },
};

// The same reading with every optional part missing, as for an outlier or a station with no peers.
export const SPARSE_CONTEXT: ScientificContext = {
  ...FULL_CONTEXT,
  explainCase: 'OUTLIER_LOW',
  persistentWind: null,
  transport: null,
  areaFirePressure: null,
  trend: null,
  peers: null,
  outlier: { type: 'LOW', ratio: 0.2 },
  stationBaseline: null,
  upwindSources: { tier1: [], tier2: [] },
};

export const HIGH_OUTLIER_CONTEXT: ScientificContext = {
  ...FULL_CONTEXT,
  explainCase: 'OUTLIER_HIGH',
  outlier: { type: 'HIGH', ratio: 3.1, peerTier: 2 },
  peers: { ...FULL_PEERS, range: null, distribution: null },
};
