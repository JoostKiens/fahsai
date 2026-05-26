import { BitmapLayer, SolidPolygonLayer, ScatterplotLayer, TextLayer, IconLayer } from 'deck.gl';
import type { Layer, PickingInfo, Position, SolidPolygonLayerProps } from 'deck.gl';
import { MaskExtension } from '@deck.gl/extensions';
import Supercluster from 'supercluster';
import type { LatestMeasurement } from '../hooks/useStationReadings';
import seaCountries from '../data/sea-land-mask.json';
import {
  pm25ToRgba,
  pm25ToRgb,
  contrastColor,
  AQI_CATEGORIES,
  pm25ToCategory,
} from '../utils/aqiColors';

export { AQI_CATEGORIES };

type Ring = number[][];
type CountryFeature = {
  geometry: { type: string; coordinates: Ring[] | Ring[][] };
};

// Flatten Polygon and MultiPolygon features into individual outer rings.
// SolidPolygonLayer needs one ring per data item.
function extractRings(features: CountryFeature[]): Ring[] {
  const rings: Ring[] = [];
  for (const f of features) {
    if (f.geometry.type === 'Polygon') {
      rings.push((f.geometry.coordinates as Ring[])[0]);
    } else {
      // MultiPolygon: coordinates is Ring[][]
      for (const polygon of f.geometry.coordinates as Ring[][]) {
        rings.push(polygon[0]);
      }
    }
  }
  return rings;
}

// Pre-extract rings once at module load time.
const LAND_RINGS = extractRings((seaCountries as { features: CountryFeature[] }).features);

// SolidPolygonLayer with operation:'mask' — renders land areas into the mask buffer.
// Used by createPM25BitmapLayer to clip the heatmap to land. Must appear in the
// layers array before the masked layer.
export function createLandMaskLayer(beforeId?: string) {
  const props: SolidPolygonLayerProps<Ring> = {
    id: 'land-mask',
    data: LAND_RINGS,
    getPolygon: (ring) => ring as unknown as Position[],
    filled: true,
    operation: 'mask',
    parameters: { depthCompare: 'always' as const, depthWriteEnabled: false },
    ...({ beforeId } as object),
  };
  return new SolidPolygonLayer<Ring>(props);
}

// Grid geometry — must match backend openmeteo.ts AQ grid constants.
const AQ_STEP = 0.4;
const AQ_LNG_MIN = 89.0;
const AQ_LAT_MIN = 1.0;
const AQ_LNG_COUNT = 63; // (114 - 89) / 0.4 + 1
const AQ_LAT_COUNT = 73; // ( 30 -  1) / 0.4 + 1
const AQ_LNG_MAX = AQ_LNG_MIN + (AQ_LNG_COUNT - 1) * AQ_STEP; // 113.8
const AQ_LAT_MAX = AQ_LAT_MIN + (AQ_LAT_COUNT - 1) * AQ_STEP; //  29.8

// BitmapLayer geographic bounds: outer edges of the outermost cells.
const BITMAP_BOUNDS: [number, number, number, number] = [
  AQ_LNG_MIN - AQ_STEP / 2, // 88.8 west
  AQ_LAT_MIN - AQ_STEP / 2, //  0.8 south
  AQ_LNG_MAX + AQ_STEP / 2, // 114.0 east
  AQ_LAT_MAX + AQ_STEP / 2, //  30.0 north
];

const STATION_ALPHA = 255;

// BitmapLayer — receives a pre-painted ImageBitmap from the pm25Canvas web worker.
// MaskExtension clips to land (land-mask layer must appear before this in the stack).
export function createPM25BitmapLayer(bitmap: ImageBitmap, beforeId?: string) {
  const maskExt = new MaskExtension();
  return new BitmapLayer({
    id: 'pm25-bitmap',
    image: bitmap,
    bounds: BITMAP_BOUNDS,
    parameters: { depthCompare: 'always' as const, depthWriteEnabled: false },
    ...({ extensions: [maskExt], maskId: 'land-mask', beforeId } as object),
  });
}

// --- Station clustering ---

const CLUSTER_RADIUS = 60;
export const CLUSTER_MAX_ZOOM = 20;

const SINGLE_RADIUS_PX = 15; // diameter 30px
const ICON_SIZE = 80; // atlas canvas px per cell; rendered at CLUSTER_RENDER_PX css px by IconLayer
const CLUSTER_RENDER_PX = 48; // css px

// Minimal structural type for Supercluster output — discriminated on `cluster`.
interface StationClusterFeature {
  geometry: { coordinates: number[] };
  properties: { cluster: true; cluster_id: number; point_count: number; sumPm25: number };
}
interface StationPointFeature {
  geometry: { coordinates: number[] };
  properties: LatestMeasurement & { cluster?: false };
}
type AnyStationFeature = StationClusterFeature | StationPointFeature;

