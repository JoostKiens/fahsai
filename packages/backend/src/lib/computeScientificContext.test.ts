import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRedisGet,
  mockRedisSet,
  mockFetchExplainContext,
  mockFetchAllPages,
  mockTraceEnsemble,
  mockAnalyzePeers,
  mockComputeFirePressureNorm,
  mockBuildRawExplainData,
  mockBuildScientificContext,
  mockBangkokDateString,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockFetchExplainContext: vi.fn(),
  mockFetchAllPages: vi.fn(),
  mockTraceEnsemble: vi.fn(),
  mockAnalyzePeers: vi.fn(),
  mockComputeFirePressureNorm: vi.fn(),
  mockBuildRawExplainData: vi.fn(),
  mockBuildScientificContext: vi.fn(),
  mockBangkokDateString: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock('../cache/client.js', () => ({
  redis: { get: mockRedisGet, set: mockRedisSet },
  HISTORICAL_TTL_SECONDS: 604800,
}));

vi.mock('../db/client.js', () => ({ supabase: {} }));

vi.mock('../utils/backfill.js', () => ({ fetchAllPages: mockFetchAllPages }));

vi.mock('../utils/trajectory.js', () => ({
  traceEnsemble: mockTraceEnsemble,
  nearestGridPoint: (_lat: number, _lng: number, grid: unknown[]) => grid[0],
  offsetDate: (dateStr: string, days: number) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  },
  TRAJECTORY_STEPS: 12,
}));

vi.mock('../utils/bkkDate.js', () => ({
  bangkokDateString: mockBangkokDateString,
  bangkokMidnightIso: (dateStr: string) => `${dateStr}T00:00:00+07:00`,
}));

vi.mock('../utils/firePressure.js', () => ({
  computeFirePressureNorm: mockComputeFirePressureNorm,
}));

vi.mock('./fetchExplainContext.js', () => ({ fetchExplainContext: mockFetchExplainContext }));
vi.mock('./analyzePeers.js', () => ({ analyzePeers: mockAnalyzePeers }));
vi.mock('./buildRawExplainData.js', () => ({ buildRawExplainData: mockBuildRawExplainData }));
vi.mock('./buildScientificContext.js', () => ({
  buildScientificContext: mockBuildScientificContext,
}));
vi.mock('./logger.js', () => ({ logger: { info: vi.fn(), warn: mockLoggerWarn, error: vi.fn() } }));

import { computeScientificContext } from './computeScientificContext.js';

const STATION_ID = 'station-1';
const LAT = 13.75;
const LNG = 100.5;
const TODAY = '2026-08-04';
const PAST_DATE = '2026-08-01';

function buildExplainContextFixture() {
  const windPoint = { lat: LAT, lng: LNG, wind_speed_kmh: 10, wind_direction_deg: 90 };
  return {
    anchorEndMs: Date.UTC(2026, 7, 2),
    since72h: '2026-07-30T00:00:00.000Z',
    d0: PAST_DATE,
    d1: '2026-07-31',
    d2: '2026-07-30',
    d3: '2026-07-29',
    d4: '2026-07-28',
    stationName: 'Test Station',
    stationReadings: [{ value: 42, measured_at: '2026-08-01T12:00:00Z' }],
    peerRows: [],
    stationWeatherByDate: new Map(),
    wind0: [windPoint],
    wind1: [windPoint],
    wind2: [windPoint],
    camsD0: [],
    camsD1: [],
    camsD2: [],
    pressureData: null,
    baseline: null,
  };
}

function buildEnsembleFixture(date: string) {
  const centerTrajectory = [
    { lat: LAT, lng: LNG, date, stepIndex: 0 },
    { lat: LAT, lng: LNG, date, stepIndex: 1 },
  ];
  return {
    members: [centerTrajectory],
    footprintBbox: { latMin: LAT - 1, latMax: LAT + 1, lngMin: LNG - 1, lngMax: LNG + 1 },
    corridorKm: 50,
    meanWindSpeedKmh: 10,
  };
}

const PEER_ANALYSIS_FIXTURE = {
  peerList: [],
  peerMedian: 0,
  peerWeightedMean: 0,
  outlierRatio: null,
  isStrongOutlier: false,
  isHighOutlier: false,
  nonOutlierPeers: [],
  filteredPeerMin: null,
  filteredPeerMax: null,
  peerDistribution: null,
};

