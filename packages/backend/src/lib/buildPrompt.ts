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
// Instructions block — Step 1: verbatim port of existing instructions
// adapted to use ScientificContext fields
// ----------------------------------------------------------------

function buildInstructionsBlock(ctx: ScientificContext): string {
  const { outlier, transport, currentPm25, trend } = ctx;

  const outlierNote = outlier
    ? outlier.type === 'HIGH'
      ? `⚠ STRONG OUTLIER (HIGH): This station reads ${outlier.ratio.toFixed(1)}× the distance-weighted peer mean (${ctx.peers?.weightedMean.toFixed(1) ?? '?'} µg/m³). Nearby stations are much lower. Do NOT attribute this reading to regional smoke or fires — the most likely explanations are a faulty reading, a very localised source directly at the station, or a data reporting error.`
      : `⚠ STRONG OUTLIER (LOW): This station reads ${outlier.ratio.toFixed(1)}× the distance-weighted peer mean (${ctx.peers?.weightedMean.toFixed(1) ?? '?'} µg/m³). Nearby stations are much higher. This station is reading far below the regional level — the most likely explanations are a faulty reading, local shielding or washing of particles, or a data reporting error. Do NOT present this as good air quality — it is likely a measurement anomaly.`
    : '';

  const suppressionActive = transport?.cams.suppressionActive ?? false;
  const areaScore = transport?.fire.areaScore ?? 0;
  const meanWindSpeedKmh = transport?.trajectory.meanWindSpeedKmh ?? 0;

  const slowWindBuildup =
    outlier === null && transport !== null && areaScore >= 40 && meanWindSpeedKmh <= 10
      ? '- Area fire pressure is High or Very High and winds have been slow — emphasize that stagnant air has allowed long-running regional fire smoke to accumulate at this location. This is a buildup story, not just a transport story.'
      : '';

  const dynamicLowHigh =
    outlier !== null && outlier.type === 'LOW'
      ? 'This station reads far below its neighbours — focus on why it is an outlier, not on whether the absolute level is good or bad.'
      : currentPm25 > 35
        ? 'Conditions are elevated — focus on what explains the reading.'
        : 'Explain why conditions are currently relatively good: identify the positive explanation — clean marine or oceanic air origin, recent rainfall, or genuinely low regional fire activity. If all active drivers are absent, the honest explanation is clean air origin combined with recent washout — say that directly.';

  return `<instructions>
Never narrate the BACKGROUND_ONLY field or reference it in your response — it is for your reasoning only.
${outlierNote ? `${outlierNote}\n\n` : ''}Write 1–3 short paragraphs in plain English. No markdown, no bullet points — flowing prose only.
The reader already sees the station name, PM2.5 value, and AQI category — do not repeat these verbatim.
Lead with what is most interesting: where the air came from and what drove it. Open with a concrete fact — a fire count, a distance, a geographic origin, a peer comparison — not an atmospheric description or an adjective. "Over 1,700 fires have burned along the path this air traveled" is a lead. "The air is blanketed in heavy fire activity" is not. When citing a fire count from the data, use past or present-perfect tense ("have burned", "have been detected") — not present continuous ("are burning"), which implies all fires are simultaneously active right now. Avoid hedge phrases such as "it is clear that", "it appears that", or "suggesting that" before factual statements — state the fact directly.
- Write for a general audience, not a scientist. Prefer short, direct sentences. Avoid nominalisations ("the accumulation of", "the presence of", "contributions from") — use verbs instead ("smoke accumulated", "fires are burning", "Bangkok adds"). Never use the words "trajectory", "corridor", "transport", "particulate matter", "concentration", or "sensors" — find plain equivalents ("stations" for sensors, "path the wind took" for trajectory, etc.).
- When cumulative fire pressure is ≥ 70, fires are the primary driver of the acute reading — establish this first before mentioning geography or industrial sources. Industrial and urban sources are secondary context in that case.
- Use only as many paragraphs as you have distinct things to say. One strong paragraph is better than two where the second repeats the first. Never add a paragraph just to reach a minimum length. Each paragraph must add new information not covered in the previous one. Where individual instructions below require a specific sentence (e.g. the imported pollution contrast, a wind-direction note, a marine-origin note), insert that sentence as the final sentence of the most relevant existing paragraph — do not create a new paragraph solely to house it.
- Use neutral third person for location references ("this area", "this station", "conditions here") — do not use "we", "our", or "our community".
- Use the CAMS values to trace how pollution changed along the wind path. Only describe it as an accumulation story when the endpoint is meaningfully higher than the origin — defined as a difference of ≥ 15 µg/m³ OR a crossing of an AQI category boundary (whichever threshold is met first). When either condition is met, you MUST cite the actual start and end values in µg/m³ — a sentence like "air quality worsened as it moved inland" without numbers is not acceptable; write "air that read 6.8 µg/m³ over the Gulf reached 29.2 µg/m³ by the time it arrived." Immediately after narrating the gradient, check whether the station's current PM2.5 reading is more than 20 µg/m³ above the highest CAMS value anywhere along the path (not just the nearest-to-station value — scan all three samples and use the maximum). If so, you MUST add a follow-on sentence in the same paragraph explaining in your own words why the station reads so much higher than the model: the CAMS model captures regional background smoke, but ground readings here are far above even the peak modelled value along the path, which means fire activity close to the station is contributing smoke the model doesn't fully resolve. Cite the actual station reading and the peak CAMS value (the highest of the three samples) so the gap is concrete. Do not quote or closely paraphrase the wording of this instruction. These two sentences belong together and must both appear when both conditions are met: the gradient explains what the smoke looked like in transit; the gap explains why the station reads higher than the arriving air. Never narrate the gradient without also checking and reporting the gap. If neither gradient condition is met — all values stay within the same AQI band and are close in magnitude — skip the gradient entirely; it is noise, not a story. Still check the station-vs-CAMS gap independently: if the station reading exceeds the highest CAMS value anywhere along the path (the maximum of all three samples) by more than 20 µg/m³ even when the gradient is skipped, explain in your own words why the station reads so much higher than the regional model — the CAMS model captures background smoke across a wide area, but intense fire activity close to the station can produce readings far above what that model resolves. Cite the actual numbers (station reading and peak CAMS value) so the gap is concrete. Do not quote or closely paraphrase the wording of this instruction. When CAMS values decrease along the path (the air got cleaner in transit), do not describe this as accumulation — either skip the gradient or note that the arriving air was cleaner than the source region, then consider whether local sources near the station better explain the gap. CAMS values are atmospheric model estimates, not ground readings — do not describe them as "sensor readings" or imply they were measured by instruments along the path. If wind direction changed significantly over the period shown, add this as the final sentence of the relevant paragraph. When describing the wind path, name specific countries, regions, or cities the air mass traveled through — "from the south" or "from the coast" are not sufficient. Readers cannot see the full multi-day path on the map, so be geographically concrete. When the origin is over water (ocean, gulf, large lake), note that the cleaner marine air then traveled through a continental corridor — name the land regions or countries the air passed through after leaving the water, not just the water body of origin.
- The WIND section above shows the local wind direction and speed at the station for each of the last 3 days — it describes conditions at the station, not the full geographic origin of the air mass. The 3-DAY WIND PATH section is the authoritative source for where the air came from geographically. Do not describe today's local wind direction as a "shift" or as the endpoint of the trajectory — the trajectory is traced backward from the station across multiple days and will often show a very different origin direction than today's local wind reading.
- The PERSISTENT WIND DIRECTION section (when present) shows that wind has been blowing consistently from one direction for several days — longer than the 3-day wind path captures. Sources listed there are plausible contributors to the air mass even though they fall outside the wind path window. You may reference them as background sources the air likely passed over before the wind path begins, but frame them with appropriate uncertainty: "the persistent southerly flow suggests the air may have passed over Bangkok before arriving" — not "Bangkok caused this reading." Only reference persistent wind sources when they add meaningful context to the explanation; do not mention them for Good readings unless they help explain an otherwise unclear pattern.
- When the CAMS gradient is skipped (values too close to narrate), and trajectory fire pressure is ≥ 70, the fire data is the primary story — describe it with specificity: the total fire count, how close the nearest fires are to the wind path (use the km distances in the data), and the geographic corridor where they are burning (derive this from the path coordinates and region labels in the wind path section — name specific countries and sub-regions, not just "the region" or "upwind areas"). The absence of a CAMS gradient does not mean pollution origins are unclear; it means the fire numbers carry the explanation alone.
- The cumulative fire pressure score summarises fire activity along the actual transport path — weight it accordingly.${suppressionActive ? ' However, the CAMS model shows consistently low PM2.5 along the trajectory despite a high fire pressure score — fires are on the flanks of the corridor, not in the core air mass that reached this station. Do not mention fires at all: they are not contributing to current conditions and referencing them adds confusion rather than clarity.' : ''}
- The area fire pressure score shows 14-day accumulated fire activity at this specific location — use it to give context about longer-term fire buildup beyond the recent trajectory window. If both scores are low and no fires are detected, do not mention fires at all. When area fire pressure is high or very high, lead with the sustained local burning story — fires have been burning at or near this location for an extended period, not just today.
- When area fire pressure is < 20 AND trajectory fire pressure is ≥ 70, the response MUST open with a single sentence that states both halves of the contrast together: (a) fires are not burning at this location, AND (b) fires have burned along the upwind path. Both halves must appear in the first sentence — not split across two sentences, not with (b) leading and (a) following. The structure is: "Fires are not burning near this station — but [fire count] have burned along the path the wind took to reach here, [geographic description]." Adapt the wording naturally but preserve the structure: absence first, then presence. In the same paragraph, continue with the proximity detail (nearest fires N km from the path centerline) and the geographic corridor (name the specific countries/regions from the path data). Do NOT apply this framing when: (a) area fire pressure is itself ≥ 20, OR (b) the nearest fire in the data is within 10 km of the station coordinates — in either case, fires are effectively local and the imported framing is wrong.
- Never describe fires as burning "near the station", "at this location", "locally", or "close to here" unless area fire pressure is ≥ 20. When area pressure is low, all proximity language must be anchored to the path's geography, not to the station. Forbidden: "close to the path", "along the route the wind traveled", "N km along the route" — these read as distances from the station. Required form: "fires burning as close as N km from the wind path, concentrated in [region]" where [region] is derived from the coordinates in the fire and path data. The distance (N km) is the nearest fire's distance from the path centerline; the region names where those fires are located geographically.
${slowWindBuildup}
- If fire pressure is 0 and no fires were detected, do not mention fires at all.
- If cumulative fire pressure is below 40 and CAMS values along the trajectory are all below 20 µg/m³, treat fires as not contributing to current conditions and do not mention them.
- The upwind sources section lists pre-filtered, pre-ordered sources. Tier 1 sources (along wind path, ≤ 150 km) are carried directly to this station by the wind — frame them as adding pollution to the arriving air. Local air-shed sources (≤ 20 km) are always present regardless of wind direction. Integrate local air-shed sources into an existing paragraph as background urban context — do not append them as a standalone closing sentence. Sources not in either tier have already been excluded; do not try to reference them.
- Compare against peer stations. Outlier status is determined solely by whether an outlier note appears in the PEER STATIONS section above — if no such note is present, this station is not an outlier and must not be described as one, regardless of how its reading compares to individual peers. If an outlier note is present, lead with that. When peer stations confirm the reading is regionally representative, summarize them in a single sentence with values inline (e.g., "nearby stations read 19, 18, and 25 µg/m³, confirming the pattern is regional") — do not list each as a separate sentence. When more than 10 peer stations are available, do not name individual stations. When a Distribution by AQI category line is present in the peer data, lead with it — combine the two or three highest-count categories into a single summary count (e.g. "37 of 40 nearby stations read Very unhealthy or Hazardous") before citing the range. Zero-count categories can be omitted. The distribution is more informative than the range alone; include the range only after the distribution summary, and only if the spread adds meaning. Do not open the peer sentence with "conditions similar to its immediate neighbors" and then immediately cite a wide range — pick one framing and be consistent. When naming a station, you MUST include its specific numerical value to one decimal place (e.g., 19.4, not 19). Use active phrasing only: "read" or "recorded X µg/m³" — never "reported" or "measured". When citing any PM2.5 value inline, always include the unit: µg/m³ (e.g., "nearby stations read 19.4, 25.2, and 17.5 µg/m³"). Before describing this station's reading relative to a peer, check the direction: is this station higher or lower than the peer value? State only what the numbers show — do not assume the station is the higher one. When a peer station reads higher than this station, do not use it as evidence that local conditions are elevated — it shows the opposite. Either note the difference ("a nearby station read 34.4 µg/m³, somewhat higher than here") or omit the peer comparison if it adds no useful information. If this station reads noticeably higher than peers (but below the strong outlier threshold), note the gap briefly rather than describing conditions as "consistent across the region" — consistency is only accurate when values are close. When peer stations show a wide spread (e.g., one reads Good and another reads Moderate or higher), note the spread rather than averaging over it — "nearby stations ranged from 11.7 to 34.4 µg/m³" is more honest than implying consistency.
- Recent rain can wash out PM2.5 — mention it only if precipitation is significant (> 5 mm total). If rainfall is negligible, do not mention it. When rain and moderate conditions co-occur, describe them as two independent facts: "over 20 mm of rain has fallen recently" and "conditions are moderate." Do not connect them causally unless stating the physical mechanism directly (rain washes particles from the air) — and even then, state what happened, not what was avoided. High humidity (≥ 85%) may cause optical sensors to over-read.
- ${dynamicLowHigh}
- Do not describe the week trend or characterize whether values are rising or falling — the user already sees the 5-day chart. However, if today's reading is substantially lower (> 20 µg/m³) than the average of the preceding days shown in the 7-day averages, you may note this once as context for why the current reading is where it is — frame it as "conditions today are lower than the sustained levels of recent days" without quantifying the change or describing it as a trend.
${trend.startsWith('not significant') ? '- The trend is not significant — do not discuss it at all, not even to note that values are low.' : ''}
- Do not reference specific time windows from the underlying data in your prose (e.g. "last 3 days", "72-hour", "last 24 hours", "past 72 hours", "14 days", "two weeks"). Specific durations appear in the data context above for your reference only — do not quote them verbatim in the response. Use natural language instead ("recently", "over the past few days", "for weeks"). Treat all time windows as minimum durations — the underlying conditions may have persisted longer than what the data captures.
- Describe what is happening, not what was avoided. Do not explain why conditions are not worse, do not name factors as primary or secondary without clear data support, and do not mention what is absent as an explanation. Every sentence should state a positive fact: where the air came from, what it picked up, what the numbers show. Do not end with a summary that contrasts the actual cause against an absent cause (e.g., "driven by X rather than Y", "due to Z, not fires"). End on a concrete fact — a number, a location, a peer comparison — not a process of elimination. Exception: for a strong low outlier, the absence of a local source or regional smoke pathway is itself the finding — state directly what is absent and why the reading is likely anomalous. The existing outlier note above already identifies the candidate explanations (faulty reading, local shielding, reporting error); use those as your positive claims.
${outlier !== null ? '- Suggest the most likely explanations for the anomaly.' : ''}
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
