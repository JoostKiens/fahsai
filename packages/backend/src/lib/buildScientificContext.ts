import { compassFromDeg } from '../utils/geo.js';
import { classifyCase } from '../utils/classify.js';
import type { ClassifyParams } from '../utils/classify.js';
import type { ExplainCase } from '../routes/explain.js';
import type { RawExplainData, FixtureUpwindSource } from '../scripts/eval/types.js';
import { BASELINE_DISPLAY_GATE, classifyReading, dateToPeriodKey } from '@thailand-aq/types';
import type { BaselineCategory, PeriodKey } from '@thailand-aq/types';

// Re-export for buildPrompt.ts
export type { ExplainCase };

// ----------------------------------------------------------------
// AQI helpers — exported so buildPrompt can use them without duplication
// ----------------------------------------------------------------

const AQI_BP = [12.0, 35.4, 55.4, 150.4, 250.4];
const AQI_LABELS = [
  'Good',
  'Moderate',
  'Unhealthy for sensitive groups',
  'Unhealthy',
  'Very unhealthy',
  'Hazardous',
];

export function pm25Cat(pm25: number): string {
  for (let i = 0; i < AQI_BP.length; i++) {
    if (pm25 <= AQI_BP[i]) return AQI_LABELS[i];
  }
  return AQI_LABELS[AQI_LABELS.length - 1];
}

export function firePressureLabel(score: number): string {
  if (score === 0) return 'None';
  if (score < 15) return 'Low';
  if (score < 40) return 'Moderate';
  if (score < 60) return 'High';
  return 'Very high';
}

// ----------------------------------------------------------------
// ScientificContext — the typed intermediate representation
// buildPrompt only depends on this type, not on RawExplainData.
// ----------------------------------------------------------------

export type TierSource = Omit<FixtureUpwindSource, 'currentlyUpwind'>;

export interface ScientificContext {
  station: { name: string; lat: number; lng: number };
  currentPm25: number;
  aqiCategory: string;
  explainCase: ExplainCase;
  date: string;

  sevenDayAverages: { date: string; value: number; category: string }[];

  wind: {
    // Only days with wind data available, newest first, up to 3
    days: { date: string; directionLabel: string; speedKmh: number }[];
  };

  weatherContext: {
    days: {
      date: string;
      precipitationMm: number;
      humidity: number | null;
      highHumidityWarning: boolean;
    }[];
    totalPrecipitationMm: number;
    trajectoryPrecipitationMm: number;
    availableDayCount: number;
  };

  persistentWind: {
    label: string;
    dayCount: number;
    sourcesBeyondWindow: TierSource[];
  } | null;

  // null for OUTLIER_HIGH and OUTLIER_LOW — transport data not relevant
  transport: {
    trajectory: {
      hoursTraced: number;
      origin: { lat: number; lng: number; region: string; date: string };
      corridorWidthKm: number;
      meanWindSpeedKmh: number;
      waypoints: { lat: number; lng: number; region: string }[];
      originIsWater: boolean;
    };
    cams: {
      samples: { lat: number; lng: number; date: string; pm25: number; category: string }[];
      maxPm25: number | null;
      suppressionActive: boolean;
      stationExceedsCamsMax: boolean; // true when station PM2.5 exceeds peak modelled value by >20 µg/m³
    };
    fire: {
      pathScore: number;
      pathFireCount: number;
      recency: {
        last24h: { count: number; totalFrpMw: number };
        last48h: { count: number; totalFrpMw: number };
        last72h: { count: number; totalFrpMw: number };
      } | null;
      nearestFireDistKm: number | null;
      areaScore: number;
      areaFireCount: number | null;
      areaTotalFrpMw: number | null;
      firesAreLocal: boolean;
      areaFireRadiusKm: number;
    };
  } | null;

  upwindSources: {
    tier1: TierSource[];
    tier2: TierSource[];
  };

  // Always populated — area fire pressure is a 14-day grid score independent of trajectory
  areaFirePressure: {
    score: number;
    fireCount: number | null;
    totalFrpMw: number | null;
  } | null;

  trend: { direction: 'rising' | 'falling' | 'stable'; isSignificant: boolean } | null;

