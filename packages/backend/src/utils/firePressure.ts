export interface FireRow {
  detected_at: string;
  frp: number | null;
  distKm: number;
}

// Two-segment normalization — linear below 100 (preserves near-zero sensitivity),
// log scale above 100 (spreads the high-fire range across 15–100).
// Calibrated against real fire events:
//   raw 69    (Le Thai, low monsoon)      → ~10  Low
//   raw 1,163 (Ratchapracha, significant) → ~49  High
//   raw 2,859 (Chaloem, severe)           → ~62  Very high
//   raw 35,669 (Wiang Nuea, catastrophic) → ~97  Very high
export function computeFirePressureNorm(
  fires: FireRow[],
  corridorKm: number,
  anchorEndMs: number,
): number {
  const raw = fires.reduce((sum, f) => {
    const ageHours = Math.max(0, (anchorEndMs - new Date(f.detected_at).getTime()) / 3_600_000);
    const recencyWeight = 1 / (1 + ageHours / 24);
    const transportWeight = 1 / (1 + f.distKm / corridorKm) ** 2;
    return sum + (f.frp ?? 10) * recencyWeight * transportWeight;
  }, 0);

  if (raw < 100) {
    return Math.round((raw / 100) * 15);
  }
  return Math.min(100, Math.round(15 + (Math.log10(raw) - 2) * 32));
}
