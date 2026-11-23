import { captureRecipeExtracted } from '@/lib/analytics';
import { saveImportedRecipe } from '@/lib/autoSaveRecipe';
import { clearExtractionRequestId } from '@/lib/extractionRequestId';
import { fileUriToBase64 } from '@/lib/pickCompressedImage';
import { mobileExtractionContext } from '@/lib/supabase/extractRecipe';
import { cachedChatPhotoUri } from '@/lib/whatsappImport/chatFile';
import { classifyExtractResult } from '@/lib/whatsappImport/outcome';
import { normalizeSocialUrl } from '@shared/lib/platformUrls';
import { recipePlatformProperty } from '@shared/lib/productEvents';
import {
  extractRecipe,
  extractRecipeFromImage,
  extractRecipeFromText,
  type ExtractionRequestContext,
  type ExtractResult,
} from '@shared/lib/supabase/extractRecipe';
import { applyKitchenOnExtract } from '@shared/lib/supabase/kitchenAutoApply';
import type { ChatExport, ImportItemResult, RecipeCandidate } from '@shared/lib/whatsappImport';

/**
 * Imports one item from a WhatsApp chat (ADR 032) the way Snap imports a link or a photo: the same request ids,
 * photo prep, kitchen auto-apply and Library save. The differences: nothing opens (no preview, no editor, no Guess
 * the recipe offer), and the recipe draft isn't used, because two imports run at once.
 */
export function createWhatsAppImportOne({
  chat,
  userId,
  onDailyLimit,
}: {
  chat: ChatExport;
  userId: string;
  /** The day's import limit was reached; the item is reported as out_of_credits so the batch stops. */
  onDailyLimit?: () => void;
}): (candidate: RecipeCandidate) => Promise<ImportItemResult> {
  return async (candidate) => {
    // The request-id key the shared call used, so the id can be forgotten once the outcome is known.
    let requestKey: string | null = null;
    const context: ExtractionRequestContext = {
      ...mobileExtractionContext,
      getOrCreateRequestId: (key) => {
        requestKey = key;
        return mobileExtractionContext.getOrCreateRequestId(key);
      },
    };

    const result = await extractCandidate(candidate, chat, context);
    if (!result) return { status: 'failed', code: 'unreadable' };

    const acknowledge = async () => {
      if (!requestKey || !result.request_id) return;
      try {
        await clearExtractionRequestId(requestKey, result.request_id);
      } catch (error) {
        console.warn('[extraction] request acknowledgement failed', error);
      }
    };

    const outcome = classifyExtractResult(result);
    if (outcome.action === 'done') {
      if (outcome.acknowledge) await acknowledge();
      if (outcome.dailyLimit) onDailyLimit?.();
      return outcome.result;
    }

    // The recipe came from a chat shared out of WhatsApp, so it counts as a share.
    captureRecipeExtracted({
      source: 'share',
      mode: 'extract',
      recipe_platform: recipePlatformProperty(outcome.recipe.platform),
    });
    // Shared with Snap and the web app: shared/lib/supabase/kitchenAutoApply.ts.
    const kitchen = await applyKitchenOnExtract(userId, outcome.recipe);
    try {
      const recipeId = await saveImportedRecipe(kitchen.recipe);
      await acknowledge();
      return { status: 'saved', recipeId };
    } catch (error) {
      // The request id is kept: trying again reuses it, so the import isn't charged twice.
      console.warn('[whatsapp-import] save failed', error);
      return { status: 'failed', code: 'save_failed' };
    }
  };
}

async function extractCandidate(
  candidate: RecipeCandidate,
  chat: ChatExport,
  context: ExtractionRequestContext,
): Promise<ExtractResult | null> {
  if (candidate.kind === 'link' && candidate.url) {
    // As Snap does with a pasted or shared link.
    const url = normalizeSocialUrl(candidate.url);
    return url ? extractRecipe(context, url) : null;
  }
  if (candidate.kind === 'photo' && candidate.photo) {
    const { fileName } = candidate.photo;
    const uri = cachedChatPhotoUri(fileName, () => chat.readPhoto(fileName));
    if (!uri) return null;
    // Snap's photo prep: resized and compressed to JPEG under the server's size limit.
    const image = await fileUriToBase64(uri);
    if (!image) return null;
    return extractRecipeFromImage(context, image.base64, image.mimeType);
  }
  if (candidate.kind === 'text' && candidate.text?.trim()) {
    return extractRecipeFromText(context, candidate.text);
  }
  return null;
}
