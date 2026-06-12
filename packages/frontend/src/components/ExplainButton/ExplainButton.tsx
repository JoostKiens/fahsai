import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useExplain } from './useExplain';
import type { RateLimit } from './useExplain';
import { useTimeStore } from '@/store/timeStore';
import { sanitizeExplanation, parseBoldSegments } from './sanitize';

interface RateLimitControl {
  value: RateLimit | null;
  onSet: (v: RateLimit) => void;
  onClear: () => void;
}

interface Props {
  stationId: string;
  lat: number;
  lng: number;
  rateLimitControl: RateLimitControl;
  /** Override the button element's className (replaces the default ghost-button style). */
  className?: string;
}

function formatCountdown(ms: number): { value: number; unit: 'minutes' | 'seconds' } {
  if (ms > 60_000) return { value: Math.ceil(ms / 60_000), unit: 'minutes' };
  return { value: Math.max(1, Math.ceil(ms / 1000)), unit: 'seconds' };
}

function formatResetTime(resetAtMs: number): string {
  const now = new Date();
  const reset = new Date(resetAtMs);
  const sameDay =
    now.getFullYear() === reset.getFullYear() &&
    now.getMonth() === reset.getMonth() &&
    now.getDate() === reset.getDate();
  if (sameDay) {
    return reset.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return reset.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export function ExplainButton({ stationId, lat, lng, rateLimitControl, className }: Props) {
  const { t } = useTranslation();
  const { text, loading, phase, error, rateLimit, explain, reset } = useExplain();
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  // Propagate local rate limit to global store
  useEffect(() => {
    if (rateLimit) rateLimitControl.onSet(rateLimit);
  }, [rateLimit, rateLimitControl]);

  // Reset on date change
  useEffect(() => {
    reset();
  }, [selectedDate, reset]);

  const activeRateLimit = rateLimit ?? rateLimitControl.value;

  // Countdown timer — re-enables button at resetAtMs
  useEffect(() => {
    if (!activeRateLimit) {
      setRemainingMs(null);
      return;
    }
    const tick = () => {
      const ms = activeRateLimit.resetAtMs - Date.now();
      if (ms <= 0) {
        setRemainingMs(null);
        rateLimitControl.onClear();
      } else {
        setRemainingMs(ms);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeRateLimit, rateLimitControl]);

  const isDisabled = !!activeRateLimit || loading;
  const label =
    phase === 'fetching'
      ? t('explain.fetching')
      : phase === 'thinking'
        ? t('explain.thinking')
        : text
          ? t('explain.refresh')
          : t('explain.button');

  function handleClick() {
    if (text && !loading) {
      reset();
      return;
    }
    if (!loading) void explain({ stationId, lat, lng, date: selectedDate });
  }

  function rateLimitMessage(): string | null {
    if (!activeRateLimit) return null;
    const { type } = activeRateLimit;
    if (type === 'ip_ratelimit' && remainingMs !== null) {
      const { value, unit } = formatCountdown(remainingMs);
      return t('explain.rateLimitIp', { count: value, unit: t(`explain.timeUnit.${unit}`) });
    }
    if (type === 'quota_exceeded')
      return t('explain.rateLimitQuota', { time: formatResetTime(activeRateLimit.resetAtMs) });
    if ((type === 'gemini_rpm' || type === 'gemini_tpm') && remainingMs !== null) {
      const { value } = formatCountdown(remainingMs);
      return t('explain.rateLimitGeminiBusy', { count: value });
    }
    if (type === 'gemini_rpd')
      return t('explain.rateLimitGeminiRpd', { time: formatResetTime(activeRateLimit.resetAtMs) });
    // Unknown type: show countdown if available, otherwise generic daily message
    if (remainingMs !== null) {
      const { value, unit } = formatCountdown(remainingMs);
      return t('explain.rateLimitIp', { count: value, unit: t(`explain.timeUnit.${unit}`) });
    }
    return t('explain.rateLimitQuota');
  }

  const defaultButtonClass = [
    'w-full text-[11px] font-medium py-1 px-2 rounded border transition-colors ease-out hover:duration-[175ms]',
    isDisabled
      ? 'border-zinc-700 text-zinc-600 bg-transparent cursor-not-allowed'
      : 'border-teal-800 text-teal-400 bg-teal-950 hover:bg-teal-900',
  ].join(' ');

  const msg = rateLimitMessage();

  return (
    <div className="mt-2">
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className={className ?? defaultButtonClass}
      >
        {label}
      </button>

      {text && (
        <div className="mt-2 text-[11px] text-zinc-300 leading-relaxed whitespace-pre-line">
          {parseBoldSegments(sanitizeExplanation(text)).map((seg, i) =>
            seg.bold ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>,
          )}
        </div>
      )}

      {msg && <p className="mt-1 text-[10px] text-amber-400">{msg}</p>}
      {error === 'unavailable' && (
        <p className="mt-1 text-[10px] text-red-400">{t('explain.unavailable')}</p>
      )}
    </div>
  );
}
