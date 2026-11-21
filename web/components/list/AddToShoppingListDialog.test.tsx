import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { AddToShoppingListDialog } from "@/components/list/AddToShoppingListDialog";
import { TooltipProvider } from "@/components/ui/Tooltip";
import i18n from "@/lib/i18n";

vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1" }, session: null, loading: false }) }));
vi.mock("@/lib/list/usePantryStaples", () => ({
  usePantryStaples: () => ({
    staples: ["salt"],
    isStaple: (name: string) => name === "salt",
    keepStaple: vi.fn().mockResolvedValue(undefined),
    dropStaple: vi.fn(),
  }),
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@shared/lib/toast", () => toast);

describe("AddToShoppingListDialog", () => {
  it("adds the ticked ingredients, in the chosen measuring system, and says what happened", async () => {
    const onAdd = vi.fn().mockResolvedValue({ items: [], alreadyOnList: ["flour"], addedCount: 1, mergedCount: 0 });
    const onOpenChange = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <AddToShoppingListDialog
            open
            onOpenChange={onOpenChange}
            recipeId="r1"
            recipeTitle="Pancakes"
            ingredients={[
              { name: "flour", quantity: 2, unit: "cup", metric: { quantity: 240, unit: "g" } },
              { name: "salt", quantity: 1, unit: "tsp" },
            ]}
            system="metric"
            unitLanguage="en"
            onAdd={onAdd}
          />
        </TooltipProvider>
      </I18nextProvider>,
    );

    expect(screen.getByRole("dialog", { name: "Add to list" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: /^salt/ }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Add 1 item" }));

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onAdd).toHaveBeenCalledWith([{ name: "flour", quantity: 240, unit: "g", sourceRecipeId: "r1" }]);
    expect(toast.showToast).toHaveBeenCalledWith("1 item added. flour was already on your list — kept as a separate line.");
  });
});
