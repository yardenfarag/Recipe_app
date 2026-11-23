"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { FREE_MONTHLY_EXTRACT_LIMIT } from "@shared/lib/quotas";
import { importErrorText } from "@shared/lib/serverErrors";
import { requestSettledWithoutRecipe, snapOutcome, type SnapMessageKey } from "@shared/lib/snapOutcome";
import {
  extractionOutcomeIsUncertain,
  extractRecipe,
  extractRecipeFromImage,
  extractRecipeFromPdf,
  inventPhotoRequestKey,
  inventUrlRequestKey,
  pdfRequestKey,
  photoRequestKey,
  type ExtractResult,
} from "@shared/lib/supabase/extractRecipe";
import { inventRecipe, inventRecipeFromImage } from "@shared/lib/supabase/inventRecipe";
import { applyKitchenOnExtract } from "@shared/lib/supabase/kitchenAutoApply";
import { type RecipeEntrySource, recipePlatformProperty } from "@shared/lib/productEvents";
import { recipeIsInvented } from "@shared/lib/recipeOrigin";
import { showToast } from "@shared/lib/toast";
import { joinErrorSentences } from "@shared/lib/translateAppError";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { captureRecipeExtracted } from "@/lib/analytics";
import { webSalesOn } from "@/lib/credits/salesSwitch";
import { signInPathFor } from "@/lib/nextPath";
import { autoSaveRecipe } from "@/lib/snap/autoSave";
import { clearSnapDraft, setSnapDraft } from "@/lib/snap/draft";
import { setImportDraft } from "@/lib/editor/importDraft";
import { acknowledgeRequest, webExtractionContext } from "@/lib/snap/requestIds";

/** Snap a recipe that is written down, or Guess the recipe for a dish. */
export type SnapIntent = "extract" | "invent";

export type SnapSource =
  | { type: "url"; url: string }
  /** A photo, already shrunk to a JPEG (web/lib/compressImage.ts). */
  | { type: "photo"; base64: string; mimeType: string }
  /** A PDF, as is (PIN-72). Only ever a Snap: there is no Guess the recipe from a PDF. */
  | { type: "pdf"; base64: string; name: string };

export type SnapJob = { intent: SnapIntent; source: SnapSource };

export type SnapBanner = {
  /** `credits`: out of credits, with a way to buy more. `partial`: a free partial import (ADR 019). */
  tone: "error" | "info" | "credits" | "partial";
  title?: string;
  message: string;
  /**
   * A link that couldn't be read: the banner offers ways on (try again, a screenshot, Guess the recipe) instead of a
   * dead end. A failed first try used to be where new people gave up.
   */
  failedUrl?: string;
  /** A partial import kept for the editor: the banner offers "Fill it in myself" (`/recipe/edit?from=import`). */
  fillIn?: boolean;
} | null;

/** Failures where another try, a screenshot or a guess may still get the recipe (not "not food" or a bad link). */
const RECOVERABLE_MESSAGES = new Set<SnapMessageKey>([
  "snap.videoTooLong",
  "snap.timedOut",
  "snap.gateFailed",
  "snap.notFound",
  "snap.genericError",
]);

/** The link to offer ways on for, when a Snap of a link failed in a way worth another route. */
function recoverableUrl(job: SnapJob, messageKey?: SnapMessageKey): string | undefined {
  if (job.intent !== "extract" || job.source.type !== "url") return undefined;
  if (messageKey && !RECOVERABLE_MESSAGES.has(messageKey)) return undefined;
  return job.source.url;
}

/** No written recipe was found, but a dish was: offer to guess one. */
export type InventOffer = { source: SnapSource; dishGuess?: string; allowExtract: boolean };

type RunOptions = { forceExtract?: boolean; alreadyGated?: boolean };

/** How the Snap started, as the product event names it: a photo on the web is always a picked or dropped file. */
function entrySource(source: SnapSource): RecipeEntrySource {
  return source.type === "photo" ? "library" : source.type;
}

/** The request-id key each kind of import is stored under (the same keys as on mobile). */
function requestKey({ intent, source }: SnapJob): string {
  if (source.type === "url") return intent === "invent" ? inventUrlRequestKey(source.url) : source.url;
  if (source.type === "pdf") return pdfRequestKey(source.base64);
  return intent === "invent" ? inventPhotoRequestKey(source.base64) : photoRequestKey(source.base64);
}

function callImport({ intent, source }: SnapJob, language: string, options: RunOptions): Promise<ExtractResult> {
  const context = webExtractionContext;
  if (source.type === "pdf") return extractRecipeFromPdf(context, source.base64);
  if (intent === "invent") {
    const gated = { alreadyGated: options.alreadyGated };
    return source.type === "url"
      ? inventRecipe(context, source.url, language, gated)
      : inventRecipeFromImage(context, source.base64, source.mimeType, language, gated);
  }
  const force = { forceExtract: options.forceExtract };
  return source.type === "url"
    ? extractRecipe(context, source.url, force)
    : extractRecipeFromImage(context, source.base64, source.mimeType, force);
}

