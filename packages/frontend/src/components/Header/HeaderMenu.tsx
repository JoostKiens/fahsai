import { Menu } from '@base-ui-components/react/menu';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/store/uiStore';
import { GearIcon, GithubIcon, InfoIcon } from './icons';

const TRIGGER_CLS =
  'inline-flex items-center justify-center w-8 h-8 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors ease-out hover:duration-[175ms]';

const ITEM_CLS =
  'w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-zinc-200 cursor-default data-highlighted:bg-zinc-800 text-left';

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export function HeaderMenu() {
  const { t } = useTranslation();
  const setAboutOpen = useUIStore((s) => s.setAboutOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  return (
    <Menu.Root>
      <Menu.Trigger className={TRIGGER_CLS} aria-label={t('header.moreOptions')}>
        <MoreIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-40">
          <Menu.Popup className="w-40 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden py-1">
            <Menu.Item className={ITEM_CLS} onClick={() => setSettingsOpen(true)}>
              <span className="text-zinc-500">
                <GearIcon size={14} />
              </span>
              {t('menu.settings')}
            </Menu.Item>
            <Menu.Item className={ITEM_CLS} onClick={() => setAboutOpen(true)}>
              <span className="text-zinc-500">
                <InfoIcon size={14} />
              </span>
              {t('menu.about')}
            </Menu.Item>
            <Menu.Item
              className={ITEM_CLS}
              render={
                <a
                  href="https://github.com/JoostKiens/fahsai"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <span className="text-zinc-500">
                <GithubIcon size={14} />
              </span>
              {t('header.github')}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
