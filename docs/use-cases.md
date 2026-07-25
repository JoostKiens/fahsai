# Use cases — who uses Fahsai and why

Revised July 2026, following research into Thai government platforms in this space
(see "on the horizon" — no direct government equivalent exists; see below for why
that matters to positioning).

**Not a target audience:** general public / tourists. Existing Thai government tools
(Check Phoon, Air4Thai) already serve the "should I wear a mask today" use case well.
Fahsai's value is in cross-border attribution and historical/scientific context, not
personal daily-decision-making.

**Core throughline:** every persona below has the same underlying problem — data
produced by a single national government agency is politically loaded and can be
dismissed as biased by the other countries involved (Thailand, Myanmar, Laos,
Cambodia). Fahsai's value proposition in every case is **neutrality + cross-border
completeness in one place**. No announced or existing government platform can
replicate this by definition, since each is produced by a party with a stake in the
blame narrative.

---

## Researchers / scientists

**Problem:** Cross-border atmospheric transport data is scattered across NASA FIRMS,
OpenAQ, and national met services — nobody has stitched them into one queryable,
historically-scrubbable dataset for mainland Southeast Asia specifically.

**Use cases:**

- Pulling multi-year seasonal baselines per station to study whether burning-season
  severity is trending up or down
- Using the 72-hour back-trajectory + fire-pressure scoring as a lightweight
  alternative to running their own HYSPLIT trajectories for a quick sanity check
- Citing Fahsai's open data/methodology in papers on regional haze attribution
- Forest-restoration researchers (e.g. FORRU) cross-referencing fire proximity
  against reforestation site health

**Would help:** API or CSV export, a methodology page explaining the trajectory
ensemble math, DOI-able snapshots for citation.

---

## Journalists

**Problem:** Writing a haze story usually means either taking a government agency's
word for it (which may downplay cross-border sources for diplomatic reasons) or
manually cross-referencing FIRMS hotspot maps against wind data by hand — most
journalists don't have time for the latter.

**Use cases:**

- Grabbing a screenshot showing fires in Myanmar/Laos + wind blowing toward a Thai
  city on a specific bad-AQI day, as visual evidence for a story
- Using the historical scrubber to pull up context (e.g. "was this actually the
  worst March in 5 years")
- Using "Explain This" output as a quotable, plain-language causal explanation
  instead of having to interpret raw PM2.5 numbers themselves
- Relying on the neutral, non-blame framing so they're not accused of taking sides
  in a politically sensitive story (Thailand–Myanmar relations, agricultural
  burning bans)

**Would help:** embeddable/shareable chart images, a "permalink to this exact
date + view" feature (URL state already supports part of this).

---

## National policymakers

**Problem:** Domestic political pressure to "do something" about haze, but often
only ground-station or single-country data to work with — making it hard to make
the diplomatic case that a meaningful share of PM2.5 is transboundary, or
conversely to know when it genuinely isn't (domestic agricultural/urban burning).

**Use cases:**

- Referencing Fahsai during CLEAR Sky Strategy negotiations or ASEAN haze-agreement
  discussions as neutral third-party evidence — data from any one government
  agency (Thai, Lao, Myanmar) is inherently suspect to the others
- Understanding seasonal timing to plan burning bans or public health advisories
- Distinguishing "regional transport" days from "local source" days (already
  flagged via the peer-station comparison in "Explain This") to target the right
  policy lever

---

## Provincial / sub-national officials (e.g. Chiang Mai, Chiang Rai)

**Problem:** National tools (e.g. the government's "One Map" platform) are
internal/domestic dashboards they may not have access to. They need fast, daily
operational answers — is today bad, is it going to get worse, is it "our" burning
or someone else's smoke — to decide things like school closures or health
warnings.

**Use cases:**

- Daily/weekly check of station readings + baseline comparison ("is this unusually
  bad for this time of year") to calibrate public messaging
- Checking wind direction to anticipate whether smoke is inbound over the next day
- Using fire-pressure scores near their province to gauge local vs. transported
  smoke, informing resource allocation (firefighting vs. public health response)

More operational, day-to-day use than national policymakers — this persona is
distinct from national policymakers even though both are "government."

---

## NGOs / regional civil society / diplomatic-adjacent actors

**Problem:** They need credible, source-agnostic evidence to support cross-border
environmental advocacy or diplomacy, but data from a single national government is
politically loaded and can be dismissed as biased by the other countries involved.

**Use cases:**

- Embassy environment attachés building briefing materials for their home
  government using a tool that isn't Thai-, Myanmar-, or Lao-government-branded
- ASEAN-adjacent bodies referencing Fahsai in haze-cooperation reporting (a similar
  role to the Mekong Air Quality Explorer, but more visually accessible)
- Regional civil-society orgs using the visual "smoke has a source" framing for
  public advocacy campaigns without explicitly blaming a specific country (the
  framing is structural/wind-driven, not accusatory)

---

## Context: why no government tool fills this gap

Research into Thai government platforms (July 2026) found no direct government
equivalent to Fahsai. The closest is "One Map" (Ministry of Digital Economy and
Society, announced April 2026) — but as reported it is domestic-only, internal/
government-facing, and has no explicit wind-pattern layer. Existing tools split
the functions Fahsai unifies: GISTDA leads on satellite hotspots (regional in
scope), PCD leads on ground PM2.5 (mostly domestic), and the Mekong Air Quality
Explorer (PCD + USAID + NASA/SERVIR-ADPC) is the closest existing cross-border
PM2.5 tool but lacks Fahsai's combined fire + wind + PM2.5 public visualization
and source-attribution framing.

This reinforces rather than undermines the persona list above: every listed user
needs cross-border completeness and neutrality that no single-government tool can
offer by construction.
