import { fitInstruction } from "@shared/lib/avoidList";
import { RECIPE_REMIX_LIMIT } from "@shared/lib/quotas";
import type { RecipeVariantKey } from "@shared/lib/recipeVariants";
import { transformRecipe, type TransformedRecipePayload } from "@shared/lib/supabase/transformRecipe";

import type { RecipeDisplay } from "@/components/recipe/types";

export type RemixRequest =
  /** A style from the list, or the reader's own words, with their allergies added (as on mobile). */
  | { kind: "remix"; variant: RecipeVariantKey; instruction?: string }
  /** "Make it without these": a complete request, sent as it is. */
  | { kind: "fix"; instruction: string };

export type RemixOutcome =
  | { status: "ok"; result: TransformedRecipePayload }
  /** `limit`: the recipe's free remixes are used up. `unrelated`: the request isn't about this recipe. */
  | { status: "failed"; reason: "limit" | "unrelated" | "no_credits" | "other"; needed?: number };

/**
 * Remix and "Make it without these" (PIN-105) call `transform-recipe` exactly as the mobile remix sheet does, so they
 * count against the same per-recipe limit (RECIPE_REMIX_LIMIT) and cost the same: nothing.
 */
export async function runRemix(display: RecipeDisplay, request: RemixRequest, allergies: string | null): Promise<RemixOutcome> {
  const { recipe } = display;
  const instruction =
    request.kind === "fix" ? request.instruction : (fitInstruction([request.instruction?.trim() || null, allergies]) ?? undefined);
  const variant = request.kind === "fix" ? "custom" : request.variant;
  try {
    const result = await transformRecipe(
      variant,
      {
        title: display.title,
        servings: recipe.servings,
        ingredients: display.ingredients,
        instructions: display.instructions,
        calories: recipe.calories,
        id: recipe.id,
        original_url: recipe.original_url,
      },
      instruction,
    );
    if (result.status === "ok" && result.recipe) return { status: "ok", result: result.recipe };
    return { status: "failed", ...remixFailure(result.code, result.tokens_required) };
  } catch {
    return { status: "failed", reason: "other" };
  }
}

function remixFailure(code: string | undefined, needed: number | undefined): { reason: "limit" | "unrelated" | "no_credits" | "other"; needed?: number } {
  if (code === "recipe_limit" || code === "daily_limit") return { reason: "limit" };
  if (code === "instruction_unrelated") return { reason: "unrelated" };
  if (code === "insufficient_credits") return { reason: "no_credits", needed };
  return { reason: "other" };
}

/** The i18n key and values for a failed remix. */
export function remixFailureMessage(reason: "limit" | "unrelated" | "no_credits" | "other"): [string, Record<string, unknown>?] {
  if (reason === "limit") return ["recipe.remixRecipeLimit", { limit: RECIPE_REMIX_LIMIT }];
  if (reason === "unrelated") return ["recipe.remixUnrelated"];
  return ["recipe.remixFailed"];
}
