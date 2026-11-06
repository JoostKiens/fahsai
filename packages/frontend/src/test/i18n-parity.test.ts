import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const dir = dirname(fileURLToPath(import.meta.url));

function keys(relPath: string): string[] {
  const json = JSON.parse(readFileSync(resolve(dir, relPath), 'utf-8')) as Record<string, unknown>;
  return Object.keys(json).sort();
}

describe('i18n key parity', () => {
  it('th.json has exactly the same top-level keys as en.json', () => {
    expect(keys('../locales/th.json')).toEqual(keys('../locales/en.json'));
  });

  // th.json carries English copies of every city.* entry until the Thai city pages are written.
  it.todo('translate the city.* entries in th.json (JOO-101); they are English placeholders');
});
