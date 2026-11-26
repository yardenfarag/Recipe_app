import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchRecipeCardTitles, fetchRecipeCardTranslation } from './recipeCardTranslations';

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  const from = vi.fn(() => query);
  return { query, from };
});

vi.mock('./client', () => ({ supabase: { from: mocks.from } }));

const listResult = (value: unknown) =>
  mocks.query.then.mockImplementation((resolve: (v: unknown) => void) => resolve(value));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchRecipeCardTranslation', () => {
  it('reads one card in one language', async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: {
        title: 'מרק',
        ingredients: [{ name: 'עדשים', quantity: 1, unit: 'cup' }],
        instructions: [{ step: 1, text: 'לבשל.' }],
        translation_version: 4,
      },
      error: null,
    });
    const result = await fetchRecipeCardTranslation('card-1', 'he');
    expect(mocks.from).toHaveBeenCalledWith('recipe_card_translations');
    expect(mocks.query.eq).toHaveBeenCalledWith('card_id', 'card-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('language_code', 'he');
    expect(result).toEqual({
      title: 'מרק',
      ingredients: [{ name: 'עדשים', quantity: 1, unit: 'cup' }],
      instructions: [{ step: 1, text: 'לבשל.' }],
      translation_version: 4,
    });
  });

  it('is null when the card has none, or the table is not there yet', async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await fetchRecipeCardTranslation('card-1', 'he')).toBeNull();
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: { code: 'PGRST205', message: 'not found' } });
    expect(await fetchRecipeCardTranslation('card-1', 'he')).toBeNull();
  });

  it('throws other errors', async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: { code: '500', message: 'boom' } });
    await expect(fetchRecipeCardTranslation('card-1', 'he')).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('fetchRecipeCardTitles', () => {
  it('reads the titles of many cards in one query', async () => {
    listResult({
      data: [
        { card_id: 'a', title: 'מרק' },
        { card_id: 'b', title: '  ' },
      ],
      error: null,
    });
    const titles = await fetchRecipeCardTitles('he', ['a', 'b', 'a']);
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.query.select).toHaveBeenCalledWith('card_id, title');
    expect(mocks.query.in).toHaveBeenCalledWith('card_id', ['a', 'b']);
    expect(titles).toEqual({ a: 'מרק' });
  });

  it('asks nothing for no cards, and gives none when the table is not there yet', async () => {
    expect(await fetchRecipeCardTitles('he', [])).toEqual({});
    expect(mocks.from).not.toHaveBeenCalled();
    listResult({ data: null, error: { code: 'PGRST205', message: 'missing' } });
    expect(await fetchRecipeCardTitles('he', ['a'])).toEqual({});
  });
});
