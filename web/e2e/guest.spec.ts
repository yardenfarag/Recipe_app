import { expect, test } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage } from "./admin";
import { signInWithPassword } from "./helpers";
import { resetHub } from "./hubSeed";
import { TEST_USER } from "./testUser";

/**
 * Guests may read a shared or Hub recipe without an account (Yarden, 2026-11-21). Saving asks them to sign in,
 * then brings them back and saves on its own.
 */
test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async () => {
  await resetLibrary([]);
});

test.afterEach(async () => {
  await resetHub([]);
  await resetTestUserLanguage();
});

test("a guest reads a Hub recipe, saves it, signs in, and it lands in their library", async ({ page }) => {
  const [card] = await resetHub([{ name: "Guest Gnocchi" }]);

  await page.goto(`/app/hub/${card.id}`);
  await expect(page.locator("#main h1:visible")).toHaveText(card.title);
  // No app navigation for a guest: only a way in.
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Sign in or create a free account to save it.")).toBeVisible();

  await page.getByRole("button", { name: "Add to Library" }).click();
  await expect(page).toHaveURL(/\/app\/auth\?mode=signin&next=/);
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);

  // Back on the recipe, it saves itself and opens the saved copy.
  await expect(page).toHaveURL(/\/app\/recipe\/[0-9a-f-]{36}$/);
  await expect(page.locator("#main h1:visible")).toHaveText(card.title);
  await page.goto("/app");
  await expect(page.locator("#main article:visible").filter({ hasText: card.title })).toHaveCount(1);
});

test("the guest bar's Sign in comes back to the same recipe, without saving", async ({ page }) => {
  const [card] = await resetHub([{ name: "Guest Soup" }]);
  await page.goto(`/app/hub/${card.id}`);
  await page.getByRole("link", { name: "Sign in" }).click();
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page).toHaveURL(new RegExp(`/app/hub/${card.id}$`));
  await expect(page.getByRole("button", { name: "Add to Library" })).toBeVisible();
  // Signed in now: the full app navigation is there.
  await expect(page.getByRole("navigation", { name: "Main" }).filter({ visible: true })).toHaveCount(1);
});

test("the rest of the app still needs an account", async ({ page }) => {
  await page.goto("/app/hub");
  await expect(page).toHaveURL(/\/app\/auth\?mode=signin&next=%2Fhub$/);
});
