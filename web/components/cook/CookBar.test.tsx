import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { CookBar } from "@/components/cook/CookBar";
import { cookAlongVideoFor, type CookAlongVideo } from "@/lib/cook/cookAlongVideo";
import i18n from "@/lib/i18n";

const youtube = cookAlongVideoFor({ original_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", platform: "youtube" });
const shortLink = cookAlongVideoFor({ original_url: "https://vm.tiktok.com/ZMabc/", platform: "tiktok" });

function renderBar(props: { video?: CookAlongVideo | null; playerOpen?: boolean; onToggle?: () => void; onCookMode?: (() => void) | null }) {
  return render(
    <I18nextProvider i18n={i18n}>
      <CookBar
        video={props.video ?? null}
        playerOpen={props.playerOpen ?? false}
        playerId="player"
        onTogglePlayer={props.onToggle ?? vi.fn()}
        onCookMode={props.onCookMode === undefined ? vi.fn() : props.onCookMode}
        emphasis="primary"
      />
    </I18nextProvider>,
  );
}

const cookModeButton = () => screen.getByRole("button", { name: /web\.cook\.cookMode|Cook mode/ });

describe("CookBar", () => {
  it("offers cook mode and cook along for a recipe with a video", () => {
    const onToggle = vi.fn();
    const onCookMode = vi.fn();
    renderBar({ video: youtube, onToggle, onCookMode });
    fireEvent.click(cookModeButton());
    expect(onCookMode).toHaveBeenCalled();
    const along = screen.getByRole("button", { name: /Cook along/ });
    expect(along.textContent).toContain("YouTube");
    expect(along.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(along);
    expect(onToggle).toHaveBeenCalled();
  });

  it("says the player is open, and which element it is", () => {
    renderBar({ video: youtube, playerOpen: true });
    const toggle = screen.getByRole("button", { expanded: true });
    expect(toggle.getAttribute("aria-controls")).toBe("player");
  });

  it("links out when the video can't be embedded", () => {
    renderBar({ video: shortLink });
    expect(screen.queryByRole("button", { name: /Cook along/ })).toBeNull();
    const link = screen.getByRole("link", { name: /web\.cook\.watchOn|Watch on TikTok/ });
    expect(link.getAttribute("href")).toBe("https://vm.tiktok.com/ZMabc/");
  });

  it("shows only cook mode without a video, and nothing without steps or video", () => {
    renderBar({ video: null });
    expect(cookModeButton()).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
    const { container } = renderBar({ video: null, onCookMode: null });
    expect(container.innerHTML).toBe("");
  });
});
