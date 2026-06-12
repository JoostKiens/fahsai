import { describe, it, expect } from 'vitest';
import { sanitizeExplanation, parseBoldSegments } from './sanitize.js';

describe('sanitizeExplanation', () => {
  it('passes plain text through unchanged', () => {
    expect(sanitizeExplanation('hello world')).toBe('hello world');
  });

  it('strips markdown headings', () => {
    expect(sanitizeExplanation('# Title\ntext')).toBe('Title\ntext');
  });

  it('strips italic markers', () => {
    expect(sanitizeExplanation('*italic*')).toBe('italic');
  });

  it('preserves bold markers', () => {
    expect(sanitizeExplanation('**bold**')).toBe('**bold**');
  });

  it('converts [label](url) links to label only', () => {
    expect(sanitizeExplanation('[see here](https://x.com)')).toBe('see here');
  });

  it('removes bare URLs', () => {
    // Leading/trailing space remains — caller trims if needed
    const result = sanitizeExplanation('go https://x.com now');
    expect(result).not.toContain('https://');
    expect(result).toContain('go');
    expect(result).toContain('now');
  });

  it('strips inline code backticks', () => {
    expect(sanitizeExplanation('use `code` here')).toBe('use code here');
  });
});

describe('parseBoldSegments', () => {
  it('splits text around bold markers', () => {
    const result = parseBoldSegments('hello **world** foo');
    expect(result).toEqual([
      { text: 'hello ', bold: false },
      { text: 'world', bold: true },
      { text: ' foo', bold: false },
    ]);
  });

  it('returns a single non-bold segment when no bold markers present', () => {
    expect(parseBoldSegments('plain text')).toEqual([{ text: 'plain text', bold: false }]);
  });

  it('handles multiple bold segments', () => {
    const result = parseBoldSegments('**a** and **b**');
    expect(result.filter((s) => s.bold).map((s) => s.text)).toEqual(['a', 'b']);
  });
});
