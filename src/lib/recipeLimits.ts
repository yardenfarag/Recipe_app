/**
 * Hard limits on recipe content (PIN-79, ADR 018). Same values as the database CHECK constraints
 * (migration 20261108130000_hand_edited_recipes) and supabase/functions/_shared/recipeLimits.ts.
 * recipeLimits.test.ts fails if this copy drifts from the server's.
 */
export const RECIPE_LIMITS = {
  titleChars: 120,
  ingredients: 60,
  ingredientNameChars: 100,
  quantityMax: 10_000,
  steps: 40,
  stepChars: 800,
  tags: 10,
  tagChars: 30,
  servingsMin: 1,
  servingsMax: 100,
  timeMinutesMin: 1,
  timeMinutesMax: 2_880,
  caloriesMax: 10_000,
  cookNoteChars: 160,
} as const;

/** Length as Postgres char_length counts it (code points), so an emoji counts once. */
export function charCount(value: string): number {
  return Array.from(value).length;
}
