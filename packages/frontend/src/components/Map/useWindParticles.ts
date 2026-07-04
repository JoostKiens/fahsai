import { useEffect, useRef } from 'react';
import { TripsLayer } from 'deck.gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { WindReading, PM25GridPoint } from '@thailand-aq/types';
import { VIEWPORT_BBOX } from '@/utils/bbox';
import { PM25_CAT_BREAKPOINTS } from '@/utils/aqiColors';

// ─── constants ────────────────────────────────────────────────────────────────

const PARTICLE_COUNT = 2400;
const TRAIL_LENGTH = 20;
// Exponent applied to widthRatio for particle speed: 1 = fully pixel-invariant speed
// (slows down at high zoom), 0 = speed never eases off with zoom. 0.5 (√) eased off
// too little and felt too fast when zoomed in; tune between 0.5 and 1.
const VELOCITY_ZOOM_DAMPING = 0.75;
// Degrees of movement per frame per km/h of wind speed.
// Combined with REF_VIEWPORT_DEG_WIDTH, a 15 km/h breeze crosses the viewport in ~16 s.
const ANIM_SCALE = 0.0015;
// Below this speed the trail is always at full TRAIL_LENGTH.
// Above it, trail point count shrinks as √(TRAIL_SPEED_REF_KMH / speed) so total
// geographic trail length grows as √speed rather than linearly — preventing
// fast-wind trails from dominating the visual at the expense of animation speed.
const TRAIL_SPEED_REF_KMH = 13;
// Maximum alpha for a fresh particle head (0–255). Trail fades linearly to 0.
const PARTICLE_START_ALPHA = 230;
const PARTICLE_START_ALPHA_MAX = 255;
const BASE_ZOOM = 5.5;
const ZOOM_PLATEAU = 9;
// Viewport lng-degree width at BASE_ZOOM on a reference ~1440px desktop — the viewport width
// against which ANIM_SCALE was tuned. Used to normalise particle velocity so crossing time stays
// consistent regardless of screen width or zoom level.
const REF_VIEWPORT_DEG_WIDTH = 22;
// Trails represent a roughly-fixed geographic distance, so their pixel length
// should grow as you zoom in (more pixels per degree) — capped so it doesn't run
// away at extreme zoom. Starting guess, tune visually.
const TRAIL_GROWTH_MAX = 2;
// Trail stroke width (pixels) tapers from HEAD_WIDTH down to TAIL_WIDTH along each path.
const HEAD_WIDTH = 4;
const TAIL_WIDTH = 0.5;
const MIN_AGE_FRAMES = 80;
const MAX_AGE_FRAMES = 320;

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

interface Particle {
  lng: number;
  lat: number;
  age: number;
  maxAge: number;
  trail: [number, number][];
  timestamps: number[]; // ms clock value at which each trail[i] was recorded, newest first
  color: [number, number, number]; // lightened AQI RGB sampled at spawn
}

// Flat grid: index = latIdx * GRID_LNG_COUNT + lngIdx
// Each cell stores precomputed travel-direction velocity components (km/h).
type WindGrid = Float32Array; // [dx0, dy0, dx1, dy1, ...]

type Viewport = [west: number, south: number, east: number, north: number];

