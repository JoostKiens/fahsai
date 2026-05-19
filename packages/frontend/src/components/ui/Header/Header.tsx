import { useEffect } from 'react';
import { useUIStore } from '../../../store/uiStore';

const SCRUBBER_RANGE_OPTIONS = [30, 60, 90, 120] as const;
import { HeaderMenu } from './HeaderMenu';
import { GearIcon, GithubIcon, InfoIcon } from './icons';
import { LanguagePill } from './LanguagePill';

// ── Icons (local) ─────────────────────────────────────────────────────────────

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
  const scrubberDays = useUIStore((s) => s.scrubberDays);
  const setScrubberDays = useUIStore((s) => s.setScrubberDays);

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
        <div>
          <p className="text-[11px] font-medium text-gray-700 mb-2">Date range</p>
          <div className="inline-flex rounded-md border border-gray-200 divide-x divide-gray-200 overflow-hidden">
            {SCRUBBER_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setScrubberDays(opt)}
                className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  scrubberDays === opt
                    ? 'bg-teal-700 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt}d
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
