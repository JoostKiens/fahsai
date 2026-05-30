import { Dialog } from '@base-ui-components/react/dialog';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../../store/settingsStore';
import { useUIStore } from '../../../store/uiStore';

const SCRUBBER_RANGE_OPTIONS = [30, 60, 90] as const;
import { HeaderMenu } from './HeaderMenu';
import { GearIcon, GithubIcon, InfoIcon } from './icons';
import { LanguagePill } from './LanguagePill';

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

function Logo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="24" fill="#0ea5e9" />
      <circle cx="24" cy="22" r="6.5" fill="#fde68a" />
      <path
        d="M0 34 Q 8 28 16 33 Q 24 38 32 31 Q 40 25 48 32 L 48 48 L 0 48 Z"
        fill="rgba(255,255,255,0.55)"
      />
      <path d="M0 40 Q 10 30 20 38 Q 30 46 38 36 Q 44 30 48 38 L 48 48 L 0 48 Z" fill="#ffffff" />
    </svg>
  );
}

const ICON_BTN_CLS =
  'inline-flex items-center justify-center w-8 h-8 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors ease-out hover:duration-[175ms]';

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

function AppDialog({
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
  const { t } = useTranslation();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-white rounded-xl shadow-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <Dialog.Title className="text-[14px] font-semibold text-gray-800">{title}</Dialog.Title>
            <Dialog.Close
              aria-label={t('header.close')}
              className="ml-4 -mr-1 -mt-1 inline-flex items-center justify-center w-8 h-8 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ease-out hover:duration-[175ms]"
            >
              <XIcon />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Header() {
  const { t } = useTranslation();
  const aboutOpen = useUIStore((s) => s.aboutOpen);
  const setAboutOpen = useUIStore((s) => s.setAboutOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const scrubberDays = useSettingsStore((s) => s.scrubberDays);
  const setScrubberDays = useSettingsStore((s) => s.setScrubberDays);
  const setScrubberDay = useUIStore((s) => s.setScrubberDay);

  return (
    <>
      <header className="h-12 flex items-center px-3 md:px-4 gap-2 md:gap-4 border-b border-gray-200 bg-white shrink-0 z-20">
        {/* Desktop brand */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Logo size={26} />
          <div className="leading-tight">
            <p className="text-[13px] font-semibold text-gray-800">Fahsai</p>
            <p className="text-[10px] text-gray-500">{t('header.subtitle')}</p>
          </div>
        </div>

        {/* Mobile brand */}
        <div className="flex md:hidden items-center gap-2 flex-1 min-w-0">
          <Logo size={22} />
          <span className="text-[12px] font-semibold text-gray-800 truncate">Fahsai</span>
        </div>

        {/* Desktop spacer */}
        <div className="hidden md:block flex-1" />

        {/* Desktop right cluster */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          <LanguagePill />
          <span className="w-px h-5 bg-gray-200 mx-1" aria-hidden />
          <IconBtn ariaLabel={t('header.about')} onClick={() => setAboutOpen(true)}>
            <InfoIcon />
          </IconBtn>
          <IconBtn
            ariaLabel={t('header.github')}
            href="https://github.com/JoostKiens/fahsai"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GithubIcon />
          </IconBtn>
          <IconBtn ariaLabel={t('header.settings')} onClick={() => setSettingsOpen(true)}>
            <GearIcon />
          </IconBtn>
        </div>

        {/* Mobile right cluster */}
        <div className="flex md:hidden items-center gap-1 shrink-0">
          <LanguagePill />
          <HeaderMenu />
        </div>
      </header>

      {/* About dialog */}
      <AppDialog open={aboutOpen} onClose={() => setAboutOpen(false)} title={t('header.about')}>
        <p className="text-[13px] text-gray-700 leading-relaxed">{t('about.body')}</p>
        <p className="mt-3 text-[12px] text-gray-500">
          Data: NASA FIRMS (VIIRS/NOAA-21, near real-time), OpenAQ, Copernicus CAMS via Open-Meteo,
          WRI.
        </p>
        <p className="mt-3 text-[12px] text-gray-500">By Joost Kiens.</p>
      </AppDialog>

      {/* Settings dialog */}
      <AppDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t('header.settings')}
      >
        <div>
          <p className="text-[11px] font-medium text-gray-700 mb-2">{t('settings.dateRange')}</p>
          <div className="inline-flex rounded-md border border-gray-200 divide-x divide-gray-200 overflow-hidden">
            {SCRUBBER_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  setScrubberDays(opt);
                  setScrubberDay(opt - 1);
                }}
                className={`px-3 py-1.5 text-[12px] font-medium transition-colors ease-out hover:duration-[175ms] ${
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
      </AppDialog>
    </>
  );
}
