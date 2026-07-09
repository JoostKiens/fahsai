import { Dialog } from '@base-ui-components/react/dialog';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';

export const HEADER_HEIGHT = 48; // keep in sync with h-12 below
const SCRUBBER_RANGE_OPTIONS = [30, 60, 90] as const;
import { HeaderMenu } from './HeaderMenu';
import { CloseIcon, GearIcon, GithubIcon, InfoIcon } from './Icons';
import { LanguagePill } from './LanguagePill';
import { Search } from './Search';

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
  'inline-flex items-center justify-center w-8 h-8 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors ease-out hover:duration-175';

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
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6">
          <div className="flex items-start justify-between mb-4">
            <Dialog.Title className="text-[14px] font-semibold text-zinc-100">{title}</Dialog.Title>
            <Dialog.Close
              aria-label={t('header.close')}
              className="ml-4 -mr-1 -mt-1 inline-flex items-center justify-center w-8 h-8 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors ease-out hover:duration-175"
            >
              <CloseIcon />
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
      <header className="h-12 flex items-center px-3 md:px-4 gap-2 md:gap-4 border-b border-zinc-800 bg-zinc-900 shrink-0 z-20">
        {/* Desktop brand */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Logo size={26} />
          <div className="leading-tight">
            <p className="text-[13px] font-semibold text-zinc-100">Fahsai</p>
            <p className="text-[11px] text-zinc-400">{t('header.subtitle')}</p>
          </div>
        </div>

        {/* Mobile brand */}
        <div className="flex md:hidden items-center gap-2 flex-1 min-w-0">
          <Logo size={22} />
          <span className="text-[12px] font-semibold text-zinc-100 truncate">Fahsai</span>
        </div>

        {/* Desktop search */}
        <Search />

        {/* Desktop right cluster */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          <LanguagePill />
          <span className="w-px h-5 bg-zinc-700 mx-1" aria-hidden />
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
        <p className="text-[13px] text-zinc-300 leading-relaxed">{t('about.body')}</p>
        <p className="mt-3 text-[12px] text-zinc-400">
          Data: NASA FIRMS (VIIRS/NOAA-21, near real-time), OpenAQ, Copernicus CAMS via Open-Meteo,
          WRI.
        </p>
        <p className="mt-3 text-[12px] text-zinc-400">By Joost Kiens.</p>
      </AppDialog>

      {/* Settings dialog */}
      <AppDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t('header.settings')}
      >
        <div>
          <p className="text-[11px] font-medium text-zinc-300 mb-2">{t('settings.dateRange')}</p>
          <div className="inline-flex rounded-md border border-zinc-700 divide-x divide-zinc-700 overflow-hidden">
            {SCRUBBER_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  setScrubberDays(opt);
                  setScrubberDay(opt - 1);
                }}
                className={`px-3 py-1.5 text-[12px] font-medium transition-colors ease-out hover:duration-175 ${
                  scrubberDays === opt
                    ? 'bg-teal-700 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
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
