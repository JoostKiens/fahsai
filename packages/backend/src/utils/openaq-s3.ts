import zlib from 'node:zlib';
import { parse } from 'csv-parse/sync';

export function buildS3Url(locationId: string, date: string): string {
  const year = date.slice(0, 4);
  const month = date.slice(5, 7);
  const dateCompact = date.replace(/-/g, '');
  return (
    `https://openaq-data-archive.s3.amazonaws.com/records/csv.gz/` +
    `locationid=${locationId}/year=${year}/month=${month}/location-${locationId}-${dateCompact}.csv.gz`
  );
}

/** Downloads and decompresses an S3 file. Returns null on 404 (no data for this location/date). */
export async function downloadS3File(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`S3 fetch failed: ${response.status} ${response.statusText} — ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return zlib.gunzipSync(buffer).toString('utf-8');
}

interface CsvRow {
  sensors_id: string;
  parameter: string;
  value: string;
}

/**
 * Parse a CSV string and compute the daily mean pm25 value.
 * Prefers the primarySensorId; falls back to any pm25 sensor in the file.
 * Returns null when no valid pm25 readings exist.
 */
export function computeDailyMean(
  csvContent: string,
  primarySensorId: number,
): { value: number; sensorId: number } | null {
  let rows: CsvRow[];
  try {
    rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[];
  } catch {
    return null;
  }

  const pm25Rows = rows.filter((r) => r.parameter === 'pm25');
  if (pm25Rows.length === 0) return null;

  const primaryRows = pm25Rows.filter((r) => Number(r.sensors_id) === primarySensorId);
  const targetRows = primaryRows.length > 0 ? primaryRows : pm25Rows;
  const targetSensorId =
    primaryRows.length > 0 ? primarySensorId : Number(targetRows[0].sensors_id);

  const sensorRows = targetRows.filter((r) => Number(r.sensors_id) === targetSensorId);
  const validValues = sensorRows
    .map((r) => parseFloat(r.value))
    .filter((v) => Number.isFinite(v) && v >= 0);

  if (validValues.length === 0) return null;

  const mean = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
  return { value: mean, sensorId: targetSensorId };
}
