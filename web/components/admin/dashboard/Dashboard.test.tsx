import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";

import { dashboardOf } from "../testFixtures";

const mocks = vi.hoisted(() => ({ dashboard: vi.fn(), detail: vi.fn() }));
vi.mock("@shared/lib/supabase/adminDashboard", () => ({
  fetchAdminDashboard: mocks.dashboard,
  fetchAdminUserDetail: mocks.detail,
}));

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
  mocks.dashboard.mockResolvedValue(dashboardOf());
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

  it("says what went wrong when the database refuses", async () => {
    mocks.dashboard.mockRejectedValue(new Error("forbidden"));
    renderDashboard();
    expect((await screen.findByRole("alert")).textContent).toBe("forbidden");
  });
});
