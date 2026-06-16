import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildScientificContext } from '../../lib/buildScientificContext.js';
import { buildPrompt } from '../../lib/buildPrompt.js';
import { golden as g01 } from './golden/01-plausible-clean-phetbura-garden-31-05-2026.js';
import { golden as g02 } from './golden/02-plausible-fire-transport-wiang-nuea-01-04-2026.js';
import { golden as g03 } from './golden/03-outlier-low-kaenoisuksa-school-02-04-2026.js';
import { golden as g04 } from './golden/04-outlier-high-kasetsart-university-03-05-2026.js';
import { golden as g05 } from './golden/05-plausible-urban-industrial-chaloem-19-04-2026.js';
import { golden as g06 } from './golden/06-plausible-clean-ko-yawn-washout-01-04-2026.js';
import { golden as g07 } from './golden/07-plausible-urban-industrial-hana-01-04-2026.js';
import { golden as g08 } from './golden/08-plausible-clean-usu-13-05-2026.js';
import { golden as g09 } from './golden/09-plausible-clean-narathiwat-marine-11-03-2026.js';
import { golden as g10 } from './golden/10-plausible-fire-transport-ratchapracha-31-03-2026.js';
import { golden as g11 } from './golden/11-plausible-regional-background-chanthaburi-06-04-2026.js';
import { golden as g12 } from './golden/12-plausible-clean-coastal-nakhon-nayok-06-04-2026.js';

const GOLDENS: Record<string, string> = {
  '01-plausible-clean-phetbura-garden-31-05-2026': g01,
  '02-plausible-fire-transport-wiang-nuea-01-04-2026': g02,
  '03-outlier-low-kaenoisuksa-school-02-04-2026': g03,
  '04-outlier-high-kasetsart-university-03-05-2026': g04,
  '05-plausible-urban-industrial-chaloem-19-04-2026': g05,
  '06-plausible-clean-ko-yawn-washout-01-04-2026': g06,
  '07-plausible-urban-industrial-hana-01-04-2026': g07,
  '08-plausible-clean-usu-13-05-2026': g08,
  '09-plausible-clean-narathiwat-marine-11-03-2026': g09,
  '10-plausible-fire-transport-ratchapracha-31-03-2026': g10,
  '11-plausible-regional-background-chanthaburi-06-04-2026': g11,
  '12-plausible-clean-coastal-nakhon-nayok-06-04-2026': g12,
};

// Static imports — add new fixtures here as they are created
import { fixture as f01 } from './fixtures/01-plausible-clean-phetbura-garden-31-05-2026.js';
import { fixture as f02 } from './fixtures/02-plausible-fire-transport-wiang-nuea-01-04-2026.js';
import { fixture as f03 } from './fixtures/03-outlier-low-kaenoisuksa-school-02-04-2026.js';
import { fixture as f04 } from './fixtures/04-outlier-high-kasetsart-university-03-05-2026.js';
import { fixture as f05 } from './fixtures/05-plausible-urban-industrial-chaloem-19-04-2026.js';
import { fixture as f06 } from './fixtures/06-plausible-clean-ko-yawn-washout-01-04-2026.js';
import { fixture as f07 } from './fixtures/07-plausible-urban-industrial-hana-01-04-2026.js';
import { fixture as f08 } from './fixtures/08-plausible-clean-usu-13-05-2026.js';
import { fixture as f09 } from './fixtures/09-plausible-clean-narathiwat-marine-11-03-2026.js';
import { fixture as f10 } from './fixtures/10-plausible-fire-transport-ratchapracha-31-03-2026.js';
import { fixture as f11 } from './fixtures/11-plausible-regional-background-chanthaburi-06-04-2026.js';
import { fixture as f12 } from './fixtures/12-plausible-clean-coastal-nakhon-nayok-06-04-2026.js';

const ALL_FIXTURES = [f01, f02, f03, f04, f05, f06, f07, f08, f09, f10, f11, f12];

// ----------------------------------------------------------------
// CLI flags
// ----------------------------------------------------------------

const INTER_FIXTURE_DELAY_MS = 4500; // stay under 15 RPM free-tier limit

const args = process.argv.slice(2);
const fixtureFilter = args.find((a) => a.startsWith('--fixture='))?.split('=')[1];
const lang = args.find((a) => a.startsWith('--lang='))?.split('=')[1];
const noStream = args.includes('--no-stream');
const showPrompt = args.includes('--show-prompt');
const promptsOnly = args.includes('--prompts-only');

const fixtures = fixtureFilter
  ? ALL_FIXTURES.filter((f) => f.id.startsWith(fixtureFilter))
  : ALL_FIXTURES;

if (!fixtures.length) {
  console.error(`No fixtures matched filter: ${fixtureFilter}`);
  process.exit(1);
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function loadGolden(id: string): string {
  return GOLDENS[id] ?? `[NO GOLDEN: ${id}]`;
}

async function runExplain(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

  if (noStream) {
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  const result = await model.generateContentStream(prompt);
  let text = '';
  for await (const chunk of result.stream) {
    text += chunk.text();
  }
  return text;
}

// ----------------------------------------------------------------
// Main
// ----------------------------------------------------------------

const DIVIDER = '='.repeat(60);
const SUBDIV = '-'.repeat(60);

for (const fixture of fixtures) {
  console.log(`\n${DIVIDER}`);
  console.log(`FIXTURE : ${fixture.id}`);
  console.log(`CASE    : ${fixture.case}`);
  console.log(`DESC    : ${fixture.description}`);

  const prompt = buildPrompt(buildScientificContext(fixture.input), lang ?? 'en');

  if (promptsOnly) {
    console.log(`\n${DIVIDER}`);
    console.log(`FIXTURE : ${fixture.id}`);
    console.log(`CASE    : ${fixture.case}`);
    console.log('\nPROMPT:');
    console.log(prompt);
    continue;
  }

  const golden = loadGolden(fixture.id);

  if (showPrompt) {
    console.log(SUBDIV);
    console.log('\nPROMPT:');
    console.log(prompt);
  }

  console.log(SUBDIV);
  console.log('\nEXPECTED:');
  console.log(golden);
  console.log(SUBDIV);

  let actual: string | null = null;
  try {
    actual = await runExplain(prompt);
  } catch (err) {
    console.error(`\nERROR: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (actual !== null) {
    console.log('\nACTUAL:');
    console.log(actual);
    console.log(DIVIDER);
  }

  if (fixtures.indexOf(fixture) < fixtures.length - 1) {
    await new Promise((resolve) => setTimeout(resolve, INTER_FIXTURE_DELAY_MS));
  }
}

console.log(`\nDone. ${fixtures.length} fixture(s) run.`);
