import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import type { Platform } from './platform.ts';

const FETCH_TIMEOUT_MS = 12_000;

/**
 * Downloads a social CDN thumbnail with the right Referer and uploads it to
 * Supabase Storage so the app can display a stable, public URL.
 */
export async function persistSocialThumbnail(opts: {
  sourceUrl: string;
  platform: Extract<Platform, 'instagram' | 'tiktok'>;
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
    platform === 'instagram' ? 'https://www.instagram.com/' : 'https://www.tiktok.com/';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(sourceUrl, {
      headers: {
        Referer: referer,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
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

  if (!res.ok) {
    console.warn('[persistThumbnail] fetch HTTP error', {
      platform,
      status: res.status,
      host: safeHost(sourceUrl),
    });
    return undefined;
  }

  const contentType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
  if (!contentType.startsWith('image/')) {
    console.warn('[persistThumbnail] not an image', { contentType, host: safeHost(sourceUrl) });
    return undefined;
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength < 100) {
    console.warn('[persistThumbnail] image too small', { bytes: bytes.byteLength });
    return undefined;
  }

  const ext = extensionForContentType(contentType);
  const idPart = (contentId?.trim() || hashShort(sourceUrl)).replace(/[^A-Za-z0-9_-]/g, '');
  const path = `${platform}/${idPart}.${ext}`;

  const supabase = createClient(supabaseUrl, serviceKey);
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

function extensionForContentType(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
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
