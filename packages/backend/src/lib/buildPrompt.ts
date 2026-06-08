import type { ScientificContext, TierSource } from './buildScientificContext.js';
import { pm25Cat, firePressureLabel } from './buildScientificContext.js';

// ----------------------------------------------------------------
// Source formatting helper
// ----------------------------------------------------------------

function sourceDetail(s: TierSource): string {
  if (s.type === 'city') return `pop. ${((s.population ?? 0) / 1e6).toFixed(1)}M`;
  if (s.type === 'industrial') return 'industrial zone';
  return `${s.capacityMw ?? '?'} MW ${s.type.replace('_plant', '')} plant`;
}

// ----------------------------------------------------------------
// Scientific data block
// ----------------------------------------------------------------

function buildScientificDataBlock(ctx: ScientificContext): string {
  // --- 7-day averages ---
  const dailyLines = ctx.sevenDayAverages.length
    ? ctx.sevenDayAverages
        .map((d) => `  ${d.date}: ${d.value.toFixed(1)} µg/m³ (${d.category})`)
        .join('\n')
    : '  No historical data';

  // --- wind summary ---
  const windSummary = ctx.wind.days.length
    ? ctx.wind.days
        .map((d) => `  ${d.date}: from ${d.directionLabel} at ${d.speedKmh.toFixed(1)} km/h`)
        .join('\n')
    : '  No wind data available';

  // --- weather context ---
  const precipRows = ctx.weatherContext.days.map((d) => {
    const precip = d.precipitationMm.toFixed(1);
    const rhStr =
      d.humidity !== null
        ? ` RH ${d.humidity.toFixed(0)}%${d.highHumidityWarning ? ' ⚠ high humidity — readings may over-read PM2.5' : ''}`
        : '';
    return `  ${d.date}: ${precip} mm rain,${rhStr}`;
  });
  const { totalPrecipitationMm, trajectoryPrecipitationMm, availableDayCount } = ctx.weatherContext;
  if (availableDayCount > 0) {
    precipRows.push(
      totalPrecipitationMm === 0
        ? `  Total past ${availableDayCount} days: 0.0 mm — no rainfall. Rain-based explanations for PM2.5 changes are not applicable.`
        : `  Total past ${availableDayCount} days: ${totalPrecipitationMm.toFixed(1)} mm`,
    );
  }
  if (ctx.transport !== null) {
    precipRows.push(
      trajectoryPrecipitationMm === 0
        ? `  Precipitation along wind path (3-day cumulative): 0.0 mm — no rainfall along trajectory.`
        : `  Precipitation along wind path (3-day cumulative): ${trajectoryPrecipitationMm.toFixed(1)} mm`,
    );
  }
  const weatherContextStr = precipRows.join('\n');

  // --- persistent wind ---
  let persistentWindSection = '';
  if (ctx.persistentWind !== null) {
    const pw = ctx.persistentWind;
    const pwStr =
      pw.sourcesBeyondWindow.length === 0
        ? `Wind has been consistently from the ${pw.label} for ${pw.dayCount}+ days. No major emission sources identified in that direction beyond the wind path window.`
        : [
            `Wind has been consistently from the ${pw.label} for ${pw.dayCount}+ days.`,
            `Sources in that direction beyond the wind path window:`,
            ...pw.sourcesBeyondWindow
              .slice()
              .sort((a, b) => a.distanceKm - b.distanceKm)
              .map(
                (s) =>
                  `  ${s.name}, ${s.country} — ${s.distanceKm.toFixed(0)} km — ${sourceDetail(s)}`,
              ),
          ].join('\n');
    persistentWindSection = `\nPERSISTENT WIND DIRECTION (station weather, last ${pw.dayCount} days)\n${pwStr}\n`;
  }

  // --- transport section ---
  let transportSection = '';
  if (ctx.transport !== null) {
    const { trajectory, cams, fire } = ctx.transport;

    // Trajectory string
    let prevRegion = '';
    const pathStr = trajectory.waypoints
      .map((w, idx) => {
        const coord = `${w.lat.toFixed(1)}°N ${w.lng.toFixed(1)}°E`;
        if (idx === 0) return coord;
        const region = w.region;
        if (!region || region === prevRegion) {
          prevRegion = region;
          return coord;
        }
        prevRegion = region;
        return `${coord} (${region})`;
      })
      .join(' ← ');
    const originLabel =
      `Origin region: ${trajectory.origin.lat.toFixed(2)}°N, ${trajectory.origin.lng.toFixed(2)}°E` +
      (trajectory.origin.region ? ` — ${trajectory.origin.region}` : '') +
      ` (${trajectory.origin.date})`;
    const trajectoryStr = [
      `Traced ${trajectory.hoursTraced}h back using ${5}-member ensemble`,
      originLabel,
      `Corridor width: ${trajectory.corridorWidthKm.toFixed(0)} km (based on mean wind ${trajectory.meanWindSpeedKmh.toFixed(1)} km/h)`,
      `Path (station → origin): ${pathStr}`,
    ].join('\n');

    const trajectoryBlock = `3-DAY WIND PATH (5-member ensemble, surface-level approximation)
${trajectoryStr}
NOTE: Simplified 2D surface trajectory from daily wind snapshots. Treat origin region as indicative, not precise.`;

    // CAMS block — omitted when suppression active
    let camsBlock = '';
    if (!cams.suppressionActive) {
      const camsStr = cams.samples.length
        ? cams.samples
            .map(
              (s) =>
                `  ${s.lat.toFixed(1)}°N ${s.lng.toFixed(1)}°E ` +
                `(${s.date}): ${s.pm25.toFixed(1)} µg/m³ (${s.category})`,
            )
            .join('\n')
        : '  No CAMS data along trajectory';
      camsBlock = `\nAIR QUALITY ALONG WIND PATH (CAMS model PM2.5)\n${camsStr}`;
    }

    // Fire block — omitted when suppression active
    let fireBlock = '';
    if (!fire.pathScore && fire.pathFireCount === 0) {
      fireBlock = `\nCUMULATIVE FIRE PRESSURE (fires within wind path, last 72 h)\nScore: 0/100 — None\nNo fires detected within transport corridor`;
    } else if (!cams.suppressionActive) {
      const recencyLine = fire.recency
        ? `  By recency: 0-24h: ${fire.recency.last24h.count} fires (${fire.recency.last24h.totalFrpMw.toFixed(0)} MW FRP) | ` +
          `24-48h: ${fire.recency.last48h.count} fires (${fire.recency.last48h.totalFrpMw.toFixed(0)} MW FRP) | ` +
          `48-72h: ${fire.recency.last72h.count} fires (${fire.recency.last72h.totalFrpMw.toFixed(0)} MW FRP)`
        : null;
      const nearestLine =
        fire.nearestFireDistKm !== null
          ? `Nearest fire to path centerline: ${fire.nearestFireDistKm.toFixed(0)} km`
          : null;
      const fireLines = [
        `Score: ${fire.pathScore}/100 — ${firePressureLabel(fire.pathScore)}`,
        `Total fires along path: ${fire.pathFireCount}`,
        recencyLine,
        nearestLine,
      ]
        .filter((l): l is string => l !== null)
        .join('\n');
      fireBlock = `\nCUMULATIVE FIRE PRESSURE (fires within wind path, last 72 h)\n${fireLines}`;
    }

    transportSection = `${trajectoryBlock}${camsBlock}${fireBlock}`;
  }

  // --- area fire pressure — always shown, even for outliers ---
  let pressureScoreStr: string;
  if (
    !ctx.areaFirePressure ||
    (ctx.areaFirePressure.score === 0 && ctx.areaFirePressure.fireCount === null)
  ) {
    pressureScoreStr =
      'No data — location outside fire detection grid or no activity in past 14 days';
  } else {
    const afp = ctx.areaFirePressure;
    const interpretation =
      ctx.outlier === null && afp.score >= 40
        ? `Interpretation: Fire activity has been sustained at ${firePressureLabel(afp.score).toLowerCase()} levels across this area for weeks or longer — this reflects persistent regional smoke buildup, not a one-off event.`
        : null;
    pressureScoreStr = [
      `Score: ${afp.score.toFixed(1)}/100 — ${firePressureLabel(afp.score)} (${afp.fireCount ?? 0} detections, total FRP ${(afp.totalFrpMw ?? 0).toFixed(0)} MW over 14 days)`,
      ...(interpretation ? [interpretation] : []),
    ].join('\n');
  }

  // --- upwind sources ---
  let sourcesStr: string;
  const { tier1, tier2 } = ctx.upwindSources;
  if (tier1.length === 0 && tier2.length === 0) {
    sourcesStr = '  None identified within footprint';
  } else {
    const parts: string[] = [];
    if (tier1.length > 0) {
      parts.push('Tier 1 (along wind path, ≤ 150 km):');
      for (const s of tier1) {
        parts.push(
          `  ${s.name}, ${s.country} — ${s.distanceKm.toFixed(0)} km — ${sourceDetail(s)}`,
        );
      }
    }
    if (tier2.length > 0) {
      parts.push('Local air shed (≤ 20 km, any wind direction):');
      for (const s of tier2) {
        parts.push(
          `  ${s.name}, ${s.country} — ${s.distanceKm.toFixed(0)} km — ${sourceDetail(s)}`,
        );
      }
    }
    sourcesStr = parts.join('\n');
  }

  // --- peers ---
  let peerStr: string;
  if (!ctx.peers || ctx.peers.stationCount === 0) {
    peerStr = 'No peer station data available within 75 km';
  } else {
    const p = ctx.peers;
    const rangeStr = p.range ? `${p.range.min.toFixed(1)}–${p.range.max.toFixed(1)} µg/m³` : 'n/a';
    const header = `${p.stationCount} stations — distance-weighted mean ${p.weightedMean.toFixed(1)} µg/m³ (unweighted median ${p.unweightedMedian.toFixed(1)} µg/m³), range ${rangeStr}`;
    if (p.distribution) {
      peerStr = `${header}\nDistribution by AQI category: ${p.distribution}`;
    } else {
      const stationLines = p.stations
        .slice()
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 10)
        .map(
          (s) =>
            `  ${s.name}: ${s.value.toFixed(1)} µg/m³ — ${pm25Cat(s.value)} (${s.distanceKm.toFixed(0)} km)`,
        )
        .join('\n');
      peerStr = `${header}\n${stationLines}`;
    }
  }

  return `You are explaining current air quality to a general audience in plain English.

<scientific_data>
STATION: ${ctx.station.name} (${ctx.station.lat.toFixed(3)}°N, ${ctx.station.lng.toFixed(3)}°E)
CURRENT PM2.5: ${ctx.currentPm25.toFixed(1)} µg/m³ — ${ctx.aqiCategory}
CASE: ${ctx.explainCase}
DATE: ${ctx.date} (UTC+7)

7-DAY DAILY AVERAGES
${dailyLines}

WIND (last 3 days, nearest grid point to station)
${windSummary}

WEATHER CONTEXT (precipitation and humidity at station)
${weatherContextStr}
${persistentWindSection}${transportSection ? `${transportSection}\n\n` : ''}AREA FIRE PRESSURE (14-day precomputed score at this location)
${pressureScoreStr}

UPWIND EMISSION SOURCES (cities, industrial zones, power plants along trajectory)
${sourcesStr}

BACKGROUND_ONLY: ${ctx.trend}

PEER STATIONS WITHIN 75 KM (last 24 h)
${peerStr}

SEASONAL CONTEXT: ${ctx.seasonContext}
</scientific_data>`;
}

