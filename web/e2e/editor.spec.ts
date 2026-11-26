import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { stubSaveRecipeEdit } from "./editorSeed";
import { signInWithPassword } from "./helpers";
import { PHOTO_PNG } from "./snapSeed";
import { TEST_USER } from "./testUser";

// Edit recipe and Write a recipe (PIN-137). CI has no Edge Function runtime, so `save-recipe-edit` is answered by a
// stand-in that writes the content straight to local Supabase as the test account, the way the real function stores
// it (minus the content check and the background recalculation). The recipe page then reads what was saved.

const PANCAKES: SeedRecipe = {
  title: "Fluffy Pancakes",
  servings: 2,
  calories: 800,
  estimated_time_minutes: 20,
  effort_level: "Easy",
  tags: ["breakfast"],
  original_url: "https://example.com/pancakes",
  ingredients: [
    { name: "flour", quantity: 1, unit: "cup" },
    { name: "milk", quantity: 0.5, unit: "cup" },
    { name: "egg", quantity: 1, unit: "" },
  ],
  instructions: [
    { step: 1, text: "Whisk the flour and milk." },
    { step: 2, text: "Add the egg and cook on a hot pan." },
  ],
};

test.use({ viewport: { width: 1280, height: 900 } });

test.afterEach(async () => {
  await resetTestUserLanguage();
});

async function signIn(page: Page, next: string) {
  await page.goto(`/app/auth?mode=signin&next=${encodeURIComponent(next)}`);
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
}

const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const ingredientNames = (page: Page) =>
  page.getByRole("list", { name: "Ingredients" }).getByRole("textbox", { name: /^Ingredient \d+$/ });
const valuesOf = (page: Page) => ingredientNames(page).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

test("a recipe written from scratch with the keyboard alone saves and opens", async ({ page }) => {
  await resetLibrary([]);
  const calls = await stubSaveRecipeEdit(page);
  await signIn(page, "/recipe/edit");
  await expect(page.getByRole("heading", { level: 1, name: "Write a recipe" })).toBeVisible();
  await expect(page).toHaveTitle("Write a recipe · Pinch");

  // The title has focus; Enter moves on, and Enter in a row opens the next one.
  await page.keyboard.type("Lemon Pasta");
  await page.keyboard.press("Enter");
  await page.keyboard.type("200");
  await page.keyboard.press("Tab");
  await page.keyboard.type("g");
  await page.keyboard.press("Tab");
  await page.keyboard.type("spaghetti");
  await page.keyboard.press("Enter");
  await page.keyboard.type("1");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.type("lemon");
  await expect(ingredientNames(page)).toHaveCount(2);

  await field(page, "Step 1").fill("Boil the spaghetti.");
  await field(page, "Step 1").press("Enter");
  await expect(field(page, "Step 2")).toBeFocused();
  await page.keyboard.type("Toss with lemon.");

  await page.keyboard.press("Control+s");
  await expect(page).toHaveURL(/\/app\/recipe\/[0-9a-f-]{36}$/);
  await expect(page.locator("#main h1")).toHaveText("Lemon Pasta");
  await expect(page.getByRole("region", { name: "Ingredients" })).toContainText("spaghetti");
  await expect(page.getByRole("region", { name: /Instructions/ })).toContainText("Toss with lemon.");
  expect(calls).toHaveLength(1);
  expect(calls[0].mode).toBe("write");
});

