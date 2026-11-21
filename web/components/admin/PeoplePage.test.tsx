import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminPerson } from "@shared/lib/supabase/adminPeople";

import i18n from "@/lib/i18n";

vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "me", email: "admin@example.com" } }) }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@shared/lib/toast", () => toast);

import { CreditGrantCard } from "./usage/CreditGrantCard";
import { PeoplePage } from "./PeoplePage";

const people: AdminPerson[] = [
  { id: "me", email: "admin@example.com", purchasedCredits: 0, isAdmin: true, plan: "free", joinedAt: "2026-01-01T00:00:00Z", freeExtractsUsed: 0 },
  { id: "u2", email: "cook@example.com", purchasedCredits: 3, isAdmin: false, plan: "free", joinedAt: "2026-11-01T00:00:00Z", freeExtractsUsed: 4 },
];

function renderPage(overrides: Partial<Parameters<typeof PeoplePage>[0]> = {}) {
  const props = {
    load: vi.fn().mockResolvedValue(people),
    adjust: vi.fn().mockResolvedValue(13),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(
    <I18nextProvider i18n={i18n}>
      <PeoplePage {...props} />
    </I18nextProvider>,
  );
  return props;
}

beforeEach(() => toast.showToast.mockReset());

describe("PeoplePage", () => {
  it("lists every account, marks admins and you, and offers no delete on your own", async () => {
    renderPage();
    const mine = (await screen.findByText("admin@example.com")).closest("tr")!;
    expect(within(mine).getByText("admin")).toBeDefined();
    expect(within(mine).getByText("you")).toBeDefined();
    expect(within(mine).queryByRole("button", { name: /Delete account/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete account, cook@example.com" })).toBeDefined();
    expect(screen.getByText("2 accounts. Purchased credits never expire. Free extracts reset monthly (10 each).")).toBeDefined();
  });

  it("grants credits to one account and shows the new balance", async () => {
    const { adjust } = renderPage();
    const input = await screen.findByLabelText("Credit amount, cook@example.com");
    const apply = screen.getByRole("button", { name: "Apply adjustment, cook@example.com" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "+10" } });
    fireEvent.click(apply);
    await waitFor(() => expect(adjust).toHaveBeenCalledWith("u2", 10));
    const row = screen.getByText("cook@example.com").closest("tr")!;
    await waitFor(() => expect(within(row).getByText("13")).toBeDefined());
    expect(toast.showToast).toHaveBeenCalledWith("cook@example.com now has 13 purchased credits.");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("says why a grant failed", async () => {
    renderPage({ adjust: vi.fn().mockRejectedValue(new Error("forbidden")) });
    fireEvent.change(await screen.findByLabelText("Credit amount, cook@example.com"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply adjustment, cook@example.com" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t update credits: forbidden");
  });

  it("asks before deleting an account, then takes it off the list", async () => {
    const { remove } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete account, cook@example.com" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this account?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("u2"));
    await waitFor(() => expect(screen.queryByText("cook@example.com")).toBeNull());
  });

  it("filters by email or id", async () => {
    renderPage();
    await screen.findByText("cook@example.com");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search email" }), { target: { value: "COOK" } });
    expect(screen.queryByText("admin@example.com")).toBeNull();
    expect(screen.getByText("cook@example.com")).toBeDefined();
  });
});

describe("CreditGrantCard", () => {
  it("grants credits by user id", async () => {
    const grant = vi.fn().mockResolvedValue(20);
    render(
      <I18nextProvider i18n={i18n}>
        <CreditGrantCard grant={grant} />
      </I18nextProvider>,
    );
    const apply = screen.getByRole("button", { name: "Apply adjustment" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("User ID"), { target: { value: " 12345678-aaaa-bbbb-cccc-1234567890ab " } });
    fireEvent.change(screen.getByLabelText("Credit amount"), { target: { value: "-5" } });
    fireEvent.click(apply);
    await waitFor(() => expect(grant).toHaveBeenCalledWith("12345678-aaaa-bbbb-cccc-1234567890ab", -5));
    expect(toast.showToast).toHaveBeenCalledWith("User 12345678 now has 20 purchased credits.");
  });
});
