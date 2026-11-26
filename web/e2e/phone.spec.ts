import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { signInWithPassword } from "./helpers";
import { resetShoppingList } from "./listSeed";
import { writeAccountPrefs } from "./prefsSeed";
import { TEST_USER } from "./testUser";

/** Night Market on phones (PIN-163): the bottom bar, and the Library's and the recipe page's own layouts. */

const picture = (hue: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="hsl(${hue} 70% 55%)"/></svg>`,
  )}`;

const SHAKSHUKA: SeedRecipe = {
  title: "Shakshuka",
  image_url: picture(12),
  servings: 4,
  calories: 1240,
  estimated_time_minutes: 25,
  effort_level: "Easy",
  cost_estimate: "$",
  tags: ["breakfast", "eggs"],
  original_url: "https://example.com/shakshuka",
  ingredients: [
    { name: "olive oil", quantity: 2, unit: "tbsp" },
    { name: "onion, diced", quantity: 1, unit: "" },
    { name: "red pepper, sliced", quantity: 1, unit: "" },
    { name: "garlic cloves", quantity: 3, unit: "" },
    { name: "smoked paprika", quantity: 1, unit: "tsp" },
    { name: "crushed tomatoes", quantity: 800, unit: "g" },
    { name: "eggs", quantity: 6, unit: "" },
    { name: "feta", quantity: 100, unit: "g" },
  ],
  instructions: [
    { step: 1, text: "Heat the oil in a wide pan. Soften the onion and pepper for 6 minutes." },
    { step: 2, text: "Stir in the garlic and paprika and cook for 1 minute." },
    { step: 3, text: "Pour in the tomatoes, season, and simmer for 10 minutes until thick." },
    { step: 4, text: "Make six wells, crack an egg into each, cover, and cook until the whites set." },
    { step: 5, text: "Crumble the feta over the top and bring the pan to the table with bread." },
  ],
  createdSecondsAgo: 1,
};

const LIBRARY: SeedRecipe[] = [
  SHAKSHUKA,
  { title: "Miso soup", estimated_time_minutes: 15, effort_level: "Easy", image_url: picture(100), platform: "tiktok", createdSecondsAgo: 2 },
  { title: "Slow-cooked beef ragu with pappardelle", estimated_time_minutes: 195, effort_level: "Medium", image_url: picture(0), createdSecondsAgo: 3 },
  { title: "Banana bread", estimated_time_minutes: 70, effort_level: "Easy", cookedDaysAgo: 2, createdSecondsAgo: 4 },
];

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.afterEach(async () => {
  await resetTestUserLanguage();
  await resetShoppingList();
});

async function signIn(page: Page, recipes: SeedRecipe[] = LIBRARY): Promise<string[]> {
  const ids = await resetLibrary(recipes);
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
  return ids;
}

/** How far the page can be scrolled sideways. Zero or less means nothing sticks out. */
const sidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** The controls smaller than 44 px in either direction, by their name, among what `selector` finds. */
const smallTargets = (page: Page, selector: string) =>
  page.evaluate((query) => {
    const small: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(query)) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (getComputedStyle(element).visibility === "hidden") continue;
      if (Math.min(box.width, box.height) < 43.5) {
        small.push(`${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40)} (${Math.round(box.width)}×${Math.round(box.height)})`);
      }
    }
    return small;
  }, selector);

// The only navigation landmark showing on a phone (the rail is hidden), whatever the app's language calls it.
// The Library has its own "My Library | Hub" tabs (a navigation too); the bar comes last on the page.
const bottomBar = (page: Page) => page.getByRole("navigation").filter({ visible: true }).last();

