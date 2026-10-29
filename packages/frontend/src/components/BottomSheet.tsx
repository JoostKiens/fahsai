import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'motion/react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { SPRING, TWEEN_ENTER, TWEEN_EXIT } from '@/utils/animation';

export interface BottomSheetDetents {
  peekHeight: number; // px — determines where peek detent rests
  fullHeight: number; // px — full sheet height (consumer: Math.round(window.innerHeight * 0.75))
}

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Names the sheet's dialog for screen readers. */
  ariaLabel: string;
  closeAriaLabel: string;
  children: React.ReactNode;
  // Two-detent mode — omit for single-detent (layer menu) behaviour
  detents?: BottomSheetDetents;
  activeDetent?: 'peek' | 'full';
  onDetentChange?: (detent: 'peek' | 'full') => void;
  // Set false when the map behind the sheet must stay tappable (InfoPanel); the sheet is then
  // non-modal. The layer menu keeps the default (true): modal, and clicking outside closes it.
  showBackdrop?: boolean;
}

export function BottomSheet({
  open,
  onClose,
  ariaLabel,
  closeAriaLabel,
  children,
  detents,
  activeDetent = 'peek',
  onDetentChange,
  showBackdrop = true,
}: BottomSheetProps) {
  const dragControls = useDragControls();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onDetentChangeRef = useRef(onDetentChange);
  onDetentChangeRef.current = onDetentChange;
  const portalRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const isModal = showBackdrop;
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const transition = prefersReducedMotion ? { duration: 0 } : SPRING;

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Move focus into the sheet on open and back to the opener on close. A modal sheet also makes
  // the rest of the page inert, so neither Tab nor a screen reader can leave it. Only below the
  // md breakpoint: above it the sheet is hidden, and an inert page would have no way out.
  useEffect(() => {
    if (!open || !isMobile) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inertSiblings = isModal
      ? [...document.body.children].filter(
          (el) => el !== portalRef.current && !el.hasAttribute('inert'),
        )
      : [];
    inertSiblings.forEach((el) => el.setAttribute('inert', ''));
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      inertSiblings.forEach((el) => el.removeAttribute('inert'));
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, isModal, isMobile]);

  // Y translation from the full position to the peek position
  const peekOffset = detents ? detents.fullHeight - detents.peekHeight : 0;
  const yTarget = detents && activeDetent === 'peek' ? peekOffset : 0;

  return createPortal(
    // One wrapper so a modal sheet can make every other child of <body> inert.
    <div ref={portalRef}>
      <AnimatePresence>
        {open && (
          <>
            {showBackdrop && (
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: TWEEN_ENTER }}
                exit={{ opacity: 0, transition: TWEEN_EXIT }}
                onClick={() => onCloseRef.current()}
                className="fixed inset-0 bg-black/30 z-40 pointer-events-auto md:hidden"
              />
            )}
            <motion.div
              key="drawer"
              ref={sheetRef}
              role="dialog"
              aria-modal={isModal ? true : undefined}
              aria-label={ariaLabel}
              tabIndex={-1}
              initial={{ y: '100%' }}
              animate={{ y: yTarget }}
              exit={{ y: '100%' }}
              transition={transition}
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0 }}
              onDragEnd={(_, info) => {
                const { offset, velocity } = info;

                if (!detents) {
                  // Single-detent: swipe down to dismiss
                  if (offset.y > 80 || velocity.y > 400) onCloseRef.current();
                  return;
                }

                if (activeDetent === 'full') {
                  // Drag down past midpoint or fast → snap to peek
                  // Clamp to 40px minimum so the threshold never collapses to zero
                  // when peekHeight approaches fullHeight.
                  if (offset.y > Math.max(peekOffset / 2, 40) || velocity.y > 400) {
                    onDetentChangeRef.current?.('peek');
                  }
                  // else: spring back to full via animate target
                } else {
                  // At peek: drag down → dismiss; drag up → snap to full
                  if (offset.y > 80 || velocity.y > 400) {
                    onCloseRef.current();
                  } else if (offset.y < -40 || velocity.y < -400) {
                    onDetentChangeRef.current?.('full');
                  }
                  // else: spring back to peek via animate target
                }
              }}
              className={[
                'fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 rounded-t-2xl z-50 flex flex-col pointer-events-auto md:hidden',
                detents ? '' : 'max-h-[70vh]',
              ]
                .join(' ')
                .trim()}
              style={detents ? { height: detents.fullHeight } : undefined}
            >
              <div
                className="flex items-start justify-between px-4 pt-3 pb-2 touch-none cursor-grab active:cursor-grabbing shrink-0"
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
              {/* Disable scroll at peek so content clips rather than scrolls below the fold */}
              <div
                className={`flex-1 min-h-0 ${detents && activeDetent === 'peek' ? 'overflow-hidden' : 'overflow-y-auto'}`}
              >
                {children}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>,
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
