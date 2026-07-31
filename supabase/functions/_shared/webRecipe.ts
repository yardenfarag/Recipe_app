/**
 * Fetch a public recipe webpage and pull text + optional embedded video.
 * JSON-LD Recipe blocks are preferred; otherwise we fall back to stripped HTML.
 */

import { FetchError } from './errors.ts';
import { EMPTY_PLATFORM_META, type PlatformMeta } from './platformMeta.ts';
import { extractYouTubeId } from './platform.ts';

const FETCH_TIMEOUT_MS = 18_000;
const MAX_HTML_CHARS = 600_000;
const MAX_DESCRIPTION_CHARS = 12_000;

const BROWSER_UA =
  'Mozilla/5.0 (compatible; PinchBot/1.0; +https://pinch.app) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface WebRecipeMeta extends PlatformMeta {
  /** Host of the page (for logging). */
  pageHost?: string;
}

/** Fetches a public recipe page and normalizes it for the Gemini text ladder. */
export async function fetchWebRecipeMeta(url: string): Promise<WebRecipeMeta> {
  assertPublicHttpUrl(url);

  const html = await fetchHtml(url);
  const jsonLd = extractJsonLdBlocks(html);
  const recipeLd = findRecipeJsonLd(jsonLd);
  const thumbnailUrl =
    pickImageFromRecipe(recipeLd) ??
    metaContent(html, 'og:image') ??
    metaContent(html, 'twitter:image') ??
    undefined;
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
    description,
    thumbnailUrl,
    videoUrl,
    pageHost,
  };
}

/** Rejects localhost / private network targets before server-side fetch. */
export function assertPublicHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchError('webRecipe.ts: assertPublicHttpUrl', 'Invalid URL', { url });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new FetchError('webRecipe.ts: assertPublicHttpUrl', 'URL must be http(s)', { url });
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    isPrivateIp(host)
  ) {
    throw new FetchError(
      'webRecipe.ts: assertPublicHttpUrl',
      'That link is not a public webpage.',
      { url },
    );
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': BROWSER_UA,
      },
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    throw new FetchError('webRecipe.ts: fetchHtml', 'Could not load this webpage', {
      url,
      timedOut,
      originalError: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new FetchError('webRecipe.ts: fetchHtml', 'Webpage returned an error', {
      url,
      status: res.status,
    });
  }

  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  if (
    contentType &&
    !contentType.includes('html') &&
    !contentType.includes('xml') &&
    !contentType.includes('text/plain') &&
    !contentType.includes('json')
  ) {
    throw new FetchError(
      'webRecipe.ts: fetchHtml',
      "That link doesn't look like a recipe webpage.",
      { url, contentType },
    );
  }

  const text = await res.text();
  return text.length > MAX_HTML_CHARS ? text.slice(0, MAX_HTML_CHARS) : text;
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

function pickImageFromRecipe(recipe: Record<string, unknown> | null): string | undefined {
  if (!recipe) return undefined;
  const image = recipe.image;
  if (typeof image === 'string' && isHttpUrl(image)) return image;
  if (Array.isArray(image)) {
    for (const item of image) {
      if (typeof item === 'string' && isHttpUrl(item)) return item;
      if (item && typeof item === 'object') {
        const url = (item as Record<string, unknown>).url;
        if (typeof url === 'string' && isHttpUrl(url)) return url;
      }
    }
  }
  if (image && typeof image === 'object') {
    const url = (image as Record<string, unknown>).url;
    if (typeof url === 'string' && isHttpUrl(url)) return url;
  }
  return undefined;
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

function decodeHtmlEntities(value: string): string {
  return value
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

function isPrivateIp(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  // IPv6 unique-local / link-local (simplified).
  if (host.includes(':')) {
    const lower = host.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
      return true;
    }
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
