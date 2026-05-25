/**
 * One-off ERA5 reanalysis backfill for weather_readings and station_weather.
 *
 * Usage:
 *   pnpm --filter backend run backfill:weather -- --start=YYYY-MM-DD --end=YYYY-MM-DD
 *
 * Downloads a single ERA5 NetCDF from CDS covering the full date range, parses it via
 * a Python helper (scripts/era5-parse.py), resamples from 0.25° to 0.4° resolution,
 * upserts to weather_readings, and runs station_weather pre-computation per date.
 *
 * - Both --start and --end are required; max range is 120 days.
 * - Dates that already have ≥ 4,000 rows in weather_readings are skipped.
 * - No Redis writes — the /api/weather route handles cache-on-miss lazily.
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import pRetry, { AbortError } from 'p-retry';
import { supabase } from '../db/client.js';
import {
  precomputeStationWeather,
  WEATHER_LAT_MIN,
  WEATHER_LNG_MIN,
  WEATHER_LAT_COUNT,
  WEATHER_LNG_COUNT,
  WEATHER_STEP,
} from '../lib/computeStationWeather.js';

const LOG = '[backfill-weather]';
const DB_BATCH_SIZE = 500;
const CDS_API_BASE = 'https://cds.climate.copernicus.eu/api';
const POLL_INTERVAL_MS = 30_000;
const MAX_POLLS = 240; // 2 hours

// If --file is provided the CDS download is skipped entirely.
const localFile = process.argv.find((a) => a.startsWith('--file='))?.slice(7) ?? null;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseDateFlag(flag: string): string {
  const val = process.argv.find((a) => a.startsWith(`--${flag}=`))?.slice(flag.length + 3);
  if (!val) {
    console.error(`${LOG} --${flag} is required (YYYY-MM-DD)`);
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    console.error(`${LOG} --${flag}: invalid format "${val}" — expected YYYY-MM-DD`);
    process.exit(1);
  }
  return val;
}

const startDate = parseDateFlag('start');
const endDate = parseDateFlag('end');

if (startDate > endDate) {
  console.error(`${LOG} --start (${startDate}) must be ≤ --end (${endDate})`);
  process.exit(1);
}

// Build inclusive date list.
const dates: string[] = [];
const cursor = new Date(`${startDate}T00:00:00Z`);
const endCursor = new Date(`${endDate}T00:00:00Z`);
while (cursor <= endCursor) {
  dates.push(cursor.toISOString().slice(0, 10));
  cursor.setUTCDate(cursor.getUTCDate() + 1);
}

if (dates.length > 120) {
  console.error(`${LOG} date range spans ${dates.length} days — max is 120`);
  process.exit(1);
}

console.log(`${LOG} Date range: ${startDate} → ${endDate} (${dates.length} days)`);

// ---------------------------------------------------------------------------
// CDS API helpers
// ---------------------------------------------------------------------------

function cdsHeaders(): Record<string, string> {
  const key = process.env.CDS_API_KEY;
  if (!key) {
    console.error(`${LOG} CDS_API_KEY is not set`);
    process.exit(1);
  }
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function submitCdsJob(datesToRequest: string[]): Promise<string> {
  // Collect unique years, months, days from the date list.
  const years = [...new Set(datesToRequest.map((d) => d.slice(0, 4)))].sort();
  const months = [...new Set(datesToRequest.map((d) => d.slice(5, 7)))].sort();
  const days = [...new Set(datesToRequest.map((d) => d.slice(8, 10)))].sort();
  const allHours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

  const body = {
    inputs: {
      product_type: ['reanalysis'],
      variable: [
        '10m_u_component_of_wind',
        '10m_v_component_of_wind',
        '2m_relative_humidity',
        'total_precipitation',
      ],
      year: years,
      month: months,
      day: days,
      time: allHours,
      area: [30, 89, 1, 114], // N, W, S, E
      data_format: 'netcdf',
    },
  };

  console.log(`${LOG} Submitting CDS job for ${datesToRequest.length} dates...`);
  const resp = await fetch(
    `${CDS_API_BASE}/retrieve/v1/processes/reanalysis-era5-single-levels/execution`,
    { method: 'POST', headers: cdsHeaders(), body: JSON.stringify(body) },
  );

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`CDS submission failed (${resp.status}): ${text}`);
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`CDS submission response not JSON: ${text}`);
  }

  // The jobID may be in the body or derivable from the Location header.
  const jobId =
    (json['jobID'] as string | undefined) ??
    (json['job_id'] as string | undefined) ??
    resp.headers.get('Location')?.split('/').pop();

  if (!jobId) {
    throw new Error(`Could not extract jobID from CDS response: ${JSON.stringify(json)}`);
  }

  console.log(`${LOG} CDS job submitted: ${jobId}`);
  return jobId;
}

async function pollCdsJob(jobId: string): Promise<string> {
  console.log(`${LOG} Polling CDS job ${jobId} every ${POLL_INTERVAL_MS / 1000}s (max 2h)...`);

  for (let poll = 0; poll < MAX_POLLS; poll++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const resp = await fetch(`${CDS_API_BASE}/retrieve/v1/jobs/${jobId}`, {
      headers: cdsHeaders(),
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`CDS poll failed (${resp.status}): ${text}`);
    }

    const json = JSON.parse(text) as Record<string, unknown>;
    const status = json['status'] as string | undefined;

    if (poll % 10 === 9) {
      console.log(
        `${LOG} Still waiting... status=${status ?? 'unknown'} (poll ${poll + 1}/${MAX_POLLS})`,
      );
    }

    if (status === 'successful') {
      // Find the download URL from the links array.
      const links = json['links'] as Array<{ rel?: string; href?: string }> | undefined;
      const resultLink = links?.find((l) => l.rel === 'result')?.href;
      if (resultLink) return resultLink;

      // Fall back to explicit results endpoint.
      const resultsResp = await fetch(`${CDS_API_BASE}/retrieve/v1/jobs/${jobId}/results`, {
        headers: cdsHeaders(),
      });
      const resultsText = await resultsResp.text();
      if (!resultsResp.ok) {
        throw new Error(`CDS results fetch failed (${resultsResp.status}): ${resultsText}`);
      }
      const results = JSON.parse(resultsText) as Record<string, unknown>;
      // Try common shapes returned by the CDS API.
      const href =
        (results['href'] as string | undefined) ??
        ((
          (results['asset'] as Record<string, unknown> | undefined)?.['value'] as
            | Record<string, unknown>
            | undefined
        )?.['href'] as string | undefined) ??
        (results['location'] as string | undefined);

      if (!href) {
        throw new Error(`Could not find download URL in CDS results: ${JSON.stringify(results)}`);
      }
      return href;
    }

    if (status === 'failed') {
      throw new Error(`CDS job ${jobId} failed: ${JSON.stringify(json)}`);
    }
  }

  throw new Error(`CDS job ${jobId} did not complete within 2 hours`);
}

async function downloadNetcdf(downloadUrl: string, destPath: string): Promise<void> {
  console.log(`${LOG} Downloading NetCDF from CDS...`);
  const resp = await fetch(downloadUrl, { headers: cdsHeaders() });
  if (!resp.ok) {
    throw new Error(`NetCDF download failed (${resp.status})`);
  }
  if (!resp.body) {
    throw new Error('NetCDF download response has no body');
  }
  const writer = fs.createWriteStream(destPath);
  const reader = (resp.body as ReadableStream<Uint8Array>).getReader();
  let downloaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    writer.write(value);
    downloaded += value.length;
  }
  await new Promise<void>((resolve, reject) => {
    writer.end();
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  console.log(`${LOG} Downloaded ${(downloaded / 1_048_576).toFixed(1)} MB to ${destPath}`);
}

// ---------------------------------------------------------------------------
// Python subprocess — ERA5 NetCDF → NDJSON
// ---------------------------------------------------------------------------

type Era5Record = {
  date: string;
  lat: number;
  lng: number;
  u10: number | null;
  v10: number | null;
  r: number | null;
  tp_mm: number | null;
};

async function parseNetcdf(ncPath: string): Promise<Era5Record[]> {
  const pyScript = path.resolve(import.meta.dirname, '../../scripts/era5-parse.py');
  const venvPython = path.resolve(import.meta.dirname, '../../scripts/.venv/bin/python3');
  const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python3';
  console.log(`${LOG} Parsing ERA5 data via Python helper (${pythonBin})...`);

  return new Promise((resolve, reject) => {
    const py = spawn(pythonBin, [pyScript, ncPath]);
    const rl = createInterface({ input: py.stdout });
    const records: Era5Record[] = [];
    rl.on('line', (line) => {
      if (line.trim()) records.push(JSON.parse(line) as Era5Record);
    });
    py.stderr.on('data', (d: Buffer) => console.warn('[era5-parse.py]', String(d).trimEnd()));
    py.on('close', (code) => {
      if (code === 0) {
        console.log(`${LOG} Parsed ${records.length} ERA5 records`);
        resolve(records);
      } else {
        reject(new Error(`era5-parse.py exited with code ${code}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Resampling 0.25° → 0.4°
// ---------------------------------------------------------------------------

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

type ResampledPoint = {
  lat: number;
  lng: number;
  wind_speed_kmh: number;
  wind_direction_deg: number;
  precipitation_sum: number | null;
  relative_humidity_2m: number | null;
};

function resampleForDate(date: string, era5ForDate: Era5Record[]): ResampledPoint[] {
  const results: ResampledPoint[] = [];

  for (let i = 0; i < WEATHER_LAT_COUNT; i++) {
    for (let j = 0; j < WEATHER_LNG_COUNT; j++) {
      const targetLat = Math.round((WEATHER_LAT_MIN + i * WEATHER_STEP) * 100) / 100;
      const targetLng = Math.round((WEATHER_LNG_MIN + j * WEATHER_STEP) * 100) / 100;

      // Chebyshev distance within 0.2° — finds all 0.25° ERA5 points inside the 0.4° cell.
      const neighbors = era5ForDate.filter(
        (p) => Math.abs(p.lat - targetLat) <= 0.2 && Math.abs(p.lng - targetLng) <= 0.2,
      );
      if (!neighbors.length) continue;

      // Average U and V separately before deriving speed/direction (avoids wrap-around errors).
      const uVals = neighbors.filter((p) => p.u10 !== null).map((p) => p.u10!);
      const vVals = neighbors.filter((p) => p.v10 !== null).map((p) => p.v10!);
      if (!uVals.length || !vVals.length) continue;

      const uMean = mean(uVals);
      const vMean = mean(vVals);
      const speedKmh = Math.sqrt(uMean ** 2 + vMean ** 2) * 3.6;
      const directionDeg = (270 - (Math.atan2(vMean, uMean) * 180) / Math.PI + 360) % 360;

      const rVals = neighbors.filter((p) => p.r !== null).map((p) => p.r!);
      const tpVals = neighbors.filter((p) => p.tp_mm !== null).map((p) => p.tp_mm!);

      results.push({
        lat: targetLat,
        lng: targetLng,
        wind_speed_kmh: speedKmh,
        wind_direction_deg: directionDeg,
        relative_humidity_2m: rVals.length ? mean(rVals) : null,
        precipitation_sum: tpVals.length ? mean(tpVals) : null,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Skip-check
// ---------------------------------------------------------------------------

async function existingRowCount(date: string): Promise<number> {
  const { count, error } = await supabase
    .from('weather_readings')
    .select('*', { count: 'exact', head: true })
    .eq('date', date);
  if (error) throw new Error(`Count query failed for ${date}: ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ncPath is null when using CDS download (cleaned up in finally); set to the local file path
// when --file is provided so we skip download and also skip deletion.
let ncPath: string | null = null;
const ownedFile = localFile === null; // true = we downloaded it, false = user provided it

try {
  // 1. Obtain the ERA5 file — either via CDS API or a user-supplied local file.
  if (localFile) {
    if (!fs.existsSync(localFile)) {
      console.error(`${LOG} --file path not found: ${localFile}`);
      process.exit(1);
    }
    ncPath = localFile;
    console.log(`${LOG} Using local file: ${ncPath}`);
  } else {
    const jobId = await submitCdsJob(dates);
    const downloadUrl = await pollCdsJob(jobId);
    ncPath = path.join(os.tmpdir(), `era5-${jobId}.nc`);
    await downloadNetcdf(downloadUrl, ncPath);
  }

  // 2. Parse ERA5 NetCDF → NDJSON records, group by date.
  const allRecords = await parseNetcdf(ncPath);
  const recordsByDate = new Map<string, Era5Record[]>();
  for (const rec of allRecords) {
    const list = recordsByDate.get(rec.date) ?? [];
    list.push(rec);
    recordsByDate.set(rec.date, list);
  }

  // 3. Process each date.
  let skipped = 0;
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const progress = `[${i + 1}/${dates.length}]`;

    const existing = await existingRowCount(date);
    if (existing >= 4000) {
      console.log(`${progress} ${date} — skipped (${existing} rows already present)`);
      skipped++;
      continue;
    }

    const era5ForDate = recordsByDate.get(date);
    if (!era5ForDate?.length) {
      console.warn(`${progress} ${date} — no ERA5 data for this date, skipping`);
      skipped++;
      continue;
    }

    const resampled = resampleForDate(date, era5ForDate);
    if (!resampled.length) {
      console.warn(`${progress} ${date} — resampling produced 0 points, skipping`);
      skipped++;
      continue;
    }

    const dbRows = resampled.map((r) => ({
      date,
      lat: r.lat,
      lng: r.lng,
      wind_speed_kmh: r.wind_speed_kmh,
      wind_direction_deg: r.wind_direction_deg,
      relative_humidity_2m: r.relative_humidity_2m,
      precipitation_sum: r.precipitation_sum,
    }));

    for (let b = 0; b < dbRows.length; b += DB_BATCH_SIZE) {
      const batch = dbRows.slice(b, b + DB_BATCH_SIZE);
      const batchNum = Math.floor(b / DB_BATCH_SIZE) + 1;
      await pRetry(
        async () => {
          const { error } = await supabase
            .from('weather_readings')
            .upsert(batch, { onConflict: 'date,lat,lng', ignoreDuplicates: false });
          if (error) throw new AbortError(`Upsert failed (batch ${batchNum}): ${error.message}`);
        },
        {
          retries: 3,
          minTimeout: 1000,
          factor: 2,
          onFailedAttempt: (err) =>
            console.warn(
              `${LOG} batch ${batchNum} attempt ${err.attemptNumber} failed: ${err.message}`,
            ),
        },
      );
    }

    await precomputeStationWeather(date, resampled, LOG);
    console.log(`${progress} ${date} — done (${resampled.length} grid points)`);
  }

  const processed = dates.length - skipped;
  console.log(`${LOG} Done — ${processed} dates processed, ${skipped} skipped`);
  process.exit(0);
} catch (err) {
  console.error(`${LOG} Fatal error:`, err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  if (ncPath && ownedFile) {
    fs.unlink(ncPath, () => {});
  }
}
