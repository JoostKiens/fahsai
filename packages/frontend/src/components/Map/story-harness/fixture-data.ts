import { AQ_LAT_COUNT, AQ_LAT_MIN, AQ_LNG_COUNT, AQ_LNG_MIN, AQ_STEP } from '@thailand-aq/consts';
import { zipGridColumns } from '@/utils/camsColumns';
import camsResponse from './fixtures/2026-10-24/cams.json';
import firesResponse from './fixtures/2026-10-24/fires.json';
import windResponse from './fixtures/2026-10-24/wind.json';

// Production API responses for 2026-10-24, parsed the way the app's data hooks do.
export const camsPoints = zipGridColumns(camsResponse.data);
export const firePoints = firesResponse.data;
export const windReadings = windResponse.data;

/** The CAMS grid's outer cell edges, [west, south, east, north]. */
export const GRID_BBOX: [number, number, number, number] = [
  AQ_LNG_MIN - AQ_STEP / 2,
  AQ_LAT_MIN - AQ_STEP / 2,
  AQ_LNG_MIN + (AQ_LNG_COUNT - 1) * AQ_STEP + AQ_STEP / 2,
  AQ_LAT_MIN + (AQ_LAT_COUNT - 1) * AQ_STEP + AQ_STEP / 2,
];
