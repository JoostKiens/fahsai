import { setTimeout as sleep } from 'node:timers/promises';
import pRetry, { AbortError } from 'p-retry';
import { describeFetchError } from './fetchError.js';

const ADS_BASE_URL = 'https://ads.atmosphere.copernicus.eu/api/retrieve/v1';
const PROCESS = 'cams-global-atmospheric-composition-forecasts';

// [north, west, south, east]. One ring wider than our grid (89 to 114°E, 1 to 30°N): our points
// sit 0.2° off the CAMS nodes, so the edge points need the cell beyond them.
export const CAMS_AREA = [30.4, 88.8, 0.8, 114] as const;

// The 12 UTC run, hours 5 to 28, covers one Bangkok day (17:00 UTC the day before to 16:00 UTC).
const RUN_TIME = '12:00';
const FIRST_LEAD_HOUR = 5;
const LEAD_HOUR_COUNT = 24;

const FAILED_STATUSES = ['failed', 'rejected', 'dismissed'];
const ERROR_BODY_MAX_CHARS = 200;

export class AdsHttpError extends Error {
  constructor(
    public readonly status: number,
    body: string,
  ) {
    super(`ADS HTTP ${status}: ${body.slice(0, ERROR_BODY_MAX_CHARS)}`);
    this.name = 'AdsHttpError';
  }
}

export class AdsJobError extends Error {
  constructor(status: string, detail: string) {
    super(`ADS job ${status}: ${detail}`);
    this.name = 'AdsJobError';
  }
}

export class AdsTimeoutError extends Error {
  constructor(pollTimeoutMs: number) {
    super(`ADS job did not finish within ${pollTimeoutMs} ms`);
    this.name = 'AdsTimeoutError';
  }
}

export type FetchCamsGribOptions = {
  /** Bangkok day to fetch, YYYY-MM-DD. */
  date: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  downloadTimeoutMs?: number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

/** The day before the Bangkok day: the 12 UTC run of that day covers it. */
export function camsRunDate(bangkokDate: string): string {
  const run = new Date(`${bangkokDate}T00:00:00Z`);
  run.setUTCDate(run.getUTCDate() - 1);
  return run.toISOString().slice(0, 10);
}

export function buildRequestBody(bangkokDate: string) {
  const runDate = camsRunDate(bangkokDate);
  return {
    inputs: {
      variable: ['particulate_matter_2.5um'],
      date: [`${runDate}/${runDate}`],
      time: [RUN_TIME],
      leadtime_hour: Array.from({ length: LEAD_HOUR_COUNT }, (_, i) => String(FIRST_LEAD_HOUR + i)),
      type: ['forecast'],
      data_format: 'grib',
      area: [...CAMS_AREA],
    },
  };
}

/** Submits the request, waits for the job and returns the GRIB file. */
export async function fetchCamsGrib({
  date,
  apiKey,
  fetchImpl = fetch,
  requestTimeoutMs = 30_000,
  downloadTimeoutMs = 120_000,
  pollIntervalMs = 5_000,
  pollTimeoutMs = 10 * 60_000,
  retries = 3,
  retryDelayMs = 2_000,
}: FetchCamsGribOptions): Promise<Buffer> {
  const adsHeaders = { 'PRIVATE-TOKEN': apiKey, 'Content-Type': 'application/json' };

  function call<T>(
    label: string,
    url: string,
    init: RequestInit,
    timeoutMs: number,
    read: (res: Response) => Promise<T>,
  ): Promise<T> {
    return pRetry(
      async () => {
        const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) {
          const error = new AdsHttpError(res.status, await res.text());
          // Client errors (bad key, bad request) will not change on a retry; 429 will.
          if (res.status < 500 && res.status !== 429) throw new AbortError(error);
          throw error;
        }
        return read(res);
      },
      {
        retries,
        minTimeout: retryDelayMs,
        factor: 2,
        onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
          const cause = describeFetchError(error);
          console.warn(
            `[cams-ads] ${label} attempt ${attemptNumber} failed, ${retriesLeft} retries left: ${error.message}${cause ? ` (${cause})` : ''}`,
          );
        },
      },
    );
  }

  const submitted = await call(
    'submit',
    `${ADS_BASE_URL}/processes/${PROCESS}/execution`,
    { method: 'POST', headers: adsHeaders, body: JSON.stringify(buildRequestBody(date)) },
    requestTimeoutMs,
    readJson,
  );
  const jobId = readString(submitted, 'jobID');
  if (jobId === undefined) throw new Error('[cams-ads] submit response has no job id');
  const jobUrl = `${ADS_BASE_URL}/jobs/${encodeURIComponent(jobId)}`;
  console.log(`[cams-ads] submitted job ${jobId} for ${date}`);

  const deadline = Date.now() + pollTimeoutMs;
  for (;;) {
    const state = await call('poll', jobUrl, { headers: adsHeaders }, requestTimeoutMs, readJson);
    const status = readString(state, 'status');
    if (status === 'successful') break;
    if (status !== undefined && FAILED_STATUSES.includes(status)) {
      throw new AdsJobError(status, readString(state, 'message') ?? JSON.stringify(state));
    }
    if (Date.now() >= deadline) throw new AdsTimeoutError(pollTimeoutMs);
    await sleep(pollIntervalMs);
  }

  const results = await call(
    'results',
    `${jobUrl}/results`,
    { headers: adsHeaders },
    requestTimeoutMs,
    readJson,
  );
  const href = readDownloadHref(results);
  if (href === undefined) throw new Error('[cams-ads] results have no download link');

  // No token: the file lives on a different host.
  const file = await call('download', href, {}, downloadTimeoutMs, async (res) =>
    Buffer.from(await res.arrayBuffer()),
  );
  console.log(`[cams-ads] downloaded ${file.length} bytes`);
  return file;
}

function readJson(res: Response): Promise<unknown> {
  return res.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}

function readDownloadHref(results: unknown): string | undefined {
  if (!isRecord(results) || !isRecord(results.asset) || !isRecord(results.asset.value)) {
    return undefined;
  }
  return readString(results.asset.value, 'href');
}
