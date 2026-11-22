/**
 * Pinterest pins (PIN-70, ADR 029, docs/research/10-pinterest-import.md).
 *
 * A pin usually links out to the recipe's own site. Then the pin only tells us where to go, and the
 * page is read by the normal web reader (`readAs: 'web'`). A pin with no usable link (a video idea
 * pin, say) is read itself: its caption, the ingredient list on rich recipe pins, the captions file
 * and the MP4, through the same ladder as any social post.
 *
 * The pin page is fetched directly: no sign-in, no API key. Everything useful sits after the first
 * ~1.2 MB of a ~1.4 MB page, so it is read with a higher cap than `fetchHtml` allows.
 */

import { FetchError } from '../../core/errors.ts';
import { readBodyCapped, safeFetch } from '../../core/safeFetch.ts';
import {
  canonicalPinterestUrl,
  extractPinterestId,
  isPinterestHost,
  isPinterestShortLink,
} from '../platform.ts';
import { EMPTY_PLATFORM_META, type PlatformMeta } from '../platformMeta.ts';
import { parseDurationMilliseconds } from '../videoLimits.ts';
import { fetchWebRecipeMeta, type WebFetchOptions, type WebRecipeMeta } from '../webRecipe.ts';
import { webVttToPlainText } from './scrapecreators.ts';

const SHORT_LINK_TIMEOUT_MS = 5_000;
const MAX_SHORT_LINK_HOPS = 3;
const PAGE_TIMEOUT_MS = 10_000;
/** A pin page is 1.25–1.5 MB today, with the pin data at the end. */
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const CAPTIONS_TIMEOUT_MS = 5_000;
const MAX_CAPTIONS_BYTES = 200_000;
const MAX_DESCRIPTION_CHARS = 6_000;

/** Same honest User-Agent as the web reader. Pinterest served the full page to every client tried. */
const USER_AGENT =
  'Mozilla/5.0 (compatible; PinchBot/1.0; +https://pinch-app.io) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Everything we use from a pin page. */
export interface PinterestPin {
  pinId: string;
  title?: string;
  /** The creator's own text, Pinterest's boilerplate removed. */
  description?: string;
  /** Where the description came from, logged so a change in Pinterest's page shows up. */
  descriptionSource?: 'relay' | 'jsonld' | 'og';
  /** `recipeIngredient` from the JSON-LD of a rich recipe pin. Pins never carry the steps. */
  ingredients: string[];
  /** The outbound link, when it is a public http(s) page off Pinterest. */
  link?: string;
  imageUrl?: string;
  /** A single MP4 on Pinterest's CDN, never an HLS playlist. */
  videoUrl?: string;
  /** A WebVTT file on Pinterest's CDN. */
  captionsUrl?: string;
  durationSeconds?: number;
}

/**
 * Follows a `pin.it` short link (308 → api.pinterest.com/url_shortener → 302 → /pin/<id>/sent/…) to
 * its pin, and returns the clean pin URL without the sharer's `invite_code` and `sender`.
 *
 * Never throws: a link that leads nowhere (an unknown code ends on the home page; a board link has no
 * pin id) comes back unchanged, and the caller says it isn't a pin.
 */
export async function resolvePinterestShortLink(url: string, fetchImpl: FetchLike = fetch): Promise<string> {
  if (!isPinterestShortLink(url)) {
    const pinId = extractPinterestId(url);
    return pinId ? canonicalPinterestUrl(pinId) : url;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHORT_LINK_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop < MAX_SHORT_LINK_HOPS; hop++) {
      // Only Pinterest's own hosts are ever requested here, so no public-address check is needed.
      if (!isPinterestHost(new URL(current).hostname.toLowerCase())) return url;
      const res = await fetchImpl(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
      await res.body?.cancel();
      const location = res.headers.get('location');
      if (res.status < 300 || res.status >= 400 || !location) return url;
      const target = new URL(location, current).toString();
      const pinId = extractPinterestId(target);
      if (pinId) return canonicalPinterestUrl(pinId);
      if (!isPinterestShortLink(target)) return url;
      current = target;
    }
    return url;
  } catch (err) {
    console.warn('[pinterest] short link not resolved', {
      error: err instanceof Error ? err.message : String(err),
    });
    return url;
  } finally {
    clearTimeout(timeout);
  }
}

export interface PinterestFetchDeps {
  /** The pin page's HTML. */
  fetchPage?: (url: string) => Promise<string>;
  /** A captions file's text, or null when it can't be read. */
  fetchCaptions?: (url: string) => Promise<string | null>;
  /** The web reader, for the page the pin links to. */
  readWebPage?: (url: string, options: WebFetchOptions) => Promise<WebRecipeMeta>;
}