/**
 * Runs a Snap or a Guess the recipe and does what the result calls for, as the mobile app does
 * (src/app/(tabs)/add.tsx): a whole recipe goes to the preview, one already saved opens, a dish offers Guess the
 * recipe, and anything else is a message. Credits are charged by the Edge Functions alone; request ids make a retry
 * safe (shared/lib/extractionRequestId.ts).
 */
export function useSnap({ onSettled }: { onSettled?: () => void } = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [job, setJob] = useState<SnapJob | null>(null);
  const [banner, setBanner] = useState<SnapBanner>(null);
  const [offer, setOffer] = useState<InventOffer | null>(null);
  /** The recipe is in and its page is opening: the progress shows as complete until it does. */
  const [finished, setFinished] = useState(false);
  const running = useRef(false);

  const run = useCallback(
    async (next: SnapJob, options: RunOptions = {}) => {
      if (running.current) return;
      running.current = true;
      setBanner(null);
      setOffer(null);
      setFinished(false);
      setJob(next);
      let leaving = false;
      try {
        const key = requestKey(next);
        const result = await callImport(next, language, options);
        if (result.request_id && requestSettledWithoutRecipe(result)) await acknowledgeRequest(key, result.request_id);
        onSettled?.();

        const outcome = snapOutcome(result, next.intent === "extract" && next.source.type !== "pdf");
        switch (outcome.kind) {
          case "credits":
            setBanner({
              tone: "credits",
              // With web sales off the prompt can only point at the app.
              message: t(webSalesOn() ? "snap.creditLimitBody" : "snap.creditLimitBodyWeb", { limit: FREE_MONTHLY_EXTRACT_LIMIT }),
            });
            break;
          case "auth":
          case "guest_limit":
            leaving = true;
            router.push(signInPathFor("/add"));
            break;
          case "message":
            // The server's own words are English: a known code gets the app's translation instead (PIN-153).
            setBanner({
              tone: outcome.tone,
              message: outcome.serverMessage ? importErrorText(result, t, language, outcome.messageKey) : t(outcome.messageKey),
              failedUrl: outcome.tone === "error" ? recoverableUrl(next, outcome.messageKey) : undefined,
            });
            break;
          case "offer_invent":
            setOffer({ source: next.source, dishGuess: outcome.dishGuess, allowExtract: outcome.allowExtract });
            break;
          case "saved":
            leaving = true;
            setFinished(true);
            showToast(t("recipe.alreadySaved"), "info");
            router.push(`/recipe/${outcome.recipe.id}`);
            break;
          case "partial":
            // Free (ADR 019), and kept for the editor, where the cook adds what the source left out (as on mobile).
            setImportDraft(outcome.recipe);
            if (result.request_id && !extractionOutcomeIsUncertain(result.code)) await acknowledgeRequest(key, result.request_id);
            setBanner({
              tone: "partial",
              title: t("snap.partialTitle"),
              message: t(outcome.missingIngredients ? "snap.partialMissingIngredients" : "snap.partialMissingSteps"),
              fillIn: true,
            });
            break;
          case "preview": {
            setFinished(true);
            captureRecipeExtracted({
              source: entrySource(next.source),
              mode: recipeIsInvented(outcome.recipe) ? "invent" : "extract",
              recipe_platform: recipePlatformProperty(outcome.recipe.platform),
            });
            const kitchen = user ? await applyKitchenOnExtract(user.id, outcome.recipe) : { recipe: outcome.recipe, failed: false };
            await setSnapDraft(kitchen.recipe, {
              kitchenFailed: kitchen.failed,
              pending: result.request_id ? { key, requestId: result.request_id } : undefined,
            });
            leaving = true;
            // Saved straight away: many people left the preview without saving and lost the recipe. If the save
            // fails, the draft is still stored and the preview keeps its Save button.
            const savedId = await autoSaveRecipe(kitchen.recipe);
            if (savedId) {
              clearSnapDraft();
              // As on mobile: the recipe is kept as written, and the cook is told their kitchen wasn't applied.
              if (kitchen.failed) showToast(joinErrorSentences(t("recipe.kitchenAutoApplyFailedTitle"), t("recipe.kitchenAutoApplyFailed")), "error");
              router.push(`/recipe/${savedId}?justSaved=1`);
            } else {
              router.push("/recipe/preview");
            }
            break;
          }
        }
      } catch {
        setBanner({
          tone: "error",
          message: t(next.intent === "invent" ? "snap.inventFailed" : "snap.genericError"),
          failedUrl: recoverableUrl(next),
        });
      } finally {
        running.current = false;
        // Leaving for another page keeps the progress showing until it opens, instead of flashing the form.
        if (!leaving) setJob(null);
      }
    },
    [language, onSettled, router, t, user],
  );

  /** Guess the recipe for the dish that was found. The food check already ran, so it isn't run again. */
  const acceptOffer = useCallback(() => {
    if (offer) void run({ intent: "invent", source: offer.source }, { alreadyGated: true });
  }, [offer, run]);

  /** Read it as a recipe after all. */
  const extractAnyway = useCallback(() => {
    if (offer) void run({ intent: "extract", source: offer.source }, { forceExtract: true });
  }, [offer, run]);

  return {
    job,
    finished,
    banner,
    setBanner,
    offer,
    dismissOffer: useCallback(() => setOffer(null), []),
    run,
    acceptOffer,
    extractAnyway,
  };
}
