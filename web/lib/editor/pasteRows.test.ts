import { describe, expect, it } from "vitest";

import { parseIngredientLine, parseIngredientPaste, parseStepPaste } from "@/lib/editor/pasteRows";

describe("parseIngredientLine", () => {
  it.each([
    ["2 cups flour", { quantity: "2", unit: "cups", name: "flour" }],
    ["1 1/2 tsp salt", { quantity: "1 1/2", unit: "tsp", name: "salt" }],
    ["½ cup milk", { quantity: "½", unit: "cup", name: "milk" }],
    ["1½ tbsp. sugar", { quantity: "1½", unit: "tbsp", name: "sugar" }],
    ["200g butter", { quantity: "200", unit: "g", name: "butter" }],
    ["2-3 cloves garlic", { quantity: "2", unit: "cloves", name: "garlic" }],
    ["3 eggs", { quantity: "3", unit: "", name: "eggs" }],
    ["1 can of tomatoes", { quantity: "1", unit: "can", name: "tomatoes" }],
    ["2 כוסות קמח", { quantity: "2", unit: "כוסות", name: "קמח" }],
    ["Salt, to taste", { quantity: "", unit: "", name: "Salt, to taste" }],
    ["- 1,5 kg potatoes", { quantity: "1,5", unit: "kg", name: "potatoes" }],
  ])("%s", (line, expected) => {
    expect(parseIngredientLine(line)).toEqual(expected);
  });
});

describe("parseIngredientPaste", () => {
  it("makes one row per line, without bullets or blank lines", () => {
    expect(parseIngredientPaste("• 2 cups flour\n\n• 3 eggs\r\n* pinch of salt")).toEqual([
      { quantity: "2", unit: "cups", name: "flour" },
      { quantity: "3", unit: "", name: "eggs" },
      { quantity: "", unit: "", name: "pinch of salt" },
    ]);
  });

  it("leaves a single line to the field", () => {
    expect(parseIngredientPaste("2 cups flour")).toBeNull();
    expect(parseIngredientPaste("2 cups flour\n\n")).toBeNull();
  });
});

describe("parseStepPaste", () => {
  it("splits lines into steps and drops their numbers", () => {
    expect(parseStepPaste("1. Boil the water.\n2) Add the pasta.\nStep 3: Drain.")).toEqual([
      "Boil the water.",
      "Add the pasta.",
      "Drain.",
    ]);
  });

  it("keeps a paragraph together when steps are separated by blank lines", () => {
    expect(parseStepPaste("Heat the oil.\nAdd the onion.\n\nSimmer for 10 minutes.")).toEqual([
      "Heat the oil. Add the onion.",
      "Simmer for 10 minutes.",
    ]);
  });

  it("leaves a single step to the field", () => {
    expect(parseStepPaste("Bake for 20 minutes.")).toBeNull();
  });
});
