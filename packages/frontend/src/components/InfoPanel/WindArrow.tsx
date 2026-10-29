/**
 * An arrow showing which way the wind blows. `dirDeg` is the direction the wind comes from (the
 * meteorological convention); the arrow points where it goes, so it's turned 180°. That flip
 * happens here only, never in text labels.
 */
export function WindArrow({
  dirDeg,
  size = 10,
  color = 'currentColor',
  strokeWidth = 1.5,
}: {
  dirDeg: number;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const rot = dirDeg + 180;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ transform: `rotate(${rot}deg)` }}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2 L8 13" />
      <path d="M4.5 5.5 L8 2 L11.5 5.5" />
    </svg>
  );
}
