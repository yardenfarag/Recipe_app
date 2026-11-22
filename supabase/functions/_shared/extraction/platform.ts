export type Platform =
  | 'youtube'
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'pinterest'
  | 'web'
  | 'photo'
  | 'unknown';

/** Which platforms have live extraction (ADR 003 staged rollout). */
export const LIVE_PLATFORMS: Platform[] = ['youtube', 'instagram', 'tiktok', 'facebook', 'pinterest', 'web'];

/**
 * pinterest.com with any subdomain (www., uk., de., in., …) and Pinterest's country domains
 * (pinterest.co.uk, pinterest.de, pinterest.com.au, …). `pin.it` is matched separately (PIN-70).
 */
const PINTEREST_HOST = /^(?:[a-z0-9-]+\.)?pinterest\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;

/** True for any Pinterest host, short links included. `host` is lower case. */
export function isPinterestHost(host: string): boolean {
  const bare = host.replace(/^www\./, '');
  return bare === 'pin.it' || PINTEREST_HOST.test(bare);
}

export function detectPlatform(url: string): Platform {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'unknown';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'unknown';
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

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
  // m., web. and mbasic. are the same posts on Facebook's other front ends; fb.watch is its video short link.
  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch') {
    return 'facebook';
  }
  if (isPinterestHost(host)) {
    return 'pinterest';
  }

  // Any other public http(s) URL is treated as a recipe webpage.
  if (host && host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local')) {
    return 'web';
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

/**
 * Extracts the numeric id of a Facebook reel, video or post when the URL carries one.
 * Share links (`/share/...`, `fb.watch`) and `pfbid...` post ids are opaque, so they give null
 * and the id comes from the fetched post instead (PIN-66).
 */
export function extractFacebookId(url: string): string | null {
  try {
    const u = new URL(url);
    const fromPath = u.pathname.match(
      /\/(?:reel|videos|posts|permalink)\/(?:[^/]+\/)?(\d{5,})(?:\/|$)/,
    );
    if (fromPath) return fromPath[1];
    for (const key of ['v', 'story_fbid', 'fbid']) {
      const value = u.searchParams.get(key);
      if (value && /^\d{5,}$/.test(value)) return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** True for Facebook's short share links, which only say what they point at after a redirect. */
export function isFacebookShareLink(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'fb.watch' || u.pathname.startsWith('/share/');
  } catch {
    return false;
  }
}

/** Query parameters that name the post. Everything else on a Facebook URL is tracking. */
const FACEBOOK_ID_PARAMS = ['v', 'story_fbid', 'id', 'fbid'];

/** Stable Facebook URL for saving and dedup: www host, no tracking parameters, no trailing slash. */
export function canonicalFacebookUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    if (host === 'facebook.com' || host.endsWith('.facebook.com')) u.hostname = 'www.facebook.com';
    u.protocol = 'https:';
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (!FACEBOOK_ID_PARAMS.includes(key)) u.searchParams.delete(key);
    }
    if (u.pathname.length > 1 && u.pathname.endsWith('/') && !u.search) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url.trim();
  }
}

/** The numeric pin id from `/pin/<id>/`, `/pin/<slug>--<id>/` and `/pin/<id>/sent/…` on any Pinterest host. */
export function extractPinterestId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!isPinterestHost(u.hostname.toLowerCase())) return null;
    const match = u.pathname.match(/^\/pin\/(?:[^/]*--)?(\d{5,25})(?:\/|$)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** True for `pin.it/<code>` and the `api.pinterest.com/url_shortener/…` hop it redirects through. */
export function isPinterestShortLink(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'pin.it' || (isPinterestHost(host) && u.pathname.startsWith('/url_shortener/'));
  } catch {
    return false;
  }
}

/** Stable pin URL for saving and dedup. Drops the sharer's `invite_code` and `sender` parameters. */
export function canonicalPinterestUrl(pinId: string): string {
  return `https://www.pinterest.com/pin/${pinId}/`;
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

  if (storedPlatform === 'pinterest' || detectPlatform(storedUrl) === 'pinterest') {
    const inputPinId = inputContentId ?? extractPinterestId(inputUrl);
    const storedPinId = extractPinterestId(storedUrl);
    if (inputPinId && storedPinId) return inputPinId === storedPinId;
    return canonicalizeUrlForCompare(inputUrl) === canonicalizeUrlForCompare(storedUrl);
  }

  // Before Instagram: a Facebook `/reel/<id>` path also fits the Instagram shortcode pattern.
  if (storedPlatform === 'facebook' || detectPlatform(storedUrl) === 'facebook') {
    const inputFacebookId = inputContentId ?? extractFacebookId(inputUrl);
    const storedFacebookId = extractFacebookId(storedUrl);
    if (inputFacebookId && storedFacebookId) return inputFacebookId === storedFacebookId;
    return canonicalFacebookUrl(inputUrl) === canonicalFacebookUrl(storedUrl);
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

  return canonicalizeUrlForCompare(inputUrl) === canonicalizeUrlForCompare(storedUrl);
}

function canonicalizeUrlForCompare(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    u.pathname = path;
    return u.toString();
  } catch {
    return url.trim();
  }
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
