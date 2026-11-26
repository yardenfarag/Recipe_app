import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage } from "./admin";
import { signInWithPassword } from "./helpers";
import { HUB_TITLE_PREFIX, resetHub } from "./hubSeed";
import { TEST_USER } from "./testUser";

// What the Expo web app did that the new one had to keep before the switch (PIN-146, docs/WEB-APP-PARITY.md).

test.use({ viewport: { width: 1280, height: 900 } });

test.afterEach(async () => {
  await resetTestUserLanguage();
});

async function signIn(page: Page, next = "/") {
  await page.goto(`/app/auth?mode=signin&next=${encodeURIComponent(next)}`);
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1:visible")).toBeVisible();
}

test("old Expo addresses still land somewhere: favorites, and the legal pages", async ({ page, request }) => {
  await resetLibrary([{ title: "Loved Soup", is_favorite: true }, { title: "Plain Rice" }]);
  await signIn(page);
  await page.goto("/app/favorites");
  await expect(page).toHaveURL(/\/app\/?\?favorites=1$/);
  await expect(page.getByRole("link", { name: "Loved Soup" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Plain Rice" })).toHaveCount(0);

  // Not followed: the static pages live on the main site.
  for (const doc of ["privacy", "terms", "delete-account", "delete-data"]) {
    const response = await request.get(`/app/legal/${doc}`, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers()["location"]).toBe(`https://pinch-app.io/${doc}.html`);
  }
});

test("Settings → Your recipes: a backup downloads, and restoring it brings the recipes back", async ({ page }) => {
  await resetLibrary([{ title: "Backed-up Bread", tags: ["baking"] }, { title: "Backed-up Broth" }]);
  await signIn(page, "/settings/recipes");
  await expect(page.getByRole("heading", { level: 1, name: "Your recipes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Make a PDF cookbook" })).toHaveAttribute("href", "/app/cookbook");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my recipes" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.json$/);
  const text = await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8"));
  const backup = JSON.parse(text) as { format: string; recipes: { title: string }[] };
  expect(backup.format).toBe("pinch-recipe-backup");
  expect(backup.recipes.map((recipe) => recipe.title).sort()).toEqual(["Backed-up Bread", "Backed-up Broth"]);

  // An empty library, then the file back in.
  await resetLibrary([]);
  await page.locator('input[type="file"]').setInputFiles({ name: file.suggestedFilename(), mimeType: "application/json", buffer: Buffer.from(text) });
  const dialog = page.getByRole("dialog", { name: "Restore recipes?" });
  await expect(dialog).toContainText("Recipes in this file: 2");
  await dialog.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Added: 2. Already in your Library: 0.")).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("link", { name: "Backed-up Bread" }).first()).toBeVisible();

  // A file that isn't a backup says so, and nothing is asked.
  await page.goto("/app/settings/recipes");
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByRole("alert").filter({ hasText: "This file isn’t a Pinch recipe backup." })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Settings shows the app version, as mobile does", async ({ page }) => {
  await signIn(page, "/settings");
  await expect(page.getByTestId("app-version").filter({ visible: true }).first()).toHaveText(/^v\d+\.\d+\.\d+-next$/);
});

test("Library filters: Clear takes every chosen tag off at once", async ({ page }) => {
  await resetLibrary([
    { title: "Tag Soup", tags: ["soup"] },
    { title: "Tag Pasta", tags: ["pasta"] },
  ]);
  await signIn(page);
  await page.goto("/app?tag=soup,pasta");
  await expect(page.getByRole("link", { name: "Tag Soup" }).first()).toBeVisible();
  // With tags chosen the panel may already be open; a press on Filter would close it.
  const filter = page.getByRole("button", { name: /^Filter/ });
  if ((await filter.getAttribute("aria-expanded")) !== "true") await filter.click();
  await page.getByRole("button", { name: "Clear tags" }).click();
  await expect(page).not.toHaveURL(/tag=/);
  await expect(page.getByRole("button", { name: "Clear tags" })).toHaveCount(0);
});

test("a Hub recipe can be shared: its source link is copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const [card] = await resetHub([{ name: "Shareable Ramen", tags: ["soup"] }]);
  await signIn(page);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.goto(`/app/hub/${card.id}`);
  await expect(page.locator("#main h1:visible")).toHaveText(`${HUB_TITLE_PREFIX} Shareable Ramen`);
  await page.getByRole("button", { name: "Share" }).filter({ visible: true }).first().click();
  await expect(page.getByText("Link copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^https:\/\/e2e-hub\.example\//);
  await resetHub([]);
});
