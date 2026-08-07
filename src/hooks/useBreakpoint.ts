import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'compact' | 'medium' | 'wide';

/** Phone — bottom tabs, single column. */
export const COMPACT_MAX = 767;
/** Tablet — wider content, still tabs. */
export const MEDIUM_MAX = 1099;
/** Desktop — sidebar + multi-column. */
export const WIDE_MIN = 1100;

export function breakpointFromWidth(width: number): Breakpoint {
  if (width >= WIDE_MIN) return 'wide';
  if (width > COMPACT_MAX) return 'medium';
  return 'compact';
}

/**
 * Layout breakpoint from window width.
 * compact &lt; 768 · medium 768–1099 · wide ≥ 1100
 */
export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  const breakpoint = breakpointFromWidth(width);
  return {
    width,
    height,
    breakpoint,
    isCompact: breakpoint === 'compact',
    isMedium: breakpoint === 'medium',
    isWide: breakpoint === 'wide',
    /** medium or wide — use content max-width shell */
    isMediumUp: breakpoint !== 'compact',
  };
}
