import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { allowSlowConnects } from './network.js';

describe('allowSlowConnects', () => {
  const originalTimeoutMs = net.getDefaultAutoSelectFamilyAttemptTimeout();

  afterEach(() => {
    net.setDefaultAutoSelectFamilyAttemptTimeout(originalTimeoutMs);
  });

  it('gives every address 2 s to connect instead of the 250 ms default', () => {
    allowSlowConnects();

    expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBe(2_000);
  });
});
