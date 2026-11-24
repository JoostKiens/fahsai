// Thai Pollution Control Department (PCD) 24-hour PM2.5 scale, used by the public pages (city
// pages, /city, haze guide). The map keeps the US EPA scale in aqiColors.ts.
// Source: Air4Thai "ข้อมูลดัชนีคุณภาพอากาศ", https://air4thai.pcd.go.th/webV3/#/AQIInfo (Tables 1, 2),
// verified 2026-11-05. The bands are Table 2's PM2.5 concentrations (µg/m³), not Table 1's AQI
// index (0–25, 26–50, ...): index 25 is 15 µg/m³. The breakpoints live in @thailand-aq/consts so
// the backend bands values the same way.
// Legal basis: PCD announcement of 3 July 2023 (Royal Gazette).
import { PCD_BAND_MAX_UGM3, pcdBandIndex } from '@thailand-aq/consts';
import type { RGB } from './aqiColors';

export interface PcdBand {
  /** i18n key; the English value is Air4Thai's own label */
  key: string;
  /** Inclusive upper bound in µg/m³, after rounding to 0.1 */
  max: number;
  rgb: RGB;
}

export const PCD_BANDS: PcdBand[] = [
  { key: 'pcd.excellent', max: PCD_BAND_MAX_UGM3[0], rgb: [59, 204, 255] },
  { key: 'pcd.satisfactory', max: PCD_BAND_MAX_UGM3[1], rgb: [146, 208, 80] },
  { key: 'pcd.moderate', max: PCD_BAND_MAX_UGM3[2], rgb: [255, 255, 0] },
  { key: 'pcd.unhealthy', max: PCD_BAND_MAX_UGM3[3], rgb: [255, 162, 0] },
  { key: 'pcd.veryUnhealthy', max: PCD_BAND_MAX_UGM3[4], rgb: [240, 70, 70] },
];

// A chip may show "25" yet band as 25.1 (Moderate): pcdBandIndex rounds to 0.1, as Air4Thai does.
export function pm25ToPcdBand(pm25: number): PcdBand {
  return PCD_BANDS[pcdBandIndex(pm25)];
}
