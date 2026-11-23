/**
 * Fetch a public recipe webpage and pull text + optional embedded video.
 * JSON-LD Recipe blocks are preferred; otherwise we fall back to stripped HTML.
 */

import { FetchError } from '../core/errors.ts';
import { EMPTY_PLATFORM_META, type PlatformMeta } from './platformMeta.ts';
import { type ImageCandidate, rankImageCandidates, readDimension } from './imageSize.ts';
import { extractYouTubeId } from './platform.ts';
import { safeFetch } from '../core/safeFetch.ts';
import { configuredPageReader, type PageRead, type PageReader, type PageReadEvent } from './pageReader.ts';

const FETCH_TIMEOUT_MS = 18_000;
/** How much of a page is downloaded. Recipe pages are well under this; nothing past it is read. */
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_HTML_CHARS = 600_000;
const MAX_DESCRIPTION_CHARS = 12_000;

const BROWSER_UA =
  'Mozilla/5.0 (compatible; PinchBot/1.0; +https://pinch-app.io) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface WebRecipeMeta extends PlatformMeta {
  /** Host of the page (for logging). */
  pageHost?: string;
}

export interface WebFetchOptions {
  /** The service that reads pages that refuse our servers. Defaults to the configured one; null turns it off. */
  pageReader?: PageReader | null;
  /** Called after every service read, whether or not it got the page, so its cost is logged. */
  onPageRead?: (event: PageReadEvent) => Promise<void> | void;
}

/** Fetches a public recipe page and normalizes it for the Gemini text ladder. */
export async function fetchWebRecipeMeta(url: string, options: WebFetchOptions = {}): Promise<WebRecipeMeta> {
  const docExport = googleDocExportUrl(url);
  // A private Google Doc is private to the service too, so only ordinary pages fall back.
  const html = docExport ? await fetchHtml(docExport) : await fetchHtmlOrRead(url, options);
  const jsonLd = extractJsonLdBlocks(html);
  const recipeLd = findRecipeJsonLd(jsonLd);
  const thumbnailCandidates = pageImageCandidates(html, recipeLd);
  const thumbnailUrl = thumbnailCandidates[0];
  const videoUrl = findEmbeddedVideoUrl(html, recipeLd) ?? undefined;
  const title =
    pickString(recipeLd, 'name') ??
    metaContent(html, 'og:title') ??
    titleTag(html) ??
    undefined;

  const description = buildPageDescription({
    url,
    title,
    recipeLd,
    html,
  });

  if (!description.trim()) {
    throw new FetchError(
      'webRecipe.ts: fetchWebRecipeMeta',
      "Couldn't read this page — it may be private or blocked.",
      { url },
    );
  }

  let pageHost: string | undefined;
  try {
    pageHost = new URL(url).hostname;
  } catch {
    pageHost = undefined;
  }

  return {
    ...EMPTY_PLATFORM_META,
    title,
    description,
    thumbnailUrl,
    thumbnailCandidates,
    videoUrl,
    pageHost,
  };
}

/**
 * A Google Docs link, rewritten to the document's HTML export. The editor page is a script app with
 * no recipe text in it; the export is plain HTML. A doc shared with "anyone with the link" exports
 * without signing in. A private one sends the request to Google's sign-in page, which fetchHtml
 * reports as private (PIN-73). Returns null for any other link, including "publish to the web"
 * pages (`/document/d/e/…/pub`), which are ordinary pages already.
 */
export function googleDocExportUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.hostname.toLowerCase() !== 'docs.google.com') return null;
  const id = parsed.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})(?:\/|$)/)?.[1];
  return id ? `https://docs.google.com/document/d/${id}/export?format=html` : null;
}

/** Google's sign-in page, where a link to a private Google Doc ends up. */
function isGoogleSignIn(finalUrl: string): boolean {
  try {
    return new URL(finalUrl).hostname.toLowerCase() === 'accounts.google.com';
  } catch {
    return false;
  }
}

/**
 * The page's HTML. When the site refuses our servers (403), the page-reading service fetches it
 * once from its own addresses (PIN-152). Every other failure, and a page the service can't get
 * either, throws the normal fetch's error, so the user sees the same message as before.
 */
