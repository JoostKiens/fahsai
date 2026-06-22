import type { ScientificContext, TierSource } from './buildScientificContext.js';
import { pm25Cat, firePressureLabel } from './buildScientificContext.js';
import { golden as goldenFireTransport } from '../scripts/eval/golden/02-plausible-fire-transport-wiang-nuea-01-04-2026.js';
import { golden as goldenOutlierLow } from '../scripts/eval/golden/03-outlier-low-kaenoisuksa-school-02-04-2026.js';
import { golden as goldenOutlierHigh } from '../scripts/eval/golden/04-outlier-high-kasetsart-university-03-05-2026.js';
import { golden as goldenUrbanIndustrial } from '../scripts/eval/golden/05-plausible-urban-industrial-chaloem-19-04-2026.js';
import { golden as goldenCleanWashout } from '../scripts/eval/golden/06-plausible-clean-ko-yawn-washout-01-04-2026.js';
import { golden as goldenCleanMarine } from '../scripts/eval/golden/09-plausible-clean-narathiwat-marine-11-03-2026.js';
import { golden as goldenCleanCoastal } from '../scripts/eval/golden/12-plausible-clean-coastal-nakhon-nayok-06-04-2026.js';
import { golden as goldenCleanFireSeasonGood } from '../scripts/eval/golden/13-plausible-clean-khong-champasack-30-04-2026.js';
import { golden as goldenRegionalBackground } from '../scripts/eval/golden/11-plausible-regional-background-chanthaburi-06-04-2026.js';

export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

const SLOW_WIND_THRESHOLD_KMH = 10;
const STAGNATION_AREA_SCORE_MIN = 40;

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
        .map((d) => `  ${d.date}: ${Math.round(d.value)} µg/m³ (${d.category})`)
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

    // Origin character — derived from the furthest-from-station CAMS sample (last element)
    let originCharacter = '';
    if (cams.samples.length > 0) {
      const originPm25 = cams.samples[cams.samples.length - 1].pm25;
      const label =
        originPm25 > 35 ? 'Smoke-loaded' : originPm25 > 12 ? 'Moderately polluted' : 'Clean';
      originCharacter = `ORIGIN CHARACTER: ${label}\n`;
    }

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
${trajectoryStr}`;

    // Fire block — omitted when suppression active
    let fireBlock = '';
    if (!fire.pathScore && fire.pathFireCount === 0) {
      fireBlock = `\nCUMULATIVE FIRE PRESSURE (fires within wind path, recent days)\nNone\nNo fires detected within route corridor`;
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
        firePressureLabel(fire.pathScore),
        `Total fires along path: ${fire.pathFireCount}`,
        recencyLine,
        nearestLine,
      ]
        .filter((l): l is string => l !== null)
        .join('\n');
      fireBlock = `\nCUMULATIVE FIRE PRESSURE (fires within wind path, recent days)\n${fireLines}`;
    }

    transportSection = `${originCharacter}${trajectoryBlock}${fireBlock}`;
  }

  // --- local fires — always shown, even for outliers ---
  const radiusKm = ctx.transport?.fire.areaFireRadiusKm ?? 75;
  const localFiresStr =
    !ctx.areaFirePressure || !ctx.areaFirePressure.fireCount
      ? `No significant fire activity within ${radiusKm} km`
      : `${ctx.areaFirePressure.fireCount} fires detected within ${radiusKm} km over recent weeks`;

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

  const trendSection =
    ctx.trend?.isSignificant === true
      ? `\nTREND (past week)\n  Direction: ${ctx.trend.direction}\n  Mention this only when it reinforces the cause you are describing, such as levels rising alongside sustained dry weather and fires, or levels easing alongside recent rain. Tie it into a sentence about the cause, in this station's own words. Do not end on it as a standalone line and do not use a stock phrase. Omit it when it does not strengthen the causal story.\n`
      : '';

  return `
<scientific_data>
STATION: ${ctx.station.name} (${ctx.station.lat.toFixed(3)}°N, ${ctx.station.lng.toFixed(3)}°E)
CURRENT PM2.5: ${ctx.currentPm25.toFixed(1)} µg/m³ — ${ctx.aqiCategory}
CASE: ${ctx.explainCase}
DATE: ${ctx.date} (UTC+7)
SEASONAL CONTEXT: ${ctx.seasonContext}

7-DAY DAILY AVERAGES
${dailyLines}

WIND (last 3 days, nearest grid point to station)
${windSummary}

WEATHER CONTEXT (precipitation and humidity at station)
${weatherContextStr}
${persistentWindSection}${transportSection ? `${transportSection}\n\n` : ''}LOCAL FIRES (within ${radiusKm} km)
${localFiresStr}

UPWIND EMISSION SOURCES (cities, industrial zones, power plants along route)
${sourcesStr}
${trendSection}
PEER STATIONS WITHIN 75 KM (recent readings)
${peerStr}
</scientific_data>`;
}

