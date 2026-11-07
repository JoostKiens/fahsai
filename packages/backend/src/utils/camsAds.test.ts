import { describe, expect, it, vi } from 'vitest';
import {
  AdsHttpError,
  AdsJobError,
  AdsTimeoutError,
  CAMS_AREA,
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
    apiKey: 'secret-key',
    fetchImpl,
    ...fast,
    ...options,
  });
}

describe('camsRunDate', () => {
  it('is the day before the Bangkok day', () => {
    expect(camsRunDate('2026-11-06')).toBe('2026-11-05');
  });

  it('crosses a month boundary', () => {
    expect(camsRunDate('2026-12-01')).toBe('2026-11-30');
  });
});

describe('buildRequestBody', () => {
  const { inputs } = buildRequestBody('2026-11-06');

  it('asks for the 12 UTC run of the day before, hours 5 to 28', () => {
    expect(inputs).toMatchObject({
      variable: ['particulate_matter_2.5um'],
      date: ['2026-11-05/2026-11-05'],
      time: ['12:00'],
      type: ['forecast'],
      data_format: 'grib',
    });
    expect(inputs.leadtime_hour).toHaveLength(24);
    expect(inputs.leadtime_hour[0]).toBe('5');
    expect(inputs.leadtime_hour[23]).toBe('28');
  });

  it('asks for one ring more than our grid, so every point has four neighbours', () => {
    expect(inputs.area).toEqual([30.4, 88.8, 0.8, 114]);
    expect(CAMS_AREA).toEqual([30.4, 88.8, 0.8, 114]);
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
    expect(JSON.parse(bodyOf(submit[1]))).toEqual(buildRequestBody('2026-11-06'));
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
