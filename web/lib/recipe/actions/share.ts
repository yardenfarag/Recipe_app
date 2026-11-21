import { shareAppInBrowser, type ShareAppResult } from "@shared/lib/shareApp";
import { createRecipeShare } from "@shared/lib/supabase/recipeShare";
import type { Recipe } from "@shared/types/recipe";

export type ShareOutcome = ShareAppResult | "failed";

/**
 * Share (PIN-110), as on mobile: a Pinch link to the saved recipe, or the source link if that can't be made. The
 * browser's share sheet opens where there is one (phones, Safari, Edge); otherwise the link alone is copied.
 */
export async function shareRecipeLink(recipe: Recipe, title: string): Promise<ShareOutcome> {
  const created = await createRecipeShare(recipe.id).catch(() => null);
  const url = created?.status === "ok" ? created.url : recipe.original_url?.trim() || null;
  if (!url) return "failed";
  try {
    return await shareAppInBrowser({ title: title.trim() || "Recipe", message: "", url });
  } catch {
    return "failed";
  }
}
