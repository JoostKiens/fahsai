import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TWEEN_ENTER, TWEEN_EXIT } from '../../../utils/animation';
import { useTranslation } from 'react-i18next';
import type { StationDayHistory } from '@thailand-aq/types';
import { useUIStore } from '../../../store/uiStore';
import { ExplainButton } from '../../ExplainButton';
import { AqiBadge } from './AqiBadge';
import { pm25ToCategory } from '../../../utils/aqiColors';
import { reverseGeocode } from '../../../utils/geocode';
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
        className="hidden md:block absolute top-3 right-3 w-[260px] bg-white border border-gray-200 rounded-md z-20 pointer-events-auto"
      >
        <motion.div
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={TWEEN_ENTER}
          className="flex flex-col items-center justify-center h-[100px] gap-2 text-gray-400"
        >
          <CursorClickIcon />
          <span className="text-sm text-center leading-tight whitespace-pre-line">
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
      className="absolute top-3 right-3 w-[260px] max-h-[80vh] overflow-y-auto bg-white border border-gray-200 rounded-md z-20 pointer-events-auto"
    >
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

          <hr className="border-gray-100 my-2" />

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
            <PowerPlantPanel plant={selectedPoint.powerPlant} aqPoint={aqPoint} windVec={windVec} />
          )}
        </motion.div>
      </AnimatePresence>
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

  return (
    <div className="flex items-start justify-between">
      <div className="min-w-0 flex-1 pr-2">
        <p className="text-[10px] font-medium uppercase tracking-widest text-gray-500 leading-tight mb-0.5">
          {badgeLabel}
        </p>
        {panelType === 'station' && stationName && (
          <p className="text-xs font-medium text-gray-800">{stationName}</p>
        )}
        {panelType === 'powerPlant' && plantName && (
          <p className="text-xs font-medium text-gray-800 truncate">{plantName}</p>
        )}
        {geocodeLoading ? (
          <Shimmer className="h-4 w-28" />
        ) : placeName ? (
          <p
            className={`truncate flex items-center gap-1 ${panelType === 'station' || panelType === 'powerPlant' ? 'text-[11px] text-gray-500' : 'text-xs font-medium text-gray-800'}`}
          >
            <CountryFlag iso3={countryIso3} />
            <span className="truncate">{placeName}</span>
          </p>
        ) : panelType === 'fire' ? (
          <p className="flex items-center gap-1 text-xs font-medium text-gray-800">
            <CountryFlag iso3={countryIso3} />
          </p>
        ) : null}
        <p className="text-[10px] text-gray-400 leading-tight">
          {lngLat[1].toFixed(4)}°N {lngLat[0].toFixed(4)}°E
        </p>
      </div>
      <button
        onClick={onClose}
        aria-label={t('infoPanel.dismiss')}
        className="text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded shrink-0"
      >
        <XIcon />
      </button>
    </div>
  );
}

// --- Secondary section (ambient AQ + wind) — used by Fire and PowerPlant panels ---

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
      <hr className="border-gray-100 my-2" />
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
        {t('infoPanel.ambient')}
      </p>
      {aqPoint && (
        <Row>
          <span className="text-gray-500">
            {t('infoPanel.pm25')}{' '}
            <span className="text-gray-400" title={t('infoPanel.modelledTitle')}>
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
          <span className="text-gray-500">{t('infoPanel.wind')}</span>
          <span className="text-[11px] text-gray-700 font-medium inline-flex items-center gap-1 whitespace-nowrap">
            <WindArrow
              dirDeg={windVec.wind_direction_deg}
              size={11}
              color="#374151"
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
  const explainQuotaExceeded = useUIStore((s) => s.explainQuotaExceeded);
  const setExplainQuotaExceeded = useUIStore((s) => s.setExplainQuotaExceeded);

  return (
    <>
      <Row>
        <span className="text-gray-500">{t('infoPanel.pm25')}</span>
        <AqiBadge value={station.pm25} category={t(cat.key as never)} />
      </Row>
      {station.measuredAt && (
        <Row>
          <span className="text-[11px] text-gray-400">
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
        globalQuotaExceeded={explainQuotaExceeded}
        onQuotaExceeded={() => setExplainQuotaExceeded(true)}
        className="block w-full text-center text-[12px] font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-md py-1.5 mt-1.5 transition-colors ease-out hover:duration-175 shadow-sm"
      />
      {(historyLoading || historyDays) && (
        <>
          <hr className="border-gray-100 my-2" />
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
            {t('infoPanel.last5days')}{' '}
            <span className="normal-case tracking-normal text-gray-400">µg/m³</span>
          </p>
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
        <span className="text-gray-500">{t('infoPanel.intensity')}</span>
        <span className="text-right">
          <span className="text-gray-700 font-medium">{t(intensity.labelKey as never)}</span>
          {intensity.raw && <span className="text-gray-400 ml-1">{intensity.raw}</span>}
        </span>
      </Row>
      <Row>
        <span className="text-gray-500">{t('infoPanel.confidence')}</span>
        <span className="flex items-center gap-1 text-gray-700 font-medium">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: conf.color }}
          />
          {t(conf.labelKey as never)}
        </span>
      </Row>
      <Row>
        <span className="text-[11px] text-gray-400">
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
      <Row>
        <span className="text-gray-500">{t('infoPanel.satellite')}</span>
        <span className="text-gray-700 font-medium">{t(satKey as never)}</span>
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
        <span className="text-gray-500">{t('infoPanel.fuel')}</span>
        <span className="text-[11px] text-gray-700 font-medium">{plant.fuelType}</span>
      </Row>
      {plant.capacityMw !== null && (
        <Row>
          <span className="text-gray-500">{t('infoPanel.capacity')}</span>
          <span className="text-[11px] text-gray-700 font-medium tabular-nums">
            {Math.round(plant.capacityMw).toLocaleString('en-US')} MW
          </span>
        </Row>
      )}
      {plant.owner && (
        <Row align="start">
          <span className="text-gray-500 shrink-0">{t('infoPanel.owner')}</span>
          <span className="text-[11px] text-gray-700 font-medium text-right text-balance leading-snug max-w-[170px]">
            {plant.owner}
          </span>
        </Row>
      )}
      {plant.commissionedYear !== null && (
        <Row>
          <span className="text-gray-500">{t('infoPanel.built')}</span>
          <span className="text-[11px] text-gray-700 font-medium tabular-nums">
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
      className={`flex justify-between gap-3 text-[11px] py-1 ${align === 'start' ? 'items-start' : 'items-center'}`}
    >
      {children}
    </motion.div>
  );
}

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded ${className ?? ''}`} />;
}

// --- Helpers — return translation keys, never display strings ---

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
  if (!raw) return { labelKey: 'fire.confidence.unknown', color: '#9ca3af' };
  const lower = raw.toLowerCase();
  if (lower === 'low' || lower === 'l')
    return { labelKey: 'fire.confidence.low', color: '#f59e0b' };
  if (lower === 'nominal' || lower === 'n')
    return { labelKey: 'fire.confidence.nominal', color: '#22c55e' };
  if (lower === 'high' || lower === 'h')
    return { labelKey: 'fire.confidence.high', color: '#22c55e' };
  return { labelKey: 'fire.confidence.unknown', color: '#9ca3af' };
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
