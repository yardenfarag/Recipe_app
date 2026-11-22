import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CreditHealth } from "@shared/lib/creditHealth";

import i18n from "@/lib/i18n";

const usage = vi.hoisted(() => ({
  events: vi.fn(),
  failures: vi.fn(),
  purchases: vi.fn(),
  costRows: vi.fn(),
}));
vi.mock("@shared/lib/supabase/adminUsage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/supabase/adminUsage")>()),
  fetchAdminProductEvents: usage.events,
  fetchAdminFailures: usage.failures,
  fetchAdminPurchases: usage.purchases,
  fetchAdminCostRows: usage.costRows,
}));

import { InsightsPage, loadInsights } from "./InsightsPage";
import { UsagePage, type UsageData } from "./usage/UsagePage";

function wrap(node: ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

describe("Insights", () => {
  it("reads the range's events, failures and purchases and sums them as the mobile screen does", async () => {
    const now = new Date("2026-11-21T12:00:00Z");
    usage.events.mockResolvedValue([
      { name: "recipe_saved", properties: { from: "snap" }, created_at: "2026-11-20T10:00:00Z", user_id: "u1", guest_install_id: null, country: "IL" },
      { name: "paywall_viewed", properties: { trigger: "snap" }, created_at: "2026-11-20T11:00:00Z", user_id: null, guest_install_id: "g1", country: "US" },
    ]);
    usage.failures.mockResolvedValue([
      { action: "extract", status: "failed", platform: "tiktok", extraction_source: null, error_message: "Timed out", total_cost_usd: 0.25, created_at: "2026-11-20T10:00:00Z" },
      { action: "extract", status: "full", platform: "tiktok", extraction_source: "caption", error_message: null, total_cost_usd: 0.5, created_at: "2026-11-20T10:00:00Z" },
    ]);
    usage.purchases.mockResolvedValue([{ id: "p1", email: "a@b.co", provider: "polar", productId: "pinch_credits_25", credits: 25, createdAt: "2026-11-20T10:00:00Z" }]);

    const data = await loadInsights(14, now);
    expect(usage.events.mock.calls[0][0]).toBe(usage.failures.mock.calls[0][0]);
    expect(data.summary.events).toBe(2);
    expect(data.summary.signedInPeople).toBe(1);
    expect(data.summary.guestInstalls).toBe(1);
    expect(data.failures.failed).toBe(1);
    expect(data.costUsd).toBe(0.75);

    wrap(<InsightsPage load={async () => data} />);
    const events = (await screen.findByText("Events", { selector: "div" })).parentElement!;
    expect(within(events).getByText("2")).toBeDefined();
    expect(screen.getByText("$0.75")).toBeDefined();
    expect(within(screen.getByText("Credits sold").parentElement!).getByText("25")).toBeDefined();
  });
});

const health: CreditHealth = {
  generatedAt: "2026-11-21T12:00:00Z",
  purchases: { last24h: 1, last7d: 4, credits7d: 60, lastAt: "2026-11-21T10:00:00Z", byStore7d: [] },
  reservations: { stuck: 0, pendingCompensation: 0, refunded24h: 0 },
  webhook: { failures24h: 0, failures7d: 0, unresolved7d: 0, lastFailureAt: null, lastFailureReason: null },
  refundJob: { scheduled: true, lastRunAt: new Date().toISOString(), lastStatus: "succeeded", failedRuns24h: 0 },
  extraction: { count7d: 100, failed7d: 5, video7d: 20, p95CostUsd7d: 0.01 },
};

function usageData(overrides: Partial<UsageData> = {}): UsageData {
  return {
    events: [],
    ledger: [],
    tickets: [
      { id: "t1234567-aaaa", user_id: "u1", email: "cook@example.com", category: "billing", message: "I was charged twice", status: "open", created_at: "2026-11-20T10:00:00Z" },
    ],
    feedback: [],
    health,
    healthError: null,
    ...overrides,
  };
}

describe("Usage & support", () => {
  it("shows credit health, and closes a ticket", async () => {
    usage.costRows.mockResolvedValue({ rows: [], truncated: false });
    const closeTicket = vi.fn().mockResolvedValue(undefined);
    wrap(<UsagePage load={async () => usageData()} closeTicket={closeTicket} />);
    expect(await screen.findByText("All clear.")).toBeDefined();
    expect(screen.getByText("Support tickets (1 open)")).toBeDefined();
    expect(screen.getByText("I was charged twice")).toBeDefined();
    expect(await screen.findByText("No AI calls in this window.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Mark closed" }));
    await waitFor(() => expect(closeTicket).toHaveBeenCalledWith("t1234567-aaaa"));
    expect(await screen.findByText("Support tickets (0 open)")).toBeDefined();
  });

  it("keeps the page when only credit health fails", async () => {
    usage.costRows.mockResolvedValue({ rows: [], truncated: false });
    wrap(<UsagePage load={async () => usageData({ health: null, healthError: "forbidden" })} closeTicket={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toBe("forbidden");
    expect(screen.getByText("Support tickets (1 open)")).toBeDefined();
  });
});
