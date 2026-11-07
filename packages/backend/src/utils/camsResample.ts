import type { PM25GridPoint } from '@thailand-aq/types';
import { AQ_LAT_COUNT, AQ_LAT_MIN, AQ_LNG_COUNT, AQ_LNG_MIN, AQ_STEP } from '@thailand-aq/consts';
import type { Grib1Message } from './grib1.js';

export type CamsField = Omit<Grib1Message, 'leadHour'>;

const MICROGRAMS_PER_KILOGRAM = 1e9;
// Float noise in (position − node) / step; far below the 0.2° offset we care about.
const INDEX_TOLERANCE = 1e-6;

export function toMicrograms(field: CamsField): CamsField {
  return { ...field, values: field.values.map((v) => v * MICROGRAMS_PER_KILOGRAM) };
}

/** Mean of the hourly fields of one day, per cell. The caller checks it got every hour. */
export function dailyMean(messages: Grib1Message[]): CamsField {
  const [first] = messages;
  if (first === undefined) throw new Error('[cams-resample] no messages to average');

  const seenHours = new Set<number>();
  const sums = new Float64Array(first.values.length);
  for (const m of messages) {
    if (!hasSameGeometry(first, m)) throw new Error('[cams-resample] messages differ in geometry');
    if (seenHours.has(m.leadHour)) {
      throw new Error(`[cams-resample] two messages for lead hour ${m.leadHour}`);
    }
    seenHours.add(m.leadHour);
    m.values.forEach((v, i) => {
      sums[i] += v;
    });
  }

  const { ni, nj, lat1, lng1, dLat, dLng } = first;
  return { ni, nj, lat1, lng1, dLat, dLng, values: sums.map((s) => s / messages.length) };
}

/**
 * Our grid sits 0.2° off the CAMS nodes, so each point is halfway between four cells.
 * The value is their mean. Rows run south to north, columns west to east.
 */
export function resampleToAqGrid(field: CamsField): PM25GridPoint[] {
  const points: PM25GridPoint[] = [];
  for (let latIdx = 0; latIdx < AQ_LAT_COUNT; latIdx += 1) {
    const lat = roundTo1Decimal(AQ_LAT_MIN + latIdx * AQ_STEP);
    const rows = surroundingIndexes((field.lat1 - lat) / field.dLat, field.nj);
    for (let lngIdx = 0; lngIdx < AQ_LNG_COUNT; lngIdx += 1) {
      const lng = roundTo1Decimal(AQ_LNG_MIN + lngIdx * AQ_STEP);
      const cols = surroundingIndexes((lng - field.lng1) / field.dLng, field.ni);
      if (rows === null || cols === null) {
        throw new Error(`[cams-resample] field does not cover grid point ${lat}, ${lng}`);
      }
      const cells = rows.flatMap((row) => cols.map((col) => field.values[row * field.ni + col]));
      const mean = cells.reduce((a, b) => a + b, 0) / cells.length;
      points.push({ lat, lng, pm25: roundTo1Decimal(mean) });
    }
  }
  return points;
}

function hasSameGeometry(a: CamsField, b: CamsField): boolean {
  return (
    a.ni === b.ni &&
    a.nj === b.nj &&
    a.lat1 === b.lat1 &&
    a.lng1 === b.lng1 &&
    a.dLat === b.dLat &&
    a.dLng === b.dLng
  );
}

// The cell index below and above a fractional position, or null if one lies outside the field.
// A position exactly on a node has one cell.
function surroundingIndexes(position: number, count: number): number[] | null {
  const below = Math.floor(position + INDEX_TOLERANCE);
  const isOnNode = Math.abs(position - below) < INDEX_TOLERANCE;
  const indexes = isOnNode ? [below] : [below, below + 1];
  return indexes.every((i) => i >= 0 && i < count) ? indexes : null;
}

function roundTo1Decimal(value: number): number {
  return Math.round(value * 10) / 10;
}
