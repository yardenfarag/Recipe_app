import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Household } from "@shared/types/household";

import { avi, household, member, notSetUp } from "@/components/household/testHousehold";
import { TooltipProvider } from "@/components/ui/Tooltip";
import type { HouseholdContextValue } from "@/lib/household/HouseholdProvider";
import { HOUSEHOLD_SEEN_KEY } from "@/lib/household/localFlags";
import i18n from "@/lib/i18n";

const push = vi.fn();
const api = vi.hoisted(() => ({
  setUpHousehold: vi.fn(),
  updateHousehold: vi.fn(),
  setMyDisplayName: vi.fn(),
  removeHouseholdMember: vi.fn(),
  leaveHousehold: vi.fn(),
  getHouseholdInvite: vi.fn(),
  renewHouseholdInvite: vi.fn(),
  stopHouseholdInvite: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
let context: HouseholdContextValue;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "me", email: "dana.cohen@example.com", user_metadata: {} }, session: null, loading: false }),
}));
vi.mock("@shared/lib/toast", () => ({ showToast: toast }));
vi.mock("@shared/lib/supabase/household", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/supabase/household")>()),
  ...api,
}));
vi.mock("@/lib/household/HouseholdProvider", () => ({ useHousehold: () => context, useHouseholdLive: () => undefined }));

import { HouseholdSettings } from "./HouseholdSettings";

function setContext(value: Household | null, over: Partial<HouseholdContextValue> = {}) {
  context = {
    household: value,
    loading: false,
    failed: false,
    refresh: vi.fn().mockResolvedValue(value),
    apply: vi.fn(),
    patch: vi.fn(),
    onShared: () => () => undefined,
    ...over,
  };
}

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <HouseholdSettings />
      </TooltipProvider>
    </I18nextProvider>,
  );

beforeEach(() => {
  push.mockReset();
  toast.mockReset();
  for (const fn of Object.values(api)) fn.mockReset();
  api.getHouseholdInvite.mockResolvedValue({ token: "tok_abcdefghijklmnop", expiresAt: "2099-12-03T12:00:00Z" });
  window.localStorage.clear();
});