/**
 * The content ladder's input for one pin. When the pin links to a page that reads, that page is the
 * input (`readAs: 'web'`). Otherwise the pin itself is. Either way `contentId` and `canonicalUrl`
 * name the pin, so dedup and the saved link stay on Pinterest.
 */
export async function fetchPinterestMeta(
  url: string,
  options: WebFetchOptions = {},
  deps: PinterestFetchDeps = {},
): Promise<PlatformMeta> {
  const started = Date.now();
  const resolved = await resolvePinterestShortLink(url.trim());
  const pinId = extractPinterestId(resolved);
  if (!pinId) {
    throw new FetchError('pinterest.ts: fetchPinterestMeta', 'Not a Pinterest pin link', { url });
  }
  const pinUrl = canonicalPinterestUrl(pinId);

  const html = await (deps.fetchPage ?? fetchPinterestPage)(pinUrl);
  const pin = parsePinterestPage(html, pinId);
  if (!pin) {
    throw new FetchError('pinterest.ts: fetchPinterestMeta', 'Pinterest pin not found', { url: pinUrl });
  }

  let followed: 'ok' | 'no_link' | 'failed' = 'no_link';
  if (pin.link) {
    try {
      const web = await (deps.readWebPage ?? fetchWebRecipeMeta)(pin.link, options);
      if (web.description?.trim()) {
        logDone(pin, started, html.length, 'ok', web);
        return {
          ...web,
          title: web.title ?? pin.title,
          thumbnailUrl: web.thumbnailUrl ?? pin.imageUrl,
          contentId: pinId,
          canonicalUrl: pinUrl,
          readAs: 'web',
        };
      }
      followed = 'failed';
    } catch (err) {
      followed = 'failed';
      console.warn('[pinterest] outbound page not read, reading the pin itself', {
        host: safeHost(pin.link),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const captions = pin.captionsUrl
    ? await (deps.fetchCaptions ?? fetchPinterestCaptions)(pin.captionsUrl).catch(() => null)
    : null;
  const meta = pinterestMetaFromPin(pin, captions);
  if (!meta.description && !meta.captions && !meta.videoUrl) {
    throw new FetchError('pinterest.ts: fetchPinterestMeta', 'Pinterest pin not found', { url: pinUrl });
  }
  logDone(pin, started, html.length, followed, meta);
  return meta;
}

/** The ladder input for a pin read on its own. */
export function pinterestMetaFromPin(pin: PinterestPin, captionsVtt: string | null): PlatformMeta {
  const parts: string[] = [];
  if (pin.description) parts.push(pin.description);
  if (pin.ingredients.length > 0) parts.push(`Ingredients:\n${pin.ingredients.map((i) => `- ${i}`).join('\n')}`);
  const captions = captionsVtt ? webVttToPlainText(captionsVtt) : '';
  return {
    ...EMPTY_PLATFORM_META,
    title: pin.title,
    description: parts.length > 0 ? truncate(parts.join('\n\n'), MAX_DESCRIPTION_CHARS) : undefined,
    captions: captions || undefined,
    videoUrl: pin.videoUrl,
    durationSeconds: pin.durationSeconds,
    thumbnailUrl: pin.imageUrl,
    contentId: pin.pinId,
    canonicalUrl: canonicalPinterestUrl(pin.pinId),
  };
}

/** The pin page's HTML, read up to MAX_PAGE_BYTES under one timer. */
export async function fetchPinterestPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await safeFetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': USER_AGENT,
      },
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new FetchError(
        'pinterest.ts: fetchPinterestPage',
        res.status === 404 || res.status === 410 ? 'Pinterest pin not found' : 'Pinterest page returned an error',
        { url, status: res.status },
      );
    }
    const bytes = await readBodyCapped(res, MAX_PAGE_BYTES);
    if (!bytes) {
      throw new FetchError('pinterest.ts: fetchPinterestPage', 'Pinterest page too large', { url });
    }
    return new TextDecoder().decode(bytes);
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError('pinterest.ts: fetchPinterestPage', 'Could not load this Pinterest pin', {
      url,
      timedOut: controller.signal.aborted || (err instanceof Error && err.name === 'AbortError'),
      originalError: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPinterestCaptions(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CAPTIONS_TIMEOUT_MS);
  try {
    const res = await safeFetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const bytes = await readBodyCapped(res, MAX_CAPTIONS_BYTES);
    return bytes ? new TextDecoder().decode(bytes) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------------------------------
// Parsing

type Json = Record<string, unknown>;

/**
 * Reads a pin page. Stable public markup first (JSON-LD and meta tags, which Pinterest keeps for
 * search engines and link previews); Pinterest's internal Relay data for the creator's own caption,
 * which the public markup often replaces with an SEO summary, and as a backup for everything else.
 * Returns null when the page holds no pin (a missing pin still answers 200).
 */
export function parsePinterestPage(html: string, pinId: string): PinterestPin | null {
  const meta = readMetaTags(html);
  const ld = readJsonLd(html);
  const relay = readRelayPins(html, pinId);

  const isPinPage = relay.length > 0 || (meta['og:type'] === 'pinterestapp:pin' && Boolean(meta['og:image']));
  if (!isPinPage) return null;

  const recipeLd = ld.find((block) => hasType(block, 'Recipe'));
  const videoLd = ld.find((block) => hasType(block, 'VideoObject'));
  const postLd = ld.find((block) => hasType(block, 'SocialMediaPosting'));

  const relayString = (key: string) => {
    for (const pin of relay) {
      const value = cleanText(pin[key]);
      if (value) return value;
    }
    return undefined;
  };

  const link = [relayString('link'), meta['pinterestapp:source'], meta['og:see_also']]
    .map((candidate) => outboundLink(candidate))
    .find(Boolean);

  let description: string | undefined;
  let descriptionSource: PinterestPin['descriptionSource'];
  const fromRelay = relayString('closeupUnifiedDescription') ?? relayString('description');
  const fromLd = cleanDescription(
    stringField(postLd, 'articleBody') ?? stringField(videoLd, 'description') ?? stringField(recipeLd, 'description'),
  );
  const fromOg = cleanDescription(meta['og:description']);
  if (cleanDescription(fromRelay)) {
    description = cleanDescription(fromRelay);
    descriptionSource = 'relay';
  } else if (fromLd) {
    description = fromLd;
    descriptionSource = 'jsonld';
  } else if (fromOg) {
    description = fromOg;
    descriptionSource = 'og';
  }

  const title =
    relayString('title') ??
    relayString('gridTitle') ??
    stringField(recipeLd, 'name') ??
    stringField(videoLd, 'name') ??
    stringField(postLd, 'headline') ??
    ogTitle(meta['og:title']);

  const ingredients = Array.isArray(recipeLd?.recipeIngredient)
    ? (recipeLd!.recipeIngredient as unknown[]).map((item) => cleanText(item)).filter((item): item is string =>
      Boolean(item)
    )
    : [];

  const relayUrls = relay.flatMap((pin) => collectStrings(pin));
  const videoUrl =
    pinterestMediaUrl(stringField(videoLd, 'contentUrl'), '.mp4') ??
    pickVideoUrl(relayUrls);
  const captionsUrl =
    pinterestMediaUrl(stringField(record(videoLd?.caption), 'contentUrl'), '.vtt') ??
    pickCaptionsUrl(relayUrls);
  const durationSeconds = videoUrl
    ? parseIsoDuration(stringField(videoLd, 'duration')) ?? relayDurationSeconds(relay)
    : undefined;

  const imageUrl = httpUrl(meta['og:image']) ?? httpUrl(stringField(videoLd, 'thumbnailUrl'));

  return {
    pinId,
    title,
    description,
    descriptionSource,
    ingredients,
    link,
    imageUrl,
    videoUrl,
    captionsUrl,
    durationSeconds,
  };
}

/** `<meta property|name="…" content="…">` in any attribute order. Property wins over name. */
function readMetaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[1].matchAll(/([a-zA-Z:_-]+)\s*=\s*"([^"]*)"/g)) {
      attrs[attr[1].toLowerCase()] = attr[2];
    }
    const key = attrs.property ?? attrs.name;
    if (key && attrs.content !== undefined && out[key] === undefined) {
      out[key] = decodeHtmlEntities(attrs.content).trim();
    }
  }
  return out;
}

function readJsonLd(html: string): Json[] {
  const blocks: Json[] = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        const block = record(item);
        if (block) blocks.push(block);
      }
    } catch {
      // A block that doesn't parse is skipped; the others still count.
    }
  }
  return blocks;
}

