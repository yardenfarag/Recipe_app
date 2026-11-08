import { RECIPE_LIMITS, truncateChars } from './recipeLimits.ts';

/**
 * Normalize Gemini (or user) tags for storage and trend aggregation:
 * lowercase, trim, collapse whitespace, drop empties/hashtags, dedupe, cap at 8.
 * Each tag fits the database limit of RECIPE_LIMITS.tagChars characters (PIN-79).
 */
export function normalizeRecipeTags(tags: string[] | null | undefined): string[] {
  if (!tags?.length) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of tags) {
    const cleaned = raw
      .trim()
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/\s+/g, ' ');
    const tag = truncateChars(cleaned, RECIPE_LIMITS.tagChars).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 8) break;
  }

  return out;
}
