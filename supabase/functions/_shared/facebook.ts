import { FetchError } from './errors.ts';
import {
  canonicalFacebookUrl,
  detectPlatform,
  extractFacebookId,
  isFacebookShareLink,
} from './platform.ts';
import type { PlatformMeta, PostComment } from './platformMeta.ts';
import { scrapeCreatorsGet } from './scrapecreators.ts';
import { parseDurationSeconds } from './videoLimits.ts';

const MAX_COMMENTS = 10;
/** The post call transcribes short videos on demand; ScrapeCreators asks for 30 s of patience. */
const POST_TIMEOUT_MS = 30_000;
const SHARE_LINK_TIMEOUT_MS = 5_000;

/** `GET /v1/facebook/post`, as seen on 14 Nov 2026 (docs/research/06-facebook-import.md). */
export interface FacebookPostResponse {
  post_id?: string | null;
  /** Set when this post only re-shares another one, which then holds the caption and video. */
  shared_post_url?: string | null;
  description?: string | null;
  /** The resolved post or reel URL, with tracking parameters on posts. */
  url?: string | null;
  image_url?: string | null;
  thumbnail?: string | null;
  transcript?: string | null;
  video?: {
    id?: string | null;
    sd_url?: string | null;
    hd_url?: string | null;
    length_in_second?: number | null;
    thumbnail?: string | null;
  } | null;
  author?: { id?: string | null; name?: string | null } | null;
  /** Photo and text posts carry their first comments inline. Reels do not. */
  comments?: FacebookComment[] | null;
}

export interface FacebookComment {
  text?: string | null;
  author?: { id?: string | null; name?: string | null } | null;
}

interface FacebookCommentsResponse {
  comments?: FacebookComment[] | null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Follows a Facebook share link (`/share/...`, `fb.watch`) one hop to the reel or post it points
 * at. Facebook answers with a plain redirect and needs no sign-in. Finding the real URL first
 * lets an already-saved recipe be recognised before a scrape is paid for.
 *
 * Never throws: when the link can't be resolved it comes back unchanged, and ScrapeCreators
 * resolves it instead.
 */
export async function resolveFacebookShareLink(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  if (detectPlatform(url) !== 'facebook' || !isFacebookShareLink(url)) return url;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHARE_LINK_TIMEOUT_MS);
  try {
    // No browser User-Agent: Facebook answers 400 to one that arrives without the rest of a
    // browser's headers, and redirects a plain client.
    const res = await fetchImpl(url, { redirect: 'manual', signal: controller.signal });
    await res.body?.cancel();
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return url;

    const target = new URL(location, url).toString();
    // An unknown share code lands on the login page or the bare Watch tab, which name no post.
    if (detectPlatform(target) !== 'facebook' || !extractFacebookId(target)) return url;
    return canonicalFacebookUrl(target);
  } catch (err) {
    console.warn('[facebook] share link not resolved', {
      error: err instanceof Error ? err.message : String(err),
    });
    return url;
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetches a public Facebook reel, video or post via ScrapeCreators for the content ladder. */
export async function fetchFacebookMeta(url: string): Promise<PlatformMeta> {
  const fetchUrl = url.trim();
  console.log('[facebook] fetchMeta start', { url: fetchUrl });
  const started = Date.now();

  const [first, commentsResponse] = await Promise.all([
    fetchFacebookPost(fetchUrl),
    // Reels need a second call for comments, where creators often put the recipe. Posts carry
    // their comments inline, so the call is skipped when the link is clearly a post.
    looksLikeFacebookPost(fetchUrl)
      ? Promise.resolve<FacebookCommentsResponse>({})
      : scrapeCreatorsGet<FacebookCommentsResponse>('/v1/facebook/post/comments', {
          url: fetchUrl,
        }).catch((err) => {
          console.warn('[facebook] comments unavailable', {
            error: err instanceof Error ? err.message : String(err),
          });
          return {} as FacebookCommentsResponse;
        }),
  ]);

  let post = first;
  let comments = commentsResponse.comments ?? [];
  const sharedUrl = post.shared_post_url?.trim();
  if (sharedUrl && isEmptyFacebookPost(post) && detectPlatform(sharedUrl) === 'facebook') {
    // A bare re-share: the recipe lives on the original post.
    console.log('[facebook] following re-share to the original post');
    post = await fetchFacebookPost(sharedUrl);
    comments = [];
  }

  if (isEmptyFacebookPost(post) && comments.length === 0) {
    throw new FetchError('facebook.ts: fetchFacebookMeta', 'Facebook post not found', {
      url: fetchUrl,
    });
  }

  const meta = facebookMetaFromResponse(post, comments, fetchUrl);
  console.log('[facebook] fetchMeta done', {
    ms: Date.now() - started,
    contentId: meta.contentId ?? null,
    descriptionLen: meta.description?.length ?? 0,
    comments: meta.topComments.length,
    hasTranscript: Boolean(meta.captions),
    hasVideoUrl: Boolean(meta.videoUrl),
    hasThumbnail: Boolean(meta.thumbnailUrl),
    durationSeconds: meta.durationSeconds ?? null,
  });
  return meta;
}

function fetchFacebookPost(url: string): Promise<FacebookPostResponse> {
  return scrapeCreatorsGet<FacebookPostResponse>(
    '/v1/facebook/post',
    // The transcript is free for videos up to two minutes. Longer ones are left to the video step.
    { url, get_transcript: 'true' },
    { timeoutMs: POST_TIMEOUT_MS },
  );
}

/** A link whose shape says "post", not "video". Share links and reels return false. */
export function looksLikeFacebookPost(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      /\/(?:posts|permalink)\//.test(u.pathname) ||
      /\/(?:permalink|story|photo)\.php$/.test(u.pathname) ||
      u.pathname.startsWith('/share/p/') ||
      u.pathname.startsWith('/photo')
    );
  } catch {
    return false;
  }
}

