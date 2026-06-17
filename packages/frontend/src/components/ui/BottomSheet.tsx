import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { SPRING, TWEEN_ENTER, TWEEN_EXIT } from '@/utils/animation';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  closeAriaLabel: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, closeAriaLabel, children }: BottomSheetProps) {
  const dragControls = useDragControls();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: TWEEN_ENTER }}
            exit={{ opacity: 0, transition: TWEEN_EXIT }}
            onClick={() => onCloseRef.current()}
            className="fixed inset-0 bg-black/30 z-40 pointer-events-auto md:hidden"
          />
          <motion.div
            key="drawer"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SPRING}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 400) onCloseRef.current();
            }}
            className="fixed bottom-0 left-0 right-0 max-h-[70vh] bg-zinc-900 border-t border-zinc-800 rounded-t-2xl z-50 flex flex-col pointer-events-auto md:hidden"
          >
            <div
              className="flex items-center justify-between px-4 pt-3 pb-2 touch-none cursor-grab active:cursor-grabbing shrink-0"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-6" />
              <div className="w-10 h-1 rounded-full bg-zinc-700" />
              <button
                onClick={() => onCloseRef.current()}
                aria-label={closeAriaLabel}
                className="text-zinc-500 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
              >
                <XIcon />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function XIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
