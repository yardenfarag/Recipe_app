import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { InAppMessage } from "@shared/lib/inAppMessages";
import { buildMessageView } from "@shared/lib/inAppMessageView";

import i18n from "@/lib/i18n";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { BannerPresenter } from "./BannerPresenter";
import { InAppMessagePreview } from "./InAppMessagePreview";
import { webRoute } from "./MessageBody";
import { AlertPresenter, FullscreenPresenter, SheetPresenter } from "./Presenters";

const LABELS = { update: "Update", learnMore: "Learn more", close: "Close" };

function message(extra: Partial<InAppMessage> = {}): InAppMessage {
  return {
    id: "m1",
    presentation: "alert",
    tone: "info",
    content: {
      en: { title: "Meet the planner", body: "Plan your week.", primaryLabel: "Take a look", secondaryLabel: "Not now" },
      he: { title: "מכירים את המתכנן", body: "מתכננים את השבוע.", primaryLabel: "בואו נראה", secondaryLabel: "לא עכשיו" },
    },
    primaryAction: { type: "route", href: "/hub" },
    secondaryAction: { type: "dismiss" },
    dismissible: true,
    required: false,
    frequency: { type: "once" },
    priority: 0,
    ...extra,
  };
}

function wrap(node: ReactNode) {
  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

function setup(extra: Partial<InAppMessage> = {}, language = "en") {
  const handlers = { onPress: vi.fn(), onClose: vi.fn() };
  const onShown = vi.fn();
  const view = buildMessageView(message(extra), language, LABELS);
  return { handlers, onShown, view };
}

describe("alert", () => {
  it("is a dialog named by the title, reports itself shown once, and its buttons log the mobile ids", () => {
    const { handlers, onShown, view } = setup();
    wrap(<AlertPresenter view={view} handlers={handlers} onShown={onShown} />);
    const dialog = screen.getByRole("dialog", { name: "Meet the planner" });
    expect(dialog).toHaveProperty("dir", "ltr");
    expect(onShown).toHaveBeenCalledTimes(1);
    const primary = screen.getByRole("link", { name: "Take a look" });
    expect(primary.getAttribute("href")).toBe("/hub");
    expect(primary.getAttribute("data-track")).toBe("in_app_message.alert.primary");
    fireEvent.click(primary);
    expect(handlers.onPress).toHaveBeenCalledWith("primary");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes a dismissible message with Escape", () => {
    const { handlers, onShown, view } = setup();
    wrap(<AlertPresenter view={view} handlers={handlers} onShown={onShown} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("adds a Close button when every button leads somewhere", () => {
    const { handlers, onShown, view } = setup({ secondaryAction: undefined });
    wrap(<AlertPresenter view={view} handlers={handlers} onShown={onShown} />);
    const close = screen.getAllByRole("button", { name: "Close" });
    expect(close.map((button) => button.getAttribute("data-track"))).toEqual(
      expect.arrayContaining(["in_app_message.alert.close_button", "in_app_message.alert.close"]),
    );
  });

  it("lays Hebrew content out right to left, whatever the app language", () => {
    const { handlers, onShown, view } = setup({}, "he");
    wrap(<AlertPresenter view={view} handlers={handlers} onShown={onShown} />);
    const dialog = screen.getByRole("dialog", { name: "מכירים את המתכנן" });
    expect(dialog.getAttribute("dir")).toBe("rtl");
    expect(dialog.getAttribute("lang")).toBe("he");
  });
});

describe("a required message", () => {
  it("is full screen, has no close control, ignores Escape and always offers the store", () => {
    const { handlers, onShown, view } = setup({ presentation: "alert", required: true, dismissible: false, secondaryAction: undefined });
    expect(view.presentation).toBe("fullscreen");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    wrap(<FullscreenPresenter view={view} handlers={handlers} onShown={onShown} />);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(handlers.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/(apps\.apple|play\.google)\.com\//), "_blank", "noopener");
    expect(handlers.onPress).toHaveBeenCalledWith("primary");
    open.mockRestore();
  });

  it("shows the admin-only way out only when given one", () => {
    const { handlers, onShown, view } = setup({ required: true, dismissible: false });
    const onAdminHide = vi.fn();
    wrap(<FullscreenPresenter view={view} handlers={handlers} onShown={onShown} onAdminHide={onAdminHide} />);
    fireEvent.click(screen.getByRole("button", { name: /Admin only/ }));
    expect(onAdminHide).toHaveBeenCalled();
  });
});

describe("sheet and banner", () => {
  it("opens a web address in a new tab from a real link", () => {
    const { handlers, onShown, view } = setup({ presentation: "sheet", link: { url: "https://example.com/notes" } });
    wrap(<SheetPresenter view={view} handlers={handlers} onShown={onShown} />);
    const link = screen.getByRole("link", { name: /Learn more/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    fireEvent.click(link);
    expect(handlers.onPress).toHaveBeenCalledWith("link");
  });

  it("draws the banner as a labelled region that closes with Escape while focus is in it", () => {
    const { handlers, view } = setup({ presentation: "banner", tone: "warning" });
    wrap(<BannerPresenter view={view} handlers={handlers} edge="top" />);
    const region = screen.getByRole("region", { name: "Message from Pinch" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "Escape" });
    expect(handlers.onClose).toHaveBeenCalled();
    expect(region.className).toContain("bg-warning-soft");
  });
});

describe("InAppMessagePreview", () => {
  it("draws each way of showing inline and inert, in the chosen language", () => {
    for (const presentation of ["alert", "sheet", "banner", "fullscreen"] as const) {
      const { container, unmount } = wrap(<InAppMessagePreview message={message({ presentation })} language="he" />);
      const root = container.firstElementChild as HTMLElement;
      expect(root.hasAttribute("inert")).toBe(true);
      expect(root.getAttribute("data-presentation")).toBe(presentation);
      expect(screen.getByText("מכירים את המתכנן")).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
      unmount();
    }
  });
});

describe("webRoute", () => {
  it("drops mobile route groups", () => {
    expect(webRoute("/(tabs)/hub")).toBe("/hub");
    expect(webRoute("/(tabs)")).toBe("/");
    expect(webRoute("/recipe/abc")).toBe("/recipe/abc");
  });
});
