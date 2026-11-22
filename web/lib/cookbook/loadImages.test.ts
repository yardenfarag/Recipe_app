import { afterEach, describe, expect, it, vi } from "vitest";

import { browserImageLoader, loadImages } from "@/lib/cookbook/loadImages";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("loadImages", () => {
  it("answers for every slot, loads each address once, and reports progress", async () => {
    const load = vi.fn(async (url: string) => !url.includes("broken"));
    const onProgress = vi.fn();
    const result = await loadImages(["https://a/1.jpg", null, "https://a/broken.jpg", " https://a/1.jpg ", ""], {
      signal: new AbortController().signal,
      load,
      onProgress,
    });
    expect(result).toEqual([true, false, false, true, false]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 0, 2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });

  it("never has more than a few loading at once", async () => {
    let active = 0;
    let peak = 0;
    const load = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return true;
    };
    const urls = Array.from({ length: 50 }, (_, index) => `https://cdn/${index}.jpg`);
    const result = await loadImages(urls, { signal: new AbortController().signal, load, concurrency: 4 });
    expect(result.every(Boolean)).toBe(true);
    expect(peak).toBe(4);
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    const load = vi.fn(async () => {
      controller.abort();
      return true;
    });
    await expect(
      loadImages(["https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg"], { signal: controller.signal, load, concurrency: 1 }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("browserImageLoader", () => {
  class FakeImage {
    static last: FakeImage | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    decoding = "";
    src = "";
    constructor() {
      FakeImage.last = this;
    }
  }

  it("is true once the picture has loaded, false when it fails or takes too long", async () => {
    vi.stubGlobal("Image", FakeImage);
    const load = browserImageLoader(1000);

    const ok = load("https://a/1.jpg", new AbortController().signal);
    FakeImage.last!.naturalWidth = 640;
    FakeImage.last!.onload!();
    expect(await ok).toBe(true);

    const failed = load("https://a/2.jpg", new AbortController().signal);
    FakeImage.last!.onerror!();
    expect(await failed).toBe(false);

    vi.useFakeTimers();
    const slow = load("https://a/3.jpg", new AbortController().signal);
    vi.advanceTimersByTime(1001);
    expect(await slow).toBe(false);
  });

  it("gives up at once when cancelled", async () => {
    vi.stubGlobal("Image", FakeImage);
    const controller = new AbortController();
    const pending = browserImageLoader()("https://a/1.jpg", controller.signal);
    controller.abort();
    expect(await pending).toBe(false);
    expect(FakeImage.last!.src).toBe("");
  });
});
