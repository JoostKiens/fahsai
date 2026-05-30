import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Slider, type SliderRootChangeEventDetails } from '@base-ui-components/react/slider';
import { Tooltip } from '@base-ui-components/react/tooltip';
import {
  useUIStore,
  dayToDate,
  useEffectiveScrubberDays,
  getEffectiveScrubberDays,
} from '../../../store/uiStore';
import { useTimeStore } from '../../../store/timeStore';
import { dateLocale } from '../../../i18n';
import { PlayButton } from './PlayButton';

const PLAY_INTERVAL_MS = 800;
const DEBOUNCE_MS = 300;

function formatDate(dateStr: string, locale: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatTickDate(dateStr: string, locale: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function Scrubber() {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);

  const scrubberDay = useUIStore((s) => s.scrubberDay);
  const setScrubberDay = useUIStore((s) => s.setScrubberDay);
  const scrubberDays = useEffectiveScrubberDays();
  const playing = useUIStore((s) => s.playing);
  const setPlaying = useUIStore((s) => s.setPlaying);
  const setDate = useTimeStore((s) => s.setDate);
  const latestDate = useTimeStore((s) => s.latestDate);

  const [isDragging, setIsDragging] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const dateStr = dayToDate(scrubberDay, latestDate, scrubberDays);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDate(dateStr);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [dateStr, setDate]);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        const current = useUIStore.getState().scrubberDay;
        const days = getEffectiveScrubberDays();
        setScrubberDay(current >= days - 1 ? 0 : current + 1);
      }, PLAY_INTERVAL_MS);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, setScrubberDay]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== ' ') return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      setPlaying(!playing);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [playing, setPlaying]);

  function handleValueChange(value: number, eventDetails: SliderRootChangeEventDetails) {
    setScrubberDay(value);
    if (playing) setPlaying(false);
    if (eventDetails.reason === 'drag') setIsDragging(true);
  }

  function handleValueCommitted() {
    setIsDragging(false);
  }

  return (
    <div
      className="bg-white border-t border-gray-200 pointer-events-auto px-4
                 flex flex-col gap-1 py-1.5
                 md:h-[52px] md:flex-row md:items-center md:gap-3 md:py-0"
    >
      {/* Row 1 — mobile only: date + timezone */}
      <div className="flex items-baseline justify-between md:hidden">
        <span className="text-[13px] font-semibold text-gray-900 tabular-nums">
          {formatDate(dateStr, locale)}
        </span>
        <span className="text-[10px] text-gray-400 font-medium tabular-nums">UTC+7</span>
      </div>

      {/* Row 2 — slider (+ play button and date on desktop) */}
      <div className="flex items-center gap-3 md:flex-1">
        <div className="hidden md:block">
          <PlayButton playing={playing} onToggle={() => setPlaying(!playing)} />
        </div>

        <span className="hidden md:block text-xs font-medium text-gray-700 tabular-nums w-[100px] shrink-0">
          {formatDate(dateStr, locale)}
        </span>

        <div className="flex-1 min-w-0">
          <Slider.Root
            value={scrubberDay}
            onValueChange={handleValueChange}
            onValueCommitted={handleValueCommitted}
            min={0}
            max={scrubberDays - 1}
            step={1}
            className="w-full md:mt-4"
          >
            <Slider.Control className="flex w-full touch-none cursor-pointer items-center">
              <Slider.Track className="relative h-1 w-full rounded-full bg-gray-200">
                <Slider.Thumb
                  ref={thumbRef}
                  className="size-4 rounded-full bg-teal-600 ring-2 ring-white shadow-sm outline-none cursor-grab data-dragging:cursor-grabbing pointer-coarse:size-[44px] pointer-coarse:[background:radial-gradient(circle_at_center,#0d9488_0_8px,white_8px_10px,transparent_10px)] pointer-coarse:[box-shadow:none]"
                  getAriaLabel={() => t('scrubber.selectDate')}
                  getAriaValueText={(_, value) =>
                    formatDate(dayToDate(value, latestDate, scrubberDays), locale)
                  }
                />
              </Slider.Track>
            </Slider.Control>
          </Slider.Root>
          <Tooltip.Root open={isDragging}>
            <Tooltip.Portal>
              <Tooltip.Positioner side="top" sideOffset={8} anchor={thumbRef} className="z-50">
                <Tooltip.Popup className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-md">
                  {formatDate(dateStr, locale)}
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          {/* Desktop: start + middle + end ticks */}
          <div className="hidden md:flex justify-between mt-0.5">
            <span className="text-[10px] text-gray-400 tabular-nums">
              {formatTickDate(dayToDate(0, latestDate, scrubberDays), locale)}
            </span>
            <span className="text-[10px] text-gray-400 tabular-nums">
              {formatTickDate(
                dayToDate(Math.floor((scrubberDays - 1) / 2), latestDate, scrubberDays),
                locale,
              )}
            </span>
            <span className="text-[10px] text-gray-400 tabular-nums">
              {formatTickDate(latestDate, locale)} · UTC+7
            </span>
          </div>
          {/* Mobile: start + end ticks only (UTC+7 already in row 1) */}
          <div className="flex md:hidden justify-between mt-0.5">
            <span className="text-[10px] text-gray-400 tabular-nums">
              {formatTickDate(dayToDate(0, latestDate, scrubberDays), locale)}
            </span>
            <span className="text-[10px] text-gray-400 tabular-nums">
              {formatTickDate(latestDate, locale)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