test("the bottom bar has the five sections, with a raised Snap button in the middle", async ({ page }) => {
  await signIn(page);
  const bar = bottomBar(page);
  await expect(bar.getByRole("link")).toHaveText(["Library", "Plan", "", "List", "Settings"]);
  const snap = bar.getByRole("link", { name: "Snap a recipe" });
  const [barBox, snapBox, planBox] = await Promise.all([bar.boundingBox(), snap.boundingBox(), bar.getByRole("link", { name: "Plan" }).boundingBox()]);
  // Raised: it starts above the bar's top edge. In the middle: its centre is the screen's.
  expect(snapBox!.y).toBeLessThan(barBox!.y);
  expect(Math.abs(snapBox!.x + snapBox!.width / 2 - 195)).toBeLessThan(2);
  expect(snapBox!.width).toBeGreaterThanOrEqual(56);
  expect(planBox!.height).toBeGreaterThanOrEqual(44);

  await snap.click();
  await expect(page).toHaveURL(/\/app\/add$/);
});

test("Library: the pick on top, the list and cooked tiles side by side, recipes in two columns", async ({ page }) => {
  await resetShoppingList([{ name: "crushed tomatoes" }, { name: "feta" }, { name: "parsley" }]);
  await signIn(page);

  const pick = page.getByTestId("tonights-pick");
  const pickBox = (await pick.boundingBox())!;
  expect(pickBox.width).toBeGreaterThan(350);
  await expect(pick.getByRole("link", { name: "Start cooking" })).toBeVisible();
  await expect(pick.getByRole("button", { name: "Show me another" })).toBeVisible();

  const [list, cooked] = await Promise.all([page.getByTestId("list-tile").boundingBox(), page.getByTestId("cooked-this-week").boundingBox()]);
  expect(Math.abs(list!.y - cooked!.y)).toBeLessThan(2);
  expect(list!.x + list!.width).toBeLessThanOrEqual(cooked!.x);
  expect(list!.y).toBeGreaterThan(pickBox.y + pickBox.height - 1);
  await expect(page.getByTestId("list-tile")).toContainText("crushed tomatoes, feta, +1 more");

  const cards = page.locator("#main article");
  await expect(cards).toHaveCount(4);
  const [first, second, third] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox(), cards.nth(2).boundingBox()]);
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
  expect(third!.y).toBeGreaterThan(first!.y + first!.height - 1);

  // The filter chips scroll sideways inside their row; the page itself never does.
  const chips = page.getByRole("group", { name: "Quick filters" });
  expect(await chips.evaluate((row) => row.scrollWidth > row.clientWidth)).toBe(true);
  for (const width of [320, 390, 600, 767]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await sidewaysScroll(page), `Library at ${width}px`).toBeLessThanOrEqual(0);
  }
});

test("Library: every control is big enough for a finger", async ({ page }) => {
  await signIn(page);
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  expect(
    await smallTargets(page, 'nav[aria-label="Main"] a, [data-testid="snap-bar"] button, [data-testid="tonights-pick"] :is(a, button), #main [role="group"] :is(a, button), #main [role="radio"], #main article button'),
  ).toEqual([]);
});

