import { useEffect } from 'react';
import { useUIStore } from '../../../store/uiStore';
import { HeaderMenu } from './HeaderMenu';
import { LanguagePill } from './LanguagePill';

// ── Icons ────────────────────────────────────────────────────────────────────

function InfoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-2.16c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18.91-.25 1.89-.38 2.86-.39.97.01 1.95.14 2.86.39 2.18-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.75.11 3.04.73.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.26 5.7.41.36.78 1.06.78 2.14v3.17c0 .31.21.66.79.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// ── Logo (placeholder SVG — replace with real mark) ───────────────────────────

function Logo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#0f766e" />
      <path
        d="M8 14 Q12 11 16 14 T24 14"
        stroke="#fff"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M8 18 Q12 15 16 18 T24 18"
        stroke="#fff"
        strokeOpacity="0.65"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M8 22 Q12 19 16 22 T24 22"
        stroke="#fff"
        strokeOpacity="0.4"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── IconBtn ───────────────────────────────────────────────────────────────────

const ICON_BTN_CLS =
  'inline-flex items-center justify-center w-8 h-8 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors';

function IconBtn({
  ariaLabel,
  children,
  href,
  target,
  rel,
  onClick,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  href?: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
}) {
  if (href) {
    return (
      <a href={href} target={target} rel={rel} aria-label={ariaLabel} className={ICON_BTN_CLS}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} aria-label={ariaLabel} className={ICON_BTN_CLS}>
      {children}
    </button>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-[14px] font-semibold text-gray-800">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-4 -mr-1 -mt-1 inline-flex items-center justify-center w-8 h-8 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <XIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

export function Header() {
  const headerMenuOpen = useUIStore((s) => s.headerMenuOpen);
  const setHeaderMenuOpen = useUIStore((s) => s.setHeaderMenuOpen);
  const aboutOpen = useUIStore((s) => s.aboutOpen);
  const setAboutOpen = useUIStore((s) => s.setAboutOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  return (
    <>
      <header className="h-12 flex items-center px-3 md:px-4 gap-2 md:gap-4 border-b border-gray-200 bg-white shrink-0 z-20">
        {/* Desktop brand */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Logo size={26} />
          <div className="leading-tight">
            <p className="text-[13px] font-semibold text-gray-800">Thailand Air Quality Map</p>
            <p className="text-[10px] text-gray-500">Causes of cross-border PM2.5 pollution</p>
          </div>
        </div>

        {/* Mobile brand */}
        <div className="flex md:hidden items-center gap-2 flex-1 min-w-0">
          <Logo size={22} />
          <span className="text-[12px] font-semibold text-gray-800 truncate">
            Thailand Air Quality
          </span>
        </div>

        {/* Desktop spacer */}
        <div className="hidden md:block flex-1" />

        {/* Desktop right cluster */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          <LanguagePill />
          <span className="w-px h-5 bg-gray-200 mx-1" aria-hidden />
          <IconBtn ariaLabel="About" onClick={() => setAboutOpen(true)}>
            <InfoIcon />
          </IconBtn>
          <IconBtn
            ariaLabel="GitHub repository"
            href="https://github.com/JoostKiens/thailand-air-quality-map"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GithubIcon />
          </IconBtn>
          <IconBtn ariaLabel="Settings" onClick={() => setSettingsOpen(true)}>
            <GearIcon />
          </IconBtn>
        </div>

        {/* Mobile right cluster */}
        <div className="flex md:hidden items-center gap-1 shrink-0">
          <LanguagePill />
          <div className="relative">
            <IconBtn ariaLabel="More options" onClick={() => setHeaderMenuOpen(!headerMenuOpen)}>
              <MoreIcon />
            </IconBtn>
            <HeaderMenu />
          </div>
        </div>
      </header>

      {/* About modal */}
      <Modal open={aboutOpen} onClose={() => setAboutOpen(false)} title="About">
        <p className="text-[13px] text-gray-700 leading-relaxed">
          Thailand Air Quality Map is a non-commercial civic project visualising the causes of PM2.5
          pollution in Thailand and its neighbours.
        </p>
        <p className="mt-3 text-[12px] text-gray-500">Data: NASA FIRMS, OpenAQ, Open-Meteo, WRI.</p>
      </Modal>

      {/* Settings modal */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <p className="text-[13px] text-gray-500">
          No settings configured yet. Units, theme, and other preferences will appear here.
        </p>
      </Modal>
    </>
  );
}
