import { describe, expect, it } from 'vitest';

import { reorderShift, reorderTargetIndex } from './reorderTarget';

// Three rows of different heights with a 10 px gap.
const rows = [
  { y: 0, height: 40 },
  { y: 50, height: 80 },
  { y: 140, height: 40 },
];

describe('reorderTargetIndex', () => {
  it('stays put for a small drag', () => {
    expect(reorderTargetIndex(rows, 0, 15)).toBe(0);
  });

  it('moves down past a row once the centre crosses it', () => {
    expect(reorderTargetIndex(rows, 0, 80)).toBe(1);
    expect(reorderTargetIndex(rows, 0, 200)).toBe(2);
  });

  it('moves up', () => {
    expect(reorderTargetIndex(rows, 2, -80)).toBe(1);
    expect(reorderTargetIndex(rows, 2, -200)).toBe(0);
  });
});

describe('reorderShift', () => {
  it('slides the rows between the start and the target', () => {
    expect([0, 1, 2].map((i) => reorderShift(i, 0, 2, 50))).toEqual([0, -50, -50]);
    expect([0, 1, 2].map((i) => reorderShift(i, 2, 0, 50))).toEqual([50, 50, 0]);
    expect([0, 1, 2].map((i) => reorderShift(i, 1, 1, 50))).toEqual([0, 0, 0]);
  });
});
