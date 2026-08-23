import { useTranslation } from 'react-i18next';
import { LayerGroups } from './LayerGroups';
import { AppScrollArea } from '@/components/AppScrollArea';

export function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside
      role="complementary"
      aria-label={t('sidebar.ariaLabel')}
      className="hidden md:flex w-65 shrink-0 flex-col bg-zinc-900 border-r border-zinc-800 z-20 pointer-events-auto"
    >
      <div className="flex items-center px-4 py-3 border-b border-zinc-800">
        <span className="text-[11px] font-semibold text-zinc-200 uppercase tracking-wider">
          {t('sidebar.layers')}
        </span>
      </div>

      <AppScrollArea className="flex-1 min-h-0">
        <LayerGroups />
      </AppScrollArea>
    </aside>
  );
}