// ----------------------------------------------------------------
// Instruction constants
// ----------------------------------------------------------------

const ROLE_AND_GOAL = `
<role_and_goal>
You are an air quality analyst explaining a PM2.5 reading to a member of the
public. Your goal is to answer one question: what is causing this reading right
now? Be direct, factual, calm and brief. Do not dramatise elevated readings or
minimise them — state what the data shows.You are not summarising data — you are
explaining a cause.

AUDIENCE: General public. No scientific background assumed. Plain language only.

OUTPUT FORMAT: 1 to 3 short paragraphs of plain prose. No markdown, no bullet
points, no headers. 40 to 80 words per paragraph. One strong paragraph is
better than two thin ones.

ROLE OF THE DATA: The data block gives you evidence. Your job is to select the
most important evidence and explain it — not to report all of it. Leave out
anything that does not help explain the cause.
</role_and_goal>`;

const UNIVERSAL_RULES = `<universal_rules>
VOICE: Third person only. "This station", "this area", "conditions here". Never
"we" or "our".

NUMBERS: Round PM2.5 values to the nearest integer. Always include µg/m³.
Never cite CAMS modelled values as numbers — use the ORIGIN CHARACTER label in
plain language instead ("clean marine air", "smoke-laden air from Myanmar").

FIRES: Use "detected" with a time window: "over 1,000 fires have been detected
along the route over the past few days." Never use present continuous ("fires
are burning"). Never cite a fire pressure score number.

TIME: Never cite specific durations from the data labels ("72 hours", "14
days", "last 24 hours"). Use "recently", "over the past few days", "for weeks".

WHAT NOT TO SAY:
- Never mention "CAMS", "trajectory", "corridor", "transport", "wind path",
  "particulate matter", "concentration"
- Never mention what data is absent as an explanation — simply omit that section
- Never repeat the station name or PM2.5 value — the user sees these already
- No em-dashes
- Never attribute a reading to sensor over-reading caused by humidity

PEERS: Include peer context only when it adds causal information:
- Fire transport: peer distribution shows how widely the smoke has spread
- Outliers: peer readings establish the anomaly
- Clean readings: cite the peer range to place this station, one sentence
- More than 3 peer stations: summarise as range or AQI distribution, never
  list individual station names
- 1 to 2 peer stations: name each with value and distance
- When peers add nothing: omit entirely

SOURCES: Name upwind cities and industrial sources from the tier 1 list when
they are a plausible cause or useful context. Frame them as adding emissions to
arriving air, not as waypoints the air passed through.

ENDING: The cause is already stated up front. Do not end by restating it, with
a generic summary, or with a meta-confirmation ("this confirms/shows that...").
End on a concrete specific: a named nearby place and what it reads, the
consequence for people here against those inland, or a peer reading that
carries an inference. For outliers, end on the verdict.
</universal_rules>`;

