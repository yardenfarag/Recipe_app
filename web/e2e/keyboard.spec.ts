import { expect, test, type Locator, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage } from "./admin";
import { readShoppingList, resetShoppingList } from "./listSeed";
import { importedRecipe, stubImports } from "./snapSeed";
import { TEST_USER } from "./testUser";

/**
 * The main path with the keyboard alone (PIN-146): sign in, import a recipe, open it, add it to the list. Only Tab,
 * typing and Enter; no clicks. The import is stubbed (snapSeed.ts): a real one spends credits.
 */

test.use({ viewport: { width: 1280, height: 900 } });

test.afterEach(async () => {
  await resetTestUserLanguage();
});

/** Presses Tab until `target` has focus, as a keyboard user would. */
async function tabTo(page: Page, target: Locator, limit = 80) {
  await target.waitFor();
  for (let presses = 0; presses < limit; presses++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`${limit} presses of Tab never reached ${target}`);
}

test("sign in, import a recipe, open it and add it to the list, with the keyboard only", async ({ page }) => {
  await resetLibrary([]);
  await resetShoppingList([]);
  await stubImports(page, {
    "extract-recipe": { body: { status: "full", platform: "web", recipe: importedRecipe("Keyboard lemon pasta", { original_url: "https://www.example-recipes.com/keyboard-pasta" }) } },
  });

  // Sign in.
  await page.goto("/app/auth?mode=signin&next=%2Fadd");
  await tabTo(page, page.getByLabel("Email"));
  await page.keyboard.type(TEST_USER.email);
  await tabTo(page, page.getByLabel("Password"));
  await page.keyboard.type(TEST_USER.password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Snap a recipe" })).toBeVisible();

  // Import a link. It is saved straight away and opens.
  await tabTo(page, page.getByLabel("Recipe URL"));
  await page.keyboard.type("https://www.example-recipes.com/keyboard-pasta");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/app\/recipe\/[0-9a-f-]+\?justSaved=1$/);
  await expect(page.locator("#main h1")).toHaveText("Keyboard lemon pasta");

  // Open it again from the Library.
  await tabTo(page, page.getByRole("link", { name: "Library" }).filter({ visible: true }).first());
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/app\/?$/);
  await tabTo(page, page.getByRole("link", { name: "Keyboard lemon pasta" }).first(), 120);
  await page.keyboard.press("Enter");
  await expect(page.locator("#main h1")).toHaveText("Keyboard lemon pasta");

  // Add its ingredients to the list.
  await tabTo(page, page.getByRole("button", { name: "Add the missing ones to my list" }));
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add to list" });
  await expect(dialog).toBeVisible();
  await tabTo(page, dialog.getByRole("button", { name: /^Add \d+ items?$/ }));
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await readShoppingList()).map((item) => item.name).sort()).toEqual(["lemon", "spaghetti"]);
});