describe("Household settings, not set up", () => {
  it("explains what is shared, suggests my name from my email, and marks the page as seen", () => {
    setContext(notSetUp());
    renderPage();
    expect(screen.getByRole("heading", { name: "Set up your household" })).toBeDefined();
    expect(screen.getByText("The shopping list")).toBeDefined();
    expect(screen.getByText("Recipes and credits stay yours.")).toBeDefined();
    expect((screen.getByLabelText("Your name") as HTMLInputElement).value).toBe("Dana");
    expect(window.localStorage.getItem(HOUSEHOLD_SEEN_KEY)).toBe("1");
  });

  it("asks for a name before creating, and focuses the field", () => {
    setContext(notSetUp());
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Create household" }));
    expect(screen.getByText("Give your household a name.")).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText("Household name"));
    expect(api.setUpHousehold).not.toHaveBeenCalled();
  });

  it("asks for my name too", () => {
    setContext(notSetUp());
    renderPage();
    fireEvent.change(screen.getByLabelText("Household name"), { target: { value: "The Cohens" } });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create household" }));
    expect(screen.getByText("Add the name the others will see.")).toBeDefined();
    expect(api.setUpHousehold).not.toHaveBeenCalled();
  });

  it("creates it with the chosen picture and goes straight on to inviting", async () => {
    const created = household();
    api.setUpHousehold.mockResolvedValue(created);
    setContext(notSetUp());
    const view = renderPage();
    fireEvent.change(screen.getByLabelText("Household name"), { target: { value: " The Cohens " } });
    const pictures = screen.getByRole("radiogroup", { name: "Picture" });
    expect(within(pictures).getAllByRole("radio")).toHaveLength(12);
    fireEvent.click(within(pictures).getByRole("radio", { name: "Honey jar" }));
    expect(within(pictures).getByRole("radio", { name: "Honey jar" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Create household" }));

    await waitFor(() => expect(api.setUpHousehold).toHaveBeenCalledWith({ name: "The Cohens", avatar: "house:honey", displayName: "Dana" }));
    expect(context.apply).toHaveBeenCalledWith(created);
    expect(toast).toHaveBeenCalledWith("The Cohens is ready");
    // The page now has the household from the provider; the invite opens with "Later".
    setContext(created);
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <HouseholdSettings />
        </TooltipProvider>
      </I18nextProvider>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Invite the people you live with" });
    expect(within(dialog).getByRole("button", { name: "Later" })).toBeDefined();
  });

  it("says why creating failed and keeps what was typed", async () => {
    api.setUpHousehold.mockRejectedValue(new Error("network"));
    setContext(notSetUp());
    renderPage();
    fireEvent.change(screen.getByLabelText("Household name"), { target: { value: "The Cohens" } });
    fireEvent.click(screen.getByRole("button", { name: "Create household" }));
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText("Couldn't save. Try again.")).toBeDefined();
    expect((screen.getByLabelText("Household name") as HTMLInputElement).value).toBe("The Cohens");
  });
});

describe("Household settings, set up", () => {
  it("shows 'Only you so far' with Invite when alone, and no Leave", () => {
    setContext(household());
    renderPage();
    expect(screen.getByRole("heading", { name: "The Cohens" })).toBeDefined();
    expect(screen.getByText("Only you so far")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Leave household" })).toBeNull();
  });

  it("lists the people, marks me, and removes someone after asking", async () => {
    const after = household();
    api.removeHouseholdMember.mockResolvedValue(after);
    setContext(household({ members: [member(), avi] }));
    renderPage();
    expect(screen.getByText("You")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Remove Dana from the household" })).toBeNull();
    // Two buttons in the DOM: words on wider screens, an icon on phones (CSS picks one; jsdom shows both).
    const removeButtons = screen.getAllByRole("button", { name: "Remove Avi from the household" });
    expect(removeButtons).toHaveLength(2);
    expect(removeButtons[0].textContent).toContain("Remove");
    fireEvent.click(removeButtons[0]);
    const dialog = screen.getByRole("dialog", { name: "Remove Avi?" });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Remove" })));
    expect(context.patch).toHaveBeenCalled();
    expect(api.removeHouseholdMember).toHaveBeenCalledWith("u2");
    expect(context.apply).toHaveBeenCalledWith(after);
    expect(toast).toHaveBeenCalledWith("Avi was removed");
  });

  it("leaves after asking, when someone else lives here", async () => {
    api.leaveHousehold.mockResolvedValue(notSetUp());
    setContext(household({ members: [member(), avi] }));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Leave household" }));
    const dialog = screen.getByRole("dialog", { name: "Leave The Cohens?" });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Leave" })));
    expect(api.leaveHousehold).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("You left The Cohens");
  });

  it("saves my name only when it changed", async () => {
    api.setMyDisplayName.mockResolvedValue(household({ members: [member({ displayName: "Dani" })] }));
    setContext(household());
    renderPage();
    const save = screen.getAllByRole("button", { name: "Save" }).at(-1)!;
    expect(save.hasAttribute("disabled")).toBe(true);
    const field = screen.getAllByLabelText("Your name").at(-1)!;
    fireEvent.change(field, { target: { value: "Dani" } });
    await act(async () => fireEvent.click(save));
    expect(api.setMyDisplayName).toHaveBeenCalledWith("Dani");
    expect(toast).toHaveBeenCalledWith("Saved");
  });

  it("renames the household from Edit", async () => {
    api.updateHousehold.mockResolvedValue(household({ name: "Home" }));
    setContext(household());
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit household" });
    fireEvent.change(within(dialog).getByLabelText("Household name"), { target: { value: "Home" } });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Save" })));
    expect(api.updateHousehold).toHaveBeenCalledWith({ name: "Home", avatar: "house:teapot" });
  });

  it("shows a retry when the household couldn't be read", () => {
    setContext(null, { failed: true });
    renderPage();
    expect(screen.getByText("Couldn't load your household.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(context.refresh).toHaveBeenCalled();
  });
});

describe("Have an invite?", () => {
  it("rejects text that isn't an invite, and opens the join page for a pasted link", () => {
    setContext(household());
    renderPage();
    const field = screen.getByLabelText("Invite link");
    fireEvent.change(field, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("That doesn't look like an invite link.")).toBeDefined();
    fireEvent.change(field, { target: { value: "https://pinch-app.io/app/join/abcdefghijklmnop1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(push).toHaveBeenCalledWith("/join/abcdefghijklmnop1234");
  });
});
