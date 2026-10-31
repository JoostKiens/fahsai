# Architecture decision records

Each record explains one decision that would otherwise look arbitrary: the context, what was
chosen, the alternatives, and what it costs. Records 0003–0006 were written after the fact, from
migrations, commit history and measurements. For how the pieces fit together, start with
[docs/architecture.md](../architecture.md).

| ADR                                                          | Decision                                                                | Status   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- | -------- |
| [0001](0001-two-pass-ingest-schedule.md)                     | Ingest schedule: single-pass CAMS, two-pass OpenAQ                      | Accepted |
| [0002](0002-i18n-thai-language.md)                           | i18n architecture for Thai                                              | Accepted |
| [0003](0003-plain-lat-lng-no-postgis.md)                     | Store coordinates as plain lat/lng, not PostGIS                         | Accepted |
| [0004](0004-backend-only-db-access-and-redis-cache-aside.md) | All database access through the backend, with a Redis cache-aside layer | Accepted |
| [0005](0005-140-day-retention.md)                            | Keep 140 days of data, sized to the free-tier database cap              | Accepted |
| [0006](0006-upstash-failures-fail-open.md)                   | Upstash failures fail open                                              | Accepted |
| [0007](0007-astro-frontend.md)                               | Build the frontend with Astro                                           | Accepted |

New records take the next number and use the same sections: Context, Decision, Alternatives
considered, Consequences. A record that's replaced stays here with its status set to
"Superseded by NNNN".
