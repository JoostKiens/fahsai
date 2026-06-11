import type { ExplainCase } from '../routes/explain.js';

export interface ClassifyParams {
  isStrongOutlier: boolean;
  isHighOutlier: boolean;
  firePressureNorm: number;
  areaScore: number;
  camsMaxPm25: number | null;
  latestPm25: number;
  trajectoryPrecipTotal: number;
  relevantSources: { isUpwind: boolean; distKm: number }[];
}

// Case classifier — must stay identical between the route and the eval.
// Lives here rather than in explain.ts so assemblePrompt.ts can import it
// without taking a dependency on the full route module.
//
// Calibrated against 10 real fixtures. Thresholds:
//   firePressureNorm >= 40        — calibrated fire pressure score (log scale)
//   areaScore >= 40               — local fires dominant; triggers even when path score is low
//   camsMaxPm25 < 25              — CAMS suppression: fires on flanks, not core air mass
//                                   (applies only when triggered by path score alone)
//   latestPm25 <= 12              — unambiguously Good
//   trajectoryPrecipTotal > 40 && latestPm25 <= 25
//                                 — rain-washout (Ko Yawn 21.9/76mm ✓,
//                                   Chaloem 49.2/2mm ✗, Hana 37.1/1mm ✗)
//   distKm <= 150                 — tier-1 upwind source threshold
export function classifyCase(params: ClassifyParams): ExplainCase {
  if (params.isStrongOutlier && params.isHighOutlier) return 'OUTLIER_HIGH';
  if (params.isStrongOutlier && !params.isHighOutlier) return 'OUTLIER_LOW';

  const fireTransportByPath = params.firePressureNorm >= 40;
  const fireTransportByArea = params.areaScore >= 40;

  if (!params.isStrongOutlier && (fireTransportByPath || fireTransportByArea)) {
    // CAMS suppression: when path fires trigger and CAMS shows clean air, the incoming
    // air mass didn't pass through fire areas — suppress the fire transport story.
    // This applies even when areaScore also triggers, because clean CAMS means the air
    // arrived from a non-fire corridor; area fires are background, not the primary driver.
    // Exception: area-only triggers (path score too low) bypass CAMS — local fires are
    // genuinely local and can't be assessed via the path corridor.
    const pathSuppressed =
      fireTransportByPath && params.camsMaxPm25 !== null && params.camsMaxPm25 < 25;
    const areaOnlyTrigger = fireTransportByArea && !fireTransportByPath;
    if (areaOnlyTrigger || !pathSuppressed) return 'PLAUSIBLE_FIRE_TRANSPORT';
    // Path fires suppressed by CAMS — fall through to urban/industrial or clean
  }

  if (params.latestPm25 <= 12) return 'PLAUSIBLE_CLEAN';
  if (params.trajectoryPrecipTotal > 40 && params.latestPm25 <= 25) return 'PLAUSIBLE_CLEAN';

  const hasNearbyUpwindSource = params.relevantSources.some((s) => s.isUpwind && s.distKm <= 150);
  if (hasNearbyUpwindSource) return 'PLAUSIBLE_URBAN_INDUSTRIAL';

  return 'PLAUSIBLE_UNCLEAR';
}
