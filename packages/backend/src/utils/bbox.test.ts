import { describe, it, expect } from 'vitest';
import { parseBbox } from './bbox.js';

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

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

  it('rejects too few parts as an invalid request', () => {
    expect(catchError(() => parseBbox('1,2,3'))).toMatchObject({
      statusCode: 400,
      body: {
        error: 'Invalid bbox: "1,2,3" — expected "west,south,east,north"',
        code: 'invalid_request',
      },
    });
  });

  it('rejects a non-numeric part as an invalid request', () => {
    expect(catchError(() => parseBbox('1,two,3,4'))).toMatchObject({
      statusCode: 400,
      body: { code: 'invalid_request' },
    });
  });
});
