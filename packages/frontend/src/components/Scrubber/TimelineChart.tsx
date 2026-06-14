import { dayToDate } from '@/store/uiStore';
import { pm25ToRgbLerped } from '@/utils/aqiColors';

// Controls the chart height — change this constant to resize.
const CHART_HEIGHT_PX = 48;

interface Props {
  timeline: Map<string, number> | undefined;
  scrubberDay: number;
  latestDate: string;
  scrubberDays: number;
}

export function TimelineChart({ timeline, scrubberDay, latestDate, scrubberDays }: Props) {
  if (!timeline?.size) {
    return <div style={{ height: CHART_HEIGHT_PX }} aria-hidden />;
  }

  const data = Array.from({ length: scrubberDays }, (_, day) => ({
    day,
    pm25: timeline.get(dayToDate(day, latestDate, scrubberDays)),
  }));

  const values = data.flatMap((d) => (d.pm25 !== undefined ? [d.pm25] : []));
  if (!values.length) {
    return <div style={{ height: CHART_HEIGHT_PX }} aria-hidden />;
  }

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  // Maps a pm25 value to a y coordinate in the 0–100 viewBox (0 = top).
  // 5% padding at top and bottom keeps the line off the edges.
  const toY = (pm25: number) => 5 + (1 - (pm25 - minVal) / range) * 90;

  // SVG path with M (move) after gaps in data, L (line) for consecutive points.
  let pathD = '';
  let prevHadData = false;
  for (const { day, pm25 } of data) {
    if (pm25 === undefined) {
      prevHadData = false;
      continue;
    }
    const x = day;
    const y = toY(pm25);
    pathD += prevHadData ? ` L ${x} ${y}` : ` M ${x} ${y}`;
    prevHadData = true;
  }

  const xMax = scrubberDays - 1;

  const gradientStops = data
    .filter((d) => d.pm25 !== undefined)
    .map(({ day, pm25 }) => {
      const [r, g, b] = pm25ToRgbLerped(pm25!);
      return {
        offset: `${(day / xMax) * 100}%`,
        color: `rgb(${r},${g},${b})`,
      };
    });

  return (
    <svg
      width="100%"
      height={CHART_HEIGHT_PX}
      viewBox={`0 0 ${xMax} 100`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient
          id="timeline-grad"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={xMax}
          y2="0"
        >
          {gradientStops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <path
        d={pathD}
        fill="none"
        stroke="url(#timeline-grad)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={scrubberDay}
        y1="0"
        x2={scrubberDay}
        y2="100"
        stroke="white"
        strokeOpacity="0.35"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
