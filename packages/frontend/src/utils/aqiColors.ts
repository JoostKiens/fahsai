// Authoritative US EPA AQI color scale for PM2.5 (2024 revision, effective 6 Feb 2024).
// Thresholds are raw PM2.5 µg/m³ concentrations, NOT AQI index values.
// Both the heatmap (BitmapLayer) and station dots (ScatterplotLayer) use this file
// so the two layers are always visually consistent.
//
// AQI index → PM2.5 µg/m³ breakpoints (EPA):
//   Good 0–50           → 0–9.0 µg/m³
//   Moderate 51–100     → 9.1–35.4
//   USG 101–150         → 35.5–55.4
//   Unhealthy 151–200   → 55.5–125.4
//   Very Unhealthy 201–300 → 125.5–225.4
//   Hazardous 301+      → 225.5+

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export interface AqiCategory {
  label: string;
  key: string; // i18n translation key — use t(cat.key) at render sites
  range: string; // display string in µg/m³
  rgb: RGB;
}

export const AQI_CATEGORIES: AqiCategory[] = [
  { label: 'Good', key: 'aqi.good', range: '0–9', rgb: [88, 196, 88] },
  { label: 'Moderate', key: 'aqi.moderate', range: '9–35', rgb: [240, 210, 50] },
  {
    label: 'Unhealthy for sensitive groups',
    key: 'aqi.unhealthySensitive',
    range: '35–55',
    rgb: [255, 126, 0],
  },
  { label: 'Unhealthy', key: 'aqi.unhealthy', range: '55–125', rgb: [255, 0, 0] },
  { label: 'Very unhealthy', key: 'aqi.veryUnhealthy', range: '125–225', rgb: [143, 63, 151] },
  { label: 'Hazardous', key: 'aqi.hazardous', range: '225+', rgb: [126, 0, 35] },
];

// Upper PM2.5 breakpoints matching AQI_CATEGORIES order.
const PM25_BREAKPOINTS = [9.0, 35.4, 55.4, 125.4, 225.4, Infinity];

// Lower breakpoints (entry point of each band) — used for lerp interpolation.
const PM25_LERP_BREAKPOINTS = [0, 9.0, 35.4, 55.4, 125.4, 225.4];

export function pm25ToRgb(pm25: number): RGB {
  for (let i = 0; i < PM25_BREAKPOINTS.length; i++) {
    if (pm25 <= PM25_BREAKPOINTS[i]) return AQI_CATEGORIES[i].rgb;
  }
  return AQI_CATEGORIES[AQI_CATEGORIES.length - 1].rgb;
}

// Smooth RGB interpolation between adjacent AQI category colors. Unlike pm25ToRgb
// (step function), this lerps within each band so gradients transition fluidly.
export function pm25ToRgbLerped(pm25: number): RGB {
  const colors = AQI_CATEGORIES.map((c) => c.rgb);
  if (pm25 <= 0) return colors[0];
  if (pm25 >= 225.4) return colors[colors.length - 1];
  for (let i = 0; i < PM25_LERP_BREAKPOINTS.length - 1; i++) {
    if (pm25 <= PM25_LERP_BREAKPOINTS[i + 1]) {
      const t =
        (pm25 - PM25_LERP_BREAKPOINTS[i]) /
        (PM25_LERP_BREAKPOINTS[i + 1] - PM25_LERP_BREAKPOINTS[i]);
      const [r1, g1, b1] = colors[i];
      const [r2, g2, b2] = colors[i + 1];
      return [
        Math.round(r1 + t * (r2 - r1)),
        Math.round(g1 + t * (g2 - g1)),
        Math.round(b1 + t * (b2 - b1)),
      ];
    }
  }
  return colors[colors.length - 1];
}

export function pm25ToRgba(pm25: number, alpha: number): RGBA {
  const [r, g, b] = pm25ToRgb(pm25);
  return [r, g, b, alpha];
}

export const PM25_CAT_BREAKPOINTS = [9.0, 35.4, 55.4, 125.4, 225.4];

export function pm25ToCategory(pm25: number): AqiCategory {
  return (
    AQI_CATEGORIES.find((_, i) => pm25 <= (PM25_CAT_BREAKPOINTS[i] ?? Infinity)) ??
    AQI_CATEGORIES[AQI_CATEGORIES.length - 1]
  );
}

// Returns whichever of black or white text has the higher WCAG contrast on this background. Above
// a relative luminance of 0.179 black wins; a brightness heuristic put white on pure red (4:1).
export function contrastColor(rgb: RGB): RGBA {
  const [r, g, b] = rgb.map(toLinear);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? [0, 0, 0, 255] : [255, 255, 255, 255];
}

function toLinear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

// Soft (tinted) backgrounds — used inside the InfoPanel badge and History bars only.
// NOT used on the map, station dots, heatmap, or legend.
const AQI_SOFT_BG: RGB[] = [
  [190, 230, 190], // Good
  [250, 232, 145], // Moderate
  [255, 200, 150], // Unhealthy for sensitive groups
  [235, 80, 80], // Unhealthy
  [175, 100, 190], // Very unhealthy
  [200, 70, 100], // Hazardous
];

export function pm25ToSoftRgb(pm25: number): RGB {
  for (let i = 0; i < PM25_BREAKPOINTS.length; i++) {
    if (pm25 <= PM25_BREAKPOINTS[i]) return AQI_SOFT_BG[i];
  }
  return AQI_SOFT_BG[AQI_SOFT_BG.length - 1];
}

/** Alpha (0–255) the CAMS heatmap bitmap is painted with. */
export const HEATMAP_ALPHA = 55;
