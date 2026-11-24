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
    // Same hour as ingest-cams, which reads the Copernicus ADS and uses no Open-Meteo calls. The
    // fallback CAMS job (03:00) is the only other user of Open-Meteo's per-IP calls (5k/hour, 10k/day).
    deploy: { cronSchedule: "0 23 * * *", restartPolicyType: "NEVER" },
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
    deploy: { cronSchedule: "0 2 * * *", restartPolicyType: "NEVER" },
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

  // The latest hourly station values for the city footprints, then the hourly city blend (JOO-140).
  // At :45 every live OpenAQ location has the hour that just ended (JOO-142). One run is ~160
  // calls over ~3 minutes, so it never shares a minute with the daily passes at :00. A new service
  // has no values to preserve, so it references the shared variables and pass 1's OpenAQ key.
  const ingestStationReadingsHourly = service("ingest-station-readings-hourly", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:station-readings-hourly",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "45 * * * *", restartPolicyType: "NEVER" },
    env: {
      NODE_ENV: ctx.shared.NODE_ENV,
      ROLLBAR_TOKEN: ctx.shared.ROLLBAR_TOKEN,
      SUPABASE_SERVICE_ROLE_KEY: ctx.shared.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_URL: ctx.shared.SUPABASE_URL,
      OPENAQ_API_KEY: ingestStationReadingsPass1.env.OPENAQ_API_KEY,
    },
  });
  const ingestFallbackCams = service("ingest-fallback-cams", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:cams:today:fallback",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "0 3 * * *", restartPolicyType: "NEVER" },
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
    env: { ...sharedEnv, ADS_API_KEY: preserve() },
  });
  // CAMS runs appear on the ADS 9.7 to 10.4 h after the run time (JOO-142): 11:30 and 23:30 UTC
  // catch the 00 and 12 UTC runs, and the slot an hour later retries a run that was late. The
  // half hour keeps it clear of ingest-cams (23:00), which uses the same ADS key and queue. A slot
  // whose run is already stored does nothing. A new service has no values to preserve, so it
  // references the shared variables and ingest-cams's ADS key.
  const ingestCityCams = service("ingest-city-cams", {
    source: fahsai,
    build,
    start: "pnpm --filter backend run railway:ingest:city-cams",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { cronSchedule: "30 0,11,12,23 * * *", restartPolicyType: "NEVER" },
    env: {
      NODE_ENV: ctx.shared.NODE_ENV,
      ROLLBAR_TOKEN: ctx.shared.ROLLBAR_TOKEN,
      SUPABASE_SERVICE_ROLE_KEY: ctx.shared.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_URL: ctx.shared.SUPABASE_URL,
      ADS_API_KEY: ingestCams.env.ADS_API_KEY,
    },
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
    resources: [ingestFires, ingestStations, ingestStationBaseline, prune, ingestWeatherReadings, ingestStationReadingsPass2, APIServer, ingestWeatherReadingsFallback, ingestStationFirePressure, ingestStationReadingsPass1, ingestStationReadingsHourly, ingestFallbackCams, ingestCams, ingestCityCams, pipelineHealth],
  });
});
