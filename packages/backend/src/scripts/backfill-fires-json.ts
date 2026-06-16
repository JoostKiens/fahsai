/**
 * One-time backfill: ingest NOAA-21 fire data from a NASA FIRMS JSON download.
 * Run after applying migration 019_fire_source_noaa21.sql.
 *
 * Usage: pnpm --filter backend run backfill:fires-noaa21 <path-to-json>
 *
 * The NOAA-21 JSON format differs from the FIRMS area CSV:
 *   brightness  → bright_ti4  (I-band 4 fire detection temperature)
 *   bright_t31  → bright_ti5  (I-band 5 background temperature)
 *   satellite   → 'N21'       (NOAA-21)
 */
import { readFileSync } from 'fs';
import { supabase } from '../db/client.js';
import { parseBbox } from '../utils/bbox.js';

const BBOX = parseBbox(undefined);
const BATCH = 500;
const SOURCE = 'VIIRS_NOAA21_NRT';

interface NoaaFireJson {
  latitude: number;
  longitude: number;
  acq_date: string;
  acq_time: string | number;
  brightness: number | null;
  bright_t31: number | null;
  frp: number | null;
  satellite: string;
  confidence: string;
  daynight: string;
}

function parseAcqTime(raw: string | number): string {
  const hhmm = String(raw).padStart(4, '0');
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00`;
}

function parseNullable(val: number | null | undefined): number | null {
  if (val === null || val === undefined || isNaN(val)) return null;
  return val;
}

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('[backfill-fires] Usage: backfill:fires-noaa21 <path-to-json>');
  process.exit(1);
}

let raw: NoaaFireJson[];
try {
  raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as NoaaFireJson[];
} catch (err) {
  console.error(
    `[backfill-fires] Failed to read JSON: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}

console.log(`[backfill-fires] Loaded ${raw.length} records from JSON`);

const inBbox = raw.filter(
  (r) =>
    r.latitude >= BBOX.south &&
    r.latitude <= BBOX.north &&
    r.longitude >= BBOX.west &&
    r.longitude <= BBOX.east,
);

console.log(
  `[backfill-fires] ${inBbox.length} records within bbox (${raw.length - inBbox.length} filtered out)`,
);

const records = inBbox.map((r) => ({
  detected_at: `${r.acq_date}T${parseAcqTime(r.acq_time)}Z`,
  location: `POINT(${r.longitude} ${r.latitude})`,
  lat: r.latitude,
  lng: r.longitude,
  bright_ti4: parseNullable(r.brightness),
  bright_ti5: parseNullable(r.bright_t31),
  frp: parseNullable(r.frp),
  country_id: null,
  satellite: r.satellite,
  confidence: r.confidence,
  daynight: r.daynight,
  source: SOURCE,
}));

let inserted = 0;
for (let i = 0; i < records.length; i += BATCH) {
  const batch = records.slice(i, i + BATCH);
  const { error } = await supabase
    .from('fire_points')
    .upsert(batch, { onConflict: 'detected_at,lat,lng', ignoreDuplicates: true });
  if (error) {
    console.error(`[backfill-fires] Upsert error at batch ${i}–${i + BATCH}: ${error.message}`);
    process.exit(1);
  }
  inserted += batch.length;
  process.stdout.write(`\r[backfill-fires] ${inserted}/${records.length} rows upserted...`);
}

console.log(
  `\n[backfill-fires] Done — ${records.length} rows upserted (duplicates silently skipped)`,
);
process.exit(0);
