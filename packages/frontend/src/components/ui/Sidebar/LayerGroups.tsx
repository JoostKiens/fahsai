import { useTranslation } from 'react-i18next';
import { useLayerStore } from '../../../store/layerStore';
import { AQI_CATEGORIES } from '../../../lib/aqiColors';
import { FUEL_COLORS } from '../../../layers/PowerPlantsLayer';
import { Toggle } from './Toggle';

const FIRE_TIERS = [
  { labelKey: 'fireTier.small' as const, range: '< 10', r: 3 },
  { labelKey: 'fireTier.moderate' as const, range: '10–50', r: 4 },
  { labelKey: 'fireTier.large' as const, range: '50–200', r: 6 },
  { labelKey: 'fireTier.extreme' as const, range: '> 200', r: 8 },
];

function GroupHeader({
  label,
  checked,
  onToggle,
  toggleLabel,
}: {
  label: string;
  checked?: boolean;
  onToggle?: () => void;
  toggleLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm uppercase tracking-wide text-gray-500 font-medium mb-2">{label}</p>
      {onToggle && toggleLabel && checked !== undefined && (
        <Toggle checked={checked} onChange={onToggle} label={toggleLabel} />
      )}
    </div>
  );
}

function SubRow({
  label,
  description,
  checked,
  onToggle,
  toggleLabel,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
  toggleLabel: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <div className="flex-1">
        <span className="text-sm text-gray-700 font-medium">{label}</span>
        {description && (
          <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{description}</p>
        )}
      </div>
      <Toggle checked={checked} onChange={onToggle} label={toggleLabel} />
    </div>
  );
}

function AirQualityGroup() {
  const { t } = useTranslation();
  const aqGrid = useLayerStore((s) => s.layers.aqGrid.visible);
  const aqStations = useLayerStore((s) => s.layers.aqStations.visible);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);

  return (
    <article className="px-4 py-3">
      <GroupHeader label={t('layers.airQuality')} />
      <SubRow
        label={t('layers.stationReadings')}
        description={t('layers.stationReadingsDesc')}
        checked={aqStations}
        onToggle={() => toggleLayer('aqStations')}
        toggleLabel={t('layers.toggleStationReadings')}
      />
      <SubRow
        label={t('layers.ambient')}
        description={t('layers.ambientDesc')}
        checked={aqGrid}
        onToggle={() => toggleLayer('aqGrid')}
        toggleLabel={t('layers.toggleAmbient')}
      />

      {(aqGrid || aqStations) && (
        <div className="mt-2.5 space-y-1">
          <div className="flex justify-end mb-0.5">
            <span className="text-[10px] text-gray-400">µg/m³</span>
          </div>
          {AQI_CATEGORIES.map((cat) => (
            <div key={cat.key} className="flex items-center gap-2">
              <span
                className="shrink-0 w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: `rgb(${cat.rgb[0]},${cat.rgb[1]},${cat.rgb[2]})` }}
              />
              <span className="flex-1 text-[11px] text-gray-500 leading-tight">
                {t(cat.key as never)}
              </span>
              <span className="text-[11px] text-gray-400 tabular-nums">{cat.range}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function FiresGroup() {
  const { t } = useTranslation();
  const visible = useLayerStore((s) => s.layers.fires.visible);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);

  return (
    <article className="px-4 py-3">
      <GroupHeader
        label={t('layers.fires')}
        checked={visible}
        onToggle={() => toggleLayer('fires')}
        toggleLabel={t('layers.toggleFires')}
      />
      {visible && (
        <div className="mt-2.5 space-y-1">
          <div className="flex justify-end mb-0.5">
            <span className="text-[10px] text-gray-400">MW</span>
          </div>
          {FIRE_TIERS.map((tier) => (
            <div key={tier.labelKey} className="flex items-center gap-2">
              <span className="shrink-0 w-6 flex items-center justify-center">
                <svg width={tier.r * 2} height={tier.r * 2} className="shrink-0">
                  <circle
                    cx={tier.r}
                    cy={tier.r}
                    r={tier.r - 0.5}
                    fill="#f97316"
                    fillOpacity={0.9}
                  />
                </svg>
              </span>
              <span className="flex-1 text-[11px] text-gray-500 leading-tight">
                {t(tier.labelKey)}
              </span>
              <span className="text-[11px] text-gray-400 tabular-nums">{tier.range}</span>
            </div>
          ))}
          <p className="text-[11px] text-gray-500 leading-tight mt-2">{t('layers.fireFrpNote')}</p>
        </div>
      )}
    </article>
  );
}

function WindGroup() {
  const { t } = useTranslation();
  const visible = useLayerStore((s) => s.layers.wind.visible);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);

  return (
    <article className="px-4 py-3">
      <GroupHeader
        label={t('layers.wind')}
        checked={visible}
        onToggle={() => toggleLayer('wind')}
        toggleLabel={t('layers.toggleWind')}
      />
      {visible && (
        <div className="mt-1 space-y-0.5">
          <p className="text-[11px] text-gray-500 leading-tight">{t('layers.windParticleNote')}</p>
          <p className="text-[11px] text-gray-500 leading-tight">{t('layers.windSnapshotNote')}</p>
        </div>
      )}
    </article>
  );
}

function PowerPlantsGroup() {
  const { t } = useTranslation();
  const visible = useLayerStore((s) => s.layers.powerPlants.visible);
  const toggleLayer = useLayerStore((s) => s.toggleLayer);

  return (
    <article className="px-4 py-3">
      <GroupHeader
        label={t('layers.powerPlants')}
        checked={visible}
        onToggle={() => toggleLayer('powerPlants')}
        toggleLabel={t('layers.togglePowerPlants')}
      />
      {visible && (
        <div className="mt-2.5 space-y-1.5">
          {Object.entries(FUEL_COLORS).map(([fuel, color]) => (
            <div key={fuel} className="flex items-center gap-2">
              <DiamondSwatch color={color} />
              <span className="text-[11px] text-gray-500">
                {t(`fuelType.${fuel.toLowerCase()}` as never, { defaultValue: fuel })}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function DiamondSwatch({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
      <polygon
        points="5,0 10,5 5,10 0,5"
        fill={color}
        fillOpacity={0.4}
        stroke={color}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function LayerGroups() {
  return (
    <>
      <AirQualityGroup />
      <div className="mx-4 border-t border-gray-100" />
      <FiresGroup />
      <div className="mx-4 border-t border-gray-100" />
      <WindGroup />
      <div className="mx-4 border-t border-gray-100" />
      <PowerPlantsGroup />
    </>
  );
}
