import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InvitePreview } from "@shared/types/household";

import { household } from "@/components/household/testHousehold";
import i18n from "@/lib/i18n";

const replace = vi.fn();
const apply = vi.fn();
const api = vi.hoisted(() => ({ previewHouseholdInvite: vi.fn(), acceptHouseholdInvite: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
let user: { id: string; email: string; user_metadata: Record<string, string> } | null = null;
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/join/tok_abcdefghijklmnop",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user, session: null, loading: false }) }));
vi.mock("@shared/lib/toast", () => ({ showToast: toast }));
vi.mock("@shared/lib/supabase/household", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/supabase/household")>()),
  ...api,
}));
vi.mock("@/lib/household/HouseholdProvider", () => ({ useHousehold: () => ({ apply }) }));

import { HouseholdError } from "@shared/lib/supabase/household";

import { JoinHousehold } from "./JoinHousehold";

const TOKEN = "tok_abcdefghijklmnop";

const preview = (over: Partial<InvitePreview> = {}): InvitePreview => ({
  status: "ok",
  householdName: "The Cohens",
  householdAvatar: "house:soup",
  invitedBy: { displayName: "Dana", avatarUrl: null },
  members: [],
  memberCount: 2,
  leaving: null,
  ...over,
});

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <JoinHousehold token={TOKEN} />
    </I18nextProvider>,
  );

beforeEach(() => {
  replace.mockReset();
  apply.mockReset();
  toast.mockReset();
  api.previewHouseholdInvite.mockReset();
  api.acceptHouseholdInvite.mockReset();
  user = null;
  search = "";
});

describe("Join page, signed out", () => {
  it("shows whose household it is, and signs up or in coming back to join", async () => {
    api.previewHouseholdInvite.mockResolvedValue(preview());
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Join The Cohens?" })).toBeDefined();
    expect(screen.getByText("Dana invited you")).toBeDefined();
    expect(screen.getByText("2 people")).toBeDefined();
    expect(screen.getByText(/The list is only for the people in the household/)).toBeDefined();
    const back = encodeURIComponent(`/join/${TOKEN}?join=1`);
    expect(screen.getByRole("link", { name: "Sign up to join" }).getAttribute("href")).toBe(`/auth?mode=signup&next=${back}&reason=join_household`);
    expect(screen.getByRole("link", { name: "I have an account" }).getAttribute("href")).toBe(`/auth?mode=signin&next=${back}&reason=join_household`);
    await waitFor(() => expect(document.title).toBe("Join The Cohens? · Pinch"));
  });

  it.each([
    ["expired", "This invite has expired"],
    ["full", "This household is full"],
    ["not_found", "This invite doesn't work"],
  ] as const)("explains a %s invite", async (status, title) => {
    api.previewHouseholdInvite.mockResolvedValue(preview({ status }));
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Join" })).toBeNull();
  });

  it("offers to try again when the invite can't be read", async () => {
    api.previewHouseholdInvite.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(preview());
    renderPage();
    expect(await screen.findByText("Couldn't open this invite.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Join The Cohens?" })).toBeDefined();
  });
});

describe("Join page, signed in", () => {
  beforeEach(() => {
    user = { id: "me", email: "avi.levi@example.com", user_metadata: {} };
  });

  it("joins with the name I give, says so, and opens the list", async () => {
    const joined = household({ name: "The Cohens" });
    api.previewHouseholdInvite.mockResolvedValue(preview());
    api.acceptHouseholdInvite.mockResolvedValue(joined);
    renderPage();
    const name = (await screen.findByLabelText("Your name")) as HTMLInputElement;
    expect(name.value).toBe("Avi");
    fireEvent.change(name, { target: { value: "Avi L" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join" })));
    expect(api.acceptHouseholdInvite).toHaveBeenCalledWith(TOKEN, "Avi L");
    expect(apply).toHaveBeenCalledWith(joined);
    expect(toast).toHaveBeenCalledWith("You're in The Cohens");
    expect(replace).toHaveBeenCalledWith("/list");
  });

  it("warns before leaving a household with other people in it", async () => {
    api.previewHouseholdInvite.mockResolvedValue(preview({ leaving: { name: "Flat 4", otherMembers: 2 } }));
    renderPage();
    expect(await screen.findByText("Joining means leaving Flat 4. Its list and pantry stay with the people there.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Leave and join" })).toBeDefined();
  });

  it("carries on joining by itself after signing in", async () => {
    search = "join=1";
    api.previewHouseholdInvite.mockResolvedValue(preview());
    api.acceptHouseholdInvite.mockResolvedValue(household());
    renderPage();
    await screen.findByLabelText("Your name");
    await act(async () => undefined);
    expect(api.acceptHouseholdInvite).toHaveBeenCalledWith(TOKEN, "Avi");
    expect(replace).toHaveBeenCalledWith("/list");
  });

  it("does not leave a shared household by itself after signing in", async () => {
    search = "join=1";
    api.previewHouseholdInvite.mockResolvedValue(preview({ leaving: { name: "Flat 4", otherMembers: 1 } }));
    renderPage();
    await screen.findByRole("button", { name: "Leave and join" });
    await act(async () => undefined);
    expect(api.acceptHouseholdInvite).not.toHaveBeenCalled();
  });

  it("says why joining failed", async () => {
    api.previewHouseholdInvite.mockResolvedValue(preview());
    api.acceptHouseholdInvite.mockRejectedValue(new HouseholdError("household_full"));
    renderPage();
    await screen.findByLabelText("Your name");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join" })));
    expect(screen.getByRole("alert").textContent).toContain("The household is full. It can have up to 8 people.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("opens the list when I'm already in it", async () => {
    api.previewHouseholdInvite.mockResolvedValue(preview({ status: "already_member" }));
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "You're already in The Cohens" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Open the list" }).getAttribute("href")).toBe("/list");
  });
});