test("an edit reorders by dragging and by keyboard, and the recipe shows it", async ({ page }) => {
  const [id] = await resetLibrary([PANCAKES]);
  const calls = await stubSaveRecipeEdit(page);
  await signIn(page, `/recipe/edit?id=${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Edit recipe" })).toBeVisible();
  await expect(field(page, "Title")).toHaveValue("Fluffy Pancakes");

  // Amounts: 1 cup → 2 cups of flour.
  await field(page, "Amount, flour").fill("2");

  // Keyboard: egg up to the top with Alt+↑ twice.
  await field(page, "Ingredient 3").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => valuesOf(page)).toEqual(["egg", "flour", "milk"]);
  await expect(page.getByText("egg moved to position 1 of 3.")).toBeAttached();

  // Mouse: drag step 2's grip above step 1.
  const steps = page.getByRole("list", { name: "Steps" });
  const grip = steps.getByRole("button", { name: "Move Step 2", exact: true });
  // Measured after hovering, which can scroll the page.
  await grip.hover();
  const target = await steps.getByRole("button", { name: "Move Step 1", exact: true }).boundingBox();
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y - 30, { steps: 12 });
  await page.mouse.up();
  await expect(field(page, "Step 1")).toHaveValue("Add the egg and cook on a hot pan.");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/recipe/${id}$`));
  const ingredients = page.getByRole("region", { name: "Ingredients" });
  await expect(ingredients).toContainText(/egg[\s\S]*flour[\s\S]*milk/);
  await expect(ingredients).toContainText("2 cups");
  await expect(page.getByRole("region", { name: /Instructions/ })).toContainText(/Add the egg[\s\S]*Whisk the flour/);
  expect(calls[0]).toMatchObject({ mode: "edit", recipe_id: id, step_sources: [2, 1], ingredient_sources: [2, 0, 1] });

  // Opening the editor again shows what was saved.
  await page.goto(`/app/recipe/edit?id=${id}`);
  await expect(field(page, "Title")).toHaveValue("Fluffy Pancakes");
  expect(await valuesOf(page)).toEqual(["egg", "flour", "milk"]);
});

test("the old /recipe/<id>/edit address opens the editor", async ({ page }) => {
  const [id] = await resetLibrary([PANCAKES]);
  await signIn(page, `/recipe/${id}/edit`);
  await expect(page).toHaveURL(new RegExp(`/app/recipe/edit\\?id=${id}$`));
  await expect(field(page, "Title")).toHaveValue("Fluffy Pancakes");
});

test("leaving with unsaved changes asks first: Cancel, a link, closing the tab", async ({ page }) => {
  const [id] = await resetLibrary([PANCAKES]);
  await stubSaveRecipeEdit(page);
  await signIn(page, `/recipe/edit?id=${id}`);
  await field(page, "Title").fill("Fluffier Pancakes");
  await expect(page.getByText("Unsaved changes")).toBeVisible();

  // Cancel → Keep editing keeps the change.
  await page.getByRole("button", { name: "Cancel" }).click();
  const dialog = page.getByRole("dialog", { name: "Discard changes?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(field(page, "Title")).toHaveValue("Fluffier Pancakes");

  // A link in the navigation is held back too; Discard follows it.
  await page.getByRole("navigation").getByRole("link", { name: "Plan" }).first().click();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/recipe\/edit/);
  await dialog.getByRole("button", { name: "Discard" }).click();
  await expect(page).toHaveURL(/\/app\/plan$/);

  // Closing the tab gets the browser's own question.
  // Typed for real: browsers only ask once the page has had a real key press or click.
  await page.goto(`/app/recipe/edit?id=${id}`);
  await field(page, "Title").click();
  await page.keyboard.type(" again");
  const asked = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const question = await asked;
  expect(question.type()).toBe("beforeunload");
  await question.dismiss();
});

test("a photo chosen from the computer is sent with the recipe", async ({ page }) => {
  const [id] = await resetLibrary([PANCAKES]);
  const calls = await stubSaveRecipeEdit(page);
  await signIn(page, `/recipe/edit?id=${id}`);
  await page.getByTestId("editor-photo-input").setInputFiles({ name: "pancakes.png", mimeType: "image/png", buffer: PHOTO_PNG });
  await expect(page.getByRole("button", { name: "Replace photo" })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/recipe/${id}$`));
  expect(calls[0].content?.photo).toMatchObject({ action: "replace", mime_type: "image/jpeg" });
});

test("a step the content check blocks says so next to it, and nothing is lost", async ({ page }) => {
  const [id] = await resetLibrary([PANCAKES]);
  await stubSaveRecipeEdit(page, { status: "blocked", reasons: [{ field: "instructions", index: 1, code: "spam" }] });
  await signIn(page, `/recipe/edit?id=${id}`);
  await field(page, "Step 2").fill("Buy pancakes at spam.example");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert").first()).toContainText("Pinch can't save this yet");
  await expect(page.getByText("Remove links, ads or offensive words from step 2.")).toBeVisible();
  await expect(field(page, "Step 2")).toBeFocused();
  await expect(field(page, "Step 2")).toHaveValue("Buy pancakes at spam.example");
});
