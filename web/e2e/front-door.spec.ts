import { expect, test, type Page } from "@playwright/test";

import { resetLibrary } from "./admin";
import { signInWithPassword } from "./helpers";
import { TEST_USER } from "./testUser";

// The front door, pinch-app.io/app (PIN-174). The session lives in the browser, so a head script decides where a
// visitor goes before anything loads: someone new sees the welcome page at once, someone signed in never sees it.

const WELCOME_HEADING = "Save any recipe in seconds. Cook it tonight.";

test.use({ locale: "en-US", viewport: { width: 1280, height: 900 } });

/**
 * Notes, across page loads, whether a loading spinner was ever in the page and whether the welcome page ever showed.
 * Kept in sessionStorage, which outlives each page of the tab.
 */
async function watchForFlashes(page: Page) {
  await page.addInitScript(() => {
    const note = (key: string) => sessionStorage.setItem(key, "yes");
    // In the document at all: the spinner is in the server's HTML of a page that shows one.
    new MutationObserver(() => {
      if (document.querySelector(".animate-spin")) note("saw-spinner");
    }).observe(document, { childList: true, subtree: true });
    // Visible in a painted frame (frames wait for the stylesheets, which hide a held welcome page).
    const everyFrame = () => {
      const welcome = document.querySelector("[data-welcome]");
      if (welcome && getComputedStyle(welcome).visibility !== "hidden") note("saw-welcome");
      requestAnimationFrame(everyFrame);
    };
    requestAnimationFrame(everyFrame);
  });
}

const sawSpinner = (page: Page) => page.evaluate(() => sessionStorage.getItem("saw-spinner") === "yes");
const sawWelcome = (page: Page) => page.evaluate(() => sessionStorage.getItem("saw-welcome") === "yes");

test("someone new at /app gets the welcome page straight away, with no loading page first", async ({ page }) => {
  await watchForFlashes(page);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/welcome$/);
  await expect(page.getByRole("heading", { level: 1, name: WELCOME_HEADING })).toBeVisible();
  await expect(page.getByRole("link", { name: /Get started free/ })).toBeVisible();

  // It went on before /app had drawn anything: no loading spinner, ever.
  expect(await sawSpinner(page)).toBe(false);
});

test("the welcome page is drawn by the server, so it shows before the app's scripts run", async ({ page }) => {
  // No scripts from the app at all: what shows is what the server sent.
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/welcome$/);
  await expect(page.getByRole("heading", { level: 1, name: WELCOME_HEADING })).toBeVisible();
});

test("a welcome page held for another language still shows if the app's scripts never arrive", async ({ page }) => {
  // Held hidden so a Hebrew reader doesn't see English first; with no scripts to settle it, it shows after 3 s anyway.
  await page.addInitScript(() => localStorage.setItem("pinch:appLanguage", "he"));
  // Scripts only: the stylesheet that holds the page hidden still loads.
  await page.route("**/_next/static/**", (route) => (route.request().resourceType() === "script" ? route.abort() : route.fallback()));
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/welcome$/);
  await expect(page.getByRole("heading", { level: 1, name: WELCOME_HEADING })).toBeVisible({ timeout: 6_000 });
});

test("a browser that has signed in before goes to sign-in, and comes back to the Library's address", async ({ page }) => {
  await resetLibrary([]);
  await page.addInitScript(() => localStorage.setItem("pinch:onboardingComplete", "true"));
  await page.goto("/app?favorites=1");
  await expect(page).toHaveURL(/\/app\/auth\?mode=signin&next=%2F%3Ffavorites%3D1$/);
  await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
  await expect(page).toHaveURL(/\/app\/?\?favorites=1$/);
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await resetLibrary([{ title: "Front Door Soup" }]);
    await page.goto("/app/auth?mode=signin");
    await signInWithPassword(page, TEST_USER.email, TEST_USER.password);
    await expect(page.locator("#main article")).toHaveCount(1);
    // As if this browser had never been in before: signed out, it would get the welcome page.
    await page.evaluate(() => localStorage.removeItem("pinch:onboardingComplete"));
  });

  test("opening /app goes straight to the Library, never through the welcome page", async ({ page }) => {
    await watchForFlashes(page);
    const visited: string[] = [];
    page.on("framenavigated", (frame) => visited.push(frame.url()));

    await page.goto("/app");
    await expect(page.locator("#main h1")).toHaveText("Your recipes");
    await expect(page.locator("#main article")).toHaveCount(1);
    expect(visited.filter((url) => url.includes("/welcome"))).toEqual([]);
    expect(await sawWelcome(page)).toBe(false);
  });

  test("an old link to the welcome page forwards into the app without showing it", async ({ page }) => {
    await watchForFlashes(page);
    await page.goto("/app/welcome?next=%2Flist");
    await expect(page).toHaveURL(/\/app\/list$/);
    expect(await sawWelcome(page)).toBe(false);
  });
});
