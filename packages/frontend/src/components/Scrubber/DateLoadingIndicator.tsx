import { useTranslation } from 'react-i18next';

/**
 * A small spinner beside the scrubber's date while the map is still loading that date. The live
 * region is always there so screen readers hear it appear; the spinner fades in late
 * (animate-fade-in-late), so a date that loads quickly never flashes it.
 */
export function DateLoadingIndicator({ loading }: { loading: boolean }) {
  const { t } = useTranslation();
  return (
    <span role="status" className="inline-flex size-3 shrink-0">
      {loading && (
        <span className="inline-flex animate-fade-in-late">
          <svg
            viewBox="0 0 12 12"
            className="size-3 motion-safe:animate-spin text-zinc-400"
            aria-hidden="true"
          >
            <circle
              cx="6"
              cy="6"
              r="4.5"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.3"
              strokeWidth="1.5"
            />
            <path
              d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span className="sr-only">{t('scrubber.loadingDate')}</span>
        </span>
      )}
    </span>
  );
}