const SCIENTIFIC_CONTEXT_FIXTURE = { station: { name: 'Test Station', lat: LAT, lng: LNG } };

beforeEach(() => {
  vi.clearAllMocks();
  mockBangkokDateString.mockReturnValue(TODAY);
  mockFetchAllPages.mockResolvedValue([]);
  mockAnalyzePeers.mockReturnValue(PEER_ANALYSIS_FIXTURE);
  mockComputeFirePressureNorm.mockReturnValue(0);
  mockBuildRawExplainData.mockReturnValue({ fixture: true });
  mockBuildScientificContext.mockReturnValue(SCIENTIFIC_CONTEXT_FIXTURE);
});

describe('computeScientificContext', () => {
  it('returns the cached context on a cache hit for a past date', async () => {
    mockRedisGet.mockResolvedValue(SCIENTIFIC_CONTEXT_FIXTURE);

    const result = await computeScientificContext(STATION_ID, LAT, LNG, PAST_DATE);

    expect(result).toBe(SCIENTIFIC_CONTEXT_FIXTURE);
    expect(mockRedisGet).toHaveBeenCalledWith(`explain:context:v1:${STATION_ID}:${PAST_DATE}`);
    expect(mockFetchExplainContext).not.toHaveBeenCalled();
  });

  it('computes and writes to cache on a cache miss for a past date', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFetchExplainContext.mockResolvedValue(buildExplainContextFixture());
    mockTraceEnsemble.mockReturnValue(buildEnsembleFixture(PAST_DATE));

    const result = await computeScientificContext(STATION_ID, LAT, LNG, PAST_DATE);

    expect(result).toBe(SCIENTIFIC_CONTEXT_FIXTURE);
    expect(mockRedisSet).toHaveBeenCalledWith(
      `explain:context:v1:${STATION_ID}:${PAST_DATE}`,
      SCIENTIFIC_CONTEXT_FIXTURE,
      { ex: 604800 },
    );
  });

  it('recomputes when the cache read fails', async () => {
    mockRedisGet.mockRejectedValue(new Error('Upstash unavailable'));
    mockFetchExplainContext.mockResolvedValue(buildExplainContextFixture());
    mockTraceEnsemble.mockReturnValue(buildEnsembleFixture(PAST_DATE));

    const result = await computeScientificContext(STATION_ID, LAT, LNG, PAST_DATE);

    expect(result).toBe(SCIENTIFIC_CONTEXT_FIXTURE);
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('still returns the computed context when the cache write fails', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockRejectedValue(new Error('Upstash unavailable'));
    mockFetchExplainContext.mockResolvedValue(buildExplainContextFixture());
    mockTraceEnsemble.mockReturnValue(buildEnsembleFixture(PAST_DATE));

    const result = await computeScientificContext(STATION_ID, LAT, LNG, PAST_DATE);

    expect(result).toBe(SCIENTIFIC_CONTEXT_FIXTURE);
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('never reads or writes the cache for today', async () => {
    mockFetchExplainContext.mockResolvedValue(buildExplainContextFixture());
    mockTraceEnsemble.mockReturnValue(buildEnsembleFixture(TODAY));

    const result = await computeScientificContext(STATION_ID, LAT, LNG, TODAY);

    expect(result).toBe(SCIENTIFIC_CONTEXT_FIXTURE);
    expect(mockRedisGet).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it('degrades gracefully when the fire-points query fails', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFetchExplainContext.mockResolvedValue(buildExplainContextFixture());
    mockTraceEnsemble.mockReturnValue(buildEnsembleFixture(PAST_DATE));
    mockFetchAllPages.mockRejectedValue(new Error('fire_points query failed'));

    const result = await computeScientificContext(STATION_ID, LAT, LNG, PAST_DATE);

    expect(result).toBe(SCIENTIFIC_CONTEXT_FIXTURE);
    expect(mockLoggerWarn).toHaveBeenCalled();
    const rawInput = mockBuildRawExplainData.mock.calls[0][0] as {
      firePressure: { pathFireCount: number };
    };
    expect(rawInput.firePressure.pathFireCount).toBe(0);
    expect(mockRedisSet).toHaveBeenCalled();
  });

  it('returns null when the station has no readings for that date', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFetchExplainContext.mockResolvedValue(null);

    const result = await computeScientificContext(STATION_ID, LAT, LNG, PAST_DATE);

    expect(result).toBeNull();
    expect(mockBuildScientificContext).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });
});
