import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage } from "./admin";
import { signInWithPassword } from "./helpers";
import { creditState, HUB_TITLE_PREFIX, hubTitles, resetHub, setKitchenDiets, type SeedCard } from "./hubSeed";
import { TEST_USER } from "./testUser";
import { writeAccountPrefs } from "./prefsSeed";

// Five cards with known sources, saves, tags, diets and ages. Popular order: Ramen, Pancakes, Salad, Curry, Tacos.
const FIVE: SeedCard[] = [
  { name: "Ramen", platform: "youtube", save_count: 9, tags: ["e2e-soup", "e2e-dinner"], createdSecondsAgo: 50 },
  { name: "Pancakes", platform: "web", save_count: 7, tags: ["e2e-breakfast"], createdSecondsAgo: 40 },
  { name: "Salad", platform: "instagram", save_count: 5, tags: ["e2e-dinner"], diets: ["vegan"], createdSecondsAgo: 10 },
  { name: "Curry", platform: "youtube", save_count: 3, tags: ["e2e-dinner"], diets: ["vegan", "gluten_free"], createdSecondsAgo: 20 },
  { name: "Tacos", platform: "tiktok", save_count: 1, tags: ["e2e-dinner"], createdSecondsAgo: 30 },
];

const titles = (names: string[]) => names.map((name) => `${HUB_TITLE_PREFIX} ${name}`);

test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async () => {
  await setKitchenDiets([]);
  await resetLibrary([]);
});

test.afterEach(async () => {
  await setKitchenDiets([]);
  await resetTestUserLanguage();
});

test.afterAll(async () => {
  await resetHub([]);
  await resetLibrary([]);
});

async function signIn(page: Page) {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
}

/** Seeds the Hub, signs in and opens it, searched down to the seeded cards. */
async function openHub(page: Page, cards: SeedCard[] = FIVE, query = `?q=${encodeURIComponent(HUB_TITLE_PREFIX)}`) {
  const seeded = await resetHub(cards);
  await signIn(page);
  await page.goto(`/app/hub${query}`);
  await expect(page.locator("#main h1")).toHaveText("Cooking Hub");
  return seeded;
}

const cardTitles = (page: Page) => page.locator("#main article h3");
const searchBox = (page: Page) => page.getByRole("searchbox", { name: "Search the Hub" });

