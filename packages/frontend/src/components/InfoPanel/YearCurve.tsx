import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BaselineDay } from '@thailand-aq/types';
import { dateLocale } from '@/utils/locale';
import { pm25ToRgbLerped } from '@/utils/aqiColors';
import { niceMax } from '@/utils/niceMax';

const W = 260;
const H = 140;
const PAD_L = 22;
const PAD_R = 4;
const PAD_T = 10;
const PAD_B = 24;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const YEAR_DAYS = 365;

function dayOfYear(month: number, day: number): number {
  let doy = 0;
  for (let m = 0; m < month - 1; m++) doy += MONTH_DAYS[m];
  return doy + day;
}

export function YearCurve({
  data,
  currentPm25,
  selectedDate,
}: {
  data: BaselineDay[];
  currentPm25: number | null;
  selectedDate: string;
}) {
  const { i18n } = useTranslation();
  const locale = dateLocale(i18n.language);
  const gradId = `median-grad-${useId()}`;

  const { bandPath, medianPath, maxVal, yTicks, monthLabels, gradientStops } = useMemo(() => {
    const { max: maxVal, step } = niceMax(
      Math.max(...data.map((d) => d.p75Pm25), currentPm25 ?? 0, 10),
    );

    const x = (doy: number) => PAD_L + ((doy - 1) / (YEAR_DAYS - 1)) * PLOT_W;
    const y = (val: number) => PAD_T + PLOT_H * (1 - val / maxVal);

    const points = data
      .map((d) => ({ ...d, doy: dayOfYear(d.month, d.day) }))
      .sort((a, b) => a.doy - b.doy);

    // Break the line and band at missing days so a gap isn't drawn as if it were data.
    const segments: (typeof points)[] = [];
    points.forEach((point, i) => {
      const startsSegment = i === 0 || point.doy - points[i - 1].doy > 1;
      if (startsSegment) segments.push([]);
      segments[segments.length - 1].push(point);
    });

    const bandPath = segments
      .map((segment) => {
        const upper = segment.map((p) => `${x(p.doy)},${y(p.p75Pm25)}`);
        const lower = [...segment].reverse().map((p) => `${x(p.doy)},${y(p.p25Pm25)}`);
        return `M${upper.join('L')}L${lower.join('L')}Z`;
      })
      .join('');

    // A lone day becomes a zero-length line, which the round caps below draw as a dot; a bare
    // move ("M x,y") is never stroked.
    const medianPath = segments
      .map((segment) => (segment.length === 1 ? [segment[0], segment[0]] : segment))
      .map((segment) => 'M' + segment.map((p) => `${x(p.doy)},${y(p.medianPm25)}`).join('L'))
      .join('');
    const yTicks: number[] = [];
    for (let v = step; v < maxVal; v += step) yTicks.push(v);

    const gradientStops = points.map((p) => {
      const [r, g, b] = pm25ToRgbLerped(p.medianPm25);
      return {
        offset: `${((x(p.doy) - PAD_L) / PLOT_W) * 100}%`,
        color: `rgb(${r},${g},${b})`,
      };
    });

    const monthLabels = [0, 2, 4, 6, 8, 10].map((i) => {
      const doy = dayOfYear(i + 1, 15);
      const label = new Date(2024, i, 1).toLocaleDateString(locale, { month: 'short' });
      return { x: x(doy), label };
    });

    return { bandPath, medianPath, maxVal, yTicks, monthLabels, gradientStops };
  }, [data, currentPm25, locale]);

  const selMonth = Number(selectedDate.slice(5, 7));
  const selDay = Number(selectedDate.slice(8, 10));
  const doy = dayOfYear(selMonth, selDay);
  const todayX = PAD_L + ((doy - 1) / (YEAR_DAYS - 1)) * PLOT_W;
  const yScale = (val: number) => PAD_T + PLOT_H * (1 - val / maxVal);

  return (
    // ponytail: HTML labels use %-positioning tied to the SVG viewBox aspect ratio; breaks if this div gains padding/siblings
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden>
        <defs>
          <linearGradient
            id={gradId}
            gradientUnits="userSpaceOnUse"
            x1={PAD_L}
            y1="0"
            x2={W - PAD_R}
            y2="0"
          >
            {gradientStops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
        {/* Y-axis grid lines */}
        {yTicks.map((v) => (
          <line
            key={v}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={yScale(v)}
            y2={yScale(v)}
            stroke="#3f3f46"
            strokeWidth={0.5}
          />
        ))}

        {/* P25–P75 band */}
        <path d={bandPath} fill="rgba(113,113,122,0.4)" />

        {/* Median line */}
        <path
          d={medianPath}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={1.2}
          // Draws the zero-length segment of a lone baseline day as a dot.
          strokeLinecap="round"
          data-testid="median-line"
        />

        {/* Today marker line */}
        <line
          x1={todayX}
          x2={todayX}
          y1={PAD_T}
          y2={PAD_T + PLOT_H}
          stroke="#5eead4"
          strokeWidth={0.7}
          strokeDasharray="3 2"
        />

        {/* Current reading dot */}
        {currentPm25 !== null && (
          <circle
            cx={todayX}
            cy={yScale(currentPm25)}
            r={3}
            fill={`rgb(${pm25ToRgbLerped(currentPm25).join(',')})`}
          />
        )}
      </svg>

      {/* Y-axis labels (HTML for consistent 11px sizing) */}
      {yTicks.map((v) => (
        <span
          key={v}
          className="absolute text-[11px] text-zinc-400 font-mono"
          style={{
            left: `${((PAD_L - 3) / W) * 100}%`,
            top: `${(yScale(v) / H) * 100}%`,
            transform: 'translate(-100%, -50%)',
          }}
        >
          {v}
        </span>
      ))}

      {/* Month labels (HTML for consistent 11px sizing) */}
      {monthLabels.map(({ x, label }) => (
        <span
          key={label}
          className="absolute text-[11px] text-zinc-400"
          style={{
            left: `${(x / W) * 100}%`,
            top: `${((H - 5) / H) * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
