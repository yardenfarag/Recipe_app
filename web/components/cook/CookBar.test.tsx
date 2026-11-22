import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { CookAlongButton, StartCookingButton } from "@/components/cook/CookBar";
import { cookAlongVideoFor, type CookAlongVideo } from "@/lib/cook/cookAlongVideo";
import i18n from "@/lib/i18n";

const youtube = cookAlongVideoFor({ original_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", platform: "youtube" });
const shortLink = cookAlongVideoFor({ original_url: "https://vm.tiktok.com/ZMabc/", platform: "tiktok" });

function renderAlong(props: { video?: CookAlongVideo | null; playerOpen?: boolean; onToggle?: () => void; variant?: "photo" | "inline"; hint?: string }) {
  return render(
    <I18nextProvider i18n={i18n}>
      <CookAlongButton
        video={props.video ?? null}
        playerOpen={props.playerOpen ?? false}
        playerId="player"
        onTogglePlayer={props.onToggle ?? vi.fn()}
        variant={props.variant ?? "photo"}
        hint={props.hint}
      />
    </I18nextProvider>,
  );
}

describe("StartCookingButton", () => {
  it("opens cook mode", () => {
    const onCookMode = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <StartCookingButton onCookMode={onCookMode} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start cooking" }));
    expect(onCookMode).toHaveBeenCalled();
  });
});

describe("CookAlongButton", () => {
  it("on the photo, offers the video with a line saying what it does", () => {
    const onToggle = vi.fn();
    renderAlong({ video: youtube, onToggle, hint: "YouTube · jumps to each step" });
    const along = screen.getByRole("button", { name: /Cook along with the video/ });
    expect(along.textContent).toContain("YouTube · jumps to each step");
    expect(along.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(along);
    expect(onToggle).toHaveBeenCalled();
  });

  it("as an ordinary button, names the platform", () => {
    renderAlong({ video: youtube, variant: "inline" });
    expect(screen.getByRole("button", { name: /Cook along/ }).textContent).toContain("YouTube");
  });

  it("says the player is open, and which element it is", () => {
    renderAlong({ video: youtube, playerOpen: true });
    const toggle = screen.getByRole("button", { expanded: true });
    expect(toggle.getAttribute("aria-controls")).toBe("player");
    expect(toggle.textContent).toContain("Hide video");
  });

  it("links out when the video can't be embedded", () => {
    renderAlong({ video: shortLink });
    expect(screen.queryByRole("button", { name: /Cook along/ })).toBeNull();
    const link = screen.getByRole("link", { name: /Watch on TikTok/ });
    expect(link.getAttribute("href")).toBe("https://vm.tiktok.com/ZMabc/");
  });

  it("shows nothing without a video", () => {
    const { container } = renderAlong({ video: null });
    expect(container.innerHTML).toBe("");
  });
});
