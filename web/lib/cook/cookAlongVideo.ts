import { extractInstagramId, extractTikTokId } from "@shared/lib/platformUrls";
import {
  facebookEmbedUrl,
  getRecipePlatformLabel,
  getRecipeVideoInfo,
  recipeVideoUrlAtSeconds,
} from "@shared/lib/recipeVideo";
import type { Recipe } from "@shared/types/recipe";

export type VideoPlatform = "youtube" | "instagram" | "tiktok" | "facebook";

/**
 * The recipe's source video as the web app plays it, in an iframe beside the recipe (cook-along). Built from the
 * same rules as mobile (shared/lib/recipeVideo.ts), with the players chosen for a browser:
 * - YouTube's embed, with its JavaScript API on, so a step's time can seek without reloading.
 * - TikTok's Embed Player v1 (not the v2 page mobile loads), which takes `seekTo` messages.
 * - Instagram's embed without the caption: the caption is the recipe, already on the page.
 * - Facebook's video plugin.
 * Instagram and Facebook can't be told where to start, so `canSeek` is false for them.
 */
export type CookAlongVideo = {
  platform: VideoPlatform;
  /** "YouTube", "TikTok"… Brand names, the same in every language. */
  label: string;
  /** The video on its own site, for "Watch on …" and when it can't play here. */
  pageUrl: string;
  /** The player to put in an iframe; null when the link has no id we can embed (a short link, a channel). */
  embedUrl: string | null;
  canSeek: boolean;
  /** Reels and TikToks are tall; YouTube is wide. Sets the player's shape. */
  shape: "landscape" | "portrait";
};

/** The video to cook along with, or null when the recipe has none (a web page, a photo, a Facebook post). */
export function cookAlongVideoFor(
  recipe: Pick<Recipe, "original_url" | "platform" | "source_video_url">,
): CookAlongVideo | null {
  const info = getRecipeVideoInfo(recipe.original_url, recipe.platform, recipe.source_video_url);
  if (info.mode === "none" || !info.url) return null;
  const platform = info.platform;
  if (platform !== "youtube" && platform !== "instagram" && platform !== "tiktok" && platform !== "facebook") return null;

  const base = { platform, label: getRecipePlatformLabel(platform), pageUrl: info.url };
  switch (platform) {
    case "youtube":
      return {
        ...base,
        embedUrl: info.youtubeVideoId ? `https://www.youtube.com/embed/${info.youtubeVideoId}` : null,
        canSeek: Boolean(info.youtubeVideoId),
        shape: /\/shorts\//.test(info.url) ? "portrait" : "landscape",
      };
    case "tiktok": {
      const id = extractTikTokId(info.url);
      return { ...base, embedUrl: id ? `https://www.tiktok.com/player/v1/${id}` : null, canSeek: Boolean(id), shape: "portrait" };
    }
    case "instagram":
      return { ...base, embedUrl: instagramPlayerUrl(info.url), canSeek: false, shape: "portrait" };
    case "facebook":
      return { ...base, embedUrl: facebookEmbedUrl(info.url), canSeek: false, shape: "portrait" };
  }
}

function instagramPlayerUrl(url: string): string | null {
  const shortcode = extractInstagramId(url);
  if (!shortcode) return null;
  const kind = url.match(/\/(reel|reels|p|tv)\//)?.[1];
  const segment = kind === "p" || kind === "tv" ? kind : "reel";
  return `https://www.instagram.com/${segment}/${shortcode}/embed/`;
}

/**
 * The iframe's address, starting at `startSeconds` where the player allows it in the URL (YouTube). TikTok starts
 * by message once it is ready (see playerMessages.ts). `origin` is this page's, which YouTube's API needs to talk back.
 */
export function playerSrc(
  video: CookAlongVideo,
  { startSeconds = 0, origin, autoplay = true }: { startSeconds?: number; origin?: string; autoplay?: boolean } = {},
): string | null {
  if (!video.embedUrl) return null;
  const url = new URL(video.embedUrl);
  const start = Math.max(0, Math.round(startSeconds));
  switch (video.platform) {
    case "youtube":
      url.searchParams.set("enablejsapi", "1");
      url.searchParams.set("playsinline", "1");
      url.searchParams.set("rel", "0");
      url.searchParams.set("iv_load_policy", "3");
      if (origin) url.searchParams.set("origin", origin);
      if (autoplay) url.searchParams.set("autoplay", "1");
      if (start > 0) url.searchParams.set("start", String(start));
      break;
    case "tiktok":
      url.searchParams.set("rel", "0");
      url.searchParams.set("description", "0");
      url.searchParams.set("music_info", "0");
      if (autoplay) url.searchParams.set("autoplay", "1");
      break;
    case "instagram":
    case "facebook":
      break;
  }
  return url.toString();
}

/** The video on its own site, at `seconds` where the site understands it (YouTube's `t`). */
export function pageUrlAt(video: CookAlongVideo, seconds: number): string {
  if (seconds <= 0 || video.platform !== "youtube") return video.pageUrl;
  return recipeVideoUrlAtSeconds(video.pageUrl, "youtube", seconds);
}
