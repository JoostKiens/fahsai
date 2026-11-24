/**
 * Upper bounds (inclusive, µg/m³) of the Thai Pollution Control Department's 24-hour PM2.5 bands,
 * from Excellent (0) to Very unhealthy (4). Source: Air4Thai, https://air4thai.pcd.go.th/webV3/#/AQIInfo
 * (Table 2), verified 2026-11-05. Legal basis: PCD announcement of 3 July 2023.
 */
export const PCD_BAND_MAX_UGM3 = [15.0, 25.0, 37.5, 75.0, Infinity] as const;

/**
 * The PCD band (0 = Excellent … 4 = Very unhealthy) of a 24-hour mean. PCD's breakpoints have one
 * decimal (15.0 | 15.1), so the value is rounded to 0.1 first, as Air4Thai does.
 */
export function pcdBandIndex(pm25: number): number {
  const rounded = Math.round(pm25 * 10) / 10;
  const index = PCD_BAND_MAX_UGM3.findIndex((max) => rounded <= max);
  return index === -1 ? PCD_BAND_MAX_UGM3.length - 1 : index;
}
