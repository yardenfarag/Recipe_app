import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { signInWithPassword } from "./helpers";
import { resetHub } from "./hubSeed";
import { readShoppingList, resetShoppingList, setPantryStaples } from "./listSeed";
import { readMealPlan, resetMealPlan } from "./planSeed";
import { TEST_USER } from "./testUser";

/** The meal plan (PIN-77): fill a week from the Library and the Hub, lock and swap meals, send the week to the list. */

const dish = (title: string, tags: string[], ingredients: string[], minutes = 25): SeedRecipe => ({
  title,
  tags,
  estimated_time_minutes: minutes,
  effort_level: "Easy",
  servings: 2,
  ingredients: ingredients.map((name) => ({ name, quantity: 1, unit: "" })),
  instructions: [{ step: 1, text: "Cook it." }],
});

const LIBRARY: SeedRecipe[] = [
  dish("Overnight oats", ["breakfast"], ["oats", "milk", "berries"], 5),
  dish("Banana pancakes", ["breakfast", "pancakes"], ["banana", "eggs", "oats"], 20),
  dish("Veggie omelette", ["breakfast"], ["eggs", "spinach", "feta"], 10),
  dish("Lentil soup", ["soup", "lunch"], ["red lentils", "carrots", "cumin"], 40),
  dish("Chickpea curry", ["dinner", "curry"], ["chickpeas", "spinach", "coconut milk"], 35),
  dish("Tomato pasta", ["dinner", "pasta"], ["spaghetti", "tomatoes", "basil"], 20),
  dish("Black bean tacos", ["dinner", "tacos"], ["black beans", "tortillas", "lime"], 25),
  dish("Mushroom risotto", ["dinner", "risotto"], ["arborio rice", "mushrooms", "parmesan"], 45),
  dish("Greek salad", ["salad", "lunch"], ["cucumber", "tomatoes", "feta", "olives"], 10),
];

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async () => {
  await resetLibrary(LIBRARY);
  await resetHub([
    { name: "Shakshuka", tags: ["breakfast", "eggs"], diets: ["vegetarian"], ingredients: ["eggs", "tomatoes", "paprika"] },
    { name: "Yogurt bowl", tags: ["breakfast"], diets: ["vegetarian"], ingredients: ["yogurt", "granola", "honey"] },
    { name: "Falafel bowls", tags: ["dinner"], diets: ["vegetarian", "vegan"], ingredients: ["chickpeas", "tahini", "cucumber"] },
    { name: "Squash soup", tags: ["soup", "lunch"], diets: ["vegetarian", "vegan"], ingredients: ["butternut squash", "onion", "stock"] },
  ]);
  await resetMealPlan();
  await resetShoppingList([]);
  await setPantryStaples([]);
});

test.afterEach(async () => {
  await resetTestUserLanguage();
  await resetMealPlan();
  await resetHub([]);
});

async function openPlan(page: Page) {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
  await page.goto("/app/plan");
  await expect(page.locator("#main h1")).toHaveText(/This week|Next week/);
}

const meals = (page: Page) => page.locator("#main article");

test("fills the week, with leftovers, and shows every planned meal", async ({ page }) => {
  await openPlan(page);
  await expect(page.getByText("Nothing planned yet")).toBeVisible();

  await page.locator('[data-track="plan.empty.plan"]').click();
  const dialog = page.getByRole("dialog", { name: "Plan my week" });
  await expect(dialog).toBeVisible();
  // Nine recipes is fewer than 14, so the Hub can't be turned off.
  await expect(dialog.getByRole("switch", { name: "Add recipes from the Hub" })).toBeDisabled();
  await dialog.locator('[data-track="plan.fill.fill"]').click();
  await expect(dialog).toBeHidden();

  const rows = await readMealPlan();
  expect(rows.length).toBeGreaterThan(3);
  expect(rows.some((row) => row.leftover_of != null)).toBe(true);
  await expect(meals(page)).toHaveCount(rows.length);
  // Breakfasts are breakfast recipes.
  const breakfasts = page.getByRole("article", { name: /^Breakfast: / });
  await expect(breakfasts.first()).toBeVisible();
});

test("locks a meal, swaps another for a different recipe, and keeps the plan after a reload", async ({ page }) => {
  await openPlan(page);
  await page.locator('[data-track="plan.empty.plan"]').click();
  await page.locator('[data-track="plan.fill.fill"]').click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const dinners = page.getByRole("article", { name: /^Dinner: / });
  const first = dinners.first();
  await first.getByRole("button", { name: /^Lock / }).click();
  await expect(first.getByRole("button", { name: /^Unlock / })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await readMealPlan()).filter((row) => row.locked).length).toBe(1);

  const second = dinners.nth(1);
  const before = await second.getAttribute("aria-label");
  await second.getByRole("button", { name: /^Another recipe instead of / }).click();
  await expect.poll(async () => page.getByRole("article", { name: /^Dinner: / }).nth(1).getAttribute("aria-label")).not.toBe(before);

  await page.reload();
  await expect(page.getByRole("article", { name: /^Dinner: / }).first().getByRole("button", { name: /^Unlock / })).toBeVisible();
});

test("sends what the week needs to the list, leaving out what is at home", async ({ page }) => {
  await setPantryStaples(["eggs", "spinach"]);
  await openPlan(page);
  await page.locator('[data-track="plan.empty.plan"]').click();
  await page.locator('[data-track="plan.fill.fill"]').click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.locator('[data-track="plan.open_send"]').click();
  const dialog = page.getByRole("dialog", { name: "Send to list" });
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-track="plan.send.add"]').click();
  await expect(dialog).toBeHidden();

  const list = await readShoppingList();
  expect(list.length).toBeGreaterThan(0);
  expect(list.some((item) => item.name === "eggs" || item.name === "spinach")).toBe(false);
});

test("adds a recipe to tonight's dinner from its page, and the Library shows it as tonight's", async ({ page }) => {
  const ids = await resetLibrary(LIBRARY);
  const risotto = ids[LIBRARY.findIndex((recipe) => recipe.title === "Mushroom risotto")];
  await openPlan(page);
  await page.goto(`/app/recipe/${risotto}`);
  await page.locator('[data-track="recipe.more"]').first().click();
  await page.locator('[data-track="recipe.add_to_plan"]').click();

  const dialog = page.getByRole("dialog", { name: "Add to plan" });
  await dialog.getByRole("row", { name: /^Today/ }).getByRole("button", { name: /Dinner: free$/ }).click();
  await dialog.locator('[data-track="plan.add.confirm"]').click();
  await expect(dialog).toBeHidden();

  const rows = await readMealPlan();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ meal: "dinner", recipe_id: risotto });

  await page.goto("/app");
  const tonight = page.getByTestId("tonights-pick");
  await expect(tonight).toContainText("Tonight, from your plan");
  await expect(tonight).toContainText("Mushroom risotto");
});
