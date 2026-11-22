import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { ActivitySession } from "@shared/lib/supabase/adminActivity";

import i18n from "@/lib/i18n";

import { ActivityPage } from "./ActivityPage";

const session: ActivitySession = {
  sessionId: "s1",
  userId: "u1",
  email: "cook@example.com",
  guestInstallId: null,
  platform: "web",
  appVersion: "next-2026.11.21",
  startedAt: "2026-11-21T10:00:00Z",
  lastAt: "2026-11-21T10:12:00Z",
  screenCount: 4,
  tapCount: 9,
  authEvents: ["auth.login"],
};

describe("ActivityPage", () => {
  it("shows each session's platform and app version, and opens its timeline", async () => {
    const load = vi.fn().mockResolvedValue({ sessions: [session], top: [{ kind: "screen", name: "/settings", count: 3, people: 1 }] });
    const loadEvents = vi.fn().mockResolvedValue([
      { id: 1, kind: "screen", name: "/settings", screen: "/settings", properties: {}, occurredAt: "2026-11-21T10:00:00Z" },
    ]);
    render(
      <I18nextProvider i18n={i18n}>
        <ActivityPage load={load} loadEvents={loadEvents} />
      </I18nextProvider>,
    );
    expect(await screen.findByText("web next-2026.11.21")).toBeDefined();
    expect(load).toHaveBeenCalledWith(1, "");
    expect(screen.getByText("4 screens · 9 taps")).toBeDefined();
    expect(screen.getByText("login")).toBeDefined();
    expect(screen.getByText("3 · 1 person")).toBeDefined();

    const toggle = screen.getByRole("button", { expanded: false });
    fireEvent.click(toggle);
    await waitFor(() => expect(loadEvents).toHaveBeenCalledWith("s1"));
    expect(await screen.findByText("→ /settings")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(7, ""));
  });
});
