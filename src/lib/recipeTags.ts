/**
 * Normalize user/AI tags for storage: lowercase, trim, collapse whitespace,
 * drop empties/hashtags, dedupe, cap at 8.
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

/** Frequency-sorted unique tags across a recipe library (most used first). */
export function collectLibraryTags(recipes: { tags?: string[] }[], limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const recipe of recipes) {
    for (const tag of recipe.tags ?? []) {
      const key = tag.trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}
