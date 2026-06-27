import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { useTranslation } from 'react-i18next';
import { useStationReadings, type LatestMeasurement } from '@/hooks/useStationReadings';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { mapRef } from '@/utils/mapRef';
import { pm25ToRgb, contrastColor } from '@/utils/aqiColors';
import { CloseIcon } from './icons';
import { AppScrollArea } from '@/components/AppScrollArea';
import { FUSE_KEYS, FUSE_THRESHOLD, MAX_STATION_RESULTS, buildGeocodeUrl } from './searchConfig';

interface PlaceResult {
  name: string;
  lng: number;
  lat: number;
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function Pm25Dot({ value }: { value: number }) {
  const rgb = pm25ToRgb(value);
  const [cr, cg, cb] = contrastColor(rgb);
  return (
    <span
      className="inline-flex items-center justify-center min-w-8 text-[11px] font-semibold tabular-nums rounded px-1 py-0.5"
      style={{
        backgroundColor: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`,
        color: `rgb(${cr},${cg},${cb})`,
      }}
    >
      {Math.round(value)}
    </span>
  );
}

export function Search() {
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language) ?? 'en';
  const { data: stations } = useStationReadings();
  const setSelectedPoint = useUIStore((s) => s.setSelectedPoint);

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = 'search-listbox';

  useEffect(() => {
    if (mobileOpen) inputRef.current?.focus();
  }, [mobileOpen]);

  const fuse = useMemo(
    () =>
      new Fuse<LatestMeasurement>(stations ?? [], { keys: FUSE_KEYS, threshold: FUSE_THRESHOLD }),
    [stations],
  );

  const stationResults = useMemo(() => {
    if (query.length < 1) return [];
    return fuse.search(query, { limit: MAX_STATION_RESULTS }).map((r) => r.item);
  }, [fuse, query]);

  const allResults = useMemo(
    () => [
      ...stationResults.map((s) => ({ type: 'station' as const, data: s })),
      ...places.map((p) => ({ type: 'place' as const, data: p })),
    ],
    [stationResults, places],
  );

  // Debounce query for geocoding
  useEffect(() => {
    if (query.length < 2) {
      setDebouncedQuery('');
      return;
    }
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Forward geocode
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setPlaces([]);
      return;
    }
    const controller = new AbortController();
    fetch(buildGeocodeUrl(debouncedQuery, language), { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('geocode failed'))))
      .then((data: { features?: { place_name: string; center: [number, number] }[] }) => {
        setPlaces(
          data.features?.map((f) => ({
            name: f.place_name,
            lng: f.center[0],
            lat: f.center[1],
          })) ?? [],
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setPlaces([]);
      });
    return () => controller.abort();
  }, [debouncedQuery, language]);

  const close = useCallback(() => {
    setQuery('');
    setIsOpen(false);
    setMobileOpen(false);
    setPlaces([]);
  }, []);

  // Click outside
  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [isOpen, close]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  const selectStation = useCallback(
    (m: LatestMeasurement) => {
      setSelectedPoint({
        lngLat: [m.lng, m.lat],
        station: {
          stationId: m.stationId,
          stationName: m.stationName,
          country: m.country,
          pm25: m.value,
          measuredAt: m.measuredAt,
        },
      });
      mapRef.current?.flyTo({ center: [m.lng, m.lat], zoom: 12, duration: 800 });
      close();
    },
    [setSelectedPoint, close],
  );

  const selectPlace = useCallback(
    (p: PlaceResult) => {
      setSelectedPoint(null);
      mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 11, duration: 800 });
      close();
    },
    [setSelectedPoint, close],
  );

  function selectActive() {
    if (activeIndex < 0 || activeIndex >= allResults.length) return;
    const item = allResults[activeIndex];
    if (item.type === 'station') selectStation(item.data);
    else selectPlace(item.data);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (!isOpen || allResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % allResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + allResults.length) % allResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectActive();
    }
  }

  const hasResults = allResults.length > 0;
  const showDropdown = isOpen && query.length >= 1;

  const placeStartIndex = stationResults.length;

  function renderSearchInput() {
    return (
      <div ref={containerRef} className="relative flex-1 max-w-xs">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={showDropdown && hasResults}
            aria-controls={listboxId}
            aria-activedescendant={activeIndex >= 0 ? `search-option-${activeIndex}` : undefined}
            aria-label={t('search.label')}
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (query.length >= 1) setIsOpen(true);
            }}
            onKeyDown={onKeyDown}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md text-base md:text-[13px] text-zinc-200 placeholder-zinc-500 pl-8 pr-8 py-1.5 outline-none focus:border-zinc-500 transition-colors"
          />
          {query && (
            <button
              aria-label={t('header.close')}
              onClick={close}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <CloseIcon size={14} />
            </button>
          )}
        </div>

        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl overflow-hidden z-50">
            <AppScrollArea viewportClassName="max-h-80 overflow-x-hidden rounded-[inherit]">
              <div id={listboxId} role="listbox" className="w-0 min-w-full overflow-hidden">
                {!hasResults && (
                  <p className="px-3 py-2 text-[12px] text-zinc-500">{t('search.noResults')}</p>
                )}

                {stationResults.length > 0 && (
                  <>
                    <p
                      className="px-3 pt-2 pb-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider"
                      role="presentation"
                    >
                      {t('search.stations')}
                    </p>
                    {stationResults.map((s, i) => (
                      <button
                        key={s.stationId}
                        id={`search-option-${i}`}
                        role="option"
                        aria-selected={activeIndex === i}
                        onClick={() => selectStation(s)}
                        onMouseEnter={() => setActiveIndex(i)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] min-w-0 transition-colors ${
                          activeIndex === i ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                        }`}
                      >
                        <Pm25Dot value={s.value} />
                        <span className="flex-1 min-w-0">
                          <span className="text-zinc-200 truncate block">{s.stationName}</span>
                          <span className="text-[11px] text-zinc-500">{s.stationId}</span>
                        </span>
                      </button>
                    ))}
                  </>
                )}

                {places.length > 0 && (
                  <>
                    <p
                      className="px-3 pt-2 pb-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider"
                      role="presentation"
                    >
                      {t('search.places')}
                    </p>
                    {places.map((p, i) => {
                      const idx = placeStartIndex + i;
                      return (
                        <button
                          key={`${p.lng},${p.lat},${i}`}
                          id={`search-option-${idx}`}
                          role="option"
                          aria-selected={activeIndex === idx}
                          onClick={() => selectPlace(p)}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] min-w-0 transition-colors ${
                            activeIndex === idx ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                          }`}
                        >
                          <span className="inline-flex items-center justify-center min-w-8 text-zinc-400">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                          </span>
                          <span className="text-zinc-200 truncate flex-1">{p.name}</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </AppScrollArea>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Desktop: inline in header (unmount when mobile overlay is open to avoid shared refs) */}
      <div className="hidden md:flex flex-1 justify-center">
        {!mobileOpen && renderSearchInput()}
      </div>

      {/* Mobile: toggle button + overlay */}
      {!mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          aria-label={t('search.label')}
          className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors ease-out hover:duration-175"
        >
          <SearchIcon />
        </button>
      )}
      {mobileOpen && (
        <div className="md:hidden absolute inset-x-0 top-0 h-12 bg-zinc-900 flex items-center px-3 gap-2 z-30">
          {renderSearchInput()}
          <button
            onClick={close}
            aria-label={t('header.close')}
            className="inline-flex items-center justify-center w-8 h-8 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}
    </>
  );
}
