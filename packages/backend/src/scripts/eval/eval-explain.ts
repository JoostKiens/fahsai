import { readFileSync } from 'fs';
import { join } from 'path';

export function loadGolden(id: string): string {
  return readFileSync(join(import.meta.dirname, 'golden', `${id}.txt`), 'utf-8').trim();
}
