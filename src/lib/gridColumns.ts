import { GridContentWidth, WebSidebarWidth } from '@/constants/theme';

/** Narrowest a recipe card may get before the grid drops a column. */
const MIN_CARD_WIDTH = 270;
/** Screen padding on both sides of the grid. */
const GRID_PADDING = 40;

/**
 * Columns for the Library and Hub card grid.
 *
 * Tablets get 2 and wide tablets 3, as before. The desktop website fits as
 * many as the window allows next to the side navigation: 3 up to about
 * 1340px, then 4, then 5 on the largest monitors (PIN-109).
 */
export function gridColumns(options: {
  width: number;
  isWide: boolean;
  isDesktopWeb: boolean;
}): number {
  const { width, isWide, isDesktopWeb } = options;
  if (!isWide) return 2;
  if (!isDesktopWeb) return 3;
  const available = Math.min(width - WebSidebarWidth, GridContentWidth) - GRID_PADDING;
  return Math.max(3, Math.min(5, Math.floor(available / MIN_CARD_WIDTH)));
}
