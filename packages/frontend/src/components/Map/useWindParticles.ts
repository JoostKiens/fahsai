import { useEffect, useRef } from 'react';
import { TripsLayer } from '@deck.gl/geo-layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { WindReading, PM25GridPoint } from '@thailand-aq/types';
import { VIEWPORT_BBOX } from '@/utils/bbox';
import { PM25_CAT_BREAKPOINTS } from '@/utils/aqiColors';

// ─── constants ────────────────────────────────────────────────────────────────

const PARTICLE_COUNT = 2400;
// Reference simulation step (one 60 Hz frame) that ANIM_SCALE, TRAIL_LENGTH and the particle
// age range were calibrated against. Motion still advances by the real frame time; this only
// converts those per-step tuning values into milliseconds so behavior is refresh-rate independent.
const BASE_STEP_MS = 16.67;
// Trail length in BASE_STEP_MS steps. Trails are trimmed by age (TRAIL_LENGTH × BASE_STEP_MS),
// not point count, so a 120 Hz screen gets twice the points but the same geographic length.
const TRAIL_LENGTH = 14;
// Degrees of movement per BASE_STEP_MS per km/h of wind speed.
// Combined with REF_VIEWPORT_DEG_WIDTH, a 15 km/h breeze crosses the viewport in ~16 s.
const ANIM_SCALE = 0.0015;
// Below this speed the trail always spans the full trail duration.
// Above it, trail duration shrinks as √(TRAIL_SPEED_REF_KMH / speed) so total
// geographic trail length grows as √speed rather than linearly — preventing
// fast-wind trails from dominating the visual at the expense of animation speed.
const TRAIL_SPEED_REF_KMH = 13;
// Maximum alpha for a fresh particle head (0–255). Trail fades linearly to 0.
const PARTICLE_START_ALPHA = 180;
const PARTICLE_START_ALPHA_MAX = 255;
// Reference raw viewport width (degrees) used to normalise zoom-dependent scaling
// (particle velocity, trail length, particle density) so behavior stays consistent
// regardless of screen width or zoom level. Originally measured against the padded
// (buffered) viewport at a ~1440px desktop reference, back when dtScale used that
// padded width directly; VELOCITY_ZOOM_DAMPING and TRAIL_GROWTH_MAX were tuned
// empirically against the current raw-width-based formulas, so treat this value as
// a tuning reference point rather than an exact physical viewport measurement.
const REF_VIEWPORT_DEG_WIDTH = 22;
// Container width (CSS px) REF_VIEWPORT_DEG_WIDTH was originally calibrated against — used to
// derive REF_PIXELS_PER_DEGREE below, the pixels-per-degree ratio velocity is normalised to so
// on-screen speed stays constant across zoom levels and container/screen widths.
const REF_CONTAINER_WIDTH_PX = 1440;
const REF_PIXELS_PER_DEGREE = REF_CONTAINER_WIDTH_PX / REF_VIEWPORT_DEG_WIDTH;
// Exponent applied to (REF_VIEWPORT_DEG_WIDTH / rawViewportWidth) for particle density:
// 2 = fully cancels the natural quadratic area shrinkage when zooming in (density stays
// flat/constant instead of dropping), 0 = no compensation at all (density drops with the
// raw, uncompensated square of zoom — the original, pre-tuning behavior, which read as too
// sparse when zoomed in). Starting guess between the two extremes; tune visually so density
// keeps dropping smoothly through the middle zoom range instead of plateauing there.
const DENSITY_ZOOM_EXPONENT = 1.5;
// The density formula above is already saturating PARTICLE_COUNT's flat cap by ~zoom 10 (its
// uncapped value keeps growing well past it all the way to village-level zoom), so without a
// boost, particle count stops increasing from zoom ~10 all the way to the deepest zoom-in.
// MAX_PARTICLE_COUNT phases in a higher ceiling as rawViewportWidth shrinks from
// HIGH_ZOOM_WIDTH_DEG (~zoom 10-11, where the flat cap starts biting) down to
// HIGH_ZOOM_WIDTH_FLOOR_DEG (~zoom 15, village level), leaving zoom 10-11 untouched.
const HIGH_ZOOM_WIDTH_DEG = 1;
const HIGH_ZOOM_WIDTH_FLOOR_DEG = 0.1;
const MAX_PARTICLE_COUNT = 2800;
// Trails represent a roughly-fixed geographic distance, so their pixel length
// should grow as you zoom in (more pixels per degree) — capped so it doesn't run
// away at extreme zoom. Starting guess, tune visually.
const TRAIL_GROWTH_MAX = 2;
// Ring-buffer capacity per particle: the longest trail (full zoom growth) at up to 240 Hz.
// shortcut: on faster displays the oldest points are dropped early and trails get slightly
// shorter; raise the multiplier if such displays become common.
const MAX_TRAIL_POINTS = TRAIL_LENGTH * TRAIL_GROWTH_MAX * 4 + 2;
// Trail stroke width (pixels) tapers from HEAD_WIDTH down to TAIL_WIDTH along each path.
const HEAD_WIDTH = 4;
const TAIL_WIDTH = 0.5;
// Calm-wind trails are only a few pixels long; at full HEAD_WIDTH they render as blobs.
// Head width shrinks so a trail is drawn at least MIN_TRAIL_ASPECT times longer than wide,
// down to MIN_HEAD_WIDTH so near-still particles stay visible. Starting guesses, tune visually.
const MIN_TRAIL_ASPECT = 3;
const MIN_HEAD_WIDTH = 1;
// `clock` and particle timestamps are read by TripsLayer as 32-bit floats on the GPU,
// which lose ms precision above 2^24 (~4.66h of continuous accumulation). Rebasing every
// 10 minutes of real time keeps values far below that ceiling for the life of the tab.
const CLOCK_REBASE_MS = 600_000;
const MIN_AGE_MS = 80 * BASE_STEP_MS;
const MAX_AGE_MS = 320 * BASE_STEP_MS;

