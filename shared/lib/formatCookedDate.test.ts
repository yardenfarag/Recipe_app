import { describe, expect, it } from 'vitest';

import { formatCookedDate } from './formatCookedDate';

describe('formatCookedDate', () => {
  it('returns a short locale date', () => {
    const label = formatCookedDate('2026-08-12T15:00:00.000Z', 'en');
    expect(label).toMatch(/Aug/);
    expect(label).toMatch(/12/);
  });

  it('returns empty for invalid input', () => {
    expect(formatCookedDate('nope', 'en')).toBe('');
  });
});
