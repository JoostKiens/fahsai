import { Fragment } from 'react';

// Widths for the four weather-table columns (date / wind / rain / humid).
// Vary per row so adjacent rows don't look like a solid block.
const SHIMMER_ROWS: [string, string, string, string][] = [
  ['w-8', 'w-14', 'w-5', 'w-5'],
  ['w-9', 'w-12', 'w-4', 'w-6'],
  ['w-8', 'w-16', 'w-5', 'w-5'],
  ['w-9', 'w-11', 'w-6', 'w-4'],
  ['w-8', 'w-13', 'w-4', 'w-5'],
];

export function ShimmerHistory() {
  return (
    <>
      {/* Bar chart ghost — same height as the real chart (48px bars + 16px labels) */}
      <div className="flex items-end gap-[2px] h-[64px]">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm animate-pulse bg-gray-100"
            style={{ height: `${24 + (i % 3) * 12}px` }}
          />
        ))}
      </div>

      {/* Weather section ghost — mirrors the "Weather" header + 6-row grid */}
      <div className="mt-3">
        {/* "Weather" label placeholder */}
        <div className="h-[10px] w-12 rounded animate-pulse bg-gray-100 mb-2" />

        {/* Column-header row + 5 data rows */}
        <div className="grid grid-cols-[auto_1.3fr_1fr_1fr] gap-x-3 gap-y-[3px] items-center">
          {/* Header row */}
          {(['w-0', 'w-8', 'w-7', 'w-8'] as const).map((w, j) => (
            <div key={j} className={`h-[10px] rounded animate-pulse bg-gray-100 ${w}`} />
          ))}

          {/* 5 data rows */}
          {SHIMMER_ROWS.map((cols, i) => (
            <Fragment key={i}>
              {cols.map((w, j) => (
                <div key={j} className={`h-[10px] rounded animate-pulse bg-gray-100 ${w}`} />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
import type { StationDayHistory } from '@thailand-aq/types';
import { pm25ToRgb } from '../../../lib/aqiColors';
import { degToCompass } from '../../../lib/ambient';
import { WindArrow } from './WindArrow';

function formatDateLabel(isoDate: string) {
  return new Date(isoDate + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function compass2(deg: number): string {
  const c = degToCompass(deg);
  return c.length > 2 ? c.slice(0, 2) : c;
}

export function History({ days }: { days: StationDayHistory[] }) {
  const MAX_BAR_H = 48;
  const DAY_LABEL_H = 16;
  const maxPm25 = Math.max(...days.map((d) => d.maxPm25), 1);

  return (
    <>
      {/* PM2.5 bar chart */}
      <div className="flex items-stretch gap-1">
        <div
          className="flex flex-col justify-between text-[10px] text-gray-400 text-right shrink-0"
          style={{ paddingBottom: `${DAY_LABEL_H}px` }}
        >
          <span>{Math.round(maxPm25)}</span>
          <span>0</span>
        </div>
        <div
          className="flex items-end gap-[2px] flex-1"
          style={{ height: `${MAX_BAR_H + DAY_LABEL_H}px` }}
        >
          {days.map(({ date, maxPm25: val, readingCount }) => {
            const barH =
              readingCount > 0 ? Math.max(2, Math.round((val / maxPm25) * MAX_BAR_H)) : 0;
            const [r, g, b] = pm25ToRgb(val);
            return (
              <div key={date} className="flex flex-col items-center flex-1">
                <div
                  className="w-full rounded-t-sm"
                  style={{
                    height: `${barH}px`,
                    backgroundColor: readingCount > 0 ? `rgb(${r},${g},${b})` : 'transparent',
                    marginTop: `${MAX_BAR_H - barH}px`,
                  }}
                />
                <span
                  className={`text-[10px] whitespace-nowrap mt-1 ${readingCount > 0 ? 'text-gray-400' : 'text-gray-200'}`}
                >
                  {formatDateLabel(date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weather table */}
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mt-3 mb-1">Weather</p>
      <div className="grid grid-cols-[auto_1.3fr_1fr_1fr] gap-x-3 gap-y-[3px] text-[10px] items-center">
        {/* Column headers */}
        <span />
        <span className="text-gray-500 uppercase tracking-wider">
          Wind <span className="normal-case tracking-normal text-gray-400">km/h</span>
        </span>
        <span className="text-center text-gray-500 uppercase tracking-wider">
          Rain <span className="normal-case tracking-normal text-gray-400">mm</span>
        </span>
        <span className="text-center text-gray-500 uppercase tracking-wider">
          Humid <span className="normal-case tracking-normal text-gray-400">%</span>
        </span>

        {/* Data rows */}
        {days.map((d) => {
          const w = d.weather;
          return (
            <Fragment key={d.date}>
              <span className="text-gray-500 font-medium whitespace-nowrap">
                {formatDateLabel(d.date)}
              </span>

              {w?.windDirectionDeg !== null && w?.windDirectionDeg !== undefined ? (
                <span className="inline-flex items-center gap-1 text-gray-700">
                  <WindArrow
                    dirDeg={w.windDirectionDeg}
                    size={10}
                    color="#6b7280"
                    strokeWidth={1.5}
                  />
                  <span className="text-gray-500">{compass2(w.windDirectionDeg)}</span>
                  <span className="font-medium tabular-nums">
                    {w.windSpeedKmh !== null ? Math.round(w.windSpeedKmh) : '—'}
                  </span>
                </span>
              ) : (
                <span className="text-gray-400">—</span>
              )}

              {w?.precipitationSumMm !== null && w?.precipitationSumMm !== undefined ? (
                <span
                  className={`text-center tabular-nums ${w.precipitationSumMm === 0 ? 'text-gray-400' : 'text-sky-600 font-medium'}`}
                >
                  {w.precipitationSumMm === 0
                    ? '—'
                    : String(Math.round(w.precipitationSumMm * 10) / 10)}
                </span>
              ) : (
                <span className="text-gray-400 text-center">—</span>
              )}

              {w?.relativeHumidity2m !== null && w?.relativeHumidity2m !== undefined ? (
                <span className="text-gray-500 tabular-nums text-center">
                  {Math.round(w.relativeHumidity2m)}
                </span>
              ) : (
                <span className="text-gray-400 text-center">—</span>
              )}
            </Fragment>
          );
        })}
      </div>
    </>
  );
}
