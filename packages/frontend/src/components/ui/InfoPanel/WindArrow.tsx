// dirDeg is the FROM-direction (meteorological convention per CLAUDE.md).
// The arrow points in the TO direction (where wind is going) so +180 lives here only,
// never on text labels.
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
