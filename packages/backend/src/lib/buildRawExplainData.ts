import type { RawExplainData, Season, FixtureUpwindSource } from '../scripts/eval/types.js';
import type { StationWeatherRecord } from './fetchExplainContext.js';
import type { PeerAnalysis } from './analyzePeers.js';

const BKK_OFFSET_MS = 7 * 3600_000; // UTC+7

type SourceInput = {
  name: string;
  country: string;
  distKm: number;
  type: string;
  population: number;
  emissionProxy: number;
  isUpwind: boolean;
};

type FireBucket = { count: number; totalFrpMw: number };

export interface BuildRawExplainDataInput {
  station: { name: string; lat: number; lng: number };
  selectedDate: string;
  stationReadings: { value: number; measured_at: string }[];

  d0: string;
  d1: string;
  d2: string;
  d3: string;
  d4: string;
  stationWeatherByDate: Map<string, StationWeatherRecord>;
  totalPrecipitationMm: number;
  trajectoryPrecipitationMm: number | null;

  trajectory: {
    hoursTraced: number;
    origin: { lat: number; lng: number; region: string; date: string };
    corridorWidthKm: number;
    meanWindSpeedKmh: number;
    waypoints: { lat: number; lng: number; region: string }[];
    camsAlongPath: { lat: number; lng: number; date: string; pm25: number }[];
  } | null;

  firePressure: {
    pathScore: number;
    pathFireCount: number;
    last24h: FireBucket;
    last48h: FireBucket;
    last72h: FireBucket;
    topFires: { lat: number; lng: number; distKm: number; frpMw: number; ageH: number }[];
    areaScore: number;
    areaFireCount: number | null;
    areaTotalFrpMw: number | null;
  };

  upwindSources: SourceInput[];
  peers: PeerAnalysis;
  outlier: { direction: 'high' | 'low'; ratio: number } | null;

  persistentWind: {
    directionDeg: number;
    label: string;
    dayCount: number;
    sourcesBeyondWindow: SourceInput[];
  } | null;
}

function getSeason(date: string): Season {
  const month = new Date(date).getUTCMonth() + 1;
  if (month >= 2 && month <= 4) return 'peak_burning';
  if (month >= 10 || month <= 1) return 'early_dry';
  return 'monsoon';
}

function mapSourceType(t: string): FixtureUpwindSource['type'] {
  if (t === 'megacity' || t === 'city') return 'city';
  if (t === 'industrial') return 'industrial';
  return 'coal_plant';
}

function buildSource(s: SourceInput): FixtureUpwindSource {
  return {
    name: s.name,
    country: s.country,
    distanceKm: s.distKm,
    type: mapSourceType(s.type),
    population: s.population > 0 ? s.population : undefined,
    capacityMw: s.type === 'power_plant' && s.emissionProxy > 0 ? s.emissionProxy : undefined,
    currentlyUpwind: s.isUpwind,
  };
}

function buildWeatherDay(date: string, wx: StationWeatherRecord | null) {
  const windState =
    wx === null
      ? ('not_fetched' as const)
      : wx.wind_speed_kmh !== null
        ? ('available' as const)
        : ('missing' as const);
  return {
    date,
    wind: {
      state: windState,
      directionDeg: wx?.wind_direction_deg ?? null,
      speedKmh: wx?.wind_speed_kmh ?? null,
    },
    precipitationMm: wx?.precipitation_sum ?? 0,
    humidity: wx?.relative_humidity_2m ?? null,
    highHumidityWarning: (wx?.relative_humidity_2m ?? 0) >= 85,
  };
}

export function buildRawExplainData(input: BuildRawExplainDataInput): RawExplainData {
  const {
    station,
    selectedDate,
    stationReadings,
    d0,
    d1,
    d2,
    d3,
    d4,
    stationWeatherByDate,
    totalPrecipitationMm,
    trajectoryPrecipitationMm,
    trajectory,
    firePressure,
    upwindSources,
    peers,
    outlier,
    persistentWind,
  } = input;

  // Daily averages grouped by BKK calendar day
  const dailyMap = new Map<string, number[]>();
  for (const row of stationReadings) {
    const bkkDate = new Date(new Date(row.measured_at).getTime() + BKK_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
    if (!dailyMap.has(bkkDate)) dailyMap.set(bkkDate, []);
    dailyMap.get(bkkDate)!.push(row.value);
  }
  const sevenDayAverages = [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vals]) => ({ date, value: vals.reduce((s, v) => s + v, 0) / vals.length }));

  const wx = (d: string) => stationWeatherByDate.get(d) ?? null;

  const {
    peerList,
    peerMedian,
    peerWeightedMean,
    outlierRatio,
    nonOutlierPeers,
    filteredPeerMin,
    filteredPeerMax,
    peerDistribution,
  } = peers;

  return {
    station,
    date: selectedDate,
    currentPm25: stationReadings[0].value,

    sevenDayAverages,

    weather: {
      days: [
        buildWeatherDay(d0, wx(d0)),
        buildWeatherDay(d1, wx(d1)),
        buildWeatherDay(d2, wx(d2)),
        buildWeatherDay(d3, wx(d3)),
        buildWeatherDay(d4, wx(d4)),
      ],
      totalPrecipitationMm,
      trajectoryPrecipitationMm,
    },

    trajectory: trajectory
      ? {
          hoursTraced: trajectory.hoursTraced,
          memberCount: 5,
          origin: trajectory.origin,
          corridorWidthKm: trajectory.corridorWidthKm,
          meanWindSpeedKmh: trajectory.meanWindSpeedKmh,
          waypoints: trajectory.waypoints,
          camsAlongPath: trajectory.camsAlongPath,
        }
      : null,

    firePressure: {
      pathScore: firePressure.pathScore,
      pathFireCount: firePressure.pathFireCount,
      pathFiresByRecency: {
        last24h: firePressure.last24h,
        last48h: firePressure.last48h,
        last72h: firePressure.last72h,
      },
      topFires: firePressure.topFires,
      areaScore: firePressure.areaScore,
      areaFireCount: firePressure.areaFireCount,
      areaTotalFrpMw: firePressure.areaTotalFrpMw,
    },

    upwindSources: upwindSources.map(buildSource),

    peers:
      peerList.length === 0 || filteredPeerMin === null || filteredPeerMax === null
        ? null
        : {
            stationCount: peerList.length,
            weightedMean: peerWeightedMean,
            unweightedMedian: peerMedian,
            range: { min: filteredPeerMin, max: filteredPeerMax },
            stations: nonOutlierPeers
              .sort((a, b) => a.distKm - b.distKm)
              .slice(0, 10)
              .map((p) => ({ name: p.name, value: p.pm25, distanceKm: p.distKm })),
            distribution: peerDistribution,
          },

    outlier: outlier ? { direction: outlier.direction, ratio: outlierRatio ?? 0 } : null,

    season: getSeason(selectedDate),

    persistentWind: persistentWind
      ? {
          directionDeg: persistentWind.directionDeg,
          label: persistentWind.label,
          dayCount: persistentWind.dayCount,
          sourcesBeyondWindow: persistentWind.sourcesBeyondWindow.map(buildSource),
        }
      : null,
  };
}
