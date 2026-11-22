/**
 * Turns an upstream FetchError into what the user sees when an extraction fails: a stable `code`
 * and an English `message`.
 *
 * The raw FetchError message carries the failing URL, the status and the provider's own error text,
 * which stay in the logs only (PIN-54). Each message here should tell the user what to do next:
 * retrying only helps for timeouts, rate limits and server errors. When a site refuses to send its
 * page, a screenshot of the recipe is the way around it.
 *
 * The app shows its own translation for the code (shared/lib/importErrors.ts) and falls back to
 * the message for a code it doesn't know, so add a code there when adding one here (PIN-153).
 */

import type { FetchError } from '../core/errors.ts';

const SCREENSHOT_HINT = 'Take a screenshot of the recipe and add it as a photo instead.';

const WEB_FETCH_CONTEXT = 'webRecipe.ts: fetchHtml';

export type FetchErrorCode =
  | 'source_timeout'
  | 'try_again'
  | 'site_blocked'
  | 'page_gone'
  | 'site_busy'
  | 'not_a_webpage'
  | 'site_unreachable'
  | 'rate_limited'
  | 'post_private'
  | 'invalid_url'
  | 'page_unreadable'
  | 'source_unavailable';

export interface FetchErrorInfo {
  code: FetchErrorCode;
  message: string;
}

export function fetchErrorInfo(err: FetchError, platform: string): FetchErrorInfo {
  const lower = err.message.toLowerCase();
  const fromScrapeCreators = err.context.startsWith('scrapecreators.ts');
  const fromWebPage = err.context === WEB_FETCH_CONTEXT;
  const fromPinterest = err.context.startsWith('pinterest.ts');

  if (fromPinterest) {
    // The pin page itself (PIN-70). A failure on the page it links to never gets here: the pin is read instead.
    if (err.details?.timedOut === true) {
      return { code: 'source_timeout', message: 'Pinterest took too long to respond — try again.' };
    }
    if (lower.includes('not a pinterest pin')) {
      return { code: 'invalid_url', message: "That doesn't look like a Pinterest pin. Open the pin and share it." };
    }
    if (lower.includes('not found') || err.details?.status === 404 || err.details?.status === 410) {
      return { code: 'post_private', message: "We couldn't find that pin. It may have been deleted." };
    }
    if (err.details?.status === 429) {
      return { code: 'rate_limited', message: 'Too many requests right now — try again in a minute.' };
    }
    return { code: 'source_unavailable', message: "Couldn't load this pin — try again." };
  }

  if (err.details?.timedOut === true) {
    if (fromScrapeCreators) {
      return { code: 'source_timeout', message: `${sourceName(platform)} took too long to respond — try again.` };
    }
    if (fromWebPage) {
      return { code: 'source_timeout', message: 'That site took too long to respond — try again in a moment.' };
    }
    return { code: 'try_again', message: 'Recipe extraction timed out — try again in a moment.' };
  }

  if (fromWebPage) {
    const status = typeof err.details?.status === 'number' ? err.details.status : undefined;
    if (status !== undefined) return webStatusInfo(status);
    if (lower.includes("doesn't look like a recipe webpage")) {
      return { code: 'not_a_webpage', message: "That link doesn't look like a recipe webpage." };
    }
    return { code: 'site_unreachable', message: "Couldn't reach that site — check the link and try again." };
  }

  if (lower.includes('scrapecreators request failed')) {
    return { code: 'source_timeout', message: `${sourceName(platform)} took too long to respond — try again.` };
  }
  if (lower.includes('too many requests')) {
    return { code: 'rate_limited', message: 'Too many requests right now — try again in a minute.' };
  }
  if (lower.includes('not publicly accessible')) {
    return { code: 'post_private', message: "This post is private or was deleted, so Pinch can't read it." };
  }
  if (lower.includes('invalid instagram')) {
    return { code: 'invalid_url', message: "That doesn't look like a valid Instagram link." };
  }
  if (lower.includes('not a public webpage')) {
    return { code: 'invalid_url', message: 'That link is not a public webpage.' };
  }
  if (lower.includes('too many redirects')) {
    return {
      code: 'site_unreachable',
      message: 'That link redirects too many times. Open it in your browser and share the page you land on.',
    };
  }
  if (lower.includes('invalid url') || lower.includes('url must be http')) {
    return { code: 'invalid_url', message: "That link doesn't look right — check it and try again." };
  }
  if (lower.includes("couldn't read this page")) {
    return { code: 'page_unreadable', message: `Couldn't find a recipe on this page. ${SCREENSHOT_HINT}` };
  }
  if (lower.includes('not found')) {
    return { code: 'post_private', message: "We couldn't find that post. It may have been deleted." };
  }
  if (
    lower.includes('gemini request failed') ||
    lower.includes('openrouter request failed') ||
    lower.includes('openrouter api returned an error')
  ) {
    return { code: 'try_again', message: 'Recipe extraction failed — try again in a moment.' };
  }
  return {
    code: 'source_unavailable',
    message: platform === 'web' ? "Couldn't load this page — try again." : "Couldn't load this video — try again.",
  };
}

export function fetchErrorMessage(err: FetchError, platform: string): string {
  return fetchErrorInfo(err, platform).message;
}

/** A recipe website that answered with an HTTP error status. */
function webStatusInfo(status: number): FetchErrorInfo {
  if (status === 401 || status === 403) {
    return { code: 'site_blocked', message: `This site doesn't let apps read its pages. ${SCREENSHOT_HINT}` };
  }
  if (status === 404 || status === 410) {
    return { code: 'page_gone', message: "That page doesn't exist anymore — check the link." };
  }
  if (status === 429) {
    return { code: 'site_busy', message: 'That site is busy right now — try again in a few minutes.' };
  }
  if (status >= 500) {
    return { code: 'site_busy', message: 'That site is having trouble right now — try again later.' };
  }
  return { code: 'site_blocked', message: `That site wouldn't send us the page. ${SCREENSHOT_HINT}` };
}

function sourceName(platform: string): string {
  if (platform === 'tiktok') return 'TikTok';
  if (platform === 'facebook') return 'Facebook';
  if (platform === 'pinterest') return 'Pinterest';
  if (platform === 'youtube') return 'YouTube';
  return 'Instagram';
}
