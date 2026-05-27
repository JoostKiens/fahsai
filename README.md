# Fahsai

[![CI](https://github.com/JoostKiens/fahsai/actions/workflows/ci.yml/badge.svg)](https://github.com/JoostKiens/fahsai/actions) [![License](https://img.shields.io/badge/license-Apache%202.0%20%2B%20Commons%20Clause-blue)](LICENSE.md) [![Live Demo](https://img.shields.io/badge/live%20demo-open-green)](https://fahsai.fyi) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![pnpm](https://img.shields.io/badge/pnpm-monorepo-f69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

---

![Thailand Air Quality Map showing fires, PM2.5 heatmap, and wind patterns over Southeast Asia](docs/assets/img/app-screenshot-2026-05-21.png)

---

Thailand's dry season air quality is severe and its causes are genuinely complex — fires, agriculture, industry, transport, geography, wind. This map puts the available data in one place so you can look at it yourself.

NASA VIIRS fire detections, Open-Meteo wind vectors, OpenAQ ground stations, and the CAMS atmospheric PM2.5 model, updated daily. A 30-day time scrubber lets you move through a smoke event day by day. Free, no login.

---

## How the AI explanation works

Click any monitoring station and hit "Explain this." The backend assembles a spatial context snapshot and streams an explanation from Gemini 3.1 Flash Lite.

The model sees more than just the PM2.5 number. It gets the 7-day daily trend, current wind speed and direction, and every active fire within a dynamic radius — calm conditions: 50 km; when it's windy: wind speed × 36 hours, capped at 300 km — with each fire's quadrant, distance, and fire radiative power. It also gets the median reading from all peer stations within 75 km that have reported in the last 3 hours.

The spatial reasoning is the interesting part. If the station is reading 2× higher than its neighbors, the model treats it as a local anomaly and won't spin a cross-border fire narrative. If the upwind quadrant is full of high-FRP fires and the regional median confirms it, that's what the explanation leads with.

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

**Frontend:** React 18 · TypeScript · Vite · Mapbox GL JS · Deck.gl · Zustand · TanStack Query v5

**Backend:** Node.js 20 · Fastify · Supabase (PostgreSQL) · Upstash Redis · Google Gemini API

**Deployment:** Vercel (frontend) · Railway (backend + cron jobs)

---

## License

[Apache 2.0 + Commons Clause](LICENSE.md) — non-commercial use.

---

## Development

See [CLAUDE.md](CLAUDE.md) for local setup, environment variables, database schema, API reference, and ingestion job docs.

Issues welcome.
