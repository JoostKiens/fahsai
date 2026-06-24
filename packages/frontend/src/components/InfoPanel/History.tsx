import { Fragment, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { TWEEN_ENTER } from '@/utils/animation';
import { useTranslation } from 'react-i18next';
import type { StationDayHistory } from '@thailand-aq/types';
import { pm25ToRgb, pm25ToSoftRgb } from '@/utils/aqiColors';
import { niceMax } from '@/utils/niceMax';
import { degToCompass } from './ambient';
import { dateLocale } from '@/i18n';
import { Shimmer } from '@/components/Shimmer';
import { WindArrow } from './WindArrow';

const MAX_BAR_H = 72;
const DAY_LABEL_H = 20;

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

  const maxPm25 = niceMax(Math.max(...days.map((d) => d.pm25), 1)).max;
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
          className="flex flex-col justify-between text-[11px] text-zinc-500 font-mono text-right shrink-0"
          style={{ paddingBottom: `${DAY_LABEL_H}px` }}
        >
          <span>{Math.round(maxPm25)}</span>
          <span>0</span>
        </div>
        <div
          ref={chartRef}
          className="flex items-end gap-1.5 flex-1"
          style={{ height: `${MAX_BAR_H + DAY_LABEL_H}px` }}
        >
          {days.map(({ date, pm25: val, readingCount }) => {
            const barH =
              readingCount > 0 ? Math.max(2, Math.round((val / maxPm25) * MAX_BAR_H)) : 0;
            const [sr, sg, sb] = pm25ToSoftRgb(val);
            const [r, g, b] = pm25ToRgb(val);
            const isActive = activeDate === date;
            const hasData = readingCount > 0;

            return (
              <div
                key={date}
                className="flex flex-col items-center flex-1"
                onPointerEnter={(e) => {
                  if (e.pointerType === 'touch' || !hasData) return;
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
                  if (e.pointerType !== 'touch' || !hasData) return;
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
                  className="w-full"
                  style={{
                    height: `${barH}px`,
                    marginTop: `${MAX_BAR_H - barH}px`,
                    ...(hasData
                      ? {
                          background: `linear-gradient(to bottom, rgba(${sr},${sg},${sb},0.5), rgba(${sr},${sg},${sb},0.04))`,
                          borderLeft: `1px solid rgb(${r},${g},${b})`,
                          borderTop: `1px solid rgb(${r},${g},${b})`,
                          borderRight: `1px solid rgb(${r},${g},${b})`,
                          borderRadius: '5px 5px 0 0',
                        }
                      : {}),
                  }}
                />
                <span
                  className={`text-[11px] whitespace-nowrap mt-1 ${hasData ? 'text-zinc-500' : 'text-zinc-700'}`}
                >
                  {formatDateLabel(date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weather table */}
      <p className="text-[12px] text-zinc-300 mt-3 mb-1">{t('history.weather')}</p>
      <div className="grid grid-cols-[auto_1.3fr_1fr_1fr] gap-x-3 gap-y-[3px] text-[11px] items-center">
        {/* Column headers */}
        <span />
        <span className="text-zinc-500 uppercase tracking-wider text-[11px]">
          {t('history.wind')}{' '}
          <span className="normal-case tracking-normal text-zinc-400 font-mono">km/h</span>
        </span>
        <span className="text-center text-zinc-500 uppercase tracking-wider text-[11px]">
          {t('history.rain')}{' '}
          <span className="normal-case tracking-normal text-zinc-400 font-mono">mm</span>
        </span>
        <span className="text-center text-zinc-500 uppercase tracking-wider text-[11px]">
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
