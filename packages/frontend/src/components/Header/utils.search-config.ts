import type { FuseOptionKey } from 'fuse.js';
import type { LatestMeasurement } from '../../hooks/useStationReadings';
import { VIEWPORT_BBOX } from '../../utils/bbox';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAPBOX_GEOCODE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const BBOX = VIEWPORT_BBOX.join(',');
const GEOCODE_TYPES = 'locality,place,district,region';
export const MAX_STATION_RESULTS = 3;
export const MAX_PLACE_RESULTS = 5;

export const FUSE_KEYS: FuseOptionKey<LatestMeasurement>[] = ['stationName', 'stationId'];
export const FUSE_THRESHOLD = 0.2;

export function buildGeocodeUrl(query: string, language: string): string {
  return (
    `${MAPBOX_GEOCODE}/${encodeURIComponent(query)}.json` +
    `?bbox=${BBOX}&limit=${MAX_PLACE_RESULTS}&language=${language}` +
    `&types=${GEOCODE_TYPES}&access_token=${TOKEN}`
  );
}
