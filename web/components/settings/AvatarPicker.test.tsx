import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { AvatarPicker } from "@/components/settings/AvatarPicker";
import { ProfileAvatar } from "@/components/settings/ProfileAvatar";
import i18n from "@/lib/i18n";

function open(props: Partial<Parameters<typeof AvatarPicker>[0]> = {}) {
  const onPick = vi.fn();
  const onUpload = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <AvatarPicker open onOpenChange={vi.fn()} current={null} savingId={null} onPick={onPick} onUpload={onUpload} {...props} />
    </I18nextProvider>,
  );
  return { onPick, onUpload };
}

describe("AvatarPicker", () => {
  it("offers every food friend by name, and picks one with a tap", () => {
    const { onPick } = open();
    expect(screen.getByRole("dialog", { name: "Change profile picture" })).toBeDefined();
    expect(screen.getAllByRole("button", { pressed: false }).filter((button) => button.hasAttribute("aria-pressed"))).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Smart pizza" }));
    expect(onPick).toHaveBeenCalledWith("pizza");
  });

  it("marks the current choice", () => {
    open({ current: "food:avocado" });
    expect(screen.getByRole("button", { name: "Avocado", pressed: true })).toBeDefined();
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  it("holds still while one saves", () => {
    const { onPick } = open({ savingId: "taco" });
    const taco = screen.getByRole("button", { name: "Taco" });
    expect(taco.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Donut" }));
    expect(onPick).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Upload a photo" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("still lets you upload a photo", () => {
    const { onUpload } = open();
    fireEvent.click(screen.getByRole("button", { name: "Upload a photo" }));
    expect(onUpload).toHaveBeenCalled();
  });
});

describe("ProfileAvatar", () => {
  it("draws a food avatar instead of loading it as a URL", () => {
    const { container } = render(<ProfileAvatar url="food:egg" />);
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  });

  it("shows a photo URL as a photo", () => {
    const { container } = render(<ProfileAvatar url="https://example.com/a.jpg" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.com/a.jpg");
  });

  it("falls back for nothing, or a food avatar this version doesn't know", () => {
    for (const url of [null, "food:lasagna"]) {
      const { container, unmount } = render(<ProfileAvatar url={url} fallback="C" />);
      expect(container.querySelector("img")).toBeNull();
      expect(container.textContent).toBe("C");
      unmount();
    }
  });
});
