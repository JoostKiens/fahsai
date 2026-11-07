import { describe, expect, it, vi } from 'vitest';
import {
  AdsHttpError,
  AdsJobError,
  AdsTimeoutError,
  CAMS_AREA,
  CAMS_LEAD_HOURS,
  CAMS_RUNS,
  buildRequestBody,
  camsRunDate,
  fetchCamsGrib,
} from './camsAds.js';

const BASE = 'https://ads.atmosphere.copernicus.eu/api/retrieve/v1';
const PROCESS_URL = `${BASE}/processes/cams-global-atmospheric-composition-forecasts/execution`;
const DOWNLOAD_URL = 'https://object-store.example.org/cams.grib';
const GRIB_BYTES = Uint8Array.from([0x47, 0x52, 0x49, 0x42]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const job = (status: string, extra: object = {}) => json({ jobID: 'job-1', status, ...extra });
const download = () => new Response(GRIB_BYTES, { status: 200 });

// Zero waits: the tests check the sequence of calls, not the pacing.
const fast = { pollIntervalMs: 0, retryDelayMs: 0, retries: 2 };

// The client only ever passes a string URL and a string body.
function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input !== 'string') throw new Error('expected a string URL');
  return input;
}

function bodyOf(init: RequestInit | undefined): string {
  if (typeof init?.body !== 'string') throw new Error('expected a string body');
  return init.body;
}

function fetchReturning(...responses: Array<Response | Error>) {
  const fetchImpl = vi.fn<typeof fetch>();
  responses.forEach((r) => {
    if (r instanceof Error) fetchImpl.mockRejectedValueOnce(r);
    else fetchImpl.mockResolvedValueOnce(r);
  });
  return fetchImpl;
}

function run(fetchImpl: typeof fetch, options: object = {}) {
  return fetchCamsGrib({
    date: '2026-11-06',
    run: CAMS_RUNS[0],
    apiKey: 'secret-key',
    fetchImpl,
    ...fast,
    ...options,
  });
}

const [EVENING_RUN, MORNING_RUN] = CAMS_RUNS;

describe('camsRunDate', () => {
  it('is the day before the Bangkok day for an offset of -1', () => {
    expect(camsRunDate('2026-11-06', -1)).toBe('2026-11-05');
  });

  it('is the Bangkok day itself for an offset of 0', () => {
    expect(camsRunDate('2026-11-06', 0)).toBe('2026-11-06');
  });

  it('crosses a month boundary', () => {
    expect(camsRunDate('2026-12-01', -1)).toBe('2026-11-30');
  });
});

describe('buildRequestBody', () => {
  it('asks for the 12 UTC run of the day before, hours 5 to 11', () => {
    const { inputs } = buildRequestBody('2026-11-06', EVENING_RUN);

    expect(inputs).toMatchObject({
      variable: ['particulate_matter_2.5um'],
      date: ['2026-11-05/2026-11-05'],
      time: ['12:00'],
      type: ['forecast'],
      data_format: 'grib',
      leadtime_hour: ['5', '6', '7', '8', '9', '10', '11'],
    });
  });

  it('asks for the 00 UTC run of the Bangkok day, hours 0 to 16', () => {
    const { inputs } = buildRequestBody('2026-11-06', MORNING_RUN);

    expect(inputs.date).toEqual(['2026-11-06/2026-11-06']);
    expect(inputs.time).toEqual(['00:00']);
    expect(inputs.leadtime_hour).toHaveLength(17);
    expect(inputs.leadtime_hour[0]).toBe('0');
    expect(inputs.leadtime_hour[16]).toBe('16');
  });

  it('asks for one ring more than our grid, so every point has four neighbours', () => {
    const { inputs } = buildRequestBody('2026-11-06', EVENING_RUN);

    expect(inputs.area).toEqual([30.4, 88.8, 0.8, 114]);
    expect(CAMS_AREA).toEqual([30.4, 88.8, 0.8, 114]);
  });
});

describe('CAMS_RUNS', () => {
  const HOUR_MS = 3_600_000;

  it('together cover each of the 24 hours of the Bangkok day exactly once', () => {
    const validTimes = CAMS_RUNS.flatMap((r) => {
      const runStart = Date.parse(`${camsRunDate('2026-11-06', r.runDayOffset)}T${r.time}:00Z`);
      return r.leadHours.map((lead) => runStart + lead * HOUR_MS);
    }).sort((a, b) => a - b);

    const dayStart = Date.parse('2026-11-05T17:00:00Z'); // 00:00 in Bangkok on 6 Nov
    expect(validTimes).toEqual(Array.from({ length: 24 }, (_, i) => dayStart + i * HOUR_MS));
  });

  it('number the hours 5 to 28 once the lead shift is applied', () => {
    const numbered = CAMS_RUNS.flatMap((r) => r.leadHours.map((h) => h + r.leadShift));

    expect(numbered.sort((a, b) => a - b)).toEqual(CAMS_LEAD_HOURS);
  });
});

