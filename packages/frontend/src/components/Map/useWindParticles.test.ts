import { describe, it, expect } from 'vitest';
import { viewportParticleCount, dynamicTrailParams } from './useWindParticles';

describe('viewportParticleCount', () => {
  // A fixed geographic viewport isolates the zoom-compensation math from the
  // (intentionally width-dependent) visible-area term.
  const viewport: [number, number, number, number] = [95, 10, 105, 20];

  it('is stable across container widths at the same zoom', () => {
    // Same degrees-per-pixel (i.e. same zoom) on a narrow and a wide container —
    // rawViewportWidth scales proportionally with containerWidthPx.
    const degPerPixel = 22 / 1440;
    const wideCount = viewportParticleCount({
      viewport,
      rawViewportWidth: 1440 * degPerPixel,
      containerWidthPx: 1440,
    });
    const narrowCount = viewportParticleCount({
      viewport,
      rawViewportWidth: 375 * degPerPixel,
      containerWidthPx: 375,
    });

    expect(narrowCount).toBe(wideCount);
  });

  it('increases density when the user actually zooms in, independent of screen width', () => {
    const zoomedOutCount = viewportParticleCount({
      viewport,
      rawViewportWidth: 22,
      containerWidthPx: 375,
    });
    const zoomedInCount = viewportParticleCount({
      viewport,
      rawViewportWidth: 2,
      containerWidthPx: 375,
    });

    expect(zoomedInCount).toBeGreaterThan(zoomedOutCount);
  });
});

describe('dynamicTrailParams', () => {
  it('is stable across container widths at the same zoom', () => {
    // Same degrees-per-pixel (i.e. same zoom) on a narrow and a wide container —
    // rawViewportWidth scales proportionally with containerWidthPx.
    const degPerPixel = 22 / 1440;
    const wide = dynamicTrailParams({
      rawViewportWidth: 1440 * degPerPixel,
      containerWidthPx: 1440,
    });
    const narrow = dynamicTrailParams({
      rawViewportWidth: 375 * degPerPixel,
      containerWidthPx: 375,
    });

    expect(narrow.trailLength).toBe(wide.trailLength);
    expect(narrow.alpha).toBe(wide.alpha);
  });

  it('grows trail length and alpha toward their caps when the user actually zooms in, independent of screen width', () => {
    const zoomedOut = dynamicTrailParams({ rawViewportWidth: 22, containerWidthPx: 375 });
    const zoomedIn = dynamicTrailParams({ rawViewportWidth: 2, containerWidthPx: 375 });

    expect(zoomedIn.trailLength).toBeGreaterThan(zoomedOut.trailLength);
    expect(zoomedIn.alpha).toBeGreaterThan(zoomedOut.alpha);
  });
});
