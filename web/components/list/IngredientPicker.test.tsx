import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { IngredientPicker } from "@/components/list/IngredientPicker";
import i18n from "@/lib/i18n";
import { ingredientChoices, initialSelection, type IngredientChoice } from "@/lib/list/ingredientChoices";

const choices = ingredientChoices(
  [
    { name: "flour", quantity: 2, unit: "cup" },
    { name: "salt", quantity: 1, unit: "tsp" },
  ],
  { system: "original", unitLanguage: "en", recipeId: "r1" },
);

function Harness({ staples, onKeep }: { staples: string[]; onKeep: (choice: IngredientChoice) => void }) {
  const [selected, setSelected] = useState(() => initialSelection(choices, staples));
  return (
    <IngredientPicker
      sections={[{ id: "r1", title: "Bread", choices }]}
      selected={selected}
      onChange={setSelected}
      isStaple={(name) => staples.includes(name)}
      onKeepStaple={(choice) => {
        const next = new Set(selected);
        next.delete(choice.key);
        setSelected(next);
        onKeep(choice);
      }}
    />
  );
}

const renderPicker = (staples: string[] = [], onKeep = vi.fn()) => {
  render(
    <I18nextProvider i18n={i18n}>
      <Harness staples={staples} onKeep={onKeep} />
    </I18nextProvider>,
  );
  return onKeep;
};

describe("IngredientPicker", () => {
  it("starts with what is kept at home unticked, and says so", () => {
    renderPicker(["salt"]);
    expect(screen.getByRole("checkbox", { name: "flour, 2 cups" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: "salt, 1 tsp, In pantry" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("1 of 2 selected")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Bread" })).toBeDefined();
  });

  it("select all and deselect all", () => {
    renderPicker(["salt"]);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("2 of 2 selected")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByText("0 of 2 selected")).toBeDefined();
  });

  it("'I keep this' marks it as kept at home and unticks it", () => {
    const onKeep = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Keep flour in the pantry" }));
    expect(onKeep).toHaveBeenCalledWith(expect.objectContaining({ name: "flour" }));
    expect(screen.getByRole("checkbox", { name: "flour, 2 cups" }).getAttribute("aria-checked")).toBe("false");
  });
});
