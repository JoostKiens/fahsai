/** One city in the list the city pages are built from. */
export interface CityListItem {
  slug: string;
  name: string;
  country: string;
}

export interface CityStationDay {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** The station's mean PM2.5 for the day (µg/m³), null when it has no reading that day */
  pm25: number | null;
  readingCount: number;
}

export interface CityTrendDay {
  date: string;
  /** The median of the stations' daily means, null when no station reported that day */
  pm25: number | null;
  stationCount: number;
}

import type { BaselineCategory } from './baseline';

/** What the day's trajectory and fires say; null on the page when it could not be computed */
export interface CityDrivers {
  /** False when the air's path went outside the area the data covers; null when not known */
  originInDataArea: boolean | null;
  /** Fires detected along the path; null when the path left the data area or is not known */
  upwindFireCount: number | null;
  windSpeedKmh: number | null;
  /** The compass point the wind came from, for example NNE */
  windFrom: string | null;
  camsPm25: number | null;
  /** How the reading compares with the season; null when it is normal or the data is thin */
  baselineCategory: Exclude<BaselineCategory, 'normal'> | null;
  representativeStationId: string;
}

export interface CityNearby {
  slug: string;
  name: string;
  pm25: number | null;
}

/** One sentence of a city page's summary: an i18n key and the values to put in it */
export interface CitySentence {
  key: string;
  params: Record<string, string | number>;
}

export interface CityPage extends CityListItem {
  lat: number;
  lng: number;
  /** The map zoom the "open in map" link uses */
  zoom: number;
  /** The Bangkok day all figures are for (the newest complete day) */
  date: string;
  /** The median of the stations' daily means, rounded; null when no station reported */
  pm25: number | null;
  stationCount: number;
  stations: CityStationDay[];
  /** The seven days up to and including `date`, oldest first */
  trend: CityTrendDay[];
  drivers: CityDrivers | null;
  /** Dated, neutral sentences about the day; empty when no station reported */
  summary: CitySentence[];
  nearby: CityNearby[];
  /** pm25 divided by the WHO 24-hour guideline, to one decimal; null when pm25 is null */
  whoMultiple: number | null;
}
