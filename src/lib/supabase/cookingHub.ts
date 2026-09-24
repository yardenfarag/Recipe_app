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
): Promise<{ cards: RecipeCard[]; hasMore: boolean }> {
  const limit = options.limit ?? PAGE_SIZE;
  const offset = options.offset ?? 0;
  const search = options.search ? sanitizeSearch(options.search) : '';
  const sort = options.sort ?? 'popular';

  let query = supabase.from('recipe_cards').select('*');

  if (options.platform && options.platform !== 'all' && isHubPlatform(options.platform)) {
    query = query.eq('platform', options.platform);
  }
  if (search) {
    query = query.ilike('title', `%${search}%`);
  }
  if (options.tags && options.tags.length > 0) {
    query = query.contains('tags', options.tags);
  }

  if (sort === 'newest') {
    query = query.order('created_at', { ascending: false });
  } else {
    query = query
      .order('save_count', { ascending: false })
      .order('created_at', { ascending: false });
  }

  const { data, error } = await query.range(offset, offset + limit - 1);
  if (error) throw error;

  const cards = ((data ?? []) as RecipeCard[]).map(mapCard);
  return { cards, hasMore: cards.length === limit };
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
