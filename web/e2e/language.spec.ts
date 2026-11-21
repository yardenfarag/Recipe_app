import { expect, test } from "@playwright/test";

import { createUser, uniqueEmail } from "./admin";
import { accountMenuButton } from "./helpers";

test.use({ locale: "en-US" });

test("the app speaks the account's saved language, right to left for Hebrew", async ({ page }) => {
  const email = uniqueEmail("e2e-hebrew");
  await createUser(email, "shalom-pass-1", "he");

  // Signed out, an English browser gets English.
  await page.goto("/app/auth?mode=signin");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("shalom-pass-1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // Signed in, the account's Hebrew wins over the browser.
  await expect(page.locator("#main")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: "המתכונים שלכם" })).toBeVisible();
  await expect(page.getByRole("link", { name: "מתכונים" }).filter({ visible: true }).first()).toBeVisible();
  await accountMenuButton(page).click();
  await expect(page.getByRole("menuitem", { name: "התנתקות" })).toBeVisible();
});

test.describe("an account without a saved language", () => {
  test.use({ locale: "es-ES" });

  test("gets the browser's language, and keeps it for its emails", async ({ page }) => {
    const email = uniqueEmail("e2e-spanish");
    await page.goto("/app/auth");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    await page.getByLabel(/Correo|Email/).fill(email);
    await page.getByLabel(/Contraseña|Password/).fill("hola-pass-123");
    await page.locator("form button[type=submit]").click();
    await expect(page.locator("#main")).toBeVisible();

    // Signing up saved the language on the account, so a reload in an English browser stays Spanish.
    const context = await page.context().browser()!.newContext({ locale: "en-US", baseURL: test.info().project.use.baseURL });
    const english = await context.newPage();
    await english.goto("/app/auth?mode=signin");
    await english.getByLabel("Email").fill(email);
    await english.getByLabel("Password").fill("hola-pass-123");
    await english.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(english.locator("#main")).toBeVisible();
    await expect(english.locator("html")).toHaveAttribute("lang", "es");
    await context.close();
  });
});
