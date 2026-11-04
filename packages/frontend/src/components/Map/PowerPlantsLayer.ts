import { IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer, PickingInfo } from '@deck.gl/core';
import type { PowerPlantCollection, PowerPlantFeature } from '@thailand-aq/types';
import { FUEL_COLORS } from '@/utils/powerPlantColors';

const FUELS = ['Coal', 'Gas', 'Oil', 'Diesel'];

function buildAtlas(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  FUELS.forEach((fuel, i) => {
    const cx = i * 32 + 16;
    const cy = 16;
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fillStyle = FUEL_COLORS[fuel] + '66'; // 40% opacity (0x66 = 102 = 40% of 255)
    ctx.fill();
    ctx.strokeStyle = FUEL_COLORS[fuel]!;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  return canvas.toDataURL();
}

const ATLAS = buildAtlas();

const ICON_MAPPING = {
  Coal: { x: 0, y: 0, width: 32, height: 32, anchorY: 16 },
  Gas: { x: 32, y: 0, width: 32, height: 32, anchorY: 16 },
  Oil: { x: 64, y: 0, width: 32, height: 32, anchorY: 16 },
  Diesel: { x: 96, y: 0, width: 32, height: 32, anchorY: 16 },
};

export function iconSizeForZoom(zoom: number): number {
  if (zoom >= 12) return 32;
  if (zoom >= 8) return 26;
  if (zoom >= 4) return 22;
  return 18;
}

export function createPowerPlantsLayer(
  data: PowerPlantCollection,
  opacity: number,
  iconSize: number,
  onClick: (info: PickingInfo) => void,
): Layer {
  return new IconLayer<PowerPlantFeature>({
    id: 'power-plants',
    data: data.features,
    iconAtlas: ATLAS,
    iconMapping: ICON_MAPPING,
    getPosition: (d) => d.geometry.coordinates,
    getIcon: (d) => d.properties.fuel_type,
    getSize: iconSize,
    opacity,
    pickable: true,
    onClick,
    parameters: { depthCompare: 'always' as const, depthWriteEnabled: false },
  });
}

interface PowerPlantLayersInput {
  plants: PowerPlantCollection | undefined;
  visible: boolean;
  opacity: number;
  iconSize: number;
  /** Where the selected power plant is, if one is selected: it gets a ring */
  selectedLngLat: [number, number] | null;
  onClick: (info: PickingInfo) => void;
}

// The layers for the data overlay, in draw order: the plants, then the ring of the selected plant.
export function createPowerPlantLayers({
  plants,
  visible,
  opacity,
  iconSize,
  selectedLngLat,
  onClick,
}: PowerPlantLayersInput): Layer[] {
  if (!visible) return [];
  const layers: Layer[] = [];

  if (plants) layers.push(createPowerPlantsLayer(plants, opacity, iconSize, onClick));

  if (selectedLngLat) {
    const [lng, lat] = selectedLngLat;
    layers.push(
      new ScatterplotLayer({
        id: 'powerplant-selection-ring',
        data: [{ lng, lat }],
        getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat],
        getRadius: Math.round(iconSize / 2) + 6,
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

  return layers;
}
