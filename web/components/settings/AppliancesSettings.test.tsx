import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { APPLIANCE_KEYS } from "@shared/lib/appliances";
import type { KitchenAppliances } from "@shared/lib/ownedAppliances";
import type { OwnedAppliancesSnapshot } from "@shared/lib/supabase/ownedAppliances";

import { AppliancesSettings } from "@/components/settings/AppliancesSettings";
import i18n from "@/lib/i18n";
import { addMyAppliancesStrings } from "@/lib/settings/ownedAppliancesTestStrings";

const store = vi.hoisted(() => ({
  snapshot: { userId: "u1", loaded: true, kitchen: null, status: "idle" } as OwnedAppliancesSnapshot,
  sync: { save: vi.fn(), clear: vi.fn(), refresh: vi.fn() },
}));
vi.mock("@/lib/settings/ownedAppliances", () => ({
  useOwnedAppliances: () => store.snapshot,
  ownedAppliances: () => store.sync,
}));

const wrap = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <AppliancesSettings />
    </I18nextProvider>,
  );

function savedList(owned: KitchenAppliances["owned"]) {
  store.snapshot = { ...store.snapshot, kitchen: { owned, notOwned: APPLIANCE_KEYS.filter((key) => !owned.includes(key)) } };
}

beforeAll(() => addMyAppliancesStrings());
afterEach(() => {
  store.snapshot = { userId: "u1", loaded: true, kitchen: null, status: "idle" };
  vi.clearAllMocks();
});

describe("AppliancesSettings", () => {
  it("starts with the basics ticked and says recipes don't check yet", () => {
    wrap();
    expect(screen.getByTestId("appliances-status").textContent).toContain("Not set up yet");
    expect(screen.getByRole("button", { name: /Oven/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Air fryer/ }).getAttribute("aria-pressed")).toBe("false");
    // Re-read the account: the phone may have changed the list.
    expect(store.sync.refresh).toHaveBeenCalledWith({ force: true });
  });

  it("saves the first tick with the basics, so the list is set", () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: /Air fryer/ }));
    expect(store.sync.save).toHaveBeenCalledWith(["stovetop", "oven", "microwave", "air_fryer"]);
  });

  it("lets a kitchen with nothing special say so", () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "I have none of these" }));
    expect(store.sync.save).toHaveBeenCalledWith(["stovetop", "oven", "microwave"]);
  });

  it("groups the appliances, with the basics last", () => {
    wrap();
    const groups = screen.getAllByRole("group").map((group) => group.getAttribute("aria-label"));
    expect(groups).toEqual(["Grill, fry & toast", "Slow & pressure cookers", "Blend & mix", "Tools & pans", "Special machines", "Basics"]);
    expect(within(screen.getByRole("group", { name: "Basics" })).getAllByRole("button")).toHaveLength(3);
  });

  it("shows each group's translated heading, not its key", () => {
    wrap();
    expect(screen.getByRole("heading", { name: "Grill, fry & toast" })).toBeDefined();
    expect(screen.queryByText(/myAppliances\.groups/i)).toBeNull();
  });

  it("reads the group labels from the real catalog, in Hebrew too", async () => {
    const { default: he } = await import("@shared/i18n/locales/he");
    const label = he["myAppliances.groups"].heat;
    i18n.addResourceBundle("he", "translation", he, true, true);
    await i18n.changeLanguage("he");
    try {
      wrap();
      expect(screen.getByRole("group", { name: label })).toBeDefined();
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it("shows a saved list, unticks, and can stop checking", async () => {
    savedList(["oven", "blender", "wok"]);
    wrap();
    expect(screen.getByTestId("appliances-status").textContent).toContain("2 appliances ticked");
    expect(screen.getByRole("button", { name: /^Stovetop/ }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /^Blender/ }));
    expect(store.sync.save).toHaveBeenCalledWith(["oven", "wok"]);

    fireEvent.click(screen.getByRole("button", { name: "Stop checking" }));
    const dialog = screen.getByRole("dialog", { name: "Stop checking your kitchen?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear my list" }));
    await vi.waitFor(() => expect(store.sync.clear).toHaveBeenCalledOnce());
  });
});
