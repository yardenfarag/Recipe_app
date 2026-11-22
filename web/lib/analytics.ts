"use client";

import type {
  AppShareOutcome,
  HeardAboutSource,
  PaywallTrigger,
  ProductEventName,
  RecipeEntryMode,
  RecipeEntrySource,
} from "@shared/lib/productEvents";
import { insertProductEvent } from "@shared/lib/supabase/productEvents";

import { ACTIVITY_PLATFORM, APP_VERSION } from "@/lib/activity/appInfo";
import { getVisitorId } from "@/lib/activity/visitorId";
import { getSupabase } from "@/lib/supabase";

/**
 * Product events from the new web app (`product_events`, ADR 020): the same names and properties as the mobile app's
 * (src/lib/analytics.ts). Every row carries the visitor id, signed in or not, so the admin dashboard can tie an account
 * to what this visitor did before sign-up (a landing-page visit, the "heard about" answer). Events that carry
 * `platform` on mobile carry `web` here; every event also carries `app_version` ("1.0.10-next"), so the new web app
 * can be told apart from the Expo web app.
 *
 * Fire and forget: never awaited, never throws, nothing in unit tests. Contract for callers: keep these signatures.
 * Never pass anything a person typed, a recipe title or an email.
 */
function capture(name: ProductEventName, properties: Record<string, string>): void {
  if (typeof window === "undefined" || process.env.NODE_ENV === "test") return;
  void send(name, { ...properties, app_version: APP_VERSION });
}

/** The browser's region ("he-IL" → "IL"), used only when the server can't tell the country from the request. */
function browserCountry(): string | null {
  const match = /-([A-Za-z]{2})$/.exec(navigator.language || "");
  return match ? match[1].toUpperCase() : null;
}

async function send(name: ProductEventName, properties: Record<string, string>): Promise<void> {
  try {
    const { data } = await getSupabase().auth.getSession();
    await insertProductEvent({
      userId: data.session?.user.id ?? null,
      installId: getVisitorId(),
      name,
      properties,
      country: browserCountry(),
    });
  } catch (error) {
    console.warn("[analytics] insert failed", error);
  }
}

export function captureRecipeExtracted(properties: {
  source: RecipeEntrySource;
  mode: RecipeEntryMode;
  /** From recipePlatformProperty(): pinterest, instagram, web… */
  recipe_platform: string;
}): void {
  capture("recipe_extracted", properties);
}

export function captureRecipeSaved(properties: { from: RecipeEntryMode }): void {
  capture("recipe_saved", properties);
}

export function capturePaywallViewed(trigger: PaywallTrigger): void {
  capture("paywall_viewed", { trigger });
}

export function captureOnboardingCompleted(properties: { locale: string }): void {
  capture("onboarding_completed", { ...properties, platform: ACTIVITY_PLATFORM });
}

/** Sent before sign-up too, so guests are counted by their visitor id. */
export function captureHeardAbout(properties: { source: HeardAboutSource }): void {
  capture("heard_about", { ...properties, platform: ACTIVITY_PLATFORM });
}

export function captureAppShared(properties: { outcome: AppShareOutcome }): void {
  capture("app_shared", { ...properties, platform: ACTIVITY_PLATFORM });
}
