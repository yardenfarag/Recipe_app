import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Household } from "@shared/types/household";

import { household, member } from "@/components/household/testHousehold";
import { TooltipProvider } from "@/components/ui/Tooltip";
import i18n from "@/lib/i18n";

const api = vi.hoisted(() => ({ getHouseholdInvite: vi.fn(), renewHouseholdInvite: vi.fn(), stopHouseholdInvite: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
const patch = vi.fn();

vi.mock("@shared/lib/toast", () => ({ showToast: toast }));
vi.mock("@shared/lib/supabase/household", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/supabase/household")>()),
  ...api,
}));
vi.mock("@/lib/household/HouseholdProvider", () => ({ useHousehold: () => ({ patch }) }));

import { InviteDialog } from "./InviteDialog";

const TOKEN = "tok_abcdefghijklmnop";
const URL_FOR = (token: string) => `${window.location.origin}/app/join/${token}`;

function renderDialog(value: Household = household(), justCreated = false) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <InviteDialog open onOpenChange={vi.fn()} household={value} justCreated={justCreated} />
      </TooltipProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  toast.mockReset();
  patch.mockReset();
  api.getHouseholdInvite.mockResolvedValue({ token: TOKEN, expiresAt: "2099-12-03T12:00:00Z" });
});

describe("InviteDialog", () => {
  it("makes the link when there is none, then offers WhatsApp, copy and a QR code", async () => {
    renderDialog();
    expect(screen.getByText("Making your link…")).toBeDefined();
    const field = (await screen.findByLabelText("Invite link")) as HTMLInputElement;
    expect(field.value).toBe(URL_FOR(TOKEN));
    expect(patch).toHaveBeenCalled();
    const whatsapp = screen.getByRole("link", { name: "Send on WhatsApp" });
    expect(whatsapp.getAttribute("href")).toContain("https://wa.me/?text=");
    expect(decodeURIComponent(whatsapp.getAttribute("href")!)).toContain(URL_FOR(TOKEN));
    expect(decodeURIComponent(whatsapp.getAttribute("href")!)).toContain("Join The Cohens on Pinch");
    expect(screen.getByRole("img", { name: "Point their phone's camera at the code." })).toBeDefined();
    expect(screen.getByText(/The link works until/)).toBeDefined();
  });

  it("uses the live link it already has without making another", () => {
    renderDialog(household({ invite: { token: TOKEN, expiresAt: "2099-12-03T12:00:00Z" } }));
    expect((screen.getByLabelText("Invite link") as HTMLInputElement).value).toBe(URL_FOR(TOKEN));
    expect(api.getHouseholdInvite).not.toHaveBeenCalled();
  });

  it("copies the link and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDialog(household({ invite: { token: TOKEN, expiresAt: "2099-12-03T12:00:00Z" } }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy link" })));
    expect(writeText).toHaveBeenCalledWith(URL_FOR(TOKEN));
    expect(toast).toHaveBeenCalledWith("Link copied");
  });

  it("makes a new link after asking", async () => {
    api.renewHouseholdInvite.mockResolvedValue({ token: "tok_newnewnewnewnewnew", expiresAt: "2099-12-04T12:00:00Z" });
    renderDialog(household({ invite: { token: TOKEN, expiresAt: "2099-12-03T12:00:00Z" } }));
    fireEvent.click(screen.getByRole("button", { name: "Make a new link" }));
    const confirm = screen.getByRole("dialog", { name: "Make a new link?" });
    await act(async () => fireEvent.click(within(confirm).getByRole("button", { name: "Make a new link" })));
    expect(api.renewHouseholdInvite).toHaveBeenCalled();
    expect((screen.getByLabelText("Invite link") as HTMLInputElement).value).toBe(URL_FOR("tok_newnewnewnewnewnew"));
  });

  it("stops the link after asking, and offers to make one again", async () => {
    api.stopHouseholdInvite.mockResolvedValue(undefined);
    renderDialog(household({ invite: { token: TOKEN, expiresAt: "2099-12-03T12:00:00Z" } }));
    fireEvent.click(screen.getByRole("button", { name: "Stop this link" }));
    const confirm = screen.getByRole("dialog", { name: "Stop this link?" });
    await act(async () => fireEvent.click(within(confirm).getByRole("button", { name: "Stop the link" })));
    expect(api.stopHouseholdInvite).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("The link stopped working");
    expect(screen.getByText(/The old link doesn't work any more/)).toBeDefined();
    expect(screen.queryByLabelText("Invite link")).toBeNull();
  });

  it("says the household is full instead of making a link", () => {
    const eight = Array.from({ length: 8 }, (_, i) => member({ userId: `u${i}`, displayName: `P${i}`, isMe: i === 0 }));
    renderDialog(household({ members: eight }));
    expect(screen.getByText("The household is full. It can have up to 8 people.")).toBeDefined();
    expect(api.getHouseholdInvite).not.toHaveBeenCalled();
  });

  it("offers to try again when the link can't be made", async () => {
    api.getHouseholdInvite.mockRejectedValueOnce(new Error("offline"));
    renderDialog();
    expect(await screen.findByText("Couldn't make a link. Try again.")).toBeDefined();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(await screen.findByLabelText("Invite link")).toBeDefined();
  });

  it("says Later right after the household was made", async () => {
    renderDialog(household(), true);
    await screen.findByLabelText("Invite link");
    expect(screen.getByRole("button", { name: "Later" })).toBeDefined();
  });
});