export async function fetchHtmlOrRead(url: string, options: WebFetchOptions = {}): Promise<string> {
  try {
    return await fetchHtml(url);
  } catch (err) {
    if (!(err instanceof FetchError) || err.details?.status !== 403) throw err;
    const reader = options.pageReader === undefined ? configuredPageReader() : options.pageReader;
    if (!reader) throw err;

    const started = Date.now();
    let read: PageRead | null = null;
    let failure: string | undefined;
    try {
      read = await reader.read(url);
    } catch (readErr) {
      failure = readErr instanceof Error ? readErr.message : String(readErr);
    }
    const event: PageReadEvent = {
      provider: reader.provider,
      host: hostOf(url),
      status: read?.html ? 'ok' : read ? 'blocked' : 'error',
      siteStatus: read?.siteStatus ?? null,
      units: read?.units ?? 0,
      costUsd: read?.costUsd ?? 0,
      durationMs: Date.now() - started,
      error: failure,
    };
    console.log('[webRecipe] page reader', { ...event, error: failure ? 'failed' : undefined });
    try {
      await options.onPageRead?.(event);
    } catch (logErr) {
      console.error('[webRecipe] onPageRead failed', logErr);
    }

    if (!read?.html) throw err;
    return read.html.length > MAX_HTML_CHARS ? read.html.slice(0, MAX_HTML_CHARS) : read.html;
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * The page's HTML. One timer covers the headers and the body, and the body is read at most
 * MAX_HTML_BYTES deep, so a huge or drip-fed page can't hang the function or fill its memory.
 * A page longer than the cap is cut there, not refused: the recipe is rarely past 2 MB.
 */
export async function fetchHtml(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await safeFetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': BROWSER_UA,
      },
    });

    if (!res.ok) {
      await res.body?.cancel();
      throw new FetchError('webRecipe.ts: fetchHtml', 'Webpage returned an error', {
        url,
        status: res.status,
      });
    }

    if (isGoogleSignIn(res.url)) {
      await res.body?.cancel();
      // fetchErrorInfo maps "not publicly accessible" to post_private.
      throw new FetchError('webRecipe.ts: googleDoc', 'This document is not publicly accessible', { url });
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (
      contentType &&
      !contentType.includes('html') &&
      !contentType.includes('xml') &&
      !contentType.includes('text/plain') &&
      !contentType.includes('json')
    ) {
      await res.body?.cancel();
      throw new FetchError(
        'webRecipe.ts: fetchHtml',
        "That link doesn't look like a recipe webpage.",
        { url, contentType },
      );
    }

    const text = await readTextCapped(res, MAX_HTML_BYTES);
    return text.length > MAX_HTML_CHARS ? text.slice(0, MAX_HTML_CHARS) : text;
  } catch (err) {
    if (err instanceof FetchError) throw err;
    const timedOut = controller.signal.aborted || (err instanceof Error && err.name === 'AbortError');
    throw new FetchError('webRecipe.ts: fetchHtml', 'Could not load this webpage', {
      url,
      timedOut,
      originalError: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Decodes at most `maxBytes` of the body as UTF-8 and stops the download there. */
async function readTextCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    const chunk = value.byteLength > maxBytes - total ? value.subarray(0, maxBytes - total) : value;
    total += chunk.byteLength;
    text += decoder.decode(chunk, { stream: true });
  }
  await reader.cancel();
  return text;
}

function buildPageDescription(input: {
  url: string;
  title?: string;
  recipeLd: Record<string, unknown> | null;
  html: string;
}): string {
  const parts: string[] = [];
  parts.push(`Source URL: ${input.url}`);
  if (input.title?.trim()) parts.push(`Page title: ${input.title.trim()}`);

  if (input.recipeLd) {
    parts.push('--- STRUCTURED RECIPE (schema.org JSON-LD) ---');
    parts.push(JSON.stringify(input.recipeLd).slice(0, 8_000));
  }

  const visible = stripHtmlToText(input.html);
  if (visible) {
    parts.push('--- PAGE TEXT ---');
    parts.push(visible);
  }

  return truncate(parts.join('\n\n'), MAX_DESCRIPTION_CHARS);
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Some sites emit trailing commas or HTML entities — skip bad blocks.
    }
  }
  return blocks;
}

function findRecipeJsonLd(blocks: unknown[]): Record<string, unknown> | null {
  for (const block of blocks) {
    const found = findRecipeNode(block);
    if (found) return found;
  }
  return null;
}

function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }

  const record = node as Record<string, unknown>;
  if (isRecipeType(record['@type'])) return record;

  if (record['@graph']) {
    const found = findRecipeNode(record['@graph']);
    if (found) return found;
  }

  return null;
}

function isRecipeType(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.toLowerCase() === 'recipe' || value.toLowerCase().endsWith('/recipe');
  }
  if (Array.isArray(value)) {
    return value.some((v) => typeof v === 'string' && v.toLowerCase().includes('recipe'));
  }
  return false;
}

/**
 * A page's pictures, read with a plain fetch only (no paid page reader), for the cover backfill.
 * Empty when the page can't be read.
 */
export async function fetchPageImageCandidates(url: string): Promise<string[]> {
  const html = await fetchHtml(url);
  return pageImageCandidates(html, findRecipeJsonLd(extractJsonLdBlocks(html)));
}

