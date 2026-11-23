import {
  detectPlatform,
  extractFacebookId,
  extractInstagramId,
  extractPinterestId,
  extractTikTokId,
} from '../platformUrls';
import { extractYouTubeId } from '../youtube';

import type { LinkPlatform } from './types';

/** Links in a message: `https://…` and bare `www.…`. Trailing punctuation is trimmed by `trimLink`. */
const LINK = /(?:https?:\/\/|www\.)[^\s<>"\u00AB\u00BB\u201C\u201D]+/gi;

const TRAILING = /[.,!?;:'"*_~\u2026\u060C\u061F\u061B\u05F3\u05F4\u3002\uFF01\uFF1F]$/;
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function count(value: string, char: string): number {
  let n = 0;
  for (const c of value) if (c === char) n++;
  return n;
}

/** Drops the punctuation a sentence puts after a link, and closing brackets the link didn't open. */
export function trimLink(raw: string): string {
  let link = raw;
  for (;;) {
    const last = link.slice(-1);
    if (TRAILING.test(last)) {
      link = link.slice(0, -1);
      continue;
    }
    const opener = CLOSERS[last];
    if (opener && count(link, last) > count(link, opener)) {
      link = link.slice(0, -1);
      continue;
    }
    return link;
  }
}

export function findLinks(text: string): string[] {
  const links: string[] = [];
  for (const match of text.matchAll(LINK)) {
    const link = trimLink(match[0]);
    if (link.length > 8) links.push(link);
  }
  return links;
}

/** Hosts that are never recipes: WhatsApp itself, maps, calls, calendars, payments, app stores, forms… */
const SKIPPED_HOSTS = [
  'wa.me',
  'whatsapp.com',
  'whatsapp.net',
  'zoom.us',
  'zoom.com',
  'meet.google.com',
  'teams.microsoft.com',
  'teams.live.com',
  'calendar.google.com',
  'calendly.com',
  'waze.com',
  'maps.apple.com',
  'maps.app.goo.gl',
  'photos.app.goo.gl',
  'photos.google.com',
  'drive.google.com',
  'forms.gle',
  'accounts.google.com',
  'play.google.com',
  'apps.apple.com',
  'itunes.apple.com',
  'testflight.apple.com',
  'paypal.me',
  'paypal.com',
  'venmo.com',
  'cash.app',
  'revolut.me',
  'monzo.me',
  'payboxapp.com',
  'payboxapp.page.link',
  'bitpay.co.il',
  'pay.google.com',
  'buymeacoffee.com',
  'gofundme.com',
  't.me',
  'telegram.me',
  'telegram.org',
  'signal.me',
  'bing.com',
  'duckduckgo.com',
  'wolt.com',
  '10bis.co.il',
  'ubereats.com',
  'doordash.com',
  'deliveroo.co.uk',
];

const GOOGLE_HOST = /^(?:[a-z0-9-]+\.)?google\.[a-z.]+$/;

function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^(?:www\d?|m|mobile|mbasic|web)\./, '');
}

/** True for links that can't be a recipe: chat invites, maps, video calls, payment links, plain searches. */
export function isSkippedLink(url: URL): boolean {
  const host = bareHost(url.hostname);
  if (SKIPPED_HOSTS.some((skipped) => host === skipped || host.endsWith(`.${skipped}`))) return true;
  const path = url.pathname.toLowerCase();
  if (GOOGLE_HOST.test(host)) {
    // google.com/search, google.com/maps, maps.google.com, news…; a Google Doc or Site may hold a recipe.
    if (host.startsWith('docs.')) return path.startsWith('/forms');
    return !host.startsWith('sites.');
  }
  if (host === 'goo.gl' && path.startsWith('/maps')) return true;
  return false;
}

/** Parses a link found in a message (bare `www.` links get https). Null when it isn't a usable http(s) link. */
export function parseLink(link: string): URL | null {
  try {
    const url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url;
  } catch {
    return null;
  }
}

/** The platform the importer will treat the link as, the same way `detectPlatform` does. */
export function linkPlatform(url: URL): LinkPlatform | null {
  const platform = detectPlatform(url.toString());
  return platform === 'unknown' || platform === 'photo' ? null : platform;
}

/** Query parameters that only track who shared what. */
const TRACKING_PARAM = new RegExp(
  `^(?:${[
    'utm_.*|mc_.*|share_.*|fbclid|gclid|dclid|msclkid|ref|ref_src|ref_url|feature',
    // Instagram, YouTube, TikTok, Facebook, Pinterest share links
    'igsh|igshid|si|t|_r|_t|is_from_webapp|sender_device|sender_web_id|tt_from|u_code|user_id|web_id',
    'mibextid|rdid|epa|invite_code|sender|xmt|wtsrc',
  ].join('|')})$`,
  'i',
);

/**
 * One form per piece of content, for dedupe and for "already in your Library": the video or post id on the
 * platforms that have one; otherwise host (no www./m.) + path (no trailing slash) + the non-tracking query.
 */
export function normalizeLink(input: string | URL): string {
  const url = typeof input === 'string' ? parseLink(input.trim()) : input;
  if (!url) return typeof input === 'string' ? input.trim().toLowerCase() : '';
  const href = url.toString();
  const platform = linkPlatform(url);

  const id =
    platform === 'youtube'
      ? extractYouTubeId(href)
      : platform === 'instagram'
        ? extractInstagramId(href)
        : platform === 'tiktok'
          ? extractTikTokId(href)
          : platform === 'facebook'
            ? extractFacebookId(href)
            : platform === 'pinterest'
              ? extractPinterestId(href)
              : null;
  if (platform && platform !== 'web' && id) return `${platform}:${id}`;

  const host = bareHost(url.hostname);
  let path = url.pathname.replace(/\/+$/, '');
  try {
    path = decodeURI(path);
  } catch {
    // Keep it encoded.
  }
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  return `${host}${path}${query}`;
}

/**
 * Social links that point at one post or video (not a profile or a search). A TikTok, Reel or pin shared to a
 * cooking group is usually a recipe; a profile link isn't.
 */
export function isSocialPost(url: URL, platform: LinkPlatform): boolean {
  const href = url.toString();
  const host = bareHost(url.hostname);
  const path = url.pathname;
  switch (platform) {
    case 'youtube':
      return extractYouTubeId(href) !== null;
    case 'instagram':
      return extractInstagramId(href) !== null;
    case 'tiktok':
      return (
        extractTikTokId(href) !== null ||
        host === 'vm.tiktok.com' ||
        host === 'vt.tiktok.com' ||
        /^\/t\/[A-Za-z0-9]+/.test(path)
      );
    case 'facebook':
      return (
        extractFacebookId(href) !== null ||
        host === 'fb.watch' ||
        /^\/(?:share|reel|watch|videos|story\.php|permalink\.php)/.test(path) ||
        /\/(?:posts|videos|reels?)\//.test(path)
      );
    case 'pinterest':
      return extractPinterestId(href) !== null || host === 'pin.it';
    default:
      return false;
  }
}

/** How a link shows on the list: the host, plus the path for recipe websites ("smittenkitchen.com/cake"). */
export function linkPreview(url: URL, platform: LinkPlatform): string {
  const host = bareHost(url.hostname);
  if (platform !== 'web') return host;
  let path = url.pathname.replace(/\/+$/, '');
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep it encoded.
  }
  return `${host}${path}`;
}
