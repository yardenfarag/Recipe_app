import * as Localization from 'expo-localization';

import { getInstallId } from '@/lib/installId';
import { supabase } from '@/lib/supabase/client';

import type {
  AppShareOutcome,
  HeardAboutSource,
  ProductEventName,
  PaywallTrigger,
  RecipeEntryMode,
  RecipeEntrySource,
} from '@shared/lib/productEvents';

export {
  HEARD_ABOUT_SOURCES,
  type AppShareOutcome,
  type HeardAboutSource,
  type PaywallTrigger,
  type RecipeEntryMode,
  type RecipeEntrySource,
} from '@shared/lib/productEvents';

// web_intro_viewed / web_intro_clicked come from the static landing page (landing/index.html).

function capture(name: ProductEventName, properties: Record<string, string>): void {
  void insertProductEvent(name, properties);
}

/** Device region, used only when the request has no network country. */
function deviceCountry(): string | null {
  try {
    const code = Localization.getLocales()[0]?.regionCode?.trim().toUpperCase() ?? '';
    return /^[A-Z]{2}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

async function insertProductEvent(
  name: ProductEventName,
  properties: Record<string, string>,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id ?? null;
    // Sent when signed in too: it ties the account to this install's events from
    // before sign-up ("heard about" answer, website visit) for the admin dashboard.
    const installId = await getInstallId();
    const { error } = await supabase.from('product_events').insert({
      user_id: userId,
      guest_install_id: installId,
      name,
      properties,
      country: deviceCountry(),
    });
    if (error) console.warn('[analytics] insert failed', error.message);
  } catch (error) {
    console.warn('[analytics] insert failed', error);
  }
}

export function captureRecipeExtracted(properties: {
  source: RecipeEntrySource;
  mode: RecipeEntryMode;
}): void {
  capture('recipe_extracted', properties);
}

export function captureRecipeSaved(properties: { from: RecipeEntryMode }): void {
  capture('recipe_saved', properties);
}

export function capturePaywallViewed(trigger: PaywallTrigger): void {
  capture('paywall_viewed', { trigger });
}

export function captureOnboardingCompleted(properties: {
  locale: string;
  platform: string;
}): void {
  capture('onboarding_completed', properties);
}

/** Sent before sign-up too, so guests are counted by install id. */
export function captureHeardAbout(properties: { source: HeardAboutSource; platform: string }): void {
  capture('heard_about', properties);
}

export function captureAppShared(properties: {
  outcome: AppShareOutcome;
  platform: string;
}): void {
  capture('app_shared', properties);
}
