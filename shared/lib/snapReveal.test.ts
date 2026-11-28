import { describe, expect, it } from 'vitest';

import { SNAP_REVEAL, ingredientRevealWindow, revealWindow } from './snapReveal';

describe('ingredientRevealWindow', () => {
  it('starts the first ingredient at 450 and every one by 1100, ending within the reveal', () => {
    for (const count of [1, 3, 8, 40]) {
      const windows = Array.from({ length: count }, (_, i) => ingredientRevealWindow(i, count));
      expect(windows[0]?.[0]).toBe(SNAP_REVEAL.ingredientsFrom);
      for (const [start, end] of windows) {
        expect(start).toBeLessThanOrEqual(SNAP_REVEAL.ingredientsBy);
        expect(end).toBeLessThanOrEqual(SNAP_REVEAL.total);
        expect(end).toBeGreaterThan(start);
      }
    }
  });

  it('keeps a short list quick instead of spreading it over the whole window', () => {
    const [second] = ingredientRevealWindow(1, 3);
    expect(second - SNAP_REVEAL.ingredientsFrom).toBe(SNAP_REVEAL.maxStagger);
  });

  it('goes one after another', () => {
    const starts = Array.from({ length: 12 }, (_, i) => ingredientRevealWindow(i, 12)[0]);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});

describe('revealWindow', () => {
  it('turns milliseconds into fractions of the reveal', () => {
    expect(revealWindow(0, 300)).toEqual([0, 0.2]);
    expect(revealWindow(1100, 1500)).toEqual([1100 / 1500, 1]);
  });
});
