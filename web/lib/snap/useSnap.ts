"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { FREE_MONTHLY_EXTRACT_LIMIT } from "@shared/lib/quotas";
import { requestSettledWithoutRecipe, snapOutcome } from "@shared/lib/snapOutcome";
import {
  extractionOutcomeIsUncertain,
  extractRecipe,
  extractRecipeFromImage,
  inventPhotoRequestKey,
  inventUrlRequestKey,
  photoRequestKey,
  type ExtractResult,
} from "@shared/lib/supabase/extractRecipe";
import { inventRecipe, inventRecipeFromImage } from "@shared/lib/supabase/inventRecipe";
import { applyKitchenOnExtract } from "@shared/lib/supabase/kitchenAutoApply";
import { showToast } from "@shared/lib/toast";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { signInPathFor } from "@/lib/nextPath";
import { setSnapDraft } from "@/lib/snap/draft";
import { acknowledgeRequest, webExtractionContext } from "@/lib/snap/requestIds";

/** Snap a recipe that is written down, or Guess the recipe for a dish. */
export type SnapIntent = "extract" | "invent";

export type SnapSource =
  | { type: "url"; url: string }
  /** A photo, already shrunk to a JPEG (web/lib/compressImage.ts). */
  | { type: "photo"; base64: string; mimeType: string };

export type SnapJob = { intent: SnapIntent; source: SnapSource };

export type SnapBanner = {
  /** `credits`: out of credits, with a way to buy more. `partial`: a free partial import (ADR 019). */
  tone: "error" | "info" | "credits" | "partial";
  title?: string;
  message: string;
} | null;

/** No written recipe was found, but a dish was: offer to guess one. */
export type InventOffer = { source: SnapSource; dishGuess?: string; allowExtract: boolean };

type RunOptions = { forceExtract?: boolean; alreadyGated?: boolean };

/** The request-id key each kind of import is stored under (the same keys as on mobile). */
function requestKey({ intent, source }: SnapJob): string {
  if (source.type === "url") return intent === "invent" ? inventUrlRequestKey(source.url) : source.url;
  return intent === "invent" ? inventPhotoRequestKey(source.base64) : photoRequestKey(source.base64);
}

function callImport({ intent, source }: SnapJob, language: string, options: RunOptions): Promise<ExtractResult> {
  const context = webExtractionContext;
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
  const running = useRef(false);

  const run = useCallback(
    async (next: SnapJob, options: RunOptions = {}) => {
      if (running.current) return;
      running.current = true;
      setBanner(null);
      setOffer(null);
      setJob(next);
      let leaving = false;
      try {
        const key = requestKey(next);
        const result = await callImport(next, language, options);
        if (result.request_id && requestSettledWithoutRecipe(result)) await acknowledgeRequest(key, result.request_id);
        onSettled?.();

        const outcome = snapOutcome(result, next.intent === "extract");
        switch (outcome.kind) {
          case "credits":
            setBanner({ tone: "credits", message: t("snap.creditLimitBody", { limit: FREE_MONTHLY_EXTRACT_LIMIT }) });
            break;
          case "auth":
          case "guest_limit":
            leaving = true;
            router.push(signInPathFor("/add"));
            break;
          case "message":
            setBanner({ tone: outcome.tone, message: outcome.serverMessage ?? t(outcome.messageKey) });
            break;
          case "offer_invent":
            setOffer({ source: next.source, dishGuess: outcome.dishGuess, allowExtract: outcome.allowExtract });
            break;
          case "saved":
            leaving = true;
            showToast(t("recipe.alreadySaved"), "info");
            router.push(`/recipe/${outcome.recipe.id}`);
            break;
          case "partial":
            // Nothing to keep: the editor to fill it in isn't on the web yet (PIN-137), and a partial import is free.
            if (result.request_id && !extractionOutcomeIsUncertain(result.code)) await acknowledgeRequest(key, result.request_id);
            setBanner({
              tone: "partial",
              title: t("snap.partialTitle"),
              message: t(outcome.missingIngredients ? "web.snap.partialMissingIngredients" : "web.snap.partialMissingSteps"),
            });
            break;
          case "preview": {
            const kitchen = user ? await applyKitchenOnExtract(user.id, outcome.recipe) : { recipe: outcome.recipe, failed: false };
            await setSnapDraft(kitchen.recipe, {
              kitchenFailed: kitchen.failed,
              pending: result.request_id ? { key, requestId: result.request_id } : undefined,
            });
            leaving = true;
            router.push("/recipe/preview");
            break;
          }
        }
      } catch {
        setBanner({ tone: "error", message: t(next.intent === "invent" ? "snap.inventFailed" : "snap.genericError") });
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
    banner,
    setBanner,
    offer,
    dismissOffer: useCallback(() => setOffer(null), []),
    run,
    acceptOffer,
    extractAnyway,
  };
}
