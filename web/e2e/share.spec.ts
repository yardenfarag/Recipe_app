import { expect, test, type Page } from "@playwright/test";

import { resetLibrary } from "./admin";
import { signInWithPassword } from "./helpers";
import { resetShares, stubRecipeShare } from "./shareSeed";
import { TEST_USER } from "./testUser";

/**
 * A recipe someone shared (PIN-145). The public page at pinch-app.io/s/<token> (workers/share-page) sends web
 * visitors to /app/s/<token>: anyone can read it there, and Save keeps a copy, after signing up or in for a guest.
 */
test.use({ viewport: { width: 1280, height: 900 } });

/** The `recipe-share` actions the page called in this test. */
let calls: string[] = [];

test.beforeEach(async ({ page }) => {
  await resetLibrary([]);
  calls = await stubRecipeShare(page);
});

test.afterAll(async () => {
  await resetShares([]);
  await resetLibrary([]);
});

const NOT_FOUND = "This share link is invalid or no longer available.";

async function signIn(page: Page) {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
}

test("a guest reads a shared recipe, saves it, signs in, and it lands in their library", async ({ page }) => {
  const [share] = await resetShares(["E2E Shared Lentil Soup"]);

  await page.goto(`/app/s/${share.token}`);
  await expect(page.locator("#main h1")).toHaveText(share.title);
  await expect(page.getByText("Rinse the lentils.")).toBeVisible();
  // No app navigation for a guest: only a way in.
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByText("Sign in or create a free account to save it.")).toBeVisible();

  // Someone with a shared link probably has no account yet: Save opens sign-up, saying why.
  await page.getByRole("button", { name: "Save to my kitchen" }).click();
  await expect(page).toHaveURL(/\/app\/auth\?mode=signup&next=.*&reason=shared_recipe$/);
  await expect(page.getByText("Create a free account to save this shared recipe to your kitchen.")).toBeVisible();
  await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);

  // Back on the shared recipe, it saves itself and opens the saved copy. The stubbed claim makes several calls
  // to local Supabase from the test runner, so it can take a while.
  await expect(page).toHaveURL(/\/app\/recipe\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.locator("#main h1")).toHaveText(share.title);
  await page.goto("/app");
  await expect(page.locator("#main article").filter({ hasText: share.title })).toHaveCount(1);
});

test("a signed-in cook saves a shared recipe, and opening the link again offers the saved copy", async ({ page }) => {
  const [share] = await resetShares(["E2E Shared Dal"]);
  await signIn(page);

  await page.goto(`/app/s/${share.token}`);
  await expect(page.locator("#main h1")).toHaveText(share.title);
  await expect(page.getByRole("navigation", { name: "Main" }).filter({ visible: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Save to my kitchen" }).click();
  await expect(page).toHaveURL(/\/app\/recipe\/[0-9a-f-]{36}$/);
  const savedUrl = page.url();

  await page.goto(`/app/s/${share.token}`);
  await expect(page.getByRole("button", { name: "Save to my kitchen" })).toHaveCount(0);
  await page.getByRole("link", { name: "Open in library" }).click();
  await expect(page).toHaveURL(savedUrl);
});

test("a recipe already in the library opens the saved copy instead of saving it twice", async ({ page }) => {
  const [share] = await resetShares(["E2E Shared Stew"]);
  const [mine] = await resetLibrary([{ title: "My own stew", original_url: share.original_url }]);
  await signIn(page);

  await page.goto(`/app/s/${share.token}`);
  await expect(page.locator("#main h1")).toHaveText(share.title);
  await expect(page.getByRole("link", { name: "Open in library" })).toHaveAttribute("href", `/app/recipe/${mine}`);
  await expect(page.getByRole("button", { name: "Save to my kitchen" })).toHaveCount(0);
  expect(calls).not.toContain("claim");
});

test("a link that no longer works says so plainly", async ({ page }) => {
  const [revoked] = await resetShares(["E2E Shared Gone"], { revoked: true });

  await page.goto(`/app/s/${revoked.token}`);
  await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to my kitchen" })).toHaveCount(0);

  await page.goto("/app/s/e2e-share-never-existed");
  await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
});

test("in Hebrew the shared recipe reads right to left", async ({ browser }) => {
  const context = await browser.newContext({ locale: "he-IL", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await stubRecipeShare(page);
  const [share] = await resetShares(["E2E Shared Hummus"]);

  await page.goto(`/app/s/${share.token}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("#main h1")).toHaveText(share.title);
  await expect(page.getByRole("button", { name: "שמירה למטבח שלי" })).toBeVisible();
  await context.close();
});