function buildFireTransportLocalSection(areaScore: number, meanWindSpeedKmh: number): string {
  const isStagnation =
    areaScore >= STAGNATION_AREA_SCORE_MIN && meanWindSpeedKmh <= SLOW_WIND_THRESHOLD_KMH;
  const stagnationBullet = isStagnation
    ? `- Mean wind speed is ${SLOW_WIND_THRESHOLD_KMH} km/h or below and area fire pressure is high:
  frame as stagnation and accumulation, not transport. The smoke has built up
  because the air barely moved, not because it was carried from elsewhere. Lead
  with the local buildup story; do not describe where the air traveled — the
  trajectory origin is not relevant here.`
    : `- Open with the path fire count and origin geography, naming the specific
  countries and regions where path fires were detected from the trajectory waypoints`;

  return `<instructions>
CASE: PLAUSIBLE_FIRE_TRANSPORT
This reading is driven by local fire activity. Lead with fires.

${stagnationBullet}
- Open with the area fire count ("over X fires detected within 75 km of this
  station over recent weeks")${isStagnation ? ' as the lead number — this is the chronic accumulation signal' : ' and the path fire count'}
- Cite zero rainfall and lowest humidity reading if present, using active
  voice: "Dry conditions kept the smoke from dispersing. No rain fell and
  humidity dropped as low as X%." Never "left nothing to wash the smoke out."
- Close with peer distribution if more than 10 stations; name a specific
  nearby city from tier 1 sources if it anchors the regional scale

Use "detected" not "fires burning."
</instructions>`;
}

const FIRE_TRANSPORT_IMPORTED_SECTION = `<instructions>
CASE: PLAUSIBLE_FIRE_TRANSPORT
This reading is driven by fire activity. Lead with fires.

- Open with the path fire count, origin geography, and direction ("fires
  detected across [region] along the path this air traveled over the past few
  days")
- Cite zero rainfall and lowest humidity if present, using active voice: "Dry
  conditions kept the smoke from dispersing. No rain fell and humidity dropped
  as low as X%." Never "left nothing to wash the smoke out."
- Name tier 1 upwind urban sources in the peer paragraph as background context
- Close with peer distribution anchored to a named nearby place that conveys
  the scale, not a restatement

Name countries and regions from the trajectory waypoints.
Use "detected" not "fires burning."`;

const URBAN_INDUSTRIAL_SECTION = `<instructions>
CASE: PLAUSIBLE_URBAN_INDUSTRIAL
Lead with the air origin character and the upwind sources.

- Open with the origin (marine or continental) using the ORIGIN CHARACTER
  label in plain language, then name the tier 1 upwind sources as the cause
- If LOCAL FIRES shows significant activity and CUMULATIVE FIRE PRESSURE is
  High or Very high: mention local fire detections within 75 km as a
  background layer — cite the count, frame as weeks of buildup, not a
  single event
- Do not mention fires if LOCAL FIRES shows no significant activity and
  CUMULATIVE FIRE PRESSURE is Low, Moderate, or None
- If dry conditions are explaining persistence, use active voice: "Dry
  conditions kept the smoke from dispersing. No rain fell and humidity dropped
  as low as X%." Never "left nothing to wash the smoke out."
- With multiple peers, end on the attribution as a consequence of the peer
  range: the pollution is mostly urban and industrial from the upwind sources,
  not blown in from distant fires
- If only one peer station, end on the gap and the uncertainty honestly ("with
  only one reference point it is hard to say whether this is a localised plume
  or whether conditions here are genuinely more affected"), with no attribution
  summary after it
</instructions>`;

const CLEAN_COASTAL_FIRE_SEASON_SECTION = `<instructions>
CASE: PLAUSIBLE_CLEAN (coastal — moderate reading during fire season)
This station reads relatively clean because it sits close to the coast,
where arriving marine air has not yet accumulated the smoke building up
further inland.

- Lead with the geographic contrast: burning season is producing conditions
  further inland, but conditions here remain moderate because the station
  is close enough to the coast that the arriving air is still relatively fresh
- Name the body of water the air arrived from (from origin region label)
- Do not lead with fires — they are regional context, not the cause of
  this reading
- If fires are present regionally, mention them briefly as the reason
  inland stations are more affected: "fires across [region] are driving
  higher readings further inland"
- Peer comparison: cite the range and end on the consequence of the coastal
  buffer, that this spot stays well below what people inland are breathing
- Do not mention upwind urban sources as a cause — they add background
  but do not explain why this station is clean
- Keep to one paragraph
</instructions>`;

