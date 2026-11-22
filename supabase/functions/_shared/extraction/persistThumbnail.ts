import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';
import type { Database } from '../core/database.types.ts';

import type { Platform } from './platform.ts';
import { readBodyCapped, safeFetch } from '../core/safeFetch.ts';

const FETCH_TIMEOUT_MS = 12_000;
/** Matches the recipe-thumbnails bucket's file_size_limit. */
const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;

/**
 * Image types every browser shows as a picture. SVG is left out: it can carry scripts. HEIC is
 * left out too: only Apple devices show it, and TikTok serves it first (it left every TikTok
 * thumbnail blank on the web until 2026-11-22).
 */
const WEB_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

/**
 * Downloads a thumbnail and uploads it to Supabase Storage, so the app and the public Hub page
 * show a stable copy of ours. For social CDNs that is the only way to show it at all (their
 * links expire and need a Referer). For a web page's og:image it means the site's owner can't
 * swap the picture after the recipe is published (PIN-153).
 */
export async function persistSocialThumbnail(opts: {
  sourceUrl: string;
  platform: Extract<Platform, 'instagram' | 'tiktok' | 'facebook' | 'pinterest' | 'web'>;
  contentId?: string | null;
}): Promise<string | undefined> {
  const { sourceUrl, platform, contentId } = opts;
  if (!sourceUrl.trim()) return undefined;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.warn('[persistThumbnail] missing SUPABASE_URL or SERVICE_ROLE_KEY');
    return undefined;
  }

  const referer =
    platform === 'instagram'
      ? 'https://www.instagram.com/'
      : platform === 'facebook'
        ? 'https://www.facebook.com/'
        : platform === 'tiktok'
          ? 'https://www.tiktok.com/'
          : null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // One timer for the headers and the body, so a slow image can't hold the import up.
  let contentType: string;
  let bytes: Uint8Array | null;
  try {
    const res = await safeFetch(sourceUrl, {
      headers: {
        ...(referer ? { Referer: referer } : {}),
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      await res.body?.cancel();
      console.warn('[persistThumbnail] fetch HTTP error', {
        platform,
        status: res.status,
        host: safeHost(sourceUrl),
      });
      return undefined;
    }

    contentType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim().toLowerCase();
    if (!WEB_IMAGE_TYPES.has(contentType)) {
      await res.body?.cancel();
      console.warn('[persistThumbnail] not an image', { contentType, host: safeHost(sourceUrl) });
      return undefined;
    }

    bytes = await readBodyCapped(res, MAX_THUMBNAIL_BYTES);
  } catch (err) {
    console.warn('[persistThumbnail] fetch failed', {
      platform,
      host: safeHost(sourceUrl),
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  } finally {
    clearTimeout(timeout);
  }

  if (!bytes) {
    console.warn('[persistThumbnail] image too large', { host: safeHost(sourceUrl) });
    return undefined;
  }
  if (bytes.byteLength < 100) {
    console.warn('[persistThumbnail] image too small', { bytes: bytes.byteLength });
    return undefined;
  }

  const ext = extensionForContentType(contentType);
  // A web image is named by a hash of its bytes. Uploads overwrite, so a name taken from the
  // address would let the site change a picture we already published by changing its file and
  // getting the page imported again. A different picture is a different file here.
  // A social image keeps its post id and adds a short hash of its bytes: files are cached for a
  // year, so a new picture for the same post (the JPEG that replaced a HEIC) needs a new name.
  const idPart = platform === 'web'
    ? await sha256Hex(bytes, 32)
    : `${(contentId?.trim() || hashShort(sourceUrl)).replace(/[^A-Za-z0-9_-]/g, '')}-${await sha256Hex(bytes, 8)}`;
  const path = `${platform}/${idPart}.${ext}`;

  const supabase = createClient<Database>(supabaseUrl, serviceKey);
  const { error } = await supabase.storage.from('recipe-thumbnails').upload(path, bytes, {
    contentType,
    upsert: true,
    cacheControl: '31536000',
  });

  if (error) {
    console.warn('[persistThumbnail] upload failed', { path, message: error.message });
    return undefined;
  }

  const { data } = supabase.storage.from('recipe-thumbnails').getPublicUrl(path);
  console.log('[persistThumbnail] ok', {
    platform,
    path,
    bytes: bytes.byteLength,
    publicHost: safeHost(data.publicUrl),
  });
  return data.publicUrl;
}

/**
 * Uploads a user Snap/invent photo so it can be the recipe hero image. Photos
 * live under `photo/<user id>/` so delete-account can find and remove them.
 */
export async function persistUploadedPhoto(opts: {
  imageBase64: string;
  mimeType?: string;
  userId: string | null;
}): Promise<string | undefined> {
  const bytes = decodeBase64(opts.imageBase64);
  if (!bytes || bytes.byteLength < 100) {
    console.warn('[persistThumbnail] uploaded photo too small');
    return undefined;
  }
  return await persistUserPhotoBytes({ bytes, mimeType: opts.mimeType, userId: opts.userId });
}

/**
 * Stores an image made from a user's photo (the dish cropped out of a Snap, photoCover.ts) next to
 * their uploads, so delete-account removes it with them.
 */
export async function persistUserPhotoBytes(opts: {
  bytes: Uint8Array;
  mimeType?: string;
  userId: string | null;
}): Promise<string | undefined> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.warn('[persistThumbnail] missing SUPABASE_URL or SERVICE_ROLE_KEY');
    return undefined;
  }

  const { bytes } = opts;
  const mime = opts.mimeType?.trim() || 'image/jpeg';
  const ext = extensionForContentType(mime);
  const path = `photo/${opts.userId ?? 'guest'}/${crypto.randomUUID()}.${ext}`;
  const supabase = createClient<Database>(supabaseUrl, serviceKey);
  const { error } = await supabase.storage.from('recipe-thumbnails').upload(path, bytes, {
    contentType: mime.startsWith('image/') ? mime : 'image/jpeg',
    upsert: false,
    cacheControl: '31536000',
  });
  if (error) {
    console.warn('[persistThumbnail] photo upload failed', { path, message: error.message });
    return undefined;
  }

  const { data } = supabase.storage.from('recipe-thumbnails').getPublicUrl(path);
  console.log('[persistThumbnail] photo ok', { path, bytes: bytes.byteLength });
  return data.publicUrl;
}

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

/**
 * Starts storing a Snap/invent upload as soon as the request is accepted, so the
 * photo is kept even when the food gate or the model later turns it down. The
 * upload outlives an early response. Resolves to the public URL, or undefined.
 */
export function keepUploadedPhoto(
  platform: Platform,
  imageBase64: string | null,
  mimeType: string,
  userId: string,
): Promise<string | undefined> {
  if (platform !== 'photo' || !imageBase64) return Promise.resolve(undefined);
  const upload = persistUploadedPhoto({ imageBase64, mimeType, userId }).catch((err) => {
    console.warn('[persistThumbnail] keep photo failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  });
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(upload);
  return upload;
}

/** Downloads a remote image for the cheap food gate (vision). */
export async function fetchImageAsBase64(opts: {
  sourceUrl: string;
  referer?: string;
}): Promise<{ base64: string; mimeType: string } | null> {
  const { sourceUrl, referer } = opts;
  if (!sourceUrl.trim()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (referer) headers.Referer = referer;

    const res = await safeFetch(sourceUrl, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn('[persistThumbnail] fetchImageAsBase64 HTTP', { status: res.status });
      return null;
    }
    const contentType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
    if (!contentType.startsWith('image/')) return null;
    const bytes = await readBodyCapped(res, 1_800_000);
    if (!bytes || bytes.byteLength < 100) return null;
    return { base64: encodeBase64(bytes), mimeType: contentType };
  } catch (err) {
    console.warn('[persistThumbnail] fetchImageAsBase64 failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('avif')) return 'avif';
  return 'jpg';
}

async function sha256Hex(bytes: Uint8Array, length: number): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
}

function hashShort(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
