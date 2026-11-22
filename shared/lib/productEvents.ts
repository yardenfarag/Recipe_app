/**
 * The product events both apps record in `product_events` (ADR 020): their names, and the values their properties
 * take. Each app sends them its own way (src/lib/analytics.ts, web/lib/analytics.ts).
 */
export type ProductEventName =
  | 'recipe_extracted'
  | 'recipe_saved'
  | 'paywall_viewed'
  | 'onboarding_completed'
  | 'app_shared'
  | 'heard_about';

/** How the person started this Snap. `pdf`: Snap from a PDF (PIN-72); a PDF shared into Pinch counts as `share`. */
export type RecipeEntrySource = 'share' | 'url' | 'camera' | 'library' | 'pdf';
export type RecipeEntryMode = 'extract' | 'invent';

/**
 * `recipe_platform` on `recipe_extracted`: where the recipe came from (`pinterest`, `instagram`, `web`, `photo`…).
 * Not `platform`, which on these events means the person's device (ios, android, web) and the admin dashboard reads it.
 */
export function recipePlatformProperty(platform: string | null | undefined): string {
  return platform?.trim() || 'unknown';
}
/** Why the credit purchase sheet opened. */
export type PaywallTrigger = 'out_of_credits' | 'settings';
/** What happened after "Share Pinch". */
export type AppShareOutcome = 'shared' | 'copied' | 'dismissed';
/** Answers to "How did you hear about Pinch?" in onboarding, in the order shown. */
export const HEARD_ABOUT_SOURCES = [
  'tiktok_instagram',
  'friend',
  'app_store',
  'google',
  'ai_assistant',
  'other',
] as const;
export type HeardAboutSource = (typeof HEARD_ABOUT_SOURCES)[number];
