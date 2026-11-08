/**
 * Client for the save-recipe-edit Edge Function (PIN-79, ADR 018): one endpoint for Edit recipe,
 * Write a recipe, and retrying a recalculation that failed. Free: never spends recipe credits.
 *
 * The server mirrors these types in supabase/functions/_shared/recipeEditTypes.ts. Change both.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';

import type { RecipeAppliance } from '@/lib/appliances';
import { supabase } from '@/lib/supabase/client';
import type {
  CostEstimate,
  EffortLevel,
  Ingredient,
  Instruction,
  LockedField,
  RecalcField,
  Recipe,
} from '@/types/recipe';

/** The photo after editing. The server stores a new one in recipe-thumbnails; the app never does. */
export type RecipeEditPhoto =
  | { action: 'keep' }
  | { action: 'remove' }
  | { action: 'replace'; base64: string; mime_type: string };

/** Everything the editor can change. Source (URL, platform) is never sent: it can't change. */
export interface RecipeEditContent {
  title: string;
  photo: RecipeEditPhoto;
  servings: number;
  ingredients: Ingredient[];
  /** Renumbered 1..n in display order. timestamp_seconds kept from the step it came from. */
  instructions: Instruction[];
  estimated_time_minutes: number | null;
  calories: number | null;
  effort_level: EffortLevel | null;
  cost_estimate: CostEstimate | null;
  tags: string[];
  /** Step links already remapped by the editor to the new step numbers. null = not analysed. */
  appliances: RecipeAppliance[] | null;
  cook_note: string | null;
}

export type SaveRecipeEditRequest =
  | {
      mode: 'edit';
      recipe_id: string;
      content: RecipeEditContent;
      locked_fields: LockedField[];
      /**
       * One entry per step in content.instructions: the `step` number it had before the edit,
       * or null for a new step. Steps missing from this list were deleted.
       */
      step_sources: (number | null)[];
      /** One entry per ingredient: its index before the edit, or null for a new row. */
      ingredient_sources: (number | null)[];
      /** App language, for messages. */
      app_language: string;
    }
  | {
      mode: 'write';
      content: RecipeEditContent;
      locked_fields: LockedField[];
      /** Fallback source language when Jev isn't confident what language the recipe is in. */
      app_language: string;
    }
  | {
      /** Re-run whatever is still in recalc_pending (a recalculation that failed or was capped). */
      mode: 'retry';
      recipe_id: string;
      app_language: string;
    };

/** Fields a hard limit or the content check can point at. */
export type RecipeEditField =
  | 'title'
  | 'photo'
  | 'servings'
  | 'ingredients'
  | 'instructions'
  | 'estimated_time_minutes'
  | 'calories'
  | 'tags'
  | 'cook_note';

/** A hard-limit failure. The editor checks the same limits first, so this is a backstop. */
export interface RecipeEditLimitError {
  field: RecipeEditField;
  /** 0-based row for ingredients, instructions and tags. */
  index?: number;
  code: 'required' | 'too_long' | 'too_many' | 'out_of_range';
}

/** Why the content check blocked a save. The app turns these into messages per field. */
export interface RecipeEditBlockReason {
  field: RecipeEditField;
  /** 0-based row for ingredients, instructions and tags. */
  index?: number;
  /** not_recipe: not a real, cookable recipe. unsafe: not edible or safe. spam: links, ads, offensive or sexual content. */
  code: 'not_recipe' | 'unsafe' | 'spam';
}

export type SaveRecipeEditResult =
  | {
      status: 'saved';
      recipe: Recipe;
      /** Fields being recalculated in the background; also stored on recipe.recalc_pending. */
      recalculating: RecalcField[];
      /** limited = past the 40-a-day cap: content saved, recalculation waits for tomorrow. */
      recalculation: 'started' | 'none' | 'limited';
    }
  | { status: 'blocked'; reasons: RecipeEditBlockReason[] }
  | { status: 'invalid'; errors: RecipeEditLimitError[] }
  | {
      status: 'failed';
      code: 'auth_required' | 'not_found' | 'server_error' | 'network';
      message: string;
    };

async function failureFrom(error: unknown): Promise<SaveRecipeEditResult> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as Partial<SaveRecipeEditResult>;
      if (body.status === 'invalid' || body.status === 'blocked' || body.status === 'failed') {
        return body as SaveRecipeEditResult;
      }
    } catch {
      // Fall through.
    }
    return { status: 'failed', code: 'server_error', message: 'Could not save the recipe.' };
  }
  return { status: 'failed', code: 'network', message: 'Could not reach Pinch. Check your connection.' };
}

/** Saves an edited or written recipe, or retries its recalculation. Never throws. */
export async function saveRecipeEdit(request: SaveRecipeEditRequest): Promise<SaveRecipeEditResult> {
  const { data, error } = await supabase.functions.invoke<SaveRecipeEditResult>('save-recipe-edit', {
    body: request,
  });
  if (error) return failureFrom(error);
  return data ?? { status: 'failed', code: 'server_error', message: 'No response from Pinch.' };
}
