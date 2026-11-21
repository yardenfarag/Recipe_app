import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { signInWithPassword } from "./helpers";
import { writeAccountPrefs } from "./prefsSeed";
import { remixHandler, repairHandler, stubFunctions, swapHandler, translateHandler } from "./recipeActionsSeed";
import { TEST_USER } from "./testUser";

/**
 * The recipe page's actions (PIN-135). Every Edge Function is stubbed (e2e/recipeActionsSeed.ts): swap, remix,
 * translate and repair call paid models, and CI has no edge runtime. Saves go to local Supabase, so each test
 * reloads to check the change stuck.
 */

const PANCAKES: SeedRecipe = {
  title: "Fluffy Pancakes",
  servings: 2,
  calories: 800,
  estimated_time_minutes: 20,
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

async function openRecipe(page: Page, recipes: SeedRecipe[]) {
  const ids = await resetLibrary(recipes);
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
  await page.goto(`/app/recipe/${ids[0]}`);
  await expect(page.locator("#main h1")).toHaveText(recipes[0].title);
  return ids;
}

const ingredients = (page: Page) => page.getByRole("region", { name: "Ingredients" });
const steps = (page: Page) => page.getByRole("region", { name: /Instructions/ });
const actionBar = (page: Page) => page.getByRole("group", { name: /^Actions for / });

test("swap an ingredient: the steps follow, and it is saved", async ({ page }) => {
  const calls = await stubFunctions(page, {
    "suggest-substitution": swapHandler({ name: "oat milk", quantity: 0.5, unit: "cup", reason: "Creamy and mild." }, [
      { step: 1, text: "Whisk the flour and oat milk." },
      { step: 2, text: "Add the egg and cook on a hot pan." },
    ]),
  });
  await openRecipe(page, [PANCAKES]);
  await ingredients(page).getByRole("button", { name: "Swap milk" }).click();
  const dialog = page.getByRole("dialog", { name: "Swap ingredient" });
  await expect(dialog).toContainText("Creamy and mild.");
  await dialog.getByRole("button", { name: "Use oat milk instead" }).click();
  await expect(dialog).toBeHidden();
  await expect(ingredients(page)).toContainText("oat milk");
  await expect(steps(page)).toContainText("Whisk the flour and oat milk.");
  expect(calls.map((call) => call.body.mode)).toEqual(["suggest", "rewrite_instructions"]);

  await page.reload();
  await expect(ingredients(page)).toContainText("oat milk");
  await expect(steps(page)).toContainText("Add the egg and cook on a hot pan.");
});

test("a swap that can't be saved leaves the recipe as it was and says why", async ({ page }) => {
  await stubFunctions(page, {
    "suggest-substitution": swapHandler({ name: "oat milk", quantity: 0.5, unit: "cup", reason: "Creamy." }, []),
  });
  await openRecipe(page, [PANCAKES]);
  await page.route("**/rest/v1/recipes**", (route) =>
    route.request().method() === "PATCH" ? route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"down"}' }) : route.fallback(),
  );
  await ingredients(page).getByRole("button", { name: "Swap milk" }).click();
  const dialog = page.getByRole("dialog", { name: "Swap ingredient" });
  await dialog.getByRole("button", { name: "Use oat milk instead" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Couldn’t save the change");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(ingredients(page)).not.toContainText("oat milk");
});

test("remix to a style, then go back to the original", async ({ page }) => {
  const calls = await stubFunctions(page, {
    "transform-recipe": remixHandler({
      servings: 2,
      calories: 700,
      summary: "Swapped the milk and egg for plant-based ones.",
      ingredients: [
        { name: "flour", quantity: 1, unit: "cup" },
        { name: "soy milk", quantity: 0.5, unit: "cup" },
        { name: "flax egg", quantity: 1, unit: "" },
      ],
      instructions: [{ step: 1, text: "Whisk everything and cook." }],
    }),
  });
  await openRecipe(page, [PANCAKES]);
  await actionBar(page).getByRole("button", { name: "Remix" }).click();
  const sheet = page.getByRole("dialog", { name: "Remix this recipe" });
  await sheet.getByRole("button", { name: /^Vegan/ }).click();
  await expect(sheet).toContainText("Swapped the milk and egg for plant-based ones.");
  await sheet.getByRole("button", { name: "Use this version" }).click();
  await expect(sheet).toBeHidden();
  await expect(ingredients(page)).toContainText("soy milk");
  await expect(page.getByText("Vegan version")).toBeVisible();
  expect(calls[0].body).toMatchObject({ variant: "vegan", recipe_id: expect.any(String) });

  await page.getByRole("button", { name: "Revert to original" }).click();
  await expect(ingredients(page)).toContainText("egg");
  await expect(ingredients(page)).not.toContainText("soy milk");
  await page.reload();
  await expect(ingredients(page)).not.toContainText("soy milk");
});

test("a remix that fails says why and changes nothing", async ({ page }) => {
  await stubFunctions(page, {
    "transform-recipe": () => ({ status: 429, body: { status: "failed", code: "recipe_limit", message: "limit" } }),
  });
  await openRecipe(page, [PANCAKES]);
  await actionBar(page).getByRole("button", { name: "Remix" }).click();
  const sheet = page.getByRole("dialog", { name: "Remix this recipe" });
  await sheet.getByRole("button", { name: /^Keto/ }).click();
  await expect(sheet.getByRole("alert")).toContainText("You’ve used all 5 free remixes for this recipe.");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(ingredients(page)).toContainText("milk");
});

test("translate into Hebrew, then show the original again", async ({ page }) => {
  const calls = await stubFunctions(page, {
    "translate-recipe": translateHandler({
      title: "פנקייק אוורירי",
      ingredients: [
        { name: "קמח", quantity: 1, unit: "cup" },
        { name: "חלב", quantity: 0.5, unit: "cup" },
        { name: "ביצה", quantity: 1, unit: "" },
      ],
      instructions: [
        { step: 1, text: "טורפים את הקמח והחלב." },
        { step: 2, text: "מוסיפים ביצה ומטגנים." },
      ],
    }),
  });
  await openRecipe(page, [PANCAKES]);
  await actionBar(page).getByRole("button", { name: "Translate" }).click();
  await page.getByRole("dialog", { name: "Translate recipe" }).getByRole("button", { name: /^עברית/ }).click();
  await expect(page.locator("#main h1")).toHaveText("פנקייק אוורירי");
  await expect(ingredients(page).getByRole("list")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("Showing Hebrew")).toBeVisible();
  expect(calls).toHaveLength(1);

  await page.getByRole("button", { name: "Show original language" }).click();
  await expect(page.locator("#main h1")).toHaveText("Fluffy Pancakes");

  // The translation was saved, so picking it again doesn't call the model.
  await actionBar(page).getByRole("button", { name: "Translate" }).click();
  await page.getByRole("dialog", { name: "Translate recipe" }).getByRole("button", { name: /^עברית/ }).click();
  await expect(page.locator("#main h1")).toHaveText("פנקייק אוורירי");
  expect(calls).toHaveLength(1);
});

test("a recipe in another language opens translated into the app's, as on mobile, and only once", async ({ page }) => {
  const calls = await stubFunctions(page, {
    "translate-recipe": translateHandler({
      title: "Shakshuka",
      ingredients: [
        { name: "eggs", quantity: 4, unit: "" },
        { name: "olive oil", quantity: 2, unit: "tbsp" },
      ],
      instructions: [{ step: 1, text: "Heat the oil and add the eggs." }],
    }),
  });
  const [id] = await resetLibrary([
    {
      title: "שקשוקה",
      source_language: "he",
      servings: 2,
      original_url: "https://example.com/shakshuka-auto",
      ingredients: [
        { name: "ביצים", quantity: 4, unit: "" },
        { name: "שמן זית", quantity: 2, unit: "tbsp" },
      ],
      instructions: [{ step: 1, text: "מחממים שמן ומוסיפים את הביצים." }],
    },
  ]);
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();

  await page.goto(`/app/recipe/${id}`);
  await expect(page.locator("#main h1")).toHaveText("Shakshuka");
  await expect(steps(page)).toContainText("Heat the oil and add the eggs.");
  await expect(page.getByText("Showing English")).toBeVisible();
  expect(calls).toHaveLength(1);

  // Saved: opening it again shows the translation without asking the model.
  await page.reload();
  await expect(page.locator("#main h1")).toHaveText("Shakshuka");
  expect(calls).toHaveLength(1);

  await page.getByRole("button", { name: "Show original language" }).click();
  await expect(page.locator("#main h1")).toHaveText("שקשוקה");
});

test("repair a partial import: says what it found, and applies it", async ({ page }) => {
  await stubFunctions(page, {
    "repair-recipe": repairHandler(
      {
        title: "Fluffy Pancakes",
        servings: 2,
        extraction_status: "full",
        ingredients: PANCAKES.ingredients,
        instructions: [
          { step: 1, text: "Whisk the flour and milk." },
          { step: 2, text: "Rest the batter for 5 minutes." },
        ],
      },
      "Added a resting step.",
    ),
  });
  await openRecipe(page, [{ ...PANCAKES, extraction_status: "partial", instructions: [{ step: 1, text: "Whisk the flour and milk." }] }]);
  await page.getByRole("button", { name: "Repair recipe" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Apply repaired recipe?" });
  await expect(dialog).toContainText("Added a resting step.");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  await expect(steps(page)).toContainText("Rest the batter for 5 minutes.");
  await expect(page.getByText("The source skipped some details")).toBeHidden();
});

test("share copies the recipe's Pinch link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // No share sheet, so the link is copied (as on a desktop browser without one).
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await stubFunctions(page, { "recipe-share": () => ({ body: { status: "ok", token: "abc123" } }) });
  await openRecipe(page, [PANCAKES]);
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByText("Link copied to clipboard")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://pinch-app.io/s/abc123");
});

test("I cooked this, with a note for next time", async ({ page }) => {
  await stubFunctions(page, {});
  await openRecipe(page, [PANCAKES]);
  await actionBar(page).getByRole("button", { name: "I cooked this" }).click();
  const note = page.getByRole("dialog", { name: "A note for next time" });
  await note.getByRole("textbox").fill("less sugar");
  await note.getByRole("button", { name: "Save" }).click();
  await expect(note).toBeHidden();
  await expect(page.locator("#main header")).toContainText("less sugar");
  await page.reload();
  await expect(page.locator("#main header")).toContainText("less sugar");
  await expect(actionBar(page).getByRole("button", { name: "Cooked it again" })).toBeVisible();
});

test("edit tags and add to a collection", async ({ page }) => {
  await stubFunctions(page, {});
  await openRecipe(page, [PANCAKES]);
  await page.getByRole("button", { name: "Edit tags" }).click();
  const tags = page.getByRole("dialog", { name: "Edit tags" });
  await tags.getByLabel("Add a tag").fill("weekend");
  await tags.getByLabel("Add a tag").press("Enter");
  await tags.getByRole("button", { name: "Save" }).click();
  await expect(tags).toBeHidden();
  await expect(page.getByRole("list", { name: "Tags" })).toContainText(/weekend/i);

  await actionBar(page).getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Add to collection" }).click();
  const collection = page.getByRole("dialog", { name: "Add to collection" });
  await collection.getByLabel("New collection").fill("Sundays");
  await collection.getByRole("button", { name: "Create collection" }).click();
  await collection.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: "Open collection Sundays" })).toBeVisible();
});

test("add the ingredients to the shopping list", async ({ page }) => {
  await stubFunctions(page, {});
  await openRecipe(page, [PANCAKES]);
  await ingredients(page).getByRole("button", { name: "Add to list" }).click();
  const dialog = page.getByRole("dialog", { name: "Add to list" });
  await dialog.getByRole("button", { name: /^Add \d+ items?$/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/items? added/)).toBeVisible();
});

test("the More menu works from the keyboard, and Escape puts focus back", async ({ page }) => {
  await stubFunctions(page, {});
  await openRecipe(page, [PANCAKES]);
  const more = actionBar(page).getByRole("button", { name: "More options" });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(more).toBeFocused();

  await actionBar(page).getByRole("button", { name: "Translate" }).click();
  await expect(page.getByRole("dialog", { name: "Translate recipe" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(actionBar(page).getByRole("button", { name: "Translate" })).toBeFocused();
});

test.describe("phone, in Hebrew", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the actions fit the screen and read right to left", async ({ page }) => {
    await stubFunctions(page, {});
    await openRecipe(page, [PANCAKES]);
    await writeAccountPrefs({ locale: "he" });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("group", { name: /Fluffy Pancakes/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
