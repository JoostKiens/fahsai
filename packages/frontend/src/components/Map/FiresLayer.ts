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
// Shared by baseRadiusForZoom (selection ring) and the vertex shader (live while zooming).
const ZOOM_CURVE = { pivotZoom: 6.5, levelsPerDoubling: 1.5, minPx: 1, maxPx: 6 };

const glslFloat = (n: number) => n.toFixed(4);
const glslVec3 = (c: RGB) => `vec3(${c.map((v) => glslFloat(v / 255)).join(', ')})`;

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

// project.scale is 2^zoom of the live viewport, so sizes follow every frame of a zoom gesture
// without rebuilding the layer. Picking runs this shader too, so the hit target follows as well.
const ZOOM_SIZE_VS = `
  float fireBaseRadius = exp2((log2(project.scale) - ${glslFloat(ZOOM_CURVE.pivotZoom)}) / ${glslFloat(ZOOM_CURVE.levelsPerDoubling)});
  size *= clamp(fireBaseRadius, ${glslFloat(ZOOM_CURVE.minPx)}, ${glslFloat(ZOOM_CURVE.maxPx)});
`;

class FireGlowLayer extends ScatterplotLayer<FirePoint> {
  static layerName = 'FireGlowLayer';

  getShaders() {
    // ScatterplotLayer types getShaders() as any; it defines no inject of its own to merge with.
    const shaders = super.getShaders() as object;
    return {
      ...shaders,
      inject: { 'vs:DECKGL_FILTER_SIZE': ZOOM_SIZE_VS, 'fs:DECKGL_FILTER_COLOR': GLOW_FS },
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

export function baseRadiusForZoom(zoom: number): number {
  const { pivotZoom, levelsPerDoubling, minPx, maxPx } = ZOOM_CURVE;
  return Math.min(maxPx, Math.max(minPx, 2 ** ((zoom - pivotZoom) / levelsPerDoubling)));
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
    parameters: ADDITIVE_BLEND,
    pickable: true,
    onClick,
  });
}
