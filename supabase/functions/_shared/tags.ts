/**
 * Normalize Gemini (or user) tags for storage and trend aggregation:
 * lowercase, trim, collapse whitespace, drop empties/hashtags, dedupe, cap at 8.
 */
export function normalizeRecipeTags(tags: string[] | null | undefined): string[] {
  if (!tags?.length) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of tags) {
    const tag = raw
      .trim()
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 8) break;
  }

  return out;
}
