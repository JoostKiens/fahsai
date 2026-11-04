import { beforeAll, describe, it, expect, vi } from 'vitest';
import type { PowerPlantCollection } from '@thailand-aq/types';

// PowerPlantsLayer.ts draws its icon atlas on a canvas when it is imported, which jsdom lacks.
let createPowerPlantLayers: typeof import('./PowerPlantsLayer').createPowerPlantLayers;

beforeAll(async () => {
  const context = new Proxy({}, { get: () => () => undefined });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
  ({ createPowerPlantLayers } = await import('./PowerPlantsLayer'));
});

const plants = { type: 'FeatureCollection', features: [] } as unknown as PowerPlantCollection;
const base = {
  plants,
  visible: true,
  opacity: 1,
  iconSize: 22,
  selectedLngLat: null,
  onClick: vi.fn(),
};
const ids = (layers: { id: string }[]) => layers.map((layer) => layer.id);

describe('createPowerPlantLayers', () => {
  it('builds nothing while the layer is off, even with a plant selected', () => {
    const layers = createPowerPlantLayers({ ...base, visible: false, selectedLngLat: [100, 14] });

    expect(layers).toEqual([]);
  });

  it('builds the plants layer, and no ring without a selected plant', () => {
    expect(ids(createPowerPlantLayers(base))).toEqual(['power-plants']);
  });

  it('draws the ring of the selected plant after the plants layer', () => {
    const layers = createPowerPlantLayers({ ...base, selectedLngLat: [100.56, 13.97] });

    expect(ids(layers)).toEqual(['power-plants', 'powerplant-selection-ring']);
  });

  it('still draws the ring while the plants are loading', () => {
    const layers = createPowerPlantLayers({
      ...base,
      plants: undefined,
      selectedLngLat: [100, 14],
    });

    expect(ids(layers)).toEqual(['powerplant-selection-ring']);
  });
});