// ----------------------------------------------------------------
// Instructions block — Step 2: per-case rewrite
// ----------------------------------------------------------------

function buildCaseInstructions(ctx: ScientificContext): string {
  const transport = ctx.transport;
  const firesAreLocal = transport?.fire.firesAreLocal ?? false;
  const nearestFireDistKm = transport?.fire.nearestFireDistKm ?? null;
  const pathScore = transport?.fire.pathScore ?? 0;
  const trajectoryPrecipMm = ctx.weatherContext.trajectoryPrecipitationMm;

  switch (ctx.explainCase) {
    case 'PLAUSIBLE_FIRE_TRANSPORT': {
      if (firesAreLocal) {
        const slowWind =
          transport !== null &&
          (ctx.areaFirePressure?.score ?? 0) >= 40 &&
          transport.trajectory.meanWindSpeedKmh <= 10
            ? ' Winds have been slow — stagnant air has allowed this smoke to build up over an extended period. This is an accumulation story, not a one-day event.'
            : '';
        return `Fires have been burning at or near this location for an extended period — lead with that buildup story.

Open with the area fire count and area score to show the accumulation is sustained, not a single event.${slowWind}

Cite the CAMS gradient if meaningful (start and end values in µg/m³). Name specific countries and sub-regions from the trajectory where fires are concentrated.

Close with peer confirmation: how many nearby stations read similarly, confirming this is a regional picture.`;
      } else {
        const nearestStr =
          nearestFireDistKm !== null
            ? ` The nearest fire to the path centerline was ${nearestFireDistKm.toFixed(0)} km away — fires were along the upwind path, not directly at this location.`
            : '';
        const fireLeadStr =
          pathScore >= 70
            ? 'Because trajectory fire pressure is high, open with the fire count and geographic origin before mentioning any urban or industrial sources — fires are the primary driver here.'
            : '';
        return `This station is receiving smoke imported from fires burning along the upwind path — open with that origin story.

Lead with the total path fire count and the geographic origin of the air mass. Name the specific countries and sub-regions where fires burned, derived from the trajectory waypoints and region labels.${nearestStr}

${fireLeadStr}

Cite the CAMS gradient if meaningful (origin vs arrival values in µg/m³). Close with a peer confirmation sentence.`;
      }
    }

    case 'PLAUSIBLE_URBAN_INDUSTRIAL':
      return `The air originates from a relatively clean source and picks up pollution from urban and industrial sources along the path.

Lead with the air mass origin — name the water body or region specifically — and its clean CAMS reading at that source. Then describe how Tier 1 sources (along the wind path, ≤150 km) add pollution to the arriving air, named by proximity closest first. If a Local air-shed source (≤20 km) appears in the data, weave it naturally into the most relevant paragraph.

Cite the peer weighted mean. Close with peer confirmation.`;

    case 'PLAUSIBLE_CLEAN':
      if (trajectoryPrecipMm > 40) {
        return `Rain along the wind path has washed out particles — this is the primary explanation for the clean reading.

Lead with the cumulative path rainfall total (${trajectoryPrecipMm.toFixed(1)} mm) and the CAMS origin reading. Show the CAMS gradient from source to arrival (start and end values in µg/m³) — the drop tells the washout story, provided the gradient meets the ≥15 µg/m³ or AQI-crossing threshold.

Close with the peer range if available, confirming this is a regional picture.`;
      } else {
        return `The air originates from a clean source and has not picked up significant pollution along its path.

Lead with the specific origin — name the water body, ocean, or low-fire region — and its CAMS reading. Cite the peer range to confirm this is regional, not just this station.

Close with a concrete fact about the origin: the name of the region, or the distance the air traveled over water before reaching here.`;
      }

    case 'OUTLIER_HIGH':
      return `This reading is anomalously high relative to all nearby stations — lead with that fact.

Open with the ratio versus the peer mean (cite both: the ratio and the peer mean in µg/m³). State that nearby stations are much lower.

Cite the peer count and the highest peer reading. Note how many of the past seven days this station has read elevated (visible in the 7-day averages).

List the most plausible explanations: sensor fault or drift, a very localised source directly at this station (a nearby generator, vehicle exhaust, an isolated burn), or a data reporting error.

Close with the finding: the regional picture does not support this reading.`;

    case 'OUTLIER_LOW':
      return `This reading is anomalously low relative to all nearby stations — lead with that fact.

Open with the ratio versus the peer mean (cite both: the ratio and the peer mean in µg/m³). State that nearby stations are much higher.

Cite the peer count and the AQI distribution of peers. If area fire pressure is elevated, name it as context — fires are present across the region while this station reads clean.

List the most plausible explanations: sensor fault, local shielding of particles, or a data reporting error.

Close with the finding: there is no meteorological explanation for this reading given current regional conditions.`;

    case 'PLAUSIBLE_UNCLEAR':
    default:
      return `No single driver clearly dominates this reading — acknowledge that directly.

Lead with the current PM2.5 level and state plainly that the cause is unclear.

Cite the CAMS values along the path (note whether they are flat, slightly elevated, or ambiguous — describe the pattern). Cite the peer range. Mention any weak fire or urban signal present in the data.

Close by naming the candidate explanations honestly without asserting any one of them. Honest uncertainty is the correct output here.`;
  }
}

