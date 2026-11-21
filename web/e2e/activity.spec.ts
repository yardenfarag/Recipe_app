import { expect, test, type Page } from "@playwright/test";

import { resetLibrary, resetTestUserLanguage } from "./admin";
import { interactionEvents, productEvents, rowText, testUserId } from "./activitySeed";
import { signInWithPassword } from "./helpers";
import { importedRecipe, stubImports } from "./snapSeed";
import { TEST_USER } from "./testUser";

// The activity log and product events from the new web app (PIN-143, ADR 020). Every row is read back from local
// Supabase: it landed once, it is marked as the new web app ("-next" version), and it carries no typed text, title
// or email. Imports are stubbed (snapSeed.ts); every other Edge Function call fails, so nothing reaches a real one.

test.use({ viewport: { width: 1280, height: 900 }, locale: "en-US" });

test.afterEach(async () => {
  await resetTestUserLanguage();
});

/** Sends what the page has queued now, the way leaving the page does. */
async function flushLog(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
}

async function visitorAndSession(page: Page) {
  return page.evaluate(() => ({
    visitorId: localStorage.getItem("pinch:install-id"),
    sessionId: (JSON.parse(sessionStorage.getItem("pinch.activity.session") ?? "{}") as { id?: string }).id ?? null,
  }));
}

test("a visit is logged as the new web app, joined across sign-in, once per action and with no personal text", async ({ page }) => {
  const since = new Date(Date.now() - 1000).toISOString();
  const userId = await testUserId();
  const secret = "MySecretSearchText";
  const title = "Private Grandma Soup";
  await resetLibrary([{ title }]);

  // The landing page put a visitor id here before; the app keeps using it.
  await page.goto("/app/auth?mode=signin");
  await page.evaluate(() => localStorage.setItem("pinch:install-id", "landing-visitor-0001"));
  await page.reload();
  await expect(page.getByLabel("Email")).toBeVisible();
  // Sent while still a guest, so these rows carry the visitor id.
  await flushLog(page);
  const guest = await visitorAndSession(page);
  expect(guest.visitorId).toBe("landing-visitor-0001");
  expect(guest.sessionId).toBeTruthy();

  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.goto("/app/hub");
  await expect(page.locator("#main h1")).toBeVisible();
  const search = page.getByRole("searchbox").first();
  if (await search.count()) await search.fill(secret);
  await page.getByRole("link", { name: /Library/ }).filter({ visible: true }).first().click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.locator("#main h1")).toHaveText(title);
  await flushLog(page);

  await expect
    .poll(async () => (await interactionEvents({ since, sessionId: guest.sessionId! })).some((row) => row.name === "/recipe/[id]"), {
      timeout: 20_000,
    })
    .toBe(true);
  const rows = await interactionEvents({ since, sessionId: guest.sessionId! });

  // One session: the guest part with the visitor id, the signed-in part with the account (the reload kept it too).
  expect(rows.some((row) => row.user_id === null && row.guest_install_id === "landing-visitor-0001" && row.name === "/auth")).toBe(true);
  expect(rows.some((row) => row.user_id === userId)).toBe(true);
  for (const row of rows) {
    expect(row.platform).toBe("web");
    expect(row.app_version).toMatch(/^\d+\.\d+\.\d+-next$/);
  }

  // Each action once: the login, the library and the recipe page by their patterns, the press by its id.
  expect(rows.filter((row) => row.kind === "auth" && row.name === "auth.login")).toHaveLength(1);
  expect(rows.find((row) => row.name === "auth.login")?.properties).toEqual({ method: "email" });
  expect(rows.filter((row) => row.kind === "screen" && row.name === "/(tabs)/hub")).toHaveLength(1);
  expect(rows.filter((row) => row.kind === "tap" && row.name === "library.recipe.open")).toHaveLength(1);
  expect(rows.some((row) => row.name.includes("[id]") || row.screen === "/recipe/[id]")).toBe(true);

  // Nothing typed, no title, no email, no record id.
  const text = rowText(rows.map(({ name, screen, properties }) => ({ name, screen, properties })));
  expect(text).not.toContain(secret);
  expect(text).not.toContain(title);
  expect(text).not.toContain(TEST_USER.email);
});

test("signing out logs auth.logout under the account before the session ends", async ({ page }) => {
  const since = new Date(Date.now() - 1000).toISOString();
  const userId = await testUserId();
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.locator("#main h1")).toBeVisible();
  await page.goto("/app/settings/account");
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/app\/auth/);
  await expect
    .poll(async () => (await interactionEvents({ since, userId })).filter((row) => row.name === "auth.logout").length, { timeout: 20_000 })
    .toBe(1);
});

test("product events: an import, its save and Share Pinch, each once, with the visitor id and no recipe title", async ({ page, context }) => {
  const since = new Date(Date.now() - 1000).toISOString();
  const userId = await testUserId();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await resetLibrary([]);
  await stubImports(page, {
    "extract-recipe": { body: { status: "full", platform: "web", recipe: importedRecipe("Secret Lemon Pasta", { platform: "web" }) } },
  });
  await page.goto("/app/auth?mode=signin&next=%2Fadd");
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page.getByRole("heading", { level: 1, name: "Snap a recipe" })).toBeVisible();

  await page.getByLabel("Recipe URL").fill("https://example.com/secret-lemon-pasta");
  await page.getByRole("button", { name: "Snap", exact: true }).click();
  await expect(page.locator("#main h1")).toHaveText("Secret Lemon Pasta");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("link", { name: "Secret Lemon Pasta" })).toBeVisible();

  // No share sheet in a desktop browser: the link is copied.
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Share Pinch" }).filter({ visible: true }).first().click();

  await expect.poll(async () => (await productEvents({ since })).filter((row) => row.user_id === userId).length, { timeout: 15_000 }).toBe(3);
  const rows = (await productEvents({ since })).filter((row) => row.user_id === userId);
  // The visitor id is made on first use, so it is read once the events are in.
  const { visitorId } = await visitorAndSession(page);
  expect(visitorId).toBeTruthy();
  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
  expect(byName.recipe_extracted.properties).toMatchObject({ source: "url", mode: "extract" });
  expect(byName.recipe_saved.properties).toMatchObject({ from: "extract" });
  expect(byName.app_shared.properties).toMatchObject({ outcome: "copied", platform: "web" });
  for (const row of rows) {
    expect(row.guest_install_id).toBe(visitorId);
    expect(row.properties.app_version).toMatch(/-next$/);
  }
  const text = rowText(rows);
  expect(text).not.toContain("Secret Lemon Pasta");
  expect(text).not.toContain("secret-lemon-pasta");
  expect(text).not.toContain(TEST_USER.email);
});
