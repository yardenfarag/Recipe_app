import { describe, expect, it } from 'vitest';

import {
  COST_TIER_COUNT,
  costFilledCount,
  costMeterString,
  formatCostEstimate,
} from './formatCostEstimate';

describe('costFilledCount', () => {
  it('maps the stored tier to 1–3 filled dots', () => {
    expect(costFilledCount('$')).toBe(1);
    expect(costFilledCount('$$')).toBe(2);
    expect(costFilledCount('$$$')).toBe(3);
  });
});

describe('costMeterString', () => {
  it('wraps a left-to-right 3-dot meter', () => {
    expect(costMeterString('$')).toBe('\u2066●○○\u2069');
    expect(costMeterString('$$')).toBe('\u2066●●○\u2069');
    expect(costMeterString('$$$')).toBe('\u2066●●●\u2069');
  });

  it('always uses three positions', () => {
    for (const tier of ['$', '$$', '$$$'] as const) {
      const inner = costMeterString(tier).replace(/[\u2066\u2069]/g, '');
      expect(inner).toHaveLength(COST_TIER_COUNT);
    }
  });
});

describe('formatCostEstimate', () => {
  it('joins the meter and the word', () => {
    expect(formatCostEstimate('$')).toBe('\u2066●○○\u2069 Budget');
    expect(formatCostEstimate('$$')).toBe('\u2066●●○\u2069 Typical');
    expect(formatCostEstimate('$$$')).toBe('\u2066●●●\u2069 Expensive');
  });

  it('uses translated labels when provided', () => {
    expect(
      formatCostEstimate('$$', {
        $: 'חסכוני',
        $$: 'רגיל',
        $$$: 'יקר',
      }),
    ).toBe('\u2066●●○\u2069 רגיל');
  });
});
