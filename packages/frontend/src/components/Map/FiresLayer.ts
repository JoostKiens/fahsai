import { ScatterplotLayer } from '@deck.gl/layers';
import type { Layer, PickingInfo } from '@deck.gl/core';
import type { FirePoint } from '@thailand-aq/types';

type RGB = [number, number, number];
type RGBA4 = [number, number, number, number];

// Glow definition — tweak these to adjust the bloom look. t runs 0 → 1 from the fire's centre
// to the edge of the drawn disc, which is OUTER_MULT × the base radius (and is the hit target).
const OUTER_MULT = 4;
const CORE = { color: [255, 245, 204] as RGB, alpha: 0.9, edge: 0.25, softness: 0.05 }; // #fff5cc
const GLOW = {
  innerColor: [255, 170, 0] as RGB, // #ffaa00 next to the core
  outerColor: [255, 68, 0] as RGB, // #ff4400 at the edge
  peakAlpha: 0.8,
  // alpha = peakAlpha · exp(-falloff · t²) · (1 - t²); the last term reaches 0 at the disc
  // edge, so the glow never ends in a visible cutoff.
  falloff: 1.5,
};
// Base radius in px grows ×2 every `levelsPerDoubling` zoom levels, clamped to [minPx, maxPx].
const ZOOM_CURVE = { pivotZoom: 6.5, levelsPerDoubling: 1.5, minPx: 1, maxPx: 6 };
const SELECTION_RING = { minPx: 16, baseMult: 5, lineWidthPx: 2 };

const glslFloat = (n: number) => n.toFixed(4);
const glslVec3 = (c: RGB) => `vec3(${c.map((v) => glslFloat(v / 255)).join(', ')})`;

// The single implementation of the zoom curve. project.scale is 2^zoom of the live viewport, so
// sizes follow every frame of a zoom gesture without rebuilding layers.
const ZOOM_CURVE_VS_DECL = `
float fire_zoomBaseRadius() {
  float r = exp2((log2(project.scale) - ${glslFloat(ZOOM_CURVE.pivotZoom)}) / ${glslFloat(ZOOM_CURVE.levelsPerDoubling)});
  return clamp(r, ${glslFloat(ZOOM_CURVE.minPx)}, ${glslFloat(ZOOM_CURVE.maxPx)});
}
`;

const SCATTERPLOT_RADIUS_EXPR = 'scatterplot.radiusScale * instanceRadius';

// deck.gl has no hook between instanceRadius and outerRadiusPixels, and the zoom factor must be
// applied there (not later, in DECKGL_FILTER_SIZE) so the fragment shader's edge, antialiasing
// and stroke width all see the scaled radius. Throws if a deck.gl upgrade changes the source.
export function patchRadius(vs: string, radiusExpr: string): string {
  if (!vs.includes(SCATTERPLOT_RADIUS_EXPR)) {
    throw new Error(
      `ScatterplotLayer vertex shader no longer contains "${SCATTERPLOT_RADIUS_EXPR}"`,
    );
  }
  return vs.replace(SCATTERPLOT_RADIUS_EXPR, radiusExpr);
}

// Runs before the picking module's filter (order 99), which replaces the color with the picking
// color regardless of alpha — so the whole disc stays clickable even where the glow is faint.
const GLOW_FS = `
  float t = length(geometry.uv);
  float core = 1.0 - smoothstep(${glslFloat(CORE.edge - CORE.softness)}, ${glslFloat(CORE.edge + CORE.softness)}, t);
  vec3 glowColor = mix(${glslVec3(GLOW.innerColor)}, ${glslVec3(GLOW.outerColor)}, t);
  float glowAlpha = ${glslFloat(GLOW.peakAlpha)} * exp(-${glslFloat(GLOW.falloff)} * t * t) * (1.0 - t * t);
  color = vec4(
    mix(glowColor, ${glslVec3(CORE.color)}, core),
    mix(glowAlpha, ${glslFloat(CORE.alpha)}, core) * color.a
  );
`;

// ScatterplotLayer types getShaders() as any; it defines no inject of its own to merge with.
type Shaders = { vs: string; inject?: Record<string, string> };

