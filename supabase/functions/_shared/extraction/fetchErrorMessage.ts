/**
 * Turns an upstream FetchError into the message the user sees when an extraction fails.
 *
 * The raw FetchError message carries the failing URL, the status and the provider's own error text,
 * which stay in the logs only (PIN-54). Each message here should tell the user what to do next:
 * retrying only helps for timeouts, rate limits and server errors. When a site refuses to send its
 * page, a screenshot of the recipe is the way around it.
 */

import type { FetchError } from '../core/errors.ts';

const SCREENSHOT_HINT = 'Take a screenshot of the recipe and add it as a photo instead.';

const WEB_FETCH_CONTEXT = 'webRecipe.ts: fetchHtml';

export function fetchErrorMessage(err: FetchError, platform: string): string {
  const lower = err.message.toLowerCase();
  const fromScrapeCreators = err.context.startsWith('scrapecreators.ts');
  const fromWebPage = err.context === WEB_FETCH_CONTEXT;

  if (err.details?.timedOut === true) {
    if (fromScrapeCreators) return `${sourceName(platform)} took too long to respond — try again.`;
    if (fromWebPage) return 'That site took too long to respond — try again in a moment.';
    return 'Recipe extraction timed out — try again in a moment.';
  }

  if (fromWebPage) {
    const status = typeof err.details?.status === 'number' ? err.details.status : undefined;
    if (status !== undefined) return webStatusMessage(status);
    if (lower.includes("doesn't look like a recipe webpage")) {
      return "That link doesn't look like a recipe webpage.";
    }
    return "Couldn't reach that site — check the link and try again.";
  }

  if (lower.includes('scrapecreators request failed')) {
    return `${sourceName(platform)} took too long to respond — try again.`;
  }
  if (lower.includes('too many requests')) return 'Too many requests right now — try again in a minute.';
  if (lower.includes('not publicly accessible')) {
    return "This post is private or was deleted, so Pinch can't read it.";
  }
  if (lower.includes('invalid instagram')) return "That doesn't look like a valid Instagram link.";
  if (lower.includes('not a public webpage')) return 'That link is not a public webpage.';
  if (lower.includes('too many redirects')) {
    return 'That link redirects too many times. Open it in your browser and share the page you land on.';
  }
  if (lower.includes('invalid url') || lower.includes('url must be http')) {
    return "That link doesn't look right — check it and try again.";
  }
  if (lower.includes("couldn't read this page")) return `Couldn't find a recipe on this page. ${SCREENSHOT_HINT}`;
  if (lower.includes('not found')) return "We couldn't find that post. It may have been deleted.";
  if (
    lower.includes('gemini request failed') ||
    lower.includes('openrouter request failed') ||
    lower.includes('openrouter api returned an error')
  ) {
    return 'Recipe extraction failed — try again in a moment.';
  }
  return platform === 'web' ? "Couldn't load this page — try again." : "Couldn't load this video — try again.";
}

/** The message for a recipe website that answered with an HTTP error status. */
function webStatusMessage(status: number): string {
  if (status === 401 || status === 403) return `This site doesn't let apps read its pages. ${SCREENSHOT_HINT}`;
  if (status === 404 || status === 410) return "That page doesn't exist anymore — check the link.";
  if (status === 429) return 'That site is busy right now — try again in a few minutes.';
  if (status >= 500) return 'That site is having trouble right now — try again later.';
  return `That site wouldn't send us the page. ${SCREENSHOT_HINT}`;
}

function sourceName(platform: string): string {
  if (platform === 'tiktok') return 'TikTok';
  if (platform === 'facebook') return 'Facebook';
  if (platform === 'youtube') return 'YouTube';
  return 'Instagram';
}
