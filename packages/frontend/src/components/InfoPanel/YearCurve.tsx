import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BaselineDay } from '@thailand-aq/types';
import { dateLocale } from '@/i18n';
import { pm25ToRgbLerped } from '@/utils/aqiColors';

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
    const rawMax = Math.max(...data.map((d) => d.p75Pm25), currentPm25 ?? 0, 10);
    const rough = rawMax / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    const step = (norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10) * mag;
    const maxVal = Math.ceil(rawMax / step) * step;

    const x = (doy: number) => PAD_L + ((doy - 1) / (YEAR_DAYS - 1)) * PLOT_W;
    const y = (val: number) => PAD_T + PLOT_H * (1 - val / maxVal);

    const sorted = [...data].sort((a, b) => dayOfYear(a.month, a.day) - dayOfYear(b.month, b.day));

    const bandUpper = sorted.map((d) => `${x(dayOfYear(d.month, d.day))},${y(d.p75Pm25)}`);
    const bandLower = [...sorted]
      .reverse()
      .map((d) => `${x(dayOfYear(d.month, d.day))},${y(d.p25Pm25)}`);
    const bandPath = `M${bandUpper.join('L')}L${bandLower.join('L')}Z`;

    const medianPath =
      'M' + sorted.map((d) => `${x(dayOfYear(d.month, d.day))},${y(d.medianPm25)}`).join('L');
    const yTicks: number[] = [];
    for (let v = step; v < maxVal; v += step) yTicks.push(v);

    const gradientStops = sorted.map((d) => {
      const [r, g, b] = pm25ToRgbLerped(d.medianPm25);
      return {
        offset: `${((x(dayOfYear(d.month, d.day)) - PAD_L) / PLOT_W) * 100}%`,
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
        <path d={medianPath} fill="none" stroke={`url(#${gradId})`} strokeWidth={1.2} />

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
          className="absolute text-[11px] text-zinc-500 font-mono"
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
          className="absolute text-[11px] text-zinc-500"
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
