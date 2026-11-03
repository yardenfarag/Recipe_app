import { describe, expect, it, vi } from 'vitest';

import {
  buildRecipeBackup,
  parseRecipeBackup,
  planRecipeRestore,
  RECIPE_BACKUP_MAX_RECIPES,
  RecipeBackupError,
  recipeBackupFileName,
} from './recipeBackup';
import type { Recipe } from '@/types/recipe';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r1',
    title: 'Shakshuka',
    servings: 2,
    extraction_status: 'full',
    ingredients: [{ name: 'Eggs', quantity: 4, unit: '' }],
    instructions: [{ step: 1, text: 'Crack the eggs into the sauce.' }],
    ...overrides,
  };
}

function backupText(recipes: unknown[], collections: unknown[] = []): string {
  return JSON.stringify({
    format: 'pinch-recipe-backup',
    version: 1,
    exported_at: '2026-11-03T00:00:00.000Z',
    recipes,
    collections,
  });
}

describe('buildRecipeBackup', () => {
  it('keeps recipe content, attaches translations, and drops account fields', () => {
    const backup = buildRecipeBackup({
      recipes: [
        recipe({
          user_id: 'user-1',
          display_title: 'Shakshuka',
          tags: ['breakfast'],
          is_favorite: true,
        }),
      ],
      collections: [{ name: 'Brunch', recipeIds: ['r1', 'gone'] }],
      translations: {
        r1: { he: { title: 'שקשוקה', ingredients: [], instructions: [] } },
      },
      exportedAt: new Date('2026-11-03T12:00:00.000Z'),
    });

    expect(backup.exported_at).toBe('2026-11-03T12:00:00.000Z');
    expect(backup.recipes[0]).toMatchObject({
      id: 'r1',
      tags: ['breakfast'],
      is_favorite: true,
      translations: { he: { title: 'שקשוקה' } },
    });
    expect(backup.recipes[0]).not.toHaveProperty('user_id');
    expect(backup.recipes[0]).not.toHaveProperty('display_title');
    expect(backup.collections).toEqual([{ name: 'Brunch', recipe_ids: ['r1'] }]);
  });

  it('round-trips through parseRecipeBackup', () => {
    const backup = buildRecipeBackup({
      recipes: [recipe({ tags: ['eggs'], original_url: 'https://example.com/shakshuka' })],
      collections: [{ name: 'Brunch', recipeIds: ['r1'] }],
      translations: {},
    });

    const parsed = parseRecipeBackup(JSON.stringify(backup));
    expect(parsed.invalid).toBe(0);
    expect(parsed.recipes[0]).toMatchObject({ id: 'r1', tags: ['eggs'] });
    expect(parsed.collections).toEqual([{ name: 'Brunch', recipe_ids: ['r1'] }]);
  });
});

describe('parseRecipeBackup', () => {
  it.each([
    ['not_json', 'not json at all'],
    ['not_backup', JSON.stringify({ recipes: [] })],
    ['not_backup', JSON.stringify([recipe()])],
    ['newer_version', JSON.stringify({ format: 'pinch-recipe-backup', version: 2, recipes: [] })],
  ])('rejects %s', (code, text) => {
    expect(() => parseRecipeBackup(text)).toThrow(RecipeBackupError);
    try {
      parseRecipeBackup(text);
    } catch (err) {
      expect((err as RecipeBackupError).code).toBe(code);
    }
  });

  it('rejects files with more recipes than a library could hold', () => {
    const many = Array.from({ length: RECIPE_BACKUP_MAX_RECIPES + 1 }, () => ({}));
    expect(() => parseRecipeBackup(backupText(many))).toThrow(RecipeBackupError);
  });

  it('counts unusable and repeated entries instead of failing the whole file', () => {
    const parsed = parseRecipeBackup(
      backupText([recipe(), { title: 'No id or steps' }, recipe({ title: 'Same id again' })]),
    );
    expect(parsed.recipes.map((r) => r.title)).toEqual(['Shakshuka']);
    expect(parsed.invalid).toBe(2);
  });

  it('drops collection links to recipes that are not in the file', () => {
    const parsed = parseRecipeBackup(
      backupText([recipe()], [{ name: ' Brunch ', recipe_ids: ['r1', 'missing', 7] }, { name: '' }]),
    );
    expect(parsed.collections).toEqual([{ name: 'Brunch', recipe_ids: ['r1'] }]);
  });
});

describe('planRecipeRestore', () => {
  it('skips a recipe whose source URL is already in the library', () => {
    const plan = planRecipeRestore(
      [recipe({ id: 'b1', original_url: 'https://www.youtube.com/watch?v=abc123DEF45' })],
      [recipe({ id: 'lib-1', title: 'Renamed', original_url: 'https://youtu.be/abc123DEF45' })],
    );
    expect(plan.toAdd).toEqual([]);
    expect(plan.existingIds).toEqual({ b1: 'lib-1' });
  });

  it('keeps an invented recipe separate from an extracted one with the same URL', () => {
    const url = 'https://example.com/shakshuka';
    const plan = planRecipeRestore(
      [recipe({ id: 'b1', original_url: url, extraction_source: 'invented' })],
      [recipe({ id: 'lib-1', original_url: url, extraction_source: 'web' })],
    );
    expect(plan.toAdd.map((r) => r.id)).toEqual(['b1']);
  });

  it('matches a recipe without a URL by title and ingredients, ignoring case and spacing', () => {
    const plan = planRecipeRestore(
      [
        recipe({ id: 'b1', title: '  shakshuka ' }),
        recipe({ id: 'b2', ingredients: [{ name: 'Eggs', quantity: 6, unit: '' }] }),
      ],
      [recipe({ id: 'lib-1' })],
    );
    expect(plan.existingIds).toEqual({ b1: 'lib-1' });
    expect(plan.toAdd.map((r) => r.id)).toEqual(['b2']);
  });

  it('adds a repeated recipe from the backup only once', () => {
    const plan = planRecipeRestore([recipe({ id: 'b1' }), recipe({ id: 'b2' })], []);
    expect(plan.toAdd.map((r) => r.id)).toEqual(['b1']);
    expect(plan.existingIds).toEqual({});
    expect(plan.repeats).toEqual({ b2: 'b1' });
  });
});

describe('recipeBackupFileName', () => {
  it('names the file by date', () => {
    expect(recipeBackupFileName(new Date('2026-11-03T22:00:00.000Z'))).toBe(
      'pinch-recipes-2026-11-03.json',
    );
  });
});
