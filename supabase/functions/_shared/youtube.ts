// Optional enrichment via the YouTube Data API v3.
// If YOUTUBE_API_KEY is not set, extraction still works from the video alone —
// this only adds the description + top comments rungs of the content ladder (ADR 004).
//
// Shorts in particular often carry the *entire* recipe in the creator's own
// pinned/first comment rather than the description — so we detect comments
// authored by the video's own channel and surface them first (see gemini.ts,
// which now treats these as a primary source, not just a gap-filler).

const MAX_COMMENTS = 10;

export interface YouTubeComment {
  text: string;
  isCreator: boolean;
}

export interface YouTubeMeta {
  description?: string;
  topComments: YouTubeComment[];
}

/** Comment shape before we know the channelId, so isCreator can't be resolved yet. */
interface RawComment {
  text: string;
  authorChannelId?: string;
}

export async function fetchYouTubeMeta(videoId: string): Promise<YouTubeMeta> {
  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (!apiKey) return { topComments: [] };

  // The snippet (for description + channelId) and raw comments are
  // independent network calls, so fetch them concurrently — resolving
  // which comments are from the creator happens afterward, once we know
  // channelId, rather than blocking one fetch on the other.
  const [{ description, channelId }, rawComments] = await Promise.all([
    fetchVideoSnippet(videoId, apiKey),
    fetchTopComments(videoId, apiKey),
  ]);

  // Surface the creator's own comment(s) first — that's almost always
  // where the full recipe lives for Shorts/reels, regardless of where the
  // relevance ranking placed it.
  const topComments: YouTubeComment[] = rawComments
    .map(({ text, authorChannelId }) => ({
      text,
      isCreator: Boolean(channelId) && authorChannelId === channelId,
    }))
    .sort((a, b) => Number(b.isCreator) - Number(a.isCreator));

  return { description, topComments };
}

async function fetchVideoSnippet(
  videoId: string,
  apiKey: string,
): Promise<{ description?: string; channelId?: string }> {
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('id', videoId);
    url.searchParams.set('key', apiKey);

    const res = await fetch(url);
    if (!res.ok) return {};

    const data = await res.json();
    const snippet = data.items?.[0]?.snippet;
    return { description: snippet?.description ?? undefined, channelId: snippet?.channelId };
  } catch {
    return {};
  }
}

async function fetchTopComments(videoId: string, apiKey: string): Promise<RawComment[]> {
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('videoId', videoId);
    url.searchParams.set('order', 'relevance');
    url.searchParams.set('maxResults', String(MAX_COMMENTS));
    url.searchParams.set('textFormat', 'plainText');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url);
    if (!res.ok) return []; // comments may be disabled

    const data = await res.json();
    const items = data.items ?? [];

    return items
      .map((it: any) => {
        const snippet = it.snippet?.topLevelComment?.snippet;
        const text = snippet?.textDisplay;
        if (typeof text !== 'string') return null;
        return { text, authorChannelId: snippet?.authorChannelId?.value };
      })
      .filter((c: RawComment | null): c is RawComment => c !== null)
      .slice(0, MAX_COMMENTS);
  } catch {
    return [];
  }
}
