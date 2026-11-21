// Optional enrichment via the YouTube Data API v3.
// If YOUTUBE_API_KEY is not set, extraction still works from the video alone —
// this only adds the description + top comments rungs of the content ladder (ADR 004).
//
// Shorts in particular often carry the *entire* recipe in the creator's own
// pinned/first comment rather than the description — so we detect comments
// authored by the video's own channel and surface them first (see gemini.ts,
// which now treats these as a primary source, not just a gap-filler).

import { canonicalYouTubeWatchUrl, youTubeThumbnail } from '../platform.ts';
import { parseDurationSeconds, parseYouTubeIsoDuration } from '../videoLimits.ts';
import { scrapeCreatorsGet } from './scrapecreators.ts';

const MAX_COMMENTS = 10;

export interface YouTubeComment {
  text: string;
  isCreator: boolean;
}

export interface YouTubeMeta {
  description?: string;
  title?: string;
  /** Best available thumbnail from the Data API snippet, when YOUTUBE_API_KEY is set. */
  thumbnailUrl?: string;
  /** Plain-text captions/transcript: from YouTube's player when it answers, else ScrapeCreators. */
  captions?: string;
  /** ScrapeCreators credits this fetch spent (1 when the transcript came from there). */
  scrapeCredits?: number;
  /** Video length in seconds when available from the Data API or player metadata. */
  durationSeconds?: number;
  /** Watch URL for the ladder's video step; unset when the length is unknown. */
  videoUrl?: string;
  topComments: YouTubeComment[];
}

/**
 * The URL the video step may send to the model, or undefined to keep the video out.
 *
 * AI Studio fetches YouTube links itself, so the inline 20 MB cap never trims a long
 * video and the model would bill every frame of a multi-hour upload. Other platforms
 * treat an unknown length as "not too long"; for YouTube it means "don't send".
 * Known lengths over the limit still get a URL so the ladder's too-long path
 * (isVideoTooLong) skips the video and reports it the same way as on other platforms.
 */
export function youTubeVideoUrlForModel(
  videoId: string,
  durationSeconds: number | undefined,
): string | undefined {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return undefined;
  }
  // Shorts ids are plain video ids, so one watch URL form covers both.
  return canonicalYouTubeWatchUrl(videoId);
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
  const playerPromise = fetchYouTubePlayerMetadata(videoId);
  const captionsPromise = playerPromise.then((player) => resolveCaptions(videoId, player));

  if (!apiKey) {
    const [player, captions] = await Promise.all([playerPromise, captionsPromise]);
    return {
      topComments: [],
      captions: captions.text,
      scrapeCredits: captions.scrapeCredits,
      durationSeconds: player.durationSeconds,
      videoUrl: youTubeVideoUrlForModel(videoId, player.durationSeconds),
    };
  }

  // Captions, the snippet, and comments are independent.
  const [player, captions, { description, title, channelId, thumbnailUrl, durationSeconds }, rawComments] =
    await Promise.all([
      playerPromise,
      captionsPromise,
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

  const knownDuration = durationSeconds ?? player.durationSeconds;
  return {
    description,
    title,
    thumbnailUrl,
    captions: captions.text,
    scrapeCredits: captions.scrapeCredits,
    durationSeconds: knownDuration,
    videoUrl: youTubeVideoUrlForModel(videoId, knownDuration),
    topComments,
  };
}

async function fetchVideoSnippet(
  videoId: string,
  apiKey: string,
): Promise<{
  description?: string;
  title?: string;
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
      title: typeof snippet?.title === 'string' ? snippet.title : undefined,
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

/** About 30 minutes of speech. Matches MAX_CAPTIONS_CHARS in gemini.ts, which trims again. */
const MAX_CAPTION_CHARS = 30_000;

/**
 * ScrapeCreators answers in about 5 s. Past 20 s the import goes on without captions, so a slow
 * transcript can't use up the time the model needs.
 */
const TRANSCRIPT_TIMEOUT_MS = 20_000;

interface YouTubePlayerMetadata {
  captions?: string;
  durationSeconds?: number;
}

function logNoPlayerCaptions(videoId: string, reason: string, details: Record<string, unknown> = {}): void {
  console.log('[youtube] player has no captions', { videoId, reason, ...details });
}

/**
 * YouTube's own player endpoint: free, but from server addresses it almost never hands out
 * captions (PIN-151: 1 of 56 imports in a day). When it has none the reason is logged, so the
 * function logs show whether YouTube refused the request, listed no tracks, or sent an empty track.
 */
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
    if (!res.ok) {
      logNoPlayerCaptions(videoId, 'player_http', { status: res.status });
      return {};
    }

    const data = await res.json();
    const lengthSeconds = parseDurationSeconds(data?.videoDetails?.lengthSeconds);
    const playability = typeof data?.playabilityStatus?.status === 'string' ? data.playabilityStatus.status : null;

    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) {
      logNoPlayerCaptions(videoId, 'no_tracks', { playability });
      return { durationSeconds: lengthSeconds };
    }
    const track = pickCaptionTrack(tracks);
    if (!track?.baseUrl) {
      logNoPlayerCaptions(videoId, 'track_without_url', { playability });
      return { durationSeconds: lengthSeconds };
    }

    const captionRes = await fetch(track.baseUrl);
    const body = captionRes.ok ? await captionRes.text() : '';
    const text = parseTimedTextXml(body);
    if (!text) {
      logNoPlayerCaptions(videoId, captionRes.ok ? 'empty_track' : 'track_http', {
        status: captionRes.status,
        bytes: body.length,
        playability,
      });
      return { durationSeconds: lengthSeconds };
    }

    return { captions: capCaptions(text), durationSeconds: lengthSeconds };
  } catch (err) {
    logNoPlayerCaptions(videoId, 'error', { error: err instanceof Error ? err.message : String(err) });
    return {};
  }
}

