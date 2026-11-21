import { act, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { CookAlongPlayer } from "@/components/cook/CookAlongPlayer";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { cookAlongVideoFor, type CookAlongVideo } from "@/lib/cook/cookAlongVideo";
import type { SeekRequest } from "@/lib/cook/useCookAlong";
import i18n from "@/lib/i18n";

const youtube = cookAlongVideoFor({ original_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", platform: "youtube" })!;
const tiktok = cookAlongVideoFor({ original_url: "https://www.tiktok.com/@chef/video/123456", platform: "tiktok" })!;
const instagram = cookAlongVideoFor({ original_url: "https://www.instagram.com/reel/ABC123/", platform: "instagram" })!;
const shortLink = cookAlongVideoFor({ original_url: "https://vm.tiktok.com/ZMabc/", platform: "tiktok" })!;

function renderPlayer(video: CookAlongVideo, request: SeekRequest, props: { onTime?: (s: number) => void; onClose?: () => void } = {}) {
  const ui = (next: SeekRequest) => (
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <CookAlongPlayer video={video} request={next} hasStepTimes onClose={props.onClose ?? vi.fn()} onTime={props.onTime} />
      </TooltipProvider>
    </I18nextProvider>
  );
  const result = render(ui(request));
  return { ...result, rerenderWith: (next: SeekRequest) => result.rerender(ui(next)) };
}

const frame = () => screen.getByTestId("cook-along-frame") as HTMLIFrameElement;
const srcParams = () => new URL(frame().src).searchParams;

/** Pretends the player sent a message, from its own window and origin. */
function fromPlayer(origin: string, data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { origin, data, source: frame().contentWindow }));
  });
}

describe("CookAlongPlayer", () => {
  it("plays YouTube from the requested time", () => {
    renderPlayer(youtube, { id: 1, seconds: 83 });
    expect(frame().src).toContain("youtube.com/embed/dQw4w9WgXcQ");
    expect(srcParams().get("start")).toBe("83");
    expect(frame().title).toBe("Cook along video");
    expect(screen.getByRole("heading", { name: "Cook along" })).toBeDefined();
  });

  it("before the player is ready, a new time reloads it from there", () => {
    const { rerenderWith } = renderPlayer(youtube, { id: 1, seconds: 0 });
    expect(srcParams().has("start")).toBe(false);
    rerenderWith({ id: 2, seconds: 125 });
    expect(srcParams().get("start")).toBe("125");
  });

  it("once ready, seeks by message without reloading, and reports the time", () => {
    const onTime = vi.fn();
    const { rerenderWith } = renderPlayer(youtube, { id: 1, seconds: 0 }, { onTime });
    const post = vi.spyOn(frame().contentWindow!, "postMessage");
    const srcBefore = frame().src;

    fromPlayer("https://www.youtube.com", JSON.stringify({ event: "infoDelivery", info: { currentTime: 12 } }));
    expect(onTime).toHaveBeenCalledWith(12);

    rerenderWith({ id: 2, seconds: 125 });
    expect(frame().src).toBe(srcBefore);
    const commands = post.mock.calls.map(([message]) => JSON.parse(message as string));
    expect(commands).toContainEqual(expect.objectContaining({ func: "seekTo", args: [125, true] }));
    expect(post.mock.calls[0][1]).toBe("https://www.youtube.com");
  });

  it("ignores messages that aren't from its own player", () => {
    const onTime = vi.fn();
    renderPlayer(youtube, { id: 1, seconds: 0 }, { onTime });
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { origin: "https://www.youtube.com", data: JSON.stringify({ event: "infoDelivery", info: { currentTime: 5 } }) }),
      );
    });
    expect(onTime).not.toHaveBeenCalled();
  });

  it("starts TikTok at the time once its player says it is ready", () => {
    renderPlayer(tiktok, { id: 1, seconds: 40 });
    expect(frame().src).toContain("tiktok.com/player/v1/123456");
    const post = vi.spyOn(frame().contentWindow!, "postMessage");
    fromPlayer("https://www.tiktok.com", { type: "onPlayerReady", "x-tiktok-player": true });
    expect(post).toHaveBeenCalledWith({ type: "seekTo", value: 40, "x-tiktok-player": true }, "https://www.tiktok.com");
  });

  it("says where to skip to on Instagram, which can't seek", () => {
    const { rerenderWith } = renderPlayer(instagram, { id: 1, seconds: 0 });
    expect(frame().src).toBe("https://www.instagram.com/reel/ABC123/embed/");
    expect(screen.queryByText(/web\.cook\.noSeek|Skip to/)).toBeNull();
    rerenderWith({ id: 2, seconds: 83 });
    expect(screen.getByText(/web\.cook\.noSeek|Skip to 1:23/)).toBeDefined();
  });

  it("links to the video on its own site, and offers only that when it can't be embedded", () => {
    renderPlayer(youtube, { id: 1, seconds: 90 });
    const link = screen.getByRole("link", { name: /web\.cook\.watchOn|Watch on YouTube/ });
    expect(link.getAttribute("href")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("without an embeddable id, explains and links out", () => {
    renderPlayer(shortLink, { id: 1, seconds: 0 });
    expect(screen.queryByTestId("cook-along-frame")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Couldn’t load the video here");
  });

  it("closes", () => {
    const onClose = vi.fn();
    renderPlayer(youtube, { id: 1, seconds: 0 }, { onClose });
    fireEvent.click(screen.getByRole("button", { name: "Close cook-along video" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("resizes from the handle with the keyboard", () => {
    renderPlayer(youtube, { id: 1, seconds: 0 });
    const handle = screen.getByRole("separator");
    fireEvent.keyDown(handle, { key: "End" });
    expect(Number(handle.getAttribute("aria-valuenow"))).toBeGreaterThan(120);
    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle.getAttribute("aria-valuenow")).toBe("120");
  });
});
