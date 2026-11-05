import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { StationDayHistory } from '@thailand-aq/types';
import { TWEEN_ENTER } from '@/utils/animation';
import { pm25ToRgb, pm25ToSoftRgb } from '@/utils/aqiColors';
import { niceMax } from '@/utils/niceMax';
import { dateLocale } from '@/utils/locale';

/** The bar height the info panel uses, in px */
export const DEFAULT_BAR_H = 72;
export const DAY_LABEL_H = 20;

/** A day as its short label, for example 24 Oct */
export function formatDayLabel(isoDate: string, locale: string): string {
  return new Date(isoDate + 'T00:00:00Z').toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** What a bar needs of a day; a day without readings (readingCount 0) keeps its label, no bar */
export type PmBarDay = Pick<StationDayHistory, 'date' | 'pm25' | 'readingCount'>;

type TooltipState = { value: number; x: number; y: number } | null;

function BarTooltip({ value, x, y }: { value: number; x: number; y: number }) {
  return createPortal(
    <div
      className="fixed z-60 pointer-events-none"
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
    document.body,
  );
}

/**
 * A bar per day for PM2.5, coloured by category, with a y-axis, day labels and a value tooltip on
 * hover or tap. The bars are plain markup, so it renders on the server; the tooltip only exists
 * once a pointer has touched a bar.
 */
export function PmBarChart({
  days,
  barHeight = DEFAULT_BAR_H,
}: {
  days: PmBarDay[];
  /** Height of the tallest possible bar, in px */
  barHeight?: number;
}) {
  const { i18n } = useTranslation();
  const locale = dateLocale(i18n.language);

  const maxPm25 = niceMax(Math.max(...days.map((d) => d.pm25), 1)).max;
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeDate) return;
    function onTouchStart(e: TouchEvent) {
      if (!chartRef.current?.contains(e.target as Node)) {
        setTooltip(null);
        setActiveDate(null);
      }
    }
    // The tooltip is fixed at viewport coordinates from the tap, so any scroll strands it. Scroll
    // events don't bubble, so listen in the capture phase to catch the panel's own scroll container.
    function dismiss() {
      setTooltip(null);
      setActiveDate(null);
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('scroll', dismiss, { capture: true, passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('scroll', dismiss, { capture: true });
    };
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
          style={{ height: `${barHeight + DAY_LABEL_H}px` }}
        >
          {days.map(({ date, pm25: val, readingCount }) => {
            const barH =
              readingCount > 0 ? Math.max(2, Math.round((val / maxPm25) * barHeight)) : 0;
            const [sr, sg, sb] = pm25ToSoftRgb(val);
            const [r, g, b] = pm25ToRgb(val);
            const isActive = activeDate === date;
            const hasData = readingCount > 0;

            return (
              <div
                key={date}
                className="flex flex-col items-center flex-1"
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'mouse' || !hasData) return;
                  const col = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    value: val,
                    x: col.left + col.width / 2,
                    y: col.top + (barHeight - barH),
                  });
                  setActiveDate(date);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  setTooltip(null);
                  setActiveDate(null);
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' || !hasData) return;
                  if (isActive) {
                    setTooltip(null);
                    setActiveDate(null);
                  } else {
                    const col = e.currentTarget.getBoundingClientRect();
                    setTooltip({
                      value: val,
                      x: col.left + col.width / 2,
                      y: col.top + (barHeight - barH),
                    });
                    setActiveDate(date);
                  }
                }}
              >
                <div
                  className="w-full"
                  style={{
                    height: `${barH}px`,
                    marginTop: `${barHeight - barH}px`,
                    ...(hasData
                      ? {
                          background: `linear-gradient(to bottom, rgba(${sr},${sg},${sb},0.7), rgba(${sr},${sg},${sb},0.1))`,
                          borderLeft: `1px solid rgb(${r},${g},${b})`,
                          borderTop: `1px solid rgb(${r},${g},${b})`,
                          borderRight: `1px solid rgb(${r},${g},${b})`,
                          borderRadius: '5px 5px 0 0',
                        }
                      : {}),
                  }}
                />
                <span
                  className={`text-[11px] whitespace-nowrap mt-1 ${hasData ? 'text-zinc-300' : 'text-zinc-500'}`}
                >
                  {formatDayLabel(date, locale)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
