// Thai Pollution Control Department (PCD) 24-hour PM2.5 scale, used by the public pages (city
// pages, /city, haze guide). The map keeps the US EPA scale in aqiColors.ts.
// Source: Air4Thai "ข้อมูลดัชนีคุณภาพอากาศ", https://air4thai.pcd.go.th/webV3/#/AQIInfo (Tables 1, 2),
// verified 2026-11-05. The bands are Table 2's PM2.5 concentrations (µg/m³), not Table 1's AQI
// index (0–25, 26–50, ...): index 25 is 15 µg/m³.
// Legal basis: PCD announcement of 3 July 2023 (Royal Gazette).
import type { RGB } from './aqiColors';

export interface PcdBand {
  /** i18n key; the English value is Air4Thai's own label */
  key: string;
  /** Inclusive upper bound in µg/m³, after rounding to 0.1 */
  max: number;
  rgb: RGB;
}

export const PCD_BANDS: PcdBand[] = [
  { key: 'pcd.excellent', max: 15.0, rgb: [59, 204, 255] },
  { key: 'pcd.satisfactory', max: 25.0, rgb: [146, 208, 80] },
  { key: 'pcd.moderate', max: 37.5, rgb: [255, 255, 0] },
  { key: 'pcd.unhealthy', max: 75.0, rgb: [255, 162, 0] },
  { key: 'pcd.veryUnhealthy', max: Infinity, rgb: [240, 70, 70] },
];

// PCD's breakpoints have one decimal (15.0 | 15.1), so the mean is rounded to 0.1 before banding.
// A chip may show "25" yet band as 25.1 (Moderate); Air4Thai behaves the same way.
export function pm25ToPcdBand(pm25: number): PcdBand {
  const rounded = Math.round(pm25 * 10) / 10;
  return PCD_BANDS.find((band) => rounded <= band.max) ?? PCD_BANDS[PCD_BANDS.length - 1];
}
