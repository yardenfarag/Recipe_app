import { getOrCreateExtractionRequestId } from '@/lib/extractionRequestId';
import { getInstallId } from '@/lib/installId';
import {
  extractRecipe as extractRecipeShared,
  extractRecipeFromImage as extractRecipeFromImageShared,
  type ExtractionRequestContext,
  type ExtractResult,
} from '@shared/lib/supabase/extractRecipe';

export {
  extractionOutcomeIsUncertain,
  NO_RESPONSE_CODE,
  type ExtractedRecipe,
  type ExtractResult,
  type ExtractStatus,
} from '@shared/lib/supabase/extractRecipe';

/** The mobile app's request ids (device storage) and the install id that meters guests. */
export const mobileExtractionContext: ExtractionRequestContext = {
  getOrCreateRequestId: (key) => getOrCreateExtractionRequestId(key),
  getGuestInstallId: () => getInstallId(),
};

/**
 * Sends a social URL to the `extract-recipe` Edge Function and returns the
 * structured result. Does not persist — the caller decides where to save
 * (local guest store or Supabase) per ADR 002. The call itself is shared with the web app
 * (shared/lib/supabase/extractRecipe.ts).
 */
export function extractRecipe(url: string, opts?: { forceExtract?: boolean }): Promise<ExtractResult> {
  return extractRecipeShared(mobileExtractionContext, url, opts);
}

/**
 * Sends a recipe photo (base64) to `extract-recipe`. Same credits as a URL Snap.
 */
export function extractRecipeFromImage(
  imageBase64: string,
  mimeType = 'image/jpeg',
  opts?: { forceExtract?: boolean },
): Promise<ExtractResult> {
  return extractRecipeFromImageShared(mobileExtractionContext, imageBase64, mimeType, opts);
}
