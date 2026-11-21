// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { describe, it, expect } from 'vitest';
import { urlDateGuardScript } from './urlDateGuard';

function guardFlagsUrlDate(search: string) {
  let isFlagged = false;
  runInNewContext(urlDateGuardScript, {
    location: { search },
    URLSearchParams,
    document: {
      documentElement: {
        setAttribute: (name: string) => {
          isFlagged = name === 'data-url-date';
        },
      },
    },
  });
  return isFlagged;
}

describe('URL date guard script', () => {
  it.each(['?date=2026-11-01', '?lat=15.5000&lng=101.0000&zoom=5.50&date=2026-11-03'])(
    'flags a link to a date: %j',
    (search) => {
      expect(guardFlagsUrlDate(search)).toBe(true);
    },
  );

  // The stores ignore these, so the scrubber starts on the latest day, as the server rendered it.
  it.each(['', '?lat=18.8&lng=98.9&zoom=9', '?date=', '?date=2026-11-1', '?date=01-11-2026x'])(
    'leaves a link without a usable date alone: %j',
    (search) => {
      expect(guardFlagsUrlDate(search)).toBe(false);
    },
  );
});
