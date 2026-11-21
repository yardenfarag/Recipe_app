import { mobileExtractionContext } from '@/lib/supabase/extractRecipe';
import {
  inventRecipe as inventRecipeShared,
  inventRecipeFromImage as inventRecipeFromImageShared,
  type InventResult,
} from '@shared/lib/supabase/inventRecipe';

export type { InventResult };

/** Guess the recipe from a link. The call is shared with the web app (shared/lib/supabase/inventRecipe.ts). */
export function inventRecipe(
  url: string,
  language = 'en',
  opts?: { alreadyGated?: boolean },
): Promise<InventResult> {
  return inventRecipeShared(mobileExtractionContext, url, language, opts);
}

export function inventRecipeFromImage(
  imageBase64: string,
  mimeType = 'image/jpeg',
  language = 'en',
  opts?: { alreadyGated?: boolean },
): Promise<InventResult> {
  return inventRecipeFromImageShared(mobileExtractionContext, imageBase64, mimeType, language, opts);
}
