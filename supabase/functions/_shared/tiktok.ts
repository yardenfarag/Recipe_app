import { FetchError } from './errors.ts';
import { extractTikTokId } from './platform.ts';
import { EMPTY_PLATFORM_META, type PlatformMeta, type PostComment } from './platformMeta.ts';
import {
  extractTikTokThumbnail,
  fetchTikTokOembedThumbnail,
} from './tiktokThumbnail.ts';
import {
  firstUrlList,
  scrapeCreatorsGet,
  webVttToPlainText,
} from './scrapecreators.ts';

const MAX_COMMENTS = 10;

interface TikTokVideoResponse {
  aweme_detail?: TikTokAwemeDetail;
  transcript?: string;
  no_watermark_video_url?: string;
}

interface TikTokCommentsResponse {
  comments?: TikTokComment[];
}

interface TikTokAwemeDetail {
  aweme_id?: string;
  desc?: string;
  author?: { unique_id?: string; nickname?: string; uid?: string };
  video?: TikTokCoverFields & {
    has_watermark?: boolean;
    play_addr?: { url_list?: string[] };
    download_no_watermark_addr?: { url_list?: string[] };
  };
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
    scrapeCreatorsGet<TikTokVideoResponse>('/v2/tiktok/video', {
      url,
      get_transcript: 'true',
      trim: 'true',
    }),
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

  let thumbnailUrl =
    extractTikTokThumbnail(detail.video, videoResponse as Record<string, unknown>) ??
    (await fetchTikTokOembedThumbnail(url));

  return {
    description: detail.desc?.trim() || undefined,
    thumbnailUrl,
    captions: transcript || undefined,
    topComments,
    videoUrl: resolveTikTokVideoUrl(videoResponse, detail),
    contentId: videoId,
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

function resolveTikTokVideoUrl(
  response: TikTokVideoResponse,
  detail: TikTokAwemeDetail,
): string | undefined {
  if (response.no_watermark_video_url) return response.no_watermark_video_url;

  const noWatermark = firstUrlList(detail.video?.download_no_watermark_addr);
  if (noWatermark) return noWatermark;

  if (!detail.video?.has_watermark) {
    return firstUrlList(detail.video?.play_addr);
  }

  return firstUrlList(detail.video?.play_addr);
}

export { EMPTY_PLATFORM_META };
