import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardInsights } from "@shared/lib/adminHints";

import i18n from "@/lib/i18n";

import { dashboardOf } from "../testFixtures";

const mocks = vi.hoisted(() => ({ dashboard: vi.fn(), insights: vi.fn(), detail: vi.fn() }));
vi.mock("@shared/lib/supabase/adminDashboard", () => ({
  fetchAdminDashboard: mocks.dashboard,
  fetchAdminDashboardInsights: mocks.insights,
  fetchAdminUserDetail: mocks.detail,
}));

const quietGate = { decisions: 0, confident: 0, low_confidence: 0, errors: 0, cost_usd: 0, routes: [] };
const quietTranslations = { calls: 0, ok: 0, failed: 0, cost_usd: 0, people: 0, languages: [] };

function insightsOf(): DashboardInsights {
  return {
    range: { days: 30, tz: "UTC", since: "", previous_since: "" },
    extract_by_platform: {
      current: [
        { platform: "instagram", attempts: 20, recipes: 13, failed: 7, video: 2, cost_usd: 0.4, p95_ms: 41000 },
        { platform: "tiktok", attempts: 30, recipes: 29, failed: 1, video: 3, cost_usd: 0.3, p95_ms: 12000 },
      ],
      previous: [],
    },
    gate: {
      current: {
        ...quietGate,
        decisions: 25,
        confident: 20,
        low_confidence: 5,
        cost_usd: 0.002,
        routes: [{ route: "full_recipe_in_text", extracts: 12, recipes: 11, video: 1, failed: 1, blocked: 0 }],
      },
      previous: quietGate,
    },
    translations: { current: { ...quietTranslations, calls: 4, ok: 4, people: 2, languages: [{ label: "he", count: 4 }] }, previous: quietTranslations },
    latency: [{ action: "extract", calls: 50, p50_ms: 9000, p95_ms: 41000 }],
  };
}

import { Dashboard } from "./Dashboard";

function renderDashboard() {
  return render(
    <I18nextProvider i18n={i18n}>
      <Dashboard />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.dashboard.mockReset();
  mocks.detail.mockReset();
  mocks.insights.mockReset();
  mocks.dashboard.mockResolvedValue(dashboardOf());
  mocks.insights.mockResolvedValue(insightsOf());
});

describe("Dashboard", () => {
  it("reads the last 30 days by default, without admin accounts, and shows the headline numbers", async () => {
    renderDashboard();
    expect(await screen.findByText("What happened in the last 30 days")).toBeDefined();
    expect(mocks.dashboard).toHaveBeenCalledWith(30, false);
    const signups = screen.getByText("New sign-ups", { selector: "div" }).parentElement!;
    expect(within(signups).getByText("24")).toBeDefined();
    expect(within(signups).getByText("512 accounts in total")).toBeDefined();
    expect(within(signups).getByText(/\+100% vs before/)).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeDefined();
    expect(screen.getByText(/days in Asia\/Jerusalem/)).toBeDefined();
  });

  it("reads again for a new range or with admin accounts, and remembers the choice", async () => {
    renderDashboard();
    await screen.findByText("What happened in the last 30 days");
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(mocks.dashboard).toHaveBeenLastCalledWith(7, false));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include admin accounts" }));
    await waitFor(() => expect(mocks.dashboard).toHaveBeenLastCalledWith(7, true));
    expect(JSON.parse(window.localStorage.getItem("pinch.adminDashboard")!)).toEqual({ days: 7, includeAdmins: true });
  });

  it("starts from the range saved in this browser", async () => {
    window.localStorage.setItem("pinch.adminDashboard", JSON.stringify({ days: 90, includeAdmins: true }));
    renderDashboard();
    await waitFor(() => expect(mocks.dashboard).toHaveBeenCalledWith(90, true));
    expect(screen.getByRole("button", { name: "90 days" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("switches tabs, and opens a person's details from the People table", async () => {
    mocks.detail.mockResolvedValue({
      profile: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "cook@example.com",
        created_at: "2026-11-10T10:00:00Z",
        is_admin: false,
        token_balance: 7,
        plan: "free",
        ai_cost_usd: 0.12,
        extractions: 3,
        failures: 1,
        free_extracts_this_month: 2,
      },
      recipes: [],
      ai_events: [],
      events: [],
      purchases: [],
      ledger: [],
    });
    renderDashboard();
    await screen.findByText("What happened in the last 30 days");
    const peopleTab = screen.getByRole("tab", { name: /People/ });
    // One person joined in the range, and the tab says so.
    expect(within(peopleTab).getByText("1")).toBeDefined();
    fireEvent.click(peopleTab);
    expect(peopleTab.getAttribute("aria-selected")).toBe("true");
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getByText("cook@example.com"));
    const sheet = await screen.findByRole("dialog");
    expect(mocks.detail).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(await within(sheet).findByText("Credit balance")).toBeDefined();
    expect(within(sheet).getByText("7")).toBeDefined();
  });

  it("shows hints that open the tab with the numbers behind them", async () => {
    renderDashboard();
    expect(await screen.findByText("Instagram imports fail 35% of the time")).toBeDefined();
    expect(mocks.insights).toHaveBeenCalledWith(30, false);
    const hint = screen.getByText("Instagram imports fail 35% of the time").closest("li")!;
    fireEvent.click(within(hint).getByRole("button", { name: /Failures/ }));
    expect(screen.getByRole("tab", { name: /Failures/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Failure rate by platform")).toBeDefined();
    expect(screen.getByText("How long AI features take")).toBeDefined();
  });

  it("shows the Jev gate and translations on the Costs tab", async () => {
    renderDashboard();
    await screen.findByText("What to look at next");
    fireEvent.click(screen.getByRole("tab", { name: /Costs/ }));
    expect(await screen.findByText("Jev extract gate")).toBeDefined();
    expect(screen.getByText("Recipe is in the text")).toBeDefined();
    expect(screen.getByText("Hebrew")).toBeDefined();
  });

  it("still shows the dashboard when the hint numbers fail to load", async () => {
    mocks.insights.mockRejectedValue(new Error("function admin_dashboard_insights does not exist"));
    renderDashboard();
    expect(await screen.findByText("What happened in the last 30 days")).toBeDefined();
    expect(await screen.findByText(/Some hints are missing/)).toBeDefined();
    fireEvent.click(screen.getByRole("tab", { name: /Failures/ }));
    expect(screen.queryByText("Failure rate by platform")).toBeNull();
  });

  it("says what went wrong when the database refuses", async () => {
    mocks.dashboard.mockRejectedValue(new Error("forbidden"));
    renderDashboard();
    expect((await screen.findByRole("alert")).textContent).toBe("forbidden");
  });
});
