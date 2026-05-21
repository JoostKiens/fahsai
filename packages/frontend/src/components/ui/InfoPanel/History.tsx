import { Fragment, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { StationDayHistory } from '@thailand-aq/types';
import { pm25ToSoftRgb } from '../../../lib/aqiColors';
import { degToCompass } from '../../../lib/ambient';
import { dateLocale } from '../../../i18n';
import { WindArrow } from './WindArrow';

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
        <div className="h-[15px] w-12 rounded animate-pulse bg-gray-100 mb-1" />
        <div className="grid grid-cols-[auto_1.3fr_1fr_1fr] gap-x-3 gap-y-[3px] items-center">
          {(['w-0', 'w-8', 'w-7', 'w-8'] as const).map((w, j) => (
            <div key={j} className={`h-[15px] rounded animate-pulse bg-gray-100 ${w}`} />
          ))}
          {SHIMMER_ROWS.map((cols, i) => (
            <Fragment key={i}>
              {cols.map((w, j) => (
                <div key={j} className={`h-[15px] rounded animate-pulse bg-gray-100 ${w}`} />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

function compass2(deg: number): string {
  const c = degToCompass(deg);
  return c.length > 2 ? c.slice(0, 2) : c;
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
        transition={{ duration: 0.12, ease: 'easeOut' }}
        className="bg-gray-900 text-white text-[11px] font-semibold tabular-nums px-2 py-1 rounded shadow-lg whitespace-nowrap"
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
          className="flex flex-col justify-between text-[10px] text-gray-400 text-right shrink-0"
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
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mt-3 mb-1">
        {t('history.weather')}
      </p>
      <div className="grid grid-cols-[auto_1.3fr_1fr_1fr] gap-x-3 gap-y-[3px] text-[10px] items-center">
        {/* Column headers */}
        <span />
        <span className="text-gray-500 uppercase tracking-wider">
          {t('history.wind')}{' '}
          <span className="normal-case tracking-normal text-gray-400">km/h</span>
        </span>
        <span className="text-center text-gray-500 uppercase tracking-wider">
          {t('history.rain')} <span className="normal-case tracking-normal text-gray-400">mm</span>
        </span>
        <span className="text-center text-gray-500 uppercase tracking-wider">
          {t('history.humidity')}{' '}
          <span className="normal-case tracking-normal text-gray-400">%</span>
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
