import { FetchError } from '../../core/errors.ts';
import { extractTikTokId } from '../platform.ts';
import { EMPTY_PLATFORM_META, type PlatformMeta, type PostComment } from '../platformMeta.ts';
import { extractTikTokThumbnails } from './tiktokThumbnail.ts';
import {
  firstUrlList,
  scrapeCreatorsGet,
  TRANSCRIPT_TIMEOUT_MS,
  webVttToPlainText,
} from './scrapecreators.ts';
import { parseDurationMilliseconds, wantsSmallestVideo } from '../videoLimits.ts';

const MAX_COMMENTS = 10;

export interface TikTokVideoResponse {
  aweme_detail?: TikTokAwemeDetail;
  transcript?: string;
  no_watermark_video_url?: string;
}

interface TikTokCommentsResponse {
  comments?: TikTokComment[];
}

export interface TikTokAwemeDetail {
  aweme_id?: string;
  desc?: string;
  author?: { unique_id?: string; nickname?: string; uid?: string };
  video?: TikTokCoverFields & {
    duration?: number;
    has_watermark?: boolean;
    play_addr?: { url_list?: string[] };
    download_no_watermark_addr?: { url_list?: string[] };
    /** The same video at several qualities. */
    bit_rate?: TikTokBitRate[];
  };
}

export interface TikTokBitRate {
  bit_rate?: number;
  gear_name?: string;
  play_addr?: { url_list?: string[]; data_size?: number | string };
}

interface TikTokCoverFields {
  cover?: { url_list?: string[] };
  dynamic_cover?: { url_list?: string[] };
  origin_cover?: { url_list?: string[] };
  ai_dynamic_cover?: { url_list?: string[] };
  animated_cover?: { url_list?: string[] };
}

interface TikTokComment {
  text?: string;
  user?: { unique_id?: string; nickname?: string; uid?: string };
}

/** Fetches TikTok video metadata via ScrapeCreators for the content ladder. */
export async function fetchTikTokMeta(url: string): Promise<PlatformMeta> {
  const [videoResponse, commentsResponse] = await Promise.all([
    scrapeCreatorsGet<TikTokVideoResponse>(
      '/v2/tiktok/video',
      { url, get_transcript: 'true', trim: 'true' },
      { timeoutMs: TRANSCRIPT_TIMEOUT_MS },
    ),
    scrapeCreatorsGet<TikTokCommentsResponse>('/v1/tiktok/video/comments', {
      url,
      trim: 'true',
    }).catch(() => ({ comments: [] as TikTokComment[] })),
  ]);

  const detail = videoResponse.aweme_detail;
  if (!detail) {
    throw new FetchError('tiktok.ts: fetchTikTokMeta', 'TikTok video not found', { url });
  }

  const authorId = detail.author?.unique_id ?? detail.author?.nickname;
  const authorUid = detail.author?.uid;
  const topComments = mapTikTokComments(commentsResponse.comments ?? [], authorId, authorUid);

  const transcript = videoResponse.transcript
    ? webVttToPlainText(videoResponse.transcript)
    : undefined;

  const videoId = detail.aweme_id ?? extractTikTokId(url) ?? undefined;

  // TikTok's oEmbed used to be a fallback here; it stopped returning thumbnail_url (checked 2026-11-22).
  const thumbnailCandidates = extractTikTokThumbnails(detail.video, videoResponse as Record<string, unknown>);

  const durationSeconds = parseDurationMilliseconds(detail.video?.duration);

  return {
    description: detail.desc?.trim() || undefined,
    thumbnailUrl: thumbnailCandidates[0],
    thumbnailCandidates,
    captions: transcript || undefined,
    topComments,
    videoUrl: resolveTikTokVideoUrl(videoResponse, detail, durationSeconds),
    contentId: videoId,
    durationSeconds,
  };
}

function mapTikTokComments(
  comments: TikTokComment[],
  authorId?: string,
  authorUid?: string,
): PostComment[] {
  return comments
    .slice(0, MAX_COMMENTS)
    .map((comment) => {
      const text = comment.text?.trim() ?? '';
      const commentAuthor = comment.user?.unique_id ?? comment.user?.nickname;
      const isCreator =
        Boolean(authorId && commentAuthor && commentAuthor.toLowerCase() === authorId.toLowerCase()) ||
        Boolean(authorUid && comment.user?.uid && comment.user.uid === authorUid);
      return { text, isCreator };
    })
    .filter((comment) => comment.text.length > 0);
}

/** The URL of the smallest quality on offer, by file size, then bit rate. */
export function pickSmallestTikTokVideo(bitRates: TikTokBitRate[] | undefined): string | undefined {
  const size = (entry: TikTokBitRate) => {
    const bytes = Number(entry.play_addr?.data_size);
    return Number.isFinite(bytes) && bytes > 0 ? bytes : Number.POSITIVE_INFINITY;
  };
  const rate = (entry: TikTokBitRate) =>
    typeof entry.bit_rate === 'number' && entry.bit_rate > 0 ? entry.bit_rate : Number.POSITIVE_INFINITY;
  const [smallest] = (bitRates ?? [])
    .filter((entry) => firstUrlList(entry.play_addr))
    .sort((a, b) => size(a) - size(b) || rate(a) - rate(b));
  return smallest ? firstUrlList(smallest.play_addr) : undefined;
}

export function resolveTikTokVideoUrl(
  response: TikTokVideoResponse,
  detail: TikTokAwemeDetail,
  durationSeconds?: number,
): string | undefined {
  // Long videos: the smallest quality, so more of them fit under the inline video cap.
  if (wantsSmallestVideo(durationSeconds)) {
    const smallest = pickSmallestTikTokVideo(detail.video?.bit_rate);
    if (smallest) return smallest;
  }

  if (response.no_watermark_video_url) return response.no_watermark_video_url;

  const noWatermark = firstUrlList(detail.video?.download_no_watermark_addr);
  if (noWatermark) return noWatermark;

  if (!detail.video?.has_watermark) {
    return firstUrlList(detail.video?.play_addr);
  }

  return firstUrlList(detail.video?.play_addr);
}

export { EMPTY_PLATFORM_META };
