import mapboxgl from 'mapbox-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { MapboxOverlayProps } from '@deck.gl/mapbox';
import type { FilterContext } from '@deck.gl/core';

export type { MapboxOverlayProps };

export type OverlayInstance = mapboxgl.IControl & {
  setProps: (props: MapboxOverlayProps) => void;
};

// interleaved: true renders Deck.gl inside Mapbox's WebGL context, eliminating
// the canvas synchronization shift that occurs during zoom/pan animations.
// In interleaved mode, beforeId must be set on each individual deck.gl layer
// (not on the overlay) to control its position in the Mapbox layer stack.
export function createOverlay(props: MapboxOverlayProps): OverlayInstance {
  return new MapboxOverlay({ ...props, interleaved: true });
}

// Non-interleaved overlays draw their first frame before luma.gl's ResizeObserver has sized the
// canvas, so it renders into the default 300×150 buffer and the browser stretches it (fires
// flash as large blurry blobs). Use as layerFilter to skip drawing until the canvas is sized;
// the resize itself triggers the next redraw.
export function skipUntilCanvasSized({ layer }: FilterContext): boolean {
  return layer.context.device.getDefaultCanvasContext().isInitialized;
}
