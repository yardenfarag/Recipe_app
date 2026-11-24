import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_SOURCE_LANGUAGE } from '@shared/lib/appLanguages';
import { detectPlatform, recipeUrlsMatch } from '@shared/lib/platformUrls';
import { recipeContentEquals } from '@shared/lib/recipeContentEquals';
import { recipeMatchesUrlOrigin, recipeUrlOrigin } from '@shared/lib/recipeOrigin';
import { sanitizeStoredRecipe } from '@shared/lib/storedRecipe';
import { Recipe, RecipeTranslationContent } from '@shared/types/recipe';

/** Guests cannot save; sign-up is required to keep recipes. */
export const GUEST_RECIPE_LIMIT = 0;

const STORAGE_KEY = 'pinch:guest-recipes';
let mutationQueue: Promise<void> = Promise.resolve();

export type NewGuestRecipe = Omit<Recipe, 'id' | 'created_at' | 'user_id'>;

export type SaveGuestRecipeResult =
  | { ok: true; recipe: Recipe }
  | { ok: false; reason: 'quota_exceeded'; savedCount: number };

async function writeGuestRecipes(recipes: Recipe[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
  } catch {
    throw new Error('Could not save to local storage. Check device storage and try again.');
  }
}

async function readGuestRecipes(): Promise<Recipe[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeStoredRecipe).filter((recipe): recipe is Recipe => recipe !== null);
  } catch {
    return [];
  }
}

function serializeMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(mutation, mutation);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function getGuestRecipes(): Promise<Recipe[]> {
  await mutationQueue;
  return readGuestRecipes();
}

export async function getGuestRecipeById(id: string): Promise<Recipe | null> {
  const recipes = await getGuestRecipes();
  return recipes.find((r) => r.id === id) ?? null;
}

export async function saveGuestRecipe(recipe: NewGuestRecipe): Promise<SaveGuestRecipeResult> {
  return serializeMutation(async () => {
    const existing = await readGuestRecipes();

    if (recipe.original_url?.trim()) {
      const platform = recipe.platform ?? detectPlatform(recipe.original_url);
      const duplicate = existing.find(
        (saved) =>
          saved.original_url &&
          recipeMatchesUrlOrigin(saved, recipeUrlOrigin(recipe.extraction_source)) &&
          recipeUrlsMatch(recipe.original_url!, saved.original_url, platform),
      );
      if (duplicate) {
        return { ok: true, recipe: duplicate };
      }
    }

    if (existing.length >= GUEST_RECIPE_LIMIT) {
      return { ok: false, reason: 'quota_exceeded', savedCount: existing.length };
    }

    const saved: Recipe = {
      ...recipe,
      source_language: recipe.source_language ?? DEFAULT_SOURCE_LANGUAGE,
      id: generateGuestId(),
      created_at: new Date().toISOString(),
    };

    await writeGuestRecipes([saved, ...existing]);
    return { ok: true, recipe: saved };
  });
}

export async function removeGuestRecipe(id: string): Promise<void> {
  return serializeMutation(async () => {
    const existing = await readGuestRecipes();
    await writeGuestRecipes(existing.filter((recipe) => recipe.id !== id));
  });
}

/** Renames a guest recipe and keeps translation titles in sync for the library. */
export async function renameGuestRecipe(id: string, title: string): Promise<Recipe | null> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Recipe name is required.');

  return serializeMutation(async () => {
    const existing = await readGuestRecipes();
    let updated: Recipe | null = null;
    const next = existing.map((recipe) => {
      if (recipe.id !== id) return recipe;
      const translations = recipe.translations
        ? Object.fromEntries(
            Object.entries(recipe.translations).map(([code, content]) => [
              code,
              { ...content, title: trimmed },
            ]),
          )
        : undefined;
      updated = {
        ...recipe,
        title: trimmed,
        display_title: trimmed,
        translations,
      };
      return updated;
    });
    if (!updated) return null;
    await writeGuestRecipes(next);
    return updated;
  });
}

/** Replaces the full guest recipe list — used after thumbnail backfill. */
export async function replaceGuestRecipes(recipes: Recipe[]): Promise<void> {
  return serializeMutation(() => writeGuestRecipes(recipes));
}

export async function setGuestRecipeFavorite(id: string, isFavorite: boolean): Promise<void> {
  return serializeMutation(async () => {
    const existing = await readGuestRecipes();
    const next = existing.map((recipe) =>
      recipe.id === id ? { ...recipe, is_favorite: isFavorite } : recipe,
    );
    await writeGuestRecipes(next);
  });
}

export async function setGuestRecipeTags(id: string, tags: string[]): Promise<void> {
  return serializeMutation(async () => {
    const existing = await readGuestRecipes();
    const next = existing.map((recipe) =>
      recipe.id === id ? { ...recipe, tags } : recipe,
    );
    await writeGuestRecipes(next);
  });
}

