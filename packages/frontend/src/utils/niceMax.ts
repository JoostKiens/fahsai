export function niceMax(rawMax: number, targetTicks = 4): { max: number; step: number } {
  const rough = rawMax / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10) * mag;
  return { max: Math.ceil(rawMax / step) * step, step };
}
