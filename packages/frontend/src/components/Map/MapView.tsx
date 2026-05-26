import { useRef, useEffect, useState } from 'react';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer } from 'deck.gl';
import type { Layer, PickingInfo } from 'deck.gl';
import type { FirePoint, PowerPlantFeature } from '@thailand-aq/types';
import type { LatestMeasurement } from '../../hooks/useStationReadings';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { createOverlay, type OverlayInstance } from '../../utils/deck-overlay';
import { mapRef as globalMapRef } from '../../utils/mapRef';
import { useLayerStore } from '../../store/layerStore';
import { useUIStore } from '../../store/uiStore';
import { useFires } from '../../hooks/useFires';
import { useStationReadings } from '../../hooks/useStationReadings';
import { useCamsGrid } from '../../hooks/useCamsGrid';
import { useCamsBitmap } from '../../hooks/useCamsBitmap';
import { VIEWPORT_BBOX } from '../../utils/bbox';
import { createFiresLayer, baseRadiusForZoom } from '../../layers/FiresLayer';
import { useWind } from '../../hooks/useWind';
import { useWindParticles } from '../../hooks/useWindParticles';
import {
  createLandMaskLayer,
  createPM25BitmapLayer,
  createPM25StationsLayers,
} from '../../layers/PM25Layer';
import { usePowerPlants } from '../../hooks/usePowerPlants';
import { createPowerPlantsLayer, iconSizeForZoom } from '../../layers/PowerPlantsLayer';
import { usePrefetchAdjacentDates } from '../../hooks/usePrefetchAdjacentDates';
import { useSettingsStore } from '../../store/settingsStore';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const CENTER: [number, number] = [101.0, 15.5];
const ZOOM = 5.5;
const CENTER_MOBILE: [number, number] = [102.0, 13.5];
const ZOOM_MOBILE = 4.7;
const MIN_ZOOM = 4.0;
const MAX_BOUNDS: mapboxgl.LngLatBoundsLike = [...VIEWPORT_BBOX];
const CUSTOM_ATTRIBUTION = [
  'NASA FIRMS',
  '<a href="https://openaq.org" target="_blank" rel="noreferrer">OpenAQ</a> CC BY 4.0',
  '<a href="https://open-meteo.com" target="_blank" rel="noreferrer">Open-Meteo</a> CC BY 4.0',
];

function parseUrlMapState() {
  const p = new URLSearchParams(window.location.search);
  const lat = parseFloat(p.get('lat') ?? '');
  const lng = parseFloat(p.get('lng') ?? '');
  const zoom = parseFloat(p.get('zoom') ?? '');
  const validLat = isFinite(lat) && lat >= -90 && lat <= 90;
  const validLng = isFinite(lng) && lng >= -180 && lng <= 180;
  const validZoom = isFinite(zoom) && zoom >= 0 && zoom <= 24;
  const isMobile = window.innerWidth < 768;
  return {
    center:
      validLat && validLng ? ([lng, lat] as [number, number]) : isMobile ? CENTER_MOBILE : CENTER,
    zoom: validZoom ? Math.max(MIN_ZOOM, zoom) : isMobile ? ZOOM_MOBILE : ZOOM,
  };
}