export class FireGlowLayer extends ScatterplotLayer<FirePoint> {
  static layerName = 'FireGlowLayer';

  getShaders() {
    const shaders = super.getShaders() as Shaders;
    return {
      ...shaders,
      vs: patchRadius(shaders.vs, `${SCATTERPLOT_RADIUS_EXPR} * fire_zoomBaseRadius()`),
      inject: { 'vs:#decl': ZOOM_CURVE_VS_DECL, 'fs:DECKGL_FILTER_COLOR': GLOW_FS },
    };
  }
}

type LngLat = { lng: number; lat: number };

// Sized in the shader from the same curve as the glow, so it tracks zoom gestures with it.
export class FireSelectionRingLayer extends ScatterplotLayer<LngLat> {
  static layerName = 'FireSelectionRingLayer';

  getShaders() {
    const shaders = super.getShaders() as Shaders;
    const { minPx, baseMult } = SELECTION_RING;
    return {
      ...shaders,
      vs: patchRadius(
        shaders.vs,
        `max(${glslFloat(minPx)}, fire_zoomBaseRadius() * ${glslFloat(baseMult)})`,
      ),
      inject: { 'vs:#decl': ZOOM_CURVE_VS_DECL },
    };
  }
}

// Additive blending: each fragment adds to the framebuffer instead of replacing it.
// Overlapping halos accumulate — dense fire clusters bloom brighter.
const ADDITIVE_BLEND = {
  depthCompare: 'always',
  depthWriteEnabled: false,
  blend: true,
  blendColorSrcFactor: 'src-alpha',
  blendColorDstFactor: 'one',
  blendColorOperation: 'add',
  blendAlphaSrcFactor: 'src-alpha',
  blendAlphaDstFactor: 'one',
  blendAlphaOperation: 'add',
} as const;

// Map FRP (fire radiative power, MW) to a radius scale factor.
// 0 MW → 0.6×, 200 MW → 2.0×, clamped at both ends.
// FRP is the standard proxy for smoke and PM2.5 emissions.
function intensityMultiplier(d: FirePoint): number {
  if (d.frp === null) return 1.0;
  return Math.min(2.0, Math.max(0.6, 0.6 + (Math.min(d.frp, 200) / 200) * 1.4));
}

// The shader supplies the colors; only the per-point alpha (confidence) comes from here.
function fillColor(d: FirePoint): RGBA4 {
  return [255, 255, 255, d.confidence === 'low' ? 128 : 255];
}

function outerRadius(d: FirePoint): number {
  return OUTER_MULT * intensityMultiplier(d);
}

/**
 * Returns one additive-blended layer that renders each fire point as a firefly/bloom effect:
 * a solid core with a soft orange→red glow, drawn as a radial gradient in the fragment shader.
 * Additive blending makes overlapping points accumulate light — dense clusters appear brighter.
 * Size scales with FRP (fire radiative power); low-confidence points render at half opacity.
 */
export function createFiresLayer(
  data: FirePoint[],
  opacity: number,
  onClick: (info: PickingInfo) => void,
): Layer {
  return new FireGlowLayer({
    id: 'fire-glow',
    data,
    opacity,
    getPosition: (d) => [d.lng, d.lat],
    radiusUnits: 'pixels',
    getRadius: outerRadius,
    getFillColor: fillColor,
    // The glow already fades to 0 at the rim, so edge antialiasing adds nothing; without it uv
    // stays within the unit disc (t ≤ 1) and the hit target is exactly the drawn disc.
    antialiasing: false,
    parameters: ADDITIVE_BLEND,
    pickable: true,
    onClick,
  });
}

export function createFireSelectionRing([lng, lat]: [number, number]): Layer {
  return new FireSelectionRingLayer({
    id: 'fire-selection-ring',
    data: [{ lng, lat }],
    getPosition: (d) => [d.lng, d.lat],
    radiusUnits: 'pixels',
    stroked: true,
    filled: false,
    getLineColor: [255, 255, 255, 210],
    lineWidthUnits: 'pixels',
    getLineWidth: SELECTION_RING.lineWidthPx,
    parameters: { depthCompare: 'always', depthWriteEnabled: false },
  });
}