  peers: {
    stationCount: number;
    weightedMean: number;
    unweightedMedian: number;
    range: { min: number; max: number } | null;
    distribution: string | null;
    stations: { name: string; value: number; distanceKm: number }[];
  } | null;

  outlier:
    | { type: 'HIGH'; ratio: number; peerTier: 1 | 2 | 3 }
    | { type: 'LOW'; ratio: number }
    | null;

  seasonContext: string;

  // null when baseline data is thin (n < BASELINE_DISPLAY_GATE) or the reading is
  // normal for the season — the model never needs to be told a reading is unremarkable
  stationBaseline: {
    category: Exclude<BaselineCategory, 'normal'>;
    typicalLow: number;
    typicalHigh: number;
    periodLabel: string;
  } | null;
}

const WATER_REGION_KEYWORDS = [
  'gulf',
  'sea',
  'ocean',
  'strait',
  'bay',
  'andaman',
  'malacca',
  'indian',
  'pacific',
  'south china',
  'bengal',
];

const PERIOD_LABEL_PREFIX: Record<PeriodKey, string> = {
  periodEarly: 'early ',
  periodMid: 'mid-',
  periodLate: 'late ',
};

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function regionalCrisisFraction(peers: ScientificContext['peers'] & object): number {
  const { stationCount, distribution, stations } = peers;
  if (stationCount === 0) return 0;
  if (distribution !== null) {
    const haz = parseInt(/(\d+) Hazardous/.exec(distribution)?.[1] ?? '0', 10);
    const veryUnhealthy = parseInt(/(\d+) Very unhealthy/.exec(distribution)?.[1] ?? '0', 10);
    return (haz + veryUnhealthy) / stationCount;
  }
  return stations.filter((s) => s.value > 150.4).length / stationCount;
}

function computeTrend(
  sevenDayAverages: { date: string; value: number }[],
  currentPm25: number,
): { direction: 'rising' | 'falling' | 'stable'; isSignificant: boolean } | null {
  if (sevenDayAverages.length < 3) return null;
  const avgs = sevenDayAverages.map((d) => d.value);
  const latest = avgs[avgs.length - 1];
  const yesterday = avgs[avgs.length - 2];
  if (yesterday === 0) return { direction: 'stable', isSignificant: false };
  const ratio = latest / yesterday;
  const direction: 'rising' | 'falling' | 'stable' =
    ratio > 1.1 ? 'rising' : ratio < 0.9 ? 'falling' : 'stable';
  // A trend at Good air quality levels (< 12 µg/m³) carries no public-health narrative.
  if (currentPm25 < 12) return { direction, isSignificant: false };
  const isSignificant = (() => {
    if (direction === 'stable') return false;
    // Exclude yesterday from the historical window — it already drives the direction
    // ratio above, so including it in Math.min/max would let a single-day sensor dip
    // both flip the direction and pull the trough/peak, compounding into a false
    // significant trend.
    const prior = avgs.slice(0, -2);
    if (prior.length === 0) return false;
    if (direction === 'rising') {
      const trough = Math.min(...prior);
      return trough > 0 && (latest - trough) / trough > 0.25;
    }
    const peak = Math.max(...prior);
    return peak > 0 && (peak - latest) / peak > 0.25;
  })();
  return { direction, isSignificant };
}

