import { defineRailway, github, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const fahsai = github("JoostKiens/fahsai", { checkSuites: false });

  const ingestFires = service("ingest-fires", {
    source: fahsai,
    start: "pnpm --filter backend run railway:ingest:fires",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 10 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "firms-ingest" },
    env: { FIRMS_MAP_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() },
  });
  const ingestStations = service("ingest-stations", {
    source: fahsai,
    start: "pnpm --filter backend run railway:ingest:stations",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 22 4 * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "stations-ingest" },
    env: { FIRMS_MAP_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() },
  });
  const ingestStationBaseline = service("ingest-station-baseline", {
    source: fahsai,
    start: "pnpm --filter backend railway:ingest:station-baseline",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "40 4 * * *", restartPolicyType: "NEVER" },
    env: { FIRMS_MAP_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() },
  });
  const prune = service("prune", {
    source: fahsai,
    start: "pnpm --filter backend run railway:prune",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 2 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "prune-72b5" },
    env: { FIRMS_MAP_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() },
  });
  const ingestWeatherReadings = service("ingest-weather-readings", {
    source: fahsai,
    start: "pnpm --filter backend run railway:ingest:weather:today",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 2 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "wind-ingest" },
    env: { FIRMS_MAP_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() },
  });
  const ingestStationReadingsPass2 = service("ingest-station-readings pass 2", {
    source: fahsai,
    start: "pnpm --filter backend run railway:ingest:station-readings",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 4 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "aqi-ingest" },
    env: { FIRMS_MAP_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() },
  });
  const APIServer = service("API server", {
    source: fahsai,
    build: "pnpm install --frozen-lockfile",
    start: "pnpm --filter backend run start",
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    replicas: { "asia-southeast1-eqsg3a": 1 },
    networking: { privateNetworkEndpoint: "thailand-air-quality-map" },
    env: { FIRMS_MAP_KEY: preserve(), GEMINI_API_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), ROLLBAR_TOKEN: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() },
  });
  const ingestWeatherReadingsFallback = service("ingest-weather-readings-fallback", {
    source: fahsai,
    start: "pnpm --filter backend run railway:ingest:weather:today:fallback",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 4 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "weather-readings-ingest-fallback" },
    env: { FIRMS_MAP_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() },
  });
  const ingestStationFirePressure = service("ingest-station-fire-pressure", {
    source: fahsai,
    start: "pnpm --filter backend railway:ingest:station-fire-pressure",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "30 4 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "station-fire-pressure-ingest" },
    env: { FIRMS_MAP_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() },
  });
  const ingestStationReadingsPass1 = service("ingest-station-readings pass 1", {
    source: fahsai,
    start: "pnpm --filter backend run railway:ingest:station-readings:today",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 23 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "aqi-ingest-pass-1" },
    env: { FIRMS_MAP_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() },
  });
  const ingestFallbackCams = service("ingest-fallback-cams", {
    source: fahsai,
    start: "pnpm --filter backend run railway:ingest:cams:today:fallback",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 1 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "cams-ingest-fallback" },
    env: { FIRMS_MAP_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() },
  });
  const ingestCams = service("ingest-cams", {
    source: fahsai,
    start: "pnpm --filter backend run railway:ingest:cams:today",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 23 * * *", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "aq-ingest-72f6" },
    env: { FIRMS_MAP_KEY: preserve(), NODE_ENV: preserve(), OPENAQ_API_KEY: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve(), UPSTASH_REDIS_REST_TOKEN: preserve(), UPSTASH_REDIS_REST_URL: preserve() },
  });

  return project("fahsai", {
    resources: [ingestFires, ingestStations, ingestStationBaseline, prune, ingestWeatherReadings, ingestStationReadingsPass2, APIServer, ingestWeatherReadingsFallback, ingestStationFirePressure, ingestStationReadingsPass1, ingestFallbackCams, ingestCams],
  });
});
