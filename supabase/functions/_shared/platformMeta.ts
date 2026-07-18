/** Normalized post metadata consumed by the Gemini content ladder. */
export interface PostComment {
  text: string;
  isCreator: boolean;
}

export interface PlatformMeta {
  description?: string;
  thumbnailUrl?: string;
  /** Transcript / captions text when the scraper provides it. */
  captions?: string;
  topComments: PostComment[];
  /** Direct MP4/CDN URL for multimodal Gemini fallback. */
  videoUrl?: string;
  /** Platform-native content id when resolved (e.g. TikTok numeric id from short links). */
  contentId?: string;
}

export const EMPTY_PLATFORM_META: PlatformMeta = { topComments: [] };
