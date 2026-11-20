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

    const match = u.pathname.match(/\/(shorts|embed)\/([A-Za-z0-9_-]{11})/);
    if (match) return match[2];

    return null;
  } catch {
    return null;
  }
}

/** True when two URLs refer to the same YouTube video (or are identical strings). */
export function recipeUrlsMatch(
  inputUrl: string,
  storedUrl?: string | null,
): boolean {
  if (!storedUrl?.trim()) return false;

  const inputVideoId = extractYouTubeId(inputUrl);
  const storedVideoId = extractYouTubeId(storedUrl);
  if (inputVideoId && storedVideoId) return inputVideoId === storedVideoId;

  return inputUrl.trim() === storedUrl.trim();
}

/** Legacy CDN thumbs that use 4:3 letterboxing and look worse in the app. */
export function needsThumbnailBackfill(imageUrl?: string | null): boolean {
  if (!imageUrl) return true;
  return /\/(hqdefault|sddefault|default|0|1|2|3)\.(jpg|webp)(\?|$)/i.test(imageUrl);
}