function buildInstructionsBlock(ctx: ScientificContext): string {
  const { outlier, transport, trend } = ctx;

  const outlierNote = outlier
    ? outlier.type === 'HIGH'
      ? `⚠ STRONG OUTLIER (HIGH): This station reads ${outlier.ratio.toFixed(1)}× the distance-weighted peer mean (${ctx.peers?.weightedMean.toFixed(1) ?? '?'} µg/m³). Nearby stations are much lower.`
      : `⚠ STRONG OUTLIER (LOW): This station reads ${outlier.ratio.toFixed(1)}× the distance-weighted peer mean (${ctx.peers?.weightedMean.toFixed(1) ?? '?'} µg/m³). Nearby stations are much higher.`
    : '';

  const suppressionActive = transport?.cams.suppressionActive ?? false;

  const universal = `Write 1–3 paragraphs in plain prose — no markdown, no bullet points. Aim for 40–80 words per paragraph; one strong paragraph beats two thin ones.

Lead with the single most concrete fact: a number, an origin location, a peer comparison. Not an adjective or a weather description.

Use third person throughout ("this station", "this area", "conditions here"). No "we" or "our".

For fire counts use past or present-perfect tense: "have burned", "have been detected" — not present continuous ("are burning").

Never use these words: trajectory, corridor, transport, particulate matter, concentration, sensors. Plain equivalents: "the path the wind took", "measuring stations".

Always cite PM2.5 values with µg/m³ to one decimal place (e.g. 29.4 µg/m³).

Do not quote time labels from the data verbatim — say "recently" or "over the past few days", not "last 3 days" or "past 72 hours". Treat time windows as minimums.

Recent rain (> 5 mm total) can wash out particles — mention it when significant and state what happened, not what was avoided. High humidity (≥85%) may cause stations to over-read.

BACKGROUND_ONLY is for your reasoning only — never reference or narrate it.`;

  const camsRule = `CAMS gradient: narrate only when the endpoint differs from the origin by ≥15 µg/m³ or crosses an AQI category boundary. When the threshold is met, cite both values in µg/m³ ("air that read 6.8 µg/m³ over the Gulf reached 29.2 µg/m³ on arrival"). Immediately after, check whether the station reading exceeds the highest CAMS sample by > 20 µg/m³ — if so, add one sentence in your own words explaining why (local fire activity the model does not fully resolve; cite both numbers). When CAMS values decrease along the path, describe the arriving air as cleaner — not as accumulation. Name specific countries and regions along the path; "from the coast" is not enough.${suppressionActive ? ' The CAMS and fire data sections are absent from the scientific data — do not infer or speculate about fire activity.' : ''}`;

  const peerRule = `Peers: when a Distribution by AQI category line is present, lead with combined category counts (e.g. "37 of 40 nearby stations read Very unhealthy or Hazardous") then cite the range. Name individual stations only when ≤10 peers are available; include each value to one decimal place. Use "read" or "recorded" — not "reported" or "measured".`;

  const caseInstructions = buildCaseInstructions(ctx);

  return `<instructions>
Never narrate the BACKGROUND_ONLY field or reference it in your response — it is for your reasoning only.
${outlierNote ? `${outlierNote}\n\n` : ''}${universal}

${camsRule}

${peerRule}

${trend.startsWith('not significant') ? 'The trend is not significant — do not discuss trend direction at all, not even to note that values are low.\n\n' : ''}${caseInstructions}
</instructions>`;
}

// ----------------------------------------------------------------
// Main export
// ----------------------------------------------------------------

export function buildPrompt(ctx: ScientificContext, locale: string): string {
  const localeSuffix =
    locale === 'th'
      ? '\nRespond entirely in Thai (ภาษาไทย). Keep all numbers, unit symbols (µg/m³), and station names in their original form.'
      : '';
  return `${buildScientificDataBlock(ctx)}\n\n${buildInstructionsBlock(ctx)}${localeSuffix}`;
}
