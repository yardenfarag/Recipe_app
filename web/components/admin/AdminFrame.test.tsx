import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/dashboard",
  useRouter: () => router,
}));

import { AdminFrame } from "./AdminFrame";

const historyLength = Object.getOwnPropertyDescriptor(window.history, "length") ?? Object.getOwnPropertyDescriptor(History.prototype, "length")!;

function setHistoryLength(length: number) {
  Object.defineProperty(window.history, "length", { configurable: true, get: () => length });
}

beforeEach(() => {
  router.back.mockReset();
  router.replace.mockReset();
});

afterEach(() => {
  Object.defineProperty(window.history, "length", historyLength);
});

describe("AdminFrame", () => {
  it("goes back to where the admin came from", () => {
    setHistoryLength(3);
    render(<AdminFrame>page</AdminFrame>);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(router.back).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("goes to Settings when the tab has no history", () => {
    setHistoryLength(1);
    render(<AdminFrame>page</AdminFrame>);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(router.replace).toHaveBeenCalledWith("/settings");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("keeps the row of admin pages next to Back, with the open one marked", () => {
    render(<AdminFrame>page</AdminFrame>);
    const current = screen.getByRole("link", { current: "page" });
    expect(current.getAttribute("href")).toBe("/admin/dashboard");
  });
});