function detectBeforeId(map: mapboxgl.Map): string | undefined {
  const layers = map.getStyle().layers ?? [];
  return layers.find((l) => l.id.startsWith('admin') || l.type === 'symbol')?.id;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const beforeIdRef = useRef<string | undefined>(undefined);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  // heatmapOverlay: interleaved — renders land-mask + pm25-bitmap inside Mapbox's
  // WebGL pipeline so beforeId can place them below admin boundary layers.
  const [heatmapOverlay, setHeatmapOverlay] = useState<OverlayInstance | null>(null);
  // powerPlantsOverlay: static layer, isolated so zoom changes don't trigger its rebuild.
  const [powerPlantsOverlay, setPowerPlantsOverlay] = useState<MapboxOverlay | null>(null);
  // dataOverlay: non-interleaved — renders fires and AQI stations (both zoom-dependent).
  // Kept out of the interleaved pipeline so deck.gl never leaves dirty WebGL blend state
  // that would corrupt Mapbox's MSAA resolve of admin borders.
  const [dataOverlay, setDataOverlay] = useState<MapboxOverlay | null>(null);
  const [windOverlay, setWindOverlay] = useState<MapboxOverlay | null>(null);
  const [compactAttribution, setCompactAttribution] = useState(false);

  const { data: fires } = useFires();
  const { data: aqi } = useStationReadings();
  const { data: aqGrid } = useCamsGrid();
  const pm25Bitmap = useCamsBitmap(aqGrid);
  const { data: wind } = useWind();

  const aqGridConfig = useLayerStore((s) => s.layers.aqGrid);
  const aqStationsConfig = useLayerStore((s) => s.layers.aqStations);
  const firesConfig = useLayerStore((s) => s.layers.fires);
  const windConfig = useLayerStore((s) => s.layers.wind);
  const powerPlantsConfig = useLayerStore((s) => s.layers.powerPlants);

  const deckPickedRef = useRef(false);

  const setSelectedPoint = useUIStore((s) => s.setSelectedPoint);
  const selectedPoint = useUIStore((s) => s.selectedPoint);
  const zoom = useUIStore((s) => s.mapZoom);
  const setMapZoom = useUIStore((s) => s.setMapZoom);
  const setMapCenter = useUIStore((s) => s.setMapCenter);

  const language = useSettingsStore((s) => s.language) ?? 'en';

  const powerPlantsEnabled = powerPlantsConfig.visible || !!selectedPoint?.station;
  const { data: powerPlants } = usePowerPlants(powerPlantsEnabled);
  const powerPlantIconSize = iconSizeForZoom(zoom);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setCompactAttribution(entry.contentRect.width <= 800);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!map) return;
    const ctrl = new mapboxgl.AttributionControl({
      compact: compactAttribution,
      customAttribution: CUSTOM_ATTRIBUTION,
    });
    map.addControl(ctrl);
    return () => {
      map.removeControl(ctrl);
    };
  }, [map, compactAttribution]);

  useWindParticles(windOverlay, map, wind, windConfig, aqGrid);
  usePrefetchAdjacentDates();

  // Switch Mapbox place-label language when the user changes language.
  useEffect(() => {
    if (!map) return;
    const field: mapboxgl.ExpressionSpecification =
      language === 'th'
        ? ['coalesce', ['get', 'name_th'], ['get', 'name']]
        : ['coalesce', ['get', 'name_en'], ['get', 'name']];
    map.getStyle().layers?.forEach((layer) => {
      if (layer.type !== 'symbol') return;
      try {
        map.setLayoutProperty(layer.id, 'text-field', field);
      } catch {
        // layer has no text-field — skip silently
      }
    });
  }, [map, language]);

  // Heatmap layers — interleaved overlay only; beforeId keeps them below admin borders.
  useEffect(() => {
    if (!heatmapOverlay) return;
    const beforeId = beforeIdRef.current;
    const layers = [];

    if (aqGridConfig.visible && pm25Bitmap) {
      layers.push(createLandMaskLayer(beforeId));
      layers.push(createPM25BitmapLayer(pm25Bitmap, beforeId));
    }

    heatmapOverlay.setProps({ layers });
  }, [heatmapOverlay, pm25Bitmap, aqGridConfig.visible]);

  // Power plants — rebuilt when zoom crosses tier thresholds (icon size is zoom-dependent).
  useEffect(() => {
    if (!powerPlantsOverlay) return;

    const onPowerPlantClick = (info: PickingInfo) => {
      if (!info.object) return;
      const feat = info.object as PowerPlantFeature;
      const p = feat.properties;
      deckPickedRef.current = true;
      setSelectedPoint({
        lngLat: [feat.geometry.coordinates[0], feat.geometry.coordinates[1]],
        powerPlant: {
          name: p.name,
          fuelType: p.fuel_type,
          capacityMw: p.capacity_mw,
          owner: p.owner,
          commissionedYear: p.commissioned_year,
          country: p.country,
        },
      });
    };

    const layers: Layer[] = [];

    if (powerPlantsConfig.visible && powerPlants) {
      layers.push(
        createPowerPlantsLayer(
          powerPlants,
          powerPlantsConfig.opacity,
          powerPlantIconSize,
          onPowerPlantClick,
        ),
      );
    }

    if (powerPlantsConfig.visible && selectedPoint?.powerPlant) {
      const [lng, lat] = selectedPoint.lngLat;
      layers.push(
        new ScatterplotLayer({
          id: 'powerplant-selection-ring',
          data: [{ lng, lat }],
          getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat],
          getRadius: Math.round(powerPlantIconSize / 2) + 6,
          radiusUnits: 'pixels',
          stroked: true,
          filled: false,
          getLineColor: [255, 255, 255, 220] as [number, number, number, number],
          lineWidthUnits: 'pixels',
          getLineWidth: 2,
          parameters: { depthCompare: 'always' as const, depthWriteEnabled: false },
        }),
      );
    }

    powerPlantsOverlay.setProps({ layers });
  }, [
    powerPlantsOverlay,
    powerPlants,
    powerPlantsConfig.visible,
    powerPlantsConfig.opacity,
    powerPlantIconSize,
    selectedPoint,
    setSelectedPoint,
  ]);

  // Fires + stations — zoom-dependent, rebuilt when zoom crosses layer thresholds.
  useEffect(() => {
    if (!dataOverlay) return;
    const layers = [];

    const onFireClick = (info: PickingInfo) => {
      if (!info.object) return;
      const d = info.object as FirePoint;
      deckPickedRef.current = true;
      setSelectedPoint({
        lngLat: [d.lng, d.lat],
        fire: {
          frp: d.frp,
          confidence: d.confidence,
          detectedAt: d.detectedAt,
          daynight: d.daynight,
        },
      });
    };

    const onStationClick = (info: PickingInfo) => {
      if (!info.object) return;
      const d = (info.object as { properties: LatestMeasurement }).properties;
      deckPickedRef.current = true;
      setSelectedPoint({
        lngLat: [d.lng, d.lat],
        station: {
          stationId: d.stationId,
          stationName: d.stationName,
          country: d.country,
          pm25: d.value,
          measuredAt: d.measuredAt,
        },
      });
    };

    const onClusterClick = (
      _clusterId: number,
      lngLat: [number, number],
      expansionZoom: number,
    ) => {
      deckPickedRef.current = true;
      mapRef.current?.flyTo({ center: lngLat, zoom: expansionZoom, duration: 500 });
    };

    if (firesConfig.visible && fires) {
      layers.push(...createFiresLayer(fires, firesConfig.opacity, zoom, onFireClick));
    }

    if (aqStationsConfig.visible && aqi) {
      layers.push(...createPM25StationsLayers(aqi, zoom, onStationClick, onClusterClick));
    }

    const selectionParams = { depthCompare: 'always' as const, depthWriteEnabled: false };

    if (firesConfig.visible && selectedPoint?.fire) {
      const [lng, lat] = selectedPoint.lngLat;
      layers.push(
        new ScatterplotLayer({
          id: 'fire-selection-ring',
          data: [{ lng, lat }],
          getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat],
          getRadius: Math.max(16, baseRadiusForZoom(zoom) * 5),
          radiusUnits: 'pixels',
          stroked: true,
          filled: false,
          getLineColor: [255, 255, 255, 210] as [number, number, number, number],
          lineWidthUnits: 'pixels',
          getLineWidth: 2,
          parameters: selectionParams,
        }),
      );
    }

    if (aqStationsConfig.visible && selectedPoint?.station) {
      const [lng, lat] = selectedPoint.lngLat;
      layers.push(
        new ScatterplotLayer({
          id: 'station-selection-ring',
          data: [{ lng, lat }],
          getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat],
          getRadius: 22,
          radiusUnits: 'pixels',
          stroked: true,
          filled: false,
          getLineColor: [255, 255, 255, 220] as [number, number, number, number],
          lineWidthUnits: 'pixels',
          getLineWidth: 2.5,
          parameters: selectionParams,
        }),
      );
    }

    dataOverlay.setProps({ layers });
  }, [
    dataOverlay,
    fires,
    firesConfig.visible,
    firesConfig.opacity,
    aqi,
    aqStationsConfig.visible,
    zoom,
    selectedPoint,
    setSelectedPoint,
  ]);

  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;

    const { center: initialCenter, zoom: initialZoom } = parseUrlMapState();
    const mapInstance = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/joostkiens/cm30pk39v00ah01qz4n2i1ssu',
      center: initialCenter,
      zoom: initialZoom,
      minZoom: MIN_ZOOM,
      maxBounds: MAX_BOUNDS,
      accessToken: TOKEN,
      projection: 'mercator',
      attributionControl: false,
    });

    mapInstance.on('load', () => {
      if (!mounted) return;
      beforeIdRef.current = detectBeforeId(mapInstance);

      // Non-interleaved canvases stack in addControl order (first = bottom).
      // Wind → power plants → fires/stations; heatmap is interleaved so order doesn't matter.
      const windOv = new MapboxOverlay({ layers: [] });
      mapInstance.addControl(windOv);
      const powerPlantsOv = new MapboxOverlay({ layers: [] });
      mapInstance.addControl(powerPlantsOv);
      const dataOv = new MapboxOverlay({ layers: [] });
      mapInstance.addControl(dataOv);
      const heatmapOv = createOverlay({ layers: [] });
      mapInstance.addControl(heatmapOv);

      // The deck.gl overlay *container* has pointer-events:none, but the canvas element
      // inside it inherits pointer-events:auto by default (pointer-events is not inherited
      // in CSS). That canvas sits on top of the Mapbox canvas and absorbs native mouse
      // events, so map.on('mousemove') never fires. Explicitly set pointer-events:none on
      // the deck.gl canvas so native events fall through to the Mapbox canvas, making
      // Mapbox's own event system (and our mousemove handler) work as intended.
      // deck.gl's _updateCursor() runs every animation frame and sets style.cursor = 'grab'
      // on its canvas via JavaScript. Any style.cursor assignment we make gets immediately
      // overridden. CSS !important in an author stylesheet outranks all JavaScript inline
      // style assignments (important author > normal inline per the CSS cascade), so we
      // inject one rule and toggle a class rather than fighting over style.cursor.
      const cursorOverride = document.createElement('style');
      cursorOverride.setAttribute('data-deck-cursor', '');
      cursorOverride.textContent =
        '.mapboxgl-map.deck-hovering .mapboxgl-canvas { cursor: pointer !important; }';
      document.head.appendChild(cursorOverride);

      const mapContainer = mapInstance.getContainer();
      mapInstance.on('mousemove', (e) => {
        let picked = false;
        try {
          picked =
            !!dataOv.pickObject({ x: e.point.x, y: e.point.y }) ||
            !!powerPlantsOv.pickObject({ x: e.point.x, y: e.point.y });
        } catch {
          // overlay not yet initialised
        }
        mapContainer.classList.toggle('deck-hovering', picked);
      });
      mapInstance.on('mouseout', () => {
        mapContainer.classList.remove('deck-hovering');
      });
      mapInstance.on('dragstart', () => {
        mapContainer.classList.remove('deck-hovering');
      });

      setMapZoom(mapInstance.getZoom());
      setWindOverlay(windOv);
      setPowerPlantsOverlay(powerPlantsOv);
      setDataOverlay(dataOv);
      setHeatmapOverlay(heatmapOv);
      setMap(mapInstance);
    });

    mapInstance.on('zoomend', () => {
      if (mounted) setMapZoom(mapInstance.getZoom());
    });

    mapInstance.on('moveend', () => {
      if (!mounted) return;
      const { lng, lat } = mapInstance.getCenter();
      setMapCenter([lng, lat]);
    });

    mapInstance.on('click', () => {
      if (!mounted) return;
      if (deckPickedRef.current) {
        deckPickedRef.current = false;
        return;
      }
      setSelectedPoint(null);
    });

    mapRef.current = mapInstance;
    globalMapRef.current = mapInstance;

    return () => {
      mounted = false;
      globalMapRef.current = null;
      document.head.querySelector('style[data-deck-cursor]')?.remove();
      setMap(null);
      setHeatmapOverlay(null);
      setPowerPlantsOverlay(null);
      setDataOverlay(null);
      mapInstance.remove();
    };
  }, [setSelectedPoint, setMapZoom, setMapCenter]);

  return <div ref={containerRef} className="w-full h-full" />;
}
