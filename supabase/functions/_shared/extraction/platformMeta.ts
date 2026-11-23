/** Normalized post metadata consumed by the Gemini content ladder. */
export interface PostComment {
  text: string;
  isCreator: boolean;
}

export interface PlatformMeta {
  description?: string;
  /** Page or video title when the platform provides one. */
  title?: string;
  thumbnailUrl?: string;
  /**
   * The source's other pictures of the post, best first (imageSize.ts). persistThumbnail tries them
   * when `thumbnailUrl` turns out to be small.
   */
  thumbnailCandidates?: string[];
  /** Transcript / captions text when the scraper provides it. */
  captions?: string;
  topComments: PostComment[];
  /** Direct MP4/CDN URL for multimodal Gemini fallback. */
  videoUrl?: string;
  /** ScrapeCreators credits this fetch spent on top of the platform's usual estimate (YouTube transcript). */
  scrapeCredits?: number;
  /** Source video length in seconds when the platform reports it. */
  durationSeconds?: number;
  /** Platform-native content id when resolved (e.g. TikTok numeric id from short links). */
  contentId?: string;
  /** The post's stable URL when the fetch resolved one (a Facebook share link becomes its reel or post). */
  canonicalUrl?: string;
  /**
   * Set when the meta was read from another kind of source than the link's platform: a Pinterest pin
   * that links to a recipe site comes back as that web page, and the ladder then runs as `web` (PIN-70).
   */
  readAs?: 'web';
}

export const EMPTY_PLATFORM_META: PlatformMeta = { topComments: [] };
