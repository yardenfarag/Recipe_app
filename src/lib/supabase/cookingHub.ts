import { supabase } from '@/lib/supabase/client';
import { isHubPlatform } from '@/lib/recipeCardKey';
import type { HubPlatform, RecipeCard } from '@/types/recipeCard';

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

  // hub_cards does the filtering, the diet-first ordering and the paging (PIN-83).
  // It returns one extra row so the page can tell if more exist.
  const rowsQuery = supabase.rpc('hub_cards', {
    p_diets: options.diets && options.diets.length > 0 ? options.diets : null,
    p_platform: platform,
    p_search: search || null,
    p_tags: tags,
    p_sort: sort,
    p_offset: offset,
    p_limit: limit + 1,
  });

  const [rowsResult, total] = await Promise.all([
    rowsQuery,
    includeCount ? countHubCards({ platform, search, tags }) : Promise.resolve(null),
  ]);
  if (rowsResult.error) throw rowsResult.error;

  const rows = ((rowsResult.data ?? []) as RecipeCard[]).map(mapCard);
  const hasMore = rows.length > limit;
  const cards = hasMore ? rows.slice(0, limit) : rows;
  return { cards, hasMore, total };
}

/** Total cards for the current filters. Diets only change the order, so they don't count here. */
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
    p_platform: platform === 'all' ? null : platform,
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

export async function fetchHubCard(id: string): Promise<RecipeCard | null> {
  const { data, error } = await supabase.from('recipe_cards').select('*').eq('id', id).maybeSingle();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data ? mapCard(data as RecipeCard) : null;
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
