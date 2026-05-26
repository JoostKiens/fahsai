import { describe, it, expect } from 'vitest';
import { parseBbox } from './bbox.js';

describe('parseBbox', () => {
  it('parses a valid bbox string', () => {
    expect(parseBbox('89,1,114,30')).toEqual({ west: 89, south: 1, east: 114, north: 30 });
  });

  it('uses the default bbox when input is undefined', () => {
    expect(parseBbox(undefined)).toEqual({ west: 89, south: 1, east: 114, north: 30 });
  });

  it('parses negative coordinate values', () => {
    const result = parseBbox('-10,-5,10,5');
    expect(result).toEqual({ west: -10, south: -5, east: 10, north: 5 });
  });

  it('throws on too few parts', () => {
    expect(() => parseBbox('1,2,3')).toThrow('Invalid bbox');
  });

  it('throws when a part is non-numeric', () => {
    expect(() => parseBbox('1,two,3,4')).toThrow('Invalid bbox');
  });
});
