import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchHubCards } from './cookingHub';

const mocks = vi.hoisted(() => {
  const countQuery = {
    eq: vi.fn(),
    ilike: vi.fn(),
    overlaps: vi.fn(),
    then: vi.fn(),
  };
  countQuery.eq.mockReturnValue(countQuery);
  countQuery.ilike.mockReturnValue(countQuery);
  countQuery.overlaps.mockReturnValue(countQuery);
  const select = vi.fn(() => countQuery);
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn();
  return { countQuery, select, from, rpc };
});

vi.mock('./client', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

function card(id: string) {
  return { id, title: id, ingredients: [], instructions: [], tags: [], save_count: 0, extract_hit_count: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.countQuery.then.mockImplementation((resolve: (v: unknown) => void) =>
    resolve({ count: 7, error: null }),
  );
  mocks.rpc.mockResolvedValue({ data: [card('a'), card('b'), card('c')], error: null });
});

describe('fetchHubCards', () => {
  it('asks hub_cards_for_cook for the diets, filters and one extra row', async () => {
    const result = await fetchHubCards({
      diets: ['vegan', 'keto'],
      platform: 'youtube',
      search: ' 50%_off pasta ',
      tags: ['quick'],
      sort: 'newest',
      offset: 0,
      limit: 2,
    });

    expect(mocks.rpc).toHaveBeenCalledWith('hub_cards_for_cook', {
      p_diets: ['vegan', 'keto'],
      p_platform: 'youtube',
      p_search: '50off pasta',
      p_tags: ['quick'],
      p_sort: 'newest',
      p_offset: 0,
      p_limit: 3,
      p_allergens: null,
      p_dislikes: null,
      p_allergy_words: null,
      p_dislike_words: null,
    });
    expect(result.cards.map((c) => c.id)).toEqual(['a', 'b']);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(7);
    expect(mocks.countQuery.eq).toHaveBeenCalledWith('platform', 'youtube');
    expect(mocks.countQuery.overlaps).toHaveBeenCalledWith('tags', ['quick']);
  });

  it('sends nulls for no diets, all platforms, no search and no tags', async () => {
    await fetchHubCards({ platform: 'all', diets: [], offset: 40, limit: 40 });
    expect(mocks.rpc).toHaveBeenCalledWith('hub_cards_for_cook', {
      p_diets: null,
      p_platform: null,
      p_search: null,
      p_tags: null,
      p_sort: 'popular',
      p_offset: 40,
      p_limit: 41,
      p_allergens: null,
      p_dislikes: null,
      p_allergy_words: null,
      p_dislike_words: null,
    });
    // Later pages skip the count.
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('sends the avoid list (PIN-180)', async () => {
    await fetchHubCards({
      avoid: { allergens: ['peanuts'], dislikes: ['onion', 'cilantro'], allergyWords: ['kiwi'], dislikeWords: [] },
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'hub_cards_for_cook',
      expect.objectContaining({
        p_allergens: ['peanuts'],
        p_dislikes: ['onion', 'cilantro'],
        p_allergy_words: ['kiwi'],
        p_dislike_words: null,
      }),
    );
  });

  it('falls back to the diet-first hub_cards on a database without hub_cards_for_cook', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } })
      .mockResolvedValueOnce({ data: [card('a')], error: null });
    const result = await fetchHubCards({ diets: ['halal'], avoid: { allergens: ['milk'], dislikes: [], allergyWords: [], dislikeWords: [] } });
    expect(mocks.rpc).toHaveBeenLastCalledWith('hub_cards', expect.objectContaining({ p_diets: ['halal'] }));
    expect(mocks.rpc.mock.lastCall?.[1]).not.toHaveProperty('p_allergens');
    expect(result.cards.map((c) => c.id)).toEqual(['a']);
  });

  it('throws when hub_cards_for_cook fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(fetchHubCards()).rejects.toThrow('boom');
  });
});
