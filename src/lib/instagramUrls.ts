/**
 * Client-side mirror of Instagram URL helpers in
 * supabase/functions/_shared/platform.ts — keep in sync.
 */
import { extractInstagramId } from '@/lib/platformUrls';

export type InstagramPathKind = 'p' | 'reel' | 'tv';

export function instagramPathKind(url: string): InstagramPathKind {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.includes('/p/')) return 'p';
    if (path.includes('/tv/')) return 'tv';
    return 'reel';
  } catch {
    return 'reel';
  }
}

export function instagramUrlForKind(shortcode: string, kind: InstagramPathKind): string {
  return `https://www.instagram.com/${kind}/${shortcode}/`;
}

/** Strip tracking params while preserving post vs reel vs tv path. */
export function sanitizeInstagramUrl(url: string): string {
  const shortcode = extractInstagramId(url);
  if (!shortcode) return url.trim();
  return instagramUrlForKind(shortcode, instagramPathKind(url));
}

/** Stable dedup URL — shortcode is the identity, path variant does not matter. */
export function canonicalInstagramUrl(shortcode: string): string {
  return instagramUrlForKind(shortcode, 'p');
}

/** Ordered fetch candidates when ScrapeCreators rejects a path variant. */
export function instagramFetchUrlCandidates(url: string): string[] {
  const shortcode = extractInstagramId(url);
  if (!shortcode) return [url.trim()];

  const primaryKind = instagramPathKind(url);
  const kinds: InstagramPathKind[] =
    primaryKind === 'p' ? ['p', 'reel'] : primaryKind === 'tv' ? ['tv', 'p', 'reel'] : ['reel', 'p'];

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const kind of kinds) {
    const candidate = instagramUrlForKind(shortcode, kind);
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    candidates.push(candidate);
  }
  return candidates;
}
