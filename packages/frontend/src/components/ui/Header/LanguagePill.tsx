import { Select } from '@base-ui-components/react/select';
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

  const currentCode = (i18n.language as Language) ?? 'en';
  const current = LANGUAGES.find((l) => l.code === currentCode) ?? LANGUAGES[0];

  function select(lang: Language) {
    if (lang === (i18n.language as Language)) return;
    setLanguage(lang);
    const path = lang === 'th' ? '/th/' : '/';
    const params = new URLSearchParams(window.location.search);
    params.delete('lang');
    const qs = params.toString();
    window.location.href = path + (qs ? '?' + qs : '');
  }

  return (
    <Select.Root value={currentCode} onValueChange={(v) => select(v as Language)}>
      <Select.Trigger
        aria-label={t('header.selectLanguage')}
        className="h-8 px-2 inline-flex items-center gap-1 rounded text-[12px] font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors ease-out hover:duration-[175ms]"
      >
        {current.pill}
        <Select.Icon>
          <ChevronDownIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} align="end" className="z-50">
          <Select.Popup className="w-32 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
            <Select.List>
              {LANGUAGES.map((lang) => (
                <Select.Item
                  key={lang.code}
                  value={lang.code}
                  className="w-full text-left px-3 py-2 text-[12px] cursor-default transition-colors ease-out hover:duration-[175ms] data-highlighted:bg-zinc-800 data-selected:text-teal-400 data-selected:font-medium text-zinc-200"
                >
                  <Select.ItemText>{lang.native}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
