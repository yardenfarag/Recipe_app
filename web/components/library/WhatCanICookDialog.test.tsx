import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { PantryItem } from "@shared/types/pantry";
import type { Recipe } from "@shared/types/recipe";

import { WhatCanICookDialog } from "@/components/library/WhatCanICookDialog";
import i18n from "@/lib/i18n";

const pantry: PantryItem[] = [
  { id: "p1", name: "flour", nameEn: "flour", brand: "", place: "cupboard", aisle: "pantry", source: "manual", addedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
];

vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1" }, session: null, loading: false }) }));
vi.mock("@shared/lib/supabase/pantry", () => ({ fetchPantryItems: () => Promise.resolve(pantry) }));
vi.mock("@shared/lib/supabase/household", () => ({ fetchHousehold: () => Promise.resolve({ staples: [] }) }));
const sync = vi.hoisted(() => ({ addToShoppingList: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/list/shoppingListSync", () => sync);
vi.mock("@shared/lib/toast", () => ({ showToast: vi.fn() }));
// A cook who reads grams, and Metric.
vi.mock("@/lib/recipe/useMeasurementSystem", () => ({ useMeasurementSystem: () => ({ system: "metric", setSystem: vi.fn() }) }));
vi.mock("@/lib/recipe/useUnitSystem", () => ({ useUnitSystem: () => ({ units: "metric", choice: "metric", setUnits: vi.fn() }) }));

const recipe = {
  id: "r1",
  title: "Cheese bread",
  servings: 4,
  ingredients: [
    { name: "flour", quantity: 2, unit: "cup", metric: { quantity: 250, unit: "g" }, spoons: { quantity: 2, unit: "cup" } },
    { name: "cheddar", quantity: 8, unit: "oz", metric: { quantity: 227, unit: "g" }, spoons: { quantity: 8, unit: "oz" } },
  ],
  instructions: [],
} as unknown as Recipe;

describe("WhatCanICookDialog", () => {
  it("puts the missing ingredients on the list in the cook's measuring system", async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <WhatCanICookDialog open onOpenChange={vi.fn()} recipes={[recipe]} />
      </I18nextProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add missing to list" }));

    await vi.waitFor(() => expect(sync.addToShoppingList).toHaveBeenCalled());
    expect(sync.addToShoppingList).toHaveBeenCalledWith("u1", [{ name: "cheddar", quantity: 227, unit: "g", sourceRecipeId: "r1" }], "merge");
  });
});
