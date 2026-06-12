import { Fragment, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { TWEEN_ENTER } from '@/utils/animation';
import { useTranslation } from 'react-i18next';
import type { StationDayHistory } from '@thailand-aq/types';
import { pm25ToSoftRgb } from '@/utils/aqiColors';
import { degToCompass } from './ambient';
import { dateLocale } from '@/i18n';
import { WindArrow } from './WindArrow';

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
      <div className="flex items-end gap-[2px] h-[64px]">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm animate-pulse bg-zinc-700"
            style={{ height: `${24 + (i % 3) * 12}px` }}
          />
        ))}
      </div>

      <div className="mt-3">
        <div className="h-[15px] w-12 rounded animate-pulse bg-zinc-700 mb-1" />
        <div className="grid grid-cols-[auto_1.3fr_1fr_1fr] gap-x-3 gap-y-[3px] items-center">
          {(['w-0', 'w-8', 'w-7', 'w-8'] as const).map((w, j) => (
            <div key={j} className={`h-[15px] rounded animate-pulse bg-zinc-700 ${w}`} />
          ))}
          {SHIMMER_ROWS.map((cols, i) => (
            <Fragment key={i}>
              {cols.map((w, j) => (
                <div key={j} className={`h-[15px] rounded animate-pulse bg-zinc-700 ${w}`} />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

type TooltipState = { value: number; x: number; y: number } | null;

function BarTooltip({ value, x, y }: { value: number; x: number; y: number }) {
  return createPortal(
    <div
      className="fixed z-10 pointer-events-none"
      style={{ left: x, top: y, transform: 'translate(-50%, calc(-100% - 6px))' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={TWEEN_ENTER}
        className="bg-zinc-950 border border-zinc-800 text-zinc-100 text-[11px] font-semibold tabular-nums px-2 py-1 rounded shadow-lg whitespace-nowrap"
      >
        {Math.round(value)} <span className="font-normal opacity-60">µg/m³</span>
      </motion.div>
    </div>,
    document.getElementById('tooltip')!,
  );
}

export function History({ days }: { days: StationDayHistory[] }) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);

  const MAX_BAR_H = 48;
  const DAY_LABEL_H = 16;
  const maxPm25 = Math.max(...days.map((d) => d.maxPm25), 1);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  function formatDateLabel(isoDate: string) {
    return new Date(isoDate + 'T00:00:00Z').toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  }

  useEffect(() => {
    if (!activeDate) return;
    function onTouchStart(e: TouchEvent) {
      if (!chartRef.current?.contains(e.target as Node)) {
        setTooltip(null);
        setActiveDate(null);
      }
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    return () => document.removeEventListener('touchstart', onTouchStart);
  }, [activeDate]);

  useEffect(() => {
    return () => {
      setTooltip(null);
      setActiveDate(null);
    };
  }, []);

  return (
    <>
      {tooltip && <BarTooltip {...tooltip} />}

      {/* PM2.5 bar chart */}
      <div className="flex items-stretch gap-1">
        <div
          className="flex flex-col justify-between text-[10px] text-zinc-500 font-mono text-right shrink-0"
          style={{ paddingBottom: `${DAY_LABEL_H}px` }}
        >
          <span>{Math.round(maxPm25)}</span>
          <span>0</span>
        </div>
        <div
          ref={chartRef}
          className="flex items-end gap-[2px] flex-1"
          style={{ height: `${MAX_BAR_H + DAY_LABEL_H}px` }}
        >
          {days.map(({ date, maxPm25: val, readingCount }) => {
            const barH =
              readingCount > 0 ? Math.max(2, Math.round((val / maxPm25) * MAX_BAR_H)) : 0;
            const [r, g, b] = pm25ToSoftRgb(val);
            const isActive = activeDate === date;

            return (
              <div
                key={date}
                className="flex flex-col items-center flex-1"
                onPointerEnter={(e) => {
                  if (e.pointerType === 'touch' || readingCount === 0) return;
                  const col = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    value: val,
                    x: col.left + col.width / 2,
                    y: col.top + (MAX_BAR_H - barH),
                  });
                  setActiveDate(date);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === 'touch') return;
                  setTooltip(null);
                  setActiveDate(null);
                }}
                onPointerDown={(e) => {
                  if (e.pointerType !== 'touch' || readingCount === 0) return;
                  if (isActive) {
                    setTooltip(null);
                    setActiveDate(null);
                  } else {
                    const col = e.currentTarget.getBoundingClientRect();
                    setTooltip({
                      value: val,
                      x: col.left + col.width / 2,
                      y: col.top + (MAX_BAR_H - barH),
                    });
                    setActiveDate(date);
                  }
                }}
              >
                <div
                  className="w-full rounded-t-sm"
                  style={{
                    height: `${barH}px`,
                    backgroundColor: readingCount > 0 ? `rgb(${r},${g},${b})` : 'transparent',
                    marginTop: `${MAX_BAR_H - barH}px`,
                  }}
                />
                <span
                  className={`text-[10px] whitespace-nowrap mt-1 ${readingCount > 0 ? 'text-zinc-400' : 'text-zinc-700'}`}
                >
                  {formatDateLabel(date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weather table */}
      <p className="text-[11px] text-zinc-400 mt-3 mb-1">{t('history.weather')}</p>
      <div className="grid grid-cols-[auto_1.3fr_1fr_1fr] gap-x-3 gap-y-[3px] text-[11px] items-center">
        {/* Column headers */}
        <span />
        <span className="text-zinc-500 uppercase tracking-wider text-[10px]">
          {t('history.wind')}{' '}
          <span className="normal-case tracking-normal text-zinc-400 font-mono">km/h</span>
        </span>
        <span className="text-center text-zinc-500 uppercase tracking-wider text-[10px]">
          {t('history.rain')}{' '}
          <span className="normal-case tracking-normal text-zinc-400 font-mono">mm</span>
        </span>
        <span className="text-center text-zinc-500 uppercase tracking-wider text-[10px]">
          {t('history.humidity')}{' '}
          <span className="normal-case tracking-normal text-zinc-400 font-mono">%</span>
        </span>

        {/* Data rows */}
        {days.map((d) => {
          const w = d.weather;
          return (
            <Fragment key={d.date}>
              <span className="text-zinc-400 font-medium whitespace-nowrap">
                {formatDateLabel(d.date)}
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
