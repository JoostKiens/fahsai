# Use cases — who uses Fahsai and why

Revised July 2026, following research into Thai government platforms in this space,
**and corrected August 2026** after identifying that SERVIR's Southeast Asia Air
Quality Tracker (aq-tracker-servir.adpc.net) already has feature parity on layers
(wind, modeled PM2.5, ground stations, fires) — see "Context: the competitive
landscape" below for what actually differentiates Fahsai now.

**Not a target audience:** general public / tourists. Existing Thai government tools
(Check Phoon, Air4Thai) already serve the "should I wear a mask today" use case well.
Fahsai's value is in cross-border attribution and historical/scientific context, not
personal daily-decision-making.

**Core throughline (revised):** every persona below shares the same underlying
problem — data produced by a single national government agency is politically loaded
and can be dismissed as biased by the other countries involved (Thailand, Myanmar,
Laos, Cambodia). Fahsai's original pitch was "neutrality + cross-border completeness
in one place, which no government platform can replicate by definition." That claim
no longer fully holds: SERVIR's tracker (NASA/USAID + ADPC + Thai PCD) already
combines fire, wind, and PM2.5 layers publicly, with credible institutional backing.
Fahsai's actual differentiation is now **UX clarity + historical/baseline context +
causal explanation** — see below — not layer coverage or "nobody else combines
these" as previously framed.

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

## Context: the competitive landscape (corrected August 2026)

Research into Thai government platforms (July 2026) found no domestic government
equivalent to Fahsai. The closest domestic tool is "One Map" (Ministry of Digital
Economy and Society, announced April 2026) — as reported it is domestic-only,
internal/government-facing, and has no explicit wind-pattern layer.

**Correction:** the original version of this doc also claimed no tool publicly
combined fire + wind + PM2.5 in one cross-border view. That's wrong. SERVIR's
Southeast Asia Air Quality Tracker (aq-tracker-servir.adpc.net) — the expansion of
the PCD/USAID/NASA/SERVIR-ADPC Mekong Air Quality Explorer — already does this:
modeled PM2.5 heatmap, wind streamlines, fire hotspots (red markers), and station
readings, all in one public map covering mainland Southeast Asia and beyond. So
layer-coverage parity already exists from a credible, government-affiliated source.

**What actually differentiates Fahsai from SERVIR's tracker, based on direct
comparison:**

- **UX clarity.** SERVIR's tracker is functional but visually dense — overlapping
  numbered station circles, no visible historical scrubber, cluttered unlabeled
  legend. This is a real, non-cosmetic gap for personas needing something scannable
  fast (journalists on deadline, provincial officials checking daily).
- **Historical scrubber + seasonal baseline.** No evidence SERVIR's tracker supports
  "is this normal for late April" — Fahsai's per-station climatology (median,
  p25–p75 bands) is a distinct capability, not a UX variant.
- **"Explain This" causal reasoning.** An LLM-generated plain-language explanation
  tied to back-trajectory + fire-pressure scoring has no equivalent spotted in
  SERVIR's tracker.
- **Institutional entanglement, cuts both ways.** SERVIR is NASA/USAID/ADPC/PCD —
  credible for a diplomat wanting "official" data, but not indie/civic-neutral in
  the way a single non-affiliated developer's tool is. For the NGO/advocacy persona
  specifically, zero institutional entanglement may still be a genuine advantage.
- **Continuity risk favors Fahsai.** SERVIR's operational continuity was flagged as
  uncertain given 2025 USAID funding disruptions (not independently reconfirmed for
  2026). A tool exposed to US foreign-aid funding volatility is a real reason a
  journalist or NGO might prefer one that isn't.

**Roadmap implication:** this weakens the case for prioritizing spatial-resolution
work (which mostly closes a layer/precision gap SERVIR may already not have,
pending a closer look at its actual resolution) relative to doubling down on UX
clarity, the historical/baseline feature, and causal explanation — the things
SERVIR's tracker doesn't appear to have regardless of layer parity.
