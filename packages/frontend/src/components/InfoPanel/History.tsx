import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { StationDayHistory } from '@thailand-aq/types';
import { degToCompass } from './utils.ambient';
import { dateLocale } from '@/utils/locale';
import { Shimmer } from '@/components/Shimmer';
import { WindArrow } from './WindArrow';
import { DAY_LABEL_H, DEFAULT_BAR_H as MAX_BAR_H, PmBarChart, formatDayLabel } from './PmBarChart';

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
      {/* PM2.5 bar chart — mirrors History's layout (y-axis + bars + day labels) */}
      <div className="flex items-stretch gap-1">
        <div
          className="flex flex-col justify-between shrink-0"
          style={{ paddingBottom: `${DAY_LABEL_H}px` }}
        >
          <Shimmer className="h-4.5 w-5" />
          <Shimmer className="h-4.5 w-3" />
        </div>
        <div
          className="flex items-end gap-1.5 flex-1"
          style={{ height: `${MAX_BAR_H + DAY_LABEL_H}px` }}
        >
          {Array.from({ length: 5 }, (_, i) => {
            const barH = 36 + (i % 3) * 16;
            return (
              <div key={i} className="flex flex-col items-center flex-1">
                <div
                  className="w-full rounded-t-[5px] animate-pulse [animation-duration:1.2s] bg-zinc-700"
                  style={{ height: `${barH}px`, marginTop: `${MAX_BAR_H - barH}px` }}
                />
                <Shimmer className="h-4.5 w-8 mt-1" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3">
        <Shimmer className="h-5 w-12 mb-1" />
        <div className="grid grid-cols-[auto_1.3fr_1fr_1fr] gap-x-3 gap-y-[3px] items-center">
          {(['w-0', 'w-8', 'w-7', 'w-8'] as const).map((w, j) => (
            <Shimmer key={j} className={`h-4.5 ${w}`} />
          ))}
          {SHIMMER_ROWS.map((cols, i) => (
            <Fragment key={i}>
              {cols.map((w, j) => (
                <Shimmer key={j} className={`h-5 ${w}`} />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * A station's last few days in the info panel: a bar per day for PM2.5, coloured by category, and
 * a weather table (wind, rain, humidity) below. Days without readings keep their date but have no
 * bar, and missing weather shows a dash.
 */
export function History({ days }: { days: StationDayHistory[] }) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);

  return (
    <>
      <PmBarChart days={days} />

      {/* Weather table */}
      <p className="text-[12px] text-zinc-300 mt-3 mb-1">{t('history.weather')}</p>
      <div className="grid grid-cols-[auto_1.3fr_1fr_1fr] gap-x-3 gap-y-[3px] text-[11px] items-center">
        {/* Column headers */}
        <span />
        <span className="text-zinc-400 uppercase tracking-wider text-[11px]">
          {t('history.wind')}{' '}
          <span className="normal-case tracking-normal text-zinc-400 font-mono">km/h</span>
        </span>
        <span className="text-center text-zinc-400 uppercase tracking-wider text-[11px]">
          {t('history.rain')}{' '}
          <span className="normal-case tracking-normal text-zinc-400 font-mono">mm</span>
        </span>
        <span className="text-center text-zinc-400 uppercase tracking-wider text-[11px]">
          {t('history.humidity')}{' '}
          <span className="normal-case tracking-normal text-zinc-400 font-mono">%</span>
        </span>

        {/* Data rows */}
        {days.map((d) => {
          const w = d.weather;
          return (
            <Fragment key={d.date}>
              <span className="text-zinc-400 font-medium whitespace-nowrap">
                {formatDayLabel(d.date, locale)}
              </span>

              {w?.windDirectionDeg !== null && w?.windDirectionDeg !== undefined ? (
                <span className="inline-flex items-center gap-1 text-zinc-300">
                  <WindArrow
                    dirDeg={w.windDirectionDeg}
                    size={10}
                    color="#a1a1aa"
                    strokeWidth={1.5}
                  />
                  <span className="text-zinc-400">{degToCompass(w.windDirectionDeg)}</span>
                  <span className="tabular-nums">
                    {w.windSpeedKmh !== null ? Math.round(w.windSpeedKmh) : '-'}
                  </span>
                </span>
              ) : (
                <span className="text-zinc-600">-</span>
              )}

              {w?.precipitationSumMm !== null && w?.precipitationSumMm !== undefined ? (
                <span className="text-center tabular-nums text-zinc-300">
                  {w.precipitationSumMm === 0
                    ? '0'
                    : String(Math.round(w.precipitationSumMm * 10) / 10)}
                </span>
              ) : (
                <span className="text-zinc-600 text-center">-</span>
              )}

              {w?.relativeHumidity2m !== null && w?.relativeHumidity2m !== undefined ? (
                <span className="text-zinc-300 tabular-nums text-center">
                  {Math.round(w.relativeHumidity2m)}
                </span>
              ) : (
                <span className="text-zinc-600 text-center">-</span>
              )}
            </Fragment>
          );
        })}
      </div>
    </>
  );
}
