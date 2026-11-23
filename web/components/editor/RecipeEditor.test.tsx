import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as editor from "@shared/lib/recipeEditor";
import type { SaveRecipeEditRequest } from "@shared/lib/supabase/saveRecipeEdit";
import type { Recipe } from "@shared/types/recipe";

import { RecipeEditor } from "@/components/editor/RecipeEditor";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { addEditorStrings } from "@/lib/editor/testStrings";
import i18n from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  saveRecipeEdit: vi.fn(),
  showToast: vi.fn(),
  compressImageFile: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, back: mocks.back }) }));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));
vi.mock("@shared/lib/supabase/saveRecipeEdit", () => ({ saveRecipeEdit: mocks.saveRecipeEdit }));
vi.mock("@shared/lib/toast", () => ({ showToast: mocks.showToast }));
vi.mock("@/lib/compressImage", () => ({ compressImageFile: mocks.compressImageFile }));

const SOUP = {
  id: "r1",
  user_id: "u1",
  created_at: "2026-11-01T00:00:00Z",
  title: "Carrot Soup",
  servings: 2,
  image_url: null,
  original_url: "https://www.example.com/soup",
  extraction_source: "description",
  calories: 300,
  estimated_time_minutes: 30,
  tags: ["soup"],
  ingredients: [
    { name: "carrot", quantity: 2, unit: "" },
    { name: "water", quantity: 1, unit: "l" },
    { name: "salt", quantity: 1, unit: "pinch" },
  ],
  instructions: [
    { step: 1, text: "Chop the carrots." },
    { step: 2, text: "Boil everything." },
  ],
} as unknown as Recipe;

beforeAll(() => {
  addEditorStrings();
  // jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
});

function renderEditor(recipe?: Recipe) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <RecipeEditor initial={editor.createEditorState(recipe)} />
      </TooltipProvider>
    </I18nextProvider>,
  );
}

const saved = (id = "new-1", fields: Partial<{ recalculating: string[]; recalculation: string }> = {}) => ({
  status: "saved",
  recipe: { id },
  recalculating: ["calories"],
  recalculation: "started",
  ...fields,
});

