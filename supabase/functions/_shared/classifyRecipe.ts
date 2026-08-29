/** Shared full/partial/failed rules (ADR 004). Keep in sync with `src/lib/recipeCompleteness.ts`. */

export type ClassifiableRecipe = {
  found_recipe?: boolean;
  title?: string | null;
  ingredients?: unknown[] | null;
  instructions?: unknown[] | null;
  calories?: number | null;
  estimated_time_minutes?: number | null;
  cost_estimate?: string | null;
  effort_level?: string | null;
};

export type RecipeClassifyStatus = 'full' | 'partial' | 'failed';

export function classifyGeminiRecipe(r: ClassifiableRecipe): {
  status: RecipeClassifyStatus;
  missingFields: string[];
} {
  const hasTitle = Boolean(r.found_recipe && r.title?.trim());
  const hasIngredients = (r.ingredients?.length ?? 0) > 0;
  const hasInstructions = (r.instructions?.length ?? 0) > 0;

  if (!hasTitle || (!hasIngredients && !hasInstructions)) {
    return { status: 'failed', missingFields: [] };
  }

  const missingFields: string[] = [];
  if (!hasIngredients) missingFields.push('ingredients');
  if (!hasInstructions) missingFields.push('instructions');
  if (r.calories == null) missingFields.push('calories');
  if (r.estimated_time_minutes == null) missingFields.push('estimated_time_minutes');
  if (!r.cost_estimate) missingFields.push('cost_estimate');
  if (!r.effort_level) missingFields.push('effort_level');

  const isFull = hasTitle && hasIngredients && hasInstructions;
  return { status: isFull ? 'full' : 'partial', missingFields };
}

/** True when a second pass filled missing ingredients or steps (or became full). */
export function recipeRepairIsUpgrade(
  before: ClassifiableRecipe,
  after: ClassifiableRecipe,
): boolean {
  const beforeClass = classifyGeminiRecipe(before);
  const afterClass = classifyGeminiRecipe(after);
  if (afterClass.status === 'failed') return false;
  if (beforeClass.status !== 'full' && afterClass.status === 'full') return true;

  const beforeIng = before.ingredients?.length ?? 0;
  const afterIng = after.ingredients?.length ?? 0;
  const beforeIns = before.instructions?.length ?? 0;
  const afterIns = after.instructions?.length ?? 0;
  if (beforeIng === 0 && afterIng > 0) return true;
  if (beforeIns === 0 && afterIns > 0) return true;
  return false;
}

export function filledFieldsSummary(
  before: ClassifiableRecipe,
  after: ClassifiableRecipe,
): string[] {
  const filled: string[] = [];
  const beforeIng = before.ingredients?.length ?? 0;
  const afterIng = after.ingredients?.length ?? 0;
  const beforeIns = before.instructions?.length ?? 0;
  const afterIns = after.instructions?.length ?? 0;
  if (beforeIng === 0 && afterIng > 0) filled.push('ingredients');
  if (beforeIns === 0 && afterIns > 0) filled.push('instructions');
  if (before.calories == null && after.calories != null) filled.push('calories');
  if (before.estimated_time_minutes == null && after.estimated_time_minutes != null) {
    filled.push('estimated_time_minutes');
  }
  return filled;
}
