import { describe, it, expect } from 'vitest';
import { serializeJsonLd } from './jsonLd';

describe('serializeJsonLd', () => {
  it('is JSON that reads back to the same data', () => {
    const data = { '@type': 'Place', name: 'Chiang Mai', n: 1 };

    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it('cannot end the script element it sits in', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' });

    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' });
  });
});
