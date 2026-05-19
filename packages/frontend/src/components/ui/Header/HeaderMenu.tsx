import { useEffect } from 'react';
import { useUIStore } from '../../../store/uiStore';
import { GearIcon, GithubIcon, InfoIcon } from './icons';

const MENU_ITEM_CLS =
  'w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-gray-700 hover:bg-gray-50 text-left';

export function HeaderMenu() {
  const headerMenuOpen = useUIStore((s) => s.headerMenuOpen);
  const setHeaderMenuOpen = useUIStore((s) => s.setHeaderMenuOpen);
  const setAboutOpen = useUIStore((s) => s.setAboutOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  useEffect(() => {
    if (!headerMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHeaderMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [headerMenuOpen, setHeaderMenuOpen]);

  if (!headerMenuOpen) return null;

  return (
    <>
      {/* Backdrop — closes menu on outside click */}
      <div className="fixed inset-0 z-30" onClick={() => setHeaderMenuOpen(false)} />
      {/* Popover — anchored below the ⋮ button via parent `relative` wrapper */}
      <div className="absolute top-full right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-40">
        <button
          className={MENU_ITEM_CLS}
          onClick={() => {
            setSettingsOpen(true);
            setHeaderMenuOpen(false);
          }}
        >
          <span className="text-gray-400">
            <GearIcon size={14} />
          </span>
          Settings
        </button>
        <button
          className={MENU_ITEM_CLS}
          onClick={() => {
            setAboutOpen(true);
            setHeaderMenuOpen(false);
          }}
        >
          <span className="text-gray-400">
            <InfoIcon size={14} />
          </span>
          About
        </button>
        <a
          href="https://github.com/JoostKiens/thailand-air-quality-map"
          target="_blank"
          rel="noopener noreferrer"
          className={MENU_ITEM_CLS}
          onClick={() => setHeaderMenuOpen(false)}
        >
          <span className="text-gray-400">
            <GithubIcon size={14} />
          </span>
          GitHub
        </a>
      </div>
    </>
  );
}
