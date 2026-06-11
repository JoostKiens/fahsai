import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TWEEN_ENTER, TWEEN_EXIT } from '../../../utils/animation';
import { useTranslation } from 'react-i18next';
import type { StationDayHistory } from '@thailand-aq/types';
import { useUIStore } from '../../../store/uiStore';
import { useTimeStore } from '../../../store/timeStore';
import { ExplainButton } from '../../ExplainButton';
import { AqiBadge } from './AqiBadge';
import { pm25ToCategory } from '../../../utils/aqiColors';
import { reverseGeocode } from '../../../utils/geocode';
import { AppScrollArea } from '../AppScrollArea';
import { CountryFlag, alpha2ToIso3 } from '../../../utils/countryFlag';
import { findNearestAQPoint, findNearestWind, degToCompass } from '../../../utils/ambient';
import { useCamsGrid } from '../../../hooks/useCamsGrid';
import { useStationReadings } from '../../../hooks/useStationReadings';
import { useWind } from '../../../hooks/useWind';
import { useStationHistory } from '../../../hooks/useStationHistory';
import { dateLocale } from '../../../i18n';
import { History, ShimmerHistory } from './History';
import { WindArrow } from './WindArrow';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const PANEL_BASE =
  'absolute top-3 right-3 w-[260px] bg-zinc-900 border border-zinc-700/60 rounded-lg z-20 pointer-events-auto shadow-2xl';

export function InfoPanel() {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);

  const selectedPoint = useUIStore((s) => s.selectedPoint);
  const setSelectedPoint = useUIStore((s) => s.setSelectedPoint);
  const { data: aqGrid } = useCamsGrid();
  const { data: aqData } = useStationReadings();
  const { data: wind } = useWind();

  const [placeName, setPlaceName] = useState<string | null>(null);
  const [geocodeCountryIso3, setGeocodeCountryIso3] = useState<string | null>(null);
  const [geocodeLoading, setGeocodeLoading] = useState(false);

  const coordKey = selectedPoint ? `${selectedPoint.lngLat[0]},${selectedPoint.lngLat[1]}` : null;
  useEffect(() => {
    if (!coordKey) {
      setPlaceName(null);
      setGeocodeCountryIso3(null);
      return;
    }
    const [lng, lat] = coordKey.split(',').map(Number);
    setPlaceName(null);
    setGeocodeCountryIso3(null);
    setGeocodeLoading(true);
    void reverseGeocode(lng, lat, TOKEN)
      .then(({ placeName: name, countryAlpha2 }) => {
        setPlaceName(name);
        setGeocodeCountryIso3(countryAlpha2 ? alpha2ToIso3(countryAlpha2) : null);
      })
      .finally(() => setGeocodeLoading(false));
  }, [coordKey]);

  const stationId = selectedPoint?.station?.stationId ?? null;
  useEffect(() => {
    if (!stationId || !aqData) return;
    if (!aqData.find((m) => m.stationId === stationId)) setSelectedPoint(null);
  }, [stationId, aqData, setSelectedPoint]);

  const selectedDate = useTimeStore((s) => s.selectedDate);
  const selectedPointRef = useRef(selectedPoint);
  selectedPointRef.current = selectedPoint;
  useEffect(() => {
    if (selectedPointRef.current?.fire) setSelectedPoint(null);
  }, [selectedDate, setSelectedPoint]);

  const { data: historyDays, isPending: historyLoading } = useStationHistory(stationId);

  const liveAqi = stationId ? (aqData?.find((m) => m.stationId === stationId) ?? null) : null;
  const displayStation =
    selectedPoint?.station && liveAqi
      ? { ...selectedPoint.station, pm25: liveAqi.value, measuredAt: liveAqi.measuredAt }
      : (selectedPoint?.station ?? null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedPoint(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setSelectedPoint]);

  const panelType = selectedPoint?.fire
    ? 'fire'
    : selectedPoint?.station
      ? 'station'
      : selectedPoint?.powerPlant
        ? 'powerPlant'
        : null;

  const aqPoint =
    selectedPoint && aqGrid
      ? findNearestAQPoint(aqGrid, selectedPoint.lngLat[0], selectedPoint.lngLat[1])
      : null;
  const windVec =
    selectedPoint && wind
      ? findNearestWind(wind, selectedPoint.lngLat[0], selectedPoint.lngLat[1])
      : null;

  const countryIso3 =
    panelType === 'station'
      ? displayStation?.country
        ? (alpha2ToIso3(displayStation.country) ?? geocodeCountryIso3)
        : geocodeCountryIso3
      : panelType === 'powerPlant'
        ? (selectedPoint?.powerPlant?.country ?? null)
        : geocodeCountryIso3;

  if (!selectedPoint) {
    return (
      <div
        role="region"
        aria-label={t('infoPanel.ariaLabel')}
        className={`hidden md:block ${PANEL_BASE}`}
      >
        <motion.div
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={TWEEN_ENTER}
          className="flex flex-col items-center justify-center h-25 gap-2 text-zinc-500"
        >
          <CursorClickIcon />
          <span className="text-[12px] text-zinc-300 text-center leading-snug whitespace-pre-line">
            {t('infoPanel.clickPrompt')}
          </span>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={t('infoPanel.ariaLabel')}
      className={`${PANEL_BASE} overflow-hidden max-h-[calc(100%-1.5rem)]`}
    >
      <AppScrollArea viewportClassName="max-h-[80svh]">
        <AnimatePresence mode="wait">
          <motion.div
            key={panelType}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: TWEEN_ENTER }}
            exit={{ opacity: 0, y: -6, transition: TWEEN_EXIT }}
            className="p-3"
          >
            <PanelHeader
              panelType={panelType}
              lngLat={selectedPoint.lngLat}
              placeName={placeName}
              geocodeLoading={geocodeLoading}
              stationName={displayStation?.stationName ?? null}
              plantName={selectedPoint.powerPlant?.name ?? null}
              countryIso3={countryIso3}
              onClose={() => setSelectedPoint(null)}
            />

            <hr className="border-zinc-800 my-2" />

            {displayStation && (
              <StationPanel
                station={displayStation}
                lngLat={selectedPoint.lngLat}
                historyDays={historyDays}
                historyLoading={historyLoading}
                locale={locale}
              />
            )}
            {selectedPoint.fire && (
              <FirePanel
                fire={selectedPoint.fire}
                aqPoint={aqPoint}
                windVec={windVec}
                locale={locale}
              />
            )}
            {selectedPoint.powerPlant && (
              <PowerPlantPanel
                plant={selectedPoint.powerPlant}
                aqPoint={aqPoint}
                windVec={windVec}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </AppScrollArea>
    </div>
  );
}

