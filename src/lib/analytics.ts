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
  | 'onboarding_completed';

function capture(name: ProductEventName, properties: Record<string, string>): void {
  void insertProductEvent(name, properties);
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