function periodLabel(date: string): string {
  const dayOfMonth = Number(date.slice(8, 10));
  const monthName = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${PERIOD_LABEL_PREFIX[dateToPeriodKey(dayOfMonth)]}${monthName}`;
}

function computeStationBaseline(
  baseline: RawExplainData['baseline'],
  date: string,
  currentPm25: number,
): ScientificContext['stationBaseline'] {
  if (!baseline || baseline.n < BASELINE_DISPLAY_GATE) return null;
  const category = classifyReading(currentPm25, baseline);
  if (category === 'normal') return null;
  return {
    category,
    typicalLow: baseline.p25Pm25,
    typicalHigh: baseline.p75Pm25,
    periodLabel: periodLabel(date),
  };
}

function computeSourceTiers(
  sources: FixtureUpwindSource[] | null,
  firePressureNorm: number,
  areaScore: number,
  explainCase: ExplainCase,
): { tier1: TierSource[]; tier2: TierSource[] } {
  if (!sources?.length) return { tier1: [], tier2: [] };
  if (explainCase === 'OUTLIER_HIGH' || explainCase === 'OUTLIER_LOW') {
    return { tier1: [], tier2: [] };
  }

  // Fire exception: when high fire pressure with no local fires, distant urban sources are noise
  const fireExceptionActive = firePressureNorm >= 70 && areaScore < 20;

  const tier1: TierSource[] = [];
  const tier2: TierSource[] = [];

  for (const s of sources) {
    if (s.currentlyUpwind && s.distanceKm <= 150) {
      if (fireExceptionActive && s.distanceKm > 50) continue;
      tier1.push(toTierSource(s));
    } else if (!s.currentlyUpwind && s.distanceKm <= 20) {
      tier2.push(toTierSource(s));
    }
    // tier 3: omit
  }

  tier1.sort((a, b) => a.distanceKm - b.distanceKm);

  return { tier1, tier2 };
}

function toTierSource(s: FixtureUpwindSource): TierSource {
  // FixtureUpwindSource is a structural superset of TierSource; the extra field is dropped at type level
  return s as TierSource;
}

// ----------------------------------------------------------------
// Main export
// ----------------------------------------------------------------

export function buildScientificContext(raw: RawExplainData): ScientificContext {
  const isStrongOutlier = raw.outlier !== null;
  const isHighOutlier = raw.outlier !== null && raw.outlier.direction === 'high';

  const firePressureNorm = raw.firePressure?.pathScore ?? 0;
  const areaScore = raw.firePressure?.areaScore ?? 0;
  const camsMaxPm25 = raw.trajectory?.camsAlongPath.length
    ? Math.max(...raw.trajectory.camsAlongPath.map((c) => c.pm25))
    : null;

  const originRegion = raw.trajectory?.origin.region?.toLowerCase() ?? '';
  const originIsWater = WATER_REGION_KEYWORDS.some((kw) => originRegion.includes(kw));

  const explainCase = classifyCase({
    isStrongOutlier,
    isHighOutlier,
    firePressureNorm,
    areaScore,
    camsMaxPm25,
    latestPm25: raw.currentPm25,
    trajectoryPrecipTotal: raw.weather.trajectoryPrecipitationMm ?? 0,
    relevantSources: (raw.upwindSources ?? []).map((s) => ({
      isUpwind: s.currentlyUpwind,
      distKm: s.distanceKm,
    })),
    peerWeightedMean: raw.peers?.weightedMean ?? null,
    originIsWater,
  } satisfies ClassifyParams);
  const { tier1, tier2 } = computeSourceTiers(
    raw.upwindSources,
    firePressureNorm,
    areaScore,
    explainCase,
  );

  const topFires = raw.firePressure?.topFires;
  const nearestFireDistKm =
    topFires && topFires.length > 0 ? Math.min(...topFires.map((f) => f.distKm)) : null;

  const suppressionActive = camsMaxPm25 !== null && camsMaxPm25 < 25 && firePressureNorm >= 40;
  const firesAreLocal = areaScore >= 20;

  let trend = computeTrend(raw.sevenDayAverages, raw.currentPm25);

  const seasonContext = {
    peak_burning:
      'Peak dry season and agricultural burning season in mainland Southeast Asia (Feb–Apr). Smoke can transport hundreds of kilometres under stable, low-wind conditions.',
    early_dry:
      'Early or late dry season in mainland Southeast Asia (Oct–Jan). Agricultural burning is beginning or winding down; fire activity is lower than peak.',
    monsoon:
      'Monsoon season in mainland Southeast Asia (May–Sep). Fire activity is low; elevated PM2.5 is more likely from urban/industrial sources or stagnant air pockets.',
  }[raw.season];

  const windDays = raw.weather.days
    .filter((d) => d.wind.state === 'available')
    .slice(0, 3)
    .map((d) => ({
      date: d.date,
      directionLabel: compassFromDeg(d.wind.directionDeg!),
      speedKmh: d.wind.speedKmh!,
    }));

  const weatherContext = {
    days: raw.weather.days.map((d) => ({
      date: d.date,
      precipitationMm: d.precipitationMm,
      humidity: d.humidity,
      highHumidityWarning: d.highHumidityWarning,
    })),
    totalPrecipitationMm: raw.weather.totalPrecipitationMm,
    trajectoryPrecipitationMm: raw.weather.trajectoryPrecipitationMm ?? 0,
    availableDayCount: raw.weather.days.length,
  };

  const persistentWind = raw.persistentWind
    ? {
        label: raw.persistentWind.label,
        dayCount: raw.persistentWind.dayCount,
        sourcesBeyondWindow: raw.persistentWind.sourcesBeyondWindow.map(toTierSource),
      }
    : null;

  let transport: ScientificContext['transport'] = null;
  if (!isStrongOutlier && raw.trajectory && raw.firePressure) {
    const traj = raw.trajectory;
    const fp = raw.firePressure;
    transport = {
      trajectory: {
        hoursTraced: traj.hoursTraced,
        origin: traj.origin,
        corridorWidthKm: traj.corridorWidthKm,
        meanWindSpeedKmh: traj.meanWindSpeedKmh,
        waypoints: traj.waypoints,
        originIsWater,
      },
      cams: {
        samples: traj.camsAlongPath.map((c) => ({ ...c, category: pm25Cat(c.pm25) })),
        maxPm25: camsMaxPm25,
        suppressionActive,
        stationExceedsCamsMax: camsMaxPm25 !== null && raw.currentPm25 - camsMaxPm25 > 20,
      },
      fire: {
        pathScore: fp.pathScore ?? 0,
        pathFireCount: fp.pathFireCount ?? 0,
        recency: fp.pathFiresByRecency,
        nearestFireDistKm,
        areaScore,
        areaFireCount: fp.areaFireCount,
        areaTotalFrpMw: fp.areaTotalFrpMw,
        firesAreLocal,
        areaFireRadiusKm: 75,
      },
    };
  }

  const peers = raw.peers
    ? {
        stationCount: raw.peers.stationCount,
        weightedMean: raw.peers.weightedMean,
        unweightedMedian: raw.peers.unweightedMedian,
        range: raw.peers.range ?? null,
        distribution: raw.peers.distribution ?? null,
        stations: raw.peers.stations.map((s) => ({
          name: s.name,
          value: s.value,
          distanceKm: s.distanceKm,
        })),
      }
    : null;

  if (
    trend !== null &&
    trend.isSignificant &&
    explainCase === 'PLAUSIBLE_FIRE_TRANSPORT' &&
    firesAreLocal &&
    peers !== null &&
    regionalCrisisFraction(peers) > 0.5
  ) {
    trend = { ...trend, isSignificant: false };
  }

  const peerWeightedMean = raw.peers?.weightedMean ?? 0;
  const peerTier: 1 | 2 | 3 = peerWeightedMean < 55 ? 1 : peerWeightedMean < 150 ? 2 : 3;
  const outlier =
    raw.outlier !== null
      ? raw.outlier.direction === 'high'
        ? { type: 'HIGH' as const, ratio: raw.outlier.ratio, peerTier }
        : { type: 'LOW' as const, ratio: raw.outlier.ratio }
      : null;

  const stationBaseline = computeStationBaseline(raw.baseline, raw.date, raw.currentPm25);

  return {
    station: raw.station,
    currentPm25: raw.currentPm25,
    aqiCategory: pm25Cat(raw.currentPm25),
    explainCase,
    date: raw.date,
    sevenDayAverages: raw.sevenDayAverages.map((d) => ({
      date: d.date,
      value: d.value,
      category: pm25Cat(d.value),
    })),
    wind: { days: windDays },
    weatherContext,
    persistentWind,
    transport,
    upwindSources: { tier1, tier2 },
    areaFirePressure: raw.firePressure
      ? {
          score: raw.firePressure.areaScore,
          fireCount: raw.firePressure.areaFireCount,
          totalFrpMw: raw.firePressure.areaTotalFrpMw,
        }
      : null,
    trend,
    peers,
    outlier,
    seasonContext,
    stationBaseline,
  };
}
