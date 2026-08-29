import { Platform, Share } from 'react-native';

export type ShareRecipeResult = 'shared' | 'copied' | 'dismissed';

async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error('Clipboard unavailable');
}

/** Source video/page URL if the recipe has one to send to friends. */
export function recipeSourceShareUrl(originalUrl?: string | null): string | null {
  const url = originalUrl?.trim();
  return url || null;
}

/**
 * Mobile: system share sheet (WhatsApp, Messages, Copy, …).
 * Web: copy the URL (no share sheet).
 */
export async function shareRecipe(options: {
  title: string;
  url: string;
}): Promise<ShareRecipeResult> {
  const title = options.title.trim() || 'Recipe';
  const url = options.url.trim();
  if (!url) throw new Error('No link to share');

  if (Platform.OS === 'web') {
    await copyText(url);
    return 'copied';
  }

  // Android ignores `url`; fold it into `message`. iOS uses `url` for link targets.
  const result =
    Platform.OS === 'ios'
      ? await Share.share({ title, message: title, url })
      : await Share.share({
          title,
          message: `${title}\n${url}`,
        });

  if (result.action === Share.dismissedAction) return 'dismissed';
  return 'shared';
}
