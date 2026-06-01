import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../../store/uiStore';
import { mapRef } from '../../../utils/mapRef';
import { SPRING } from '../../../utils/animation';
import { LayerGroups } from './LayerGroups';
import { AppScrollArea } from '../AppScrollArea';

export function Sidebar() {
  const { t } = useTranslation();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  return (
    <motion.aside
      role="complementary"
      aria-label={t('sidebar.ariaLabel')}
      initial={false}
      animate={{ width: sidebarOpen ? 260 : 0 }}
      transition={SPRING}
      onAnimationComplete={() => mapRef.current?.resize()}
      className="hidden md:flex shrink-0 overflow-hidden z-20 pointer-events-auto"
    >
      <div className="w-[260px] flex flex-col bg-zinc-900 border-r border-zinc-800 shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-[11px] font-semibold text-zinc-200 uppercase tracking-wider">
            {t('sidebar.layers')}
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label={t('sidebar.collapse')}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            <ChevronLeftIcon />
          </button>
        </div>

        <AppScrollArea className="flex-1 min-h-0">
          <LayerGroups />
        </AppScrollArea>
      </div>
    </motion.aside>
  );
}

export function SidebarReopenButton() {
  const { t } = useTranslation();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);

  return (
    <motion.button
      initial={false}
      animate={{ x: sidebarOpen ? -40 : 0 }}
      transition={SPRING}
      onClick={() => setSidebarOpen(true)}
      aria-label={t('sidebar.open')}
      className="absolute left-0 top-1/2 -translate-y-1/2 hidden md:flex items-center justify-center w-6 h-12 bg-zinc-900 border border-l-0 border-zinc-700 rounded-r-md z-20 pointer-events-auto text-zinc-400 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
    >
      <ChevronRightIcon />
    </motion.button>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 12L6 8l4-4" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 12l4-4-4-4" />
    </svg>
  );
}
