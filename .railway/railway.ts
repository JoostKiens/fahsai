import { defineRailway, github, preserve, project, service } from "railway/iac";

export default defineRailway((ctx) => {
  const fahsai = github("JoostKiens/fahsai", { checkSuites: false });

  // Hand-written: `railway config pull` would inline this back into every service.
  const sharedEnv = { FIRMS_MAP_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), ROLLBAR_TOKEN: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() };

  // The backend runs from source (tsx) and has no build script. Railway's default build is the root
  // `pnpm run build`, which builds the frontend too: slow, and it fails whenever the frontend does.
  const build = "pnpm install --frozen-lockfile";

  const ingestFires = service("ingest-fires", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:fires",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 10,23 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "firms-ingest" },
    env: sharedEnv,
  });
  const ingestStations = service("ingest-stations", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:stations",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 22 4 * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "stations-ingest" },
    env: sharedEnv,
  });
  const ingestStationBaseline = service("ingest-station-baseline", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:station-baseline",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "40 4 * * *", restartPolicyType: "NEVER" },
    env: sharedEnv,
  });
  const prune = service("prune", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:prune",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 2 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "prune-72b5" },
    env: sharedEnv,
  });
  const ingestWeatherReadings = service("ingest-weather-readings", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:weather:today",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    // Half an hour after ingest-cams: both call Open-Meteo, whose rate limits are per IP.
    deploy: { cronSchedule: "30 23 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "wind-ingest" },
    env: sharedEnv,
  });
  const ingestStationReadingsPass2 = service("ingest-station-readings pass 2", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:station-readings",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 4 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "aqi-ingest" },
    env: sharedEnv,
  });
  const APIServer = service("API server", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run start",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    networking: { privateNetworkEndpoint: "thailand-air-quality-map" },
    env: { ...sharedEnv, GEMINI_API_KEY: preserve() },
  });
  const ingestWeatherReadingsFallback = service("ingest-weather-readings-fallback", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:weather:today:fallback",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "30 1 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "weather-readings-ingest-fallback" },
    env: sharedEnv,
  });
  const ingestStationFirePressure = service("ingest-station-fire-pressure", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:station-fire-pressure",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "30 4 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "station-fire-pressure-ingest" },
    env: sharedEnv,
  });
  const ingestStationReadingsPass1 = service("ingest-station-readings pass 1", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:station-readings:today",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 23 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "aqi-ingest-pass-1" },
    env: sharedEnv,
  });
  const ingestFallbackCams = service("ingest-fallback-cams", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:cams:today:fallback",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 1 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "cams-ingest-fallback" },
    env: sharedEnv,
  });
  const ingestCams = service("ingest-cams", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:cams:today",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 23 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "aq-ingest-72f6" },
    env: sharedEnv,
  });

  // After the last ingest touching yesterday's data (baseline, 04:40 UTC). References the shared
  // variables instead of preserve(): a new service has no values to preserve, and an empty env
  // would leave the monitor itself failing silently.
  const pipelineHealth = service("pipeline-health", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:pipeline-health",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 6 * * *", restartPolicyType: "NEVER" },
    env: {
      NODE_ENV: ctx.shared.NODE_ENV,
      ROLLBAR_TOKEN: ctx.shared.ROLLBAR_TOKEN,
      SUPABASE_SERVICE_ROLE_KEY: ctx.shared.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_URL: ctx.shared.SUPABASE_URL,
      API_BASE_URL: preserve(),
      HEALTHCHECK_PING_URL: preserve(),
    },
  });

  return project("fahsai", {
    resources: [ingestFires, ingestStations, ingestStationBaseline, prune, ingestWeatherReadings, ingestStationReadingsPass2, APIServer, ingestWeatherReadingsFallback, ingestStationFirePressure, ingestStationReadingsPass1, ingestFallbackCams, ingestCams, pipelineHealth],
  });
});
