import { describe, expect, it } from 'vitest';
import { MEASUREMENTS } from './models';
import { checkRange, formToLimits, validateLimits } from './validators';

const water = MEASUREMENTS.find((m) => m.key === 'water_temperature')!;
const humidity = MEASUREMENTS.find((m) => m.key === 'internal_humidity')!;

describe('checkRange', () => {
  it('accepts a normal range', () => expect(checkRange(water, 18, 24)).toBeNull());
  it('accepts both blank as "no limit"', () => {
    expect(checkRange(water, null, null)).toBeNull();
    expect(checkRange(water, '', '')).toBeNull();
  });
  it('rejects one blank value', () => {
    expect(checkRange(water, 18, null)).toBe('incomplete');
    expect(checkRange(water, null, 24)).toBe('incomplete');
  });
  it('rejects min >= max', () => {
    expect(checkRange(water, 24, 18)).toBe('order');
    expect(checkRange(water, 20, 20)).toBe('order');
  });
  it('rejects values outside the plausible range of the sensor', () => {
    expect(checkRange(water, -5, 20)).toBe('outOfBounds');
    expect(checkRange(water, 10, 60)).toBe('outOfBounds');
    expect(checkRange(humidity, 40, 101)).toBe('outOfBounds');
  });
  it('accepts values exactly on the bounds', () => expect(checkRange(water, 0, 50)).toBeNull());
  it('rejects non-numbers', () => expect(checkRange(water, 'a', 20)).toBe('notNumber'));
});

describe('formToLimits', () => {
  it('keeps complete pairs and drops blanks', () => {
    const limits = formToLimits({
      water_temperature: { min: 18, max: 24 },
      internal_humidity: { min: null, max: null },
    });
    expect(limits).toEqual({ water_temperature: { min: 18, max: 24 } });
  });
});

describe('validateLimits', () => {
  it('returns no problems for valid limits', () => {
    expect(validateLimits({ water_temperature: { min: 18, max: 24 } })).toEqual([]);
  });
  it('names the sensor with a problem', () => {
    const p = validateLimits({ water_temperature: { min: 30, max: 10 } });
    expect(p.length).toBe(1);
    expect(p[0]).toContain('Water temperature');
  });
});