/**
 * The pin's own objects from Pinterest's Relay cache:
 * `window.__PWS_RELAY_REGISTER_COMPLETED_REQUEST__("<query>", {"data":{"<query name>":{"data":{"entityId":"<pin id>", …}}}});`
 * The page holds several, each with part of the pin. Related pins have other ids and are ignored.
 */
function readRelayPins(html: string, pinId: string): Json[] {
  const pins: Json[] = [];
  for (const match of html.matchAll(/<script[^>]*data-relay-completed-request[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = match[1];
    const call = body.indexOf('__PWS_RELAY_REGISTER_COMPLETED_REQUEST__(');
    if (call < 0) continue;
    const start = body.indexOf('{', call);
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.slice(start, end + 1));
    } catch {
      continue;
    }
    const data = record(record(parsed)?.data);
    if (!data) continue;
    for (const query of Object.values(data)) {
      const pin = record(record(query)?.data);
      if (pin && String(pin.entityId ?? '') === pinId) pins.push(pin);
    }
  }
  return pins;
}

function hasType(block: Json, type: string): boolean {
  const value = block['@type'];
  if (typeof value === 'string') return value === type;
  return Array.isArray(value) && value.includes(type);
}

function stringField(block: Json | null | undefined, key: string): string | undefined {
  return block ? cleanText(block[key]) : undefined;
}

