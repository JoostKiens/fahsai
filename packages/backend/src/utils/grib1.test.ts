import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeGrib1 } from './grib1.js';

// Fixture: the first 3 of 24 messages of a CAMS PM2.5 file from the Copernicus ADS (12 UTC run of
// 2026-11-05, lead hours 6, 12, 18). Golden values come from eccodes (Python) on the same bytes.
type Golden = {
  P1: number;
  Ni: number;
  Nj: number;
  latitudeOfFirstGridPointInDegrees: number;
  longitudeOfFirstGridPointInDegrees: number;
  iDirectionIncrementInDegrees: number;
  jDirectionIncrementInDegrees: number;
  count: number;
  min: number;
  max: number;
  sum: number;
  samples: Record<string, number>;
};

const fixtureDir = new URL('./__fixtures__/', import.meta.url);
const grib = readFileSync(new URL('cams-pm25-3h.grib', fixtureDir));
const golden = JSON.parse(
  readFileSync(new URL('cams-pm25-3h.golden.json', fixtureDir), 'utf8'),
) as Golden[];

// Relative difference: values are ~1e-8 kg/m³, so an absolute tolerance would hide errors.
function expectClose(actual: number, expected: number) {
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(1e-9);
}

describe('decodeGrib1', () => {
  const messages = decodeGrib1(grib);

  it('decodes every message in the buffer', () => {
    expect(messages).toHaveLength(3);
  });

  it('reads the grid geometry and lead hour', () => {
    messages.forEach((m, i) => {
      const g = golden[i];
      expect(m).toMatchObject({
        ni: g.Ni,
        nj: g.Nj,
        leadHour: g.P1,
        lat1: g.latitudeOfFirstGridPointInDegrees,
        lng1: g.longitudeOfFirstGridPointInDegrees,
        dLat: g.jDirectionIncrementInDegrees,
        dLng: g.iDirectionIncrementInDegrees,
      });
    });
  });

  it('decodes the sampled values like eccodes', () => {
    messages.forEach((m, i) => {
      expect(m.values).toHaveLength(golden[i].count);
      Object.entries(golden[i].samples).forEach(([index, expected]) => {
        expectClose(m.values[Number(index)], expected);
      });
    });
  });

  it('matches eccodes on min, max and sum', () => {
    messages.forEach((m, i) => {
      expectClose(Math.min(...m.values), golden[i].min);
      expectClose(Math.max(...m.values), golden[i].max);
      expectClose(
        m.values.reduce((a, b) => a + b, 0),
        golden[i].sum,
      );
    });
  });
});

describe('decodeGrib1 on input it cannot decode', () => {
  const first = grib.subarray(0, grib.readUIntBE(4, 3));

  it('rejects data that is not GRIB', () => {
    expect(() => decodeGrib1(Buffer.from('not a grib file at all'))).toThrow(/GRIB/);
  });

  it('rejects edition 2', () => {
    const copy = Buffer.from(first);
    copy[7] = 2;
    expect(() => decodeGrib1(copy)).toThrow(/edition/);
  });

  it('rejects a truncated message', () => {
    expect(() => decodeGrib1(first.subarray(0, first.length - 100))).toThrow(/truncated/);
  });

  it('rejects a message without the 7777 end marker', () => {
    const copy = Buffer.from(first);
    copy[copy.length - 1] = 0;
    expect(() => decodeGrib1(copy)).toThrow(/7777/);
  });

  it('rejects a bitmap, which we do not decode', () => {
    const copy = Buffer.from(first);
    copy[8 + 7] |= 0x40; // PDS octet 8: bit 2 = bitmap section present
    expect(() => decodeGrib1(copy)).toThrow(/bitmap/);
  });

  it('rejects an empty buffer', () => {
    expect(() => decodeGrib1(Buffer.alloc(0))).toThrow(/no GRIB/);
  });
});
