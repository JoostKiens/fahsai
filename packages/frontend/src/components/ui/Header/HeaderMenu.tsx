import { Menu } from '@base-ui-components/react/menu';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../../store/uiStore';
import { GearIcon, GithubIcon, InfoIcon } from './icons';

const TRIGGER_CLS =
  'inline-flex items-center justify-center w-8 h-8 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors ease-out hover:duration-[175ms]';

const ITEM_CLS =
  'w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-gray-700 cursor-default data-highlighted:bg-gray-50 text-left';

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
          <Menu.Popup className="w-40 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden py-1">
            <Menu.Item className={ITEM_CLS} onClick={() => setSettingsOpen(true)}>
              <span className="text-gray-400">
                <GearIcon size={14} />
              </span>
              {t('menu.settings')}
            </Menu.Item>
            <Menu.Item className={ITEM_CLS} onClick={() => setAboutOpen(true)}>
              <span className="text-gray-400">
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
              <span className="text-gray-400">
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
