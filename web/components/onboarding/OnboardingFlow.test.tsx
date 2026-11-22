import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_KITCHEN_PROFILE, type KitchenProfile } from "@shared/lib/kitchenProfile";

import i18n from "@/lib/i18n";
import { addOnboardingStrings } from "@/lib/onboarding/testStrings";
import { addSettingsStrings } from "@/components/settings/testStrings";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: nav.back }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const NEW_USER = { id: "u1", created_at: new Date().toISOString(), user_metadata: {} };
const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: auth.user, loading: false, session: null }) }));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({}) }));

const account = vi.hoisted(() => ({ fetch: vi.fn(), mark: vi.fn() }));
vi.mock("@shared/lib/supabase/onboarding", () => ({
  fetchOnboardingAccount: account.fetch,
  markAccountOnboarded: account.mark,
}));

const events = vi.hoisted(() => ({ heard: vi.fn(), completed: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ captureHeardAbout: events.heard, captureOnboardingCompleted: events.completed }));

const kitchen = vi.hoisted(() => ({
  state: { profile: null as KitchenProfile | null, loadFailed: false, status: "idle", save: vi.fn(), retry: vi.fn() },
}));
vi.mock("@/lib/settings/useKitchenSettings", () => ({ useKitchenSettings: () => kitchen.state }));

import { OnboardingFlow } from "./OnboardingFlow";

function renderFlow(search = "") {
  nav.search = search;
  return render(
    <I18nextProvider i18n={i18n}>
      <OnboardingFlow />
    </I18nextProvider>,
  );
}

describe("OnboardingFlow", () => {
  beforeAll(() => {
    addOnboardingStrings();
    addSettingsStrings();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    auth.user = NEW_USER;
    account.fetch.mockResolvedValue(NEW_USER);
    account.mark.mockResolvedValue(undefined);
    kitchen.state = { ...kitchen.state, profile: { ...EMPTY_KITCHEN_PROFILE }, loadFailed: false, status: "idle" };
  });

  it("goes straight on for an account that finished on another device", async () => {
    account.fetch.mockResolvedValue({ ...NEW_USER, user_metadata: { onboarded_at: new Date().toISOString() } });
    renderFlow("next=%2Fadd");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/add"));
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(window.localStorage.getItem("pinch:onboardingComplete")).toBe("true");
  });

  it("goes straight on for an account from before onboarding was kept on the account", async () => {
    account.fetch.mockResolvedValue({ ...NEW_USER, created_at: "2025-01-01T00:00:00.000Z" });
    renderFlow();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
  });

  it("uses the stored session's copy when the server can't be reached", async () => {
    account.fetch.mockRejectedValue(new Error("offline"));
    renderFlow();
    expect(await screen.findByRole("heading", { level: 1, name: "How do you usually cook?" })).toBeDefined();
    expect(window.localStorage.getItem("pinch:onboardingPending")).toBe("u1");
  });

  it("asks about diets, saving each one on the account, then moves on", async () => {
    renderFlow();
    await screen.findByRole("heading", { level: 1, name: "How do you usually cook?" });
    // Nothing picked: the way on says so.
    expect(screen.getByRole("button", { name: /I cook everything/ })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /^Vegetarian/ }));
    expect(kitchen.state.save).toHaveBeenCalledWith(expect.objectContaining({ diets: ["vegetarian"] }));
  });

  it("with a diet picked, the way on is Continue", async () => {
    kitchen.state = { ...kitchen.state, profile: { ...EMPTY_KITCHEN_PROFILE, diets: ["vegetarian"] } };
    renderFlow();
    fireEvent.click(await screen.findByRole("button", { name: /^Continue/ }));
    expect(nav.push).toHaveBeenCalledWith("/onboarding?step=avoid");
  });

  it("caps diets at four, like the phone and Settings", async () => {
    kitchen.state = { ...kitchen.state, profile: { ...EMPTY_KITCHEN_PROFILE, diets: ["vegan", "keto", "paleo", "low_carb"] } };
    renderFlow();
    await screen.findByText("You can pick up to 4.");
    expect(screen.getByRole("button", { name: /^Vegetarian/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /^Vegan/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("asks about allergies and dislikes with the Settings editor, and offers to adapt new imports once there is something", async () => {
    kitchen.state = { ...kitchen.state, profile: { ...EMPTY_KITCHEN_PROFILE, dislikes: ["Olives"] } };
    renderFlow("step=avoid");
    await screen.findByRole("heading", { level: 1, name: "Any allergies, or foods you don’t like?" });
    expect(screen.getByRole("heading", { level: 2, name: "Allergies" })).toBeDefined();
    fireEvent.click(screen.getByRole("switch", { name: "Always adapt new recipes for me" }));
    expect(kitchen.state.save).toHaveBeenCalledWith(expect.objectContaining({ autoApplyOnExtract: true }));
  });

  it("Back on a step opened directly goes to the one before", async () => {
    renderFlow("step=avoid&next=%2Flist");
    await screen.findByRole("heading", { level: 1, name: "Any allergies, or foods you don’t like?" });
    fireEvent.click(screen.getAllByRole("button", { name: "Back" })[0]);
    expect(nav.replace).toHaveBeenCalledWith("/onboarding?next=%2Flist");
  });

  it("one press on how they heard about Pinch answers and finishes", async () => {
    renderFlow("step=heard&next=%2Fadd");
    await screen.findByRole("heading", { level: 1, name: "How did you hear about Pinch?" });
    // The last step's own Skip replaces the top bar's.
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "A friend or family member" }));
    });
    expect(events.heard).toHaveBeenCalledWith({ source: "friend" });
    expect(events.completed).toHaveBeenCalledWith({ locale: "en" });
    expect(account.mark).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/add");
    expect(window.localStorage.getItem("pinch:onboardingComplete")).toBe("true");
    expect(window.localStorage.getItem("pinch:onboardingPending")).toBeNull();
  });

  it("Skip for now keeps what was answered and finishes, without a heard-about answer", async () => {
    renderFlow();
    await screen.findByRole("heading", { level: 1, name: "How do you usually cook?" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    });
    expect(events.heard).not.toHaveBeenCalled();
    expect(events.completed).toHaveBeenCalledWith({ locale: "en" });
    expect(account.mark).toHaveBeenCalledTimes(1);
    // Headed for the Library: the first-recipes picker comes first.
    expect(nav.replace).toHaveBeenCalledWith("/first-recipes");
  });

  it("still lets them on when the kitchen profile can't load", async () => {
    kitchen.state = { ...kitchen.state, profile: null, loadFailed: true };
    renderFlow();
    expect(await screen.findByText(/We couldn’t load your kitchen settings/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(kitchen.state.retry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /I cook everything/ }));
    expect(nav.push).toHaveBeenCalledWith("/onboarding?step=avoid");
  });
});
