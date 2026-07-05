import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildScientificContext } from '../../lib/buildScientificContext.js';
import { buildPrompt, GEMINI_MODEL } from '../../lib/buildPrompt.js';
import type { ExplainFixture } from './types.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));

// Fixtures and their goldens are matched 1:1 by filename — add a pair of files
// under fixtures/ and golden/ to add a new case, no registration needed here.
const fixtureFiles = readdirSync(path.join(DIR, 'fixtures'))
  .filter((f) => f.endsWith('.ts'))
  .sort();

const ALL_FIXTURES: ExplainFixture[] = await Promise.all(
  fixtureFiles.map(async (f) => {
    const mod = (await import(`./fixtures/${f}`)) as { fixture: ExplainFixture };
    return mod.fixture;
  }),
);

async function loadGolden(id: string): Promise<string> {
  if (!existsSync(path.join(DIR, 'golden', `${id}.ts`))) return `[NO GOLDEN: ${id}]`;
  return ((await import(`./golden/${id}.ts`)) as { golden: string }).golden;
}

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

async function runExplain(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

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

  const golden = await loadGolden(fixture.id);

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
