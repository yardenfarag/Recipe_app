import { describe, expect, it } from 'vitest';

import { gridColumns } from './gridColumns';

describe('gridColumns', () => {
  it('keeps 2 columns on tablets', () => {
    expect(gridColumns({ width: 820, isWide: false, isDesktopWeb: false })).toBe(2);
    expect(gridColumns({ width: 1024, isWide: false, isDesktopWeb: false })).toBe(2);
  });

  it('keeps 3 columns on a wide tablet, whatever its width', () => {
    expect(gridColumns({ width: 1194, isWide: true, isDesktopWeb: false })).toBe(3);
    expect(gridColumns({ width: 1920, isWide: true, isDesktopWeb: false })).toBe(3);
  });

  it('adds columns as the browser window grows', () => {
    const at = (width: number) => gridColumns({ width, isWide: true, isDesktopWeb: true });
    expect(at(1100)).toBe(3);
    expect(at(1280)).toBe(3);
    expect(at(1366)).toBe(4);
    expect(at(1600)).toBe(4);
    expect(at(1920)).toBe(5);
  });

  it('stops at 5 columns on very large monitors', () => {
    expect(gridColumns({ width: 3840, isWide: true, isDesktopWeb: true })).toBe(5);
  });
});
