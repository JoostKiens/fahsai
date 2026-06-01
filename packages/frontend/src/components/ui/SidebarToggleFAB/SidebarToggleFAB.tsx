import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { LayerGroups } from '../Sidebar/LayerGroups';
import { SPRING, TWEEN_ENTER, TWEEN_EXIT } from '../../../utils/animation';

export function SidebarToggleFAB() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dragControls = useDragControls();

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <>
      {/* FAB button */}
      <button
        onClick={() => setDrawerOpen(true)}
        aria-label="Open layer controls"
        className="absolute bottom-4 left-4 md:hidden w-11 h-11 rounded-full bg-zinc-900 border border-zinc-700 shadow-lg z-30 pointer-events-auto flex items-center justify-center text-zinc-300 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
      >
        <LayersIcon />
      </button>

      <AnimatePresence>
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: TWEEN_ENTER }}
              exit={{ opacity: 0, transition: TWEEN_EXIT }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-black/30 z-40 pointer-events-auto md:hidden"
            />

            {/* Drawer */}
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
                if (info.offset.y > 80 || info.velocity.y > 400) {
                  setDrawerOpen(false);
                }
              }}
              className="fixed bottom-0 left-0 right-0 max-h-[70vh] bg-zinc-900 border-t border-zinc-800 rounded-t-2xl z-50 flex flex-col pointer-events-auto md:hidden"
            >
              {/* Header: drag handle (centered) + close button (right) — touch-none prevents scroll hijack */}
              <div
                className="flex items-center justify-between px-4 pt-3 pb-2 touch-none cursor-grab active:cursor-grabbing shrink-0"
                onPointerDown={(e) => dragControls.start(e)}
              >
                <div className="w-6" />
                <div className="w-10 h-1 rounded-full bg-zinc-700" />
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close layer controls"
                  className="text-zinc-500 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
                >
                  <XIcon />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 min-h-0">
                <LayerGroups />
                <div className="h-4" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function LayersIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
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
