import { expect, test, type Page } from "@playwright/test";

import type { CookbookBook } from "@shared/lib/cookbook/buildCookbookHtml";

import { resetLibrary, resetTestUserLanguage, type SeedRecipe } from "./admin";
import { localSupabase } from "./env.mjs";
import { signInWithPassword } from "./helpers";
import { TEST_USER } from "./testUser";

/**
 * PDF cookbook (PIN-142). The PDF is made by the web app's server in Cloudflare's browser, which `next start` doesn't
 * have: tests that download stand in for the server and read the book the page sent it. Without that stand-in the
 * real route answers (it checks the sign-in and the book, then says it has no browser), and the page offers printing.
 *
 * The print dialog cannot be driven, so `print()` on the book's hidden frame is replaced with a counter, and the
 * tests read the book the dialog would have printed straight from that frame. Photos come from a fake image host, so
 * nothing leaves the machine.
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
    // The document, not documentElement: this runs before the page has a root element.
    }).observe(document, { childList: true, subtree: true });
  });
}

/**
 * Stands in for the PDF server: answers with a small PDF, saying which photos (by position in the book) it couldn't
 * load, and keeps each book the page sent.
 */
async function stubPdfServer(page: Page, options: { missing?: number[]; status?: number; delayMs?: number } = {}) {
  const books: CookbookBook[] = [];
  await page.route("**/app/api/cookbook/pdf", async (route) => {
    const request = route.request();
    expect(request.headers().authorization).toMatch(/^Bearer .+/);
    books.push((request.postDataJSON() as { book: CookbookBook }).book);
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    const answer =
      options.status && options.status !== 200
        ? route.fulfill({ status: options.status, contentType: "application/json", body: JSON.stringify({ error: "stub" }) })
        : route.fulfill({
            status: 200,
            contentType: "application/pdf",
            headers: { "X-Cookbook-Missing-Photos": (options.missing ?? []).join(",") },
            body: Buffer.from("%PDF-1.7\n%%EOF\n"),
          });
    // A cancelled download drops its request; answering it afterwards is fine to fail.
    await answer.catch(() => undefined);
  });
  return books;
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

test("picks recipes, orders them, and downloads the PDF, with a placeholder for a photo the server couldn't load", async ({ page }) => {
  await signIn(page);
  const books = await stubPdfServer(page, { missing: [2] });
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
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Create PDF" }).click();

  expect((await download).suggestedFilename()).toBe("Family-favourites.pdf");
  const done = page.getByRole("dialog", { name: "Cookbook created" });
  await expect(done).toContainText(/Family-favourites\.pdf\W* is in your downloads\./);
  await expect(done).toContainText("1 photo couldn’t be loaded");

  // What the server was asked to print: the book as data, in order, in the reader's words.
  expect(books).toHaveLength(1);
  const [book] = books;
  expect(book).toMatchObject({ title: "Family favourites", pageSize: "letter", language: "en", rtl: false, hideImages: false });
  expect(book!.copy.recipeCount).toBe("3 recipes");
  expect(book!.recipes.map((recipe) => recipe.title)).toEqual(["Lemon Pasta", "Green Salad", "Chocolate Cake"]);
  expect(book!.recipes.map((recipe) => recipe.imageDataUri)).toEqual([`${PHOTOS}/pasta.png`, null, `${PHOTOS}/missing.png`]);

  // Printing the same book: no second trip for the photos, and the one the server couldn't load is left out.
  await done.getByRole("button", { name: "Print" }).click();
  await expect.poll(() => prints(page)).toBe(1);
  const html = await bookHtml(page);
  expect(html).toContain("<title>Family favourites</title>");
  expect(html).toContain("@page { size: letter;");
  expect(html).toContain(`src="${PHOTOS}/pasta.png"`);
  expect(html).not.toContain("missing.png");
  expect(html.match(/data-cookbook-fallback="image"/g)).toHaveLength(2);

  const again = page.waitForEvent("download");
  await done.getByRole("button", { name: "Download again" }).click();
  expect((await again).suggestedFilename()).toBe("Family-favourites.pdf");
  expect(books).toHaveLength(1);

  // Done puts the book away; the picks stay for next time.
  await done.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("iframe[data-cookbook-print]")).toHaveCount(0);
  await page.reload();
  await expect(bookList(page).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByLabel("Cookbook title")).toHaveValue("Family favourites");
});

test("when the server can't make the file, the book can still be printed, photos and all", async ({ page }) => {
  // No stand-in: the real route checks the sign-in and the book, then says it has no browser here.
  await signIn(page);
  await page.goto("/app/cookbook");
  await pick(page, "Lemon Pasta");
  await pick(page, "Chocolate Cake");
  const pdfAnswer = page.waitForResponse("**/app/api/cookbook/pdf");
  await page.getByRole("button", { name: "Create PDF" }).click();
  expect((await pdfAnswer).status()).toBe(503);

  const failed = page.getByRole("dialog", { name: "Couldn’t create cookbook" });
  await expect(failed).toContainText("We couldn’t make the PDF file. Try again, or print the book and choose Save as PDF.");
  await failed.getByRole("button", { name: "Print instead" }).click();

  const printed = page.getByRole("dialog", { name: "Cookbook created" });
  await expect(printed).toBeVisible();
  await expect.poll(() => prints(page)).toBe(1);
  await expect(printed).toContainText("1 photo couldn’t be loaded");
  const html = await bookHtml(page);
  expect(html).toContain(`src="${PHOTOS}/pasta.png"`);
  expect(html).not.toContain("missing.png");
  await printed.getByRole("button", { name: "Print again" }).click();
  await expect.poll(() => prints(page)).toBe(2);
});