const FULL_VIEWPORT: Viewport = [GRID_LNG_MIN, GRID_LAT_MIN, GRID_LNG_MAX, GRID_LAT_MAX];

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
    zoom: BASE_ZOOM,
    viewport: FULL_VIEWPORT,
    rawViewportWidth: REF_VIEWPORT_DEG_WIDTH,
    clock: 0,
  });

  // Keep config in sync without restarting the animation loop.
  stateRef.current.visible = config.visible;
  stateRef.current.opacity = config.opacity;

  // Track map zoom/viewport for particle spawning and OOB culling.
  useEffect(() => {
    if (!map) return;
    stateRef.current.zoom = map.getZoom();
    const initialViewport = mapViewport(map);
    stateRef.current.viewport = initialViewport;
    stateRef.current.rawViewportWidth = mapRawViewportWidth(map);

    // If wind data arrived before this effect ran (common on mobile, where
    // wind XHRs can resolve before mapbox reports valid bounds), particles
    // were initialized against the FULL_VIEWPORT default and we'd render
    // PARTICLE_COUNT of them. Reconcile down to the real viewport count now.
    const s = stateRef.current;
    if (s.particles.length > 0) {
      reconcileParticleCount({
        particles: s.particles,
        viewport: initialViewport,
        grid: s.grid,
        gridMap: s.gridMap,
      });
    }

    const onMove = () => {
      stateRef.current.zoom = map.getZoom();
      const viewport = mapViewport(map);
      stateRef.current.viewport = viewport;
      stateRef.current.rawViewportWidth = mapRawViewportWidth(map);
      const s2 = stateRef.current;
      reconcileParticleCount({
        particles: s2.particles,
        viewport,
        grid: s2.grid,
        gridMap: s2.gridMap,
      });
    };
    map.on('zoom', onMove);
    map.on('move', onMove);
    return () => {
      map.off('zoom', onMove);
      map.off('move', onMove);
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
      const dt = lastTime ? Math.min(time - lastTime, 50) : 16.67;
      lastTime = time;
      stateRef.current.clock += dt;

      const {
        grid,
        gridMap,
        particles,
        visible,
        opacity,
        zoom,
        viewport,
        rawViewportWidth,
        clock,
      } = stateRef.current;

      if (!visible || !grid) {
        ov.setProps({ layers: [] });
      } else {
        // Both use the raw (unbuffered) visible width, not the padded spawn/OOB
        // viewport — mapViewport()'s fixed VIEWPORT_BUFFER_DEG pad would otherwise
        // dominate and stop these ratios from shrinking further at village-level zoom.
        const widthRatio = rawViewportWidth / REF_VIEWPORT_DEG_WIDTH;
        const dtScale = (dt / 16.67) * Math.pow(widthRatio, VELOCITY_ZOOM_DAMPING);
        const zoomT = smoothstep(BASE_ZOOM, ZOOM_PLATEAU, zoom);
        const dynamicAlpha = Math.round(
          PARTICLE_START_ALPHA + zoomT * (PARTICLE_START_ALPHA_MAX - PARTICLE_START_ALPHA),
        );
        // Each point's movement (dtScale) is already pixel-invariant, so keeping the
        // point count constant would render a fixed *pixel* trail everywhere. Trails
        // should instead represent a roughly-fixed *geographic* distance, so point
        // count grows continuously as the viewport narrows (zooming in) — √-damped
        // and capped (like the wind-speed trail scaling below) so it can't run away
        // at extreme zoom the way an uncapped 1/widthRatio growth would.
        const zoomGrowth = Math.min(TRAIL_GROWTH_MAX, Math.sqrt(1 / Math.max(widthRatio, 0.001)));
        const dynamicTrailLength = Math.round(TRAIL_LENGTH * Math.max(1, zoomGrowth));
        stepParticles({
          particles,
          grid,
          dtScale,
          spawnViewport: viewport,
          gridMap,
          trailLength: dynamicTrailLength,
          clock,
        });

        const fadeWindowMs = dynamicTrailLength * 16.67; // ms-per-point approximation, tuned in Step 3

        const layer = new TripsLayer<Particle>({
          id: 'wind-particles',
          data: particles.filter((p) => p.trail.length >= 2),
          getPath: (p) => p.trail,
          getTimestamps: (p) => p.timestamps,
          currentTime: clock,
          trailLength: fadeWindowMs,
          fadeTrail: true,
          capRounded: true,
          jointRounded: true,
          getColor: (p) => {
            // Speed-truncated (fast-wind) trails span less real time than fadeWindowMs, so
            // TripsLayer's own head-to-tail fade never reaches full transparency for them —
            // scaling the ceiling by how much of the window the trail actually spans turns
            // that into a uniformly dim trail instead of a hard-edged cutoff.
            const span = p.timestamps[0] - p.timestamps[p.timestamps.length - 1];
            const spanFade = Math.min(1, span / fadeWindowMs);
            // Spreading a [number, number, number] tuple and appending a value yields number[],
            // so an explicit tuple cast is required for Deck.gl's typed color accessor.
            return [
              ...p.color,
              Math.round(opacity * dynamicAlpha * (1 - p.age / p.maxAge) * spanFade),
            ] as [number, number, number, number];
          },
          widthUnits: 'pixels',
          // Per-vertex width array (trail[0] is the head): tapers from HEAD_WIDTH down to
          // TAIL_WIDTH so the tail comes to a point rather than staying a uniform stroke.
          getWidth: (p) => {
            const n = p.trail.length;
            return p.trail.map((_, i) => HEAD_WIDTH - ((HEAD_WIDTH - TAIL_WIDTH) * i) / (n - 1));
          },
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
function mapRawViewportWidth(map: mapboxgl.Map): number {
  const b = map.getBounds();
  return b ? b.getEast() - b.getWest() : REF_VIEWPORT_DEG_WIDTH;
}

// ─── particle helpers ─────────────────────────────────────────────────────────

// Resize an existing particle array in-place to match the count implied by
// the current viewport. Adds fresh particles (with scattered ages so they
// don't all die together) when the viewport grows, truncates when it shrinks.
function reconcileParticleCount({
  particles,
  viewport,
  grid,
  gridMap,
}: {
  particles: Particle[];
  viewport: Viewport;
  grid: WindGrid | null;
  gridMap: Map<string, number> | null;
}): void {
  const target = viewportParticleCount(viewport);
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
  grid,
  gridMap,
}: {
  viewport: Viewport;
  grid: WindGrid | null;
  gridMap: Map<string, number> | null;
}): Particle[] {
  const count = viewportParticleCount(viewport);
  // scatterAge=true distributes initial ages so they don't all fade out simultaneously
  return Array.from({ length: count }, () =>
    spawnParticle({ viewport, grid, gridMap, scatterAge: true }),
  );
}

function stepParticles({
  particles,
  grid,
  dtScale,
  spawnViewport,
  gridMap,
  trailLength,
  clock,
}: {
  particles: Particle[];
  grid: WindGrid;
  dtScale: number;
  spawnViewport: Viewport;
  gridMap: Map<string, number> | null;
  trailLength: number;
  clock: number;
}): void {
  for (const p of particles) {
    const [dx, dy] = sampleWind(p.lng, p.lat, grid);
    const cosLat = Math.max(Math.cos((p.lat * Math.PI) / 180), 0.1);

    p.lng += (dx * ANIM_SCALE * dtScale) / cosLat;
    p.lat += dy * ANIM_SCALE * dtScale;

    p.trail.unshift([p.lng, p.lat]);
    p.timestamps.unshift(clock);
    const speed = Math.sqrt(dx * dx + dy * dy); // == wind_speed_kmh at this cell
    const maxTrail =
      speed > TRAIL_SPEED_REF_KMH
        ? Math.max(2, Math.round(trailLength * Math.sqrt(TRAIL_SPEED_REF_KMH / speed)))
        : trailLength;
    if (p.trail.length > maxTrail) p.trail.length = maxTrail;
    if (p.timestamps.length > maxTrail) p.timestamps.length = maxTrail;
    p.age++;

    // OOB against the full static grid bbox — particles live freely across
    // the viewport and only die when they leave the wind-data area entirely.
    // Respawn within the current viewport so density stays high when zoomed in.
    const oob =
      p.lng < GRID_LNG_MIN || p.lng > GRID_LNG_MAX || p.lat < GRID_LAT_MIN || p.lat > GRID_LAT_MAX;

    if (p.age >= p.maxAge || oob) {
      const fresh = spawnParticle({ viewport: spawnViewport, grid, gridMap, scatterAge: false });
      p.lng = fresh.lng;
      p.lat = fresh.lat;
      p.age = 0;
      p.maxAge = fresh.maxAge;
      p.trail = [];
      p.timestamps = [];
      p.color = fresh.color;
    }
  }
}

function viewportParticleCount(viewport: Viewport): number {
  const [west, south, east, north] = viewport;
  const area = (east - west) * (north - south);
  // `area` shrinks with the square of zoom (both dimensions shrink as you zoom in),
  // even though on-screen pixel area doesn't — left alone, that silently drops
  // particle density as you zoom in. Cancel it out the same way dtScale keeps
  // movement speed pixel-invariant, so density stays roughly constant across zoom
  // instead (this recovers exactly today's behavior at the reference zoom, since
  // the compensation factor is 1 there).
  const zoomCompensation = (REF_VIEWPORT_DEG_WIDTH / (east - west)) ** 2;
  const compensatedArea = area * zoomCompensation;
  return Math.max(
    30,
    Math.min(PARTICLE_COUNT, Math.round((PARTICLE_COUNT * compensatedArea) / REFERENCE_AREA)),
  );
}

function spawnParticle({
  viewport,
  grid,
  gridMap,
  scatterAge = false,
}: {
  viewport: Viewport;
  grid: WindGrid | null;
  gridMap: Map<string, number> | null;
  scatterAge?: boolean;
}): Particle {
  const [west, south, east, north] = viewport;
  const lng = west + Math.random() * (east - west);
  const lat = south + Math.random() * (north - south);
  const maxAge = MIN_AGE_FRAMES + Math.floor(Math.random() * (MAX_AGE_FRAMES - MIN_AGE_FRAMES + 1));
  return {
    lng,
    lat,
    age: scatterAge ? Math.floor(Math.random() * maxAge) : 0,
    maxAge,
    trail: [],
    timestamps: [],
    color: sampleSpawnColor({ lng, lat, grid, gridMap }),
  };
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

function buildGrid(data: WindReading[]): WindGrid {
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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
