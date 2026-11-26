import { supabase } from './client';
import { sqlNullable } from './dbTypes';
import { hubAvoidIsEmpty, type HubAvoid } from '../hubAvoid';
import { isHubPlatform } from '../recipeCardKey';
import { resolveRecipeSourceLanguage } from '../recipeSourceLanguage';
import { fetchRecipeCardTitles } from './recipeCardTranslations';
import type { HubPlatform, RecipeCard } from '../../types/recipeCard';

const PAGE_SIZE = 40;

export type HubSort = 'popular' | 'newest';

export interface FetchHubCardsOptions {
  search?: string;
  platform?: HubPlatform | 'all';
  tags?: string[];
  sort?: HubSort;
  offset?: number;
  limit?: number;
  /** Exact count is only needed for the first page. Later pages use an extra row. */
  includeCount?: boolean;
  /** Kitchen-profile diets; cards that fit more of them come first (PIN-83). */
  diets?: string[];
  /** The cook's avoid list (hubAvoidOf): allergies go last, dislikes lower (PIN-180). */
  avoid?: HubAvoid;
  /**
   * The app language: cards written in another one get `display_title` from their translation into it (PIN-77).
   * Search and filters still work on the card as written.
   */
  language?: string;
}

function orNull<T>(list: T[] | undefined): T[] | null {
  return list && list.length > 0 ? list : null;
}

function sanitizeSearch(value: string): string {
  return value.replace(/[%_]/g, '').trim().slice(0, 80);
}

function mapCard(row: RecipeCard): RecipeCard {
  return {
    ...row,
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    instructions: Array.isArray(row.instructions) ? row.instructions : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    save_count: typeof row.save_count === 'number' ? row.save_count : 0,
    extract_hit_count: typeof row.extract_hit_count === 'number' ? row.extract_hit_count : 0,
  };
}

export async function fetchHubCards(
  options: FetchHubCardsOptions = {},
): Promise<{ cards: RecipeCard[]; hasMore: boolean; total: number | null }> {
  const limit = options.limit ?? PAGE_SIZE;
  const offset = options.offset ?? 0;
  const search = options.search ? sanitizeSearch(options.search) : '';
  const sort = options.sort ?? 'popular';
  const includeCount = options.includeCount ?? offset === 0;
  const platform =
    options.platform && options.platform !== 'all' && isHubPlatform(options.platform)
      ? options.platform
      : null;
  const tags = options.tags && options.tags.length > 0 ? options.tags : null;

  const shared = {
    p_diets: sqlNullable(orNull(options.diets)),
    p_platform: sqlNullable(platform),
    p_search: sqlNullable(search || null),
    p_tags: sqlNullable(tags),
    p_sort: sort,
    p_offset: offset,
    p_limit: limit + 1,
  };
  const avoid = options.avoid && !hubAvoidIsEmpty(options.avoid) ? options.avoid : null;

  // hub_cards_for_cook does the filtering, the ordering for the cook (diets first, PIN-83; allergies last and
  // dislikes lower, PIN-180) and the paging. It returns one extra row so the page can tell if more exist.
  const rowsQuery = async () => {
    const result = await supabase.rpc('hub_cards_for_cook', {
      ...shared,
      p_allergens: sqlNullable(orNull(avoid?.allergens)),
      p_dislikes: sqlNullable(orNull(avoid?.dislikes)),
      p_allergy_words: sqlNullable(orNull(avoid?.allergyWords)),
      p_dislike_words: sqlNullable(orNull(avoid?.dislikeWords)),
    });
    // A database without it yet (the app can ship before the migration runs): the diet-first list.
    if (result.error?.code === 'PGRST202') return supabase.rpc('hub_cards', shared);
    return result;
  };

  const [rowsResult, total] = await Promise.all([
    rowsQuery(),
    includeCount ? countHubCards({ platform, search, tags }) : Promise.resolve(null),
  ]);
  if (rowsResult.error) throw rowsResult.error;

  const rows = ((rowsResult.data ?? []) as unknown as RecipeCard[]).map(mapCard);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const cards = options.language ? await withCardTitles(page, options.language) : page;
  return { cards, hasMore, total };
}

/**
 * Cards with their titles in `language` where a translation into it exists, in one query. If that query fails the
 * cards keep their own titles: the list still works.
 */
export async function withCardTitles(cards: RecipeCard[], language: string): Promise<RecipeCard[]> {
  const other = cards.filter((card) => resolveRecipeSourceLanguage(card) !== language);
  if (other.length === 0) return cards;
  const titles = await fetchRecipeCardTitles(
    language,
    other.map((card) => card.id),
  ).catch(() => ({}) as Record<string, string>);
  return cards.map((card) => (titles[card.id] ? { ...card, display_title: titles[card.id] } : card));
}

/** Total cards for the current filters. Diets and the avoid list only change the order, so they don't count here. */
async function countHubCards(filters: {
  platform: HubPlatform | null;
  search: string;
  tags: string[] | null;
}): Promise<number | null> {
  let query = supabase.from('recipe_cards').select('id', { count: 'exact', head: true });
  if (filters.platform) query = query.eq('platform', filters.platform);
  if (filters.search) query = query.ilike('title', `%${filters.search}%`);
  if (filters.tags) query = query.overlaps('tags', filters.tags);
  const { count, error } = await query;
  if (error) throw error;
  return typeof count === 'number' ? count : null;
}

export async function fetchHubTags(platform: HubPlatform | 'all' = 'all'): Promise<string[]> {
  const { data, error } = await supabase.rpc('hub_popular_tags', {
    p_platform: sqlNullable(platform === 'all' ? null : platform),
    p_limit: 12,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ tag?: string } | string>;
  const tags: string[] = [];
  for (const row of rows) {
    const tag = typeof row === 'string' ? row : row.tag;
    if (tag?.trim()) tags.push(tag);
  }
  return tags;
}

export async function fetchLibraryRecipeForCard(cardId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('library_recipe_for_card', { p_card_id: cardId });
  if (error) throw error;
  return typeof data === 'string' && data ? data : null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads a card by id, or by its public slug when opened from pinch-app.io/r/<slug> (PIN-124). */
export async function fetchHubCard(idOrSlug: string): Promise<RecipeCard | null> {
  const column = UUID_PATTERN.test(idOrSlug) ? 'id' : 'public_slug';
  const value = column === 'id' ? idOrSlug : idOrSlug.toLowerCase();
  const { data, error } = await supabase.from('recipe_cards').select('*').eq(column, value).maybeSingle();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data ? mapCard(data as unknown as RecipeCard) : null;
}

export async function claimHubCard(cardId: string): Promise<string> {
  const { data, error } = await supabase.rpc('claim_recipe_card', { p_card_id: cardId });
  if (error) throw error;
  if (typeof data !== 'string' || !data) {
    throw new Error('Could not add this recipe to your library.');
  }
  return data;
}

export async function fetchContributeToHub(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('contribute_to_hub')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.contribute_to_hub !== false;
}

export async function setContributeToHub(userId: string, value: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ contribute_to_hub: value })
    .eq('id', userId);
  if (error) throw error;
}
