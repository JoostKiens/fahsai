import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../../store/uiStore';

const ENTRY_DELAY_MS = 400;
const AUTO_DISMISS_MS = 6000;

export function HintPill() {
  const { t } = useTranslation();
  const selectedPoint = useUIStore((s) => s.selectedPoint);
  const hintDismissed = useUIStore((s) => s.hintDismissed);
  const dismissHint = useUIStore((s) => s.dismissHint);

  const visible = !selectedPoint && !hintDismissed;
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!visible) {
      setEntered(false);
      return;
    }
    const timer = setTimeout(() => setEntered(true), ENTRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!entered) return;
    const timer = setTimeout(dismissHint, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [entered, dismissHint]);

  return (
    <AnimatePresence>
      {visible && entered && (
        <motion.button
          key="hint"
          type="button"
          onClick={dismissHint}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          aria-label={t('hint.dismiss')}
          className="md:hidden absolute bottom-[60px] left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-full shadow-sm pointer-events-auto z-20"
        >
          <CursorClickIcon />
          <span className="text-[11px] text-gray-700 font-medium whitespace-nowrap">
            {t('hint.tapForDetails')}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function CursorClickIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-gray-500"
    >
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
