import { mergeRewrittenInstructions, patchInstructionsForSubstitution } from "@shared/lib/patchInstructionsForSubstitution";
import type { RecipeLanguageCode } from "@shared/lib/recipeLanguages";
import {
  rewriteInstructionsForSubstitution,
  suggestSubstitution,
  type SubstitutionAlternative,
} from "@shared/lib/supabase/suggestSubstitution";
import type { Ingredient, Instruction } from "@shared/types/recipe";

export type SwapTarget = {
  index: number;
  /** At the servings on screen, as the reader sees it. */
  ingredient: Ingredient;
  servingsShown: number;
};

/** Two or three alternatives from `suggest-substitution` (ADR 005), or null when there are none. Free, as on mobile. */
export async function findAlternatives(
  target: SwapTarget,
  context: { title: string; ingredients: Ingredient[]; language: RecipeLanguageCode | null },
): Promise<SubstitutionAlternative[] | null> {
  const others = context.ingredients.filter((_, i) => i !== target.index).map((ingredient) => ingredient.name);
  try {
    const result = await suggestSubstitution(target.ingredient, context.title, others, context.language);
    return result.status === "ok" && result.alternatives?.length ? result.alternatives : null;
  } catch {
    return null;
  }
}

/**
 * The steps after a swap, as mobile makes them: the model rewrites the steps that use the ingredient; if that fails,
 * the old name is replaced by the new one in the steps, so the swap still goes through.
 */
export async function stepsAfterSwap(
  target: SwapTarget,
  alternative: SubstitutionAlternative,
  context: { title: string; instructions: Instruction[]; language: RecipeLanguageCode | null },
): Promise<Instruction[]> {
  const patched = patchInstructionsForSubstitution(context.instructions, target.ingredient.name, alternative.name);
  try {
    const result = await rewriteInstructionsForSubstitution(target.ingredient, alternative, context.instructions, context.title, context.language);
    if (result.status === "ok" && result.instructions?.length) return mergeRewrittenInstructions(context.instructions, result.instructions);
  } catch {
    // The local patch stands.
  }
  return patched;
}
