import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { KitchenAppliances } from "@shared/lib/ownedAppliances";
import type { OwnedAppliancesSnapshot } from "@shared/lib/supabase/ownedAppliances";
import type { Instruction, Recipe } from "@shared/types/recipe";

import { fakeActions } from "@/components/recipe/actions/fakeActions";
import { RecipeActionsContext } from "@/components/recipe/actions/RecipeActionsContext";
import { RecipeAppliancesSection } from "@/components/recipe/RecipeAppliancesSection";
import type { RecipeDisplay } from "@/components/recipe/types";
import i18n from "@/lib/i18n";
import { addMyAppliancesStrings } from "@/lib/settings/ownedAppliancesTestStrings";

const owned = vi.hoisted(() => ({
  snapshot: { userId: null, loaded: true, kitchen: null, status: "idle" } as OwnedAppliancesSnapshot,
}));
vi.mock("@/lib/settings/ownedAppliances", () => ({ useOwnedAppliances: () => owned.snapshot }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** The signed-in reader's saved list: these ticked, every other appliance not owned. */
function signedInWith(kitchen: KitchenAppliances | null) {
  owned.snapshot = { userId: "u1", loaded: true, kitchen, status: "idle" };
}

function kitchenWith(ownedKeys: KitchenAppliances["owned"]): KitchenAppliances {
  return { owned: ownedKeys, notOwned: ALL.filter((key) => !ownedKeys.includes(key)) };
}

const ALL = [
  "stovetop", "oven", "microwave", "blender", "immersion_blender", "stand_mixer", "hand_mixer", "kitchen_thermometer", "wok",
] as KitchenAppliances["owned"];

const instructions: Instruction[] = [
  { step: 1, text: "Heat the oven to 180°C." },
  { step: 2, text: "Beat the butter and sugar in the stand mixer until pale." },
  { step: 3, text: "Bake for 25 minutes, until a thermometer reads 95°C." },
];

const appliances = [
  { key: "stand_mixer", required: true, steps: [2], origin: "source" },
  { key: "oven", required: true, steps: [1, 3], origin: "source" },
  { key: "kitchen_thermometer", required: false, benefit: "more_precise", steps: [3], origin: "tip" },
];

function displayOf(recipeAppliances: unknown, overrides: Partial<RecipeDisplay> = {}): RecipeDisplay {
  return {
    recipe: { id: "r1", title: "Cake", ingredients: [], instructions, servings: 8, appliances: recipeAppliances } as unknown as Recipe,
    title: "Cake",
    ingredients: [],
    instructions,
    contentLanguage: "en",
    translated: false,
    direction: "ltr",
    unitLanguage: "en",
    ...overrides,
  };
}

const wrap = (ui: React.ReactNode) => render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

beforeAll(() => addMyAppliancesStrings());
afterEach(() => {
  owned.snapshot = { userId: null, loaded: true, kitchen: null, status: "idle" };
});

describe("RecipeAppliancesSection", () => {
  it("shows what the recipe needs, then what makes it better", () => {
    wrap(<RecipeAppliancesSection display={displayOf(appliances)} system="original" />);
    expect(screen.getByRole("heading", { level: 2, name: "What you'll need" })).toBeDefined();
    const required = screen.getByTestId("appliances-required");
    expect(within(required).getByText("Stand mixer")).toBeDefined();
    expect(within(required).getByText("Oven")).toBeDefined();
    const better = screen.getByTestId("appliances-better");
    expect(within(better).getByText("Kitchen thermometer")).toBeDefined();
    expect(within(better).getByTestId("appliance-tip-kitchen_thermometer")).toBeDefined();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("opens the steps an appliance is used in", () => {
    wrap(<RecipeAppliancesSection display={displayOf(appliances)} system="original" />);
    fireEvent.click(screen.getByTestId("appliance-chip-oven"));
    const dialog = screen.getByRole("dialog", { name: "Oven" });
    expect(within(dialog).getByText("Used in steps 1, 3")).toBeDefined();
    // An English reader gets US units by default (PIN-53), as in the steps list.
    expect(within(dialog).getByTestId("appliance-step-1").textContent).toContain("Heat the oven to 350°F.");
    expect(within(dialog).getByTestId("appliance-step-3").textContent).toContain("Bake for 25 minutes");
    expect(within(dialog).queryByTestId("appliance-step-2")).toBeNull();
  });

  it("explains a Pinch tip and why it helps", () => {
    wrap(<RecipeAppliancesSection display={displayOf(appliances)} system="original" />);
    fireEvent.click(screen.getByTestId("appliance-chip-kitchen_thermometer"));
    const dialog = screen.getByRole("dialog", { name: "Kitchen thermometer" });
    expect(within(dialog).getByText(i18n.t("appliances.pinchTipExplainer"))).toBeDefined();
    expect(within(dialog).getByText(i18n.t("appliances.benefits.more_precise"))).toBeDefined();
    expect(within(dialog).getByText("Used in step 3")).toBeDefined();
  });

  it("shows the steps in the recipe's own direction", () => {
    wrap(<RecipeAppliancesSection display={displayOf(appliances, { direction: "rtl", contentLanguage: "he" })} system="original" />);
    fireEvent.click(screen.getByTestId("appliance-chip-stand_mixer"));
    expect(within(screen.getByRole("dialog")).getByRole("list").getAttribute("dir")).toBe("rtl");
  });

  it("never shows an appliance that points at no real step", () => {
    wrap(<RecipeAppliancesSection display={displayOf([...appliances, { key: "wok", required: true, steps: [9], origin: "source" }])} system="original" />);
    expect(screen.queryByText("Wok")).toBeNull();
  });

  it("shows nothing for a recipe that was never analysed", () => {
    const { container } = wrap(<RecipeAppliancesSection display={displayOf(null)} system="original" />);
    expect(container.innerHTML).toBe("");
  });

  it("says Updating… while Pinch works the appliances out again after a hand edit, as every other field does", () => {
    const display = displayOf(null);
    wrap(
      <RecipeActionsContext.Provider value={fakeActions(display, { updatingFields: ["appliances"] })}>
        <RecipeAppliancesSection display={display} system="original" />
      </RecipeActionsContext.Provider>,
    );
    expect(screen.getByTestId("appliances-updating").textContent).toContain(i18n.t("recipeEditor.updating"));
  });

  it("says so when the recipe needs no special equipment", () => {
    wrap(<RecipeAppliancesSection display={displayOf([])} system="original" />);
    expect(screen.getByText("No special equipment needed")).toBeDefined();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("RecipeAppliancesSection and My appliances", () => {
  it("marks nothing and warns about nothing before the reader saves a list", () => {
    signedInWith(null);
    wrap(<RecipeAppliancesSection display={displayOf(appliances)} system="original" />);
    expect(screen.queryByTestId("appliances-missing")).toBeNull();
    expect(screen.queryByTestId("appliances-ready")).toBeNull();
    expect(screen.getByTestId("appliance-chip-stand_mixer").getAttribute("data-fit")).toBeNull();
    // The recipe needs something special: one quiet line offers to set the list up.
    expect(screen.getByRole("link", { name: /Tell Pinch what's in your kitchen/ }).getAttribute("href")).toBe("/settings/recipe#appliances");
  });

  it("does not ask a guest, or about a recipe that only needs the basics", () => {
    wrap(<RecipeAppliancesSection display={displayOf(appliances)} system="original" />);
    expect(screen.queryByTestId("appliances-ask")).toBeNull();
    signedInWith(null);
    wrap(<RecipeAppliancesSection display={displayOf([{ key: "oven", required: true, steps: [1], origin: "source" }])} system="original" />);
    expect(screen.queryByTestId("appliances-ask")).toBeNull();
  });

  it("says which required appliance the kitchen is missing, and offers the fix on a saved recipe", () => {
    signedInWith(kitchenWith(["stovetop", "oven", "hand_mixer"]));
    const display = displayOf(appliances);
    const actions = fakeActions(display, { canFix: true });
    wrap(
      <RecipeActionsContext.Provider value={actions}>
        <RecipeAppliancesSection display={display} system="original" />
      </RecipeActionsContext.Provider>,
    );
    const mixer = screen.getByTestId("appliance-chip-stand_mixer");
    expect(mixer.getAttribute("data-fit")).toBe("missing");
    expect(mixer.getAttribute("aria-label")).toContain("Not in your kitchen");
    expect(screen.getByTestId("appliance-chip-oven").getAttribute("data-fit")).toBe("owned");
    const note = screen.getByTestId("appliances-missing");
    expect(within(note).getByText("Stand mixer")).toBeDefined();
    expect(within(note).getByRole("link", { name: "Edit my appliances" })).toBeDefined();
    fireEvent.click(within(note).getByRole("button", { name: "Make it without these" }));
    expect(actions.open).toHaveBeenCalledWith({ kind: "fix" });
    expect(screen.queryByTestId("appliances-ready")).toBeNull();
    expect(screen.queryByTestId("appliances-ask")).toBeNull();
  });

  it("never warns about an optional appliance or a tip", () => {
    signedInWith(kitchenWith(["stovetop", "oven", "stand_mixer"]));
    wrap(<RecipeAppliancesSection display={displayOf(appliances)} system="original" />);
    expect(screen.getByTestId("appliance-chip-kitchen_thermometer").getAttribute("data-fit")).toBe("missing");
    expect(screen.queryByTestId("appliances-missing")).toBeNull();
    expect(screen.getByTestId("appliances-ready").textContent).toBe("You have everything");
  });

  it("has no fix button where the recipe can't be changed (Hub, shared, preview)", () => {
    signedInWith(kitchenWith(["oven"]));
    wrap(<RecipeAppliancesSection display={displayOf(appliances)} system="original" />);
    const note = screen.getByTestId("appliances-missing");
    expect(within(note).queryByRole("button")).toBeNull();
    expect(within(note).getByText(/Save the recipe/)).toBeDefined();
  });

  it("says a stand-in the reader has works, instead of warning", () => {
    signedInWith(kitchenWith(["stovetop", "immersion_blender"]));
    wrap(
      <RecipeAppliancesSection
        display={displayOf([{ key: "blender", required: true, alternative: "immersion_blender", steps: [2], origin: "source" }])}
        system="original"
      />,
    );
    expect(screen.queryByTestId("appliances-missing")).toBeNull();
    expect(screen.getByTestId("appliances-covered").textContent).toContain("Stick blender works too");
    expect(screen.getByTestId("appliances-ready")).toBeDefined();
  });
});