test("the PDF route makes books only for a signed-in account, and only from a book", async ({ page }) => {
  await signIn(page);
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) => name.startsWith("sb-") && name.endsWith("-auth-token"));
    return key ? (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token : "";
  });
  expect(token).not.toBe("");
  const post = (data: unknown, headers: Record<string, string> = {}) => page.request.post("/app/api/cookbook/pdf", { data, headers });

  expect((await post({ book: {} })).status()).toBe(401);
  expect((await post({ book: {} }, { Authorization: "Bearer not-a-token" })).status()).toBe(401);
  expect((await post({ html: "<h1>Anything</h1>" }, { Authorization: `Bearer ${token}` })).status()).toBe(400);
  expect((await page.request.get("/app/api/cookbook/pdf")).status()).toBe(405);
});

test("says to wait a minute after several books in a row", async ({ page }) => {
  await signIn(page);
  await stubPdfServer(page, { status: 429 });
  await page.goto("/app/cookbook");
  await pick(page, "Lemon Pasta");
  await page.getByRole("button", { name: "Create PDF" }).click();
  const failed = page.getByRole("dialog", { name: "Couldn’t create cookbook" });
  await expect(failed).toContainText("You’ve made several cookbooks in a row. Wait a minute, then try again.");
  await expect(failed.getByRole("button", { name: "Print instead" })).toBeVisible();
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
  const books = await stubPdfServer(page);
  await page.goto("/app/cookbook");
  await pick(page, "Lemon Pasta");
  await page.getByRole("switch", { name: "Recipe photos" }).click();
  await page.getByRole("button", { name: "Create PDF" }).click();
  const done = page.getByRole("dialog", { name: "Cookbook created" });
  await expect(done).toBeVisible();
  expect(books[0]).toMatchObject({ hideImages: true });
  expect(books[0]!.recipes[0]!.imageDataUri).toBeNull();

  await done.getByRole("button", { name: "Print" }).click();
  await expect.poll(() => prints(page)).toBe(1);
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
  const books = await stubPdfServer(page);
  await page.goto("/app/cookbook");
  await pick(page, "שקשוקה");
  await pick(page, "Lemon Pasta");
  await page.getByRole("button", { name: "Create PDF" }).click();
  const done = page.getByRole("dialog", { name: "Cookbook created" });
  await expect(done).toBeVisible();
  expect(books[0]).toMatchObject({ language: "en", rtl: false });
  expect(books[0]!.recipes[0]).toMatchObject({ title: "שקשוקה", lang: "he", dir: "rtl" });
  await done.getByRole("button", { name: "Print" }).click();
  await expect.poll(() => prints(page)).toBe(1);
  const html = await bookHtml(page);
  expect(html).toMatch(/<html lang="en" dir="ltr">/);
  expect(html).toMatch(/<section class="recipe"[^>]*lang="he" dir="rtl">/);
  await done.getByRole("button", { name: "Done" }).click();

  // The book being made stays while the language changes.
  await page.goto("/app/settings/language");
  await page.locator("#main").getByRole("radio", { name: "עברית" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.goto("/app/cookbook");
  await expect(page.locator("#main h1")).toHaveText("ספר מתכונים ב־PDF");
  await expect(page.getByRole("list", { name: "הספר שלכם" }).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "יצירת PDF" }).click();
  await expect(page.getByRole("dialog")).toContainText("הספר מוכן");
  expect(books[1]).toMatchObject({ language: "he", rtl: true, title: "ספר המתכונים שלי" });
  expect(books[1]!.copy.ingredientsHeading).not.toBe("Ingredients");
});

test("printing a book of 50 recipes with photos shows progress and keeps the page responsive", async ({ page }) => {
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

  // No PDF server here, so the page offers printing: the path that loads the photos in this browser.
  await page.getByRole("button", { name: "Create PDF" }).click();
  await page.getByRole("dialog", { name: "Couldn’t create cookbook" }).getByRole("button", { name: "Print instead" }).click();
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

test("cancel stops making the book, and nothing is downloaded", async ({ page }) => {
  await signIn(page);
  await stubPdfServer(page, { delayMs: 3_000 });
  let downloads = 0;
  page.on("download", () => (downloads += 1));
  await page.goto("/app/cookbook");
  await pick(page, "Lemon Pasta");
  await page.getByRole("button", { name: "Create PDF" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  await expect(dialog).toContainText("Making your PDF…");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForTimeout(3_500);
  expect(downloads).toBe(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("an empty library says to save recipes first", async ({ page }) => {
  await signIn(page, []);
  await page.goto("/app/cookbook");
  await expect(page.getByText("Save recipes to your Library first, then you can make a cookbook.")).toBeVisible();
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
