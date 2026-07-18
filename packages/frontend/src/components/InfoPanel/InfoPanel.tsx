import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TWEEN_ENTER, TWEEN_EXIT } from '@/utils/animation';
import { useTranslation } from 'react-i18next';
import type { StationDayHistory } from '@thailand-aq/types';
import { useUIStore, dayToDate, useEffectiveScrubberDays } from '@/store/uiStore';
import { useTimeStore } from '@/store/timeStore';
import { ExplainButton } from '@/components/ExplainButton/ExplainButton';
import { AqiBadge } from './AqiBadge';
import { pm25ToCategory } from '@/utils/aqiColors';
import { reverseGeocode } from './utils.geocode';
import { AppScrollArea } from '@/components/AppScrollArea';
import { Shimmer } from '@/components/Shimmer';
import { CountryFlag, alpha2ToIso3 } from './CountryFlag';
import { findNearestAQPoint, findNearestWind, degToCompass } from './utils.ambient';
import { useCamsGrid, useStationReadings, useWind } from '@/hooks';
import { useStationHistory } from './useStationHistory';
import { dateLocale, toDisplayYear } from '@/i18n';
import { History, ShimmerHistory } from './History';
import { YearCurve } from './YearCurve';
import { useStationBaseline } from './useStationBaseline';
import { classifyReading, dateToPeriodKey } from './utils.baseline';
import { WindArrow } from './WindArrow';
import { BottomSheet } from '@/components/BottomSheet';
import { HEADER_HEIGHT } from '@/components/Header/Header';
import { mapRef } from '@/utils/mapRef';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const PANEL_BASE =
  'absolute top-3 right-3 w-[260px] bg-zinc-900 border border-zinc-700/60 rounded-lg z-20 pointer-events-auto shadow-2xl';

// ponytail: tune against real station content on a narrow viewport (≈375px)
const PEEK_HEIGHT = 232;
const BASELINE_DISPLAY_GATE = 30;

