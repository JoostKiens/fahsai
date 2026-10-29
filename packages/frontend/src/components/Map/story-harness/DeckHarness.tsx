import { useEffect, useRef } from 'react';
import { Deck } from '@deck.gl/core';
import type { Layer, MapViewState, Position } from '@deck.gl/core';
import { SolidPolygonLayer } from '@deck.gl/layers';

// The whole CAMS grid (88.8–114°E, 0.8–30°N, 466×567 px at this zoom), centred on its Mercator
// midpoint so none of it falls outside the 800×600 canvas.
export const STORY_VIEW_STATE: MapViewState = { longitude: 101.4, latitude: 15.93, zoom: 3.7 };
// The app's page background (zinc-900), drawn as the first layer so pixel readback matches what
// a viewer sees; a CSS background would leave the canvas transparent. Not a view clearColor: the
// MaskExtension's mask pass would clear to it too and stop clipping the PM2.5 grid to land.
export const HARNESS_BACKGROUND_RGB: [number, number, number] = [24, 24, 27];
const WORLD_POLYGON: Position[] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
];

// A fresh instance per update, like any deck.gl layer: one shared instance breaks the second
// Deck that mounts it (deck.gl assertion, so no background is drawn).
function createBackgroundLayer() {
  return new SolidPolygonLayer<Position[]>({
    id: 'story-background',
    data: [WORLD_POLYGON],
    getPolygon: (polygon) => polygon,
    getFillColor: HARNESS_BACKGROUND_RGB,
  });
}
export const HARNESS_WIDTH_PX = 800;
export const HARNESS_HEIGHT_PX = 600;

type Harness = {
  deck: Deck;
  layers: Layer[] | null;
  device: { loseDevice(): boolean } | null;
};
const harnesses = new WeakMap<HTMLElement, Harness>();

type Props = {
  /** `null` while the story's data is still loading; the harness is never ready until set. */
  layers: Layer[] | null;
  viewState?: MapViewState;
};

/**
 * Standalone Deck for stories: no Mapbox basemap, fixed size and view, 1 device pixel per CSS
 * pixel, readable drawing buffer. Sets `data-render-ready="true"` once every layer has loaded
 * and a frame has rendered with them; await it with `waitForRenderReady`.
 */
export function DeckHarness({ layers, viewState = STORY_VIEW_STATE }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const harness: Harness = {
      layers: null,
      device: null,
      deck: new Deck({
        canvas,
        width: HARNESS_WIDTH_PX,
        height: HARNESS_HEIGHT_PX,
        useDevicePixels: 1,
        // Already the v9 default; set explicitly because pixel probes read the canvas back.
        deviceProps: { webgl: { preserveDrawingBuffer: true } },
        // Neither finalize() nor device.destroy() releases the WebGL context (luma.gl 9.4);
        // loseDevice() does, so repeated story mounts don't hit Chrome's context limit.
        onDeviceInitialized: (device) => {
          harness.device = device;
        },
        onAfterRender: () => {
          const isReady = hasFinalSize(canvas) && pendingLayerIds(harness.layers)?.length === 0;
          container.dataset.renderReady = String(isReady);
        },
      }),
    };
    harnesses.set(container, harness);

    return () => {
      harnesses.delete(container);
      harness.deck.finalize();
      harness.device?.loseDevice();
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const harness = container && harnesses.get(container);
    if (!harness) return;
    harness.layers = layers;
    container.dataset.renderReady = 'false';
    harness.deck.setProps({ layers: [createBackgroundLayer(), ...(layers ?? [])], viewState });
    // Guarantee a frame, and so an onAfterRender that can set ready again, after every change.
    harness.deck.redraw('DeckHarness layers changed');
  }, [layers, viewState]);

  return (
    <div
      ref={containerRef}
      data-render-ready="false"
      style={{ width: HARNESS_WIDTH_PX, height: HARNESS_HEIGHT_PX }}
    >
      {/* Sized up front: a story that draws at mount can otherwise render into the default
          300×150 buffer before deck.gl resizes it. */}
      <canvas ref={canvasRef} width={HARNESS_WIDTH_PX} height={HARNESS_HEIGHT_PX} />
    </div>
  );
}

/** Ids of layers still loading async props; `null` while the story has no layers yet. */
function hasFinalSize(canvas: HTMLCanvasElement): boolean {
  return canvas.width === HARNESS_WIDTH_PX && canvas.height === HARNESS_HEIGHT_PX;
}

function pendingLayerIds(layers: Layer[] | null): string[] | null {
  return layers && layers.filter((layer) => !layer.isLoaded).map((layer) => layer.id);
}

const DEFAULT_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 50;

/** Resolves with the story's Deck once it has rendered all its layers; throws on timeout. */
export async function waitForRenderReady(
  root: HTMLElement,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Deck> {
  const startMs = performance.now();
  for (;;) {
    const container = root.querySelector<HTMLElement>('[data-render-ready]');
    const harness = container ? harnesses.get(container) : undefined;
    if (harness && container?.dataset.renderReady === 'true') return harness.deck;
    if (performance.now() - startMs > timeoutMs) {
      throw new Error(`Deck canvas not ready after ${timeoutMs} ms: ${describePending(harness)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function describePending(harness: Harness | undefined): string {
  if (!harness) return 'no DeckHarness found in the story.';
  const canvas = harness.deck.getCanvas();
  if (canvas && !hasFinalSize(canvas)) {
    return `canvas is ${canvas.width}×${canvas.height}, not ${HARNESS_WIDTH_PX}×${HARNESS_HEIGHT_PX}.`;
  }
  const pending = pendingLayerIds(harness.layers);
  if (pending === null) return 'layers is still null (story data not loaded).';
  if (pending.length > 0) return `layers still loading: ${pending.join(', ')}.`;
  return 'all layers loaded, but no frame has rendered since.';
}
