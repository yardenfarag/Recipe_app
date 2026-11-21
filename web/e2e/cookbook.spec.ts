import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { localSupabase } from "./env.mjs";
import { signInWithPassword } from "./helpers";
import { TEST_USER } from "./testUser";

/**
 * PDF cookbook (PIN-142). The browser's print dialog cannot be driven, so `print()` on the book's hidden frame is
 * replaced with a counter, and the tests read the book the dialog would have printed straight from that frame.
 * Photos come from a fake image host, so nothing leaves the machine.
 */

const PHOTOS = "https://photos.e2e.test";
// A 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const THREE: SeedRecipe[] = [
  { title: "Lemon Pasta", image_url: `${PHOTOS}/pasta.png`, servings: 2, createdSecondsAgo: 1 },
  { title: "Chocolate Cake", image_url: `${PHOTOS}/missing.png`, servings: 8, createdSecondsAgo: 2 },
  { title: "Green Salad", createdSecondsAgo: 3 },
];

test.use({ viewport: { width: 1280, height: 900 }, locale: "en-GB" });

test.afterEach(async () => {
  await resetTestUserLanguage();
});

async function fakePhotosAndFonts(page: Page, delayMs = 0) {
  await page.route(`${PHOTOS}/**`, async (route) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    // A cancelled build drops its requests; answering one of those afterwards is fine to fail.
    const answer = route.request().url().includes("missing")
      ? route.fulfill({ status: 404, body: "" })
      : route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    await answer.catch(() => undefined);
  });
  // The book links Google Fonts; an empty stylesheet keeps the test offline.
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
}

/** Counts print() calls on the book's frame instead of opening the real dialog. */
async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cookbookPrints: number };
    w.__cookbookPrints = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLIFrameElement && node.dataset.cookbookPrint !== undefined && node.contentWindow) {
            node.contentWindow.print = () => {
              w.__cookbookPrints += 1;
            };
          }
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
}

const prints = (page: Page) => page.evaluate(() => (window as unknown as { __cookbookPrints: number }).__cookbookPrints);
const bookHtml = (page: Page) =>
  page.evaluate(() => document.querySelector<HTMLIFrameElement>("iframe[data-cookbook-print]")?.contentDocument?.documentElement.outerHTML ?? "");

async function signIn(page: Page, recipes: SeedRecipe[] = THREE) {
  const ids = await resetLibrary(recipes);
  await fakePhotosAndFonts(page);
  await stubPrint(page);
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
  return ids;
}

const bookList = (page: Page) => page.getByRole("list", { name: "Your book" });
const pick = (page: Page, title: string) => page.getByRole("checkbox", { name: new RegExp(`^${title},`) }).click();

test("picks recipes, orders them, and prints the book, with a placeholder for a photo that will not load", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "PDF cookbook" }).click();
  await expect(page).toHaveURL(/\/app\/cookbook$/);
  await expect(page.locator("#main h1")).toHaveText("PDF cookbook");
  await expect(page).toHaveTitle(/PDF cookbook/);

  await pick(page, "Green Salad");
  await pick(page, "Lemon Pasta");
  await pick(page, "Chocolate Cake");
  await expect(bookList(page).getByRole("listitem")).toHaveCount(3);
  await page.getByRole("button", { name: "Move Lemon Pasta up" }).click();
  await expect(bookList(page).getByRole("listitem").first()).toContainText("Lemon Pasta");

  await page.getByLabel("Cookbook title").fill("Family favourites");
  await page.getByRole("radio", { name: "US Letter" }).click();
  await page.getByRole("button", { name: "Create PDF" }).click();

  const done = page.getByRole("dialog", { name: "Cookbook created" });
  await expect(done).toBeVisible();
  await expect.poll(() => prints(page)).toBe(1);
  await expect(done).toContainText("1 photo couldn’t be loaded");

  const html = await bookHtml(page);
  expect(html).toContain("<title>Family favourites</title>");
  expect(html).toContain("@page { size: letter;");
  expect(html).toContain("3 recipes");
  const order = ["Lemon Pasta", "Green Salad", "Chocolate Cake"].map((title) => html.indexOf(`class="recipe-title">${title}<`));
  expect(order.every((index) => index > 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(html).toContain(`src="${PHOTOS}/pasta.png"`);
  expect(html).not.toContain("missing.png");
  expect(html.match(/data-cookbook-fallback="image"/g)).toHaveLength(2);

  await done.getByRole("button", { name: "Print again" }).click();
  await expect.poll(() => prints(page)).toBe(2);

  // Closing puts the book away; the picks stay for next time.
  await done.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("iframe[data-cookbook-print]")).toHaveCount(0);
  await page.reload();
  await expect(bookList(page).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByLabel("Cookbook title")).toHaveValue("Family favourites");
});

