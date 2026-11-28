/**
 * The Snap reveal's timeline (PIN-192), shared by the phone app and the web app so both build the recipe in the
 * same order and at the same pace. Times are milliseconds from when the recipe first shows.
 *
 *   title       0 → 300
 *   cover     150 → 600
 *   ingredients from 450, one after another, each 250 long, all started by 1100
 *   facts, steps and the rest  1100 → 1500
 *
 * Then the "Saved" moment: the card drops toward the Library (`flight`), then the "Saved · Remove" strip.
 */
export const SNAP_REVEAL = {
  total: 1500,
  title: [0, 300],
  cover: [150, 600],
  ingredientsFrom: 450,
  ingredientsBy: 1100,
  ingredient: 250,
  /** The longest gap between two ingredients, so a short list doesn't crawl. */
  maxStagger: 90,
  rest: [1100, 1500],
  flight: 650,
} as const;

/** When ingredient `index` (of `count`) starts and ends appearing. */
export function ingredientRevealWindow(index: number, count: number): [number, number] {
  const span = SNAP_REVEAL.ingredientsBy - SNAP_REVEAL.ingredientsFrom;
  const stagger = count > 1 ? Math.min(SNAP_REVEAL.maxStagger, span / (count - 1)) : 0;
  const start = SNAP_REVEAL.ingredientsFrom + Math.min(index, Math.max(0, count - 1)) * stagger;
  return [start, Math.min(SNAP_REVEAL.total, start + SNAP_REVEAL.ingredient)];
}

/** A window in milliseconds as fractions of the whole reveal (0 to 1), for a single progress value. */
export function revealWindow(start: number, end: number): [number, number] {
  const from = Math.max(0, Math.min(1, start / SNAP_REVEAL.total));
  const to = Math.max(from + 0.0001, Math.min(1, end / SNAP_REVEAL.total));
  return [from, to];
}
