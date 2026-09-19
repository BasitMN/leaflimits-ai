import { describe, expect, it } from 'vitest';
import { classify } from './models';

describe('classify', () => {
  const range = { min: 18, max: 24 };
  it('marks values inside the range as ok, including the edges', () => {
    expect(classify(20, range)).toBe('ok');
    expect(classify(18, range)).toBe('ok');
    expect(classify(24, range)).toBe('ok');
  });
  it('marks low and high', () => {
    expect(classify(17.9, range)).toBe('low');
    expect(classify(24.1, range)).toBe('high');
  });
  it('is unknown without a range', () => expect(classify(20, undefined)).toBe('unknown'));
});