// Grid bounds — must match the weather grid constants in openmeteo.ts.
// 0.4° step, lng 89→114 (63 pts), lat 1→30 (73 pts) = 4,599 points.
const GRID_LNG_MIN = VIEWPORT_BBOX[0];
const GRID_LAT_MIN = VIEWPORT_BBOX[1];
const GRID_LNG_MAX = VIEWPORT_BBOX[2];
const GRID_LAT_MAX = VIEWPORT_BBOX[3];
const GRID_STEP_DEG = 0.4;
const GRID_LNG_COUNT = Math.floor((GRID_LNG_MAX - GRID_LNG_MIN) / GRID_STEP_DEG) + 1; // 63
const GRID_LAT_COUNT = Math.floor((GRID_LAT_MAX - GRID_LAT_MIN) / GRID_STEP_DEG) + 1; // 73

const TRACE_STEP_HOURS = 3; // 8 steps × 3h = 24h
const TRACE_STEPS = 8;
const KMH_TO_DEG_LAT = 1 / 111; // 1 degree lat ≈ 111 km, constant

// Reference area (full wind grid) used to normalise particle count to viewport size,
// keeping visual density constant across different screen widths and zoom levels.
const REFERENCE_AREA = (GRID_LNG_MAX - GRID_LNG_MIN) * (GRID_LAT_MAX - GRID_LAT_MIN);

// Buffer around the visible viewport used as the spawn/OOB area.
// Gives particles time to enter the screen before being counted, and avoids
// hard pop-in at the edges when panning.
const VIEWPORT_BUFFER_DEG = 1.5;

// ─── types ────────────────────────────────────────────────────────────────────

export interface Particle {
  lng: number;
  lat: number;
  age: number; // ms since spawn
  maxAge: number; // ms
  // Trail ring buffers (MAX_TRAIL_POINTS slots), preallocated once per particle and reused
  // across respawns so the per-frame simulation allocates nothing. Read via trailSlot().
  positions: Float32Array; // [lng, lat] per slot
  timestamps: Float64Array; // ms clock value at which each slot was recorded
  head: number; // slot of the newest point
  pointCount: number; // number of valid points, newest at `head`, walking backwards
  trailStartMs: number; // clock value of the first point this particle life ever recorded
  maxTrailMs: number; // current wind-speed-based trail duration cap, set each step in stepParticles
  color: [number, number, number]; // lightened AQI RGB sampled at spawn
}

// Flat grid: index = latIdx * GRID_LNG_COUNT + lngIdx
// Each cell stores precomputed travel-direction velocity components (km/h).
type WindGrid = Float32Array; // [dx0, dy0, dx1, dy1, ...]

type Viewport = [west: number, south: number, east: number, north: number];

const FULL_VIEWPORT: Viewport = [GRID_LNG_MIN, GRID_LAT_MIN, GRID_LNG_MAX, GRID_LAT_MAX];

// Flat per-vertex buffers handed to TripsLayer as binary attributes. Reused across frames
// (grown only when a frame needs more room) so deck.gl skips per-particle accessor calls
// and the frame loop allocates no per-particle arrays.
export interface TrailBuffers {
  positions: Float32Array; // [lng, lat] per vertex
  timestamps: Float32Array;
  colors: Uint8ClampedArray; // RGBA per vertex
  widths: Float32Array;
  startIndices: Uint32Array; // first vertex of each path
  pathCount: number;
  vertexCount: number;
}

export function createTrailBuffers(vertexCapacity = 0, pathCapacity = 0): TrailBuffers {
  return {
    positions: new Float32Array(vertexCapacity * 2),
    timestamps: new Float32Array(vertexCapacity),
    colors: new Uint8ClampedArray(vertexCapacity * 4),
    widths: new Float32Array(vertexCapacity),
    startIndices: new Uint32Array(pathCapacity),
    pathCount: 0,
    vertexCount: 0,
  };
}

