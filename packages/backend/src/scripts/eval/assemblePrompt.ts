import type { RawExplainData } from './types.js';
import { buildScientificContext } from '../../lib/buildScientificContext.js';
import { buildPrompt } from '../../lib/buildPrompt.js';

export function assemblePrompt(input: RawExplainData, lang?: string): string {
  const ctx = buildScientificContext(input);
  return buildPrompt(ctx, lang ?? 'en');
}
