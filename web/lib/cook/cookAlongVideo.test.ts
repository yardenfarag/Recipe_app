import { describe, expect, it } from "vitest";

import { cookAlongVideoFor, pageUrlAt, playerSrc } from "@/lib/cook/cookAlongVideo";

describe("cookAlongVideoFor", () => {
  it("plays a YouTube video, wide, and can seek", () => {
    const video = cookAlongVideoFor({ original_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", platform: "youtube" });
    expect(video).toMatchObject({
      platform: "youtube",
      label: "YouTube",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      canSeek: true,
      shape: "landscape",
    });
  });

  it("treats YouTube Shorts as tall", () => {
    expect(cookAlongVideoFor({ original_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", platform: "youtube" })?.shape).toBe("portrait");
  });

  it("uses TikTok's v1 player, which can seek", () => {
    const video = cookAlongVideoFor({ original_url: "https://www.tiktok.com/@chef/video/7234567890123456789", platform: "tiktok" });
    expect(video).toMatchObject({ embedUrl: "https://www.tiktok.com/player/v1/7234567890123456789", canSeek: true, shape: "portrait" });
  });

  it("uses Instagram's embed without the caption, and can't seek", () => {
    const video = cookAlongVideoFor({ original_url: "https://www.instagram.com/reels/ABC123/", platform: "instagram" });
    expect(video).toMatchObject({ embedUrl: "https://www.instagram.com/reel/ABC123/embed/", canSeek: false });
    expect(cookAlongVideoFor({ original_url: "https://www.instagram.com/p/XYZ/", platform: "instagram" })?.embedUrl).toBe(
      "https://www.instagram.com/p/XYZ/embed/",
    );
  });

  it("uses Facebook's video plugin for a reel, and nothing for a post", () => {
    const reel = cookAlongVideoFor({ original_url: "https://www.facebook.com/reel/774239929117468", platform: "facebook" });
    expect(reel?.embedUrl).toContain("facebook.com/plugins/video.php");
    expect(reel?.canSeek).toBe(false);
    expect(cookAlongVideoFor({ original_url: "https://www.facebook.com/1000639/posts/1582534293887922", platform: "facebook" })).toBeNull();
  });

  it("offers a short link on its own site, since there is no id to embed", () => {
    const video = cookAlongVideoFor({ original_url: "https://vm.tiktok.com/ZMabc123/", platform: "tiktok" });
    expect(video).toMatchObject({ embedUrl: null, pageUrl: "https://vm.tiktok.com/ZMabc123/", canSeek: false });
  });

  it("plays the video a web recipe embeds, and nothing for a web recipe without one", () => {
    expect(
      cookAlongVideoFor({
        original_url: "https://example.com/pancakes",
        platform: "web",
        source_video_url: "https://youtu.be/dQw4w9WgXcQ",
      })?.embedUrl,
    ).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(cookAlongVideoFor({ original_url: "https://example.com/pancakes", platform: "web" })).toBeNull();
    expect(cookAlongVideoFor({ platform: "photo" })).toBeNull();
  });
});

describe("playerSrc", () => {
  const youtube = cookAlongVideoFor({ original_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", platform: "youtube" })!;
  const tiktok = cookAlongVideoFor({ original_url: "https://www.tiktok.com/@chef/video/123456", platform: "tiktok" })!;

  it("turns on YouTube's API, with this page's origin and the start time", () => {
    const src = new URL(playerSrc(youtube, { startSeconds: 83.4, origin: "https://pinch-app.io" })!);
    expect(src.pathname).toBe("/embed/dQw4w9WgXcQ");
    expect(src.searchParams.get("enablejsapi")).toBe("1");
    expect(src.searchParams.get("origin")).toBe("https://pinch-app.io");
    expect(src.searchParams.get("start")).toBe("83");
    expect(src.searchParams.get("autoplay")).toBe("1");
  });

  it("leaves the start out at zero", () => {
    expect(new URL(playerSrc(youtube)!).searchParams.has("start")).toBe(false);
  });

  it("asks TikTok for a quiet player", () => {
    const src = new URL(playerSrc(tiktok)!);
    expect(src.searchParams.get("rel")).toBe("0");
    expect(src.searchParams.get("description")).toBe("0");
  });

  it("is null when there is nothing to embed", () => {
    expect(playerSrc(cookAlongVideoFor({ original_url: "https://vm.tiktok.com/ZMabc/", platform: "tiktok" })!)).toBeNull();
  });
});

describe("pageUrlAt", () => {
  it("opens YouTube at the time, and other sites at the start", () => {
    const youtube = cookAlongVideoFor({ original_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", platform: "youtube" })!;
    expect(pageUrlAt(youtube, 90)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90");
    expect(pageUrlAt(youtube, 0)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    const reel = cookAlongVideoFor({ original_url: "https://www.instagram.com/reel/ABC123/", platform: "instagram" })!;
    expect(pageUrlAt(reel, 90)).toBe("https://www.instagram.com/reel/ABC123/");
  });
});
