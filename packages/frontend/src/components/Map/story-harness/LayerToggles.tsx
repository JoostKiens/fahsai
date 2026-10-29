import { useMemo } from 'react';
import { LayerGroups } from '@/components/Sidebar';
import { useLayerStore } from '@/store/layerStore';
import { createFiresLayer } from '../FiresLayer';
import { createLandMaskLayer, createPM25BitmapLayer } from '../PM25Layer';
import { useCamsBitmap } from '../useCamsBitmap';
import { DeckHarness } from './DeckHarness';
import firesResponse from './fixtures/2026-10-24/fires.json';
import { camsPoints } from './Pm25Grid';

const handleFireClick = () => {};

/**
 * Story-only wrapper, not an app component.
 * The sidebar's layer toggles driving the PM2.5 grid and fire layers, as MapView wires them.
 *
 * Correct output: the layer sidebar on the left and the map canvas on the right. With every
 * toggle on, the map shows the PM2.5 grid clipped to land with fire dots on top (see the PM2.5
 * grid and Fires stories for what each looks like). Switching Ambient or Fires off removes only
 * that layer from the canvas; the legend stays.
 */
export function LayerToggles() {
  const ambient = useLayerStore((s) => s.layers.aqGrid);
  const fires = useLayerStore((s) => s.layers.fires);
  const bitmap = useCamsBitmap(camsPoints);
  // Like MapView: fires don't wait for the CAMS bitmap and take their opacity from the store.
  const firesLayer = useMemo(
    () => fires.visible && createFiresLayer(firesResponse.data, fires.opacity, handleFireClick),
    [fires.visible, fires.opacity],
  );
  const ambientLayers = useMemo(
    () => (ambient.visible && bitmap ? [createLandMaskLayer(), createPM25BitmapLayer(bitmap)] : []),
    [ambient.visible, bitmap],
  );
  // null keeps the harness not-ready until the visible PM2.5 grid has its bitmap.
  const layers = useMemo(
    () =>
      ambient.visible && !bitmap ? null : [...ambientLayers, ...(firesLayer ? [firesLayer] : [])],
    [ambient.visible, bitmap, ambientLayers, firesLayer],
  );
  return (
    <div className="flex gap-4">
      <div className="w-72 shrink-0 bg-zinc-900">
        <LayerGroups />
      </div>
      <DeckHarness layers={layers} />
    </div>
  );
}
