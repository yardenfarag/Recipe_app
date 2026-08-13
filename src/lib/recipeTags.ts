import type { TFunction } from 'i18next';

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

/** Canonical i18n key fragment for a stored tag (`side dish` → `side_dish`). */
export function recipeTagI18nKey(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, 'and')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function titleCaseTag(tag: string): string {
  return tag
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b[\p{L}\p{N}]/gu, (ch) => ch.toUpperCase());
}

/** Translate a stored (usually English) recipe tag for display. */
export function translateRecipeTag(tag: string, t: TFunction): string {
  const key = recipeTagI18nKey(tag);
  if (!key) return tag;
  return t(`recipeTags.${key}`, { defaultValue: titleCaseTag(tag) });
}