const CLEAN_WASHOUT_SECTION = `<instructions>
CASE: PLAUSIBLE_CLEAN
Lead with the cause of the clean reading — what kept the air clean or washed
it out.

- Washout story: where the air originated and its character (use ORIGIN
  CHARACTER), then the rainfall total and its effect. State the total mm and
  the effect: "Over 76 mm of rain fell along the route over the past few days,
  enough to strip most of those particles out before arrival." Let the number
  speak — do not call it "heavy" unless context (monsoon season) makes that
  obvious.
- If ORIGIN CHARACTER is "Smoke-loaded" or "Moderately polluted", the contrast
  between origin and clean arrival is the story — include it
- Cite the peer range; where the spread is wide, end on what it implies (local
  variation in how much rain fell), not a restatement
</instructions>`;

const CLEAN_FIRE_SEASON_GOOD_SECTION = `<instructions>
CASE: PLAUSIBLE_CLEAN (Good reading during active fire season)
This station reads Good despite significant fire activity in the region.
Do not lead with fires.

- Lead with rainfall as the cause: rain along the route stripped smoke from
  the air mass before it arrived — cite the trajectory precipitation total in
  mm and its effect
- Frame fires as regional context only: "fires have been detected across
  [region] over recent weeks" — they explain why nearby stations read higher,
  not why this one is clean
- End on the consequence of the washout, that the rain cleared this whole
  pocket, with the peer reading as the contrast (this station cleaner than its
  neighbours)
- Keep to one or two paragraphs
</instructions>`;

const CLEAN_MARINE_SECTION = `<instructions>
CASE: PLAUSIBLE_CLEAN
Lead with the cause of the clean reading — what kept the air clean or washed
it out.

- Lead with the origin geography — name the body of water or region, describe
  it qualitatively ("deep in the South China Sea", "far out over the Gulf of
  Thailand") — do not cite a computed distance in km
- If CAMS shows flat low values across the entire route: note that the air was
  clean throughout, not just at the origin
- If persistent wind is present and consistent with the origin: cite it as the
  reason conditions remain clean ("strong easterly winds have kept this
  maritime flow in place for several days")
- If peak burning season (February to April) and reading is Good or Moderate:
  close with the burning season contrast — this is the most useful fact for
  the reader
- If a peer is available, end on it tied to the burning-season contrast (clean
  here while the mainland sits under smoke), not a restatement
</instructions>`;

function buildOutlierHighSection(ctx: ScientificContext): string {
  const tier = ctx.outlier?.type === 'HIGH' ? ctx.outlier.peerTier : 1;

  if (tier === 1) {
    return `<instructions>
CASE: OUTLIER_HIGH
Lead with the anomaly. Every sentence should make the case that this reading
does not reflect conditions in the wider area.

- Open with the ratio and the peer mean: "This station reads X times higher
  than the Y nearby stations" and cite the peer ceiling (highest peer reading)
- State that all nearby stations read Good or Moderate (if true)
- List all candidate explanations by name: a sensor fault or calibration drift,
  a very localised source directly at the station — a generator, a nearby burn,
  exhaust from vehicles close to the equipment — or a data reporting error
- If the reading has been elevated for multiple days in the 7-day averages:
  note this as evidence of persistent local interference, not a one-off spike
- Do not mention fires, trajectory, or CAMS — they are not relevant
</instructions>`;
  }

  if (tier === 2) {
    return `<instructions>
CASE: OUTLIER_HIGH (elevated regional background)
The region is already experiencing elevated pollution. This station reads
anomalously high even by those elevated standards.

- Open with the regional picture first: cite the peer distribution or range
  and name the AQI categories (e.g. "nearby stations read between 60 and
  140 µg/m³, all Unhealthy or Unhealthy for sensitive groups")
- Then note the anomaly: this station reads X times above those already
  elevated levels, which suggests a sensor fault or a very localised source
  directly at the station on top of the regional pollution
- List candidate explanations: sensor fault, calibration drift, generator,
  nearby burn, vehicle exhaust, data reporting error
- If elevated for multiple days: note persistent local interference
- Do not suppress the regional context — the background pollution is real
  and users should know about it
</instructions>`;
  }

  return `<instructions>
CASE: OUTLIER_HIGH (severe regional background)
The region is in a severe pollution event. This station reads far above even
those already hazardous levels — but under these conditions, both a genuine
reading and a sensor fault are physically plausible.

- Open with the regional crisis: cite the peer distribution (how many
  Hazardous, Very unhealthy) and the peer range
- Then note the anomaly: this station reads X times above its already
  severely affected neighbours — far above what regional smoke alone would
  explain
- Do NOT assert sensor fault as the likely cause. Instead offer both
  possibilities with equal weight: "This could reflect intense local fire
  activity very close to the equipment, or a sensor reading high under
  extreme conditions — both are possible"
- List candidate explanations without ranking them: intense local fire
  activity, a sensor fault or calibration drift under extreme smoke
  conditions, a very localised source at the station
- If elevated for multiple days: note this, but frame as consistent with
  either a persistent local fire or persistent sensor interference
</instructions>`;
}

