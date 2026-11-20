import { expect, test } from "@playwright/test";

import { createUser, oneTimeCode, uniqueEmail } from "./admin";

test("sign in with an emailed code", async ({ page }) => {
  const email = uniqueEmail("e2e-code");
  await createUser(email, "first-pass-123");

  await page.goto("/app/auth?mode=signin");
  await page.getByRole("button", { name: "Email me a sign-in code instead" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // Typing (or pasting) all six digits signs in straight away.
  await page.getByLabel("6-digit code").fill(await oneTimeCode(email, "magiclink"));

  await expect(page.getByTestId("signed-in-email")).toHaveText(email);
});

test("forgot password: reset with the emailed code, then sign in with the new password", async ({ page }) => {
  const email = uniqueEmail("e2e-reset");
  await createUser(email, "old-pass-123");

  await page.goto("/app/auth?mode=signin");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.getByLabel("6-digit code").fill(await oneTimeCode(email, "recovery"));
  await expect(page).toHaveURL(/\/app\/reset-password$/);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

  await page.getByLabel("New password", { exact: true }).fill("new-pass-456");
  await page.getByLabel("Confirm new password").fill("new-pass-456");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

  // The new password works and the old one doesn't.
  await page.getByRole("button", { name: "Go to Library" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("old-pass-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible();
  await page.getByLabel("Password").fill("new-pass-456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("signed-in-email")).toHaveText(email);
});

test("signing up creates an account and signs in", async ({ page }) => {
  const email = uniqueEmail("e2e-signup");
  await page.goto("/app/auth");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("brand-new-123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByTestId("signed-in-email")).toHaveText(email);
});