/** Persists remix / swap edits on a local guest recipe (canonical fields only). */
export async function updateGuestRecipeContent(
  id: string,
  content: {
    title: string;
    servings: number;
    ingredients: Recipe['ingredients'];
    instructions: Recipe['instructions'];
    calories?: number;
    /** PIN-80. Absent = leave the stored macros alone. */
    nutrition?: Recipe['nutrition'];
    extraction_status?: Recipe['extraction_status'];
    missing_fields?: string[];
    estimated_time_minutes?: number | null;
    cost_estimate?: Recipe['cost_estimate'] | null;
    effort_level?: Recipe['effort_level'] | null;
    tags?: string[];
    kitchen_adapted_summary?: string | null;
    kitchen_original?: Recipe['kitchen_original'] | null;
    /** PIN-187. The language the text is in, when a translation became the recipe's text. Absent = it stays. */
    source_language?: string;
  },
): Promise<Recipe | null> {
  return serializeMutation(async () => {
    const existing = await readGuestRecipes();
    let updated: Recipe | null = null;
    const next = existing.map((recipe) => {
      if (recipe.id !== id) return recipe;
      const languageChanged = Boolean(content.source_language) && content.source_language !== recipe.source_language;
      const textChanged = languageChanged || !recipeContentEquals(recipe, content);
      updated = {
        ...recipe,
        title: content.title,
        servings: content.servings,
        ingredients: content.ingredients,
        instructions: content.instructions,
        calories: content.calories,
        // Like the database trigger: new calories without macros clear them.
        ...(content.nutrition !== undefined
          ? { nutrition: content.nutrition ?? undefined }
          : content.calories !== recipe.calories
            ? { nutrition: undefined }
            : {}),
        ...(content.extraction_status ? { extraction_status: content.extraction_status } : {}),
        ...(content.missing_fields ? { missing_fields: content.missing_fields } : {}),
        ...(content.estimated_time_minutes !== undefined
          ? { estimated_time_minutes: content.estimated_time_minutes ?? undefined }
          : {}),
        ...(content.cost_estimate !== undefined
          ? { cost_estimate: content.cost_estimate ?? undefined }
          : {}),
        ...(content.effort_level !== undefined
          ? { effort_level: content.effort_level ?? undefined }
          : {}),
        ...(content.tags ? { tags: content.tags } : {}),
        ...(content.kitchen_adapted_summary !== undefined
          ? { kitchen_adapted_summary: content.kitchen_adapted_summary ?? undefined }
          : {}),
        ...(content.kitchen_original !== undefined
          ? { kitchen_original: content.kitchen_original ?? undefined }
          : {}),
        ...(content.source_language ? { source_language: content.source_language } : {}),
        translations: textChanged ? undefined : recipe.translations,
      };
      return updated;
    });
    if (!updated) return null;
    await writeGuestRecipes(next);
    return updated;
  });
}

const COOK_NOTE_MAX = 160;

export async function setGuestRecipeCooked(
  id: string,
  cooked: { last_cooked_at: string; cook_note?: string | null },
): Promise<Recipe | null> {
  const note =
    typeof cooked.cook_note === 'string' ? cooked.cook_note.trim().slice(0, COOK_NOTE_MAX) : '';
  return serializeMutation(async () => {
    const existing = await readGuestRecipes();
    let updated: Recipe | null = null;
    const next = existing.map((recipe) => {
      if (recipe.id !== id) return recipe;
      updated = {
        ...recipe,
        last_cooked_at: cooked.last_cooked_at,
        cook_note: note || undefined,
      };
      return updated;
    });
    if (!updated) return null;
    await writeGuestRecipes(next);
    return updated;
  });
}

/** Upserts a language overlay without touching canonical recipe fields. */
export async function upsertGuestRecipeTranslation(
  id: string,
  languageCode: string,
  content: RecipeTranslationContent,
): Promise<Recipe | null> {
  return serializeMutation(async () => {
    const existing = await readGuestRecipes();
    let updated: Recipe | null = null;
    const next = existing.map((recipe) => {
      if (recipe.id !== id) return recipe;
      updated = {
        ...recipe,
        translations: {
          ...(recipe.translations ?? {}),
          [languageCode]: content,
        },
      };
      return updated;
    });
    if (!updated) return null;
    await writeGuestRecipes(next);
    return updated;
  });
}

export async function getGuestRecipeTranslation(
  id: string,
  languageCode: string,
): Promise<RecipeTranslationContent | null> {
  const recipe = await getGuestRecipeById(id);
  return recipe?.translations?.[languageCode] ?? null;
}

/** Wipes all local guest recipes — used after a successful migration to Supabase. */
export async function clearGuestRecipes(): Promise<void> {
  return serializeMutation(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      throw new Error('Could not clear local recipes after sync.');
    }
  });
}

function generateGuestId(): string {
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
