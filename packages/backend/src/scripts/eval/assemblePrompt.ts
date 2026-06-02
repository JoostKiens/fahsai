import type { ExplainFixtureInput, FixtureUpwindSource } from './types.js';
import { compassFromDeg } from '../../utils/geo.js';
// classifyCase is imported from a shared utility rather than duplicated here.
// Unlike formatting helpers (pm25Cat, firePressureLabel) which are intentionally
// decoupled snapshots, classifyCase is a decision function that must stay identical
// between the route and the eval — divergence would produce a wrong CASE: line.
import { classifyCase } from '../../utils/classify.js';

// ----------------------------------------------------------------
// Helpers — copied from route handler to stay decoupled
// ----------------------------------------------------------------

function medianOf(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const AQI_BP = [12.0, 35.4, 55.4, 150.4, 250.4];
const AQI_LABELS = [
  'Good',
  'Moderate',
  'Unhealthy for sensitive groups',
  'Unhealthy',
  'Very unhealthy',
  'Hazardous',
];

function pm25Cat(pm25: number): string {
  for (let i = 0; i < AQI_BP.length; i++) {
    if (pm25 <= AQI_BP[i]) return AQI_LABELS[i];
  }
  return AQI_LABELS[AQI_LABELS.length - 1];
}

function firePressureLabel(score: number): string {
  if (score === 0) return 'None';
  if (score < 15) return 'Low';
  if (score < 40) return 'Moderate';
  if (score < 60) return 'High';
  return 'Very high';
}

function sourceDetail(s: FixtureUpwindSource): string {
  if (s.type === 'city') return `pop. ${((s.population ?? 0) / 1e6).toFixed(1)}M`;
  if (s.type === 'industrial') return 'industrial zone';
  // coal_plant | gas_plant | oil_plant → "X MW coal plant" etc.
  return `${s.capacityMw ?? '?'} MW ${s.type.replace('_plant', '')} plant`;
}

// ----------------------------------------------------------------
// Trend computation — pure, same algorithm as route handler
// ----------------------------------------------------------------

function computeTrend(currentPm25: number, dailyAvgs: { date: string; value: number }[]): string {
  if (currentPm25 < 12) return 'not significant — current level is well within Good range';
  if (dailyAvgs.length < 2) return 'insufficient data';
  const avgs = dailyAvgs.map((d) => d.value);
  const latest = avgs[avgs.length - 1];
  const baseline = medianOf(avgs.slice(0, -1));
  if (baseline === 0) return 'stable';
  const ratio = latest / baseline;
  if (ratio > 1.15) return 'rising sharply';
  if (ratio > 1.05) return 'rising';
  if (ratio < 0.85) return 'falling sharply';
  if (ratio < 0.95) return 'falling';
  return 'stable';
}

// ----------------------------------------------------------------
// Main function
// ----------------------------------------------------------------

export function assemblePrompt(input: ExplainFixtureInput, lang?: string): string {
  const {
    station,
    currentPm25,
    sevenDayAverages,
    weather,
    trajectory,
    firePressure,
    upwindSources,
    peers,
    outlier,
    season,
    persistentWind,
  } = input;

  // --- derived booleans ---
  const isStrongOutlier = outlier !== null;
  const isHighOutlier = outlier?.direction === 'high';
  const outlierRatio = outlier?.ratio ?? null;

  // --- trend ---
  const trend = computeTrend(currentPm25, sevenDayAverages);

  // --- fire pressure norm (already stored in fixture) ---
  const firePressureNorm = firePressure?.pathScore ?? 0;

  // --- camsMaxPm25 ---
  const camsMaxPm25 = trajectory?.camsAlongPath.length
    ? Math.max(...trajectory.camsAlongPath.map((c) => c.pm25))
    : null;

  const meanWindSpeedKmh = trajectory?.meanWindSpeedKmh ?? 0;

  // --- case classifier ---
  const explainCase = classifyCase({
    isStrongOutlier,
    isHighOutlier,
    firePressureNorm,
    camsMaxPm25,
    latestPm25: currentPm25,
    trajectoryPrecipTotal: weather.trajectoryPrecipitationMm ?? 0,
    relevantSources: (upwindSources ?? []).map((s) => ({
      isUpwind: s.currentlyUpwind,
      distKm: s.distanceKm,
    })),
  });

  // --- seasonal context ---
  const seasonContext = {
    peak_burning:
      'Peak dry season and agricultural burning season in mainland Southeast Asia (Feb–Apr). Smoke can transport hundreds of kilometres under stable, low-wind conditions.',
    early_dry:
      'Early or late dry season in mainland Southeast Asia (Oct–Jan). Agricultural burning is beginning or winding down; fire activity is lower than peak.',
    monsoon:
      'Monsoon season in mainland Southeast Asia (May–Sep). Fire activity is low; elevated PM2.5 is more likely from urban/industrial sources or stagnant air pockets.',
  }[season];

  // --- 7-day averages ---
  const dailyLines = sevenDayAverages
    .map((d) => `  ${d.date}: ${d.value.toFixed(1)} µg/m³ (${pm25Cat(d.value)})`)
    .join('\n');

  // --- wind summary (days with state === 'available', newest first, up to 3) ---
  const availableWindDays = weather.days.filter((d) => d.wind.state === 'available').slice(0, 3);
  const windSummary = availableWindDays.length
    ? availableWindDays
        .map(
          (d) =>
            `  ${d.date}: from ${compassFromDeg(d.wind.directionDeg!)} at ${d.wind.speedKmh!.toFixed(1)} km/h`,
        )
        .join('\n')
    : '  No wind data available';

  // --- weather context ---
  const precipRows = weather.days.map((d) => {
    const precip = d.precipitationMm.toFixed(1);
    const rhStr =
      d.humidity !== null
        ? ` RH ${d.humidity.toFixed(0)}%${d.highHumidityWarning ? ' ⚠ high humidity — readings may over-read PM2.5' : ''}`
        : '';
    return `  ${d.date}: ${precip} mm rain,${rhStr}`;
  });
  const totalPrecip = weather.totalPrecipitationMm;
  const availableDays = weather.days.length;
  if (availableDays > 0) {
    precipRows.push(
      totalPrecip === 0
        ? `  Total past ${availableDays} days: 0.0 mm — no rainfall. Rain-based explanations for PM2.5 changes are not applicable.`
        : `  Total past ${availableDays} days: ${totalPrecip.toFixed(1)} mm`,
    );
  }
  if (trajectory !== null && weather.trajectoryPrecipitationMm !== null) {
    const trajPrecip = weather.trajectoryPrecipitationMm;
    precipRows.push(
      trajPrecip === 0
        ? `  Precipitation along wind path (3-day cumulative): 0.0 mm — no rainfall along trajectory.`
        : `  Precipitation along wind path (3-day cumulative): ${trajPrecip.toFixed(1)} mm`,
    );
  }
  const weatherContextStr = precipRows.join('\n');

  // --- persistent wind ---
  let persistentWindStr: string | null = null;
  if (persistentWind !== null) {
    const pw = persistentWind;
    if (pw.sourcesBeyondWindow.length === 0) {
      persistentWindStr = `Wind has been consistently from the ${pw.label} for ${pw.dayCount}+ days. No major emission sources identified in that direction beyond the wind path window.`;
    } else {
      persistentWindStr = [
        `Wind has been consistently from the ${pw.label} for ${pw.dayCount}+ days.`,
        `Sources in that direction beyond the wind path window:`,
        ...pw.sourcesBeyondWindow
          .slice()
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .map(
            (s) => `  ${s.name}, ${s.country} — ${s.distanceKm.toFixed(0)} km — ${sourceDetail(s)}`,
          ),
      ].join('\n');
    }
  }

  // --- trajectory string ---
  let trajectoryStr: string;
  if (!trajectory) {
    trajectoryStr = 'Insufficient wind data — trajectory unavailable';
  } else {
    const { waypoints, origin, hoursTraced, memberCount, corridorWidthKm } = trajectory;
    let prevRegion = '';
    const pathStr = waypoints
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
      `Origin region: ${origin.lat.toFixed(2)}°N, ${origin.lng.toFixed(2)}°E` +
      (origin.region ? ` — ${origin.region}` : '') +
      ` (${origin.date})`;
    trajectoryStr = [
      `Traced ${hoursTraced}h back using ${memberCount}-member ensemble`,
      originLabel,
      `Corridor width: ${corridorWidthKm.toFixed(0)} km (based on mean wind ${meanWindSpeedKmh.toFixed(1)} km/h)`,
      `Path (station → origin): ${pathStr}`,
    ].join('\n');
  }

  // --- CAMS string ---
  let camsStr: string;
  if (!trajectory?.camsAlongPath.length) {
    camsStr = '  No CAMS data along trajectory';
  } else {
    camsStr = trajectory.camsAlongPath
      .map(
        (c) =>
          `  ${c.lat.toFixed(1)}°N ${c.lng.toFixed(1)}°E ` +
          `(${c.date}): ${c.pm25.toFixed(1)} µg/m³ (${pm25Cat(c.pm25)})`,
      )
      .join('\n');
  }

  // --- fire string ---
  let fireStr: string;
  if (!firePressure || firePressure.pathScore === null) {
    fireStr = '';
  } else if (firePressure.topFires !== null && firePressure.topFires.length === 0) {
    fireStr = '  No fires detected within transport corridor';
  } else {
    const recency = firePressure.pathFiresByRecency;
    const lines: string[] = [];
    if (recency) {
      lines.push(
        `  By recency: 0-24h: ${recency.last24h.count} fires (${recency.last24h.totalFrpMw.toFixed(0)} MW FRP) | ` +
          `24-48h: ${recency.last48h.count} fires (${recency.last48h.totalFrpMw.toFixed(0)} MW FRP) | ` +
          `48-72h: ${recency.last72h.count} fires (${recency.last72h.totalFrpMw.toFixed(0)} MW FRP)`,
      );
    }
    if (firePressure.topFires !== null && firePressure.topFires.length > 0) {
      lines.push('  Most recent fires (up to 30, newest first):');
      for (const f of firePressure.topFires) {
        lines.push(
          `  ${f.lat.toFixed(2)}°N ${f.lng.toFixed(2)}°E — ` +
            `${f.distKm.toFixed(0)} km from path — ` +
            `FRP ${f.frpMw.toFixed(0)} MW — ${f.ageH}h ago`,
        );
      }
    }
    fireStr = lines.join('\n');
  }

  // --- transport section ---
  let transportSection: string;
  if (isStrongOutlier) {
    transportSection = `FIRES / WIND PATH / CAMS: Omitted — reading is a strong outlier vs peer stations (${outlierRatio!.toFixed(1)}× median, station is ${isHighOutlier ? 'far above' : 'far below'} neighbours). Regional transport data is not relevant.`;
  } else {
    const pathFireCount = firePressure?.pathFireCount ?? 0;
    transportSection = `3-DAY WIND PATH (5-member ensemble, surface-level approximation)
${trajectoryStr}
NOTE: Simplified 2D surface trajectory from daily wind snapshots. Treat origin region as indicative, not precise.

AIR QUALITY ALONG WIND PATH (CAMS model PM2.5)
${camsStr}

CUMULATIVE FIRE PRESSURE (fires within wind path, last 72 h)
Score: ${firePressureNorm}/100 — ${firePressureLabel(firePressureNorm)}
Total fires along path: ${pathFireCount}
${fireStr}`;
  }

  // --- area fire pressure string ---
  const areaScore = firePressure?.areaScore ?? null;
  const pressureInterpretation =
    !isStrongOutlier && areaScore !== null && areaScore >= 40
      ? `Interpretation: Fire activity has been sustained at ${firePressureLabel(areaScore).toLowerCase()} levels across this area for weeks or longer — this reflects persistent regional smoke buildup, not a one-off event.`
      : null;
  const pressureScoreStr =
    areaScore !== null
      ? [
          `Score: ${areaScore.toFixed(1)}/100 — ${firePressureLabel(areaScore)} (${firePressure!.areaFireCount ?? 0} detections, total FRP ${(firePressure!.areaTotalFrpMw ?? 0).toFixed(0)} MW over 14 days)`,
          ...(pressureInterpretation ? [pressureInterpretation] : []),
        ].join('\n')
      : 'No data — location outside fire detection grid or no activity in past 14 days';

  // --- slow wind buildup ---
  const slowWindBuildup =
    !isStrongOutlier && areaScore !== null && areaScore >= 40 && meanWindSpeedKmh <= 10
      ? '- Area fire pressure is High or Very High and winds have been slow — emphasize that stagnant air has allowed long-running regional fire smoke to accumulate at this location. This is a buildup story, not just a transport story.'
      : '';

  // --- upwind sources string ---
  let sourcesStr: string;
  if (!upwindSources || upwindSources.length === 0) {
    sourcesStr = '  None identified within footprint';
  } else {
    sourcesStr = upwindSources
      .map((s) => {
        const upwindTag = s.currentlyUpwind ? ' [along wind path]' : '';
        return `  ${s.name}, ${s.country} — ${s.distanceKm.toFixed(0)} km — ${sourceDetail(s)}${upwindTag}`;
      })
      .join('\n');
  }

  // --- peer string ---
  let peerStr: string;
  if (!peers || peers.stationCount === 0) {
    peerStr = 'No peer station data available within 75 km';
  } else {
    const rangeStr = `${peers.range.min.toFixed(1)}–${peers.range.max.toFixed(1)} µg/m³`;
    const header = `${peers.stationCount} stations — distance-weighted mean ${peers.weightedMean.toFixed(1)} µg/m³ (unweighted median ${peers.unweightedMedian.toFixed(1)} µg/m³), range ${rangeStr}`;
    if (peers.distribution) {
      peerStr = `${header}\nDistribution by AQI category: ${peers.distribution}`;
    } else {
      const stationLines = peers.stations
        .slice()
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 10)
        .map(
          (p) =>
            `  ${p.name}: ${p.value.toFixed(1)} µg/m³ — ${pm25Cat(p.value)} (${p.distanceKm.toFixed(0)} km)`,
        )
        .join('\n');
      peerStr = `${header}\n${stationLines}`;
    }
  }

  // --- outlier note ---
  const outlierNote = isStrongOutlier
    ? isHighOutlier
      ? `⚠ STRONG OUTLIER (HIGH): This station reads ${outlierRatio!.toFixed(1)}× the distance-weighted peer mean (${peers!.weightedMean.toFixed(1)} µg/m³). Nearby stations are much lower. Do NOT attribute this reading to regional smoke or fires — the most likely explanations are a faulty reading, a very localised source directly at the station, or a data reporting error.`
      : `⚠ STRONG OUTLIER (LOW): This station reads ${outlierRatio!.toFixed(1)}× the distance-weighted peer mean (${peers!.weightedMean.toFixed(1)} µg/m³). Nearby stations are much higher. This station is reading far below the regional level — the most likely explanations are a faulty reading, local shielding or washing of particles, or a data reporting error. Do NOT present this as good air quality — it is likely a measurement anomaly.`
    : '';

  // ----------------------------------------------------------------
  // Assemble prompt
  // ----------------------------------------------------------------

  return `You are explaining current air quality to a general audience in plain English.

<scientific_data>
STATION: ${station.name} (${station.lat.toFixed(3)}°N, ${station.lng.toFixed(3)}°E)
CURRENT PM2.5: ${currentPm25.toFixed(1)} µg/m³ — ${pm25Cat(currentPm25)}
CASE: ${explainCase}
DATE: ${input.date} (UTC+7)

7-DAY DAILY AVERAGES
${dailyLines || '  No historical data'}

WIND (last 3 days, nearest grid point to station)
${windSummary}

WEATHER CONTEXT (precipitation and humidity at station)
${weatherContextStr}
${persistentWindStr ? `\nPERSISTENT WIND DIRECTION (station weather, last ${persistentWind!.dayCount} days)\n${persistentWindStr}\n` : ''}
${transportSection}

AREA FIRE PRESSURE (14-day precomputed score at this location)
${pressureScoreStr}

UPWIND EMISSION SOURCES (cities, industrial zones, power plants along trajectory)
${sourcesStr}

BACKGROUND_ONLY: ${trend}

PEER STATIONS WITHIN 75 KM (last 24 h)
${peerStr}

SEASONAL CONTEXT: ${seasonContext}
</scientific_data>

<instructions>
Never narrate the BACKGROUND_ONLY field or reference it in your response — it is for your reasoning only.
${outlierNote ? `${outlierNote}\n\n` : ''}
Write 1–3 short paragraphs in plain English. No markdown, no bullet points — flowing prose only.
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
- The cumulative fire pressure score summarises fire activity along the actual transport path — weight it accordingly.${camsMaxPm25 !== null && camsMaxPm25 < 25 && firePressureNorm >= 40 ? ' However, the CAMS model shows consistently low PM2.5 along the trajectory despite a high fire pressure score — fires are on the flanks of the corridor, not in the core air mass that reached this station. Do not mention fires at all: they are not contributing to current conditions and referencing them adds confusion rather than clarity.' : ''}
- The area fire pressure score shows 14-day accumulated fire activity at this specific location — use it to give context about longer-term fire buildup beyond the recent trajectory window. If both scores are low and no fires are detected, do not mention fires at all. When area fire pressure is high or very high, lead with the sustained local burning story — fires have been burning at or near this location for an extended period, not just today.
- When area fire pressure is < 20 AND trajectory fire pressure is ≥ 70, the response MUST open with a single sentence that states both halves of the contrast together: (a) fires are not burning at this location, AND (b) fires have burned along the upwind path. Both halves must appear in the first sentence — not split across two sentences, not with (b) leading and (a) following. The structure is: "Fires are not burning near this station — but [fire count] have burned along the path the wind took to reach here, [geographic description]." Adapt the wording naturally but preserve the structure: absence first, then presence. In the same paragraph, continue with the proximity detail (nearest fires N km from the path centerline) and the geographic corridor (name the specific countries/regions from the path data). Do NOT apply this framing when: (a) area fire pressure is itself ≥ 20, OR (b) the nearest fire in the data is within 10 km of the station coordinates — in either case, fires are effectively local and the imported framing is wrong.
- Never describe fires as burning "near the station", "at this location", "locally", or "close to here" unless area fire pressure is ≥ 20. When area pressure is low, all proximity language must be anchored to the path's geography, not to the station. Forbidden: "close to the path", "along the route the wind traveled", "N km along the route" — these read as distances from the station. Required form: "fires burning as close as N km from the wind path, concentrated in [region]" where [region] is derived from the coordinates in the fire and path data. The distance (N km) is the nearest fire's distance from the path centerline; the region names where those fires are located geographically.
${slowWindBuildup}
- If fire pressure is 0 and no fires were detected, do not mention fires at all.
- If cumulative fire pressure is below 40 and CAMS values along the trajectory are all below 20 µg/m³, treat fires as not contributing to current conditions and do not mention them.
- The path the air took and the upwind emission sources are two different things. The path shows where the air mass came from geographically. Upwind sources are cities or industrial areas whose emissions are carried to the station by the wind — they may or may not lie on the path itself. Do not describe upwind sources as places the air "passed through", "passed near", "passes nearby", or "moved through on the way" — these imply the source is a waypoint, not an emitter. Frame them as sources adding pollution to the air arriving at the station.
- Order sources using these tiers, resolved in sequence: (1) sources marked [along wind path] and within 150 km — order these by proximity to the station, closest first; (2) sources NOT marked [along wind path] but within 20 km — the station permanently sits in their air shed regardless of wind direction. Any source within 20 km MUST be mentioned as local urban context after any upwind sources — this is not optional. Integrate it into an existing paragraph rather than appending a standalone closing sentence: the peer comparison paragraph (local urban emissions add to what neighbours are measuring) or the fire paragraph (local urban background sits beneath arriving smoke) are the natural homes. A dangling sentence about a city at the end of the response reads as an afterthought; (3) everything else — omit. A source that is neither marked [along wind path] NOR within 20 km of the station must be omitted regardless of its size, population, or capacity — do not include it as a closing sentence, as secondary context, or in any other form. Example: Yangon at 72 km marked [along wind path] is tier 1 and must be mentioned. Chiang Mai at 87 km not marked [along wind path] and not within 20 km is tier 3 — omit it entirely. Distance alone does not qualify a source; the [along wind path] tag or the 20 km threshold must be met. Exception: when cumulative fire pressure is ≥ 70 AND area fire pressure is < 20 (fires are only along the distant upwind path, not local to this area), industrial and urban sources further than 50 km away are background noise — skip them entirely and keep the focus on the imported fire story. This exception does NOT apply when area fire pressure is ≥ 20 — in that case fires are burning in or near this area and upwind urban sources remain relevant context alongside the fire story. Within tier 1, proximity governs order regardless of capacity or population: a 1,878 MW plant 18 km away ranks above a 2,400 MW plant 114 km away. Do not substitute capacity or population for proximity when deciding what to mention first. When multiple sources of the same type are relevant, group them rather than listing individually (e.g., "three coal-fired power plants including BLCP and Gheco One" rather than naming all three separately). When describing an upwind source, frame it as adding pollution to the arriving air — do not use "contribute to air quality" (ambiguous) and do not describe it as "being dispersed" or imply its pollution is blowing away from the station. Use the source type given in the data: a city is a city (reference its population for scale), an industrial zone is an industrial zone, a power plant is a power plant — do not mix up the categories.
- Compare against peer stations. Outlier status is determined solely by whether an outlier note appears in the PEER STATIONS section above — if no such note is present, this station is not an outlier and must not be described as one, regardless of how its reading compares to individual peers. If an outlier note is present, lead with that. When peer stations confirm the reading is regionally representative, summarize them in a single sentence with values inline (e.g., "nearby stations read 19, 18, and 25 µg/m³, confirming the pattern is regional") — do not list each as a separate sentence. When more than 10 peer stations are available, do not name individual stations. When a Distribution by AQI category line is present in the peer data, lead with it — combine the two or three highest-count categories into a single summary count (e.g. "37 of 40 nearby stations read Very unhealthy or Hazardous") before citing the range. Zero-count categories can be omitted. The distribution is more informative than the range alone; include the range only after the distribution summary, and only if the spread adds meaning. Do not open the peer sentence with "conditions similar to its immediate neighbors" and then immediately cite a wide range — pick one framing and be consistent. When naming a station, you MUST include its specific numerical value to one decimal place (e.g., 19.4, not 19). Use active phrasing only: "read" or "recorded X µg/m³" — never "reported" or "measured". When citing any PM2.5 value inline, always include the unit: µg/m³ (e.g., "nearby stations read 19.4, 25.2, and 17.5 µg/m³"). Before describing this station's reading relative to a peer, check the direction: is this station higher or lower than the peer value? State only what the numbers show — do not assume the station is the higher one. When a peer station reads higher than this station, do not use it as evidence that local conditions are elevated — it shows the opposite. Either note the difference ("a nearby station read 34.4 µg/m³, somewhat higher than here") or omit the peer comparison if it adds no useful information. If this station reads noticeably higher than peers (but below the strong outlier threshold), note the gap briefly rather than describing conditions as "consistent across the region" — consistency is only accurate when values are close. When peer stations show a wide spread (e.g., one reads Good and another reads Moderate or higher), note the spread rather than averaging over it — "nearby stations ranged from 11.7 to 34.4 µg/m³" is more honest than implying consistency.
- Recent rain can wash out PM2.5 — mention it only if precipitation is significant (> 5 mm total). If rainfall is negligible, do not mention it. When rain and moderate conditions co-occur, describe them as two independent facts: "over 20 mm of rain has fallen recently" and "conditions are moderate." Do not connect them causally unless stating the physical mechanism directly (rain washes particles from the air) — and even then, state what happened, not what was avoided. High humidity (≥ 85%) may cause optical sensors to over-read.
- ${isStrongOutlier && !isHighOutlier ? 'This station reads far below its neighbours — focus on why it is an outlier, not on whether the absolute level is good or bad.' : currentPm25 > 35 ? 'Conditions are elevated — focus on what explains the reading.' : 'Explain why conditions are currently relatively good: identify the positive explanation — clean marine or oceanic air origin, recent rainfall, or genuinely low regional fire activity. If all active drivers are absent, the honest explanation is clean air origin combined with recent washout — say that directly.'}
- Do not describe the week trend or characterize whether values are rising or falling — the user already sees the 5-day chart. However, if today's reading is substantially lower (> 20 µg/m³) than the average of the preceding days shown in the 7-day averages, you may note this once as context for why the current reading is where it is — frame it as "conditions today are lower than the sustained levels of recent days" without quantifying the change or describing it as a trend.
${trend.startsWith('not significant') ? '- The trend is not significant — do not discuss it at all, not even to note that values are low.' : ''}
- Do not reference specific time windows from the underlying data in your prose (e.g. "last 3 days", "72-hour", "last 24 hours", "past 72 hours", "14 days", "two weeks"). Specific durations appear in the data context above for your reference only — do not quote them verbatim in the response. Use natural language instead ("recently", "over the past few days", "for weeks"). Treat all time windows as minimum durations — the underlying conditions may have persisted longer than what the data captures.
- Describe what is happening, not what was avoided. Do not explain why conditions are not worse, do not name factors as primary or secondary without clear data support, and do not mention what is absent as an explanation. Every sentence should state a positive fact: where the air came from, what it picked up, what the numbers show. Do not end with a summary that contrasts the actual cause against an absent cause (e.g., "driven by X rather than Y", "due to Z, not fires"). End on a concrete fact — a number, a location, a peer comparison — not a process of elimination. Exception: for a strong low outlier, the absence of a local source or regional smoke pathway is itself the finding — state directly what is absent and why the reading is likely anomalous. The existing outlier note above already identifies the candidate explanations (faulty reading, local shielding, reporting error); use those as your positive claims.
${isStrongOutlier ? '- Suggest the most likely explanations for the anomaly.' : ''}${lang === 'th' ? '\nRespond entirely in Thai (ภาษาไทย).' : ''}
</instructions>`;
}
