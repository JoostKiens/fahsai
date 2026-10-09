import { describe, it, expect } from 'vitest';
import type { WindReading } from '@thailand-aq/types';
import { VIEWPORT_BBOX } from '@/utils/bbox';
import {
  viewportParticleCount,
  dynamicTrailParams,
  stepParticles,
  buildGrid,
  spawnParticle,
  packTrails,
  createTrailBuffers,
  type Particle,
} from './useWindParticles';

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

    expect(narrow.trailDurationMs).toBe(wide.trailDurationMs);
    expect(narrow.alpha).toBe(wide.alpha);
  });

  it('grows trail duration and alpha toward their caps when the user actually zooms in, independent of screen width', () => {
    const zoomedOut = dynamicTrailParams({ rawViewportWidth: 22, containerWidthPx: 375 });
    const zoomedIn = dynamicTrailParams({ rawViewportWidth: 2, containerWidthPx: 375 });

    expect(zoomedIn.trailDurationMs).toBeGreaterThan(zoomedOut.trailDurationMs);
    expect(zoomedIn.alpha).toBeGreaterThan(zoomedOut.alpha);
  });
});

const BASE_STEP_MS = 16.67;
// Uniform 10 km/h westerly (blowing FROM 270°, i.e. travelling east) over the whole grid —
// below the speed at which trails get shortened, so every trail spans the full duration.
const readings: WindReading[] = [];
for (let lng = VIEWPORT_BBOX[0]; lng <= VIEWPORT_BBOX[2]; lng += 0.4) {
  for (let lat = VIEWPORT_BBOX[1]; lat <= VIEWPORT_BBOX[3]; lat += 0.4) {
    readings.push({ lng, lat, wind_speed_kmh: 10, wind_direction_deg: 270 });
  }
}
const grid = buildGrid(readings);
const { trailDurationMs } = dynamicTrailParams({ rawViewportWidth: 22, containerWidthPx: 1440 });

// A particle at a fixed spot that lives long enough to never respawn during a test.
function makeParticle(): Particle {
  const particle = spawnParticle({ viewport: [100, 15, 100, 15], grid, gridMap: null });
  particle.maxAge = 60_000;
  return particle;
}

// Advances `particle` by `durationMs` at a fixed frame time; returns the final clock.
function simulate({
  particle,
  frameMs,
  durationMs,
}: {
  particle: Particle;
  frameMs: number;
  durationMs: number;
}): number {
  let clock = 0;
  while (clock < durationMs) {
    clock += frameMs;
    stepParticles({
      particles: [particle],
      grid,
      dt: frameMs,
      dtScale: frameMs / BASE_STEP_MS,
      spawnViewport: [95, 10, 105, 20],
      gridMap: null,
      trailDurationMs,
      clock,
    });
  }
  return clock;
}

function pack(particles: Particle[], clock: number) {
  return packTrails({
    particles,
    buffers: createTrailBuffers(),
    clock,
    fadeWindowMs: trailDurationMs,
    alphaScale: 255,
  });
}

describe('stepParticles', () => {
  // Geographic length (degrees) of the single packed trail, head (first vertex) to tail.
  function trailLengthAfterOneSecond(frameMs: number): number {
    const particle = makeParticle();
    const clock = simulate({ particle, frameMs, durationMs: 1000 });
    const { positions, vertexCount } = pack([particle], clock);
    const tail = (vertexCount - 1) * 2;
    return Math.hypot(positions[0] - positions[tail], positions[1] - positions[tail + 1]);
  }

  it('produces the same trail length at 60 Hz and 120 Hz', () => {
    const at60Hz = trailLengthAfterOneSecond(BASE_STEP_MS);
    const at120Hz = trailLengthAfterOneSecond(BASE_STEP_MS / 2);

    // Within one 60 Hz step: trimming happens per point, so lengths differ by at most a segment.
    const segmentsAt60Hz = trailDurationMs / BASE_STEP_MS;
    expect(Math.abs(at120Hz - at60Hz)).toBeLessThanOrEqual(at60Hz / segmentsAt60Hz + 1e-9);
  });

  it('does not stretch trails when frames are slow', () => {
    const at60Hz = trailLengthAfterOneSecond(BASE_STEP_MS);
    const slowFrames = trailLengthAfterOneSecond(50);

    expect(slowFrames).toBeLessThanOrEqual(at60Hz);
  });
});

describe('packTrails', () => {
  it('lays out one path per drawable particle and skips particles with fewer than 2 points', () => {
    const first = makeParticle();
    const second = makeParticle();
    const fresh = makeParticle();
    const clock = simulate({ particle: first, frameMs: BASE_STEP_MS, durationMs: 100 });
    simulate({ particle: second, frameMs: BASE_STEP_MS, durationMs: 50 });

    const buffers = pack([first, fresh, second], clock);

    expect({
      pathCount: buffers.pathCount,
      startIndices: [...buffers.startIndices.subarray(0, buffers.pathCount)],
      vertexCount: buffers.vertexCount,
    }).toEqual({
      pathCount: 2,
      startIndices: [0, first.pointCount],
      vertexCount: first.pointCount + second.pointCount,
    });
  });

  it('writes vertices head-first, even after the ring buffer has wrapped', () => {
    const particle = makeParticle();
    // Far more frames than the ring holds, so the head slot has wrapped around.
    const clock = simulate({ particle, frameMs: BASE_STEP_MS / 2, durationMs: 3000 });

    const { positions, timestamps, vertexCount } = pack([particle], clock);
    const vertexTimes = [...timestamps.subarray(0, vertexCount)];

    expect([positions[0], positions[1]]).toEqual([
      Math.fround(particle.lng),
      Math.fround(particle.lat),
    ]);
    expect(vertexTimes).toEqual([...vertexTimes].sort((a, b) => b - a));
  });

  it('returns empty buffers when no particle has a drawable trail', () => {
    const buffers = pack([makeParticle()], 0);

    expect({ pathCount: buffers.pathCount, vertexCount: buffers.vertexCount }).toEqual({
      pathCount: 0,
      vertexCount: 0,
    });
  });
});