test("recipe: the photo with its buttons on it, tabs for ingredients and steps, and Start cooking fixed at the bottom", async ({ page }) => {
  const [id] = await signIn(page);
  await page.goto(`/app/recipe/${id}`);
  await expect(page.locator("#main h1")).toHaveText("Shakshuka");

  // No app bars here: the photo runs to the top of the screen, with the way back on it.
  await expect(bottomBar(page)).toHaveCount(0);
  const back = page.getByRole("link", { name: "Back to Library" }).filter({ visible: true });
  expect((await back.boundingBox())!.y).toBeLessThan(60);
  await expect(page.getByRole("button", { name: "Add Shakshuka to favorites" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "More options" }).filter({ visible: true })).toBeVisible();

  // Four facts in a row, cost as a tier.
  const facts = page.locator("#main header ul").first().locator("li");
  await expect(facts).toHaveCount(4);
  const boxes = await facts.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().y)));
  expect(new Set(boxes).size).toBe(1);
  await expect(page.locator("#main header")).toContainText("Budget");
  await expect(page.locator("#main header")).not.toContainText("$");

  // One of the two at a time.
  const ingredients = page.getByRole("region", { name: "Ingredients" });
  const steps = page.getByRole("region", { name: /Instructions/ });
  await expect(page.getByRole("tab", { name: "Ingredients" })).toHaveAttribute("aria-selected", "true");
  await expect(ingredients).toBeVisible();
  await expect(steps).toBeHidden();

  // The servings stepper sits beside the tabs and scales the amounts, eggs to whole ones (6 × 5/4 = 7½ → 8).
  await page.getByRole("button", { name: "Increase servings" }).click();
  await expect(ingredients).toContainText(/8\s*eggs/);

  await page.getByRole("tab", { name: "Steps" }).click();
  await expect(steps).toBeVisible();
  await expect(ingredients).toBeHidden();

  // Start cooking stays at the bottom, and the last step can be scrolled clear of it.
  const start = page.getByRole("button", { name: "Start cooking" }).filter({ visible: true });
  await expect(start).toHaveCount(1);
  const startBox = (await start.boundingBox())!;
  expect(startBox.y + startBox.height).toBeGreaterThan(844 - 40);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const lastStep = (await page.getByTestId("recipe-step-5").boundingBox())!;
  expect(lastStep.y + lastStep.height).toBeLessThanOrEqual((await start.boundingBox())!.y);

  // And the last ingredient too.
  await page.getByRole("tab", { name: "Ingredients" }).click();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const addToList = (await ingredients.getByRole("button", { name: "Add the missing ones to my list" }).boundingBox())!;
  expect(addToList.y + addToList.height).toBeLessThanOrEqual((await start.boundingBox())!.y);

  await start.click();
  await expect(page.getByTestId("cook-mode-step")).toContainText("Heat the oil");
  await page.keyboard.press("Escape");

  for (const width of [320, 390, 600, 767]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await sidewaysScroll(page), `recipe at ${width}px`).toBeLessThanOrEqual(0);
  }
});

test("recipe: every control is big enough for a finger", async ({ page }) => {
  const [id] = await signIn(page);
  await page.goto(`/app/recipe/${id}`);
  await expect(page.locator("#main h1")).toHaveText("Shakshuka");
  const controls =
    '#main header > div a, #main header > div button, #main [role="group"] :is(a, button), #main [role="tab"], #main section button, #main article > div.fixed :is(a, button)';
  expect(await smallTargets(page, controls)).toEqual([]);
  await page.getByRole("tab", { name: "Steps" }).click();
  expect(await smallTargets(page, controls)).toEqual([]);
});

test("in Hebrew the bottom bar and the swipe rows run right to left", async ({ page }) => {
  const [id] = await signIn(page);
  // The account's language wins over this browser's once loaded (PIN-154), so both are set.
  await writeAccountPrefs({ locale: "he" });
  await page.evaluate(() => localStorage.setItem("pinch:appLanguage", "he"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const bar = bottomBar(page);
  const links = bar.getByRole("link");
  const [firstLink, lastLink] = await Promise.all([links.first().boundingBox(), links.last().boundingBox()]);
  // The Library, first in reading order, is now at the right-hand end.
  expect(firstLink!.x).toBeGreaterThan(lastLink!.x);

  // The chips start from the right edge, and scrolling them moves leftwards.
  const chips = page.getByRole("group", { name: "סינון מהיר" });
  const firstChip = (await chips.getByRole("button").first().boundingBox())!;
  expect(firstChip.x + firstChip.width).toBeGreaterThan(390 - 24);
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);

  await page.goto(`/app/recipe/${id}`);
  await expect(page.locator("#main h1")).toBeVisible();
  const tools = page.getByRole("group", { name: /Shakshuka/ });
  const firstTool = (await tools.getByRole("button").first().boundingBox())!;
  expect(firstTool.x + firstTool.width).toBeGreaterThan(390 - 24);
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
});