/** Every string inside a value, for finding media URLs in the pin's nested video blocks. */
function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 12) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out, depth + 1));
  else if (value && typeof value === 'object') {
    Object.values(value as Json).forEach((item) => collectStrings(item, out, depth + 1));
  }
  return out;
}

function pickVideoUrl(urls: string[]): string | undefined {
  const mp4s = urls.map((url) => pinterestMediaUrl(url, '.mp4')).filter((url): url is string => Boolean(url));
  return mp4s.find((url) => url.includes('/720p/')) ?? mp4s[0];
}

function pickCaptionsUrl(urls: string[]): string | undefined {
  const vtts = urls.map((url) => pinterestMediaUrl(url, '.vtt')).filter((url): url is string => Boolean(url));
  return vtts.find((url) => /\/captions\/en[-/]/.test(url)) ?? vtts[0];
}

/** The longest `duration` (milliseconds) in the pin's Relay data, for a video without JSON-LD. */
function relayDurationSeconds(pins: Json[]): number | undefined {
  let best = 0;
  const walk = (value: unknown, depth: number) => {
    if (depth > 12 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach((item) => walk(item, depth + 1));
    for (const [key, child] of Object.entries(value as Json)) {
      if (key === 'duration' && typeof child === 'number' && child > best) best = child;
      else walk(child, depth + 1);
    }
  };
  pins.forEach((pin) => walk(pin, 0));
  return best > 0 ? parseDurationMilliseconds(best) : undefined;
}

/** A media URL on Pinterest's CDN (`*.pinimg.com`) with the given extension, else undefined. */
function pinterestMediaUrl(value: string | undefined, extension: '.mp4' | '.vtt'): string | undefined {
  const url = httpUrl(value);
  if (!url) return undefined;
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (host !== 'pinimg.com' && !host.endsWith('.pinimg.com')) return undefined;
  return parsed.pathname.toLowerCase().endsWith(extension) ? url : undefined;
}

/** The pin's outbound link, when it leads off Pinterest to a public http(s) page. */
function outboundLink(value: string | undefined): string | undefined {
  const url = httpUrl(value);
  if (!url) return undefined;
  return isPinterestHost(new URL(url).hostname.toLowerCase()) ? undefined : url;
}

function httpUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** ISO 8601 durations as JSON-LD writes them (`PT32S`, `PT1M5S`, `PT1H2M`). */
export function parseIsoDuration(value: string | undefined): number | undefined {
  const match = value?.trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!match) return undefined;
  const [, d, h, m, s] = match;
  const total = Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3_600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  return total > 0 ? Math.round(total) : undefined;
}

const BOILERPLATE = /(?:This Pin was discovered by [^.]*\.\s*)?Discover \(and save!\) your own Pins on Pinterest\.?/gi;

/** Drops Pinterest's "This Pin was discovered by …" filler and the "Nov 14, 2026 — " date prefix. */
function cleanDescription(value: string | undefined): string | undefined {
  const text = value
    ?.replace(BOILERPLATE, '')
    .replace(/^[A-Z][a-z]{2} \d{1,2}, \d{4} — /, '')
    .trim();
  return text ? text : undefined;
}

/** `og:title` without the " | keyword, keyword" tail, and never the generic "Pin on <board>". */
function ogTitle(value: string | undefined): string | undefined {
  const title = value?.split(' | ')[0]?.trim();
  if (!title || /^Pin on /i.test(title) || title === 'Pinterest') return undefined;
  return title;
}

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function record(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function logDone(
  pin: PinterestPin,
  started: number,
  pageChars: number,
  followed: 'ok' | 'no_link' | 'failed',
  meta: PlatformMeta,
): void {
  console.log('[pinterest] fetchMeta done', {
    ms: Date.now() - started,
    pinId: pin.pinId,
    pageChars,
    hasLink: Boolean(pin.link),
    linkHost: pin.link ? safeHost(pin.link) : null,
    followed,
    descriptionSource: pin.descriptionSource ?? null,
    ingredients: pin.ingredients.length,
    hasCaptions: Boolean(meta.captions),
    hasVideoUrl: Boolean(meta.videoUrl),
    durationSeconds: meta.durationSeconds ?? null,
  });
}
