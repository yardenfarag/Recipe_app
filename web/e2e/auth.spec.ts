import { expect, test } from "@playwright/test";

import { expectSignedIn, signInWithPassword, signOutFromMenu } from "./helpers";
import { TEST_USER } from "./testUser";

test("a signed-out visitor is sent to sign-in, then back to the page they wanted", async ({ page }) => {
  await page.goto("/app/hub?from=e2e");

  await expect(page).toHaveURL(/\/app\/auth\?mode=signin&next=%2Fhub%3Ffrom%3De2e$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "https://pinch-app.io/privacy.html");
  await expect(page.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "https://pinch-app.io/terms.html");

  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);

  await expect(page).toHaveURL(/\/app\/hub\?from=e2e$/);
  await expect(page.getByRole("heading", { level: 1, name: "Cooking Hub" })).toBeVisible();
  await expectSignedIn(page, TEST_USER.email);
});

test("sign-in survives a reload, and sign-out ends it", async ({ page }) => {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expectSignedIn(page, TEST_USER.email);

  await page.reload();
  await expectSignedIn(page, TEST_USER.email);

  await signOutFromMenu(page);
  await expect(page).toHaveURL(/\/app\/auth\?mode=signin$/);

  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/auth\?mode=signin$/);
});

test("a wrong password shows why", async ({ page }) => {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, "not-the-password-1");
  // Next.js adds its own (empty) role="alert" route announcer, so look for ours by its text.
  await expect(page.getByRole("alert").filter({ hasText: "The email or password is incorrect." })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/auth/);
});
