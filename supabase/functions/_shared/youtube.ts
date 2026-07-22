// Optional enrichment via the YouTube Data API v3.
// If YOUTUBE_API_KEY is not set, extraction still works from the video alone —
// this only adds the description + top comments rungs of the content ladder (ADR 004).
//
// Shorts in particular often carry the *entire* recipe in the creator's own
// pinned/first comment rather than the description — so we detect comments
// authored by the video's own channel and surface them first (see gemini.ts,
// which now treats these as a primary source, not just a gap-filler).

import { youTubeThumbnail } from './platform.ts';
import { parseDurationSeconds, parseYouTubeIsoDuration } from './videoLimits.ts';

const MAX_COMMENTS = 10;

export interface YouTubeComment {
  text: string;
  isCreator: boolean;
}

export interface YouTubeMeta {
  description?: string;
  /** Best available thumbnail from the Data API snippet, when YOUTUBE_API_KEY is set. */
  thumbnailUrl?: string;
  /** Plain-text captions/transcript when available (via YouTube player metadata). */
  captions?: string;
  /** Video length in seconds when available from the Data API or player metadata. */
  durationSeconds?: number;
  topComments: YouTubeComment[];
}

/** YouTube Data API thumbnail sizes, highest quality first. */
const THUMBNAIL_KEYS = ['maxres', 'standard', 'high', 'medium'] as const;

/** Picks the highest-res thumbnail URL from a videos.list snippet.thumbnails object. */
export function pickBestApiThumbnail(thumbnails: unknown): string | undefined {
  if (!thumbnails || typeof thumbnails !== 'object') return undefined;

  for (const key of THUMBNAIL_KEYS) {
    const url = (thumbnails as Record<string, { url?: unknown }>)[key]?.url;
    if (typeof url === 'string' && url.trim()) return url;
  }
  return undefined;
}

/** Resolves the best thumbnail for a video — API-first, CDN fallback. */
export async function resolveYouTubeThumbnailUrl(videoId: string): Promise<string> {
  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (apiKey) {
    const { thumbnailUrl } = await fetchVideoSnippet(videoId, apiKey);
    if (thumbnailUrl) return thumbnailUrl;
  }
  return youTubeThumbnail(videoId);
}

/** Comment shape before we know the channelId, so isCreator can't be resolved yet. */
interface RawComment {
  text: string;
  authorChannelId?: string;
}

export async function fetchYouTubeMeta(videoId: string): Promise<YouTubeMeta> {
  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  const player = await fetchYouTubePlayerMetadata(videoId);

  if (!apiKey) {
    return {
      topComments: [],
      captions: player.captions,
      durationSeconds: player.durationSeconds,
    };
  }

  // The snippet (for description + channelId) and raw comments are
  // independent network calls, so fetch them concurrently — resolving
  // which comments are from the creator happens afterward, once we know
  // channelId, rather than blocking one fetch on the other.
  const [{ description, channelId, thumbnailUrl, durationSeconds }, rawComments] = await Promise.all([
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

  return {
    description,
    thumbnailUrl,
    captions: player.captions,
    durationSeconds: durationSeconds ?? player.durationSeconds,
    topComments,
  };
}

async function fetchVideoSnippet(
  videoId: string,
  apiKey: string,
): Promise<{
  description?: string;
  channelId?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
}> {
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('id', videoId);
    url.searchParams.set('key', apiKey);

    const res = await fetch(url);
    if (!res.ok) return {};

    const data = await res.json();
    const item = data.items?.[0];
    const snippet = item?.snippet;
    return {
      description: snippet?.description ?? undefined,
      channelId: snippet?.channelId,
      thumbnailUrl: pickBestApiThumbnail(snippet?.thumbnails),
      durationSeconds: parseYouTubeIsoDuration(item?.contentDetails?.duration),
    };
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

const MAX_CAPTION_CHARS = 12_000;

interface YouTubePlayerMetadata {
  captions?: string;
  durationSeconds?: number;
}

async function fetchYouTubePlayerMetadata(videoId: string): Promise<YouTubePlayerMetadata> {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.10.38',
            androidSdkVersion: 30,
            hl: 'en',
            gl: 'US',
          },
        },
        videoId,
      }),
    });
    if (!res.ok) return {};

    const data = await res.json();
    const lengthSeconds = parseDurationSeconds(data?.videoDetails?.lengthSeconds);

    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    let captions: string | undefined;
    if (Array.isArray(tracks) && tracks.length > 0) {
      const track = pickCaptionTrack(tracks);
      if (track?.baseUrl) {
        const captionRes = await fetch(track.baseUrl);
        if (captionRes.ok) {
          const text = parseTimedTextXml(await captionRes.text());
          if (text) {
            captions = text.length > MAX_CAPTION_CHARS ? text.slice(0, MAX_CAPTION_CHARS) : text;
          }
        }
      }
    }

    return { captions, durationSeconds: lengthSeconds };
  } catch {
    return {};
  }
}

/** Fetches plain-text captions via YouTube's player metadata (public timedtext tracks). */
export async function fetchYouTubeCaptions(videoId: string): Promise<string | undefined> {
  const { captions } = await fetchYouTubePlayerMetadata(videoId);
  return captions;
}

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string };
}

function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  const english = tracks.filter((t) => t.languageCode?.startsWith('en'));
  const pool = english.length > 0 ? english : tracks;

  // Prefer manually uploaded captions over auto-generated when both exist.
  const manual = pool.find((t) => t.kind !== 'asr');
  return manual ?? pool[0];
}

function parseTimedTextXml(xml: string): string {
  const lines: string[] = [];
  const paragraphPattern = /<p\b[^>]*>([\s\S]*?)<\/p>/g;

  for (const match of xml.matchAll(paragraphPattern)) {
    const raw = match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (raw) lines.push(raw);
  }

  return lines.join('\n');
}
