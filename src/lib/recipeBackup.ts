import { recipeAppliancesOf } from '@/lib/appliances';
import { sanitizeStoredRecipe } from '@/lib/guestRecipes';
import { detectPlatform, recipeUrlsMatch } from '@/lib/platformUrls';
import { recipeUrlOrigin } from '@/lib/recipeOrigin';
import type { Recipe, RecipeTranslationContent } from '@/types/recipe';

export const RECIPE_BACKUP_FORMAT = 'pinch-recipe-backup';
export const RECIPE_BACKUP_VERSION = 1;
/** Far above any real library; stops a hostile file from locking up the restore. */
export const RECIPE_BACKUP_MAX_RECIPES = 5000;

export type BackupCollection = {
  name: string;
  /** Recipe ids as they appear in this backup's `recipes`. */
  recipe_ids: string[];
};

export type RecipeBackup = {
  format: typeof RECIPE_BACKUP_FORMAT;
  version: typeof RECIPE_BACKUP_VERSION;
  exported_at: string;
  recipes: Recipe[];
  collections: BackupCollection[];
};

export type RecipeBackupErrorCode = 'not_json' | 'not_backup' | 'newer_version' | 'too_large';

export class RecipeBackupError extends Error {
  constructor(readonly code: RecipeBackupErrorCode) {
    super(`Invalid recipe backup: ${code}`);
    this.name = 'RecipeBackupError';
  }
}

/** The recipe fields a backup carries. Ids are kept only to link collections inside the file. */
const BACKUP_RECIPE_FIELDS = [
  'id',
  'title',
  'original_url',
  'platform',
  'image_url',
  'source_video_url',
  'ingredients',
  'instructions',
  'servings',
  'calories',
  'estimated_time_minutes',
  'cost_estimate',
  'effort_level',
  'extraction_status',
  'extraction_source',
  'calories_reasoning',
  'time_reasoning',
  'tags',
  'missing_fields',
  'is_favorite',
  'last_cooked_at',
  'cook_note',
  'created_at',
  'source_language',
  'kitchen_adapted_summary',
  'kitchen_original',
  'appliances',
  'translations',
] as const satisfies readonly (keyof Recipe)[];

export function buildRecipeBackup(input: {
  recipes: Recipe[];
  collections: { name: string; recipeIds: string[] }[];
  translations: Record<string, Record<string, RecipeTranslationContent>>;
  exportedAt?: Date;
}): RecipeBackup {
  const recipeIds = new Set(input.recipes.map((recipe) => recipe.id));
  return {
    format: RECIPE_BACKUP_FORMAT,
    version: RECIPE_BACKUP_VERSION,
    exported_at: (input.exportedAt ?? new Date()).toISOString(),
    recipes: input.recipes.map((recipe) => {
      const out: Record<string, unknown> = {};
      for (const field of BACKUP_RECIPE_FIELDS) {
        const value = field === 'translations' ? input.translations[recipe.id] : recipe[field];
        if (value != null) out[field] = value;
      }
      return out as unknown as Recipe;
    }),
    collections: input.collections.map((collection) => ({
      name: collection.name,
      recipe_ids: collection.recipeIds.filter((id) => recipeIds.has(id)),
    })),
  };
}

export function recipeBackupFileName(date = new Date()): string {
  return `pinch-recipes-${date.toISOString().slice(0, 10)}.json`;
}

export type ParsedRecipeBackup = {
  recipes: Recipe[];
  collections: BackupCollection[];
  /** Entries that were not usable recipes and will be left out. */
  invalid: number;
};

