/**
 * The current translator version (PIN-53). Must equal `TRANSLATION_VERSION` in
 * supabase/functions/_shared/recipes/translateRecipe.ts (a Deno test checks). The app saves the version the function
 * sends with each new translation; it never re-translates because of an older one. The admin function
 * backfill-translations redoes rows with a lower or missing version.
 */
export const CURRENT_TRANSLATION_VERSION = 2;
