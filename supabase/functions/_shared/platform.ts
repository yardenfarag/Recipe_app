export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'unknown';

/** Which platforms have live extraction (ADR 003 staged rollout). */
export const LIVE_PLATFORMS: Platform[] = ['youtube', 'instagram', 'tiktok'];

export function detectPlatform(url: string): Platform {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'unknown';
  }

  if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) {
    return 'youtube';
  }
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    return 'instagram';
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    return 'tiktok';
  }
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
    return 'tiktok';
  }
  return 'unknown';
}

/** Extracts the Instagram reel/post shortcode from common URL shapes. */
export function extractInstagramId(url: string): string | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

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
    primaryKind === 'p'
      ? ['p', 'reel']
      : primaryKind === 'tv'
        ? ['tv', 'p', 'reel']
        : ['reel', 'p'];

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

/** Extracts the numeric TikTok video id when present in the URL path. */
export function extractTikTokId(url: string): string | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/video\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Canonical TikTok watch URL for dedup persistence. */
export function canonicalTikTokUrl(videoId: string, username?: string | null): string {
  if (username?.trim()) {
    return `https://www.tiktok.com/@${username.replace(/^@/, '')}/video/${videoId}`;
  }
  return `https://www.tiktok.com/video/${videoId}`;
}

/** Extracts the 11-char YouTube video id from watch/shorts/youtu.be URLs. */
export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id.length === 11 ? id : null;
    }

    if (u.searchParams.has('v')) {
      const id = u.searchParams.get('v')!;
      return id.length === 11 ? id : null;
    }

    // /shorts/<id> or /embed/<id>
    const match = u.pathname.match(/\/(shorts|embed)\/([A-Za-z0-9_-]{11})/);
    if (match) return match[2];

    return null;
  } catch {
    return null;
  }
}

/** Canonical watch URL — used when persisting so duplicate checks stay stable. */
export function canonicalYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** True when two URLs refer to the same content on a supported platform. */
export function recipeUrlsMatch(
  inputUrl: string,
  inputContentId: string | null,
  storedUrl?: string | null,
  storedPlatform?: Platform,
): boolean {
  if (!storedUrl?.trim()) return false;

  const inputYouTubeId =
    inputContentId && inputContentId.length === 11 ? inputContentId : extractYouTubeId(inputUrl);
  const storedYouTubeId = extractYouTubeId(storedUrl);
  if (
    (storedPlatform === 'youtube' || inputYouTubeId) &&
    inputYouTubeId &&
    storedYouTubeId
  ) {
    return inputYouTubeId === storedYouTubeId;
  }

  const inputInstagramId = inputContentId ?? extractInstagramId(inputUrl);
  const storedInstagramId = extractInstagramId(storedUrl);
  if (
    (storedPlatform === 'instagram' || inputInstagramId) &&
    inputInstagramId &&
    storedInstagramId
  ) {
    return inputInstagramId === storedInstagramId;
  }

  const inputTikTokId = inputContentId ?? extractTikTokId(inputUrl);
  const storedTikTokId = extractTikTokId(storedUrl);
  if ((storedPlatform === 'tiktok' || inputTikTokId) && inputTikTokId && storedTikTokId) {
    return inputTikTokId === storedTikTokId;
  }

  return inputUrl.trim() === storedUrl.trim();
}

/** CDN fallback when the Data API is unavailable — true 16:9, no letterbox bars. */
export function youTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/** Legacy CDN thumbs that use 4:3 letterboxing and look worse in the app. */
export function needsThumbnailBackfill(imageUrl?: string | null): boolean {
  if (!imageUrl) return true;
  return /\/(hqdefault|sddefault|default|0|1|2|3)\.(jpg|webp)(\?|$)/i.test(imageUrl);
}
