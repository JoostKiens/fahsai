# Fahsai

[![CI](https://github.com/JoostKiens/fahsai/actions/workflows/ci.yml/badge.svg)](https://github.com/JoostKiens/fahsai/actions) [![License](https://img.shields.io/badge/license-Apache%202.0%20%2B%20Commons%20Clause-blue)](LICENSE.md) [![Live Demo](https://img.shields.io/badge/live%20demo-open-green)](https://fahsai.fyi) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![pnpm](https://img.shields.io/badge/pnpm-monorepo-f69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

---

![Thailand Air Quality Map showing fires, PM2.5 heatmap, and wind patterns over Southeast Asia](docs/assets/img/app-screenshot-2026-05-21.png)

---

Thailand's dry season air quality is severe and its causes are genuinely complex — fires, agriculture, industry, transport, geography, wind. This map puts the available data in one place so you can look at it yourself.

NASA VIIRS fire detections, Open-Meteo wind vectors, OpenAQ ground stations, and the CAMS atmospheric PM2.5 model, updated daily. A time scrubber lets you step back through up to 90 days of historical data. Available in English and Thai. Free, no login, mobile-friendly.

---

## Map layers

| Layer           | What it shows                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------ |
| PM2.5 heatmap   | CAMS atmospheric model at 0.4° resolution, bilinearly interpolated and rendered via a Web Worker |
| PM2.5 stations  | OpenAQ ground measurements, colored by US EPA AQI thresholds                                     |
| Fire detections | NASA VIIRS active fire points, sized by Fire Radiative Power (FRP)                               |
| Wind particles  | Animated flow field from Open-Meteo                                                              |
| Power plants    | WRI coal, gas, and oil plants across Thailand, Myanmar, Laos, and Cambodia                       |

Click any element on the map to open the info panel:

- **Station** — current PM2.5 reading, AQI category, measurement time, 5-day daily PM2.5 bar chart with a per-day weather table (wind, precipitation, humidity), and an "Explain this" button
- **Fire detection** — FRP intensity, detection confidence, day/night flag, detection time, and nearby ambient modelled PM2.5 and wind
- **Power plant** — fuel type, capacity (MW), owner, commissioned year, and nearby ambient modelled PM2.5 and wind

All panels show the reverse-geocoded place name and country flag for the clicked location.

---

## Time scrubber

The bottom slider steps through the selected history window. Press **Play** (or hit **Space**) to animate through dates automatically at 800 ms per step.

The history window — 30, 60, or 90 days — is configurable in Settings and persisted across sessions. New data is typically available by 06:30 Bangkok time each morning.

Map position, zoom, and selected date are reflected in the URL, so any view is fully shareable.

---

## How the AI explanation works

Click any monitoring station and hit "What is causing this?" The backend assembles a spatial context snapshot and streams an explanation from Gemini 3.1 Flash Lite.

The model sees more than just the PM2.5 number. It gets the 5-day daily trend, current wind speed and direction, and fires discovered via a 72-hour backward trajectory: the backend runs a 5-member backward trajectory ensemble — tracing the air mass from the station and four cardinal offsets, stepping back in 6-hour increments over 72 hours using stored wind grids. Fires within the combined footprint of all five paths are then scored by FRP, recency, and proximity to the trajectory corridor. A pre-computed daily grid of 14-day cumulative fire pressure (fire count and total FRP per 0.4° cell) is used to quantify fire influence along the transport path, so recent high-intensity clusters near the trajectory carry more weight than distant or weak fires. Major cities, industrial zones, and power plants near the trajectory footprint are also evaluated as upwind emission sources — each scored by population or emission proxy and proximity to the center path, and filtered to those whose bearing from the station aligns with the current wind direction. It also gets the distance-weighted mean PM2.5 from all peer stations within 75 km that have reported in the last 24 hours.

When a station reads at least twice — or less than 40% of — the distance-weighted mean of nearby stations, the trajectory, fire, and CAMS sections are dropped from the model's context entirely; the explanation focuses on the anomaly and its most likely causes rather than regional transport. When the reading is consistent with the regional picture, transport and fire evidence take the foreground.

There's a shared daily quota of 500 requests per Bangkok calendar day. When it runs out, the button is disabled.

---

## Data

| Source                                                           | What                                        | Cadence | License        |
| ---------------------------------------------------------------- | ------------------------------------------- | ------- | -------------- |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) (VIIRS/SNPP) | Fire detections — location, FRP, confidence | Daily   | NASA open data |
| [OpenAQ](https://openaq.org/) v3                                 | PM2.5 ground stations                       | Daily   | CC BY 4.0      |
| [Open-Meteo](https://open-meteo.com/)                            | Wind grid + CAMS PM2.5 atmospheric model    | Daily   | CC BY 4.0      |
| [WRI Global Power Plant Database](https://resourcewatch.org/)    | Coal, gas, oil, diesel power plants         | Static  | CC BY 4.0      |
| [Mapbox](https://www.mapbox.com/)                                | Base map                                    | —       | Mapbox TOS     |

---

## Stack

**Frontend:** React 18 · TypeScript · Vite · Mapbox GL JS · Deck.gl · Zustand · TanStack Query v5 · Web Workers (PM2.5 canvas rendering) · react-i18next

**Backend:** Node.js 20 · Fastify · Supabase (PostgreSQL) · Upstash Redis · Google Gemini API

**Deployment:** Vercel (frontend) · Railway (backend + cron jobs)

---

## License

[Apache 2.0 + Commons Clause](LICENSE.md) — non-commercial use.

---

## Development

See [CLAUDE.md](CLAUDE.md) for local setup, environment variables, database schema, API reference, and ingestion job docs.

Issues welcome.
