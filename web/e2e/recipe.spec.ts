import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { signInWithPassword } from "./helpers";
import { TEST_USER } from "./testUser";
import { writeAccountPrefs } from "./prefsSeed";

const PANCAKES: SeedRecipe = {
  title: "Fluffy Pancakes",
  servings: 2,
  calories: 800,
  estimated_time_minutes: 20,
  effort_level: "Easy",
  tags: ["breakfast"],
  original_url: "https://example.com/pancakes",
  ingredients: [
    { name: "flour", quantity: 1, unit: "cup", metric: { quantity: 120, unit: "g" }, spoons: { quantity: 1, unit: "cup" } },
    { name: "milk", quantity: 0.5, unit: "cup", metric: { quantity: 120, unit: "ml" }, spoons: { quantity: 0.5, unit: "cup" } },
    { name: "egg", quantity: 1, unit: "", spoons: { quantity: 1, unit: "" } },
  ],
  instructions: [
    { step: 1, text: "Whisk the flour and milk." },
    { step: 2, text: "Add the egg and cook on a hot pan." },
  ],
};

const SHAKSHUKA_HE: SeedRecipe = {
  title: "שקשוקה",
  source_language: "he",
  servings: 2,
  ingredients: [
    { name: "ביצים", quantity: 4, unit: "" },
    { name: "olive oil", quantity: 2, unit: "tbsp" },
  ],
  instructions: [{ step: 1, text: "מחממים שמן ומוסיפים את הביצים." }],
};

test.use({ viewport: { width: 1280, height: 900 } });

test.afterEach(async () => {
  await resetTestUserLanguage();
});

async function signIn(page: Page) {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
}

/** Seeds the recipes, signs in and opens the first one. */
async function openRecipe(page: Page, recipes: SeedRecipe[]) {
  const ids = await resetLibrary(recipes);
  await signIn(page);
  await page.goto(`/app/recipe/${ids[0]}`);
  await expect(page.locator("#main h1")).toHaveText(recipes[0].title);
  return ids;
}

const ingredients = (page: Page) => page.getByRole("region", { name: "Ingredients" });
const steps = (page: Page) => page.getByRole("region", { name: /Instructions/ });

test("opening a recipe from the Library shows its header, ingredients and steps", async ({ page }) => {
  await resetLibrary([PANCAKES]);
  await signIn(page);
  await page.getByRole("link", { name: "Fluffy Pancakes" }).click();
  await expect(page).toHaveURL(/\/app\/recipe\/[0-9a-f-]{36}$/);
  await expect(page.locator("#main h1")).toHaveText("Fluffy Pancakes");
  await expect(page).toHaveTitle("Fluffy Pancakes · Pinch");
  await expect(page.locator("#main")).toContainText("20 min");
  await expect(ingredients(page)).toContainText("flour");
  await expect(ingredients(page)).toContainText("1 cup");
  await expect(steps(page)).toContainText("Whisk the flour and milk.");
  await expect(page.getByRole("link", { name: /View the original/ })).toHaveAttribute("href", "https://example.com/pancakes");
});

test("changing servings rescales every amount and is remembered", async ({ page }) => {
  await openRecipe(page, [PANCAKES]);
  await page.getByRole("button", { name: "Increase servings" }).click();
  await page.getByRole("button", { name: "Increase servings" }).click();
  await expect(ingredients(page)).toContainText("4 servings");
  await expect(ingredients(page)).toContainText("2 cups");
  await expect(ingredients(page)).toContainText("1 cup");

  await page.reload();
  await expect(ingredients(page)).toContainText("4 servings");
  await expect(ingredients(page)).toContainText("2 cups");

  // Back to the recipe's own count.
  await page.getByRole("button", { name: "Decrease servings" }).click();
  await page.getByRole("button", { name: "Decrease servings" }).click();
  await expect(ingredients(page)).toContainText("2 servings");
});

test("grams shows the weights, and the choice carries to other recipes", async ({ page }) => {
  const ids = await openRecipe(page, [PANCAKES, { ...PANCAKES, title: "Second Pancakes", original_url: "https://example.com/pancakes-2", createdSecondsAgo: 9 }]);
  await ingredients(page).getByRole("radio", { name: "Grams" }).click();
  await expect(ingredients(page)).toContainText("120 g");
  await expect(ingredients(page)).toContainText("120 ml");

  await page.goto(`/app/recipe/${ids[1]}`);
  await expect(ingredients(page).getByRole("radio", { name: "Grams" })).toBeChecked();
  await expect(ingredients(page)).toContainText("120 g");
  await ingredients(page).getByRole("radio", { name: "Spoons" }).click();
});

test("the heart saves the favorite", async ({ page }) => {
  await openRecipe(page, [PANCAKES]);
  await page.getByRole("button", { name: "Add Fluffy Pancakes to favorites" }).click();
  await expect(page.getByRole("button", { name: "Remove Fluffy Pancakes from favorites" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove Fluffy Pancakes from favorites" })).toBeVisible();
});

test("a Hebrew recipe in the English app reads right to left, inside an English page", async ({ page }) => {
  await openRecipe(page, [SHAKSHUKA_HE]);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(ingredients(page).getByRole("list")).toHaveAttribute("dir", "rtl");
  await expect(steps(page).getByRole("list")).toHaveAttribute("dir", "rtl");
});

test("a saved translation shows in the app language", async ({ page }) => {
  await openRecipe(page, [
    {
      ...PANCAKES,
      translations: {
        he: {
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
        },
      },
    },
  ]);
  await writeAccountPrefs({ locale: "he" });
  await page.reload();
  await expect(page.locator("#main h1")).toHaveText("פנקייק אוורירי");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("region", { name: "מצרכים" })).toContainText("קמח");
  await writeAccountPrefs({ locale: "en" });
});

test("a recipe that doesn't exist says so", async ({ page }) => {
  await resetLibrary([]);
  await signIn(page);
  await page.goto("/app/recipe/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "Recipe not found." })).toBeVisible();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("ingredients come before the steps, and nothing runs off the side", async ({ page }) => {
    await openRecipe(page, [PANCAKES]);
    const ingredientsTop = (await ingredients(page).boundingBox())?.y ?? 0;
    const stepsTop = (await steps(page).boundingBox())?.y ?? 0;
    expect(stepsTop).toBeGreaterThan(ingredientsTop);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