test("a collection's menu in the Library starts a book of that collection, titled after it", async ({ page }) => {
  const ids = await signIn(page);
  await addCollection("Weeknight", [ids[0]!, ids[2]!]);
  await page.reload();

  const group = page.getByRole("group", { name: "Collections" });
  await group.getByRole("button", { name: "Weeknight", exact: true }).click();
  await page.getByRole("button", { name: "Manage Weeknight" }).click();
  await page.getByRole("menuitem", { name: "Make a PDF cookbook" }).click();

  await expect(page).toHaveURL(/\/app\/cookbook$/);
  await expect(page.getByLabel("Cookbook title")).toHaveValue("Weeknight");
  const items = bookList(page).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("Green Salad");
  await expect(items.nth(1)).toContainText("Lemon Pasta");
});

test("choosing by collection on the cookbook page adds all of it at once", async ({ page }) => {
  const ids = await signIn(page);
  await addCollection("Sweet", [ids[1]!]);
  await page.goto("/app/cookbook");
  await page.getByRole("group", { name: "Collections" }).getByRole("button", { name: "Sweet", exact: true }).click();
  await page.getByRole("button", { name: /Select all/ }).click();
  await expect(bookList(page).getByRole("listitem")).toHaveCount(1);
  await expect(bookList(page)).toContainText("Chocolate Cake");
});

test("photos can be left out", async ({ page }) => {
  await signIn(page);
  await page.goto("/app/cookbook");
  await pick(page, "Lemon Pasta");
  await page.getByRole("switch", { name: "Recipe photos" }).click();
  await page.getByRole("button", { name: "Create PDF" }).click();
  await expect(page.getByRole("dialog", { name: "Cookbook created" })).toBeVisible();
  const html = await bookHtml(page);
  expect(html).not.toContain('class="hero"');
  expect(html).not.toContain("data-cookbook-fallback");
});

