import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { StationDayHistory } from '@thailand-aq/types';
import { useUIStore } from '../../../store/uiStore';
import { useTimeStore } from '../../../store/timeStore';
import { ExplainButton } from '../../ExplainButton';
import { AqiBadge } from './AqiBadge';
import { pm25ToCategory } from '../../../lib/aqiColors';
import { reverseGeocode } from '../../../lib/geocode';
import { CountryFlag, alpha2ToIso3 } from '../../../lib/countryFlag';
import { findNearestAQPoint, findNearestWind, degToCompass } from '../../../lib/ambient';
import { useCamsGrid } from '../../../hooks/useCamsGrid';
import { useAQI } from '../../../hooks/useAQI';
import { useWind } from '../../../hooks/useWind';
import { History, ShimmerHistory } from './History';
import { WindArrow } from './WindArrow';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const API = import.meta.env.VITE_API_BASE_URL;

type HistoryState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: StationDayHistory[] | null;
};

export function InfoPanel() {
  const selectedPoint = useUIStore((s) => s.selectedPoint);
  const setSelectedPoint = useUIStore((s) => s.setSelectedPoint);
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const { data: aqGrid } = useCamsGrid();
  const { data: aqData, isLoading: aqLoading } = useAQI();
  const { data: wind } = useWind();

  const [placeName, setPlaceName] = useState<string | null>(null);
  const [geocodeCountryIso3, setGeocodeCountryIso3] = useState<string | null>(null);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [history, setHistory] = useState<HistoryState>({ status: 'idle', data: null });

  // Reverse geocode whenever coordinates change
  const coordKey = selectedPoint ? `${selectedPoint.lngLat[0]},${selectedPoint.lngLat[1]}` : null;
  useEffect(() => {
    if (!coordKey || !selectedPoint) {
      setPlaceName(null);
      setGeocodeCountryIso3(null);
      return;
    }
    setPlaceName(null);
    setGeocodeCountryIso3(null);
    setGeocodeLoading(true);
    void reverseGeocode(selectedPoint.lngLat[0], selectedPoint.lngLat[1], TOKEN)
      .then(({ placeName: name, countryAlpha2 }) => {
        setPlaceName(name);
        setGeocodeCountryIso3(countryAlpha2 ? alpha2ToIso3(countryAlpha2) : null);
      })
      .finally(() => setGeocodeLoading(false));
  }, [coordKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync station tooltip when the date changes: update pm25/measuredAt from fresh AQI data,
  // or close the panel if the station has no data for the new date.
  const stationId = selectedPoint?.station?.stationId ?? null;
  useEffect(() => {
    if (!stationId || aqLoading || !aqData) return;
    if (!aqData.find((m) => m.stationId === stationId)) setSelectedPoint(null);
  }, [selectedDate, aqLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live measurement for the selected station — updates whenever AQI data refreshes.
  const liveAqi = stationId ? (aqData?.find((m) => m.stationId === stationId) ?? null) : null;
  const displayStation =
    selectedPoint?.station && liveAqi
      ? { ...selectedPoint.station, pm25: liveAqi.value, measuredAt: liveAqi.measuredAt }
      : (selectedPoint?.station ?? null);

  // Fetch 5-day history when a station or the selected date changes
  useEffect(() => {
    if (!stationId) {
      setHistory({ status: 'idle', data: null });
      return;
    }
    setHistory({ status: 'loading', data: null });
    fetch(`${API}/api/stations/${stationId}/history?days=5&date=${selectedDate}`)
      .then((r) => r.json())
      .then((body: { days: StationDayHistory[] }) =>
        setHistory({ status: 'success', data: body.days }),
      )
      .catch(() => setHistory({ status: 'error', data: null }));
  }, [stationId, selectedDate]);

  // Close on Escape
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

  // Country for each panel type
  const countryIso3 =
    panelType === 'station'
      ? (displayStation?.country ?? geocodeCountryIso3)
      : panelType === 'powerPlant'
        ? (selectedPoint?.powerPlant?.country ?? null)
        : geocodeCountryIso3; // fire: from reverse geocode

  if (!selectedPoint) {
    return (
      <div
        role="region"
        aria-label="Point details"
        className="hidden md:block absolute top-3 right-3 w-[260px] bg-white border border-gray-200 rounded-md z-20 pointer-events-auto"
      >
        <motion.div
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex flex-col items-center justify-center h-[100px] gap-2 text-gray-400"
        >
          <CursorClickIcon />
          <span className="text-sm text-center leading-tight">
            Click a point
            <br />
            on the map
          </span>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Point details"
      className="absolute top-3 right-3 w-[260px] max-h-[80vh] overflow-y-auto bg-white border border-gray-200 rounded-md z-20 pointer-events-auto"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={panelType}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
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
              history={history}
            />
          )}
          {selectedPoint.fire && (
            <FirePanel fire={selectedPoint.fire} aqPoint={aqPoint} windVec={windVec} />
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
  const badgeLabel =
    panelType === 'station'
      ? 'AQI Station'
      : panelType === 'fire'
        ? 'Fire Detection'
        : panelType === 'powerPlant'
          ? 'Power Plant'
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
          <Shimmer className="h-3 w-24 mb-0.5 mt-0.5" />
        ) : placeName ? (
          <p
            className={`truncate inline-flex items-center gap-1 ${panelType === 'station' || panelType === 'powerPlant' ? 'text-[11px] text-gray-500' : 'text-xs font-medium text-gray-800'}`}
          >
            <CountryFlag iso3={countryIso3} />
            <span className="truncate">{placeName}</span>
          </p>
        ) : panelType === 'fire' ? (
          <p className="inline-flex items-center gap-1 text-xs font-medium text-gray-800">
            <CountryFlag iso3={countryIso3} />
          </p>
        ) : null}
        <p className="text-[10px] text-gray-400 leading-tight">
          {lngLat[1].toFixed(4)}°N {lngLat[0].toFixed(4)}°E
        </p>
      </div>
      <button
        onClick={onClose}
        aria-label="Dismiss"
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
  if (!aqPoint && !windVec) return null;

  return (
    <>
      <hr className="border-gray-100 my-2" />
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Ambient</p>
      {aqPoint && (
        <Row>
          <span className="text-gray-500">PM2.5</span>
          <AqiBadge value={aqPoint.pm25} category={pm25ToCategory(aqPoint.pm25).label} />
        </Row>
      )}
      {windVec && (
        <Row>
          <span className="text-gray-500">Wind</span>
          <span className="text-[11px] text-gray-700 font-medium inline-flex items-center gap-1 whitespace-nowrap">
            <WindArrow
              dirDeg={windVec.wind_direction_deg}
              size={11}
              color="#374151"
              strokeWidth={1.6}
            />
            from {degToCompass(windVec.wind_direction_deg)} · {windVec.wind_speed_kmh.toFixed(1)}{' '}
            km/h
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
  history,
}: {
  station: {
    stationId: string;
    stationName: string;
    country: string | null;
    pm25: number;
    unit: string;
    measuredAt: string;
  };
  lngLat: [number, number];
  history: HistoryState;
}) {
  const cat = pm25ToCategory(station.pm25);
  const explainQuotaExceeded = useUIStore((s) => s.explainQuotaExceeded);
  const setExplainQuotaExceeded = useUIStore((s) => s.setExplainQuotaExceeded);
  return (
    <>
      <Row>
        <span className="text-gray-500">PM2.5</span>
        <AqiBadge value={station.pm25} category={cat.label} />
      </Row>
      {station.measuredAt && (
        <Row>
          <span className="text-[11px] text-gray-400">
            Measured at{' '}
            {new Date(station.measuredAt).toLocaleString('en-GB', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Bangkok',
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
        className="block w-full text-center text-[12px] font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-md py-1.5 mt-1.5 transition-colors shadow-sm"
      />
      {history.status !== 'idle' && history.status !== 'error' && (
        <>
          <hr className="border-gray-100 my-2" />
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
            Last 5 days · PM2.5{' '}
            <span className="normal-case tracking-normal text-gray-400">µg/m³</span>
          </p>
          {history.status === 'loading' || !history.data ? (
            <ShimmerHistory />
          ) : (
            <History days={history.data} />
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
}: {
  fire: {
    frp: number | null;
    confidence: string | null;
    detectedAt: string;
    daynight: string | null;
  };
  aqPoint: { pm25: number } | null;
  windVec: { wind_speed_kmh: number; wind_direction_deg: number } | null;
}) {
  const intensity = frpToIntensity(fire.frp);
  const conf = mapConfidence(fire.confidence);
  const dn = daynightLabel(fire.daynight);

  return (
    <>
      <Row>
        <span className="text-gray-500">Intensity</span>
        <span className="text-right">
          <span className="text-gray-700 font-medium">{intensity.label}</span>
          {intensity.raw && <span className="text-gray-400 ml-1">{intensity.raw}</span>}
        </span>
      </Row>
      <Row>
        <span className="text-gray-500">Confidence</span>
        <span className="flex items-center gap-1 text-gray-700 font-medium">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: conf.color }}
          />
          {conf.label}
        </span>
      </Row>
      <Row>
        <span className="text-[11px] text-gray-400">
          Detected at{' '}
          {new Date(fire.detectedAt).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Bangkok',
          })}
          {dn && <> · {dn}</>}
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
  return (
    <>
      <Row>
        <span className="text-gray-500">Fuel</span>
        <span className="text-[11px] text-gray-700 font-medium">{plant.fuelType}</span>
      </Row>
      {plant.capacityMw !== null && (
        <Row>
          <span className="text-gray-500">Capacity</span>
          <span className="text-[11px] text-gray-700 font-medium tabular-nums">
            {Math.round(plant.capacityMw).toLocaleString('en-US')} MW
          </span>
        </Row>
      )}
      {plant.owner && (
        <Row align="start">
          <span className="text-gray-500 shrink-0">Owner</span>
          <span className="text-[11px] text-gray-700 font-medium text-right text-balance leading-snug max-w-[170px]">
            {plant.owner}
          </span>
        </Row>
      )}
      {plant.commissionedYear !== null && (
        <Row>
          <span className="text-gray-500">Built</span>
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

// --- Helpers ---

function frpToIntensity(frp: number | null): { label: string; raw: string | null } {
  if (frp === null) return { label: 'Unknown intensity', raw: null };
  if (frp < 10) return { label: 'Small fire', raw: `(${frp.toFixed(0)} MW)` };
  if (frp < 50) return { label: 'Moderate fire', raw: `(${frp.toFixed(0)} MW)` };
  if (frp < 200) return { label: 'Large fire', raw: `(${frp.toFixed(0)} MW)` };
  return { label: 'Extreme fire', raw: `(${frp.toFixed(0)} MW)` };
}

function daynightLabel(dn: string | null | undefined): string | null {
  if (!dn) return null;
  const u = dn.toUpperCase();
  if (u === 'D') return 'Daytime';
  if (u === 'N') return 'Nighttime';
  return null;
}

function mapConfidence(raw: string | null): { label: string; color: string } {
  if (!raw) return { label: 'Unknown', color: '#9ca3af' };
  const lower = raw.toLowerCase();
  if (lower === 'low' || lower === 'l') return { label: 'Low', color: '#f59e0b' };
  if (lower === 'nominal' || lower === 'n') return { label: 'Nominal', color: '#22c55e' };
  if (lower === 'high' || lower === 'h') return { label: 'High', color: '#22c55e' };
  return { label: 'Unknown', color: '#9ca3af' };
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