// --- Header ---

function PanelHeader({
  panelType,
  lngLat,
  placeName,
  geocodeLoading,
  stationName,
  plantName,
  countryIso3,
  onClose,
}: {
  panelType: string | null;
  lngLat: [number, number];
  placeName: string | null;
  geocodeLoading: boolean;
  stationName: string | null;
  plantName: string | null;
  countryIso3: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const badgeLabel =
    panelType === 'station'
      ? t('infoPanel.aqiStation')
      : panelType === 'fire'
        ? t('infoPanel.fireDetection')
        : panelType === 'powerPlant'
          ? t('infoPanel.powerPlant')
          : '';

  const dotCls =
    panelType === 'station'
      ? 'bg-teal-500'
      : panelType === 'fire'
        ? 'bg-orange-400'
        : 'bg-violet-400';

  const labelCls =
    panelType === 'station'
      ? 'text-teal-400'
      : panelType === 'fire'
        ? 'text-orange-400'
        : 'text-violet-400';

  return (
    <div className="flex items-start justify-between">
      <div className="min-w-0 flex-1 pr-2">
        {badgeLabel && (
          <div className={`flex items-center gap-1.5 mb-1.5 ${labelCls}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
            <span className="text-[11px] font-medium">{badgeLabel}</span>
          </div>
        )}
        {panelType === 'station' && stationName && (
          <p className="text-[13px] font-semibold text-zinc-100 leading-tight">{stationName}</p>
        )}
        {panelType === 'powerPlant' && plantName && (
          <p className="text-[13px] font-semibold text-zinc-100 leading-tight truncate">
            {plantName}
          </p>
        )}
        {geocodeLoading ? (
          <Shimmer className="h-4 w-28 mt-0.5" />
        ) : placeName ? (
          <p
            className={`truncate flex items-center gap-1 mt-0.5 ${panelType === 'station' || panelType === 'powerPlant' ? 'text-[12px] text-zinc-300' : 'text-[13px] font-semibold text-zinc-100'}`}
          >
            <CountryFlag iso3={countryIso3} />
            <span className="truncate">{placeName}</span>
          </p>
        ) : panelType === 'fire' ? (
          <p className="flex items-center gap-1 text-[13px] font-semibold text-zinc-100 mt-0.5">
            <CountryFlag iso3={countryIso3} />
          </p>
        ) : null}
        <p className="text-[11px] text-zinc-400 font-mono leading-tight mt-0.5">
          {lngLat[1].toFixed(4)}°N {lngLat[0].toFixed(4)}°E
        </p>
      </div>
      <button
        onClick={onClose}
        aria-label={t('infoPanel.dismiss')}
        className="inline-flex items-center justify-center size-8.5 shrink-0 -mr-1.5 -mt-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 transition-colors"
      >
        <XIcon />
      </button>
    </div>
  );
}

// --- Secondary section (ambient AQ + wind) ---

function SecondarySection({
  aqPoint,
  windVec,
}: {
  aqPoint?: { pm25: number } | null;
  windVec: { wind_speed_kmh: number; wind_direction_deg: number } | null;
}) {
  const { t } = useTranslation();

  if (!aqPoint && !windVec) return null;

  return (
    <>
      <hr className="border-zinc-800 my-2" />
      <p className="text-[11px] text-zinc-300 mb-1.5">{t('infoPanel.ambient')}</p>
      {aqPoint && (
        <Row>
          <span className="text-zinc-300">
            {t('infoPanel.pm25')}{' '}
            <span className="text-zinc-500 text-[10px]" title={t('infoPanel.modelledTitle')}>
              {t('infoPanel.modelled')}
            </span>
          </span>
          <AqiBadge
            value={aqPoint.pm25}
            category={t(pm25ToCategory(aqPoint.pm25).key as never)}
            source="modelled"
          />
        </Row>
      )}
      {windVec && (
        <Row>
          <span className="text-zinc-300">{t('infoPanel.wind')}</span>
          <span className="text-[12px] text-zinc-100 font-medium inline-flex items-center gap-1 whitespace-nowrap">
            <WindArrow
              dirDeg={windVec.wind_direction_deg}
              size={11}
              color="#0d9488"
              strokeWidth={1.6}
            />
            {t('infoPanel.windFrom', {
              direction: degToCompass(windVec.wind_direction_deg),
              speed: windVec.wind_speed_kmh.toFixed(1),
            })}
          </span>
        </Row>
      )}
    </>
  );
}

// --- Station panel ---

function StationPanel({
  station,
  lngLat,
  historyDays,
  historyLoading,
  locale,
}: {
  station: {
    stationId: string;
    stationName: string;
    country: string | null;
    pm25: number;
    measuredAt: string;
  };
  lngLat: [number, number];
  historyDays: StationDayHistory[] | undefined;
  historyLoading: boolean;
  locale: string;
}) {
  const { t } = useTranslation();
  const cat = pm25ToCategory(station.pm25);
  const explainRateLimit = useUIStore((s) => s.explainRateLimit);
  const setExplainRateLimit = useUIStore((s) => s.setExplainRateLimit);

  return (
    <>
      <Row>
        <span className="text-zinc-300">{t('infoPanel.pm25')}</span>
        <AqiBadge value={station.pm25} category={t(cat.key as never)} />
      </Row>
      {station.measuredAt && (
        <Row>
          <span className="text-[11px] text-zinc-400">
            {t('infoPanel.measuredAt', {
              datetime: new Date(station.measuredAt).toLocaleString(locale, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Bangkok',
              }),
            })}
          </span>
        </Row>
      )}
      <ExplainButton
        key={station.stationId}
        stationId={station.stationId}
        lat={lngLat[1]}
        lng={lngLat[0]}
        rateLimitControl={{
          value: explainRateLimit,
          onSet: setExplainRateLimit,
          onClear: () => setExplainRateLimit(null),
        }}
        className="block w-full text-center text-[12px] font-semibold text-teal-300 bg-teal-950 border border-teal-800 hover:bg-teal-900 rounded py-1.5 mt-1.5 transition-colors ease-out hover:duration-175"
      />
      {(historyLoading || historyDays) && (
        <>
          <hr className="border-zinc-800 my-2" />
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] text-zinc-300">{t('infoPanel.last5days')}</p>
            <span className="text-[11px] text-zinc-400 font-mono">µg/m³</span>
          </div>
          {historyLoading || !historyDays ? <ShimmerHistory /> : <History days={historyDays} />}
        </>
      )}
    </>
  );
}

// --- Fire panel ---

function FirePanel({
  fire,
  aqPoint,
  windVec,
  locale,
}: {
  fire: {
    frp: number | null;
    confidence: string | null;
    detectedAt: string;
    daynight: string | null;
  };
  aqPoint: { pm25: number } | null;
  windVec: { wind_speed_kmh: number; wind_direction_deg: number } | null;
  locale: string;
}) {
  const { t } = useTranslation();
  const intensity = frpToIntensity(fire.frp);
  const conf = mapConfidence(fire.confidence);
  const dnKey = daynightKey(fire.daynight);
  const satKey = 'fire.satellite.noaa21';

  return (
    <>
      <Row>
        <span className="text-zinc-300">{t('infoPanel.intensity')}</span>
        <span className="text-right">
          <span className="text-zinc-100 font-medium">{t(intensity.labelKey as never)}</span>
          {intensity.raw && <span className="text-zinc-400 ml-1">{intensity.raw}</span>}
        </span>
      </Row>
      <Row>
        <span className="text-zinc-300">{t('infoPanel.confidence')}</span>
        <span className="flex items-center gap-1 text-zinc-100 font-medium">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: conf.color }}
          />
          {t(conf.labelKey as never)}
        </span>
      </Row>
      <Row>
        <span className="text-zinc-300">{t('infoPanel.satellite')}</span>
        <span className="text-zinc-100 font-medium">{t(satKey as never)}</span>
      </Row>
      <Row>
        <span className="text-[11px] text-zinc-400">
          {t('infoPanel.detectedAt', {
            datetime: new Date(fire.detectedAt).toLocaleString(locale, {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Bangkok',
            }),
          })}
          {dnKey && <> · {t(dnKey as never)}</>}
        </span>
      </Row>
      <SecondarySection aqPoint={aqPoint} windVec={windVec} />
    </>
  );
}

// --- Power plant panel ---

function PowerPlantPanel({
  plant,
  aqPoint,
  windVec,
}: {
  plant: {
    fuelType: string;
    capacityMw: number | null;
    owner: string | null;
    commissionedYear: number | null;
    country: string;
  };
  aqPoint: { pm25: number } | null;
  windVec: { wind_speed_kmh: number; wind_direction_deg: number } | null;
}) {
  const { t } = useTranslation();

  return (
    <>
      <Row>
        <span className="text-zinc-300">{t('infoPanel.fuel')}</span>
        <span className="text-[12px] text-zinc-100 font-medium">{plant.fuelType}</span>
      </Row>
      {plant.capacityMw !== null && (
        <Row>
          <span className="text-zinc-300">{t('infoPanel.capacity')}</span>
          <span className="text-[12px] text-zinc-100 font-medium font-mono tabular-nums">
            {Math.round(plant.capacityMw).toLocaleString('en-US')} MW
          </span>
        </Row>
      )}
      {plant.owner && (
        <Row align="start">
          <span className="text-zinc-300 shrink-0">{t('infoPanel.owner')}</span>
          <span className="text-[12px] text-zinc-100 font-medium text-right text-balance leading-snug max-w-42.5">
            {plant.owner}
          </span>
        </Row>
      )}
      {plant.commissionedYear !== null && (
        <Row>
          <span className="text-zinc-300">{t('infoPanel.built')}</span>
          <span className="text-[12px] text-zinc-100 font-medium font-mono tabular-nums">
            {plant.commissionedYear}
          </span>
        </Row>
      )}
      <SecondarySection aqPoint={aqPoint} windVec={windVec} />
    </>
  );
}

// --- Shared primitives ---

function Row({
  children,
  align = 'center',
}: {
  children: React.ReactNode;
  align?: 'center' | 'start';
}) {
  return (
    <motion.div
      className={`flex justify-between gap-3 text-[12px] py-1 ${align === 'start' ? 'items-start' : 'items-center'}`}
    >
      {children}
    </motion.div>
  );
}

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-700 rounded ${className ?? ''}`} />;
}

// --- Helpers ---

function frpToIntensity(frp: number | null): { labelKey: string; raw: string | null } {
  if (frp === null) return { labelKey: 'fire.intensity.unknown', raw: null };
  if (frp < 10) return { labelKey: 'fire.intensity.small', raw: `(${frp.toFixed(0)} MW)` };
  if (frp < 50) return { labelKey: 'fire.intensity.moderate', raw: `(${frp.toFixed(0)} MW)` };
  if (frp < 200) return { labelKey: 'fire.intensity.large', raw: `(${frp.toFixed(0)} MW)` };
  return { labelKey: 'fire.intensity.extreme', raw: `(${frp.toFixed(0)} MW)` };
}

function daynightKey(dn: string | null | undefined): string | null {
  if (!dn) return null;
  const u = dn.toUpperCase();
  if (u === 'D') return 'fire.daynight.day';
  if (u === 'N') return 'fire.daynight.night';
  return null;
}

function mapConfidence(raw: string | null): { labelKey: string; color: string } {
  if (!raw) return { labelKey: 'fire.confidence.unknown', color: '#71717a' };
  const lower = raw.toLowerCase();
  if (lower === 'low' || lower === 'l')
    return { labelKey: 'fire.confidence.low', color: '#f59e0b' };
  if (lower === 'nominal' || lower === 'n')
    return { labelKey: 'fire.confidence.nominal', color: '#22c55e' };
  if (lower === 'high' || lower === 'h')
    return { labelKey: 'fire.confidence.high', color: '#22c55e' };
  return { labelKey: 'fire.confidence.unknown', color: '#71717a' };
}

// --- Icons ---

function CursorClickIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
