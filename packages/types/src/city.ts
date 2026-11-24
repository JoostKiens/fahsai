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

/** The latest hourly blend the headline value ends with */
export interface CityNowLatest {
  /** End of the hour (ISO), as OpenAQ stamps it: 12:00 covers 11:00–12:00 */
  validAt: string;
  pm25: number;
  /** Stations in the blend, after merging co-located ones and dropping outliers */
  stationCount: number;
  /** The stations' share of the blend, 0 to 1; the rest is CAMS */
  stationWeight: number;
  camsPm25: number | null;
}

/** The modelled value close to now: stations and CAMS, blended every hour */
export interface CityNow {
  /** Mean of the hourly blends over the last 24 h (µg/m³) */
  pm25: number;
  /** PCD band index, 0 = Excellent … 4 = Very unhealthy, after the safety rule */
  band: number;
  /** The safety rule raised the band to the band of the stations' median */
  isBandRaised: boolean;
  /** Hourly values in the mean, up to 24 */
  hours: number;
  latest: CityNowLatest;
}

/** A station's latest measured hourly value */
export interface CityStationHour {
  id: string;
  name: string;
  pm25: number;
  /** End of the measured hour (ISO) */
  measuredAt: string;
}

export interface CityPage extends CityListItem {
  lat: number;
  lng: number;
  /** The map zoom the "open in map" link uses */
  zoom: number;
  /** The footprint: stations within this distance of the centre (km) count for the city */
  radiusKm: number;
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
  /** The modelled value close to now; null before the first hourly blend or when it can't be read */
  now: CityNow | null;
  /** The latest measured hourly value of each station that reported in the last 2 h, nearest first */
  measured: CityStationHour[];
}