test("search and filters give the same recipes, in the same order, as the mobile app's query", async ({ page }) => {
  await openHub(page);
  await expect(page).toHaveTitle("Hub · Pinch");
  await expect(cardTitles(page)).toHaveText(await hubTitles({ search: HUB_TITLE_PREFIX }));
  await expect(cardTitles(page)).toHaveText(titles(["Ramen", "Pancakes", "Salad", "Curry", "Tacos"]));
  await expect(page.locator("#main article").first()).toContainText("YouTube · 9 saves");

  // Source.
  await page.getByRole("radio", { name: "YouTube" }).click();
  await expect(page).toHaveURL(/source=youtube/);
  await expect(cardTitles(page)).toHaveText(await hubTitles({ search: HUB_TITLE_PREFIX, platform: "youtube" }));
  await expect(cardTitles(page)).toHaveText(titles(["Ramen", "Curry"]));

  // Sort, moved with the keyboard.
  await page.getByRole("radio", { name: "All" }).click();
  await page.getByRole("radio", { name: "Popular" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Newest" })).toBeChecked();
  await expect(page).toHaveURL(/sort=newest/);
  await expect(cardTitles(page)).toHaveText(await hubTitles({ search: HUB_TITLE_PREFIX, sort: "newest" }));
  await expect(cardTitles(page)).toHaveText(titles(["Salad", "Curry", "Tacos", "Pancakes", "Ramen"]));

  // Tags (from the address: the popular-tag chips depend on every card in the database).
  await page.goto(`/app/hub?q=${encodeURIComponent(HUB_TITLE_PREFIX)}&tag=e2e-soup,e2e-breakfast`);
  await expect(page.getByRole("button", { name: /^e2e-soup$/i })).toHaveAttribute("aria-pressed", "true");
  await expect(cardTitles(page)).toHaveText(await hubTitles({ search: HUB_TITLE_PREFIX, tags: ["e2e-soup", "e2e-breakfast"] }));
  await expect(cardTitles(page)).toHaveText(titles(["Ramen", "Pancakes"]));
  await page.getByRole("button", { name: /^e2e-soup$/i }).click();
  await expect(cardTitles(page)).toHaveText(titles(["Pancakes"]));
  await expect(page).toHaveURL(/tag=e2e-breakfast$/);
});

test("recipes that fit your diets come first", async ({ page }) => {
  await setKitchenDiets(["vegan", "gluten_free"]);
  await openHub(page);
  await expect(cardTitles(page)).toHaveText(await hubTitles({ search: HUB_TITLE_PREFIX, diets: ["gluten_free", "vegan"] }));
  // Curry fits both diets, Salad one, then the rest by popularity.
  await expect(cardTitles(page)).toHaveText(titles(["Curry", "Salad", "Ramen", "Pancakes", "Tacos"]));
  await expect(page.locator("#main")).toContainText("Vegan");
});

test("recipes with your allergies come last and ones with foods you don't like lower, with a flag (PIN-180)", async ({ page }) => {
  await setKitchenDiets(["halal"], { allergies: ["peanuts"], dislikes: ["Onion"] });
  await openHub(page, [
    { name: "Satay", save_count: 9, ingredients: ["chicken", "peanut butter"], contains: ["peanuts"], diets: ["halal"] },
    { name: "Onion soup", save_count: 7, ingredients: ["onion", "stock"], contains: ["onion"], diets: ["halal"] },
    { name: "Rice bowl", save_count: 5, ingredients: ["rice", "egg"], contains: ["eggs"], diets: ["halal"] },
    { name: "Pork buns", save_count: 3, ingredients: ["pork", "flour"], contains: ["pork", "gluten"] },
  ]);
  await expect(cardTitles(page)).toHaveText(
    await hubTitles({ search: HUB_TITLE_PREFIX, diets: ["halal"], allergens: ["peanuts"], dislikes: ["onion"] }),
  );
  // Halal first, a disliked food lower among them, the peanut recipe last although it is halal and the most saved.
  await expect(cardTitles(page)).toHaveText(titles(["Rice bowl", "Onion soup", "Pork buns", "Satay"]));
  await expect(page.locator("#main article").last()).toContainText("Has ingredients from your allergies: Peanuts");
  await expect(page.locator("#main article").nth(1)).toContainText("Has foods you don’t like: Onion");
  await expect(page.locator("#main")).toContainText("Recipes with your allergies come last.");
  await expect(page.locator("#main")).toContainText("Halal");
});

test("'/' jumps to the search, Escape clears it, and no matches says so", async ({ page }) => {
  await openHub(page, FIVE, "");
  await page.locator("#main h1").click();
  await page.keyboard.press("/");
  await expect(searchBox(page)).toBeFocused();

  await page.keyboard.type(`${HUB_TITLE_PREFIX} no such recipe`);
  await expect(page.getByRole("heading", { name: "No recipes match" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(searchBox(page)).toHaveValue("");
  await expect(page.getByRole("heading", { name: "No recipes match" })).toHaveCount(0);

  await searchBox(page).fill("Ramen");
  await searchBox(page).press("Escape");
  await expect(searchBox(page)).toHaveValue("");
});

test("adding a Hub recipe puts it in the library, free, and then it opens from there", async ({ page }) => {
  await openHub(page);
  const before = await creditState();

  await page.getByRole("link", { name: `${HUB_TITLE_PREFIX} Pancakes` }).click();
  await expect(page).toHaveURL(/\/app\/hub\/[0-9a-f-]{36}$/);
  const hubUrl = page.url();
  await expect(page.locator("#main h1")).toHaveText(`${HUB_TITLE_PREFIX} Pancakes`);
  await expect(page.getByRole("region", { name: "Ingredients" })).toContainText("flour");
  // Read-only: no heart.
  await expect(page.getByRole("button", { name: /favorites/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Add to Library" }).click();
  await expect(page).toHaveURL(/\/app\/recipe\/[0-9a-f-]{36}$/);
  const recipeUrl = page.url();
  await expect(page.locator("#main h1")).toHaveText(`${HUB_TITLE_PREFIX} Pancakes`);
  expect(await creditState()).toEqual(before);

  // It is in the Library now.
  await page.goto("/app");
  await expect(page.getByRole("link", { name: `${HUB_TITLE_PREFIX} Pancakes` })).toBeVisible();

  // And the Hub recipe now opens the saved copy.
  await page.goto(hubUrl);
  await expect(page.getByRole("button", { name: "Add to Library" })).toHaveCount(0);
  await page.getByRole("link", { name: "Open in Library" }).click();
  await expect(page).toHaveURL(recipeUrl);

  // Back to Hub keeps the search.
  await page.goto(hubUrl);
  await page.getByRole("link", { name: "Back to Hub" }).click();
  await expect(searchBox(page)).toHaveValue(HUB_TITLE_PREFIX);
});

test("the public page's link, /hub/<id> or /hub/<slug>, opens the Hub recipe", async ({ page }) => {
  const [ramen] = await resetHub(FIVE);
  await signIn(page);
  await page.goto(`/app/hub/${ramen.id}`);
  await expect(page.locator("#main h1")).toHaveText(ramen.title);
  await page.goto(`/app/hub/${ramen.public_slug}`);
  await expect(page.locator("#main h1")).toHaveText(ramen.title);
  await expect(page.getByRole("button", { name: "Add to Library" })).toBeVisible();
});

test("a Hub recipe that is gone says so, with a way back", async ({ page }) => {
  await resetHub([]);
  await signIn(page);
  await page.goto("/app/hub/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "This Hub recipe is no longer available." })).toBeVisible();
  await page.getByRole("link", { name: "Back to Hub" }).click();
  await expect(page).toHaveURL(/\/app\/hub$/);
});

test("more recipes load as you scroll", async ({ page }) => {
  const many: SeedCard[] = Array.from({ length: 45 }, (_, index) => ({ name: `Bulk ${String(index + 1).padStart(2, "0")}`, save_count: 100 - index }));
  await openHub(page, many, `?q=${encodeURIComponent(`${HUB_TITLE_PREFIX} Bulk`)}`);
  await expect(page.getByText("45 recipes", { exact: true })).toBeVisible();
  await expect(cardTitles(page)).toHaveCount(40);
  await cardTitles(page).last().scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 4000);
  await expect(cardTitles(page)).toHaveCount(45);
  await expect(cardTitles(page).last()).toHaveText(`${HUB_TITLE_PREFIX} Bulk 45`);
});

test("when the Hub can't load, it says so and tries again", async ({ page }) => {
  await resetHub(FIVE);
  await signIn(page);
  await page.route("**/rest/v1/rpc/hub_cards*", (route) => route.abort());
  await page.goto(`/app/hub?q=${encodeURIComponent(HUB_TITLE_PREFIX)}`);
  await expect(page.getByRole("heading", { name: "Couldn’t load the Hub" })).toBeVisible();

  await page.unroute("**/rest/v1/rpc/hub_cards*");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(cardTitles(page)).toHaveCount(5);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("fits the screen in English and Hebrew, and opens a recipe", async ({ page }) => {
    await openHub(page);
    await expect(cardTitles(page)).toHaveCount(5);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await writeAccountPrefs({ locale: "he" });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("searchbox", { name: "חיפוש ב־Hub" })).toHaveValue(HUB_TITLE_PREFIX);
    await expect(cardTitles(page)).toHaveCount(5);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole("link", { name: `${HUB_TITLE_PREFIX} Ramen` }).click();
    await expect(page.getByRole("button", { name: "הוספה למתכונים שלי"})).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await writeAccountPrefs({ locale: "en" });
  });
});