const field = (name: string | RegExp) => screen.getByRole("textbox", { name });
const typeInto = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });
const press = (element: HTMLElement, key: string, options: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(element, { key, ...options });
const lastRequest = () => mocks.saveRecipeEdit.mock.calls.at(-1)?.[0] as SaveRecipeEditRequest;
const saveButton = () => screen.getByRole("button", { name: "Save" });

function pasteText(target: HTMLElement, text: string) {
  fireEvent.paste(target, { clipboardData: { files: [], getData: (type: string) => (type === "text/plain" ? text : "") } });
}

// The whole form renders for each test, and typing a recipe out key by key is slow when every suite runs at once.
vi.setConfig({ testTimeout: 20_000 });

describe("RecipeEditor: writing a recipe", () => {
  it("can be filled in with the keyboard alone, and saves", async () => {
    mocks.saveRecipeEdit.mockResolvedValue(saved());
    renderEditor();
    const title = field("Title");
    expect(document.activeElement).toBe(title);
    typeInto(title, "Lemon Pasta");
    // Enter goes on to the first ingredient instead of submitting.
    press(title, "Enter");
    expect(document.activeElement).toBe(field("Amount, Ingredient 1"));

    typeInto(field("Amount, Ingredient 1"), "200");
    typeInto(field("Unit, Ingredient 1"), "g");
    typeInto(field("Ingredient 1"), "spaghetti");
    // Enter adds the next row and puts the caret in it.
    press(field("Ingredient 1"), "Enter");
    expect(document.activeElement).toBe(field("Amount, Ingredient 2"));
    typeInto(field("Ingredient 2"), "lemon");

    const step = field("Step 1");
    typeInto(step, "Boil the pasta.");
    press(step, "Enter");
    expect(document.activeElement).toBe(field("Step 2"));
    typeInto(field("Step 2"), "Add the lemon.");

    await act(async () => {
      fireEvent.click(saveButton());
    });
    const request = lastRequest();
    expect(request.mode).toBe("write");
    if (request.mode !== "write") return;
    expect(request.content.title).toBe("Lemon Pasta");
    expect(request.content.ingredients).toEqual([
      { name: "spaghetti", quantity: 200, unit: "g" },
      { name: "lemon", quantity: 0, unit: "" },
    ]);
    expect(request.content.instructions.map((s) => s.text)).toEqual(["Boil the pasta.", "Add the lemon."]);
    expect(mocks.replace).toHaveBeenCalledWith("/recipe/new-1");
    expect(mocks.showToast).toHaveBeenCalledWith("Saved. Pinch is updating the calories, time and cost.", "success");
  });

  it("says what's missing and goes to it instead of saving", async () => {
    renderEditor();
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(mocks.saveRecipeEdit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Some fields need a fix before you can save.");
    expect(document.activeElement).toBe(field("Title"));
    expect(screen.getByText("This is required.")).toBeDefined();
    expect(screen.getByText("Add at least one ingredient.")).toBeDefined();
  });

  it("turns a pasted list into one row per line", () => {
    renderEditor();
    pasteText(field("Ingredient 1"), "2 cups flour\n3 eggs\n1 tsp salt");
    expect((field("Ingredient 1") as HTMLInputElement).value).toBe("flour");
    expect((field("Unit, flour") as HTMLInputElement).value).toBe("cups");
    expect((field("Ingredient 3") as HTMLInputElement).value).toBe("salt");
    expect(document.activeElement).toBe(field("Ingredient 3"));

    pasteText(field("Step 1"), "1. Mix.\n2. Bake.");
    expect((field("Step 2") as HTMLTextAreaElement).value).toBe("Bake.");
  });

  it("Backspace in an empty row removes it", () => {
    renderEditor();
    press(field("Ingredient 1"), "Enter");
    expect(screen.getAllByRole("textbox", { name: /^Ingredient \d$/ })).toHaveLength(2);
    press(field("Amount, Ingredient 2"), "Backspace");
    expect(screen.getAllByRole("textbox", { name: /^Ingredient \d$/ })).toHaveLength(1);
    expect(document.activeElement).toBe(field("Ingredient 1"));
  });

  it("takes a pasted photo and sends it with the recipe", async () => {
    mocks.compressImageFile.mockResolvedValue({ base64: "QUJD", mimeType: "image/jpeg" });
    mocks.saveRecipeEdit.mockResolvedValue(saved());
    renderEditor();
    const photo = new File(["x"], "dish.png", { type: "image/png" });
    await act(async () => {
      const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
      event.clipboardData = { files: [photo], getData: () => "" };
      window.dispatchEvent(event);
    });
    expect(screen.getByRole("button", { name: "Replace photo" })).toBeDefined();

    typeInto(field("Title"), "Toast");
    typeInto(field("Ingredient 1"), "bread");
    typeInto(field("Step 1"), "Toast it.");
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(lastRequest().mode).toBe("write");
    const request = lastRequest() as Extract<SaveRecipeEditRequest, { mode: "write" }>;
    expect(request.content.photo).toEqual({ action: "replace", base64: "QUJD", mime_type: "image/jpeg" });
  });

  it("Ctrl+S saves from anywhere", async () => {
    mocks.saveRecipeEdit.mockResolvedValue(saved());
    renderEditor();
    typeInto(field("Title"), "Tea");
    typeInto(field("Ingredient 1"), "tea leaves");
    typeInto(field("Step 1"), "Steep.");
    await act(async () => {
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    });
    expect(mocks.saveRecipeEdit).toHaveBeenCalledTimes(1);
  });
});

describe("RecipeEditor: editing a recipe", () => {
  it("reorders with Alt+arrows from a field, and says where the row went", () => {
    renderEditor(SOUP);
    const water = field("Ingredient 2");
    water.focus();
    press(water, "ArrowUp", { altKey: true });
    const names = screen.getAllByRole("textbox", { name: /^Ingredient \d$/ }).map((input) => (input as HTMLInputElement).value);
    expect(names).toEqual(["water", "carrot", "salt"]);
    expect(document.activeElement).toBe(field("Ingredient 1"));
    expect(screen.getByText("water moved to position 1 of 3.")).toBeDefined();
  });

  it("reorders with the arrow keys on a grip", () => {
    renderEditor(SOUP);
    const steps = screen.getByRole("list", { name: "Steps" });
    press(within(steps).getByRole("button", { name: "Move Step 1" }), "ArrowDown");
    expect((field("Step 1") as HTMLTextAreaElement).value).toBe("Boil everything.");
    expect((field("Step 2") as HTMLTextAreaElement).value).toBe("Chop the carrots.");
  });

  it("sends where each step and ingredient came from", async () => {
    mocks.saveRecipeEdit.mockResolvedValue(saved("r1"));
    renderEditor(SOUP);
    const steps = screen.getByRole("list", { name: "Steps" });
    press(within(steps).getByRole("button", { name: "Move Step 2" }), "ArrowUp");
    await act(async () => {
      fireEvent.click(saveButton());
    });
    const request = lastRequest() as Extract<SaveRecipeEditRequest, { mode: "edit" }>;
    expect(request.mode).toBe("edit");
    expect(request.recipe_id).toBe("r1");
    expect(request.step_sources).toEqual([2, 1]);
    expect(request.ingredient_sources).toEqual([0, 1, 2]);
    expect(mocks.replace).toHaveBeenCalledWith("/recipe/r1");
  });

  it("suggests a photo first, and asks Pinch to draw one only when chosen (PIN-169)", async () => {
    mocks.saveRecipeEdit.mockResolvedValue(saved("r1", { recalculating: ["image"] }));
    renderEditor(SOUP);
    expect(screen.getByText("A photo of your own dish works best.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Let Pinch draw one" }));
    expect(screen.getByText("Pinch will draw a picture when you save.")).toBeDefined();
    // Changing their mind puts it back as it was.
    fireEvent.click(screen.getByRole("button", { name: "Don't draw" }));
    expect(screen.getByRole("button", { name: /Add photo/ })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Let Pinch draw one" }));
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect((lastRequest() as Extract<SaveRecipeEditRequest, { mode: "edit" }>).content.photo).toEqual({ action: "generate" });
  });

  it("marks a drawn picture and offers to draw it again", async () => {
    mocks.saveRecipeEdit.mockResolvedValue(saved("r1"));
    renderEditor({ ...SOUP, image_url: "https://example.com/ai/soup.jpg", image_generated: true } as Recipe);
    expect(screen.getByTestId("ai-image-mark")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Draw again" }));
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect((lastRequest() as Extract<SaveRecipeEditRequest, { mode: "edit" }>).content.photo).toEqual({ action: "generate" });
  });

  it("says Pinch is still drawing instead of offering another drawing", () => {
    renderEditor({ ...SOUP, recalc_pending: ["image"], recalc_started_at: new Date().toISOString() } as Recipe);
    expect(screen.getByText("Drawing a picture…")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Let Pinch draw one" })).toBeNull();
  });

  it("goes straight back to the recipe when nothing changed", async () => {
    renderEditor(SOUP);
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(mocks.saveRecipeEdit).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith("/recipe/r1");
  });

  it("marks a detail the cook typed as theirs, with a way back to Pinch's estimate", () => {
    renderEditor(SOUP);
    typeInto(field("Calories"), "450");
    const reset = screen.getByRole("button", { name: "Reset to Pinch's estimate: Calories" });
    expect(screen.getByText("Set by you")).toBeDefined();
    fireEvent.click(reset);
    expect((field("Calories") as HTMLInputElement).value).toBe("300");
  });

  it("puts the content check's reasons next to what they're about", async () => {
    mocks.saveRecipeEdit.mockResolvedValue({ status: "blocked", reasons: [{ field: "instructions", index: 1, code: "spam" }] });
    renderEditor(SOUP);
    typeInto(field("Step 2"), "Buy now at spam.example");
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(screen.getByRole("alert").textContent).toContain("Pinch can't save this yet");
    expect(screen.getByText("Remove links, ads or offensive words from step 2.")).toBeDefined();
    expect(document.activeElement).toBe(field("Step 2"));
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("keeps the changes and says so when saving fails", async () => {
    mocks.saveRecipeEdit.mockResolvedValue({ status: "failed", code: "network", message: "offline" });
    renderEditor(SOUP);
    typeInto(field("Title"), "Better Soup");
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(screen.getByRole("alert").textContent).toContain("Couldn't save your recipe");
    expect((field("Title") as HTMLInputElement).value).toBe("Better Soup");
  });

  it("Cancel asks before throwing changes away", async () => {
    renderEditor(SOUP);
    typeInto(field("Title"), "Better Soup");
    expect(screen.getByText("Unsaved changes")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Discard changes?")).toBeDefined();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.back).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Discard" }));
    // No page to go back to in this test, so it opens the recipe.
    expect(mocks.replace).toHaveBeenCalledWith("/recipe/r1");
  });

  it("Cancel leaves at once when nothing changed", () => {
    renderEditor(SOUP);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith("/recipe/r1");
  });

  it("adds and removes tags from the keyboard", () => {
    renderEditor(SOUP);
    const input = screen.getByRole("textbox", { name: "Tags" });
    typeInto(input, "dinner");
    press(input, "Enter");
    expect(screen.getByRole("button", { name: "Remove Dinner" })).toBeDefined();
    press(input, "Backspace");
    expect(screen.queryByRole("button", { name: "Remove Dinner" })).toBeNull();
  });
});
