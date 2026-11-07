import { useRef, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { FirePoint, PowerPlantFeature } from '@thailand-aq/types';
import type { LatestMeasurement } from '@/hooks';
import { Map, AttributionControl, ExpressionSpecification } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { createOverlay, skipUntilCanvasSized, type OverlayInstance } from '@/utils/deck-overlay';
import { mapRef as globalMapRef } from '@/utils/mapRef';
import { useLayerStore } from '@/store/layerStore';
import { useUIStore } from '@/store/uiStore';
import { useFires, useStationReadings, useCamsGrid, useWind, usePowerPlants } from '@/hooks';
import { useCamsBitmap } from './useCamsBitmap';
import { MapLoadingPlaceholder } from './MapLoadingPlaceholder';
import { MAP_STYLE } from './mapStyle';
import { VIEWPORT_BBOX } from '@/utils/bbox';
import { MIN_ZOOM } from '@/utils/mapView';
import { createFiresLayer, createFireSelectionRing } from './FiresLayer';
import { useWindParticles } from './useWindParticles';
import { createLandMaskLayer, createPM25BitmapLayer, createPM25StationsLayers } from './PM25Layer';
import { createPowerPlantLayers, iconSizeForZoom } from './PowerPlantsLayer';
import { usePrefetchAdjacentDates } from './usePrefetchAdjacentDates';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAX_BOUNDS: mapboxgl.LngLatBoundsLike = [...VIEWPORT_BBOX];
const CUSTOM_ATTRIBUTION = [
  'NASA FIRMS',
  '<a href="https://openaq.org" target="_blank" rel="noreferrer">OpenAQ</a> CC BY 4.0',
  '<a href="https://atmosphere.copernicus.eu" target="_blank" rel="noreferrer">Copernicus CAMS</a> (ECMWF) CC BY 4.0',
  '<a href="https://open-meteo.com" target="_blank" rel="noreferrer">Open-Meteo</a> CC BY 4.0',
];

function detectBeforeId(map: Map): string | undefined {
  const layers = map.getStyle().layers ?? [];
  return layers.find((l) => l.id.startsWith('admin') || l.type === 'symbol')?.id;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const beforeIdRef = useRef<string | undefined>(undefined);
  const [map, setMap] = useState<Map | null>(null);
  // heatmapOverlay: interleaved — renders land-mask + pm25-bitmap inside Mapbox's
  // WebGL pipeline so beforeId can place them below admin boundary layers.
  const [heatmapOverlay, setHeatmapOverlay] = useState<OverlayInstance | null>(null);
  // dataOverlay: non-interleaved — renders power plants, fires and AQI stations (stations are
  // zoom-dependent). One overlay for all three: each overlay is its own canvas and WebGL context.
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

  const { i18n } = useTranslation();
  const language = i18n.language;

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
    const ctrl = new AttributionControl({
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
    const field: ExpressionSpecification =
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

  // Power plants (rebuilt when zoom crosses tier thresholds: icon size is zoom-dependent). Built
  // outside the data-overlay effect below, like the fires layer, so a zoom change reuses them. Only
  // the position of a selected plant is a dependency, so selecting a fire or a station, or nothing,
  // leaves the layer alone.
  const selectedPlantLng = selectedPoint?.powerPlant ? selectedPoint.lngLat[0] : null;
  const selectedPlantLat = selectedPoint?.powerPlant ? selectedPoint.lngLat[1] : null;
  const powerPlantLayers = useMemo(() => {
    const onPowerPlantClick = (info: PickingInfo) => {
      if (!info.object) return;
      const feat = info.object as PowerPlantFeature;
      const p = feat.properties;
      deckPickedRef.current = true;
      setSelectedPoint({
        lngLat: [feat.geometry.coordinates[0], feat.geometry.coordinates[1]],
        powerPlant: {
          id: p.id,
          name: p.name,
          fuelType: p.fuel_type,
          capacityMw: p.capacity_mw,
          owner: p.owner,
          commissionedYear: p.commissioned_year,
          country: p.country,
        },
      });
    };

    return createPowerPlantLayers({
      plants: powerPlants,
      visible: powerPlantsConfig.visible,
      opacity: powerPlantsConfig.opacity,
      iconSize: powerPlantIconSize,
      selectedLngLat:
        selectedPlantLng !== null && selectedPlantLat !== null
          ? [selectedPlantLng, selectedPlantLat]
          : null,
      onClick: onPowerPlantClick,
    });
  }, [
    powerPlants,
    powerPlantsConfig.visible,
    powerPlantsConfig.opacity,
    powerPlantIconSize,
    selectedPlantLng,
    selectedPlantLat,
    setSelectedPoint,
  ]);

  // Fire sizes follow zoom in the shader, so the fires layer is built outside the zoom- and
  // selection-dependent effect below and only rebuilt when its own inputs change.
  const firesLayer = useMemo(() => {
    if (!firesConfig.visible || !fires) return null;
    const onFireClick = (info: PickingInfo) => {
      if (!info.object) return;
      const d = info.object as FirePoint;
      deckPickedRef.current = true;
      setSelectedPoint({
        lngLat: [d.lng, d.lat],
        fire: {
          id: d.id,
          frp: d.frp,
          confidence: d.confidence,
          detectedAt: d.detectedAt,
        },
      });
    };
    return createFiresLayer(fires, firesConfig.opacity, onFireClick);
  }, [fires, firesConfig.visible, firesConfig.opacity, setSelectedPoint]);

  // Power plants, fires and stations, drawn in that order. Stations are zoom-dependent
  // (clustering), so this reruns on zoomend.
  useEffect(() => {
    if (!dataOverlay) return;
    const layers = [];

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
          provider: d.provider,
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

    layers.push(...powerPlantLayers);
    if (firesLayer) layers.push(firesLayer);

    if (aqStationsConfig.visible && aqi) {
      layers.push(
        ...createPM25StationsLayers(
          aqi,
          zoom,
          onStationClick,
          onClusterClick,
          selectedPoint?.station?.stationId ?? null,
        ),
      );
    }

    const selectionParams = { depthCompare: 'always' as const, depthWriteEnabled: false };

    if (firesConfig.visible && selectedPoint?.fire) {
      layers.push(createFireSelectionRing(selectedPoint.lngLat));
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
    powerPlantLayers,
    firesLayer,
    firesConfig.visible,
    aqi,
    aqStationsConfig.visible,
    zoom,
    selectedPoint,
    setSelectedPoint,
  ]);

  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;

    // The store has the view the page URL asked for (applied when it was created).
    const { mapCenter: initialCenter, mapZoom: initialZoom } = useUIStore.getState();
    const mapInstance = new Map({
      container: containerRef.current,
      style: MAP_STYLE,
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
      // Wind → power plants/fires/stations; heatmap is interleaved so order doesn't matter.
      const windOv = new MapboxOverlay({ layers: [], layerFilter: skipUntilCanvasSized });
      mapInstance.addControl(windOv);
      const dataOv = new MapboxOverlay({ layers: [], layerFilter: skipUntilCanvasSized });
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
          picked = !!dataOv.pickObject({ x: e.point.x, y: e.point.y });
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

      // disable map rotation using right click + drag
      mapInstance.dragRotate.disable();

      // disable map rotation using touch rotation gesture
      mapInstance.touchZoomRotate.disableRotation();

      // The store follows the map in case Mapbox moved the start view (e.g. into maxBounds), so
      // the address bar says what the map shows.
      const { lng, lat } = mapInstance.getCenter();
      setMapCenter([lng, lat]);
      setMapZoom(mapInstance.getZoom());
      setWindOverlay(windOv);
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
      setDataOverlay(null);
      mapInstance.remove();
    };
  }, [setSelectedPoint, setMapZoom, setMapCenter]);

  // The placeholder is a sibling of the Mapbox container, which Mapbox fills with its own nodes.
  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {!map && (
        <div className="absolute inset-0">
          <MapLoadingPlaceholder />
        </div>
      )}
    </div>
  );
}