function capCaptions(text: string): string {
  return text.length > MAX_CAPTION_CHARS ? text.slice(0, MAX_CAPTION_CHARS) : text;
}

interface ResolvedCaptions {
  text?: string;
  scrapeCredits: number;
}

/** The player's captions when it has them, otherwise ScrapeCreators' transcript. */
async function resolveCaptions(videoId: string, player: YouTubePlayerMetadata): Promise<ResolvedCaptions> {
  if (player.captions) return { text: player.captions, scrapeCredits: 0 };
  const text = await fetchScrapeCreatorsTranscript(videoId);
  // ScrapeCreators charges 1 credit for a transcript and nothing when the video has none.
  return { text, scrapeCredits: text ? 1 : 0 };
}

export interface ScrapeCreatorsTranscriptResponse {
  transcript?: { text?: unknown }[] | null;
  transcript_only_text?: unknown;
  language?: unknown;
}

/**
 * Plain text of a ScrapeCreators YouTube transcript, one line per caption segment.
 * `transcript_only_text` is the fallback for a reply without segments.
 */
export function scrapeCreatorsTranscriptText(response: ScrapeCreatorsTranscriptResponse | null): string {
  const oneLine = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
  const lines = Array.isArray(response?.transcript)
    ? response.transcript.map((segment) => oneLine(segment?.text)).filter(Boolean)
    : [];
  return lines.length > 0 ? lines.join('\n') : oneLine(response?.transcript_only_text);
}

/**
 * The video's transcript from ScrapeCreators, which reads YouTube's captions (auto-generated ones
 * too) from addresses YouTube doesn't block. Undefined when the video has no captions, the key
 * isn't set, or the call fails: the import then goes on with the description and the video.
 */
async function fetchScrapeCreatorsTranscript(videoId: string): Promise<string | undefined> {
  if (!Deno.env.get('SCRAPECREATORS_API_KEY')) return undefined;
  const started = Date.now();
  try {
    const response = await scrapeCreatorsGet<ScrapeCreatorsTranscriptResponse | null>(
      '/v1/youtube/video/transcript',
      { url: canonicalYouTubeWatchUrl(videoId) },
      { timeoutMs: TRANSCRIPT_TIMEOUT_MS },
    );
    const text = scrapeCreatorsTranscriptText(response);
    console.log('[youtube] scrapecreators transcript', {
      videoId,
      found: Boolean(text),
      chars: text.length,
      language: typeof response?.language === 'string' ? response.language : null,
      ms: Date.now() - started,
    });
    return text ? capCaptions(text) : undefined;
  } catch (err) {
    console.log('[youtube] scrapecreators transcript failed', {
      videoId,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

/** Plain-text captions for a video: YouTube's player first, then ScrapeCreators. */
export async function fetchYouTubeCaptions(videoId: string): Promise<string | undefined> {
  const { text } = await resolveCaptions(videoId, await fetchYouTubePlayerMetadata(videoId));
  return text;
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
