import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/BottomSheet';
import { LayerGroups } from '@/components/Sidebar';

/**
 * Mobile only: hidden from 768 px up, so this Docs page shows it in a phone-width frame. A
 * floating button that opens the map layer switches in a bottom sheet; on desktop the `Sidebar`
 * shows them instead.
 */
export function SidebarToggleFAB() {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {createPortal(
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open layer controls"
          className="fixed bottom-18 left-4 md:hidden w-11 h-11 rounded-full bg-zinc-100 shadow-lg z-30 pointer-events-auto flex items-center justify-center text-zinc-900 hover:bg-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <LayersIcon />
        </button>,
        document.body,
      )}
      <BottomSheet
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ariaLabel={t('sidebar.ariaLabel')}
        closeAriaLabel="Close layer controls"
      >
        <LayerGroups />
        <div className="h-4" />
      </BottomSheet>
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
