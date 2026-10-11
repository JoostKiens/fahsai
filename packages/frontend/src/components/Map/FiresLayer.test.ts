import { describe, it, expect } from 'vitest';
import { FireGlowLayer, FireSelectionRingLayer, patchRadius } from './FiresLayer';

describe('patchRadius', () => {
  it('replaces the scatterplot radius expression', () => {
    const vs = 'r = project_size_to_pixel(scatterplot.radiusScale * instanceRadius, u);';
    expect(patchRadius(vs, 'R')).toBe('r = project_size_to_pixel(R, u);');
  });

  it('throws when the expression is missing', () => {
    expect(() => patchRadius('void main() {}', 'R')).toThrow(/no longer contains/);
  });
});

// getShaders() only reads the device type and default modules from the context, which deck
// normally attaches when the layer is added; a stub is enough to assemble the shader sources.
function shadersOf(layer: FireGlowLayer | FireSelectionRingLayer) {
  Object.assign(layer, { context: { device: { type: 'webgl' }, defaultShaderModules: [] } });
  return layer.getShaders();
}

// Run against the installed deck.gl source, so an upgrade that changes the shader fails here.
describe('zoom-scaled layer shaders', () => {
  it('scales the fire glow radius by the zoom curve', () => {
    const { vs } = shadersOf(new FireGlowLayer({ id: 'test', data: [] }));
    expect(vs).toContain('scatterplot.radiusScale * instanceRadius * fire_zoomBaseRadius()');
  });

  it('sizes the selection ring from the zoom curve', () => {
    const { vs } = shadersOf(new FireSelectionRingLayer({ id: 'test', data: [] }));
    expect(vs).toContain('fire_zoomBaseRadius() * 5.0000');
  });
});
