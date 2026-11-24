import type { CityDef } from '../data/cities.js';
import type { Grib1Message } from '../utils/grib1.js';
import { haversineKm } from '../utils/geo.js';

export type CamsGridShape = Pick<Grib1Message, 'ni' | 'nj' | 'lat1' | 'lng1' | 'dLat' | 'dLng'>;

export type CellWeight = {
  /** Position in a message's values (rows north to south, each row west to east) */
  index: number;
  lat: number;
  lng: number;
  /** The cell's share of the footprint's area; the weights of one footprint sum to 1 */
  weight: number;
};

const KM_PER_DEGREE_OF_LATITUDE = 111.2;
// About 25,600 samples for a 20 km circle: the shares are good to well under 1%.
const SAMPLE_STEP_KM = 0.25;

/**
 * The CAMS cells a city's footprint overlaps, each with its share of the footprint's area. A
 * cell is the box of one grid step centred on a grid point: the GRIB file holds point values,
 * so that box is the area each value stands for. Throws when the footprint leaves the grid.
 */
export function footprintCellWeights(
  city: Pick<CityDef, 'lat' | 'lng' | 'radiusKm'>,
  grid: CamsGridShape,
): CellWeight[] {
  const latStep = SAMPLE_STEP_KM / KM_PER_DEGREE_OF_LATITUDE;
  const lngStep = latStep / Math.cos((city.lat * Math.PI) / 180);
  const steps = Math.ceil(city.radiusKm / SAMPLE_STEP_KM);

  const counts = new Map<number, number>();
  let total = 0;
  // samples sit half a step off the centre lines, so none lands on the edge of a cell
  for (let i = -steps; i < steps; i++) {
    for (let j = -steps; j < steps; j++) {
      const lat = city.lat + (i + 0.5) * latStep;
      const lng = city.lng + (j + 0.5) * lngStep;
      if (haversineKm(city.lat, city.lng, lat, lng) > city.radiusKm) continue;
      const index = cellIndex(lat, lng, grid);
      counts.set(index, (counts.get(index) ?? 0) + 1);
      total++;
    }
  }

  return [...counts]
    .map(([index, count]) => ({
      index,
      lat: grid.lat1 - Math.floor(index / grid.ni) * grid.dLat,
      lng: grid.lng1 + (index % grid.ni) * grid.dLng,
      weight: count / total,
    }))
    .sort((a, b) => a.index - b.index);
}

function cellIndex(lat: number, lng: number, grid: CamsGridShape): number {
  const row = Math.round((grid.lat1 - lat) / grid.dLat);
  const col = Math.round((lng - grid.lng1) / grid.dLng);
  const isOnGrid = row >= 0 && row < grid.nj && col >= 0 && col < grid.ni;
  if (!isOnGrid)
    throw new Error(`footprint point ${lat.toFixed(3)}, ${lng.toFixed(3)} is off the grid`);
  return row * grid.ni + col;
}

/** The footprint's value: the cells' values weighted by their share of its area. */
export function footprintValue(values: Float64Array, weights: CellWeight[]): number {
  return weights.reduce((sum, cell) => sum + cell.weight * values[cell.index], 0);
}