// Ring-buffer slot of the i-th newest trail point (i = 0 is the head).
function trailSlot(p: Particle, i: number): number {
  return (p.head - i + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS;
}

function pushTrailPoint(p: Particle, clock: number): void {
  p.head = (p.head + 1) % MAX_TRAIL_POINTS;
  p.positions[p.head * 2] = p.lng;
  p.positions[p.head * 2 + 1] = p.lat;
  p.timestamps[p.head] = clock;
  p.pointCount = Math.min(p.pointCount + 1, MAX_TRAIL_POINTS);
}

// Packs every drawable trail (≥ 2 points) head-first into `buffers`, growing them if needed.
// Mutates and returns `buffers` (or a larger replacement) — reusing them across frames is the
// point, so the usual no-argument-mutation rule is deliberately broken here.
export function packTrails({
  particles,
  buffers,
  clock,
  fadeWindowMs,
  alphaScale,
  pixelsPerDegree,
}: {
  particles: Particle[];
  buffers: TrailBuffers;
  clock: number;
  fadeWindowMs: number;
  alphaScale: number; // opacity × zoom-dependent alpha, applied on top of each particle's fade
  pixelsPerDegree: number; // current on-screen scale, used to size each trail's width
}): TrailBuffers {
  let vertexTotal = 0;
  let pathTotal = 0;
  for (const p of particles) {
    if (p.pointCount < 2) continue;
    vertexTotal += p.pointCount;
    pathTotal++;
  }
  const out =
    vertexTotal > buffers.timestamps.length || pathTotal > buffers.startIndices.length
      ? createTrailBuffers(vertexTotal * 2, pathTotal * 2)
      : buffers;

  let vertex = 0;
  let path = 0;
  for (const p of particles) {
    const n = p.pointCount;
    if (n < 2) continue;
    out.startIndices[path++] = vertex;

    // Speed-truncated (fast-wind) trails span less real time than fadeWindowMs, so
    // TripsLayer's own head-to-tail fade never reaches full transparency for them —
    // scaling the ceiling by how much of the window the trail actually spans turns
    // that into a uniformly dim trail instead of a hard-edged cutoff. Only applies once
    // the trail has actually filled up to its speed-based cap (p.maxTrailMs) — a trail
    // that's still growing from a fresh spawn hasn't had time to fade yet either, and
    // is already correctly rendered by TripsLayer's own per-vertex fade on its own.
    // Uses the intended cap (maxTrailMs), not the measured head-to-tail span: age-based
    // trimming leaves the span up to one frame short, by an amount that varies with frame
    // timing, which would make every trail's brightness jitter.
    const isTrailFull = clock - p.trailStartMs >= p.maxTrailMs;
    const spanFade = isTrailFull ? Math.min(1, p.maxTrailMs / fadeWindowMs) : 1;
    const alpha = Math.round(alphaScale * (1 - p.age / p.maxAge) * spanFade);
    const headWidth = trailHeadWidth({ p, pointCount: n, pixelsPerDegree });
    // Same head-to-tail taper ratio as at full width, so the tail still comes to a point.
    const tailWidth = (TAIL_WIDTH * headWidth) / HEAD_WIDTH;

    for (let i = 0; i < n; i++, vertex++) {
      const slot = trailSlot(p, i);
      out.positions[vertex * 2] = p.positions[slot * 2];
      out.positions[vertex * 2 + 1] = p.positions[slot * 2 + 1];
      out.timestamps[vertex] = p.timestamps[slot];
      out.colors[vertex * 4] = p.color[0];
      out.colors[vertex * 4 + 1] = p.color[1];
      out.colors[vertex * 4 + 2] = p.color[2];
      out.colors[vertex * 4 + 3] = alpha;
      out.widths[vertex] = headWidth - ((headWidth - tailWidth) * i) / (n - 1);
    }
  }
  out.pathCount = path;
  out.vertexCount = vertex;
  return out;
}

// Head width (px) for a trail of the given on-screen length: full HEAD_WIDTH for long trails,
// narrower for short calm-wind trails so they still read as streaks rather than blobs.
function trailHeadWidth({
  p,
  pointCount,
  pixelsPerDegree,
}: {
  p: Particle;
  pointCount: number;
  pixelsPerDegree: number;
}): number {
  const tail = trailSlot(p, pointCount - 1);
  // cos(lat) approximates Mercator's x/y scale ratio; within 4% across the 1–30°N grid.
  const dxPx =
    (p.positions[p.head * 2] - p.positions[tail * 2]) *
    Math.cos((p.lat * Math.PI) / 180) *
    pixelsPerDegree;
  const dyPx = (p.positions[p.head * 2 + 1] - p.positions[tail * 2 + 1]) * pixelsPerDegree;
  return clamp(Math.hypot(dxPx, dyPx) / MIN_TRAIL_ASPECT, MIN_HEAD_WIDTH, HEAD_WIDTH);
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useWindParticles(
  overlay: MapboxOverlay | null,
  map: mapboxgl.Map | null,
  wind: WindReading[] | undefined,
  config: { visible: boolean; opacity: number },
  aqGrid?: PM25GridPoint[] | null,
): void {
  // Use a single mutable ref object to avoid stale closure issues in the rAF loop.
  const stateRef = useRef({
    particles: [] as Particle[],
    grid: null as WindGrid | null,
    gridMap: null as Map<string, number> | null,
    visible: config.visible,
    opacity: config.opacity,
    viewport: FULL_VIEWPORT,
    rawViewportWidth: REF_VIEWPORT_DEG_WIDTH,
    containerWidthPx: REF_CONTAINER_WIDTH_PX,
    clock: 0,
    trailBuffers: createTrailBuffers(),
  });

  // Keep config in sync without restarting the animation loop.
  stateRef.current.visible = config.visible;
  stateRef.current.opacity = config.opacity;

  // Track map zoom/viewport for particle spawning and OOB culling.
  useEffect(() => {
    if (!map) return;
    const initialViewport = mapViewport(map);
    stateRef.current.viewport = initialViewport;
    const initialRawWidth = mapRawViewportWidth(map);
    stateRef.current.rawViewportWidth = initialRawWidth;
    const initialContainerWidthPx = mapContainerWidthPx(map);
    stateRef.current.containerWidthPx = initialContainerWidthPx;

    // If wind data arrived before this effect ran (common on mobile, where
    // wind XHRs can resolve before mapbox reports valid bounds), particles
    // were initialized against the FULL_VIEWPORT default and we'd render
    // PARTICLE_COUNT of them. Reconcile down to the real viewport count now.
    const s = stateRef.current;
    if (s.particles.length > 0) {
      reconcileParticleCount({
        particles: s.particles,
        viewport: initialViewport,
        rawViewportWidth: initialRawWidth,
        containerWidthPx: initialContainerWidthPx,
        grid: s.grid,
        gridMap: s.gridMap,
      });
    }

    const onMove = () => {
      const viewport = mapViewport(map);
      stateRef.current.viewport = viewport;
      const rawWidth = mapRawViewportWidth(map);
      stateRef.current.rawViewportWidth = rawWidth;
      const containerWidthPx = mapContainerWidthPx(map);
      stateRef.current.containerWidthPx = containerWidthPx;
      const s2 = stateRef.current;
      reconcileParticleCount({
        particles: s2.particles,
        viewport,
        rawViewportWidth: rawWidth,
        containerWidthPx,
        grid: s2.grid,
        gridMap: s2.gridMap,
      });
    };
    map.on('zoom', onMove);
    map.on('move', onMove);
    // Mapbox GL auto-resizes on container size changes (internal ResizeObserver) and fires
    // 'resize' — but not 'move'/'zoom' — when only the container size changes at a fixed
    // center/zoom, which would otherwise leave containerWidthPx stale until the next pan/zoom.
    map.on('resize', onMove);
    return () => {
      map.off('zoom', onMove);
      map.off('move', onMove);
      map.off('resize', onMove);
    };
  }, [map]);

  // Clear the overlay when wind data is unavailable (e.g. 404 on dates with no ingest).
  useEffect(() => {
    if (!overlay || wind?.length) return;
    overlay.setProps({ layers: [] });
  }, [wind, overlay]);

  // Rebuild PM2.5 lookup map whenever CAMS grid changes.
  // Uses integer index keys (same 0.4° grid as wind) — O(1) spawn lookup.
  useEffect(() => {
    if (!aqGrid?.length) {
      stateRef.current.gridMap = null;
      return;
    }
    const map = new Map<string, number>();
    for (const p of aqGrid) {
      const lngIdx = Math.round((p.lng - GRID_LNG_MIN) / GRID_STEP_DEG);
      const latIdx = Math.round((p.lat - GRID_LAT_MIN) / GRID_STEP_DEG);
      map.set(`${lngIdx},${latIdx}`, p.pm25);
    }
    stateRef.current.gridMap = map;
    // Recolor existing particles immediately so particles spawned before CAMS
    // loaded don't stay white until they happen to die and respawn.
    for (const p of stateRef.current.particles) {
      p.color = sampleSpawnColor({
        lng: p.lng,
        lat: p.lat,
        grid: stateRef.current.grid,
        gridMap: map,
      });
    }
  }, [aqGrid]);

  // Rebuild grid and reset particles whenever wind data changes.
  useEffect(() => {
    if (!wind?.length) return;
    stateRef.current.grid = buildGrid(wind);
    stateRef.current.particles = initParticles({
      viewport: stateRef.current.viewport,
      rawViewportWidth: stateRef.current.rawViewportWidth,
      containerWidthPx: stateRef.current.containerWidthPx,
      grid: stateRef.current.grid,
      gridMap: stateRef.current.gridMap,
    });
  }, [wind]);

  // Animation loop — runs as long as the overlay, map, and wind data are present.
  // Visibility changes are handled inside the tick to avoid restarting the loop.
  useEffect(() => {
    if (!overlay || !map || !wind?.length) return;
    const ov = overlay; // capture non-null reference for the rAF closure

    let animId: number;
    let lastTime = 0;

    function tick(time: number) {
      const dt = lastTime ? Math.min(time - lastTime, 50) : BASE_STEP_MS;
      lastTime = time;
      stateRef.current.clock += dt;
      // Rebase periodically to keep clock (and every particle's timestamps) far below
      // the float32 precision ceiling TripsLayer reads them at on the GPU — shifting
      // both by the same amount preserves every timestamp's relative age exactly.
      if (stateRef.current.clock > CLOCK_REBASE_MS) {
        const rebaseDelta = stateRef.current.clock;
        stateRef.current.clock = 0;
        for (const p of stateRef.current.particles) {
          for (let i = 0; i < p.pointCount; i++) p.timestamps[trailSlot(p, i)] -= rebaseDelta;
          p.trailStartMs -= rebaseDelta;
        }
      }

      const {
        grid,
        gridMap,
        particles,
        visible,
        opacity,
        viewport,
        rawViewportWidth,
        containerWidthPx,
        clock,
      } = stateRef.current;

      if (!visible || !grid) {
        ov.setProps({ layers: [] });
      } else {
        // Degrees-per-frame scale that keeps on-screen pixel speed constant across zoom and
        // container width: exact inverse of how much pixels-per-degree has changed since the
        // reference calibration (REF_PIXELS_PER_DEGREE).
        const pixelsPerDegree = containerWidthPx / rawViewportWidth;
        const velocityScale = REF_PIXELS_PER_DEGREE / pixelsPerDegree;
        const dtScale = (dt / BASE_STEP_MS) * velocityScale;
        const { trailDurationMs, alpha: dynamicAlpha } = dynamicTrailParams({
          rawViewportWidth,
          containerWidthPx,
        });
        stepParticles({
          particles,
          grid,
          dt,
          dtScale,
          spawnViewport: viewport,
          gridMap,
          trailDurationMs,
          clock,
        });

        const fadeWindowMs = trailDurationMs;
        const buffers = packTrails({
          particles,
          buffers: stateRef.current.trailBuffers,
          clock,
          fadeWindowMs,
          alphaScale: opacity * dynamicAlpha,
          pixelsPerDegree,
        });
        stateRef.current.trailBuffers = buffers;
        const { vertexCount } = buffers;

        const layer = new TripsLayer({
          id: 'wind-particles',
          // Binary attributes (subarray views of the reused buffers, no copy) instead of
          // per-particle accessors: deck.gl reads them directly rather than calling
          // getPath/getColor/... for every particle on every frame.
          data: {
            length: buffers.pathCount,
            startIndices: buffers.startIndices.subarray(0, buffers.pathCount),
            attributes: {
              getPath: { value: buffers.positions.subarray(0, vertexCount * 2), size: 2 },
              getTimestamps: { value: buffers.timestamps.subarray(0, vertexCount), size: 1 },
              getColor: {
                value: buffers.colors.subarray(0, vertexCount * 4),
                size: 4,
                normalized: true,
              },
              getWidth: { value: buffers.widths.subarray(0, vertexCount), size: 1 },
            },
          },
          // Paths are never closed loops; tells deck.gl to skip per-path loop detection.
          _pathType: 'open',
          currentTime: clock,
          trailLength: fadeWindowMs,
          fadeTrail: true,
          capRounded: true,
          jointRounded: true,
          widthUnits: 'pixels',
          parameters: { depthCompare: 'always' as const },
          pickable: false,
        });

        ov.setProps({ layers: [layer] });
      }

      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [overlay, map, wind]);
}

// ─── viewport ─────────────────────────────────────────────────────────────────

function mapViewport(map: mapboxgl.Map): Viewport {
  const b = map.getBounds();
  if (!b) return FULL_VIEWPORT;
  return [
    Math.max(GRID_LNG_MIN, b.getWest() - VIEWPORT_BUFFER_DEG),
    Math.max(GRID_LAT_MIN, b.getSouth() - VIEWPORT_BUFFER_DEG),
    Math.min(GRID_LNG_MAX, b.getEast() + VIEWPORT_BUFFER_DEG),
    Math.min(GRID_LAT_MAX, b.getNorth() + VIEWPORT_BUFFER_DEG),
  ];
}

// Unbuffered visible width (degrees) — used for zoom-based scale calculations
// (dtScale, dynamicTrailLength). Unlike `mapViewport`, this must NOT include
// VIEWPORT_BUFFER_DEG: that fixed-degree pad is negligible at low zoom but
// dominates at village-level zoom (true width can shrink well below the buffer
// itself), which would otherwise stop these ratios from continuing to shrink.
// This value alone conflates zoom with container pixel width — never use it directly
// as a zoom signal. Any new zoom-dependent calculation must go through
// zoomOnlyWidth(rawViewportWidth, containerWidthPx) first; see the "wind particle
// density" gotcha in docs/claude/conventions.md.
function mapRawViewportWidth(map: mapboxgl.Map): number {
  const b = map.getBounds();
  return b ? b.getEast() - b.getWest() : REF_VIEWPORT_DEG_WIDTH;
}

// Real container width (CSS px) — used to derive an exact pixels-per-degree ratio for velocity,
// instead of assuming the REF_CONTAINER_WIDTH_PX the reference calibration was tuned against.
function mapContainerWidthPx(map: mapboxgl.Map): number {
  return map.getContainer().clientWidth || REF_CONTAINER_WIDTH_PX;
}

// rawViewportWidth conflates zoom with container pixel width (it equals
// containerWidthPx × degreesPerPixel(zoom)), so it's not safe to use directly as a
// zoom signal — a narrow/mobile container reads as "zoomed in further" even at the
// same zoom as desktop. This strips the container-width contribution back out,
// leaving a signal that depends only on zoom. See "wind particle density" gotcha in
// docs/claude/conventions.md; this exact bug has regressed twice (bf2f3f2/a4816ce,
// then 41295e3).
function zoomOnlyWidth(rawViewportWidth: number, containerWidthPx: number): number {
  return rawViewportWidth * (REF_CONTAINER_WIDTH_PX / containerWidthPx);
}

// ─── particle helpers ─────────────────────────────────────────────────────────

// Resize an existing particle array in-place to match the count implied by
// the current viewport. Adds fresh particles (with scattered ages so they
// don't all die together) when the viewport grows, truncates when it shrinks.
function reconcileParticleCount({
  particles,
  viewport,
  rawViewportWidth,
  containerWidthPx,
  grid,
  gridMap,
}: {
  particles: Particle[];
  viewport: Viewport;
  rawViewportWidth: number;
  containerWidthPx: number;
  grid: WindGrid | null;
  gridMap: Map<string, number> | null;
}): void {
  const target = viewportParticleCount({ viewport, rawViewportWidth, containerWidthPx });
  if (particles.length < target) {
    for (let i = particles.length; i < target; i++) {
      particles.push(spawnParticle({ viewport, grid, gridMap, scatterAge: true }));
    }
  } else if (particles.length > target) {
    particles.length = target;
  }
}

function initParticles({
  viewport,
  rawViewportWidth,
  containerWidthPx,
  grid,
  gridMap,
}: {
  viewport: Viewport;
  rawViewportWidth: number;
  containerWidthPx: number;
  grid: WindGrid | null;
  gridMap: Map<string, number> | null;
}): Particle[] {
  const count = viewportParticleCount({ viewport, rawViewportWidth, containerWidthPx });
  // scatterAge=true distributes initial ages so they don't all fade out simultaneously
  return Array.from({ length: count }, () =>
    spawnParticle({ viewport, grid, gridMap, scatterAge: true }),
  );
}

export function stepParticles({
  particles,
  grid,
  dt,
  dtScale,
  spawnViewport,
  gridMap,
  trailDurationMs,
  clock,
}: {
  particles: Particle[];
  grid: WindGrid;
  dt: number;
  dtScale: number;
  spawnViewport: Viewport;
  gridMap: Map<string, number> | null;
  trailDurationMs: number;
  clock: number;
}): void {
  for (const p of particles) {
    const [dx, dy] = sampleWind(p.lng, p.lat, grid);
    const cosLat = Math.max(Math.cos((p.lat * Math.PI) / 180), 0.1);

    p.lng += (dx * ANIM_SCALE * dtScale) / cosLat;
    p.lat += dy * ANIM_SCALE * dtScale;

    if (p.pointCount === 0) p.trailStartMs = clock;
    pushTrailPoint(p, clock);
    const speed = Math.sqrt(dx * dx + dy * dy); // == wind_speed_kmh at this cell
    const maxTrailMs =
      speed > TRAIL_SPEED_REF_KMH
        ? trailDurationMs * Math.sqrt(TRAIL_SPEED_REF_KMH / speed)
        : trailDurationMs;
    // Trim by age rather than point count, so trail length doesn't depend on frame rate.
    // Always keeps at least two points so the trail stays a drawable segment.
    const cutoffMs = clock - maxTrailMs;
    while (p.pointCount > 2 && p.timestamps[trailSlot(p, p.pointCount - 1)] < cutoffMs) {
      p.pointCount--;
    }
    p.maxTrailMs = maxTrailMs;
    p.age += dt;

    // OOB against the full static grid bbox — particles live freely across
    // the viewport and only die when they leave the wind-data area entirely.
    // Respawn within the current viewport so density stays high when zoomed in.
    const oob =
      p.lng < GRID_LNG_MIN || p.lng > GRID_LNG_MAX || p.lat < GRID_LAT_MIN || p.lat > GRID_LAT_MAX;

    if (p.age >= p.maxAge || oob) {
      resetParticle(p, { viewport: spawnViewport, grid, gridMap, scatterAge: false });
    }
  }
}

export function viewportParticleCount({
  viewport,
  rawViewportWidth,
  containerWidthPx,
}: {
  viewport: Viewport;
  rawViewportWidth: number;
  containerWidthPx: number;
}): number {
  const [west, south, east, north] = viewport;
  const area = (east - west) * (north - south);
  // zoomWidth (not rawViewportWidth) so this reflects actual zoom, not container width —
  // see zoomOnlyWidth().
  const zoomWidth = zoomOnlyWidth(rawViewportWidth, containerWidthPx);
  // `area` shrinks with the square of zoom (both dimensions shrink as you zoom in), even
  // though on-screen pixel area doesn't. DENSITY_ZOOM_EXPONENT controls how much of that
  // shrinkage gets cancelled — softer than full (2) so density keeps dropping smoothly
  // through the middle zoom range instead of plateauing, but gentler than none (0) so it
  // doesn't thin out as aggressively as the original, uncompensated behavior. Uses
  // zoomWidth (unbuffered), not the padded viewport's (east-west) — that padding
  // dominates at village-level zoom and would otherwise distort this at high zoom.
  const zoomCompensation = (REF_VIEWPORT_DEG_WIDTH / zoomWidth) ** DENSITY_ZOOM_EXPONENT;
  const compensatedArea = area * zoomCompensation;
  const rawCount = (PARTICLE_COUNT * compensatedArea) / REFERENCE_AREA;
  const highZoomT = clamp(
    (HIGH_ZOOM_WIDTH_DEG - zoomWidth) / (HIGH_ZOOM_WIDTH_DEG - HIGH_ZOOM_WIDTH_FLOOR_DEG),
    0,
    1,
  );
  const cap = PARTICLE_COUNT + highZoomT * (MAX_PARTICLE_COUNT - PARTICLE_COUNT);
  return Math.round(clamp(rawCount, 30, cap));
}

export function dynamicTrailParams({
  rawViewportWidth,
  containerWidthPx,
}: {
  rawViewportWidth: number;
  containerWidthPx: number;
}): { trailDurationMs: number; alpha: number } {
  // Uses zoomOnlyWidth (not rawViewportWidth) so trail length/alpha reflect actual
  // zoom, not container width — otherwise narrow/mobile screens render longer,
  // brighter trails than desktop at the same zoom. See zoomOnlyWidth().
  const widthRatio = zoomOnlyWidth(rawViewportWidth, containerWidthPx) / REF_VIEWPORT_DEG_WIDTH;
  // Each point's movement (dtScale, computed separately for velocity) is already
  // pixel-invariant, so keeping the duration constant would render a fixed *pixel*
  // trail everywhere. Trails should instead represent a roughly-fixed *geographic*
  // distance, so duration grows continuously as the viewport narrows (zooming in) —
  // √-damped and capped (like the wind-speed trail scaling in stepParticles) so it can't
  // run away at extreme zoom the way an uncapped 1/widthRatio growth would. Clamped here
  // (not just at its point of use) so the [1, TRAIL_GROWTH_MAX] invariant holds for
  // zoomGrowth itself.
  const zoomGrowth = clamp(Math.sqrt(1 / Math.max(widthRatio, 0.001)), 1, TRAIL_GROWTH_MAX);
  const trailDurationMs = TRAIL_LENGTH * BASE_STEP_MS * zoomGrowth;
  // Derived from the same zoomGrowth signal driving trail length (not a separate,
  // device-independent zoom curve) so alpha and trail length reach "fully ramped"
  // at the same apparent zoom regardless of screen/container size.
  const rampT = (zoomGrowth - 1) / (TRAIL_GROWTH_MAX - 1);
  const alpha = Math.round(
    PARTICLE_START_ALPHA + rampT * (PARTICLE_START_ALPHA_MAX - PARTICLE_START_ALPHA),
  );
  return { trailDurationMs, alpha };
}

interface SpawnOptions {
  viewport: Viewport;
  grid: WindGrid | null;
  gridMap: Map<string, number> | null;
  scatterAge?: boolean;
}

export function spawnParticle(options: SpawnOptions): Particle {
  const p: Particle = {
    lng: 0,
    lat: 0,
    age: 0,
    maxAge: 0,
    positions: new Float32Array(MAX_TRAIL_POINTS * 2),
    timestamps: new Float64Array(MAX_TRAIL_POINTS),
    head: 0,
    pointCount: 0,
    // Both overwritten by stepParticles before this particle ever renders.
    trailStartMs: 0,
    maxTrailMs: TRAIL_LENGTH * BASE_STEP_MS,
    color: [255, 255, 255],
  };
  resetParticle(p, options);
  return p;
}

// Starts a new life for `p` in place, keeping its trail buffers so respawns don't allocate.
function resetParticle(p: Particle, { viewport, grid, gridMap, scatterAge = false }: SpawnOptions) {
  const [west, south, east, north] = viewport;
  p.lng = west + Math.random() * (east - west);
  p.lat = south + Math.random() * (north - south);
  p.maxAge = MIN_AGE_MS + Math.random() * (MAX_AGE_MS - MIN_AGE_MS);
  p.age = scatterAge ? Math.random() * p.maxAge : 0;
  p.pointCount = 0;
  p.color = sampleSpawnColor({ lng: p.lng, lat: p.lat, grid, gridMap });
}

// ─── particle color map ───────────────────────────────────────────────────────

// Per-category particle colors — hand-tuned to be visually distinct, light
// enough to stand out over the CAMS heatmap, and calm enough not to dominate.
// Order mirrors AQI_CATEGORIES in aqiColors.ts (Good → Hazardous).
const PARTICLE_COLORS: [number, number, number][] = [
  [190, 240, 160], // Good              — brighter sage
  [255, 240, 110], // Moderate          — vivid gold
  [255, 185, 70], // Unhealthy (s)     — vivid orange
  [255, 115, 100], // Unhealthy         — coral-red (contrast against red CAMS background)
  [210, 130, 245], // Very unhealthy    — vivid purple
  [240, 80, 120], // Hazardous         — vivid rose
];

// Reuses the existing grid constants (same 0.4° step, same origin) to produce
// an integer index key — avoids floating-point string formatting issues.
function sampleSpawnColor({
  lng,
  lat,
  grid,
  gridMap,
}: {
  lng: number;
  lat: number;
  grid: WindGrid | null;
  gridMap: Map<string, number> | null;
}): [number, number, number] {
  if (!gridMap) return [255, 255, 255];

  const [originLng, originLat] = grid ? traceBack24h(lng, lat, grid) : [lng, lat];

  if (
    originLng < GRID_LNG_MIN ||
    originLng > GRID_LNG_MAX ||
    originLat < GRID_LAT_MIN ||
    originLat > GRID_LAT_MAX
  ) {
    return [255, 255, 255];
  }

  const lngIdx = Math.round((originLng - GRID_LNG_MIN) / GRID_STEP_DEG);
  const latIdx = Math.round((originLat - GRID_LAT_MIN) / GRID_STEP_DEG);
  const pm25 = gridMap.get(`${lngIdx},${latIdx}`);
  if (pm25 === undefined) return [255, 255, 255];
  return pm25ToParticleColor(pm25);
}

function pm25ToParticleColor(pm25: number): [number, number, number] {
  for (let i = 0; i < PM25_CAT_BREAKPOINTS.length; i++) {
    if (pm25 <= PM25_CAT_BREAKPOINTS[i]) return PARTICLE_COLORS[i];
  }
  return PARTICLE_COLORS[PARTICLE_COLORS.length - 1];
}

// ─── grid helpers ─────────────────────────────────────────────────────────────

function traceBack24h(lng: number, lat: number, grid: WindGrid): [number, number] {
  let x = lng;
  let y = lat;
  for (let i = 0; i < TRACE_STEPS; i++) {
    const [dx, dy] = sampleWind(x, y, grid);
    const cosLat = Math.max(Math.cos((y * Math.PI) / 180), 0.1);
    const kmhToDegLng = 1 / (111 * cosLat);
    x -= dx * TRACE_STEP_HOURS * kmhToDegLng;
    y -= dy * TRACE_STEP_HOURS * KMH_TO_DEG_LAT;
  }
  return [x, y];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sampleWind(lng: number, lat: number, grid: WindGrid): [number, number] {
  const li = (lng - GRID_LNG_MIN) / GRID_STEP_DEG;
  const lati = (lat - GRID_LAT_MIN) / GRID_STEP_DEG;
  const l0 = clamp(Math.floor(li), 0, GRID_LNG_COUNT - 2);
  const la0 = clamp(Math.floor(lati), 0, GRID_LAT_COUNT - 2);
  const lf = clamp(li - l0, 0, 1);
  const laf = clamp(lati - la0, 0, 1);

  const i00 = (la0 * GRID_LNG_COUNT + l0) * 2;
  const i10 = (la0 * GRID_LNG_COUNT + l0 + 1) * 2;
  const i01 = ((la0 + 1) * GRID_LNG_COUNT + l0) * 2;
  const i11 = ((la0 + 1) * GRID_LNG_COUNT + l0 + 1) * 2;

  const w00 = (1 - lf) * (1 - laf);
  const w10 = lf * (1 - laf);
  const w01 = (1 - lf) * laf;
  const w11 = lf * laf;

  return [
    grid[i00] * w00 + grid[i10] * w10 + grid[i01] * w01 + grid[i11] * w11,
    grid[i00 + 1] * w00 + grid[i10 + 1] * w10 + grid[i01 + 1] * w01 + grid[i11 + 1] * w11,
  ];
}

export function buildGrid(data: WindReading[]): WindGrid {
  const grid = new Float32Array(GRID_LNG_COUNT * GRID_LAT_COUNT * 2);
  for (const v of data) {
    const lngIdx = Math.round((v.lng - GRID_LNG_MIN) / GRID_STEP_DEG);
    const latIdx = Math.round((v.lat - GRID_LAT_MIN) / GRID_STEP_DEG);
    if (lngIdx < 0 || lngIdx >= GRID_LNG_COUNT || latIdx < 0 || latIdx >= GRID_LAT_COUNT) continue;
    const travelRad = (((v.wind_direction_deg + 180) % 360) * Math.PI) / 180;
    const base = (latIdx * GRID_LNG_COUNT + lngIdx) * 2;
    grid[base] = Math.sin(travelRad) * v.wind_speed_kmh; // dx (east positive)
    grid[base + 1] = Math.cos(travelRad) * v.wind_speed_kmh; // dy (north positive)
  }
  return grid;
}
