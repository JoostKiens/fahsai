// Authoritative US EPA AQI color scale for PM2.5.
// Thresholds are raw PM2.5 µg/m³ concentrations, NOT AQI index values.
// Both the heatmap (BitmapLayer) and station dots (ScatterplotLayer) use this file
// so the two layers are always visually consistent.
//
// AQI index → PM2.5 µg/m³ breakpoints (EPA):
//   Good 0–50           → 0–12.0 µg/m³
//   Moderate 51–100     → 12.1–35.4
//   USG 101–150         → 35.5–55.4
//   Unhealthy 151–200   → 55.5–150.4
//   Very Unhealthy 201–300 → 150.5–250.4
//   Hazardous 301+      → 250.5+

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export interface AqiCategory {
  label: string;
  key: string; // i18n translation key — use t(cat.key) at render sites
  range: string; // display string in µg/m³
  rgb: RGB;
  borderRgb: RGB; // ~20% darker, used for cluster border rings
}

export const AQI_CATEGORIES: AqiCategory[] = [
  { label: 'Good', key: 'aqi.good', range: '0–12', rgb: [88, 196, 88], borderRgb: [70, 157, 70] },
  {
    label: 'Moderate',
    key: 'aqi.moderate',
    range: '12–35',
    rgb: [240, 210, 50],
    borderRgb: [192, 168, 40],
  },
  {
    label: 'Unhealthy for sensitive groups',
    key: 'aqi.unhealthySensitive',
    range: '35–55',
    rgb: [255, 126, 0],
    borderRgb: [204, 101, 0],
  },
  {
    label: 'Unhealthy',
    key: 'aqi.unhealthy',
    range: '55–150',
    rgb: [255, 0, 0],
    borderRgb: [204, 0, 0],
  },
  {
    label: 'Very unhealthy',
    key: 'aqi.veryUnhealthy',
    range: '150–250',
    rgb: [143, 63, 151],
    borderRgb: [114, 50, 121],
  },
  {
    label: 'Hazardous',
    key: 'aqi.hazardous',
    range: '250+',
    rgb: [126, 0, 35],
    borderRgb: [101, 0, 28],
  },
];

// Upper PM2.5 breakpoints matching AQI_CATEGORIES order.
const PM25_BREAKPOINTS = [12.0, 35.4, 55.4, 150.4, 250.4, Infinity];

export function pm25ToRgb(pm25: number): RGB {
  for (let i = 0; i < PM25_BREAKPOINTS.length; i++) {
    if (pm25 <= PM25_BREAKPOINTS[i]) return AQI_CATEGORIES[i].rgb;
  }
  return AQI_CATEGORIES[AQI_CATEGORIES.length - 1].rgb;
}

export function pm25ToBorderRgb(pm25: number): RGB {
  for (let i = 0; i < PM25_BREAKPOINTS.length; i++) {
    if (pm25 <= PM25_BREAKPOINTS[i]) return AQI_CATEGORIES[i].borderRgb;
  }
  return AQI_CATEGORIES[AQI_CATEGORIES.length - 1].borderRgb;
}

export function pm25ToBorderRgba(pm25: number, alpha: number): RGBA {
  const [r, g, b] = pm25ToBorderRgb(pm25);
  return [r, g, b, alpha];
}

export function pm25ToRgba(pm25: number, alpha: number): RGBA {
  const [r, g, b] = pm25ToRgb(pm25);
  return [r, g, b, alpha];
}

const PM25_CAT_BREAKPOINTS = [12.0, 35.4, 55.4, 150.4, 250.4];

export function pm25ToCategory(pm25: number): AqiCategory {
  return (
    AQI_CATEGORIES.find((_, i) => pm25 <= (PM25_CAT_BREAKPOINTS[i] ?? Infinity)) ??
    AQI_CATEGORIES[AQI_CATEGORIES.length - 1]
  );
}

// Returns black text for light backgrounds, white for dark ones.
export function contrastColor(rgb: RGB): RGBA {
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return lum > 150 ? [0, 0, 0, 255] : [255, 255, 255, 255];
}

// Soft (tinted) backgrounds — used inside the InfoPanel badge and History bars only.
// NOT used on the map, station dots, heatmap, or legend.
const AQI_SOFT_BG: RGB[] = [
  [190, 230, 190], // Good
  [250, 232, 145], // Moderate
  [255, 200, 150], // Unhealthy for sensitive groups
  [255, 175, 175], // Unhealthy
  [208, 182, 218], // Very unhealthy
  [218, 170, 190], // Hazardous
];

// Dark category-colored text to sit on the soft backgrounds above.
const AQI_SOFT_TEXT: RGB[] = [
  [40, 110, 40], // Good
  [130, 100, 0], // Moderate
  [170, 80, 0], // Unhealthy for sensitive groups
  [170, 0, 0], // Unhealthy
  [95, 35, 100], // Very unhealthy
  [110, 0, 30], // Hazardous
];

export function pm25ToSoftRgb(pm25: number): RGB {
  for (let i = 0; i < PM25_BREAKPOINTS.length; i++) {
    if (pm25 <= PM25_BREAKPOINTS[i]) return AQI_SOFT_BG[i];
  }
  return AQI_SOFT_BG[AQI_SOFT_BG.length - 1];
}

export function pm25ToSoftTextRgb(pm25: number): RGB {
  for (let i = 0; i < PM25_BREAKPOINTS.length; i++) {
    if (pm25 <= PM25_BREAKPOINTS[i]) return AQI_SOFT_TEXT[i];
  }
  return AQI_SOFT_TEXT[AQI_SOFT_TEXT.length - 1];
}