/**
 * The page's pictures of the dish, best first: the recipe's own (JSON-LD), then og:image and
 * twitter:image. A recipe plugin lists one photo at several sizes, often smallest first
 * (`photo-225x225.jpg`), and the page's og:image is usually 1200 wide; until PIN-176 we took the first.
 */
export function pageImageCandidates(html: string, recipe: Record<string, unknown> | null): string[] {
  const candidates: ImageCandidate[] = [...recipeImageCandidates(recipe?.image)];
  const og = httpUrlOrNull(metaContent(html, 'og:image:secure_url')) ?? httpUrlOrNull(metaContent(html, 'og:image'));
  if (og) {
    candidates.push({
      url: og,
      width: readDimension(metaContent(html, 'og:image:width')),
      height: readDimension(metaContent(html, 'og:image:height')),
    });
  }
  const twitter = httpUrlOrNull(metaContent(html, 'twitter:image'));
  if (twitter) candidates.push({ url: twitter });
  return rankImageCandidates(candidates);
}

function recipeImageCandidates(image: unknown): ImageCandidate[] {
  if (typeof image === 'string') return isHttpUrl(image) ? [{ url: image }] : [];
  if (Array.isArray(image)) return image.flatMap((item) => recipeImageCandidates(item));
  if (image && typeof image === 'object') {
    const record = image as Record<string, unknown>;
    const url = typeof record.url === 'string' ? record.url : typeof record.contentUrl === 'string' ? record.contentUrl : null;
    if (!url || !isHttpUrl(url)) return [];
    return [{ url, width: readDimension(record.width), height: readDimension(record.height) }];
  }
  return [];
}

function httpUrlOrNull(value: string | null): string | null {
  return value && isHttpUrl(value) ? value : null;
}

function findEmbeddedVideoUrl(
  html: string,
  recipe: Record<string, unknown> | null,
): string | null {
  const fromLd = videoFromRecipeLd(recipe);
  if (fromLd) return fromLd;

  // Prefer YouTube — cook-along embeds reliably.
  const ytEmbed = html.match(
    /(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
  );
  if (ytEmbed?.[1]) {
    return `https://www.youtube.com/watch?v=${ytEmbed[1]}`;
  }

  const ytId = extractYouTubeIdFromAnywhere(html);
  if (ytId) return `https://www.youtube.com/watch?v=${ytId}`;

  return null;
}

function videoFromRecipeLd(recipe: Record<string, unknown> | null): string | null {
  if (!recipe) return null;
  const video = recipe.video;
  if (!video) return null;

  const candidates: unknown[] = Array.isArray(video) ? video : [video];
  for (const item of candidates) {
    if (typeof item === 'string' && isHttpUrl(item)) {
      const normalized = normalizePlayableVideoUrl(item);
      if (normalized) return normalized;
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      for (const key of ['contentUrl', 'embedUrl', 'url']) {
        const value = record[key];
        if (typeof value === 'string' && isHttpUrl(value)) {
          const normalized = normalizePlayableVideoUrl(value);
          if (normalized) return normalized;
        }
      }
    }
  }
  return null;
}

function normalizePlayableVideoUrl(url: string): string | null {
  const yt = extractYouTubeId(url);
  if (yt) return `https://www.youtube.com/watch?v=${yt}`;
  if (/youtube\.com\/embed\//i.test(url)) {
    const id = url.match(/embed\/([A-Za-z0-9_-]{11})/i)?.[1];
    if (id) return `https://www.youtube.com/watch?v=${id}`;
  }
  // Only keep URLs we can cook-along with today (social embeds).
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (
      host === 'youtube.com' ||
      host === 'youtu.be' ||
      host.endsWith('.youtube.com') ||
      host === 'instagram.com' ||
      host.endsWith('.instagram.com') ||
      host === 'tiktok.com' ||
      host.endsWith('.tiktok.com')
    ) {
      return url;
    }
  } catch {
    return null;
  }
  return null;
}

function extractYouTubeIdFromAnywhere(text: string): string | null {
  const match = text.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
  );
  return match?.[1] ?? null;
}

function metaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapeRegExp(property)}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegExp(property)}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]?.trim()) return decodeHtmlEntities(match[1].trim());
  }
  return null;
}

function titleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  const title = decodeHtmlEntities(match[1].replace(/\s+/g, ' ').trim());
  return title || null;
}

function stripHtmlToText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ');
  text = decodeHtmlEntities(text);
  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return truncate(text, MAX_DESCRIPTION_CHARS);
}

/** Named entities common in recipe text (Google Docs exports use them for quotes and degrees). */
const NAMED_ENTITIES: Record<string, string> = {
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  deg: '°',
  ordm: 'º',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  times: '×',
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&([a-z]+\d*);/g, (entity, name: string) => NAMED_ENTITIES[name] ?? entity)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function pickString(record: Record<string, unknown> | null, key: string): string | undefined {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