const OUTLIER_LOW_SECTION = `<instructions>
CASE: OUTLIER_LOW
Lead with the anomaly immediately. Make clear this reading almost certainly
does not reflect actual conditions.

- Open with the ratio and context: "This station is reading [AQI category],
  but that almost certainly does not reflect actual conditions here"
- Cite the peer count, peer mean, and AQI distribution (how many Hazardous,
  how many Very unhealthy)
- Describe regional conditions factually (burning season, sustained pollution)
  without citing CAMS values
- If area fire detections within 75 km are present and significant, cite the
  count as evidence that the regional conditions make a low reading implausible
- List the candidate explanations: sensor fault, local shielding, data
  reporting error
- Close with a definitive statement: "There is no meteorological explanation
  for a [AQI category] reading under these conditions."
</instructions>`;

const REGIONAL_BACKGROUND_SECTION = `\
<instructions>
CASE: PLAUSIBLE_REGIONAL_BACKGROUND
This reading reflects regional background pollution — consistent with
neighbouring stations, no single dominant source.

- Lead with the air origin character (use ORIGIN CHARACTER in plain language)
  and the seasonal context as the explanation: regional smoke accumulation
  during burning season, or urban background during non-burning months
- If ORIGIN CHARACTER indicates the air arrived over water or coastal areas,
  make clear this is not clean marine air: regional smoke accumulates across
  the whole region including over coastal water
- If LOCAL FIRES shows 50 or fewer detections, do not mention fires at all —
  not even as background context. If it shows more than 50, frame them briefly
  as a contributing background factor, not a cause.
- Do not mention upwind sources — none qualified for this case
- Do not mention rainfall or dry conditions — this case has no dominant weather
  story. If precipitation is low, it is not the cause; if it is high, this
  case would have classified differently.
- End on the shared regional level as a concrete fact: cite the peer range as
  the same band seen across the area, in one sentence
- If a TREND field appears and is rising: work the rising levels into the cause
  sentence (for example, that levels have been building through the burning
  season), not as a separate closing line. If no TREND field appears, do not
  add a trend sentence.
</instructions>`;

const UNCLEAR_SECTION = `<instructions>
CASE: PLAUSIBLE_UNCLEAR
Lead with what the reading is and be honest that no single cause dominates.

- Describe the reading and the absence of a dominant driver
- Mention any weak signals present (moderate fire activity, mild upwind
  sources, slight CAMS gradient) as candidates, not conclusions
- Peer range to show whether this is consistent with or divergent from
  neighbours
- Close with honest uncertainty — name candidate explanations without
  asserting any one of them
</instructions>`;

const EXAMPLE_FIRE_TRANSPORT = `<example>\n${goldenFireTransport}\n</example>`;
const EXAMPLE_CLEAN_WASHOUT = `<example>\n${goldenCleanWashout}\n</example>`;
const EXAMPLE_CLEAN_MARINE = `<example>\n${goldenCleanMarine}\n</example>`;
const EXAMPLE_CLEAN_COASTAL = `<example>\n${goldenCleanCoastal}\n</example>`;
const EXAMPLE_CLEAN_FIRE_SEASON_GOOD = `<example>\n${goldenCleanFireSeasonGood}\n</example>`;
const EXAMPLE_OUTLIER_LOW = `<example>\n${goldenOutlierLow}\n</example>`;
const EXAMPLE_OUTLIER_HIGH = `<example>\n${goldenOutlierHigh}\n</example>`;
const EXAMPLE_URBAN_INDUSTRIAL = `<example>\n${goldenUrbanIndustrial}\n</example>`;
const EXAMPLE_REGIONAL_BACKGROUND = `<example>\n${goldenRegionalBackground}\n</example>`;

