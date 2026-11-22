import { describe, expect, it } from 'vitest';

import { defaultUnitSystem, parseUnitSystem, resolveUnitSystem } from './unitSystem';

describe('unit system', () => {
  it('defaults to US for English and Metric for the other app languages', () => {
    expect(defaultUnitSystem('en')).toBe('us');
    expect(defaultUnitSystem('en-US')).toBe('us');
    for (const language of ['he', 'ar', 'es', 'ru']) expect(defaultUnitSystem(language)).toBe('metric');
    expect(defaultUnitSystem(null)).toBe('metric');
  });

  it("lets the cook's pick win over the default", () => {
    expect(resolveUnitSystem('metric', 'en')).toBe('metric');
    expect(resolveUnitSystem('us', 'he')).toBe('us');
    expect(resolveUnitSystem(undefined, 'he')).toBe('metric');
  });

  it('reads only the two values', () => {
    expect(parseUnitSystem('us')).toBe('us');
    expect(parseUnitSystem('imperial')).toBeUndefined();
    expect(parseUnitSystem(null)).toBeUndefined();
  });
});