test("Hebrew: the book reads right to left, and a Hebrew recipe stays right to left in an English book", async ({ page }) => {
  const hebrew: SeedRecipe = {
    title: "שקשוקה",
    source_language: "he",
    ingredients: [{ name: "ביצים", quantity: 4, unit: "" }],
    instructions: [{ step: 1, text: "לטגן את הבצל." }],
  };
  await signIn(page, [hebrew, { title: "Lemon Pasta" }]);
  await page.goto("/app/cookbook");
  await pick(page, "שקשוקה");
  await pick(page, "Lemon Pasta");
  await page.getByRole("button", { name: "Create PDF" }).click();
  await expect(page.getByRole("dialog", { name: "Cookbook created" })).toBeVisible();
  let html = await bookHtml(page);
  expect(html).toMatch(/<html lang="en" dir="ltr">/);
  expect(html).toMatch(/<section class="recipe"[^>]*lang="he" dir="rtl">/);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  // The book being made stays while the language changes.
  await page.goto("/app/settings/language");
  await page.locator("#main").getByRole("radio", { name: "עברית" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.goto("/app/cookbook");
  await expect(page.locator("#main h1")).toHaveText("ספר מתכונים ב־PDF");
  await expect(bookList(page).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "יצירת PDF" }).click();
  await expect(page.getByRole("dialog")).toContainText("הספר מוכן");
  html = await bookHtml(page);
  expect(html).toMatch(/<html lang="he" dir="rtl">/);
  expect(html).toContain("ספר המתכונים שלי");
});

test("a book of 50 recipes with photos shows progress and keeps the page responsive", async ({ page }) => {
  const fifty: SeedRecipe[] = Array.from({ length: 50 }, (_, index) => ({
    title: `Recipe ${String(index + 1).padStart(2, "0")}`,
    image_url: `${PHOTOS}/photo-${index}.png`,
    instructions: Array.from({ length: 8 }, (_, step) => ({ step: step + 1, text: `Step ${step + 1} of recipe ${index + 1}, stir and taste.` })),
    createdSecondsAgo: index,
  }));
  await resetLibrary(fifty);
  await fakePhotosAndFonts(page, 300);
  await stubPrint(page);
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
  await page.goto("/app/cookbook");

  await page.getByRole("button", { name: /Select all/ }).click();
  await expect(bookList(page).getByRole("listitem")).toHaveCount(50);

  // Anything that holds the main thread for long shows up as a long task.
  await page.evaluate(() => {
    const w = window as unknown as { __longest: number };
    w.__longest = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__longest = Math.max(w.__longest, entry.duration);
    }).observe({ type: "longtask", buffered: false });
  });

  await page.getByRole("button", { name: "Create PDF" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  await expect(dialog).toContainText(/Preparing photos… \d+\/50/);
  // The page answers while the photos load.
  expect(await page.evaluate(() => 1 + 1)).toBe(2);

  await expect(page.getByRole("dialog", { name: "Cookbook created" })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => prints(page)).toBe(1);
  const html = await bookHtml(page);
  expect(html.match(/data-cookbook-page="recipe"/g)).toHaveLength(50);
  expect(html.match(/class="hero"/g)).toHaveLength(50);
  const longest = await page.evaluate(() => (window as unknown as { __longest: number }).__longest);
  expect(longest).toBeLessThan(1000);
});

test("cancel stops building, and nothing is printed", async ({ page }) => {
  await resetLibrary(THREE);
  await fakePhotosAndFonts(page, 5_000);
  await stubPrint(page);
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
  await page.goto("/app/cookbook");
  await pick(page, "Lemon Pasta");
  await page.getByRole("button", { name: "Create PDF" }).click();
  await expect(page.getByRole("dialog").getByRole("progressbar")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(await prints(page)).toBe(0);
  await expect(page.locator("iframe[data-cookbook-print]")).toHaveCount(0);
});

test("an empty library says to save recipes first", async ({ page }) => {
  await signIn(page, []);
  await page.goto("/app/cookbook");
  await expect(page.getByText("Save recipes to your library first, then you can make a cookbook.")).toBeVisible();
});

/** Signs in as the test account through the API, for the few writes the app has no screen for here. */
async function asTestUser() {
  const { url, anonKey } = localSupabase();
  const signIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
  });
  if (!signIn.ok) throw new Error(`Could not sign in the test user (${signIn.status}): ${await signIn.text()}`);
  const { access_token: token, user } = await signIn.json();
  return { url, headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, userId: user.id as string };
}

async function addCollection(name: string, recipeIds: string[]) {
  const { url, headers, userId } = await asTestUser();
  const created = await fetch(`${url}/rest/v1/collections?select=id`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, name }),
  });
  if (!created.ok) throw new Error(`Could not add the collection (${created.status}): ${await created.text()}`);
  const [{ id }] = (await created.json()) as { id: string }[];
  const added = await fetch(`${url}/rest/v1/collection_recipes`, {
    method: "POST",
    headers,
    body: JSON.stringify(recipeIds.map((recipe_id) => ({ collection_id: id, recipe_id }))),
  });
  if (!added.ok) throw new Error(`Could not fill the collection (${added.status}): ${await added.text()}`);
}
