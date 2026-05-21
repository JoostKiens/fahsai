import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore, type Language } from '../../../store/settingsStore';

const LANGUAGES: { code: Language; pill: string; native: string }[] = [
  { code: 'en', pill: 'EN', native: 'English' },
  { code: 'th', pill: 'TH', native: 'ภาษาไทย' },
];

function ChevronDownIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function LanguagePill() {
  const { t, i18n } = useTranslation();
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentCode = (i18n.language as Language) ?? 'en';
  const current = LANGUAGES.find((l) => l.code === currentCode) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  function select(lang: Language) {
    setLanguage(lang);
    void i18n.changeLanguage(lang);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('header.selectLanguage')}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="h-8 px-2 inline-flex items-center gap-1 rounded text-[11px] font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
      >
        {current.pill}
        <ChevronDownIcon />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('header.selectLanguage')}
          className="absolute top-full right-0 mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50"
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              role="option"
              aria-selected={lang.code === currentCode}
              onClick={() => select(lang.code)}
              className={`w-full text-left px-3 py-2 text-[12px] transition-colors hover:bg-gray-50 ${
                lang.code === currentCode ? 'text-teal-700 font-medium' : 'text-gray-700'
              }`}
            >
              {lang.native}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