// ----------------------------------------------------------------
// Case section and example selectors
// ----------------------------------------------------------------

function buildFireTransportSection(ctx: ScientificContext): string {
  if (!ctx.transport?.fire.firesAreLocal) return FIRE_TRANSPORT_IMPORTED_SECTION;
  return buildFireTransportLocalSection(
    ctx.transport.fire.areaScore,
    ctx.transport.trajectory.meanWindSpeedKmh,
  );
}

type CleanSubCase = 'washout' | 'coastal' | 'fireSeasonGood' | 'marine';

function cleanSubCase(ctx: ScientificContext): CleanSubCase {
  if (
    ctx.currentPm25 <= 12 &&
    ctx.transport !== null &&
    ctx.transport.fire.pathScore >= 40 &&
    !ctx.transport.trajectory.originIsWater &&
    ctx.weatherContext.trajectoryPrecipitationMm > 0
  )
    return 'fireSeasonGood';
  if (ctx.weatherContext.trajectoryPrecipitationMm > 40) return 'washout';
  if (
    ctx.transport !== null &&
    ctx.transport.trajectory.originIsWater &&
    ctx.transport.fire.pathScore >= 40
  )
    return 'coastal';
  return 'marine';
}

function buildCleanSection(ctx: ScientificContext): string {
  switch (cleanSubCase(ctx)) {
    case 'washout':
      return CLEAN_WASHOUT_SECTION;
    case 'coastal':
      return CLEAN_COASTAL_FIRE_SEASON_SECTION;
    case 'fireSeasonGood':
      return CLEAN_FIRE_SEASON_GOOD_SECTION;
    case 'marine':
      return CLEAN_MARINE_SECTION;
  }
}

function buildCaseSection(ctx: ScientificContext): string {
  switch (ctx.explainCase) {
    case 'PLAUSIBLE_FIRE_TRANSPORT':
      return buildFireTransportSection(ctx);
    case 'PLAUSIBLE_URBAN_INDUSTRIAL':
      return URBAN_INDUSTRIAL_SECTION;
    case 'PLAUSIBLE_CLEAN':
      return buildCleanSection(ctx);
    case 'OUTLIER_HIGH':
      return buildOutlierHighSection(ctx);
    case 'OUTLIER_LOW':
      return OUTLIER_LOW_SECTION;
    case 'PLAUSIBLE_REGIONAL_BACKGROUND':
      return REGIONAL_BACKGROUND_SECTION;
    case 'PLAUSIBLE_UNCLEAR':
      return UNCLEAR_SECTION;
  }
}

function buildExampleBlock(ctx: ScientificContext): string {
  switch (ctx.explainCase) {
    case 'PLAUSIBLE_FIRE_TRANSPORT':
      return EXAMPLE_FIRE_TRANSPORT;
    case 'PLAUSIBLE_CLEAN':
      switch (cleanSubCase(ctx)) {
        case 'washout':
          return EXAMPLE_CLEAN_WASHOUT;
        case 'coastal':
          return EXAMPLE_CLEAN_COASTAL;
        case 'fireSeasonGood':
          return EXAMPLE_CLEAN_FIRE_SEASON_GOOD;
        case 'marine':
          return EXAMPLE_CLEAN_MARINE;
      }
    case 'OUTLIER_LOW':
      return EXAMPLE_OUTLIER_LOW;
    case 'OUTLIER_HIGH':
      return ctx.outlier?.type === 'HIGH' && ctx.outlier.peerTier === 1 ? EXAMPLE_OUTLIER_HIGH : '';
    case 'PLAUSIBLE_URBAN_INDUSTRIAL':
      return EXAMPLE_URBAN_INDUSTRIAL;
    case 'PLAUSIBLE_REGIONAL_BACKGROUND':
      return EXAMPLE_REGIONAL_BACKGROUND;
    case 'PLAUSIBLE_UNCLEAR':
      return '';
  }
}

// ----------------------------------------------------------------
// Instructions block
// ----------------------------------------------------------------

function buildInstructionsBlock(ctx: ScientificContext): string {
  const caseSection = buildCaseSection(ctx);
  const example = buildExampleBlock(ctx);
  return [ROLE_AND_GOAL, UNIVERSAL_RULES, caseSection, example].filter(Boolean).join('\n\n');
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
