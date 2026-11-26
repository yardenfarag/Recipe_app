import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Household } from "@shared/types/household";

import { avi, household, member, noa, notSetUp } from "@/components/household/testHousehold";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { HOUSEHOLD_PROMO_DISMISSED_KEY } from "@/lib/household/localFlags";
import i18n from "@/lib/i18n";

const send = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
const patch = vi.fn();
const refresh = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@shared/lib/toast", () => ({ showToast: toast }));
vi.mock("@shared/lib/supabase/household", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/supabase/household")>()),
  sendGoingShopping: send,
}));
vi.mock("@/lib/household/HouseholdProvider", () => ({ useHousehold: () => ({ patch, refresh }) }));

import { HouseholdError } from "@shared/lib/supabase/household";

import { HouseholdStrip, ShopTogetherCard } from "./HouseholdStrip";

const wrap = (children: ReactNode) => (
  <I18nextProvider i18n={i18n}>
    <TooltipProvider>{children}</TooltipProvider>
  </I18nextProvider>
);

const shared = (over: Partial<Household> = {}) => household({ members: [member(), avi, noa], ...over });

beforeEach(() => {
  send.mockReset();
  toast.mockReset();
  patch.mockReset();
  refresh.mockReset();
  window.localStorage.clear();
});

describe("HouseholdStrip", () => {
  it("says who shares the list and links to the household", () => {
    render(wrap(<HouseholdStrip household={shared()} />));
    expect(screen.getByText("Shared with Avi and Noa")).toBeDefined();
    expect(screen.getByRole("link", { name: /The Cohens/ }).getAttribute("href")).toBe("/settings/household");
  });

  it("tells the others I'm going shopping", async () => {
    send.mockResolvedValue({ notified: 2, sentAt: "2026-11-26T10:00:00Z" });
    render(wrap(<HouseholdStrip household={shared()} />));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "I'm going shopping" })));
    expect(send).toHaveBeenCalled();
    expect(patch).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Told 2 people you're going shopping");
  });

  it("says when it can be sent again instead of the button, once sent", () => {
    const sentAt = new Date(Date.now() - 2 * 3600_000).toISOString();
    render(wrap(<HouseholdStrip household={shared({ goingShoppingSentAt: sentAt })} />));
    expect(screen.queryByRole("button", { name: "I'm going shopping" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Sent. You can send it again in 18 hours.");
  });

  it("brings the button back after 20 hours", () => {
    const sentAt = new Date(Date.now() - 21 * 3600_000).toISOString();
    render(wrap(<HouseholdStrip household={shared({ goingShoppingSentAt: sentAt })} />));
    expect(screen.getByRole("button", { name: "I'm going shopping" })).toBeDefined();
  });

  it("says it was already sent today, and reads the household again", async () => {
    send.mockRejectedValue(new HouseholdError("already_sent_today"));
    render(wrap(<HouseholdStrip household={shared()} />));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "I'm going shopping" })));
    expect(toast).toHaveBeenCalledWith("You already sent this today.", "info");
    expect(refresh).toHaveBeenCalled();
  });

  it("says when sending failed", async () => {
    send.mockRejectedValue(new HouseholdError("unknown"));
    render(wrap(<HouseholdStrip household={shared()} />));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "I'm going shopping" })));
    expect(toast).toHaveBeenCalledWith("Couldn't tell them. Try again.", "error");
  });
});

describe("ShopTogetherCard", () => {
  it("invites setting up a household, and 'Not now' hides it for good", () => {
    const view = render(wrap(<ShopTogetherCard household={notSetUp()} />));
    expect(screen.getByRole("heading", { name: "Shop together" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Set up a household" }).getAttribute("href")).toBe("/settings/household");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("heading", { name: "Shop together" })).toBeNull();
    expect(window.localStorage.getItem(HOUSEHOLD_PROMO_DISMISSED_KEY)).toBe("1");
    view.unmount();
    render(wrap(<ShopTogetherCard household={notSetUp()} />));
    expect(screen.queryByRole("heading", { name: "Shop together" })).toBeNull();
  });

  it("offers to invite people when the household is set up but nobody joined yet", () => {
    render(wrap(<ShopTogetherCard household={household()} />));
    expect(screen.getByRole("link", { name: "Invite people" })).toBeDefined();
  });

  it("is not shown once the list is shared", () => {
    render(wrap(<ShopTogetherCard household={shared()} />));
    expect(screen.queryByRole("heading", { name: "Shop together" })).toBeNull();
  });
});
