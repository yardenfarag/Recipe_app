import { normalizeSocialUrl } from "@shared/lib/platformUrls";
import { recipePlatformProperty } from "@shared/lib/productEvents";
import { recipeIsInvented } from "@shared/lib/recipeOrigin";
import { requestSettledWithoutRecipe, snapOutcome } from "@shared/lib/snapOutcome";
import {
  extractionOutcomeIsUncertain,
  extractRecipe,
  extractRecipeFromImage,
  extractRecipeFromText,
  type ExtractionRequestContext,
  type ExtractResult,
} from "@shared/lib/supabase/extractRecipe";
import { applyKitchenOnExtract } from "@shared/lib/supabase/kitchenAutoApply";
import type { ChatExport, ImportItemResult, RecipeCandidate } from "@shared/lib/whatsappImport";

import { captureRecipeExtracted } from "@/lib/analytics";
import { compressImageFile } from "@/lib/compressImage";
import { autoSaveRecipe } from "@/lib/snap/autoSave";
import { acknowledgeRequest, webExtractionContext } from "@/lib/snap/requestIds";

/** Out of credits for the batch: it stops starting new items (the brief maps these three to out_of_credits). */
const OUT_OF_CREDITS_CODES = new Set(["insufficient_credits", "monthly_limit", "guest_limit"]);

/**
 * The web app's request-id store, noting the key the import call asked for, so the id can be forgotten under the
 * same key once the outcome is known (as Snap does). Works for every kind, including the text import whose key the
 * shared call makes itself.
 */
function keyedContext(): { context: ExtractionRequestContext; key: () => string | null } {
  let key: string | null = null;
  return {
    context: {
      getOrCreateRequestId: (requested) => {
        key = requested;
        return webExtractionContext.getOrCreateRequestId(requested);
      },
    },
    key: () => key,
  };
}

/** The photo from the chat, shrunk the way Snap shrinks a picked photo (lib/compressImage.ts). */
async function chatPhoto(chat: Pick<ChatExport, "readPhoto">, photo: NonNullable<RecipeCandidate["photo"]>) {
  const bytes = chat.readPhoto(photo.fileName);
  if (!bytes) return null;
  // Copied into a plain ArrayBuffer-backed array, which is what File takes.
  const file = new File([new Uint8Array(bytes)], photo.fileName, { type: photo.mime });
  return compressImageFile(file);
}

type Call = { result: ExtractResult } | { failed: string };

async function callImport(candidate: RecipeCandidate, chat: Pick<ChatExport, "readPhoto">, context: ExtractionRequestContext): Promise<Call> {
  switch (candidate.kind) {
    case "link": {
      const url = candidate.url ? (normalizeSocialUrl(candidate.url) ?? candidate.url) : null;
      if (!url) return { failed: "no_link" };
      return { result: await extractRecipe(context, url) };
    }
    case "photo": {
      if (!candidate.photo) return { failed: "no_photo" };
      const image = await chatPhoto(chat, candidate.photo);
      if (!image) return { failed: "photo_unreadable" };
      return { result: await extractRecipeFromImage(context, image.base64, image.mimeType) };
    }
    case "text": {
      const text = candidate.text?.trim();
      if (!text) return { failed: "no_text" };
      return { result: await extractRecipeFromText(context, text) };
    }
  }
}

/**
 * Makes the WhatsApp import's `importOne` (shared/lib/whatsappImport): reads one candidate into a recipe and saves
 * it to the Library, the way a Snap does (lib/snap/useSnap.ts): the same request ids, photo shrinking, kitchen
 * preferences and auto-save. Nothing is previewed: a recipe that couldn't be saved counts as failed, and keeps its
 * request id so trying again isn't charged twice.
 */
export function createChatImporter({
  chat,
  userId,
  onDailyLimit,
}: {
  chat: Pick<ChatExport, "readPhoto">;
  userId: string | null;
  /**
   * The day's import limit is reached (`daily_limit`): every item after this one would fail too, so it is reported
   * as out_of_credits, which stops the batch, and this says why.
   */
  onDailyLimit?: () => void;
}) {
  return async function importOne(candidate: RecipeCandidate): Promise<ImportItemResult> {
    const { context, key } = keyedContext();
    const call = await callImport(candidate, chat, context);
    if ("failed" in call) return { status: "failed", code: call.failed };
    const { result } = call;
    const requestKey = key();
    const forget = async () => {
      if (result.request_id && requestKey) await acknowledgeRequest(requestKey, result.request_id);
    };

    if (requestSettledWithoutRecipe(result)) await forget();
    if (result.code && OUT_OF_CREDITS_CODES.has(result.code)) return { status: "out_of_credits" };
    if (result.code === "daily_limit") {
      onDailyLimit?.();
      return { status: "out_of_credits" };
    }

    // No Guess the recipe here: a chat import only takes recipes that are written down.
    const outcome = snapOutcome(result, false);
    switch (outcome.kind) {
      case "credits":
      case "guest_limit":
        return { status: "out_of_credits" };
      case "saved":
        return { status: "already_saved", recipeId: outcome.recipe.id };
      case "partial":
        // Free (ADR 019) and never saved as is: Snap sends it to the editor, which a batch can't.
        if (!extractionOutcomeIsUncertain(result.code)) await forget();
        return { status: "failed", code: "partial" };
      case "preview": {
        if (candidate.kind !== "text") {
          captureRecipeExtracted({
            source: candidate.kind === "link" ? "url" : "library",
            mode: recipeIsInvented(outcome.recipe) ? "invent" : "extract",
            recipe_platform: recipePlatformProperty(outcome.recipe.platform),
          });
        }
        const kitchen = userId ? await applyKitchenOnExtract(userId, outcome.recipe) : { recipe: outcome.recipe };
        const savedId = await autoSaveRecipe(kitchen.recipe);
        if (!savedId) return { status: "failed", code: "save_failed" };
        await forget();
        return { status: "saved", recipeId: savedId };
      }
      case "auth":
        return { status: "failed", code: "auth_required" };
      case "message":
        return { status: "failed", code: result.code ?? outcome.messageKey };
      case "offer_invent":
        return { status: "failed", code: result.code ?? "no_recipe" };
    }
  };
}
