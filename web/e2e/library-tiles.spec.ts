import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { signInWithPassword } from "./helpers";
import { readShoppingList, resetShoppingList } from "./listSeed";
import { TEST_USER } from "./testUser";

/** The top of the Library (PIN-161): tonight's pick, the Snap bar, the list tile and "cooked this week". */

const KITCHEN: SeedRecipe[] = [
  { title: "Lemon Pasta", estimated_time_minutes: 25, effort_level: "Easy", servings: 4, tags: ["pasta", "vegetarian"], createdSecondsAgo: 1 },
  { title: "Miso Soup", estimated_time_minutes: 15, effort_level: "Easy", servings: 2, platform: "tiktok", original_url: "https://www.tiktok.com/@lazy.chef/video/7312345678901234567", createdSecondsAgo: 2 },
  { title: "Beef Ragu", estimated_time_minutes: 195, effort_level: "Medium", createdSecondsAgo: 3 },
  { title: "Banana Bread", estimated_time_minutes: 70, effort_level: "Easy", cookedDaysAgo: 2, createdSecondsAgo: 4 },
  { title: "Old Favourite", estimated_time_minutes: 20, effort_level: "Easy", cookedDaysAgo: 30, createdSecondsAgo: 5 },
];

test.use({ viewport: { width: 1280, height: 900 } });

test.afterEach(async () => {
  await resetTestUserLanguage();
  await resetShoppingList();
});

async function openLibrary(page: Page, recipes: SeedRecipe[] = KITCHEN) {
  await resetLibrary(recipes);
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
}

const pick = (page: Page) => page.getByTestId("tonights-pick");
const cards = (page: Page) => page.locator("#main article");

test("tonight's pick is a new, quick recipe that hasn't been cooked, and stays the same after a reload", async ({ page }) => {
  await openLibrary(page);
  // Only Lemon Pasta and Miso Soup are new, never cooked and fit "Cook tonight".
  const title = await pick(page).getByRole("heading").innerText();
  expect(["Lemon Pasta", "Miso Soup"]).toContain(title);
  await expect(pick(page)).toContainText("Tonight’s pick");
  await expect(pick(page).getByRole("link", { name: "Start cooking" })).toHaveAttribute("href", /\/app\/recipe\/[0-9a-f-]{36}\?cook=1$/);

  await page.reload();
  await expect(pick(page).getByRole("heading")).toHaveText(title);
});

test("show me another moves to the next pick, and that one is remembered", async ({ page }) => {
  await openLibrary(page);
  const first = await pick(page).getByRole("heading").innerText();
  await pick(page).getByRole("button", { name: "Show me another" }).click();
  const second = await pick(page).getByRole("heading").innerText();
  expect(second).not.toBe(first);
  expect(["Lemon Pasta", "Miso Soup"]).toContain(second);

  await page.reload();
  await expect(pick(page).getByRole("heading")).toHaveText(second);
});

test("the pick says where it was saved from, and the photo opens the recipe", async ({ page }) => {
  await openLibrary(page, [KITCHEN[1]]);
  await expect(pick(page)).toContainText("15 min · 2 servings · saved from TikTok @lazy.chef");
  // One recipe: nothing else to offer.
  await expect(pick(page).getByRole("button", { name: "Show me another" })).toHaveCount(0);
  await pick(page).getByRole("link", { name: "Open the recipe" }).click();
  await expect(page).toHaveURL(/\/app\/recipe\/[0-9a-f-]{36}$/);
  await expect(page.locator("#main h1")).toHaveText("Miso Soup");
});

test("cooked this week counts what was cooked in the last seven days", async ({ page }) => {
  await openLibrary(page);
  await expect(page.getByTestId("cooked-this-week")).toContainText("1 cooked this week");
});

test("the one-tap filters narrow the list, and the address keeps them", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "Under 30 min" }).click();
  await expect(cards(page)).toHaveCount(3);
  await expect(page).toHaveURL(/\?quick=under30$/);

  await page.getByRole("button", { name: "From TikTok" }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Miso Soup");

  await page.reload();
  await expect(page.getByRole("button", { name: "From TikTok" })).toHaveAttribute("aria-pressed", "true");
  await expect(cards(page)).toHaveCount(1);

  await page.getByRole("group", { name: "Quick filters" }).getByRole("button", { name: "All", exact: true }).click();
  await expect(cards(page)).toHaveCount(5);
  await page.getByRole("button", { name: "Never cooked" }).click();
  await expect(cards(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Never cooked" }).click();
  await page.getByRole("button", { name: "Veggie" }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Lemon Pasta");
});

test("a card says where its recipe came from", async ({ page }) => {
  await openLibrary(page);
  await expect(cards(page).filter({ hasText: "Miso Soup" })).toContainText("TikTok");
  await expect(cards(page).filter({ hasText: "Lemon Pasta" })).toContainText("Website");
});

test("the list tile shows what is left and ticks items off", async ({ page }) => {
  await resetShoppingList([{ name: "eggs" }, { name: "crushed tomatoes" }, { name: "feta" }, { name: "parsley" }, { name: "olive oil", checked: true }]);
  await openLibrary(page);
  const tile = page.getByTestId("list-tile");
  await expect(tile.getByRole("heading")).toContainText("List · 4 left");
  await expect(tile.getByRole("checkbox")).toHaveCount(3);
  await expect(tile.getByRole("link", { name: "+1 more" })).toHaveAttribute("href", "/app/list");

  await tile.getByRole("checkbox", { name: "eggs" }).check();
  await expect(tile.getByRole("heading")).toContainText("List · 3 left");
  // Still there, struck through, so the rows don't jump.
  await expect(tile.getByRole("checkbox", { name: "eggs" })).toBeChecked();
  await expect.poll(async () => (await readShoppingList()).find((row) => row.name === "eggs")?.checked).toBe(true);
});

test("Ctrl+K puts the cursor in the Snap bar, and the credit balance sits beside it", async ({ page }) => {
  await openLibrary(page);
  await page.locator("#main h1").click();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("searchbox", { name: "Snap a recipe or search yours" })).toBeFocused();
  await expect(page.locator("#main").getByRole("link", { name: /credits available$/ })).toHaveAttribute("href", "/app/settings/credits");
});

test("away from the Library, Ctrl+K opens the Snap bar, and a search lands in the Library", async ({ page }) => {
  await openLibrary(page);
  await page.goto("/app/list");
  await expect(page.locator("#main h1")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Snap or search" });
  await dialog.getByRole("searchbox").fill("pasta");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/app\?q=pasta$/);
  await expect(cards(page)).toHaveCount(1);
  // Searching puts the results right under the bar: the tiles step aside.
  await expect(pick(page)).toHaveCount(0);
});

test("a link in the Snap bar goes to Snap and starts the import", async ({ page }) => {
  await openLibrary(page);
  // The import never answers; what matters is that Snap took the link and began.
  await page.route("**/functions/v1/extract-recipe", () => new Promise(() => {}));
  const bar = page.getByRole("searchbox", { name: "Snap a recipe or search yours" });
  await bar.fill("https://www.tiktok.com/@cook/video/7399999999999999999");
  // A link isn't a search: the list stays whole.
  await expect(cards(page)).toHaveCount(5);
  await bar.press("Enter");
  await expect(page).toHaveURL(/\/app\/add$/);
  await expect(page.getByRole("progressbar")).toBeVisible();
});