function isEmptyFacebookPost(post: FacebookPostResponse): boolean {
  return !text(post.description) && !text(post.video?.sd_url) && !text(post.video?.hd_url);
}

/** Maps the ScrapeCreators post (and separately fetched comments) to the ladder's inputs. */
export function facebookMetaFromResponse(
  post: FacebookPostResponse,
  comments: FacebookComment[],
  inputUrl: string,
): PlatformMeta {
  const video = post.video ?? {};
  const videoId = digits(video.id);
  const resolvedUrl = text(post.url);
  const urlId = resolvedUrl ? extractFacebookId(resolvedUrl) : null;
  const postId = digits(post.post_id);
  // The id people see in the link: the reel's video id, or the post id for photo and text posts.
  // A reel's `post_id` is a different number that appears in no URL.
  const contentId = videoId ?? urlId ?? postId ?? extractFacebookId(inputUrl) ?? undefined;

  const allComments = comments.length > 0 ? comments : (post.comments ?? []);

  return {
    description: text(post.description),
    thumbnailUrl: text(video.thumbnail) ?? text(post.image_url) ?? text(post.thumbnail),
    captions: text(post.transcript),
    topComments: mapFacebookComments(allComments, post.author),
    // SD first: it is a third of the size, so more clips fit under the inline video cap.
    videoUrl: text(video.sd_url) ?? text(video.hd_url),
    durationSeconds: parseDurationSeconds(video.length_in_second),
    contentId,
    canonicalUrl: facebookCanonicalUrl({
      videoId,
      resolvedUrl,
      urlId,
      postId,
      authorId: digits(post.author?.id),
      inputUrl,
    }),
  };
}

function facebookCanonicalUrl(opts: {
  videoId?: string;
  resolvedUrl?: string;
  urlId: string | null;
  postId?: string;
  authorId?: string;
  inputUrl: string;
}): string {
  const { videoId, resolvedUrl, urlId, postId, authorId, inputUrl } = opts;
  if (videoId) return `https://www.facebook.com/reel/${videoId}`;
  if (resolvedUrl && urlId) return canonicalFacebookUrl(resolvedUrl);
  // The link has an opaque `pfbid...` id that differs between shares of one post; the numeric
  // ids give one address for all of them.
  if (postId && authorId) return `https://www.facebook.com/${authorId}/posts/${postId}`;
  return canonicalFacebookUrl(resolvedUrl ?? inputUrl);
}

function mapFacebookComments(
  comments: FacebookComment[],
  postAuthor: FacebookPostResponse['author'],
): PostComment[] {
  const authorId = text(postAuthor?.id);
  const authorName = text(postAuthor?.name)?.toLowerCase();
  return comments
    .map((comment) => {
      const body = text(comment.text) ?? '';
      const commentAuthorId = text(comment.author?.id);
      const commentAuthorName = text(comment.author?.name)?.toLowerCase();
      // Comment author ids are often opaque `pfbid...` strings while the post's is numeric, so
      // the display name is the match that usually works.
      const isCreator =
        Boolean(authorId && commentAuthorId && authorId === commentAuthorId) ||
        Boolean(authorName && commentAuthorName && authorName === commentAuthorName);
      return { text: body, isCreator };
    })
    .filter((comment) => comment.text.length > 0)
    .slice(0, MAX_COMMENTS);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function digits(value: unknown): string | undefined {
  const raw = typeof value === 'number' ? String(value) : text(value);
  return raw && /^\d+$/.test(raw) ? raw : undefined;
}
