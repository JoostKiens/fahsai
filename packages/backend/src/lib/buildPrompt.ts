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
        ? `  Total recent days: 0.0 mm — no rainfall. Rain-based explanations for PM2.5 changes are not applicable.`
        : `  Total recent days: ${totalPrecipitationMm.toFixed(1)} mm`,
    );
  }
  if (ctx.transport !== null) {
    precipRows.push(
      trajectoryPrecipitationMm === 0
        ? `  Precipitation along wind route (cumulative): 0.0 mm — no rainfall along route.`
        : `  Precipitation along wind route (cumulative): ${trajectoryPrecipitationMm.toFixed(1)} mm`,
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

    // CAMS block — omitted when suppression active, except PLAUSIBLE_URBAN_INDUSTRIAL
    // which needs the near-origin value to anchor the "air arrived clean" story
    let camsBlock = '';
    if (!cams.suppressionActive || ctx.explainCase === 'PLAUSIBLE_URBAN_INDUSTRIAL') {
      const total = cams.samples.length;
      const camsStr = total
        ? [...cams.samples]
            .reverse()
            .map((s, ri) => {
              const origIdx = total - 1 - ri;
              const lbl =
                total === 1
                  ? 'Along path'
                  : origIdx === 0
                    ? 'Near station'
                    : origIdx === total - 1
                      ? 'Near origin (furthest from station)'
                      : 'Mid-path';
              return `  ${lbl}: ${s.pm25.toFixed(1)} µg/m³ — ${s.category} (${s.lat.toFixed(1)}°N ${s.lng.toFixed(1)}°E, ${s.date})`;
            })
            .join('\n')
        : '  No CAMS data along route';
      // Suppress gap explanation when suppression is active — fires are on the flanks,
      // not in the core air mass; the gap is from urban sources, not unresolved fire smoke.
      const gapLine =
        !cams.suppressionActive && cams.stationExceedsCamsMax
          ? 'STATION VS MODEL GAP: Yes — station reads >20 µg/m³ above peak modelled value. Explain the gap.'
          : 'STATION VS MODEL GAP: No — gap is within normal range. Do not add a gap explanation sentence.';
      camsBlock = `\nAIR QUALITY ALONG WIND PATH (CAMS model PM2.5)\n${camsStr}\n${gapLine}`;
    }

    // Fire block — omitted when suppression active
    let fireBlock = '';
    if (!fire.pathScore && fire.pathFireCount === 0) {
      fireBlock = `\nCUMULATIVE FIRE PRESSURE (fires within wind path, recent days)\nScore: 0/100 — None\nNo fires detected within route corridor`;
    } else if (!cams.suppressionActive) {
      const recencyLine = fire.recency
        ? `  By recency: recent: ${fire.recency.last24h.count} fires (${fire.recency.last24h.totalFrpMw.toFixed(0)} MW FRP) | ` +
          `older: ${fire.recency.last48h.count} fires (${fire.recency.last48h.totalFrpMw.toFixed(0)} MW FRP) | ` +
          `oldest: ${fire.recency.last72h.count} fires (${fire.recency.last72h.totalFrpMw.toFixed(0)} MW FRP)`
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
      fireBlock = `\nCUMULATIVE FIRE PRESSURE (fires within wind path, recent days)\n${fireLines}`;
    }

    transportSection = `${trajectoryBlock}${camsBlock}${fireBlock}`;
  }

  // --- area fire pressure — always shown, even for outliers ---
  let pressureScoreStr: string;
  if (
    !ctx.areaFirePressure ||
    (ctx.areaFirePressure.score === 0 && ctx.areaFirePressure.fireCount === null)
  ) {
    pressureScoreStr = 'No data — location outside fire detection grid or no recent activity';
  } else {
    const afp = ctx.areaFirePressure;
    const interpretation =
      ctx.outlier === null && afp.score >= 40
        ? `Interpretation: Fire activity has been sustained at ${firePressureLabel(afp.score).toLowerCase()} levels across this area for weeks or longer — this reflects persistent regional smoke buildup, not a one-off event.`
        : null;
    pressureScoreStr = [
      `Score: ${afp.score.toFixed(1)}/100 — ${firePressureLabel(afp.score)} (${afp.fireCount ?? 0} detections, total FRP ${(afp.totalFrpMw ?? 0).toFixed(0)} MW)`,
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
    } else if (p.stationCount <= 2) {
      const stationLines = p.stations
        .slice()
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .map(
          (s) =>
            `  ${s.name}: ${s.value.toFixed(1)} µg/m³ — ${pm25Cat(s.value)} (${s.distanceKm.toFixed(0)} km)`,
        )
        .join('\n');
      peerStr = `${header}\n${stationLines}`;
    } else {
      // Individual station names omitted when ≥3 peers — instructions tell the model to summarise
      peerStr = header;
    }
  }

  const candidateSourcesBlock =
    ctx.explainCase === 'OUTLIER_HIGH'
      ? `\nCANDIDATE LOCAL SOURCES (standard list for isolated high readings)\n` +
        `  A generator running near the equipment\n` +
        `  A nearby burn (garden, agricultural, waste)\n` +
        `  Vehicle exhaust directly next to the monitor\n` +
        `  A sensor fault or calibration drift\n` +
        `  A data reporting error\n`
      : '';

  return `You are explaining current air quality to a general audience in plain English.

<scientific_data>
STATION: ${ctx.station.name} (${ctx.station.lat.toFixed(3)}°N, ${ctx.station.lng.toFixed(3)}°E)
CURRENT PM2.5: ${ctx.currentPm25.toFixed(1)} µg/m³ — ${ctx.aqiCategory}
CASE: ${ctx.explainCase}
DATE: ${ctx.date} (UTC+7)
${candidateSourcesBlock}
7-DAY DAILY AVERAGES
${dailyLines}

WIND (last 3 days, nearest grid point to station)
${windSummary}

WEATHER CONTEXT (precipitation and humidity at station)
${weatherContextStr}
${persistentWindSection}${transportSection ? `${transportSection}\n\n` : ''}AREA FIRE PRESSURE (precomputed score at this location)
${pressureScoreStr}

UPWIND EMISSION SOURCES (cities, industrial zones, power plants along route)
${sourcesStr}

BACKGROUND_ONLY: ${ctx.trend}

PEER STATIONS WITHIN 75 KM (recent readings)
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
  const suppressionActive = transport?.cams.suppressionActive ?? false;
  const afpScore = ctx.areaFirePressure?.score ?? 0;
  const afpFireCount = ctx.areaFirePressure?.fireCount ?? null;
  const totalPrecipMm = ctx.weatherContext.totalPrecipitationMm;
  const humidities = ctx.weatherContext.days
    .filter((d) => d.humidity !== null)
    .map((d) => d.humidity!);
  const lowestHumidity = humidities.length ? Math.min(...humidities) : null;
  const hasHighHumidityWarning = ctx.weatherContext.days.some((d) => d.highHumidityWarning);
  const peerCount = ctx.peers?.stationCount ?? 0;
  const originRegion = transport?.trajectory.origin.region?.toLowerCase() ?? '';

  // Flat CAMS gradient: all samples within 5 µg/m³ and same AQI category
  const camsValues = transport?.cams.samples.map((s) => s.pm25) ?? [];
  const camsCategories = new Set(transport?.cams.samples.map((s) => s.category) ?? []);
  const isCamsFlat =
    camsValues.length >= 2 &&
    Math.max(...camsValues) - Math.min(...camsValues) <= 5 &&
    camsCategories.size === 1;

  // Peak burning season from date (Feb–Apr = months 2–4), regardless of season field
  const month = parseInt(ctx.date.slice(5, 7), 10);
  const isPeakBurning = month >= 2 && month <= 4;

  switch (ctx.explainCase) {
    case 'PLAUSIBLE_FIRE_TRANSPORT': {
      if (firesAreLocal) {
        const slowWind =
          transport !== null && afpScore >= 40 && transport.trajectory.meanWindSpeedKmh <= 10
            ? ' Winds have been slow — stagnant air has allowed this smoke to build up over an extended period. This is an accumulation story, not a one-day event.'
            : '';

        // F02: cite low humidity and zero rainfall when present
        const hasLowHumidity = lowestHumidity !== null && lowestHumidity < 40;
        const dispersalNote =
          totalPrecipMm === 0 && hasLowHumidity
            ? `\n\nZero rainfall and humidity as low as ${lowestHumidity.toFixed(0)}% are shown in the weather data — cite both as the reason smoke has not dispersed. This is why conditions have been able to build up rather than clearing.`
            : totalPrecipMm === 0
              ? '\n\nZero rainfall is shown in the weather data — note that nothing has washed the smoke out.'
              : '';

        // F02: geographic anchor via tier 1 city
        const tier1Cities = ctx.upwindSources.tier1.filter((s) => s.type === 'city');
        const cityNote =
          tier1Cities.length > 0
            ? `\n\nA named city appears in tier 1 sources: ${tier1Cities.map((c) => `${c.name} (${c.distanceKm.toFixed(0)} km)`).join(', ')}. Name it alongside the peer data as a place experiencing the same conditions — "X, Y km away, sits under the same smoke" — this geographic anchor makes the regional crisis concrete for the reader.`
            : '';

        // F07: path count in lead, area count as secondary chronic evidence
        return `Fires have been burning at or near this location for an extended period — lead with that buildup story.

Open with the path fire count (shown in CUMULATIVE FIRE PRESSURE) as the lead number — this is the acute 72-hour signal. Then cite the area detection count (shown in AREA FIRE PRESSURE) as evidence of sustained chronic buildup: "over X fires have also been detected in and around this location over recent weeks." Do not describe the pressure level as a "perfect score" or use the score label. Use "for weeks" for the area count — never cite "14 days" or "two weeks" by name.${slowWind}${dispersalNote}${cityNote}

Cite the CAMS gradient if meaningful (start and end values in µg/m³). Name specific countries and sub-regions from the trajectory where fires are concentrated.

Close with peer confirmation: how many nearby stations read similarly, confirming this is a regional picture.`;
      } else {
        const nearestStr =
          nearestFireDistKm !== null
            ? ` The nearest fire to the path centerline was ${nearestFireDistKm.toFixed(0)} km away — fires were along the upwind path, not directly at this location.`
            : '';
        const fireLeadStr =
          pathScore >= 70
            ? '\n\nBecause trajectory fire pressure is high, open with the fire count and geographic origin before mentioning any urban or industrial sources — fires are the primary driver here.'
            : '';

        // F10: cite zero rainfall + low humidity for imported-fire cases
        const hasLowHumidity = lowestHumidity !== null && lowestHumidity < 40;
        const dispersalNote =
          totalPrecipMm === 0 && hasLowHumidity
            ? `\n\nZero rainfall and humidity as low as ${lowestHumidity.toFixed(0)}% appear in the weather data — cite both in a single sentence as the reason the smoke has not dispersed despite traveling a long distance: "Zero rainfall and humidity below ${lowestHumidity.toFixed(0)}% has left nothing to wash the smoke out."`
            : totalPrecipMm === 0
              ? '\n\nZero rainfall appears in the weather data — mention that nothing fell to wash the smoke out during its journey.'
              : '';

        // F05/F10: name tier 1 sources and persistent-wind beyond-window sources in peer paragraph
        const tier1Names = ctx.upwindSources.tier1
          .filter((s) => s.type === 'city')
          .map((s) => `${s.name} (${s.distanceKm.toFixed(0)} km upwind)`);
        const persistentNames = (ctx.persistentWind?.sourcesBeyondWindow ?? [])
          .filter((s) => s.type === 'city')
          .map((s) => `${s.name} (${s.distanceKm.toFixed(0)} km)`);
        const urbanSourceNames = [...new Set([...tier1Names, ...persistentNames])];
        const urbanSourceNote =
          urbanSourceNames.length > 0
            ? `\n\nUpwind urban sources are present in the data — ${urbanSourceNames.join(', ')}. Name them in the peer paragraph as background context that adds urban emissions to the arriving smoke, not as a primary cause. Final sentence framing: "[City], [distance] km upwind, adds urban emissions to the smoke arriving from [origin region]."`
            : '';

        return `This station is receiving smoke imported from fires burning along the upwind route — open with that origin story.

Lead with the total path fire count and the geographic origin of the air mass. Name the specific countries and sub-regions where fires burned, derived from the trajectory waypoints and region labels.${nearestStr}${fireLeadStr}${dispersalNote}${urbanSourceNote}

Cite the CAMS gradient if meaningful (origin vs arrival values in µg/m³). Close with a peer confirmation sentence.`;
      }
    }

    case 'PLAUSIBLE_URBAN_INDUSTRIAL': {
      // Fix 2c: near-origin CAMS value is the baseline; clarify which sample to use
      const camsOriginNote =
        '\n\nThe CAMS data section labels each sample by position. The "near origin" value is the starting point of the air mass — cite this as the clean marine or continental baseline. Do not cite the mid-path or near-station values as the origin reading.';

      // F05: area fire pressure as background layer when suppression active
      const areaFireNote =
        suppressionActive && afpScore >= 40
          ? `\n\nArea fire pressure is ${afpScore.toFixed(1)}/100 with ${afpFireCount ?? 0} detections over 14 days — mention this sustained local fire activity as a background layer on top of the urban emissions, framing it as weeks of buildup, not a single event.`
          : '';

      // F07: fire threshold — only cite fires when pathScore >= 40
      const fireThresholdNote =
        pathScore < 40
          ? '\n\nCite fires only when path fire pressure score is shown as ≥ 40 in the data. For this reading it is not — omit any mention of fires, fire counts, or fire pressure.'
          : '';

      // F05: rainfall note — mention only when active, not its absence
      const rainfallNote =
        '\n\nMention rainfall only if it was significant (> 5 mm total) and played an active role in the story — omit it when absent or negligible.';

      // F07: honest single-peer framing
      const singlePeerNote =
        peerCount === 1
          ? '\n\nOnly one peer station is available — frame the comparison honestly: the gap is notable, but a single reference point is not enough to determine whether this is a localised plume or a genuinely broader elevation.'
          : '';

      return `The air originates from a relatively clean source and picks up pollution from urban and industrial sources along the path.

Lead with the air mass origin — name the water body or region specifically — and its clean CAMS reading at that source. Then describe how Tier 1 sources (along the path, ≤150 km) add pollution to the arriving air, named by proximity closest first. If a Local air-shed source (≤20 km) appears in the data, weave it naturally into the most relevant paragraph.${camsOriginNote}${areaFireNote}${fireThresholdNote}${rainfallNote}${singlePeerNote}

Cite the peer weighted mean. Close with peer confirmation.`;
    }

    case 'PLAUSIBLE_CLEAN': {
      // S1: suppress fire mentions when pathScore < 40
      const fireOmissionNote =
        pathScore < 40
          ? '\n\nFire data is present in the data block for context only. Do not mention fires, fire counts, or fire pressure in this response — path fire pressure is below 40 and is not a contributing factor.'
          : '';

      if (trajectoryPrecipMm > 40) {
        // Fix 3: washout — two paragraphs when high humidity present
        const washoutHumidityNote = hasHighHumidityWarning
          ? `\n\nStructure as two paragraphs: (1) the washout story (origin, rainfall total, CAMS gradient showing clean air arrival); (2) an uncertainty paragraph noting the station reads slightly above the modelled background — cite high humidity as a candidate reason: humidity above 85% can cause optical equipment to over-read. If fewer than 3 peer stations are available, note that it is difficult to confirm whether this reflects actual air quality or a sensor effect. The second paragraph is required when high humidity is flagged.`
          : '';

        return `Rain along the air's route has washed out particles — this is the primary explanation for the clean reading.

Lead with the current reading and where the air came from — name the specific origin region and its CAMS reading. Rainfall is the explanation, not the subject: introduce it as the mechanism after establishing the origin and the CAMS gradient. Structure: "Air that read X µg/m³ at the origin arrived here at Y µg/m³ after ${trajectoryPrecipMm.toFixed(1)} mm of rainfall along the route."

Important: the "Y µg/m³ on arrival" in that structure is the CAMS "near station" value — the sample closest to the station — not the station reading itself. The station reading may differ from the CAMS model; cite the CAMS near-station value as the evidence of washout, not the station PM2.5.

Show the full CAMS gradient if it meets the ≥15 µg/m³ or AQI-crossing threshold.

Close with the peer range if available, confirming this is a regional picture.${fireOmissionNote}${washoutHumidityNote}`;
      } else {
        // F09: marine origin — qualitative description, not computed distance
        const isMarineOrigin = [
          'sea',
          'ocean',
          'gulf',
          'bay',
          'strait',
          'andaman',
          'south china',
          'pacific',
          'indian',
        ].some((w) => originRegion.includes(w));

        const marineNote = isMarineOrigin
          ? '\n\nThe trajectory origin is over open water — describe it geographically using qualitative language: "deep in the South China Sea", "far out over the Gulf of Thailand", "well offshore in the Strait of Malacca". Do not cite a computed distance in km. The interesting fact is the unbroken stretch of open ocean with no land sources reaching this station.'
          : '';

        const persistentWindNote =
          ctx.persistentWind !== null
            ? ' If the persistent wind direction aligns with the clean origin, cite it as the reason conditions have remained clean: the wind pattern has kept this maritime flow in place for several days.'
            : '';

        // F04: flat CAMS gradient — mandatory cite when present
        const flatCamsMin = camsValues.length ? Math.min(...camsValues).toFixed(1) : '?';
        const flatCamsMax = camsValues.length ? Math.max(...camsValues).toFixed(1) : '?';
        const flatCamsRequired =
          isCamsFlat && camsValues.length >= 2
            ? `\n\nThe CAMS data is flat across the entire route: ${flatCamsMin}–${flatCamsMax} µg/m³, all within the same AQI category. This is a required sentence in the second paragraph — include it verbatim or close to it: "the modelled PM2.5 was flat at ${flatCamsMin}–${flatCamsMax} µg/m³ across the entire route." This confirms the entire route was clean, not just the origin — it is not optional context.`
            : '';

        // F04: peak burning season contrast
        const burningSeasonNote =
          isPeakBurning && ctx.currentPm25 <= 35.4
            ? '\n\nThis is peak burning season in mainland Southeast Asia. The closing sentence must include the burning season contrast: persistent winds from this direction have kept the maritime flow in place, explaining why conditions here remain clean despite widespread burning elsewhere in the region. This contrast is required — it answers the question a reader would naturally ask.'
            : '';

        // F08: high humidity as candidate explanation when no dominant cause
        const humidityNote = hasHighHumidityWarning
          ? '\n\nHigh humidity is flagged in the weather data. If no other dominant cause is clearly present (no significant fire pressure, no strong CAMS gradient), cite humidity as a candidate reason the station reads slightly above the regional model: humidity above 85% can cause optical equipment to over-read. Do not invent a cause when none is present in the data — if the explanation is genuinely unclear, say so directly.'
          : '';

        return `The air originates from a clean source and has not picked up significant pollution along its route.

Lead with the specific origin — name the water body, ocean, or low-fire region — and its CAMS reading. Cite the peer range to confirm this is regional, not just this station.${marineNote}${persistentWindNote}${flatCamsRequired}

Close with a concrete fact about the origin.${burningSeasonNote}${fireOmissionNote}${humidityNote}`;
      }
    }

    case 'OUTLIER_HIGH':
      return `This reading is anomalously high relative to all nearby stations — lead with that fact.

Open with the ratio versus the peer mean (cite both: the ratio and the peer mean in µg/m³). State that nearby stations are much lower.

Cite the peer count and the highest peer reading. Note how many of the past seven days this station has read elevated (visible in the 7-day averages).

List the candidate local sources from the CANDIDATE LOCAL SOURCES field in the data block — cite all five in natural prose. Do not paraphrase or substitute — use the exact categories as written.

Close with the finding: the regional picture does not support this reading.`;

    case 'OUTLIER_LOW': {
      // F03: cite area fire pressure as evidence of implausible low reading
      const afpNote =
        afpScore >= 40
          ? `Area fire pressure is ${afpScore.toFixed(1)} out of 100 with ${afpFireCount ?? 0} fire detections over 14 days — cite this as evidence that the regional conditions make a low reading implausible: fire activity has been sustained in and around this location while this station reads clean.`
          : 'If area fire pressure is elevated, name it as context — fires are present across the region while this station reads clean.';

      return `This reading is anomalously low relative to all nearby stations — lead with that fact.

Open with the ratio versus the peer mean (cite both: the ratio and the peer mean in µg/m³). State that nearby stations are much higher.

Cite the peer count and the AQI distribution of peers. ${afpNote}

List the most plausible explanations: sensor fault, local shielding of particles, or a data reporting error.

End with a definitive statement that forecloses alternatives: "There is no meteorological or air quality explanation for this reading under current regional conditions." Do not speculate about what conditions "should" be.`;
    }

    case 'PLAUSIBLE_UNCLEAR':
    default:
      return `No single driver clearly dominates this reading — acknowledge that directly.

Lead with the current PM2.5 level and state plainly that the cause is unclear.

Cite the CAMS values along the route (note whether they are flat, slightly elevated, or ambiguous — describe the pattern). Cite the peer range. Mention any weak fire or urban signal present in the data.

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

Never use these words: trajectory, corridor, transport, wind path, particulate matter, concentration, sensors. Name the geography instead ("fires burning across northern Myanmar") rather than describing how air moved. Plain equivalents when needed: "the route the air traveled", "measuring stations".

Always cite PM2.5 values with µg/m³ to one decimal place (e.g. 29.4 µg/m³).

The data block uses duration labels for technical reference only — do not reproduce them in your response. Write "recently", "for weeks", "over the past few days" — never "past 72 hours", "last 24 hours", "14 days", "past 5 days", "past two weeks", "over the past day", or any other specific count of hours or days. Treat durations as minimums — conditions may have persisted longer than the data captures.

Recent rain (> 5 mm total) can wash out particles — mention it when significant and state what happened, not what was avoided. High humidity (≥85%) may cause stations to over-read.

The reader already sees the station name, PM2.5 value, and AQI category in the UI — do not repeat any of these verbatim. Refer to the location as "this station", "here", or "this area" — never by name.

BACKGROUND_ONLY is for your reasoning only — never reference or narrate it.`;

  const camsRule = `CAMS gradient: narrate only when the endpoint differs from the origin by ≥15 µg/m³ or crosses an AQI category boundary. When the threshold is met, cite both values in µg/m³ ("air that read 6.8 µg/m³ over the Gulf reached 29.2 µg/m³ on arrival"). STATION VS MODEL GAP: if this field is "Yes", add one sentence explaining why the station reads higher than the regional model (local fire activity the model does not fully resolve at this scale; cite both the station reading and the peak modelled value). If "No", do not add this sentence. When CAMS values decrease along the route, describe the arriving air as cleaner — not as accumulation. Name specific countries and regions along the route; "from the coast" is not enough.${suppressionActive ? ' The CAMS and fire data sections are absent from the scientific data — do not infer or speculate about fire activity.' : ''}`;

  const peerRule = `Peers: when a Distribution by AQI category line is present, lead with combined category counts (e.g. "37 of 40 nearby stations read Very unhealthy or Hazardous") then cite the range. When 3 or more peer stations are available, summarise as a range ("nearby stations ranged from X to Y µg/m³") or by AQI category — never list individual station names or values. When fewer than 3 stations are available, name each with its value to one decimal place and distance in km. Use "read" or "recorded" — not "reported" or "measured".`;

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
