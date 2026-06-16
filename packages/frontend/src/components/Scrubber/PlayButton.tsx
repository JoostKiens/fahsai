import { useTranslation } from 'react-i18next';

interface Props {
  playing: boolean;
  onToggle: () => void;
}

export function PlayButton({ playing, onToggle }: Props) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onToggle}
      aria-label={playing ? t('scrubber.pause') : t('scrubber.play')}
      className="w-8 h-8 flex items-center justify-center rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 shrink-0 transition-colors"
    >
      {playing ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <path d="M2.5 1.5l8 4.5-8 4.5V1.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="2" y="1.5" width="3" height="9" rx="0.5" />
      <rect x="7" y="1.5" width="3" height="9" rx="0.5" />
    </svg>
  );
}
