import { afterEach, describe, expect, it, vi } from "vitest";

import { openInNewTab, preparePrintFrame } from "@/lib/cookbook/printFrame";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const frames = () => document.querySelectorAll("iframe[data-cookbook-print]");

describe("preparePrintFrame", () => {
  it("writes the book into a hidden frame and prints that frame, as often as asked", async () => {
    const ready = await preparePrintFrame("<!DOCTYPE html><html><head><title>Family</title></head><body><h1>Soup</h1></body></html>");
    const frame = frames()[0] as HTMLIFrameElement;
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(frame.contentDocument?.querySelector("h1")?.textContent).toBe("Soup");
    expect(frame.contentDocument?.title).toBe("Family");

    vi.spyOn(frame.contentWindow!, "focus").mockImplementation(() => undefined);
    const print = vi.spyOn(frame.contentWindow!, "print").mockImplementation(() => undefined);
    ready.print();
    ready.print();
    expect(print).toHaveBeenCalledTimes(2);

    ready.dispose();
    expect(frames()).toHaveLength(0);
  });

  it("waits for the pictures, but not for ever", async () => {
    vi.useFakeTimers();
    try {
      // jsdom never finishes loading a picture, like a photo whose site does not answer.
      const pending = preparePrintFrame('<img src="https://slow.example/photo.jpg" />', { timeoutMs: 5000 });
      const image = (frames()[0] as HTMLIFrameElement).contentDocument!.images[0]!;
      Object.defineProperty(image, "complete", { value: false });
      let settled = false;
      void pending.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(4000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1500);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is cancelled and cleans up", async () => {
    const controller = new AbortController();
    const pending = preparePrintFrame('<img src="https://slow.example/photo.jpg" />', { signal: controller.signal, timeoutMs: 60_000 });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(frames()).toHaveLength(0);

    await expect(preparePrintFrame("<p>x</p>", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(frames()).toHaveLength(0);
  });
});

describe("openInNewTab", () => {
  it("opens the book from a blob address and says whether the tab opened", () => {
    const createObjectURL = vi.fn(() => "blob:book");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const open = vi.spyOn(window, "open").mockReturnValueOnce({ opener: window } as unknown as Window).mockReturnValueOnce(null);
    expect(openInNewTab("<p>book</p>")).toBe(true);
    expect(open).toHaveBeenCalledWith("blob:book", "_blank");
    expect(openInNewTab("<p>book</p>")).toBe(false);
  });
});
