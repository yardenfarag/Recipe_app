import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, type SeedRecipe } from "./admin";
import { signInWithPassword, signOutFromMenu } from "./helpers";
import { readAccountPrefs, resetTestUserPrefs, writeAccountPrefs } from "./prefsSeed";
import { TEST_USER } from "./testUser";

// Theme, language and spoons-or-grams live on the account (PIN-154), so the phone and the web share them. "The phone
// changed it" is played by writing the account's metadata the way the mobile app does.

test.use({ locale: "en-US", colorScheme: "light" });

test.beforeEach(async () => {
  await resetTestUserPrefs();
});

test.afterEach(async () => {
  await resetTestUserPrefs();
});

const PANCAKES: SeedRecipe = {
  title: "Synced Pancakes",
  servings: 2,
  ingredients: [
    { name: "flour", quantity: 1, unit: "cup", metric: { quantity: 120, unit: "g" }, spoons: { quantity: 1, unit: "cup" } },
  ],
};

async function signIn(page: Page) {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1:visible")).toBeVisible();
}

/** Sets this browser's own copies once, before the first page (not again on reloads). */
async function seedBrowser(page: Page, values: Record<string, string>) {
  await page.addInitScript((entries: Record<string, string>) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, values);
}

const html = (page: Page) => page.locator("html");
const main = (page: Page) => page.locator("#main");
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

test("a fresh sign-in starts with the account's theme and language, over this browser's", async ({ page }) => {
  await resetLibrary([]);
  await writeAccountPrefs({ locale: "he", prefs: { scheme: "dark", pack: "dracula", measurement: "metric" } });
  await seedBrowser(page, { "pinch.themePreference": "light", "pinch.themePack": "mist", "pinch:appLanguage": "en" });

  await signIn(page);
  await expect(html(page)).toHaveAttribute("data-scheme", "dark");
  await expect(html(page)).toHaveAttribute("data-pack", "dracula");
  await expect(html(page)).toHaveAttribute("lang", "he");
  await expect(html(page)).toHaveAttribute("dir", "rtl");

  // Copied to this browser, so the next visit paints it straight away. Loading never writes the account.
  expect(await stored(page, "pinch.themePreference")).toBe("dark");
  expect(await stored(page, "pinch.themePack")).toBe("dracula");
  expect(await stored(page, "pinch:appLanguage")).toBe("he");
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-pack", "dracula");
  expect(await readAccountPrefs()).toEqual({ locale: "he", prefs: { scheme: "dark", pack: "dracula", measurement: "metric" } });
});

test("spoons or grams follows the account", async ({ page }) => {
  const [id] = await resetLibrary([PANCAKES]);
  await writeAccountPrefs({ prefs: { measurement: "metric" } });
  await seedBrowser(page, { "pinch:measurementSystem": "original" });
  await signIn(page);
  await page.goto(`/app/recipe/${id}`);
  const ingredients = page.getByRole("region", { name: "Ingredients" });
  await expect(ingredients.getByRole("radio", { name: "Grams" })).toBeChecked();
  await expect(ingredients).toContainText("120 g");
  expect(await stored(page, "pinch:measurementSystem")).toBe("metric");
});

test("changes made here are saved on the account", async ({ page }) => {
  await resetLibrary([]);
  await signIn(page);

  await page.goto("/app/settings/appearance");
  await main(page).getByRole("radio", { name: "Dark" }).click();
  await main(page).getByRole("radio", { name: "Dracula Drift" }).click();
  await expect.poll(async () => (await readAccountPrefs()).prefs).toMatchObject({ scheme: "dark", pack: "dracula" });

  await page.goto("/app/settings/recipe");
  await main(page).getByRole("radio", { name: "Grams" }).click();
  await expect
    .poll(async () => (await readAccountPrefs()).prefs)
    .toMatchObject({ scheme: "dark", pack: "dracula", measurement: "metric" });

  await page.goto("/app/settings/language");
  await main(page).getByRole("radio", { name: "Español" }).click();
  await expect(html(page)).toHaveAttribute("lang", "es");
  await expect.poll(async () => (await readAccountPrefs()).locale).toBe("es");
  // The language is the top-level locale; the rest of prefs is untouched.
  expect((await readAccountPrefs()).prefs).toEqual({ scheme: "dark", pack: "dracula", measurement: "metric" });
});

test("a change made on the phone shows here after a refresh", async ({ page }) => {
  await resetLibrary([]);
  await writeAccountPrefs({ prefs: { scheme: "light", pack: "mist" } });
  await signIn(page);
  await expect(html(page)).toHaveAttribute("data-pack", "mist");

  await writeAccountPrefs({ locale: "es", prefs: { scheme: "dark", pack: "wizard" } });
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-pack", "wizard");
  await expect(html(page)).toHaveAttribute("data-scheme", "dark");
  await expect(html(page)).toHaveAttribute("lang", "es");
});

test("first sync: this browser's choices fill an account that has none, and its language stays", async ({ page }) => {
  await resetLibrary([]);
  await seedBrowser(page, {
    "pinch.themePreference": "dark",
    "pinch.themePack": "sunny",
    "pinch:measurementSystem": "metric",
  });
  await signIn(page);
  await expect(html(page)).toHaveAttribute("data-pack", "sunny");
  await expect
    .poll(async () => (await readAccountPrefs()).prefs)
    .toEqual({ scheme: "dark", pack: "sunny", measurement: "metric" });
  expect((await readAccountPrefs()).locale).toBe("en");
});

test("signing out keeps the account's choices in this browser", async ({ page }) => {
  await resetLibrary([]);
  await writeAccountPrefs({ prefs: { scheme: "dark", pack: "dracula" } });
  await signIn(page);
  await expect(html(page)).toHaveAttribute("data-pack", "dracula");

  await signOutFromMenu(page);
  await page.goto("/app/auth?mode=signin");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(html(page)).toHaveAttribute("data-pack", "dracula");
  await expect(html(page)).toHaveAttribute("data-scheme", "dark");
});
