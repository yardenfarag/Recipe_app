import * as Localization from 'expo-localization';

import { getInstallId } from '@/lib/installId';
import { supabase } from '@/lib/supabase/client';

/** How the person started this Snap. */
export type RecipeEntrySource = 'share' | 'url' | 'camera' | 'library';
export type RecipeEntryMode = 'extract' | 'invent';
/** Why the credit purchase sheet opened. */
export type PaywallTrigger = 'out_of_credits' | 'settings';

type ProductEventName =
  | 'recipe_extracted'
  | 'recipe_saved'
  | 'paywall_viewed'
  | 'onboarding_completed'
  | 'web_intro_viewed'
  | 'web_intro_clicked';

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
    const guestInstallId = userId ? null : await getInstallId();
    const { error } = await supabase.from('product_events').insert({
      user_id: userId,
      guest_install_id: guestInstallId,
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

export type WebIntroClick = 'app_store' | 'continue';

let lastWebIntroViewAt = 0;

/** One row per arrival on the public web intro. A quick remount does not count twice. */
export function captureWebIntroViewed(): void {
  const now = Date.now();
  if (now - lastWebIntroViewAt < 1500) return;
  lastWebIntroViewAt = now;
  capture('web_intro_viewed', { page: 'intro' });
}

export function captureWebIntroClick(action: WebIntroClick): void {
  capture('web_intro_clicked', { action });
}