/** Reads an untrusted backup file. Throws RecipeBackupError when it isn't a backup we can read. */
export function parseRecipeBackup(text: string): ParsedRecipeBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RecipeBackupError('not_json');
  }
  if (!isRecord(parsed) || parsed.format !== RECIPE_BACKUP_FORMAT || !Array.isArray(parsed.recipes)) {
    throw new RecipeBackupError('not_backup');
  }
  if (typeof parsed.version !== 'number' || parsed.version > RECIPE_BACKUP_VERSION) {
    throw new RecipeBackupError('newer_version');
  }
  if (parsed.recipes.length > RECIPE_BACKUP_MAX_RECIPES) {
    throw new RecipeBackupError('too_large');
  }

  const recipes: Recipe[] = [];
  const seenIds = new Set<string>();
  let invalid = 0;
  for (const raw of parsed.recipes) {
    const recipe = sanitizeStoredRecipe(raw);
    if (!recipe || seenIds.has(recipe.id)) {
      invalid += 1;
      continue;
    }
    seenIds.add(recipe.id);
    const appliances = recipeAppliancesOf(raw as Record<string, unknown>);
    if (appliances) recipe.appliances = appliances;
    recipes.push(recipe);
  }

  const collections: BackupCollection[] = [];
  for (const raw of Array.isArray(parsed.collections) ? parsed.collections : []) {
    if (!isRecord(raw) || typeof raw.name !== 'string' || !raw.name.trim()) continue;
    const ids = Array.isArray(raw.recipe_ids) ? raw.recipe_ids : [];
    collections.push({
      name: raw.name.trim(),
      recipe_ids: ids.filter((id): id is string => typeof id === 'string' && seenIds.has(id)),
    });
  }

  return { recipes, collections, invalid };
}

export type RecipeRestorePlan = {
  /** Backup recipes that are not in the library yet. */
  toAdd: Recipe[];
  /** Backup recipe id → id of the library recipe it duplicates. */
  existingIds: Record<string, string>;
  /** Backup recipe id → id of an earlier recipe in the same backup that it repeats. */
  repeats: Record<string, string>;
};

/**
 * Decides which backup recipes are new. A recipe with a source URL matches by URL (and origin, so an
 * invented recipe never collides with an extracted one); one without matches by title plus ingredients.
 * Duplicates inside the backup itself collapse onto the first copy.
 */
export function planRecipeRestore(
  backupRecipes: Recipe[],
  libraryRecipes: Pick<Recipe, 'id' | 'title' | 'ingredients' | 'original_url' | 'platform' | 'extraction_source'>[],
): RecipeRestorePlan {
  const library = libraryRecipes.map(toMatchable);
  const added: Matchable[] = [];
  const toAdd: Recipe[] = [];
  const existingIds: Record<string, string> = {};
  const repeats: Record<string, string> = {};

  for (const recipe of backupRecipes) {
    const candidate = toMatchable(recipe);
    const inLibrary = library.find((known) => sameRecipe(candidate, known));
    if (inLibrary) {
      existingIds[recipe.id] = inLibrary.id;
      continue;
    }
    const repeated = added.find((known) => sameRecipe(candidate, known));
    if (repeated) {
      repeats[recipe.id] = repeated.id;
      continue;
    }
    toAdd.push(recipe);
    added.push(candidate);
  }

  return { toAdd, existingIds, repeats };
}

type Matchable = {
  id: string;
  url: string | null;
  platform: ReturnType<typeof detectPlatform>;
  origin: ReturnType<typeof recipeUrlOrigin>;
  contentKey: string;
};

function toMatchable(
  recipe: Pick<Recipe, 'id' | 'title' | 'ingredients' | 'original_url' | 'platform' | 'extraction_source'>,
): Matchable {
  const url = recipe.original_url?.trim() || null;
  return {
    id: recipe.id,
    url,
    platform: url ? (recipe.platform ?? detectPlatform(url)) : 'unknown',
    origin: recipeUrlOrigin(recipe.extraction_source),
    contentKey: recipeContentKey(recipe),
  };
}

function sameRecipe(candidate: Matchable, known: Matchable): boolean {
  if (candidate.url) {
    return (
      known.url !== null &&
      known.origin === candidate.origin &&
      known.platform === candidate.platform &&
      recipeUrlsMatch(candidate.url, known.url, candidate.platform)
    );
  }
  return candidate.contentKey === known.contentKey;
}

function recipeContentKey(recipe: Pick<Recipe, 'title' | 'ingredients'>): string {
  const ingredients = (recipe.ingredients ?? []).map(
    (item) => `${normalizeText(item.name)}|${item.quantity}|${normalizeText(item.unit)}`,
  );
  return JSON.stringify([normalizeText(recipe.title), ingredients]);
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