describe('fetchCamsGrib', () => {
  it('submits, polls until successful, then downloads the file', async () => {
    const fetchImpl = fetchReturning(
      job('accepted'),
      job('accepted'),
      job('running'),
      job('successful'),
      json({ asset: { value: { href: DOWNLOAD_URL } } }),
      download(),
    );

    const grib = await run(fetchImpl);

    expect(Array.from(grib)).toEqual(Array.from(GRIB_BYTES));
    expect(fetchImpl.mock.calls.map(([url]) => urlOf(url))).toEqual([
      PROCESS_URL,
      `${BASE}/jobs/job-1`,
      `${BASE}/jobs/job-1`,
      `${BASE}/jobs/job-1`,
      `${BASE}/jobs/job-1/results`,
      DOWNLOAD_URL,
    ]);
  });

  it('posts the request body with the token on the ADS calls only', async () => {
    const fetchImpl = fetchReturning(
      job('accepted'),
      job('successful'),
      json({ asset: { value: { href: DOWNLOAD_URL } } }),
      download(),
    );

    await run(fetchImpl);

    const [submit, , results, file] = fetchImpl.mock.calls;
    expect(submit[1]?.method).toBe('POST');
    expect(JSON.parse(bodyOf(submit[1]))).toEqual(buildRequestBody('2026-11-06', EVENING_RUN));
    expect(new Headers(submit[1]?.headers).get('PRIVATE-TOKEN')).toBe('secret-key');
    expect(new Headers(results[1]?.headers).get('PRIVATE-TOKEN')).toBe('secret-key');
    // The download host is not the ADS: never send it the key.
    expect(new Headers(file[1]?.headers).get('PRIVATE-TOKEN')).toBeNull();
  });

  it('gives every request a timeout signal', async () => {
    const fetchImpl = fetchReturning(
      job('accepted'),
      job('successful'),
      json({ asset: { value: { href: DOWNLOAD_URL } } }),
      download(),
    );

    await run(fetchImpl);

    fetchImpl.mock.calls.forEach(([, init]) => expect(init?.signal).toBeInstanceOf(AbortSignal));
  });

  it('throws AdsJobError with the ADS message when the job fails, without retrying', async () => {
    const fetchImpl = fetchReturning(
      job('accepted'),
      job('failed', { message: 'forecast not yet available' }),
    );

    const attempt = run(fetchImpl);

    await expect(attempt).rejects.toThrow(AdsJobError);
    await expect(attempt).rejects.toThrow(/forecast not yet available/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws AdsTimeoutError when the job never finishes', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(job('running')));

    await expect(run(fetchImpl, { pollIntervalMs: 2, pollTimeoutMs: 20 })).rejects.toThrow(
      AdsTimeoutError,
    );
  });

  it('retries a poll that fails with a server error', async () => {
    const fetchImpl = fetchReturning(
      job('accepted'),
      new Response('bad gateway', { status: 502 }),
      job('successful'),
      json({ asset: { value: { href: DOWNLOAD_URL } } }),
      download(),
    );

    await expect(run(fetchImpl)).resolves.toHaveLength(GRIB_BYTES.length);
  });

  it('retries a 429', async () => {
    const fetchImpl = fetchReturning(
      new Response('slow down', { status: 429 }),
      job('accepted'),
      job('successful'),
      json({ asset: { value: { href: DOWNLOAD_URL } } }),
      download(),
    );

    await expect(run(fetchImpl)).resolves.toHaveLength(GRIB_BYTES.length);
  });

  it('retries a connection error', async () => {
    const fetchImpl = fetchReturning(
      new TypeError('fetch failed'),
      job('accepted'),
      job('successful'),
      json({ asset: { value: { href: DOWNLOAD_URL } } }),
      download(),
    );

    await expect(run(fetchImpl)).resolves.toHaveLength(GRIB_BYTES.length);
  });

  it('retries a download that fails', async () => {
    const fetchImpl = fetchReturning(
      job('accepted'),
      job('successful'),
      json({ asset: { value: { href: DOWNLOAD_URL } } }),
      new Response('gone', { status: 503 }),
      download(),
    );

    await expect(run(fetchImpl)).resolves.toHaveLength(GRIB_BYTES.length);
  });

  it('does not retry a client error such as a wrong key', async () => {
    const fetchImpl = fetchReturning(new Response('invalid token', { status: 401 }));

    const attempt = run(fetchImpl);

    await expect(attempt).rejects.toThrow(AdsHttpError);
    await expect(attempt).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retries and throws the last error', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('down', { status: 503 })),
    );

    await expect(run(fetchImpl)).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('throws when the results have no download link', async () => {
    const fetchImpl = fetchReturning(job('accepted'), job('successful'), json({ asset: {} }));

    await expect(run(fetchImpl)).rejects.toThrow(/download link/);
  });

  it('throws when the submit response has no job id', async () => {
    const fetchImpl = fetchReturning(json({ status: 'accepted' }));

    await expect(run(fetchImpl)).rejects.toThrow(/job id/);
  });

  it('never puts the key in an error message', async () => {
    const fetchImpl = fetchReturning(new Response('bad', { status: 400 }));

    await expect(run(fetchImpl)).rejects.not.toThrow(/secret-key/);
  });
});