function pm25OfFeature(d: AnyStationFeature): number {
  return d.properties.cluster
    ? d.properties.sumPm25 / d.properties.point_count
    : d.properties.value;
}

// Module-level Supercluster cache — index is rebuilt only when the data reference changes,
// not on every zoom change. getClusters() on an existing index is fast.
let _scIndex: Supercluster<LatestMeasurement, { sumPm25: number }> | null = null;
let _scData: LatestMeasurement[] | null = null;

function getStationIndex(data: LatestMeasurement[]) {
  if (data === _scData && _scIndex !== null) return _scIndex;
  _scData = data;
  _scIndex = new Supercluster<LatestMeasurement, { sumPm25: number }>({
    radius: CLUSTER_RADIUS,
    maxZoom: CLUSTER_MAX_ZOOM,
    map: (props) => ({ sumPm25: props.value }),
    reduce: (acc, props) => {
      acc.sumPm25 += props.sumPm25;
    },
  });
  _scIndex.load(
    data.map((d) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [d.lng, d.lat] },
      properties: d,
    })),
  );
  return _scIndex;
}

// Cluster icon atlas — 6 AQI-colored pentagons with rounded corners, one per AQI_CATEGORIES entry.
// Created once at module level; reused across all renders.
type IconMapping = Record<
  string,
  { x: number; y: number; width: number; height: number; anchorX: number; anchorY: number }
>;
let _clusterAtlas: string | null = null;
let _clusterMapping: IconMapping | null = null;

function roundedPolygon(
  ctx: CanvasRenderingContext2D,
  vertices: [number, number][],
  cornerRadius: number,
): void {
  const n = vertices.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const curr = vertices[i];
    const prev = vertices[(i - 1 + n) % n];
    const next = vertices[(i + 1) % n];

    const dx1 = prev[0] - curr[0];
    const dy1 = prev[1] - curr[1];
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const dx2 = next[0] - curr[0];
    const dy2 = next[1] - curr[1];
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    const cr = Math.min(cornerRadius, len1 / 2, len2 / 2);
    const ex = curr[0] + (dx1 / len1) * cr;
    const ey = curr[1] + (dy1 / len1) * cr;
    const fx = curr[0] + (dx2 / len2) * cr;
    const fy = curr[1] + (dy2 / len2) * cr;

    if (i === 0) ctx.moveTo(ex, ey);
    else ctx.lineTo(ex, ey);
    ctx.arcTo(curr[0], curr[1], fx, fy, cr);
  }
  ctx.closePath();
}

function getClusterIconAtlas(): { atlas: string; mapping: IconMapping } {
  if (_clusterAtlas && _clusterMapping) return { atlas: _clusterAtlas, mapping: _clusterMapping };

  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE * AQI_CATEGORIES.length;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d')!;
  const mapping: IconMapping = {};

  // Pentagon fits inside canvas cell with enough margin for the stroke overhang.
  // stroke before fill: stroke is drawn first (half outside path), fill covers the inner half,
  // leaving a clean border ring outside the fill.
  const pentRadius = 32; // vertices at 32px from cell centre
  const cornerRadius = 6;
  const strokeWidth = 4; // visible border width; stroke straddles the path edge

  AQI_CATEGORIES.forEach((cat, i) => {
    const cx = i * ICON_SIZE + ICON_SIZE / 2;
    const cy = ICON_SIZE / 2;

    // Flat-top hexagon (H3 style): first vertex at 0° = right side
    const vertices: [number, number][] = Array.from({ length: 6 }, (_, k) => {
      const angle = (2 * Math.PI * k) / 6;
      return [cx + pentRadius * Math.cos(angle), cy + pentRadius * Math.sin(angle)];
    });

    // 1. Stroke first so fill covers the inner half, leaving outer half as visible border.
    // Use same contrast color as text (black on light fills, white on dark fills).
    roundedPolygon(ctx, vertices, cornerRadius);
    const [tr, tg, tb] = contrastColor(cat.rgb);
    ctx.strokeStyle = `rgba(${tr},${tg},${tb},0.8)`;
    ctx.lineWidth = strokeWidth * 2; // doubled; fill will cover the inner half
    ctx.stroke();

    // 2. Fill on top
    roundedPolygon(ctx, vertices, cornerRadius);
    const [r, g, b] = cat.rgb;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();

    mapping[`cat-${i}`] = {
      x: i * ICON_SIZE,
      y: 0,
      width: ICON_SIZE,
      height: ICON_SIZE,
      anchorX: ICON_SIZE / 2,
      anchorY: ICON_SIZE / 2,
    };
  });

  _clusterAtlas = canvas.toDataURL();
  _clusterMapping = mapping;
  return { atlas: _clusterAtlas, mapping: _clusterMapping };
}