export function InfoPanel() {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.language);

  const selectedPoint = useUIStore((s) => s.selectedPoint);
  const setSelectedPoint = useUIStore((s) => s.setSelectedPoint);
  const pendingSelection = useUIStore((s) => s.pendingSelection);
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
    void reverseGeocode(lng, lat, TOKEN, i18n.language)
      .then(({ placeName: name, countryAlpha2 }) => {
        setPlaceName(name);
        setGeocodeCountryIso3(countryAlpha2 ? alpha2ToIso3(countryAlpha2) : null);
      })
      .finally(() => setGeocodeLoading(false));
  }, [coordKey, i18n.language]);

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

  const {
    data: historyDays,
    isPending: historyLoading,
    isFetching: historyFetching,
  } = useStationHistory(stationId);

  // BottomSheet registers its own Escape handler when open=true (covers both mobile and desktop
  // via the portal), so no separate handler is needed here.

  // Resets to peek on every new selection so the sheet always opens at rest height.
  const [detent, setDetent] = useState<'peek' | 'full'>('peek');
  useEffect(() => {
    setDetent('peek');
  }, [selectedPoint]);

  // Use visualViewport so fullHeight stays correct when the virtual keyboard
  // appears / dismisses on mobile (window.innerHeight does not update).
  const [viewportHeight, setViewportHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight,
  );
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewportHeight(vv.height);
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);
  const fullHeight = Math.round(viewportHeight * 0.75);

  // Auto-pan the map so the selected marker is centered in the visible area
  // between the header and the bottom sheet on mobile.
  useEffect(() => {
    if (window.innerWidth >= 768) return;
    if (!selectedPoint) {
      if (!mapRef.current?.isMoving()) {
        mapRef.current?.easeTo({
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          duration: 300,
        });
      }
      return;
    }
    const bottom = detent === 'full' ? fullHeight : PEEK_HEIGHT;
    mapRef.current?.easeTo({
      padding: { top: HEADER_HEIGHT, right: 0, bottom, left: 0 },
      center: selectedPoint.lngLat,
      duration: 300,
    });
  }, [selectedPoint, detent, fullHeight]);

  const liveAqi = stationId ? (aqData?.find((m) => m.stationId === stationId) ?? null) : null;
  const displayStation =
    selectedPoint?.station && liveAqi
      ? { ...selectedPoint.station, pm25: liveAqi.value, measuredAt: liveAqi.measuredAt }
      : (selectedPoint?.station ?? null);

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

  const isOpen = !!selectedPoint || !!pendingSelection;

  function renderPanelContent(
    sp: NonNullable<typeof selectedPoint>,
    showClose: boolean,
    onExpand?: () => void,
  ) {
    return (
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
            lngLat={sp.lngLat}
            placeName={placeName}
            geocodeLoading={geocodeLoading}
            stationName={displayStation?.stationName ?? null}
            plantName={sp.powerPlant?.name ?? null}
            countryIso3={countryIso3}
            onClose={() => setSelectedPoint(null)}
            showClose={showClose}
          />
          <hr className="border-zinc-800 my-2" />
          {displayStation && (
            <StationPanel
              station={displayStation}
              lngLat={sp.lngLat}
              historyDays={historyDays}
              historyLoading={historyLoading}
              historyFetching={historyFetching}
              locale={locale}
              onExpand={onExpand}
            />
          )}
          {sp.fire && (
            <FirePanel fire={sp.fire} aqPoint={aqPoint} windVec={windVec} locale={locale} />
          )}
          {sp.powerPlant && (
            <PowerPlantPanel plant={sp.powerPlant} aqPoint={aqPoint} windVec={windVec} />
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <>
      {/* Desktop: floating card */}
      <div
        role="region"
        aria-label={t('infoPanel.ariaLabel')}
        className={`hidden md:block ${PANEL_BASE}`}
      >
        {!selectedPoint ? (
          pendingSelection ? (
            <PanelSkeleton />
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={TWEEN_ENTER}
              className="flex flex-col items-center justify-center h-25 gap-2 text-zinc-500"
            >
              <CursorClickIcon />
              <span className="text-[13px] text-zinc-300 text-center leading-snug whitespace-pre-line">
                {t('infoPanel.clickPrompt')}
              </span>
            </motion.div>
          )
        ) : (
          <div className="overflow-hidden max-h-[calc(100%-1.5rem)]">
            <AppScrollArea viewportClassName="max-h-[80svh]">
              {renderPanelContent(selectedPoint, true)}
            </AppScrollArea>
          </div>
        )}
      </div>

      {/* Mobile: bottom sheet — all three panel types, unified two-detent */}
      <BottomSheet
        open={isOpen}
        onClose={() => setSelectedPoint(null)}
        closeAriaLabel={t('infoPanel.dismiss')}
        detents={{ peekHeight: PEEK_HEIGHT, fullHeight }}
        activeDetent={detent}
        onDetentChange={setDetent}
        showBackdrop={false}
      >
        {!selectedPoint ? (
          <PanelSkeleton />
        ) : (
          renderPanelContent(selectedPoint, false, () => setDetent('full'))
        )}
      </BottomSheet>
    </>
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
  showClose = true,
}: {
  panelType: string | null;
  lngLat: [number, number];
  placeName: string | null;
  geocodeLoading: boolean;
  stationName: string | null;
  plantName: string | null;
  countryIso3: string | null;
  onClose: () => void;
  showClose?: boolean;
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
            <span className="text-[12px] font-medium">{badgeLabel}</span>
          </div>
        )}
        {panelType === 'station' && stationName && (
          <p className="text-[14px] font-semibold text-zinc-100 leading-tight wrap-break-word">
            {stationName}
          </p>
        )}
        {panelType === 'powerPlant' && plantName && (
          <p className="text-[14px] font-semibold text-zinc-100 leading-tight wrap-break-word">
            {plantName}
          </p>
        )}
        {geocodeLoading ? (
          <Shimmer className="h-5 w-28 mt-0.5" />
        ) : placeName ? (
          <p
            className={`flex items-start gap-1 mt-0.5 ${panelType === 'station' || panelType === 'powerPlant' ? 'text-[13px] text-zinc-300' : 'text-[14px] font-semibold text-zinc-100'}`}
          >
            <CountryFlag iso3={countryIso3} className="mt-1" />
            <span className="min-w-0 wrap-break-word">{placeName}</span>
          </p>
        ) : panelType === 'fire' ? (
          <p className="flex items-center gap-1 text-[14px] font-semibold text-zinc-100 mt-0.5">
            <CountryFlag iso3={countryIso3} />
          </p>
        ) : null}
        <p className="text-[12px] text-zinc-400 font-mono leading-tight mt-0.5">
          {lngLat[1].toFixed(4)}°N {lngLat[0].toFixed(4)}°E
        </p>
      </div>
      {showClose && (
        <button
          onClick={onClose}
          aria-label={t('infoPanel.dismiss')}
          className="inline-flex items-center justify-center size-8.5 shrink-0 -mr-1.5 -mt-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 transition-colors"
        >
          <XIcon />
        </button>
      )}
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
      <p className="text-[12px] text-zinc-300 mb-1.5">{t('infoPanel.ambient')}</p>
      {aqPoint && (
        <Row>
          <span className="text-zinc-300">
            {t('infoPanel.pm25')}{' '}
            <span className="text-zinc-500 text-[11px]" title={t('infoPanel.modelledTitle')}>
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
          <span className="text-[13px] text-zinc-100 font-medium inline-flex items-center gap-1 whitespace-nowrap">
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
  historyFetching,
  locale,
  onExpand,
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
  historyFetching: boolean;
  locale: string;
  onExpand?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const cat = pm25ToCategory(station.pm25);
  const explainRateLimit = useUIStore((s) => s.explainRateLimit);
  const setExplainRateLimit = useUIStore((s) => s.setExplainRateLimit);
  const scrubberDay = useUIStore((s) => s.scrubberDay);
  const setScrubberDay = useUIStore((s) => s.setScrubberDay);
  const scrubberDays = useEffectiveScrubberDays();
  const latestDate = useTimeStore((s) => s.latestDate);
  const selectedDate = useTimeStore((s) => s.selectedDate);

  const { data: baselineResp } = useStationBaseline(station.stationId, true);
  const baselineData = baselineResp?.data;
  const baselineYears =
    baselineResp?.minYear && baselineResp?.maxYear
      ? `${toDisplayYear(baselineResp.minYear, i18n.language)}–${toDisplayYear(baselineResp.maxYear, i18n.language)}`
      : null;

  // historyDays covers selectedDate-4 through selectedDate+1 (6 rows, see useStationHistory).
  // Both directions use the same presence check so neither button fires if the station
  // has no reading on that date.
  const historyDateSet = new Set(
    historyDays?.filter((d) => d.readingCount > 0).map((d) => d.date) ?? [],
  );
  const prevDate = scrubberDay > 0 ? dayToDate(scrubberDay - 1, latestDate, scrubberDays) : null;
  const nextDate =
    scrubberDay < scrubberDays - 1 ? dayToDate(scrubberDay + 1, latestDate, scrubberDays) : null;
  const canGoPrev = prevDate !== null && historyDateSet.has(prevDate);
  const canGoNext = nextDate !== null && historyDateSet.has(nextDate);
  // Chart only shows days up to (and including) the currently selected date.
  const chartDays = historyDays?.filter((d) => d.date <= selectedDate);
  const fmtDay = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  return (
    <>
      <Row>
        <span className="text-zinc-300">{t('infoPanel.pm25')}</span>
        <AqiBadge value={station.pm25} category={t(cat.key as never)} />
      </Row>
      {station.measuredAt && (
        <Row>
          <span className="text-[12px] text-zinc-400">
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
          <div className="md:hidden flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setScrubberDay(scrubberDay - 1)}
              disabled={!canGoPrev}
              aria-label={t('infoPanel.prevDay')}
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200 disabled:text-zinc-700 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <ChevronLeftIcon />
              {canGoPrev && prevDate && fmtDay(prevDate)}
            </button>
            <button
              onClick={() => setScrubberDay(scrubberDay + 1)}
              disabled={!canGoNext}
              aria-label={t('infoPanel.nextDay')}
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200 disabled:text-zinc-700 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              {canGoNext && nextDate && fmtDay(nextDate)}
              <ChevronRightIcon />
            </button>
          </div>
        </Row>
      )}
      {/* onClickCapture fires before ExplainButton's own handler, expanding the sheet first */}
      <div onClickCapture={onExpand}>
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
          className="block w-full text-center text-[13px] font-semibold text-teal-300 bg-teal-950 border border-teal-800 hover:bg-teal-900 rounded py-1.5 mt-1.5 transition-colors ease-out hover:duration-175"
        />
      </div>
      {(() => {
        const latestDay = chartDays?.[chartDays.length - 1];
        const bl = latestDay?.baseline;
        if (!bl || bl.n < BASELINE_DISPLAY_GATE || !latestDay.readingCount) return null;
        const category = classifyReading(latestDay.pm25, bl);
        const dayNum = Number(latestDay.date.slice(8, 10));
        const monthName = new Date(latestDay.date + 'T00:00:00Z').toLocaleDateString(locale, {
          month: 'long',
          timeZone: 'UTC',
        });
        const periodKey = dateToPeriodKey(dayNum);
        const period = t(`infoPanel.baseline.${periodKey}` as never, { month: monthName });
        const label = t(`infoPanel.baseline.${category}` as never, { period });
        const range = t('infoPanel.baseline.typicalRange' as never, {
          low: Math.round(bl.p25Pm25),
          high: Math.round(bl.p75Pm25),
        });
        return (
          <p className="text-[12px] text-zinc-400 mt-0.5">
            {label} ({range})
          </p>
        );
      })()}
      <hr className="border-zinc-800 my-2" />
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] text-zinc-300">
          {t('infoPanel.baseline.yearCurve')}
          {baselineYears && ` · ${baselineYears}`}
        </p>
      </div>
      {baselineData && baselineData.length > 0 ? (
        <YearCurve
          data={baselineData}
          currentPm25={chartDays?.[chartDays.length - 1]?.pm25 ?? null}
          selectedDate={selectedDate}
        />
      ) : (
        <Shimmer className="h-[140px] w-full" />
      )}
      {(historyLoading || historyDays) && (
        <>
          <hr className="border-zinc-800 my-2" />
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] text-zinc-300">{t('infoPanel.last5days')}</p>
            <span className="text-[12px] text-zinc-400 font-mono">µg/m³</span>
          </div>
          {historyLoading || !chartDays ? (
            <ShimmerHistory />
          ) : (
            <div
              className={historyFetching ? 'opacity-40 transition-opacity' : 'transition-opacity'}
            >
              <History days={chartDays} />
            </div>
          )}
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
        <span className="text-[12px] text-zinc-400">
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
        <span className="text-[13px] text-zinc-100 font-medium">{plant.fuelType}</span>
      </Row>
      {plant.capacityMw !== null && (
        <Row>
          <span className="text-zinc-300">{t('infoPanel.capacity')}</span>
          <span className="text-[13px] text-zinc-100 font-medium font-mono tabular-nums">
            {Math.round(plant.capacityMw).toLocaleString('en-US')} MW
          </span>
        </Row>
      )}
      {plant.owner && (
        <Row align="start">
          <span className="text-zinc-300 shrink-0">{t('infoPanel.owner')}</span>
          <span className="text-[13px] text-zinc-100 font-medium text-right text-balance leading-snug max-w-42.5">
            {plant.owner}
          </span>
        </Row>
      )}
      {plant.commissionedYear !== null && (
        <Row>
          <span className="text-zinc-300">{t('infoPanel.built')}</span>
          <span className="text-[13px] text-zinc-100 font-medium font-mono tabular-nums">
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
      className={`flex justify-between gap-3 text-[13px] py-1 ${align === 'start' ? 'items-start' : 'items-center'}`}
    >
      {children}
    </motion.div>
  );
}

function PanelSkeleton() {
  return (
    <div className="p-3 flex flex-col gap-2">
      <Shimmer className="h-4 w-16" />
      <Shimmer className="h-5 w-36" />
      <Shimmer className="h-4 w-24 mt-0.5" />
      <hr className="border-zinc-800 my-1" />
      <Shimmer className="h-5 w-full" />
      <Shimmer className="h-5 w-full" />
    </div>
  );
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

function ChevronLeftIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 12L6 8l4-4" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 12l4-4-4-4" />
    </svg>
  );
}

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
