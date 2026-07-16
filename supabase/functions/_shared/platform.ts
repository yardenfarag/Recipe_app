export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'unknown';

/** Which platforms have live extraction (ADR 003 staged rollout). */
export const LIVE_PLATFORMS: Platform[] = ['youtube'];

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
  return 'unknown';
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

export function youTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