// IconLayer + ScatterplotLayer + TextLayer stack — OpenAQ ground stations with Supercluster grouping.
// Clusters: diamond shape (IconLayer) with two-line label (mean value + ×count).
// Singles: circle (ScatterplotLayer) with single-line AQI value.
export function createPM25StationsLayers(
  data: LatestMeasurement[],
  zoom: number,
  onStationClick: (info: PickingInfo) => void,
  onClusterClick: (
    clusterId: number,
    lngLat: [number, number],
    expansionZoom: number,
    leaves: LatestMeasurement[],
  ) => void,
): Layer[] {
  const sc = getStationIndex(data);

  const clusters = sc.getClusters([-180, -90, 180, 90], Math.floor(zoom)) as AnyStationFeature[];
  const clusterFeatures = clusters.filter(
    (d): d is StationClusterFeature => !!d.properties.cluster,
  );
  const singleFeatures = clusters.filter((d): d is StationPointFeature => !d.properties.cluster);

  const getPosition = (d: AnyStationFeature) => d.geometry.coordinates as [number, number];
  const layerParams = { depthCompare: 'always' as const, depthWriteEnabled: false };

  // 1. Cluster pentagons — IconLayer with pre-drawn AQI-colored icons, border baked in
  const { atlas, mapping } = getClusterIconAtlas();
  const clusterDiamonds = new IconLayer<StationClusterFeature>({
    id: 'pm25-cluster-diamonds',
    data: clusterFeatures,
    getPosition: (d) => d.geometry.coordinates as [number, number],
    iconAtlas: atlas,
    iconMapping: mapping,
    getIcon: (d) => {
      const mean = d.properties.sumPm25 / d.properties.point_count;
      return `cat-${AQI_CATEGORIES.indexOf(pm25ToCategory(mean))}`;
    },
    getSize: CLUSTER_RENDER_PX,
    sizeUnits: 'pixels',
    pickable: true,
    onClick: (info) => {
      if (!info.object) return;
      const feat = info.object as StationClusterFeature;
      const id = feat.properties.cluster_id;
      const expansionZoom = sc.getClusterExpansionZoom(id);
      const leaves = sc.getLeaves(id, Infinity).map((f) => f.properties);
      onClusterClick(id, info.coordinate as [number, number], expansionZoom, leaves);
    },
    parameters: layerParams,
  });

  // 2. Single station circles — ScatterplotLayer
  const singleScatterplot = new ScatterplotLayer<StationPointFeature>({
    id: 'pm25-stations',
    data: singleFeatures,
    getPosition: (d) => d.geometry.coordinates as [number, number],
    getFillColor: (d) => pm25ToRgba(d.properties.value, STATION_ALPHA),
    getLineColor: (d) => contrastColor(pm25ToRgb(d.properties.value)),
    getRadius: SINGLE_RADIUS_PX,
    radiusUnits: 'pixels',
    lineWidthUnits: 'pixels',
    getLineWidth: 2,
    stroked: true,
    pickable: true,
    onClick: (info) => {
      if (info.object) onStationClick(info);
    },
    parameters: layerParams,
  });

  // 3. Value label — shifted up for clusters to make room for count line.
  // Two-line block: value (12px) + count (10px), centres at -6 and +6 from anchor.
  const valueText = new TextLayer<AnyStationFeature>({
    id: 'pm25-stations-labels',
    data: clusters,
    getPosition,
    getText: (d) =>
      d.properties.cluster
        ? String(Math.round(d.properties.sumPm25 / d.properties.point_count))
        : String(Math.round(d.properties.value)),
    getColor: (d) => contrastColor(pm25ToRgb(pm25OfFeature(d))),
    getPixelOffset: (d) => (d.properties.cluster ? [0, -6] : [0, 1]),
    getSize: 12,
    fontWeight: 'bold',
    fontFamily: 'sans-serif',
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    parameters: layerParams,
  });

  // 4. Count label — clusters only, below value label
  const countText = new TextLayer<StationClusterFeature>({
    id: 'pm25-cluster-count',
    data: clusterFeatures,
    getPosition: (d) => d.geometry.coordinates as [number, number],
    getText: (d) => `x${d.properties.point_count}`,
    getColor: (d) => {
      const mean = d.properties.sumPm25 / d.properties.point_count;
      const [r, g, b] = contrastColor(pm25ToRgb(mean));
      return [r, g, b, 200] as [number, number, number, number];
    },
    getPixelOffset: [0, 6],
    getSize: 10,
    fontWeight: 'bold',
    fontFamily: 'sans-serif',
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    parameters: layerParams,
  });

  return [clusterDiamonds, singleScatterplot, valueText, countText];
}
